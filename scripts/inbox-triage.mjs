/**
 * Inbox Triage — AI-powered email organization for avinroart@gmail.com
 *
 * Reviews every untriaged email in the inbox, classifies it with
 * Gemini 2.5 Flash Lite, and archives anything that doesn't need
 * Avinro's attention into a category label (folder). Only emails
 * classified as ATTENTION stay in the inbox.
 *
 * Safety model:
 *   - A hidden "_triaged" label marks processed emails so re-runs only
 *     touch new mail and an email is never reclassified.
 *   - If the AI call fails for a batch, those emails are left untouched
 *     in the inbox (fail-safe: never archive without a confident verdict).
 *   - Archived emails keep their UNREAD state and are always findable
 *     under their category label.
 *
 * Usage:
 *   node scripts/inbox-triage.mjs              # triage up to 100 emails
 *   node scripts/inbox-triage.mjs --dry-run    # print verdicts, change nothing
 *   node scripts/inbox-triage.mjs --limit=300  # raise per-run cap
 */

import { google } from 'googleapis';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ---------- Config ----------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
const env = { ...process.env };
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length && !key.trim().startsWith('#')) {
      env[key.trim()] = rest.join('=').trim();
    }
  }
}

const DRY_RUN = process.argv.includes('--dry-run');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 100;
if (!Number.isInteger(LIMIT) || LIMIT < 0) {
  console.error('❌ --limit must be a non-negative integer.');
  process.exit(1);
}
const GEMINI_MODEL = env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const AI_BATCH_SIZE = 20;
const TRIAGED_LABEL = '_triaged';

// Category folders. ATTENTION is not a folder — those emails stay in the inbox.
const FOLDERS = {
  Subscriptions: { color: { backgroundColor: '#f7a7c0', textColor: '#ffffff' } },
  News:          { color: { backgroundColor: '#b99aff', textColor: '#ffffff' } },
  Finance:       { color: { backgroundColor: '#a4c2f4', textColor: '#ffffff' } },
  Notifications: { color: { backgroundColor: '#fce8b3', textColor: '#000000' } },
  Promotions:    { color: { backgroundColor: '#ffad47', textColor: '#ffffff' } },
  'Low-Priority': { color: { backgroundColor: '#cccccc', textColor: '#000000' } },
};

// Job application responses get special handling:
//   JOB_REJECTED → archived under Jobs/Rejected + WhatsApp notification
//   JOB_POSITIVE → stays in inbox, forced UNREAD, labeled Jobs/Positive + WhatsApp notification
const JOB_LABELS = {
  Jobs:            { color: { backgroundColor: '#16a766', textColor: '#ffffff' } },
  'Jobs/Rejected': { color: { backgroundColor: '#cc3a21', textColor: '#ffffff' } },
  'Jobs/Positive': { color: { backgroundColor: '#16a766', textColor: '#ffffff' } },
};

const CATEGORIES = ['ATTENTION', 'JOB_POSITIVE', 'JOB_REJECTED', ...Object.keys(FOLDERS)];

const CLASSIFIER_PROMPT = `You are an email triage agent for Ary Vincench (avinroart@gmail.com),
a Product Design Engineer based in Spain who works as an autónomo (freelancer).

Classify each email into exactly one category:

- JOB_POSITIVE: a response to a job application Ary submitted that moves the
  process FORWARD: interview invitations, requests to schedule a call, take-home
  assignments or tests, requests for portfolio/documents, offers, or any message
  from a recruiter/hiring team showing interest in him as a candidate. Do NOT
  use for job-board alerts, "new jobs for you" digests, or "application
  received" auto-confirmations.
- JOB_REJECTED: a response to a job application that CLOSES the process:
  "unfortunately", "we will not be moving forward", "we went with another
  candidate", "the position has been filled", or similar rejection language
  (in English or Spanish). Only for replies to applications he actually made,
  not job-board noise.
- ATTENTION: stays in the inbox. Use ONLY for emails a human must see soon:
  personal messages from real people, direct work/client communication that
  expects a reply,
  Spanish tax or government notices (Hacienda, Agencia Tributaria, Seguridad
  Social), legal deadlines, security alerts about account compromise, payment
  failures, and anything time-sensitive that would cost money or opportunities
  if missed. When genuinely unsure, choose ATTENTION — false archives are worse
  than false keeps.
- Subscriptions: receipts, invoices, billing confirmations, renewal and trial
  notices from SaaS/tools (Figma, Vercel, GitHub, Adobe, Stripe, PayPal, etc.).
- News: newsletters, digests, blogs, Substack, weekly roundups, product
  changelogs sent as bulk mail.
- Finance: bank statements, transaction alerts, investment updates — routine
  financial mail that needs no action.
- Notifications: automated noreply notifications (CI, GitHub activity, social
  media, app activity, calendar/system notices, delivery tracking).
- Promotions: marketing, sales, discounts, product launches, event invites
  sent to a list, cold outreach/spam-adjacent sales emails.

Return a JSON array with one verdict per email, in the same order, using each
email's "id" field.`;

