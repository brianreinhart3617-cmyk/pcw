import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function createOAuth2Client(refreshToken: string) {
  const oauth2 = new google.auth.OAuth2(
    requireEnv('GMAIL_CLIENT_ID'),
    requireEnv('GMAIL_CLIENT_SECRET'),
    requireEnv('GMAIL_REDIRECT_URI'),
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export function buildGmailClient(refreshToken: string): gmail_v1.Gmail {
  const auth = createOAuth2Client(refreshToken);
  return google.gmail({ version: 'v1', auth });
}

const COMPANY_KEY_MAP: Record<string, string> = {
  'Phoenix Creative Works': 'PCW',
  'Behavioral Health Center 1': 'BH1',
  'Behavioral Health Center 2': 'BH2',
};

export function getRefreshTokenForCompany(companyName: string): string | null {
  const key = COMPANY_KEY_MAP[companyName];
  if (!key) return null;
  return process.env[`GMAIL_REFRESH_TOKEN_${key}`] ?? null;
}
