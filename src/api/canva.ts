import { Router } from 'express';
import crypto from 'crypto';
import {
  isCanvaConfigured,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  storeTokens,
  getValidAccessToken,
} from '../config/canva';
import { generateDeliverable, regenerateDeliverable } from '../services/deliverable-generator';
import type { DeliverableType } from '../types/canva';

const router = Router();
const LOG = '[CanvaAPI]';

// In-memory CSRF state (acceptable for single-instance server)
const pendingStates = new Map<string, number>();

// ─── OAuth Flow ───

router.get('/canva/auth', (_req, res) => {
  if (!isCanvaConfigured()) {
    res.status(503).json({ error: 'Canva OAuth credentials not configured' });
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now());

  // Clean up stale states (older than 10 minutes)
  const tenMinutes = 10 * 60 * 1000;
  for (const [key, timestamp] of pendingStates) {
    if (Date.now() - timestamp > tenMinutes) {
      pendingStates.delete(key);
    }
  }

  const url = buildAuthorizationUrl(state);
  res.redirect(url);
});

router.get('/canva/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      res.status(400).json({ error: `Canva OAuth error: ${oauthError}` });
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    if (!state || typeof state !== 'string' || !pendingStates.has(state)) {
      res.status(400).json({ error: 'Invalid or expired state parameter' });
      return;
    }

    pendingStates.delete(state);

    const tokenResponse = await exchangeCodeForTokens(code);
    await storeTokens(tokenResponse);

    console.log(`${LOG} Canva OAuth completed successfully`);
    res.json({ status: 'connected', message: 'Canva account connected successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`${LOG} OAuth callback failed:`, message);
    res.status(500).json({ error: message });
  }
});

router.get('/canva/status', async (_req, res) => {
  if (!isCanvaConfigured()) {
    res.json({ status: 'not_configured' });
    return;
  }

  try {
    await getValidAccessToken();
    res.json({ status: 'connected' });
  } catch {
    res.json({ status: 'disconnected' });
  }
});

// ─── Deliverable Generation ───

const VALID_TYPES: DeliverableType[] = ['flyer', 'business_card'];

router.post('/deliverables/generate', async (req, res) => {
  try {
    const { conversationId, type, instructions } = req.body;

    if (!conversationId || typeof conversationId !== 'string') {
      res.status(400).json({ error: 'conversationId is required' });
      return;
    }
    if (!type || !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }

    const result = await generateDeliverable({
      conversationId,
      type,
      instructions: typeof instructions === 'string' ? instructions : undefined,
    });

    res.json({ status: 'created', ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`${LOG} Generate deliverable failed:`, message);
    const status = message.includes('not found') ? 404 : message.includes('not connected') ? 503 : 500;
    res.status(status).json({ error: message });
  }
});

router.post('/deliverables/:id/regenerate', async (req, res) => {
  try {
    const { feedback } = req.body;

    if (!feedback || typeof feedback !== 'string') {
      res.status(400).json({ error: 'feedback is required' });
      return;
    }

    const result = await regenerateDeliverable(req.params.id, feedback);
    res.json({ status: 'regenerated', ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`${LOG} Regenerate deliverable failed:`, message);
    const status = message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

export default router;
