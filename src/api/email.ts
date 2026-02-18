import { Router } from 'express';
import { supabase } from '../config/supabase';
import { pollAllInboxes } from '../services/email-monitor';

const router = Router();

// List recent emails
router.get('/emails', async (_req, res) => {
  const { data, error } = await supabase
    .from('email_log')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(50);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

// Trigger an immediate poll
router.post('/emails/poll', async (_req, res) => {
  try {
    await pollAllInboxes();
    res.json({ status: 'poll_complete' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Get a single email by ID
router.get('/emails/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('email_log')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) {
    res.status(404).json({ error: 'Email not found' });
    return;
  }
  res.json(data);
});

export default router;