// ---------- Clients ----------

const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
const gmail = google.gmail({ version: 'v1', auth });

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: GEMINI_MODEL,
  generationConfig: {
    temperature: 0,
    responseMimeType: 'application/json',
    responseSchema: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          category: { type: SchemaType.STRING, enum: CATEGORIES, format: 'enum' },
        },
        required: ['id', 'category'],
      },
    },
  },
});

// ---------- Gmail helpers ----------

async function ensureLabel(name, config = {}) {
  try {
    const res = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: config.hidden ? 'labelHide' : 'labelShow',
        messageListVisibility: config.hidden ? 'hide' : 'show',
        ...(config.color && { color: config.color }),
      },
    });
    console.log(`✅ Etiqueta creada: ${name}`);
    return res.data.id;
  } catch (err) {
    if (err.message?.includes('already exists') || err.code === 409) {
      const list = await gmail.users.labels.list({ userId: 'me' });
      return list.data.labels.find(l => l.name === name).id;
    }
    throw err;
  }
}

async function listUntriagedInbox(limit) {
  if (limit === 0) return [];

  const messages = [];
  let pageToken = null;
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: `in:inbox -label:${TRIAGED_LABEL}`,
      maxResults: Math.min(500, limit - messages.length),
      ...(pageToken && { pageToken }),
    });
    messages.push(...(res.data.messages || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken && messages.length < limit);
  return messages.slice(0, limit);
}

async function fetchMetadata(messages) {
  const result = [];
  const poolSize = 10;
  for (let i = 0; i < messages.length; i += poolSize) {
    const chunk = await Promise.all(
      messages.slice(i, i + poolSize).map(async ({ id }) => {
        const res = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'List-Unsubscribe'],
        });
        const headers = Object.fromEntries(
          (res.data.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value])
        );
        return {
          id,
          from: headers.from || '(unknown)',
          subject: headers.subject || '(no subject)',
          isBulk: Boolean(headers['list-unsubscribe']),
          snippet: (res.data.snippet || '').slice(0, 200),
        };
      })
    );
    result.push(...chunk);
  }
  return result;
}

// ---------- AI classification ----------

async function classifyBatch(emails) {
  const payload = emails.map(e => ({
    id: e.id,
    from: e.from,
    subject: e.subject,
    has_unsubscribe_header: e.isBulk,
    snippet: e.snippet,
  }));

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await model.generateContent([
        CLASSIFIER_PROMPT,
        `Emails to classify:\n${JSON.stringify(payload, null, 2)}`,
      ]);
      const verdicts = JSON.parse(res.response.text());
      const byId = new Map(verdicts.map(v => [v.id, v.category]));
      return emails.map(e => ({
        ...e,
        // Unknown/missing verdicts default to ATTENTION (fail-safe)
        category: CATEGORIES.includes(byId.get(e.id)) ? byId.get(e.id) : 'ATTENTION',
      }));
    } catch (err) {
      console.error(`⚠️  Gemini error (intento ${attempt}/2): ${err.message}`);
      if (attempt === 2) return null;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ---------- Apply ----------

function planFor(category, labelIds, triagedId) {
  if (category === 'ATTENTION') {
    return { add: [triagedId], remove: [], action: '→ se queda en INBOX' };
  }
  if (category === 'JOB_POSITIVE') {
    return {
      add: [labelIds['Jobs/Positive'], triagedId, 'UNREAD'],
      remove: [],
      action: '→ Jobs/Positive (INBOX, no leído) 🎉',
    };
  }
  if (category === 'JOB_REJECTED') {
    return {
      add: [labelIds['Jobs/Rejected'], triagedId],
      remove: ['INBOX'],
      action: '→ archivado en "Jobs/Rejected"',
    };
  }
  return {
    add: [labelIds[category], triagedId],
    remove: ['INBOX'],
    action: `→ archivado en "${category}"`,
  };
}

async function applyVerdicts(classified, labelIds, triagedId) {
  const byCategory = {};
  for (const email of classified) {
    (byCategory[email.category] ??= []).push(email.id);
  }

  for (const [category, ids] of Object.entries(byCategory)) {
    const plan = planFor(category, labelIds, triagedId);
    if (!DRY_RUN) {
      for (let i = 0; i < ids.length; i += 50) {
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids: ids.slice(i, i + 50),
            addLabelIds: plan.add,
            ...(plan.remove.length && { removeLabelIds: plan.remove }),
          },
        });
      }
    }
    console.log(`   ${String(ids.length).padStart(3)} emails ${plan.action}`);
  }
  return byCategory;
}

// ---------- WhatsApp notification (GREEN-API) ----------

