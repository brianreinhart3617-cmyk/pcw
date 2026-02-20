import type Anthropic from '@anthropic-ai/sdk';

// ─── Database Records ───

export interface AgentRecord {
  id: string;
  name: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  system_prompt: string;
  tools: string[];
  model: string;
  temperature: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type MemoryType =
  | 'preference'
  | 'fact'
  | 'feedback'
  | 'style'
  | 'relationship'
  | 'instruction';

export interface AgentMemoryRecord {
  id: string;
  agent_id: string;
  company_id: string;
  memory_type: MemoryType;
  content: string;
  confidence: number;
  source: string | null;
  source_id: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface AgentActivityRecord {
  id: string;
  agent_id: string;
  company_id: string | null;
  action_type: string;
  description: string;
  metadata: Record<string, unknown>;
  project_id: string | null;
  conversation_id: string | null;
  created_at: string;
}

// ─── Tool System ───

export interface ToolContext {
  agentId: string;
  agentName: string;
  companyId: string;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  input_schema: Anthropic.Tool['input_schema'];
}

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<string>;

// ─── Agent Runner ───

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RunAgentParams {
  agentName: string;
  message: string;
  companyId: string;
  conversationHistory?: AgentMessage[];
  metadata?: Record<string, unknown>;
}

export interface RunAgentResult {
  response: string;
  agentName: string;
  agentDisplayName: string;
  toolsUsed: string[];
  activityId: string;
}

// ─── Orchestrator ───

export interface RouteResult {
  targetAgent: string;
  reasoning: string;
  confidence: number;
}
