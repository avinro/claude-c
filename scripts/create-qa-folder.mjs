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

async function run() {
  // 1. Create label
  console.log('📁 Creando carpeta "QA Candidates"...');
  let labelId;
  try {
    const res = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: 'QA Candidates',
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
        color: { backgroundColor: '#16a765', textColor: '#ffffff' },
      },
    });
    labelId = res.data.id;
    console.log(`✅ Carpeta creada: ${res.data.name} (${labelId})`);
  } catch (err) {
    if (err.message?.includes('already exists')) {
      const list = await gmail.users.labels.list({ userId: 'me' });
      const existing = list.data.labels.find(l => l.name === 'QA Candidates');
      labelId = existing.id;
      console.log(`ℹ️  Carpeta ya existe, usando: ${labelId}`);
    } else throw err;
  }

  // 2. Find all QA-related emails
  console.log('\n🔍 Buscando todos los emails de QA...');
  let allMessages = [];
  let pageToken = null;
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'subject:QA',
      maxResults: 500,
      ...(pageToken && { pageToken }),
    });
    allMessages = allMessages.concat(res.data.messages || []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  console.log(`📬 Total emails encontrados: ${allMessages.length}`);

  // 3. Apply label in batches
  console.log('\n🏷️  Aplicando etiqueta...');
  const batchSize = 50;
  let moved = 0;

  for (let i = 0; i < allMessages.length; i += batchSize) {
    const batch = allMessages.slice(i, i + batchSize);
    const ids = batch.map(m => m.id);

    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids,
        addLabelIds: [labelId],
      },
    });

    moved += batch.length;
    process.stdout.write(`\r  ${moved}/${allMessages.length} emails etiquetados...`);
  }

  console.log(`\n\n✅ Listo — ${moved} emails movidos a "QA Candidates"`);
}

run().catch(console.error);