async function notifyWhatsApp(jobEmails) {
  if (jobEmails.length === 0) return;
  const { GREENAPI_ID_INSTANCE, GREENAPI_API_TOKEN, WHATSAPP_NUMBER } = env;
  if (!GREENAPI_ID_INSTANCE || !GREENAPI_API_TOKEN || !WHATSAPP_NUMBER) {
    console.log('⚠️  WhatsApp no configurado — notificación de empleos omitida.');
    return;
  }

  const baseUrl = `https://api.green-api.com/waInstance${GREENAPI_ID_INSTANCE}`;
  try {
    const stateRes = await fetch(`${baseUrl}/getStateInstance/${GREENAPI_API_TOKEN}`);
    const state = await stateRes.json();
    if (state.stateInstance !== 'authorized') {
      console.log(`⚠️  WhatsApp no autorizado en GREEN-API (${state.stateInstance || 'estado desconocido'}) — notificación de empleos omitida.`);
      return;
    }
  } catch (err) {
    console.error(`⚠️  No se pudo verificar GREEN-API: ${err.message}`);
    return;
  }

  const positives = jobEmails.filter(e => e.category === 'JOB_POSITIVE');
  const rejections = jobEmails.filter(e => e.category === 'JOB_REJECTED');
  const lines = ['*📋 Respuestas de aplicaciones de trabajo*', ''];
  if (positives.length) {
    lines.push(`✅ *Positivas (${positives.length}) — en tu inbox, sin leer:*`);
    for (const e of positives) lines.push(`  • ${e.from.replace(/<.*>/, '').trim()} — ${e.subject}`);
    lines.push('');
  }
  if (rejections.length) {
    lines.push(`❌ *Rechazos (${rejections.length}) — movidos a Jobs/Rejected:*`);
    for (const e of rejections) lines.push(`  • ${e.from.replace(/<.*>/, '').trim()} — ${e.subject}`);
  }

  const chatNumber = WHATSAPP_NUMBER.replace(/\D/g, '');
  const url = `${baseUrl}/sendMessage/${GREENAPI_API_TOKEN}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: `${chatNumber}@c.us`,
        message: lines.join('\n').trim(),
      }),
    });
    const body = await res.text();
    if (res.ok) {
      console.log(`📱 WhatsApp enviado — HTTP ${res.status} | ${body}`);
    } else {
      console.error(`⚠️  WhatsApp falló — HTTP ${res.status} | ${body}`);
    }
  } catch (err) {
    console.error(`⚠️  WhatsApp falló: ${err.message}`);
  }
}

// ---------- Main ----------

async function run() {
  console.log(`🤖 Inbox Triage — modelo: ${GEMINI_MODEL}${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  const triagedId = DRY_RUN ? 'DRY_RUN_TRIAGED' : await ensureLabel(TRIAGED_LABEL, { hidden: true });
  const labelIds = DRY_RUN
    ? Object.fromEntries(Object.keys({ ...FOLDERS, ...JOB_LABELS }).map(name => [name, `DRY_RUN_${name}`]))
    : {};
  if (!DRY_RUN) {
    for (const [name, config] of Object.entries({ ...FOLDERS, ...JOB_LABELS })) {
      labelIds[name] = await ensureLabel(name, config);
    }
  }

  const messages = await listUntriagedInbox(LIMIT);
  console.log(`📬 Emails sin triar en la bandeja: ${messages.length}\n`);
  if (messages.length === 0) {
    console.log('✅ Nada que hacer.');
    return;
  }

  const emails = await fetchMetadata(messages);
  const totals = {};
  const jobEmails = [];
  let skipped = 0;

  for (let i = 0; i < emails.length; i += AI_BATCH_SIZE) {
    const batch = emails.slice(i, i + AI_BATCH_SIZE);
    console.log(`🔍 Clasificando lote ${Math.floor(i / AI_BATCH_SIZE) + 1} (${batch.length} emails)...`);

    const classified = await classifyBatch(batch);
    if (!classified) {
      skipped += batch.length;
      console.log('   ⚠️  Lote omitido — los emails se quedan en la bandeja sin tocar.');
      continue;
    }

    if (DRY_RUN) {
      for (const e of classified) {
        console.log(`   [${e.category.padEnd(13)}] ${e.from} — ${e.subject}`);
      }
    }
    const byCategory = await applyVerdicts(classified, labelIds, triagedId);
    for (const [cat, ids] of Object.entries(byCategory)) {
      totals[cat] = (totals[cat] || 0) + ids.length;
    }
    jobEmails.push(...classified.filter(e => e.category.startsWith('JOB_')));
  }

  if (!DRY_RUN) await notifyWhatsApp(jobEmails);

  console.log('\n📊 Resumen:');
  for (const cat of CATEGORIES) {
    if (totals[cat]) console.log(`   ${cat.padEnd(14)} ${totals[cat]}`);
  }
  if (skipped) console.log(`   (sin clasificar)  ${skipped}`);
  console.log(`\n✅ Listo${DRY_RUN ? ' — dry run, no se modificó nada' : ''}.`);
}

run().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
