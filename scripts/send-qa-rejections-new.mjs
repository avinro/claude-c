import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) env[key.trim()] = rest.join('=').trim();
}

const CLIENT_ID = env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = env.GOOGLE_REFRESH_TOKEN;

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
auth.setCredentials({ refresh_token: REFRESH_TOKEN });

const gmail = google.gmail({ version: 'v1', auth });

const REJECTION_TEMPLATE = (firstName) => `Hi ${firstName},

Thank you for applying for the Part-Time QA Tester role at Hello DoJo AI. We appreciate you taking the time to share your profile with us.

After carefully reviewing all applications, we have decided to move forward with a shortlist of candidates whose experience most closely aligns with our immediate needs. This was not an easy decision — we received a very high volume of strong applications.

We'll keep your profile on file and will reach out if a relevant opportunity opens up in the future.

We wish you the very best in your search.

Best regards,
Ary Vincench
Hello DoJo AI`;

function extractFirstName(fromHeader) {
  // "John Doe <john@gmail.com>" -> "John"
  const nameMatch = fromHeader.match(/^([^<"]+)/);
  if (nameMatch) {
    const fullName = nameMatch[1].trim().replace(/"/g, '');
    return fullName.split(' ')[0] || 'there';
  }
  return 'there';
}

function buildRawEmail({ to, subject, body, threadId, messageId }) {
  const raw = [
    `From: avinroart@gmail.com`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${messageId}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ].join('\r\n');

  return Buffer.from(raw).toString('base64url');
}

async function getAllQAEmails() {
  let allMessages = [];
  let pageToken = null;

  console.log('📬 Fetching all unread QA emails...');

  do {
    const params = {
      userId: 'me',
      q: 'subject:QA in:inbox is:unread',
      maxResults: 500,
    };
    if (pageToken) params.pageToken = pageToken;

    const res = await gmail.users.messages.list(params);
    const messages = res.data.messages || [];
    allMessages = allMessages.concat(messages);
    pageToken = res.data.nextPageToken;
    console.log(`  Fetched ${allMessages.length} so far...`);
  } while (pageToken);

  console.log(`✅ Total: ${allMessages.length} emails\n`);
  return allMessages;
}

async function getAlreadyRepliedEmails() {
  // Get emails we've already sent rejections to (in SENT)
  const replied = new Set();
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:sent subject:Re: QA',
    maxResults: 500,
  });
  for (const msg of res.data.messages || []) {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['To'],
    });
    const to = full.data.payload.headers.find(h => h.name === 'To')?.value || '';
    const emailMatch = to.match(/<([^>]+)>/) || [null, to];
    const email = emailMatch[1]?.trim().toLowerCase();
    if (email) replied.add(email);
  }
  console.log(`📤 Already replied to ${replied.size} emails\n`);
  return replied;
}

async function processAndSend() {
  const allMessages = await getAllQAEmails();
  const alreadyReplied = await getAlreadyRepliedEmails();

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const sentEmails = new Set(); // track within this run

  for (const msg of allMessages) {
    try {
      // Get full message details
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Message-ID'],
      });

      const headers = full.data.payload.headers;
      const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

      const from = getHeader('From');
      const subject = getHeader('Subject');
      const msgId = getHeader('Message-ID');
      const threadId = full.data.threadId;
      const msgInternalId = full.data.id;

      // Skip if this message is NOT the start of a thread (already replied in thread)
      if (threadId !== msgInternalId) {
        skipped++;
        continue;
      }

      // Extract email address
      const emailMatch = from.match(/<([^>]+)>/) || [null, from];
      const toEmail = emailMatch[1]?.trim();
      if (!toEmail || !toEmail.includes('@')) {
        console.log(`⚠️  Skipping (no email): ${from}`);
        skipped++;
        continue;
      }

      const emailLower = toEmail.toLowerCase();

      // Skip if already replied (previous batch or this run)
      if (alreadyReplied.has(emailLower) || sentEmails.has(emailLower)) {
        console.log(`⏭️  Already replied to ${toEmail} — skipping`);
        skipped++;
        continue;
      }

      sentEmails.add(emailLower);

      const firstName = extractFirstName(from);
      const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
      const body = REJECTION_TEMPLATE(firstName);

      const raw = buildRawEmail({
        to: toEmail,
        subject: replySubject,
        body,
        threadId,
        messageId: msgId,
      });

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          threadId,
        },
      });

      console.log(`✅ Sent to ${firstName} <${toEmail}>`);
      sent++;

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n🎉 Done! Sent: ${sent} | Skipped (already replied): ${skipped} | Errors: ${errors}`);
}

processAndSend().catch(console.error);
