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

const labels = {
  Subscriptions: {
    filter: 'subject:(invoice OR receipt OR billing OR subscription) OR from:(figma OR vercel OR github OR stripe OR paypal)',
    color: { backgroundColor: '#f7a7c0', textColor: '#ffffff' },
  },
  News: {
    filter: 'subject:(newsletter OR digest OR weekly) OR from:(substack)',
    color: { backgroundColor: '#b99aff', textColor: '#ffffff' },
  },
  Finance: {
    filter: 'subject:(statement OR transaction OR payment) OR from:(bank)',
    color: { backgroundColor: '#a4c2f4', textColor: '#ffffff' },
  },
  Notifications: {
    filter: 'from:(noreply@ OR no-reply@ OR github.com)',
    color: { backgroundColor: '#fce8b3', textColor: '#000000' },
  },
  Promotions: {
    filter: 'subject:(sale OR offer OR discount OR promo)',
    color: { backgroundColor: '#ffad47', textColor: '#ffffff' },
  },
};

async function createOrGetLabel(name, config) {
  try {
    const res = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
        color: config.color,
      },
    });
    console.log(`✅ Carpeta creada: ${name}`);
    return res.data.id;
  } catch (err) {
    if (err.message?.includes('already exists')) {
      const list = await gmail.users.labels.list({ userId: 'me' });
      const existing = list.data.labels.find(l => l.name === name);
      console.log(`ℹ️  Carpeta ya existe: ${name}`);
      return existing.id;
    }
    throw err;
  }
}

async function findEmails(query) {
  let allMessages = [];
  let pageToken = null;
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 500,
      ...(pageToken && { pageToken }),
    });
    allMessages = allMessages.concat(res.data.messages || []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return allMessages;
}

async function applyLabelInBatches(messageIds, labelId) {
  const batchSize = 50;
  let applied = 0;

  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: batch,
        addLabelIds: [labelId],
      },
    });
    applied += batch.length;
  }
  return applied;
}

async function run() {
  console.log('🚀 Iniciando organización de emails...\n');

  for (const [labelName, config] of Object.entries(labels)) {
    try {
      // Create/get label
      const labelId = await createOrGetLabel(labelName, config);

      // Find emails
      console.log(`\n🔍 Buscando emails para "${labelName}"...`);
      const messages = await findEmails(config.filter);
      console.log(`📬 Total encontrados: ${messages.length}`);

      if (messages.length === 0) {
        console.log(`   (sin cambios)\n`);
        continue;
      }

      // Apply label in batches
      console.log(`🏷️  Aplicando etiqueta...`);
      const applied = await applyLabelInBatches(
        messages.map(m => m.id),
        labelId
      );
      console.log(`   ✅ ${applied} emails organizados`);
    } catch (err) {
      console.error(`❌ Error procesando "${labelName}":`, err.message);
    }
  }

  console.log('\n✅ Listo — emails organizados por categoría');
}

run().catch(console.error);
