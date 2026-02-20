import { Router } from 'express';
import { supabase } from '../config/supabase';
import { getAgent } from '../agents/agent-runner';
import {
  handleMessage,
  runSpecificAgent,
  getAgentRoster,
} from '../agents/orchestrator';

const router = Router();

// ─── List all agents ───

router.get('/agents', async (_req, res) => {
  try {
    const agents = await getAgentRoster();
    res.json({ agents, count: agents.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── Agent activity feed ───

router.get('/agents/activity', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const agentName = req.query.agent as string | undefined;
    const companyId = req.query.company_id as string | undefined;
    const actionType = req.query.action_type as string | undefined;

    let query = supabase
      .from('agent_activity')
      .select('*, agents(name, display_name, role)')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    if (actionType) {
      query = query.eq('action_type', actionType);
    }
    if (agentName) {
      // Need to filter by agent name through a subquery
      const { data: agentRecord } = await supabase
        .from('agents')
        .select('id')
        .eq('name', agentName)
        .single();

      if (!agentRecord) {
        res.status(404).json({ error: `Agent "${agentName}" not found` });
        return;
      }
      query = query.eq('agent_id', agentRecord.id);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ activity: data ?? [], count: data?.length ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── Get single agent ───

router.get('/agents/:name', async (req, res) => {
  try {
    const agent = await getAgent(req.params.name);
    if (!agent) {
      res.status(404).json({ error: `Agent "${req.params.name}" not found` });
      return;
    }

    // Optionally load memories for a specific company
    const companyId = req.query.company_id as string | undefined;
    let memories: unknown[] = [];
    if (companyId) {
      const { data } = await supabase
        .from('agent_memory')
        .select('*')
        .eq('agent_id', agent.id)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50);
      memories = data ?? [];
    }

    // Recent activity
    const { data: activity } = await supabase
      .from('agent_activity')
      .select('*')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(20);

    res.json({ agent, memories, recent_activity: activity ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── Chat with an agent ───

router.post('/agents/:name/chat', async (req, res) => {
  try {
    const { message, company_id, conversation_history } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required' });
      return;
    }
    if (!company_id || typeof company_id !== 'string') {
      res.status(400).json({ error: 'company_id is required' });
      return;
    }

    const agentName = req.params.name;

    let result;
    if (agentName === 'auto' || agentName === 'atlas') {
      // Let the orchestrator route the message
      result = await handleMessage(message, company_id, conversation_history);
    } else {
      // Send directly to the specified agent
      result = await runSpecificAgent(
        agentName,
        message,
        company_id,
        conversation_history,
      );
    }

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

export default router;
