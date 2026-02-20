import { anthropic } from '../config/anthropic';
import { supabase } from '../config/supabase';
import { runAgent, listAgents } from './agent-runner';
import type { RouteResult, RunAgentResult, AgentRecord } from '../types/agent';

const LOG = '[Orchestrator]';
const ROUTING_MODEL = 'claude-sonnet-4-5-20250929';

// ─── Agent Routing ───

const ROUTING_SYSTEM_PROMPT = `You are Atlas, the orchestrator for Phoenix Creative Works. Your job is to route incoming messages to the right specialist agent.

## Available Agents

- **atlas** — Project Manager: Coordinates work, creates projects, assigns tasks, tracks deadlines. Route here for project management, status checks, timeline questions, and general coordination.
- **marcus** — Sales: Handles leads, proposals, follow-ups, pipeline. Route here for new business inquiries, pricing questions, proposals, and sales follow-ups.
- **sarah** — Content: Writes blogs, social posts, email campaigns, website copy. Route here for any content creation, copywriting, or content strategy requests.
- **aria** — Design: Creates visual concepts, mood boards, Canva designs, brand materials. Route here for design requests, visual concepts, logo work, and brand collateral.
- **diego** — SEO: Technical audits, keyword tracking, page speed, link analysis. Route here for SEO questions, website performance, and search ranking topics.
- **mia** — Social Media: Content calendars, scheduling, engagement, platform strategy. Route here for social media management, posting schedules, and social engagement.
- **rex** — Reputation: Review monitoring, response drafting, sentiment tracking. Route here for review management, reputation concerns, and review responses.
- **luna** — Competitive Intel: Competitor monitoring, market analysis, opportunity identification. Route here for competitor questions, market research, and strategic intelligence.
- **kai** — Analytics: Performance data, ROI, reports, anomaly detection. Route here for analytics questions, reporting, metrics, and data analysis.
- **nora** — Client Success: Client satisfaction, onboarding, renewals, touchpoints. Route here for client relationship management, onboarding, and satisfaction tracking.

## Rules
1. If the message is clearly for one agent, route to that agent.
2. If the message spans multiple domains, route to the PRIMARY agent and note others in your reasoning.
3. For vague or general messages, route to **atlas** (yourself) to coordinate.
4. For greetings or casual chat, route to **nora** (client success).

## Output Format
Respond with ONLY a JSON object:
{
  "target_agent": "<agent_name>",
  "reasoning": "<brief explanation>",
  "confidence": <0.0-1.0>
}`;

/**
 * Determine which agent should handle a message.
 */
export async function routeMessage(
  message: string,
  companyId: string,
  context?: Record<string, unknown>,
): Promise<RouteResult> {
  const contextStr = context
    ? `\n\nAdditional context: ${JSON.stringify(context)}`
    : '';

  const response = await anthropic.messages.create({
    model: ROUTING_MODEL,
    max_tokens: 256,
    system: ROUTING_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Route this message:\n\n"${message}"${contextStr}`,
      },
    ],
    temperature: 0.3,
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    console.warn(`${LOG} No text response from routing, defaulting to atlas`);
    return { targetAgent: 'atlas', reasoning: 'Routing failed, defaulting to Atlas', confidence: 0.5 };
  }

  try {
    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned) as {
      target_agent: string;
      reasoning: string;
      confidence: number;
    };

    console.log(
      `${LOG} Routed to ${parsed.target_agent} (confidence: ${parsed.confidence}): ${parsed.reasoning}`,
    );

    return {
      targetAgent: parsed.target_agent,
      reasoning: parsed.reasoning,
      confidence: parsed.confidence,
    };
  } catch {
    console.error(`${LOG} Failed to parse routing response:`, textBlock.text.slice(0, 200));
    return { targetAgent: 'atlas', reasoning: 'Failed to parse routing, defaulting to Atlas', confidence: 0.5 };
  }
}

/**
 * Route a message to the appropriate agent and run it.
 * This is the main entry point — give it a message and it figures out who handles it.
 */
export async function handleMessage(
  message: string,
  companyId: string,
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[],
  metadata?: Record<string, unknown>,
): Promise<RunAgentResult & { routing: RouteResult }> {
  // Step 1: Route the message
  const routing = await routeMessage(message, companyId, metadata);

  // Log the routing decision
  const { data: atlasAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('name', 'atlas')
    .single();

  if (atlasAgent) {
    await supabase.from('agent_activity').insert({
      agent_id: atlasAgent.id,
      company_id: companyId,
      action_type: 'message_routed',
      description: `Routed message to ${routing.targetAgent}: "${message.slice(0, 80)}"`,
      metadata: {
        target_agent: routing.targetAgent,
        reasoning: routing.reasoning,
        confidence: routing.confidence,
      },
    });
  }

  // Step 2: Run the target agent
  const result = await runAgent({
    agentName: routing.targetAgent,
    message,
    companyId,
    conversationHistory,
    metadata: {
      ...metadata,
      routed_by: 'atlas',
      routing_confidence: routing.confidence,
    },
  });

  return { ...result, routing };
}

/**
 * Directly run a specific agent (bypasses routing).
 * Used when you already know which agent should handle the message.
 */
export async function runSpecificAgent(
  agentName: string,
  message: string,
  companyId: string,
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[],
  metadata?: Record<string, unknown>,
): Promise<RunAgentResult> {
  return runAgent({
    agentName,
    message,
    companyId,
    conversationHistory,
    metadata,
  });
}

/**
 * Get all available agents with their current status.
 */
export async function getAgentRoster(): Promise<
  (AgentRecord & { memory_count: number; activity_count_24h: number })[]
> {
  const agents = await listAgents();
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const enriched = await Promise.all(
    agents.map(async (agent) => {
      const [memoryResult, activityResult] = await Promise.all([
        supabase
          .from('agent_memory')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', agent.id),
        supabase
          .from('agent_activity')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', agent.id)
          .gte('created_at', oneDayAgo.toISOString()),
      ]);

      return {
        ...agent,
        memory_count: memoryResult.count ?? 0,
        activity_count_24h: activityResult.count ?? 0,
      };
    }),
  );

  return enriched;
}
