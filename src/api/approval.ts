import { Router } from 'express';
import {
  submitDraftResponse,
  listPendingItems,
  approveEmail,
  rejectEmail,
  requestChangesEmail,
  approveDeliverable,
  rejectDeliverable,
  requestChangesDeliverable,
} from '../services/approval-queue';

const router = Router();

// ─── Queue listing ───

router.get('/approval/queue', async (_req, res) => {
  try {
    const items = await listPendingItems();
    res.json({ items, count: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── Draft submission ───

router.post('/approval/drafts', async (req, res) => {
  try {
    const { conversationId, subject, body } = req.body;

    if (!conversationId || typeof conversationId !== 'string') {
      res.status(400).json({ error: 'conversationId is required' });
      return;
    }
    if (!subject || typeof subject !== 'string') {
      res.status(400).json({ error: 'subject is required' });
      return;
    }
    if (!body || typeof body !== 'string') {
      res.status(400).json({ error: 'body is required' });
      return;
    }

    await submitDraftResponse(conversationId, subject, body);
    res.json({ status: 'draft_submitted' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : message.includes('Cannot submit') ? 409 : 500;
    res.status(status).json({ error: message });
  }
});

// ─── Email approval actions ───

router.post('/approval/emails/:conversationId/approve', async (req, res) => {
  try {
    const result = await approveEmail(req.params.conversationId);
    res.json({ status: 'approved_and_sent', ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : message.includes('expected') ? 409 : 500;
    res.status(status).json({ error: message });
  }
});

router.post('/approval/emails/:conversationId/reject', async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback || typeof feedback !== 'string') {
      res.status(400).json({ error: 'feedback is required' });
      return;
    }

    const permanent = req.body.permanent === true;
    await rejectEmail(req.params.conversationId, feedback, permanent);
    res.json({ status: 'rejected' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : message.includes('Cannot reject') ? 409 : 500;
    res.status(status).json({ error: message });
  }
});

router.post('/approval/emails/:conversationId/request-changes', async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback || typeof feedback !== 'string') {
      res.status(400).json({ error: 'feedback is required' });
      return;
    }

    await requestChangesEmail(req.params.conversationId, feedback);
    res.json({ status: 'changes_requested' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : message.includes('Cannot request') ? 409 : 500;
    res.status(status).json({ error: message });
  }
});

// ─── Deliverable approval actions ───

router.post('/approval/deliverables/:id/approve', async (req, res) => {
  try {
    await approveDeliverable(req.params.id);
    res.json({ status: 'approved' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/approval/deliverables/:id/reject', async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback || typeof feedback !== 'string') {
      res.status(400).json({ error: 'feedback is required' });
      return;
    }

    await rejectDeliverable(req.params.id, feedback);
    res.json({ status: 'rejected' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/approval/deliverables/:id/request-changes', async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback || typeof feedback !== 'string') {
      res.status(400).json({ error: 'feedback is required' });
      return;
    }

    await requestChangesDeliverable(req.params.id, feedback);
    res.json({ status: 'changes_requested' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
