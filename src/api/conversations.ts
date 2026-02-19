import { Router } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// List conversations (filterable by status, company)
router.get('/conversations', async (req, res) => {
  try {
    let query = supabase
      .from('conversations')
      .select('*, companies(name)')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (typeof req.query.status === 'string') {
      query = query.eq('status', req.query.status);
    }
    if (typeof req.query.company_id === 'string') {
      query = query.eq('company_id', req.query.company_id);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Get single conversation with related emails and deliverables
router.get('/conversations/:id', async (req, res) => {
  try {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, companies(name, type, gmail_address)')
      .eq('id', req.params.id)
      .single();

    if (convError || !conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const { data: emails } = await supabase
      .from('email_log')
      .select('*')
      .eq('conversation_id', req.params.id)
      .order('sent_at', { ascending: true });

    const { data: deliverables } = await supabase
      .from('deliverables')
      .select('*')
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: false });

    res.json({
      ...conversation,
      emails: emails ?? [],
      deliverables: deliverables ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
