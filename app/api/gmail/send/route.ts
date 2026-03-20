import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3333/callback'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

function createEmailRaw(to: string, subject: string, body: string, from?: string): string {
  const emailLines = [
    `From: ${from ?? 'avinroart@gmail.com'}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ];
  const email = emailLines.join('\r\n');
  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, from } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: to, subject, body' },
        { status: 400 }
      );
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const raw = createEmailRaw(to, subject, body, from);

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    return NextResponse.json({
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
    });
  } catch (error: unknown) {
    console.error('Gmail send error:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
