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

const EXCLUDE_EMAILS = [
  'explorewith@tworedtabs.com',
  'comments-noreply@docs.google.com',
];

function makeEmail(to, name, subject) {
  const body = `Hi ${name},

Thank you for applying for the Part-Time QA Tester role at Hello DoJo AI. We appreciate you taking the time to share your profile with us.

After carefully reviewing all applications, we have decided to move forward with a shortlist of candidates whose experience most closely aligns with our immediate needs. This was not an easy decision — we received a very high volume of strong applications.

We'll keep your profile on file and will reach out if a relevant opportunity opens up in the future.

We wish you the very best in your search.

Best regards,
Ary Vincench
Hello DoJo AI`;

  const message = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ].join('\r\n');

  return Buffer.from(message).toString('base64url');
}

async function sendRejections() {
  const listPath = path.join(__dirname, 'qa-send-list.json');
  const candidates = JSON.parse(fs.readFileSync(listPath, 'utf8'))
    .filter(c => !EXCLUDE_EMAILS.includes(c.email.toLowerCase()));

  console.log(`📤 Enviando ${candidates.length} rechazos...\n`);

  let sent = 0, failed = 0;

  for (const c of candidates) {
    try {
      const subjectClean = c.subject.replace(/^Re:\s*/i, '');
      const raw = makeEmail(c.email, c.name, subjectClean);
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
      console.log(`✅ ${c.name} <${c.email}>`);
      sent++;
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.log(`❌ ${c.name} <${c.email}> — ${e.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Enviados: ${sent} | ❌ Fallidos: ${failed}`);
}

sendRejections().catch(console.error);
