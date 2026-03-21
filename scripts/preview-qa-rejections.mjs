import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) env[key.trim()] = rest.join('=').trim();
}

const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
const gmail = google.gmail({ version: 'v1', auth });

async function getAlreadyRepliedEmails() {
  const replied = new Set();
  let pageToken = null;
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:sent "Hello DoJo AI"',
      maxResults: 500,
      ...(pageToken && { pageToken }),
    });
    for (const msg of res.data.messages || []) {
      const full = await gmail.users.messages.get({
        userId: 'me', id: msg.id, format: 'metadata',
        metadataHeaders: ['To'],
      });
      const to = full.data.payload.headers.find(h => h.name === 'To')?.value || '';
      const emailMatch = to.match(/<([^>]+)>/) || [null, to.trim()];
      const email = emailMatch[1]?.toLowerCase();
      if (email) replied.add(email);
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return replied;
}

async function getAllQAEmails() {
  let all = [];
  let pageToken = null;
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'subject:QA in:inbox is:unread',
      maxResults: 500,
      ...(pageToken && { pageToken }),
    });
    all = all.concat(res.data.messages || []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return all;
}

function extractFirstName(from) {
  const nameMatch = from.match(/^([^<"]+)/);
  if (nameMatch) return nameMatch[1].trim().replace(/"/g, '').split(' ')[0] || 'there';
  return 'there';
}

async function preview() {
  console.log('🔍 Buscando emails sin responder...\n');

  const [allMessages, alreadyReplied] = await Promise.all([
    getAllQAEmails(),
    getAlreadyRepliedEmails(),
  ]);

  console.log(`📬 Total unread QA emails: ${allMessages.length}`);
  console.log(`📤 Ya respondidos: ${alreadyReplied.size}\n`);

  const toSend = [];
  const seenEmails = new Set();

  for (const msg of allMessages) {
    const full = await gmail.users.messages.get({
      userId: 'me', id: msg.id, format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Message-ID'],
    });

    const headers = full.data.payload.headers;
    const getH = (n) => headers.find(h => h.name === n)?.value || '';
    const from = getH('From');
    const subject = getH('Subject');
    const threadId = full.data.threadId;
    const msgId = full.data.id;

    // Solo nuevos threads (no ya respondidos en el hilo)
    if (threadId !== msgId) continue;

    const emailMatch = from.match(/<([^>]+)>/) || [null, from.trim()];
    const toEmail = emailMatch[1]?.trim();
    if (!toEmail || !toEmail.includes('@')) continue;

    const emailLower = toEmail.toLowerCase();
    if (alreadyReplied.has(emailLower) || seenEmails.has(emailLower)) continue;

    seenEmails.add(emailLower);
    toSend.push({
      name: extractFirstName(from),
      email: toEmail,
      subject,
    });
  }

  console.log(`\n📋 PREVIEW — Correos a enviar: ${toSend.length}\n`);
  console.log('─'.repeat(60));
  toSend.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name} <${r.email}>`);
    console.log(`   Asunto: Re: ${r.subject}`);
  });
  console.log('─'.repeat(60));

  console.log(`\n📝 TEMPLATE:\n`);
  console.log(`Hi [Nombre],\n\nThank you for applying for the Part-Time QA Tester role at Hello DoJo AI. We appreciate you taking the time to share your profile with us.\n\nAfter carefully reviewing all applications, we have decided to move forward with a shortlist of candidates whose experience most closely aligns with our immediate needs. This was not an easy decision — we received a very high volume of strong applications.\n\nWe'll keep your profile on file and will reach out if a relevant opportunity opens up in the future.\n\nWe wish you the very best in your search.\n\nBest regards,\nAry Vincench\nHello DoJo AI`);

  // Save list for sending script
  fs.writeFileSync(path.join(__dirname, 'qa-send-list.json'), JSON.stringify(toSend, null, 2));
  console.log(`\n💾 Lista guardada en scripts/qa-send-list.json`);
}

preview().catch(console.error);
