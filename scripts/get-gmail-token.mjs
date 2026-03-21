/**
 * Script para obtener el Gmail refresh token
 * Uso: node scripts/get-gmail-token.mjs
 */

import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { exec } from 'child_process';

// Leer credenciales del .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');

const getEnvVar = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match ? match[1].trim() : null;
};

const CLIENT_ID = getEnvVar('GOOGLE_CLIENT_ID');
const CLIENT_SECRET = getEnvVar('GOOGLE_CLIENT_SECRET');
const REDIRECT_URI = 'http://localhost:3333/callback';

const SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ No se encontraron GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en .env.local');
  process.exit(1);
}

// Generar URL de autorización
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES.join(' '));
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent'); // Fuerza a devolver refresh_token

console.log('\n🔑 Iniciando OAuth flow para Gmail...');
console.log('📋 Abriendo navegador...\n');

// Servidor local para capturar el callback
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3333');

  if (url.pathname !== '/callback') {
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>❌ Error: ${error}</h1><p>Puedes cerrar esta ventana.</p>`);
    server.close();
    console.error(`\n❌ Error de autorización: ${error}`);
    process.exit(1);
  }

  if (!code) {
    res.end('No code received');
    server.close();
    return;
  }

  try {
    // Intercambiar código por tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      throw new Error(tokens.error_description || tokens.error);
    }

    // Mostrar resultado
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body style="font-family: sans-serif; padding: 2rem; background: #1a1a1a; color: #fff;">
          <h1>✅ ¡Tokens obtenidos!</h1>
          <p>Revisa tu terminal para ver los valores a copiar en .env.local</p>
          <p>Puedes cerrar esta ventana.</p>
        </body>
      </html>
    `);

    console.log('\n✅ ¡Tokens obtenidos exitosamente!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Agrega estas líneas a tu .env.local:\n');

    if (tokens.refresh_token) {
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
      console.warn('⚠️  No se recibió refresh_token. Puede que ya hayas autorizado antes.');
      console.warn('   Ve a https://myaccount.google.com/permissions y revoca el acceso de Claude-C, luego ejecuta este script de nuevo.');
    }

    if (tokens.access_token) {
      console.log(`GOOGLE_ACCESS_TOKEN=${tokens.access_token}`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>❌ Error: ${err.message}</h1>`);
    console.error('\n❌ Error al obtener tokens:', err.message);
  }

  server.close();
});

server.listen(3333, () => {
  console.log('🌐 Servidor local en http://localhost:3333');
  console.log('🔗 URL de autorización generada\n');

  // Abrir el navegador automáticamente
  const url = authUrl.toString();
  exec(`open "${url}"`, (err) => {
    if (err) {
      console.log('Abre esta URL en tu navegador:\n');
      console.log(url + '\n');
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('❌ Puerto 3333 en uso. Cierra lo que esté usando ese puerto e intenta de nuevo.');
  } else {
    console.error('❌ Error del servidor:', err.message);
  }
  process.exit(1);
});
