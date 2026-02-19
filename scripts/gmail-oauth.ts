/**
 * Gmail OAuth2 Helper — Obtains refresh tokens for Gmail API access.
 *
 * Usage:
 *   npx tsx scripts/gmail-oauth.ts [label]
 *
 * The optional [label] (e.g. "PCW", "BH1", "BH2") is for your reference only.
 *
 * Prerequisites:
 *   - GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET set in .env
 *   - GMAIL_REDIRECT_URI set to http://localhost:3456/callback (or whichever
 *     redirect URI is registered in Google Cloud Console)
 *
 * Flow:
 *   1. Starts a local HTTP server on port 3456
 *   2. Opens the Google OAuth consent screen in your browser
 *   3. After you grant access, captures the authorization code
 *   4. Exchanges it for tokens and prints the refresh token
 *   5. Add the refresh token to your .env as GMAIL_REFRESH_TOKEN_<label>
 */

import dotenv from 'dotenv';
import http from 'http';
import { google } from 'googleapis';

dotenv.config();

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const PORT = 3456;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || `http://localhost:${PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET in .env');
  process.exit(1);
}

const label = process.argv[2] || 'UNKNOWN';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log(`\n--- Gmail OAuth Helper (${label}) ---\n`);
console.log(`Opening browser for authorization...\n`);
console.log(`If the browser doesn't open, visit:\n${authUrl}\n`);

// Try to open the browser
const { exec } = await import('child_process');
const platform = process.platform;
const openCmd =
  platform === 'win32' ? 'start' :
  platform === 'darwin' ? 'open' : 'xdg-open';
exec(`${openCmd} "${authUrl}"`);

// Start a local server to capture the callback
const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/callback')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
    console.error(`\nAuthorization failed: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h1>Missing authorization code</h1>');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <h1>Authorization successful!</h1>
      <p>You can close this tab. Check your terminal for the refresh token.</p>
    `);

    console.log(`\n=== SUCCESS ===\n`);
    console.log(`Refresh Token for ${label}:`);
    console.log(`\n  ${tokens.refresh_token}\n`);
    console.log(`Add this to your .env file:`);
    console.log(`\n  GMAIL_REFRESH_TOKEN_${label}=${tokens.refresh_token}\n`);

    if (tokens.access_token) {
      console.log(`Access Token (for testing, expires soon):`);
      console.log(`  ${tokens.access_token.slice(0, 30)}...\n`);
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>Token exchange failed</h1><p>${err}</p>`);
    console.error('\nToken exchange failed:', err);
  }

  server.close();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}/callback for OAuth callback...\n`);
});
