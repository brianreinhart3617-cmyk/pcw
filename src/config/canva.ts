import { supabase } from './supabase';
import type { CanvaOAuthTokenResponse, CanvaTokenRow } from '../types/canva';

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';
const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize';
const CANVA_TOKEN_URL = `${CANVA_API_BASE}/oauth/token`;

const LOG = '[Canva]';

// ─── Lazy Environment Loading ───

interface CanvaEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

let cachedEnv: CanvaEnv | null = null;

function getCanvaEnv(): CanvaEnv {
  if (cachedEnv) return cachedEnv;

  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  const redirectUri = process.env.CANVA_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing Canva OAuth2 credentials. Set CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, and CANVA_REDIRECT_URI.',
    );
  }

  cachedEnv = { clientId, clientSecret, redirectUri };
  return cachedEnv;
}

export function isCanvaConfigured(): boolean {
  return !!(
    process.env.CANVA_CLIENT_ID &&
    process.env.CANVA_CLIENT_SECRET &&
    process.env.CANVA_REDIRECT_URI
  );
}

// ─── OAuth2 Flow ───

export function buildAuthorizationUrl(state: string): string {
  const env = getCanvaEnv();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    state,
    scope: 'design:content:read design:content:write design:meta:read asset:read asset:write',
  });
  return `${CANVA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<CanvaOAuthTokenResponse> {
  const env = getCanvaEnv();

  const res = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canva token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as CanvaOAuthTokenResponse;
}

export async function storeTokens(
  tokenResponse: CanvaOAuthTokenResponse,
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();
  const scopes = tokenResponse.scope.split(' ');

  // Upsert: delete any existing row and insert fresh
  await supabase.from('canva_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const { error } = await supabase.from('canva_tokens').insert({
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: expiresAt,
    scopes,
  });

  if (error) {
    throw new Error(`Failed to store Canva tokens: ${error.message}`);
  }

  console.log(`${LOG} Tokens stored successfully`);
}

// ─── Token Management ───

async function refreshAccessToken(row: CanvaTokenRow): Promise<string> {
  const env = getCanvaEnv();

  const res = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canva token refresh failed (${res.status}): ${text}`);
  }

  const tokenResponse = (await res.json()) as CanvaOAuthTokenResponse;
  await storeTokens(tokenResponse);

  return tokenResponse.access_token;
}

export async function getValidAccessToken(): Promise<string> {
  const { data: row, error } = await supabase
    .from('canva_tokens')
    .select('*')
    .limit(1)
    .single();

  if (error || !row) {
    throw new Error('Canva not connected. Complete OAuth flow at GET /api/canva/auth first.');
  }

  const tokenRow = row as CanvaTokenRow;
  const expiresAt = new Date(tokenRow.expires_at).getTime();
  const fiveMinutes = 5 * 60 * 1000;

  // Refresh if expiring within 5 minutes
  if (Date.now() > expiresAt - fiveMinutes) {
    console.log(`${LOG} Access token expiring soon, refreshing...`);
    return refreshAccessToken(tokenRow);
  }

  return tokenRow.access_token;
}

// ─── Authenticated Fetch Wrapper ───

export async function canvaFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const accessToken = await getValidAccessToken();

  const url = path.startsWith('http') ? path : `${CANVA_API_BASE}${path}`;
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canva API error (${res.status} ${path}): ${text}`);
  }

  return res;
}
