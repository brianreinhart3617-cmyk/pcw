import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '../config/anthropic';
import { supabase } from '../config/supabase';
import { getToolDefinitions, executeTool } from './agent-tools';
import type {
  AgentRecord,
  AgentMemoryRecord,
  AgentMessage,
  RunAgentParams,
  RunAgentResult,
  ToolContext,
} from '../types/agent';

type MessageParam = Anthropic.MessageParam;
type ContentBlockParam = Anthropic.ContentBlockParam;

const LOG = '[AgentRunner]';
const MAX_TOOL_ROUNDS = 10;

// ─── Agent Loading ───

async function loadAgent(agentName: string): Promise<AgentRecord | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('name', agentName)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.error(`${LOG} Agent "${agentName}" not found or inactive:`, error?.message);
    return null;
  }

  return {
    ...data,
    tools: Array.isArray(data.tools) ? data.tools : JSON.parse(data.tools as string),
    temperature: data.temperature ?? 0.7,
  } as AgentRecord;
}

// ─── Memory Loading ───

async function loadMemories(
  agentId: string,
  companyId: string,
): Promise<AgentMemoryRecord[]> {
  const { data, error } = await supabase
    .from('agent_memory')
    .select('*')
    .eq('agent_id', agentId)
    .eq('company_id', companyId)
    .gte('confidence', 0.3)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error(`${LOG} Failed to load memories:`, error.message);
    return [];
  }

  // Filter out expired memories
  const now = new Date();
  return (data ?? []).filter((m) => {
    if (!m.expires_at) return true;
    return new Date(m.expires_at) > now;
  });
}

function formatMemoriesForPrompt(memories: AgentMemoryRecord[]): string {
  if (memories.length === 0) return '';

  const grouped: Record<string, string[]> = {};
  for (const m of memories) {
    if (!grouped[m.memory_type]) grouped[m.memory_type] = [];
    grouped[m.memory_type].push(m.content);
  }

  let text = '\n\n## Your Memories About This Client\n';
  for (const [type, items] of Object.entries(grouped)) {
    text += `\n### ${type.charAt(0).toUpperCase() + type.slice(1)}s\n`;
    for (const item of items) {
      text += `- ${item}\n`;
    }
  }

  return text;
}

// ─── System Prompt Building ───

async function buildSystemPrompt(
  agent: AgentRecord,
  companyId: string,
): Promise<string> {
  const memories = await loadMemories(agent.id, companyId);

  // Load company info for context
  const { data: company } = await supabase
    .from('companies')
    .select('name, type')
    .eq('id', companyId)
    .single();

  let prompt = agent.system_prompt;

  if (company) {
    prompt += `\n\n## Current Context\n`;
    prompt += `- Company: ${company.name}\n`;
    prompt += `- Company Type: ${company.type}\n`;
    prompt += `- Company ID: ${companyId}\n`;
    prompt += `- Date: ${new Date().toISOString().split('T')[0]}\n`;
  }

  prompt += formatMemoriesForPrompt(memories);

  if (company?.type === 'bh_center') {
    prompt += `\n\n## HIPAA REMINDER\n`;
    prompt += `This is a behavioral health center. NEVER include PHI (Protected Health Information) in any output. `;
    prompt += `Do not confirm or deny patient status. Keep all responses HIPAA-compliant.\n`;
  }

  return prompt;
}

// ─── Message Building ───

function buildMessages(
  userMessage: string,
  conversationHistory?: AgentMessage[],
): MessageParam[] {
  const messages: MessageParam[] = [];

  if (conversationHistory) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
}

// ─── Activity Logging ───

async function logActivity(
  agentId: string,
  companyId: string,
  actionType: string,
  description: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await supabase
    .from('agent_activity')
    .insert({
      agent_id: agentId,
      company_id: companyId,
      action_type: actionType,
      description,
      metadata,
    })
    .select('id')
    .single();

  if (error) {
    console.error(`${LOG} Failed to log activity:`, error.message);
    return '';
  }

  return data?.id ?? '';
}

// ─── Main Runner ───

/**
 * Run an agent with a message and return its response.
 * Handles multi-turn tool use automatically.
 */
export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const { agentName, message, companyId, conversationHistory, metadata } = params;

  // Load agent definition
  const agent = await loadAgent(agentName);
  if (!agent) {
    throw new Error(`Agent "${agentName}" not found or inactive`);
  }

  // Build system prompt with context and memories
  const systemPrompt = await buildSystemPrompt(agent, companyId);

  // Get tool definitions for this agent
  const toolDefs = getToolDefinitions(agent.tools);
  const claudeTools: Anthropic.Tool[] = toolDefs.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  // Build conversation messages
  const messages = buildMessages(message, conversationHistory);

  // Tool context for execution
  const toolCtx: ToolContext = {
    agentId: agent.id,
    agentName: agent.name,
    companyId,
  };

  // Track which tools were used
  const toolsUsed: string[] = [];

  // Multi-turn tool use loop
  let currentMessages = messages;
  let finalResponse = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const apiParams: Anthropic.MessageCreateParams = {
      model: agent.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: currentMessages,
    };

    // Only include tools if the agent has any
    if (claudeTools.length > 0) {
      apiParams.tools = claudeTools;
    }

    if (agent.temperature !== undefined) {
      apiParams.temperature = agent.temperature;
    }

    const response = await anthropic.messages.create(apiParams);

    // Check if we got tool_use blocks
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );

    // If there are text blocks, accumulate them
    if (textBlocks.length > 0) {
      finalResponse = textBlocks.map((b) => b.text).join('\n');
    }

    // If no tool use, we're done
    if (toolUseBlocks.length === 0) {
      break;
    }

    // Execute each tool call
    const toolResults: ContentBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      console.log(`${LOG} [${agent.display_name}] Calling tool: ${toolUse.name}`);
      toolsUsed.push(toolUse.name);

      const result = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        toolCtx,
      );

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      } as Anthropic.ToolResultBlockParam);
    }

    // Add assistant response and tool results for next round
    currentMessages = [
      ...currentMessages,
      { role: 'assistant' as const, content: response.content },
      { role: 'user' as const, content: toolResults },
    ];

    // If stop reason is 'end_turn', we're done even with tool use
    if (response.stop_reason === 'end_turn' && finalResponse) {
      break;
    }
  }

  // Log the interaction
  const activityId = await logActivity(
    agent.id,
    companyId,
    'chat_response',
    `${agent.display_name} responded to: "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"`,
    {
      tools_used: toolsUsed,
      response_length: finalResponse.length,
      ...(metadata || {}),
    },
  );

  console.log(
    `${LOG} [${agent.display_name}] Response generated (${finalResponse.length} chars, ${toolsUsed.length} tool calls)`,
  );

  return {
    response: finalResponse,
    agentName: agent.name,
    agentDisplayName: agent.display_name,
    toolsUsed,
    activityId,
  };
}

/**
 * Get an agent's record by name.
 */
export async function getAgent(agentName: string): Promise<AgentRecord | null> {
  return loadAgent(agentName);
}

/**
 * List all active agents.
 */
export async function listAgents(): Promise<AgentRecord[]> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error(`${LOG} Failed to list agents:`, error.message);
    return [];
  }

  return (data ?? []).map((a) => ({
    ...a,
    tools: Array.isArray(a.tools) ? a.tools : JSON.parse(a.tools as string),
  })) as AgentRecord[];
}
