import { Router } from 'express';
import { isMakeConfigured, fireMakeWebhook } from '../services/make';

const router = Router();

router.get('/make/status', (_req, res) => {
  const configured = isMakeConfigured();
  const raw = process.env.MAKE_WEBHOOK_URL;
  const webhookUrl = configured && raw
    ? raw.slice(0, 20) + '***'
    : null;

  res.json({ configured, webhookUrl });
});

router.post('/make/test', async (_req, res) => {
  if (!isMakeConfigured()) {
    res.status(503).json({ error: 'MAKE_WEBHOOK_URL not configured' });
    return;
  }

  try {
    await fireMakeWebhook({
      event_type: 'system.test',
      data: { message: 'PCW Agent System webhook test' },
    });
    res.json({ status: 'sent' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
