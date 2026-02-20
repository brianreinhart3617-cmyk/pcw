import { supabase } from '../config/supabase';
import type { AgentToolDefinition, ToolHandler, ToolContext } from '../types/agent';

const LOG = '[AgentTools]';

// ─── Tool Definitions (sent to Claude API) ───

const definitions: Map<string, AgentToolDefinition> = new Map();
const handlers: Map<string, ToolHandler> = new Map();

function register(def: AgentToolDefinition, handler: ToolHandler): void {
  definitions.set(def.name, def);
  handlers.set(def.name, handler);
}

// ─── Shared Tools ───

register(
  {
    name: 'get_brand_kit',
    description:
      'Retrieve the brand kit for the current company, including colors, fonts, logo URL, and brand voice guidelines.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data, error } = await supabase
      .from('brand_kits')
      .select('*')
      .eq('company_id', ctx.companyId)
      .limit(1)
      .maybeSingle();

    if (error) return JSON.stringify({ error: error.message });
    if (!data) return JSON.stringify({ error: 'No brand kit found for this company' });
    return JSON.stringify(data);
  },
);

register(
  {
    name: 'get_company_info',
    description: 'Get basic information about the current company.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', ctx.companyId)
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify(data);
  },
);

register(
  {
    name: 'notify_brian',
    description:
      'Send an urgent notification to Brian (the human owner). Use for escalations, important decisions, or things that need human approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Short notification title' },
        body: { type: 'string', description: 'Detailed message for Brian' },
        urgency: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'How urgent this notification is',
        },
      },
      required: ['title', 'body'],
    },
  },
  async (input, ctx) => {
    const { error } = await supabase.from('notifications').insert({
      recipient_type: 'brian',
      company_id: ctx.companyId,
      channel: 'slack',
      title: input.title as string,
      body: input.body as string,
      metadata: { agent: ctx.agentName, urgency: input.urgency || 'medium' },
    });

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'notification_sent', to: 'brian' });
  },
);

register(
  {
    name: 'notify_client',
    description:
      'Send a notification to the client through their portal. The client will see this in their notification feed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Notification title' },
        body: { type: 'string', description: 'Message for the client' },
      },
      required: ['title', 'body'],
    },
  },
  async (input, ctx) => {
    const { error } = await supabase.from('notifications').insert({
      recipient_type: 'client',
      company_id: ctx.companyId,
      channel: 'portal',
      title: input.title as string,
      body: input.body as string,
      metadata: { agent: ctx.agentName },
    });

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'notification_sent', to: 'client' });
  },
);

register(
  {
    name: 'save_memory',
    description:
      'Save an important fact, preference, or instruction about this client to your long-term memory. Use this when you learn something worth remembering for future interactions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        memory_type: {
          type: 'string',
          enum: ['preference', 'fact', 'feedback', 'style', 'relationship', 'instruction'],
          description: 'Category of memory',
        },
        content: {
          type: 'string',
          description: 'What to remember (be specific and concise)',
        },
      },
      required: ['memory_type', 'content'],
    },
  },
  async (input, ctx) => {
    const { error } = await supabase.from('agent_memory').insert({
      agent_id: ctx.agentId,
      company_id: ctx.companyId,
      memory_type: input.memory_type as string,
      content: input.content as string,
      source: 'conversation',
    });

    if (error) {
      // Likely a duplicate — that's fine
      if (error.code === '23505') return JSON.stringify({ status: 'already_remembered' });
      return JSON.stringify({ error: error.message });
    }
    return JSON.stringify({ status: 'memory_saved' });
  },
);

register(
  {
    name: 'search_past_projects',
    description:
      'Search for past or current projects for this company. Returns project names, types, statuses, and summaries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'active', 'in_progress', 'review', 'revision', 'completed', 'cancelled', 'on_hold'],
          description: 'Filter by project status (optional)',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 10)',
        },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    let query = supabase
      .from('projects')
      .select('id, name, type, status, priority, created_at, completed_at, assigned_agents')
      .eq('company_id', ctx.companyId)
      .order('created_at', { ascending: false })
      .limit((input.limit as number) || 10);

    if (input.status) {
      query = query.eq('status', input.status as string);
    }

    const { data, error } = await query;
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ projects: data ?? [], count: data?.length ?? 0 });
  },
);

// ─── Atlas Tools ───

register(
  {
    name: 'create_project',
    description:
      'Create a new project for this company. Specify the project name, type, and any initial requirements.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Project name' },
        type: {
          type: 'string',
          enum: [
            'website', 'branding', 'logo', 'flyer', 'business_card',
            'brochure', 'social_campaign', 'seo', 'content', 'ad_campaign',
            'email_campaign', 'reputation', 'other',
          ],
          description: 'Type of project',
        },
        requirements: {
          type: 'string',
          description: 'Description of project requirements',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Project priority',
        },
        assigned_agents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Agent names to assign (e.g. ["sarah", "aria"])',
        },
      },
      required: ['name', 'type'],
    },
  },
  async (input, ctx) => {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        company_id: ctx.companyId,
        name: input.name as string,
        type: input.type as string,
        requirements: input.requirements
          ? { description: input.requirements }
          : null,
        priority: (input.priority as string) || 'medium',
        assigned_agents: (input.assigned_agents as string[]) || [],
        source: 'portal',
      })
      .select('id, name, type, status')
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'project_created', project: data });
  },
);

register(
  {
    name: 'assign_task',
    description:
      'Create and assign a task within a project to a specific agent.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
        agent_name: { type: 'string', description: 'Agent to assign (e.g. "sarah")' },
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'What needs to be done' },
      },
      required: ['project_id', 'title', 'agent_name'],
    },
  },
  async (input, ctx) => {
    // Look up agent ID from name
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('name', input.agent_name as string)
      .single();

    if (!agent) return JSON.stringify({ error: `Agent "${input.agent_name}" not found` });

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        project_id: input.project_id as string,
        agent_id: agent.id,
        title: input.title as string,
        description: (input.description as string) || null,
      })
      .select('id, title, status')
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'task_assigned', task: data });
  },
);

register(
  {
    name: 'update_task',
    description: 'Update the status or result of a task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'Task UUID' },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'waiting_review', 'completed', 'blocked', 'cancelled'],
          description: 'New task status',
        },
        result: { type: 'string', description: 'Description of what was produced' },
      },
      required: ['task_id'],
    },
  },
  async (input) => {
    const updates: Record<string, unknown> = {};
    if (input.status) updates.status = input.status;
    if (input.result) updates.result = { summary: input.result };
    if (input.status === 'in_progress') updates.started_at = new Date().toISOString();
    if (input.status === 'completed') updates.completed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', input.task_id as string)
      .select('id, title, status')
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'task_updated', task: data });
  },
);

register(
  {
    name: 'get_project_status',
    description: 'Get the current status and all tasks for a project.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
      },
      required: ['project_id'],
    },
  },
  async (input) => {
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', input.project_id as string)
      .single();

    if (projError) return JSON.stringify({ error: projError.message });

    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select('id, title, status, agent_id, created_at, completed_at')
      .eq('project_id', input.project_id as string)
      .order('created_at', { ascending: true });

    if (taskError) return JSON.stringify({ error: taskError.message });

    return JSON.stringify({ project, tasks: tasks ?? [] });
  },
);

register(
  {
    name: 'route_to_agent',
    description:
      'Route a message or task to another agent. Use when the request is better handled by a specialist.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agent_name: {
          type: 'string',
          description: 'Name of the agent to route to (e.g. "sarah", "aria", "marcus")',
        },
        message: {
          type: 'string',
          description: 'Instructions or context to pass to the agent',
        },
        reason: {
          type: 'string',
          description: 'Why this agent is the right one for this',
        },
      },
      required: ['agent_name', 'message'],
    },
  },
  async (input, ctx) => {
    // Log the routing decision as activity
    await supabase.from('agent_activity').insert({
      agent_id: ctx.agentId,
      company_id: ctx.companyId,
      action_type: 'route_to_agent',
      description: `Routed to ${input.agent_name}: ${input.reason || input.message}`,
      metadata: {
        target_agent: input.agent_name,
        message: input.message,
        reason: input.reason,
      },
    });

    return JSON.stringify({
      status: 'routed',
      target_agent: input.agent_name,
      note: 'The message has been queued for the target agent. They will handle it.',
    });
  },
);

register(
  {
    name: 'check_deadlines',
    description:
      'Check for upcoming deadlines across all projects for this company.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days_ahead: {
          type: 'number',
          description: 'How many days ahead to look (default 7)',
        },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    const days = (input.days_ahead as number) || 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, type, status, deadline')
      .eq('company_id', ctx.companyId)
      .not('deadline', 'is', null)
      .lte('deadline', cutoff.toISOString())
      .in('status', ['active', 'in_progress', 'review', 'revision'])
      .order('deadline', { ascending: true });

    if (error) return JSON.stringify({ error: error.message });

    const { data: tasks, error: taskErr } = await supabase
      .from('tasks')
      .select('id, title, status, deadline, project_id')
      .not('deadline', 'is', null)
      .lte('deadline', cutoff.toISOString())
      .in('status', ['pending', 'in_progress', 'blocked'])
      .order('deadline', { ascending: true });

    if (taskErr) return JSON.stringify({ error: taskErr.message });

    return JSON.stringify({
      upcoming_project_deadlines: projects ?? [],
      upcoming_task_deadlines: tasks ?? [],
      days_checked: days,
    });
  },
);

// ─── Marcus (Sales) Tools ───

register(
  {
    name: 'send_email',
    description:
      'Draft an email to be sent. The email goes into the approval queue for Brian to review before sending.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body text' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  async (input, ctx) => {
    // Store as a notification for Brian to approve, not send directly
    const { error } = await supabase.from('notifications').insert({
      recipient_type: 'brian',
      company_id: ctx.companyId,
      channel: 'email',
      title: `Email draft: ${input.subject}`,
      body: `To: ${input.to}\nSubject: ${input.subject}\n\n${input.body}`,
      metadata: {
        agent: ctx.agentName,
        action: 'email_draft',
        to: input.to,
        subject: input.subject,
        email_body: input.body,
      },
    });

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({
      status: 'draft_queued',
      note: 'Email has been queued for Brian\'s approval before sending.',
    });
  },
);

register(
  {
    name: 'get_lead_history',
    description: 'Get the full history and details of a lead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        email: { type: 'string', description: 'Lead\'s email address' },
        lead_id: { type: 'string', description: 'Lead UUID (if known)' },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    let query = supabase.from('leads').select('*').eq('company_id', ctx.companyId);

    if (input.lead_id) {
      query = query.eq('id', input.lead_id as string);
    } else if (input.email) {
      query = query.eq('email', input.email as string);
    } else {
      return JSON.stringify({ error: 'Provide either email or lead_id' });
    }

    const { data, error } = await query.maybeSingle();
    if (error) return JSON.stringify({ error: error.message });
    if (!data) return JSON.stringify({ error: 'Lead not found' });
    return JSON.stringify(data);
  },
);

register(
  {
    name: 'score_lead',
    description: 'Update the score and stage of a lead based on qualification criteria.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead_id: { type: 'string', description: 'Lead UUID' },
        score: { type: 'number', description: 'Lead score 0-100' },
        stage: {
          type: 'string',
          enum: ['new', 'contacted', 'qualified', 'discovery_scheduled', 'proposal_sent', 'negotiating', 'won', 'lost', 'cold', 'nurture'],
          description: 'Pipeline stage',
        },
        notes: { type: 'string', description: 'Notes about this scoring decision' },
      },
      required: ['lead_id'],
    },
  },
  async (input, ctx) => {
    const updates: Record<string, unknown> = {};
    if (input.score !== undefined) updates.score = input.score;
    if (input.stage) updates.stage = input.stage;

    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', input.lead_id as string)
      .select('id, name, email, score, stage')
      .single();

    if (error) return JSON.stringify({ error: error.message });

    // Append note if provided
    if (input.notes) {
      const { data: lead } = await supabase
        .from('leads')
        .select('notes')
        .eq('id', input.lead_id as string)
        .single();

      const existingNotes = (lead?.notes as unknown[]) ?? [];
      await supabase
        .from('leads')
        .update({
          notes: [
            ...existingNotes,
            { date: new Date().toISOString(), note: input.notes, agent: ctx.agentName },
          ],
        })
        .eq('id', input.lead_id as string);
    }

    return JSON.stringify({ status: 'lead_updated', lead: data });
  },
);

register(
  {
    name: 'generate_proposal',
    description:
      'Generate a service proposal for a lead. Returns a structured proposal that goes to Brian for approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead_id: { type: 'string', description: 'Lead UUID' },
        services: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of services to include',
        },
        estimated_budget: { type: 'number', description: 'Proposed total budget' },
        timeline: { type: 'string', description: 'Estimated project timeline' },
        notes: { type: 'string', description: 'Additional proposal notes' },
      },
      required: ['lead_id', 'services'],
    },
  },
  async (input, ctx) => {
    const { error } = await supabase.from('notifications').insert({
      recipient_type: 'brian',
      company_id: ctx.companyId,
      channel: 'slack',
      title: 'Proposal needs approval',
      body: `Marcus generated a proposal for lead ${input.lead_id}.\nServices: ${(input.services as string[]).join(', ')}\nBudget: $${input.estimated_budget || 'TBD'}\nTimeline: ${input.timeline || 'TBD'}`,
      metadata: {
        agent: ctx.agentName,
        action: 'proposal_approval',
        lead_id: input.lead_id,
        services: input.services,
        estimated_budget: input.estimated_budget,
        timeline: input.timeline,
        notes: input.notes,
      },
    });

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({
      status: 'proposal_queued',
      note: 'Proposal has been sent to Brian for review and pricing approval.',
    });
  },
);

register(
  {
    name: 'schedule_followup',
    description: 'Schedule a follow-up email for a lead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead_id: { type: 'string', description: 'Lead UUID' },
        days_from_now: { type: 'number', description: 'Days from now to send follow-up' },
        sequence_type: {
          type: 'string',
          enum: ['new_lead', 'post_discovery', 'post_proposal', 're_engage'],
          description: 'Type of follow-up sequence',
        },
        email_subject: { type: 'string', description: 'Follow-up email subject' },
        email_body: { type: 'string', description: 'Follow-up email body' },
      },
      required: ['lead_id', 'days_from_now', 'email_subject', 'email_body'],
    },
  },
  async (input) => {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + (input.days_from_now as number));

    const { data, error } = await supabase
      .from('followup_sequences')
      .insert({
        lead_id: input.lead_id as string,
        sequence_type: (input.sequence_type as string) || 'new_lead',
        scheduled_at: scheduledAt.toISOString(),
        email_subject: input.email_subject as string,
        email_body: input.email_body as string,
      })
      .select('id, scheduled_at, status')
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'followup_scheduled', followup: data });
  },
);

register(
  {
    name: 'update_pipeline',
    description: 'Get a summary of the current sales pipeline.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data, error } = await supabase
      .from('leads')
      .select('stage, score, name, email, company_name, created_at, next_followup')
      .eq('company_id', ctx.companyId)
      .not('stage', 'in', '("won","lost")')
      .order('score', { ascending: false });

    if (error) return JSON.stringify({ error: error.message });

    const stages: Record<string, number> = {};
    for (const lead of data ?? []) {
      stages[lead.stage] = (stages[lead.stage] || 0) + 1;
    }

    return JSON.stringify({ pipeline_summary: stages, active_leads: data ?? [] });
  },
);

// ─── Sarah (Content) Tools ───

register(
  {
    name: 'get_style_dna',
    description: 'Get the Style DNA profile for this company (synthesized from reference websites).',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data, error } = await supabase
      .from('style_profiles')
      .select('*')
      .eq('company_id', ctx.companyId)
      .maybeSingle();

    if (error) return JSON.stringify({ error: error.message });
    if (!data) return JSON.stringify({ error: 'No Style DNA profile found for this company' });
    return JSON.stringify(data);
  },
);

register(
  {
    name: 'get_client_history',
    description: 'Get recent conversation history and interactions with this client.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max conversations to return (default 5)' },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, client_email, category, status, conversation_history, created_at')
      .eq('company_id', ctx.companyId)
      .order('created_at', { ascending: false })
      .limit((input.limit as number) || 5);

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ conversations: data ?? [] });
  },
);

register(
  {
    name: 'create_content',
    description: 'Create a new content item for the content calendar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          enum: ['instagram', 'facebook', 'linkedin', 'x', 'blog', 'email', 'google_ads'],
          description: 'Target platform',
        },
        content_type: {
          type: 'string',
          enum: ['post', 'story', 'reel', 'blog', 'newsletter', 'ad_copy'],
          description: 'Type of content',
        },
        title: { type: 'string', description: 'Content title' },
        body: { type: 'string', description: 'The content text' },
        hashtags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Hashtags (for social posts)',
        },
        call_to_action: { type: 'string', description: 'CTA text' },
      },
      required: ['platform', 'content_type', 'body'],
    },
  },
  async (input, ctx) => {
    const { data, error } = await supabase
      .from('content_calendar')
      .insert({
        company_id: ctx.companyId,
        platform: input.platform as string,
        content_type: input.content_type as string,
        title: (input.title as string) || null,
        body: input.body as string,
        hashtags: (input.hashtags as string[]) || [],
        call_to_action: (input.call_to_action as string) || null,
        created_by_agent: ctx.agentName,
        status: 'draft',
      })
      .select('id, platform, content_type, title, status')
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'content_created', content: data });
  },
);

register(
  {
    name: 'schedule_content',
    description: 'Schedule a content item for publication.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content_id: { type: 'string', description: 'Content calendar item UUID' },
        scheduled_at: { type: 'string', description: 'ISO date-time for publication' },
      },
      required: ['content_id', 'scheduled_at'],
    },
  },
  async (input) => {
    const { data, error } = await supabase
      .from('content_calendar')
      .update({
        scheduled_at: input.scheduled_at as string,
        status: 'pending_approval',
      })
      .eq('id', input.content_id as string)
      .select('id, title, scheduled_at, status')
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'content_scheduled', content: data });
  },
);

register(
  {
    name: 'repurpose_content',
    description:
      'Take an existing content item and adapt it for a different platform or format.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source_content_id: { type: 'string', description: 'Original content item UUID' },
        target_platform: {
          type: 'string',
          enum: ['instagram', 'facebook', 'linkedin', 'x', 'blog', 'email', 'google_ads'],
          description: 'Target platform for repurposed content',
        },
        target_content_type: {
          type: 'string',
          enum: ['post', 'story', 'reel', 'blog', 'newsletter', 'ad_copy'],
          description: 'Target content type',
        },
      },
      required: ['source_content_id', 'target_platform', 'target_content_type'],
    },
  },
  async (input) => {
    const { data: source, error: srcErr } = await supabase
      .from('content_calendar')
      .select('*')
      .eq('id', input.source_content_id as string)
      .single();

    if (srcErr || !source) return JSON.stringify({ error: 'Source content not found' });

    return JSON.stringify({
      source_content: {
        platform: source.platform,
        content_type: source.content_type,
        title: source.title,
        body: source.body,
      },
      target_platform: input.target_platform,
      target_content_type: input.target_content_type,
      instruction: 'Use the source content above to create the repurposed version. Then call create_content with the adapted text.',
    });
  },
);

register(
  {
    name: 'search_keywords',
    description: 'Search for tracked keyword rankings for this company.',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: { type: 'string', description: 'Keyword to search for (partial match)' },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    let query = supabase
      .from('keyword_rankings')
      .select('*')
      .eq('company_id', ctx.companyId)
      .order('tracked_at', { ascending: false })
      .limit(20);

    if (input.keyword) {
      query = query.ilike('keyword', `%${input.keyword}%`);
    }

    const { data, error } = await query;
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ keywords: data ?? [] });
  },
);

// ─── Aria (Design) Tools ───

register(
  {
    name: 'get_scraped_references',
    description: 'Get all scraped reference websites for this company with analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sentiment: {
          type: 'string',
          enum: ['positive', 'negative', 'mixed'],
          description: 'Filter by client sentiment (optional)',
        },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    let query = supabase
      .from('scraped_sites')
      .select('*')
      .eq('company_id', ctx.companyId)
      .eq('scrape_status', 'complete');

    if (input.sentiment) {
      query = query.eq('sentiment', input.sentiment as string);
    }

    const { data, error } = await query;
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ references: data ?? [], count: data?.length ?? 0 });
  },
);

register(
  {
    name: 'generate_canva_design',
    description:
      'Queue a design for creation in Canva. Brian will review the design brief before generation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        design_type: {
          type: 'string',
          enum: ['flyer', 'business_card', 'social_post', 'banner', 'brochure', 'logo_concept', 'website_mockup'],
          description: 'Type of design to create',
        },
        brief: { type: 'string', description: 'Detailed design brief' },
        dimensions: { type: 'string', description: 'Desired dimensions (e.g. "1080x1080")' },
      },
      required: ['design_type', 'brief'],
    },
  },
  async (input, ctx) => {
    const { error } = await supabase.from('notifications').insert({
      recipient_type: 'brian',
      company_id: ctx.companyId,
      channel: 'slack',
      title: `Design brief: ${input.design_type}`,
      body: input.brief as string,
      metadata: {
        agent: ctx.agentName,
        action: 'design_brief',
        design_type: input.design_type,
        dimensions: input.dimensions,
      },
    });

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({
      status: 'design_brief_submitted',
      note: 'Design brief sent to Brian for review. Canva generation will proceed after approval.',
    });
  },
);

register(
  {
    name: 'create_mood_board',
    description:
      'Create a mood board by collecting visual references. Returns curated reference data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        theme: { type: 'string', description: 'Mood board theme or concept' },
        style_keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Style keywords (e.g. ["minimalist", "warm", "organic"])',
        },
      },
      required: ['theme'],
    },
  },
  async (input, ctx) => {
    // Pull style DNA and brand kit for context
    const { data: styleDna } = await supabase
      .from('style_profiles')
      .select('*')
      .eq('company_id', ctx.companyId)
      .maybeSingle();

    const { data: brandKit } = await supabase
      .from('brand_kits')
      .select('*')
      .eq('company_id', ctx.companyId)
      .maybeSingle();

    return JSON.stringify({
      theme: input.theme,
      style_keywords: input.style_keywords || [],
      style_dna: styleDna || null,
      brand_kit: brandKit || null,
      instruction: 'Use the style DNA and brand kit data above to describe the mood board concept. Present it as a visual direction document.',
    });
  },
);

register(
  {
    name: 'brand_audit',
    description: 'Perform a brand consistency audit for the company.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const [brandKit, styleDna, recentContent, recentDeliverables] = await Promise.all([
      supabase.from('brand_kits').select('*').eq('company_id', ctx.companyId).maybeSingle(),
      supabase.from('style_profiles').select('*').eq('company_id', ctx.companyId).maybeSingle(),
      supabase.from('content_calendar').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false }).limit(10),
      supabase.from('deliverables').select('*').eq('conversation_id', ctx.companyId).order('created_at', { ascending: false }).limit(10),
    ]);

    return JSON.stringify({
      brand_kit: brandKit.data || null,
      style_dna: styleDna.data || null,
      recent_content: recentContent.data || [],
      recent_deliverables: recentDeliverables.data || [],
      instruction: 'Analyze the brand kit and style DNA against recent content and deliverables. Identify any inconsistencies in color usage, typography, tone, or visual style.',
    });
  },
);

register(
  {
    name: 'search_stock_images',
    description: 'Search for stock image descriptions matching criteria. Returns descriptions to use in design briefs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'What to search for' },
        style: { type: 'string', description: 'Desired image style (e.g. "professional", "candid", "aerial")' },
      },
      required: ['query'],
    },
  },
  async (input) => {
    return JSON.stringify({
      query: input.query,
      style: input.style || 'professional',
      note: 'Stock image search is descriptive in this phase. Use these parameters in your design brief to guide image selection.',
    });
  },
);

// ─── Diego (SEO) Tools ───

register(
  {
    name: 'audit_website',
    description: 'Run a technical SEO audit on a URL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to audit' },
      },
      required: ['url'],
    },
  },
  async (input, ctx) => {
    // In Phase 1, this creates an audit request. Full implementation in Phase 8.
    const { data, error } = await supabase
      .from('seo_audits')
      .insert({
        company_id: ctx.companyId,
        url: input.url as string,
      })
      .select('id')
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({
      status: 'audit_queued',
      audit_id: data.id,
      note: 'SEO audit has been queued. Full results will be available after the audit runs.',
    });
  },
);

register(
  {
    name: 'check_page_speed',
    description: 'Check page speed metrics for a URL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to check' },
      },
      required: ['url'],
    },
  },
  async (input) => {
    return JSON.stringify({
      url: input.url,
      status: 'pending',
      note: 'Page speed check queued. Integration with Lighthouse/PageSpeed API coming in Phase 8.',
    });
  },
);

register(
  {
    name: 'track_keywords',
    description: 'Add keywords to track for this company.',
    input_schema: {
      type: 'object' as const,
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords to track',
        },
      },
      required: ['keywords'],
    },
  },
  async (input, ctx) => {
    const keywords = input.keywords as string[];
    const inserts = keywords.map((kw) => ({
      company_id: ctx.companyId,
      keyword: kw,
      change_direction: 'new' as const,
    }));

    const { error } = await supabase.from('keyword_rankings').insert(inserts);
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'keywords_added', count: keywords.length });
  },
);

register(
  {
    name: 'get_keyword_rankings',
    description: 'Get current keyword rankings for this company.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    const { data, error } = await supabase
      .from('keyword_rankings')
      .select('*')
      .eq('company_id', ctx.companyId)
      .order('tracked_at', { ascending: false })
      .limit((input.limit as number) || 20);

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ rankings: data ?? [] });
  },
);

register(
  {
    name: 'analyze_competitors_seo',
    description: 'Analyze competitor SEO data.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data } = await supabase
      .from('competitors')
      .select('*, competitor_snapshots(snapshot_type, data, captured_at)')
      .eq('company_id', ctx.companyId)
      .eq('is_active', true);

    return JSON.stringify({ competitors: data ?? [] });
  },
);

register(
  {
    name: 'check_broken_links',
    description: 'Check for broken links on a URL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to check for broken links' },
      },
      required: ['url'],
    },
  },
  async (input) => {
    return JSON.stringify({
      url: input.url,
      status: 'pending',
      note: 'Broken link check queued. Full crawling comes in Phase 8.',
    });
  },
);

register(
  {
    name: 'generate_seo_report',
    description: 'Generate an SEO report for this company.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const [audits, keywords] = await Promise.all([
      supabase.from('seo_audits').select('*').eq('company_id', ctx.companyId).order('audited_at', { ascending: false }).limit(5),
      supabase.from('keyword_rankings').select('*').eq('company_id', ctx.companyId).order('tracked_at', { ascending: false }).limit(50),
    ]);

    return JSON.stringify({
      recent_audits: audits.data ?? [],
      keyword_rankings: keywords.data ?? [],
      instruction: 'Analyze this SEO data and produce a clear report with findings and recommendations.',
    });
  },
);

register(
  {
    name: 'optimize_content',
    description: 'Provide SEO optimization suggestions for content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'Content to optimize' },
        target_keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target keywords to optimize for',
        },
      },
      required: ['content'],
    },
  },
  async (input) => {
    return JSON.stringify({
      content_length: (input.content as string).length,
      target_keywords: input.target_keywords || [],
      instruction: 'Analyze the content for SEO and provide specific optimization suggestions.',
    });
  },
);

// ─── Mia (Social) Tools ───

register(
  {
    name: 'schedule_post',
    description: 'Schedule a social media post for publication.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content_id: { type: 'string', description: 'Content calendar item UUID to schedule' },
        scheduled_at: { type: 'string', description: 'ISO date-time for publication' },
      },
      required: ['content_id', 'scheduled_at'],
    },
  },
  async (input) => {
    const { data, error } = await supabase
      .from('content_calendar')
      .update({ scheduled_at: input.scheduled_at, status: 'scheduled' })
      .eq('id', input.content_id as string)
      .select('id, title, platform, scheduled_at, status')
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'post_scheduled', content: data });
  },
);

register(
  {
    name: 'get_engagement_metrics',
    description: 'Get engagement metrics for recent social media content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: {
          type: 'string',
          enum: ['instagram', 'facebook', 'linkedin', 'x'],
          description: 'Filter by platform (optional)',
        },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    let query = supabase
      .from('content_calendar')
      .select('id, title, platform, content_type, published_at, engagement_metrics')
      .eq('company_id', ctx.companyId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20);

    if (input.platform) {
      query = query.eq('platform', input.platform as string);
    }

    const { data, error } = await query;
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ posts: data ?? [] });
  },
);

register(
  {
    name: 'draft_social_reply',
    description: 'Draft a reply to a social media comment or DM.',
    input_schema: {
      type: 'object' as const,
      properties: {
        comment_text: { type: 'string', description: 'The comment/DM to reply to' },
        platform: { type: 'string', description: 'Which platform' },
        context: { type: 'string', description: 'Additional context about the commenter or post' },
      },
      required: ['comment_text', 'platform'],
    },
  },
  async (input) => {
    return JSON.stringify({
      comment: input.comment_text,
      platform: input.platform,
      context: input.context || '',
      instruction: 'Draft an appropriate reply to this social media interaction. Be on-brand and engaging.',
    });
  },
);

register(
  {
    name: 'find_trending_topics',
    description: 'Identify trending topics relevant to this company.',
    input_schema: {
      type: 'object' as const,
      properties: {
        industry: { type: 'string', description: 'Industry to look at' },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    const { data: company } = await supabase
      .from('companies')
      .select('name, type')
      .eq('id', ctx.companyId)
      .single();

    return JSON.stringify({
      company_type: company?.type,
      industry: input.industry || company?.type,
      note: 'Trending topic analysis based on company type and industry. Full social listening integration in later phase.',
    });
  },
);

register(
  {
    name: 'get_best_posting_times',
    description: 'Recommend optimal posting times based on engagement data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: { type: 'string', description: 'Which platform' },
      },
      required: ['platform'],
    },
  },
  async (input, ctx) => {
    const { data } = await supabase
      .from('content_calendar')
      .select('published_at, engagement_metrics')
      .eq('company_id', ctx.companyId)
      .eq('platform', input.platform as string)
      .eq('status', 'published')
      .not('engagement_metrics', 'is', null)
      .order('published_at', { ascending: false })
      .limit(50);

    return JSON.stringify({
      platform: input.platform,
      historical_posts: data ?? [],
      instruction: 'Analyze posting times and engagement to recommend optimal posting windows.',
    });
  },
);

register(
  {
    name: 'generate_social_report',
    description: 'Generate a social media performance report.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data } = await supabase
      .from('content_calendar')
      .select('*')
      .eq('company_id', ctx.companyId)
      .in('status', ['published', 'scheduled'])
      .order('created_at', { ascending: false })
      .limit(50);

    return JSON.stringify({
      content: data ?? [],
      instruction: 'Produce a social media report summarizing performance, top posts, and recommendations.',
    });
  },
);

// ─── Rex (Reputation) Tools ───

register(
  {
    name: 'get_new_reviews',
    description: 'Get recent reviews for this company that need responses.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: { type: 'string', description: 'Filter by platform (optional)' },
        status: {
          type: 'string',
          enum: ['pending', 'draft_ready', 'approved', 'posted', 'skipped'],
          description: 'Filter by response status',
        },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    let query = supabase
      .from('reviews')
      .select('*')
      .eq('company_id', ctx.companyId)
      .order('reviewed_at', { ascending: false })
      .limit(20);

    if (input.platform) query = query.eq('platform', input.platform as string);
    if (input.status) query = query.eq('response_status', input.status as string);

    const { data, error } = await query;
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ reviews: data ?? [] });
  },
);

register(
  {
    name: 'draft_review_response',
    description: 'Draft a response to a review.',
    input_schema: {
      type: 'object' as const,
      properties: {
        review_id: { type: 'string', description: 'Review UUID' },
        response: { type: 'string', description: 'The drafted response text' },
      },
      required: ['review_id', 'response'],
    },
  },
  async (input) => {
    const { data, error } = await supabase
      .from('reviews')
      .update({
        response_draft: input.response as string,
        response_status: 'draft_ready',
      })
      .eq('id', input.review_id as string)
      .select('id, reviewer_name, rating, response_status')
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'draft_saved', review: data });
  },
);

register(
  {
    name: 'get_sentiment_trends',
    description: 'Get sentiment trends from reviews over time.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data, error } = await supabase
      .from('reviews')
      .select('rating, sentiment, sentiment_score, platform, reviewed_at, key_topics')
      .eq('company_id', ctx.companyId)
      .order('reviewed_at', { ascending: false })
      .limit(100);

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ reviews: data ?? [], instruction: 'Analyze sentiment trends over time.' });
  },
);

register(
  {
    name: 'send_review_request',
    description: 'Queue a review request to be sent to a client (goes through approval).',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name: { type: 'string', description: 'Client name' },
        client_email: { type: 'string', description: 'Client email' },
        platform: { type: 'string', description: 'Platform to request review on' },
      },
      required: ['client_name', 'client_email', 'platform'],
    },
  },
  async (input, ctx) => {
    const { error } = await supabase.from('notifications').insert({
      recipient_type: 'brian',
      company_id: ctx.companyId,
      channel: 'email',
      title: `Review request for ${input.client_name}`,
      body: `Request ${input.client_name} (${input.client_email}) to leave a review on ${input.platform}`,
      metadata: { agent: ctx.agentName, action: 'review_request', ...input },
    });

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'review_request_queued' });
  },
);

register(
  {
    name: 'get_competitor_ratings',
    description: 'Get competitor review ratings for comparison.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data } = await supabase
      .from('competitors')
      .select('name, website_url')
      .eq('company_id', ctx.companyId)
      .eq('is_active', true);

    return JSON.stringify({
      competitors: data ?? [],
      note: 'Competitor review monitoring data will be populated by the review monitoring background job.',
    });
  },
);

register(
  {
    name: 'generate_reputation_report',
    description: 'Generate a reputation and review report.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('company_id', ctx.companyId)
      .order('reviewed_at', { ascending: false })
      .limit(50);

    return JSON.stringify({
      reviews: data ?? [],
      instruction: 'Generate a comprehensive reputation report with ratings summary, sentiment trends, and recommendations.',
    });
  },
);

register(
  {
    name: 'alert_brian',
    description: 'Send an urgent alert to Brian. Use for 1-star reviews, reputation crises, or anything that needs immediate attention.',
    input_schema: {
      type: 'object' as const,
      properties: {
        alert_type: { type: 'string', description: 'Type of alert (e.g. "1_star_review", "reputation_crisis")' },
        details: { type: 'string', description: 'Details about the alert' },
      },
      required: ['alert_type', 'details'],
    },
  },
  async (input, ctx) => {
    const { error } = await supabase.from('notifications').insert({
      recipient_type: 'brian',
      company_id: ctx.companyId,
      channel: 'slack',
      title: `URGENT: ${input.alert_type}`,
      body: input.details as string,
      metadata: { agent: ctx.agentName, alert_type: input.alert_type, urgency: 'high' },
    });

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'alert_sent' });
  },
);

// ─── Luna (Competitive Intel) Tools ───

register(
  {
    name: 'scrape_competitor_site',
    description: 'Queue a competitor website for scraping and analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        competitor_id: { type: 'string', description: 'Competitor UUID' },
        url: { type: 'string', description: 'URL to scrape' },
      },
      required: ['url'],
    },
  },
  async (input) => {
    return JSON.stringify({
      url: input.url,
      status: 'queued',
      note: 'Competitor scraping will use the scraping engine from Phase 3.',
    });
  },
);

register(
  {
    name: 'get_competitor_social',
    description: 'Get competitor social media data.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data } = await supabase
      .from('competitors')
      .select('name, social_handles')
      .eq('company_id', ctx.companyId)
      .eq('is_active', true);

    return JSON.stringify({ competitors: data ?? [] });
  },
);

register(
  {
    name: 'search_ad_library',
    description: 'Search for competitor ads.',
    input_schema: {
      type: 'object' as const,
      properties: {
        competitor_name: { type: 'string', description: 'Competitor to search for' },
      },
      required: ['competitor_name'],
    },
  },
  async (input) => {
    return JSON.stringify({
      competitor: input.competitor_name,
      note: 'Ad library search will be integrated in a later phase.',
    });
  },
);

register(
  {
    name: 'track_competitor_pricing',
    description: 'Track competitor pricing changes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        competitor_id: { type: 'string', description: 'Competitor UUID' },
      },
      required: ['competitor_id'],
    },
  },
  async (input) => {
    const { data } = await supabase
      .from('competitor_snapshots')
      .select('*')
      .eq('competitor_id', input.competitor_id as string)
      .eq('snapshot_type', 'pricing')
      .order('captured_at', { ascending: false })
      .limit(5);

    return JSON.stringify({ pricing_snapshots: data ?? [] });
  },
);

register(
  {
    name: 'get_competitor_jobs',
    description: 'Get competitor job postings (indicates growth areas).',
    input_schema: {
      type: 'object' as const,
      properties: {
        competitor_id: { type: 'string', description: 'Competitor UUID' },
      },
      required: ['competitor_id'],
    },
  },
  async (input) => {
    const { data } = await supabase
      .from('competitor_snapshots')
      .select('*')
      .eq('competitor_id', input.competitor_id as string)
      .eq('snapshot_type', 'jobs')
      .order('captured_at', { ascending: false })
      .limit(5);

    return JSON.stringify({ job_snapshots: data ?? [] });
  },
);

register(
  {
    name: 'generate_competitive_brief',
    description: 'Generate a competitive intelligence brief.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data } = await supabase
      .from('competitors')
      .select('*, competitor_snapshots(*)')
      .eq('company_id', ctx.companyId)
      .eq('is_active', true);

    return JSON.stringify({
      competitors: data ?? [],
      instruction: 'Analyze all competitor data and produce a competitive landscape brief with key insights and opportunities.',
    });
  },
);

register(
  {
    name: 'identify_market_gaps',
    description: 'Identify gaps in the market based on competitor analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const [competitors, companyProjects] = await Promise.all([
      supabase.from('competitors').select('*, competitor_snapshots(*)').eq('company_id', ctx.companyId).eq('is_active', true),
      supabase.from('projects').select('type, status').eq('company_id', ctx.companyId),
    ]);

    return JSON.stringify({
      competitors: competitors.data ?? [],
      our_projects: companyProjects.data ?? [],
      instruction: 'Compare competitor offerings with our current services/projects to identify market gaps and opportunities.',
    });
  },
);

// ─── Kai (Analytics) Tools ───

register(
  {
    name: 'get_analytics_data',
    description: 'Get analytics snapshots for this company.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          enum: ['google_analytics', 'google_ads', 'facebook_ads', 'internal'],
          description: 'Analytics source',
        },
        limit: { type: 'number', description: 'Max snapshots to return' },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    let query = supabase
      .from('analytics_snapshots')
      .select('*')
      .eq('company_id', ctx.companyId)
      .order('period_end', { ascending: false })
      .limit((input.limit as number) || 10);

    if (input.source) query = query.eq('source', input.source as string);

    const { data, error } = await query;
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ snapshots: data ?? [] });
  },
);

register(
  {
    name: 'detect_anomalies',
    description: 'Look for anomalies in analytics data.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data } = await supabase
      .from('analytics_snapshots')
      .select('*')
      .eq('company_id', ctx.companyId)
      .not('anomalies', 'is', null)
      .order('period_end', { ascending: false })
      .limit(20);

    return JSON.stringify({
      snapshots_with_anomalies: data ?? [],
      instruction: 'Analyze the anomalies detected and provide a summary with severity levels.',
    });
  },
);

register(
  {
    name: 'calculate_roi',
    description: 'Calculate ROI for marketing campaigns.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source: { type: 'string', description: 'Campaign source (e.g. "google_ads")' },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    const { data } = await supabase
      .from('analytics_snapshots')
      .select('*')
      .eq('company_id', ctx.companyId)
      .order('period_end', { ascending: false })
      .limit(12);

    return JSON.stringify({
      snapshots: data ?? [],
      requested_source: input.source || 'all',
      instruction: 'Calculate ROI from the analytics data. Compare spend vs conversions/revenue.',
    });
  },
);

register(
  {
    name: 'generate_report',
    description: 'Generate an analytics or performance report.',
    input_schema: {
      type: 'object' as const,
      properties: {
        report_type: {
          type: 'string',
          enum: ['monthly_summary', 'seo_report', 'social_report', 'competitive_brief'],
          description: 'Type of report',
        },
        title: { type: 'string', description: 'Report title' },
        content: { type: 'string', description: 'Report content (markdown)' },
      },
      required: ['report_type', 'title', 'content'],
    },
  },
  async (input, ctx) => {
    const { data, error } = await supabase
      .from('reports')
      .insert({
        company_id: ctx.companyId,
        report_type: input.report_type as string,
        title: input.title as string,
        content: input.content as string,
        generated_by_agent: ctx.agentName,
      })
      .select('id, title, report_type')
      .single();

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'report_created', report: data });
  },
);

register(
  {
    name: 'get_conversion_data',
    description: 'Get conversion data from analytics.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data } = await supabase
      .from('analytics_snapshots')
      .select('metrics, period_start, period_end, source')
      .eq('company_id', ctx.companyId)
      .order('period_end', { ascending: false })
      .limit(20);

    return JSON.stringify({ snapshots: data ?? [] });
  },
);

register(
  {
    name: 'forecast_metrics',
    description: 'Forecast future metrics based on historical data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        metric: { type: 'string', description: 'Which metric to forecast' },
      },
      required: ['metric'],
    },
  },
  async (input, ctx) => {
    const { data } = await supabase
      .from('analytics_snapshots')
      .select('metrics, period_start, period_end')
      .eq('company_id', ctx.companyId)
      .order('period_end', { ascending: false })
      .limit(24);

    return JSON.stringify({
      historical_data: data ?? [],
      target_metric: input.metric,
      instruction: 'Analyze the historical data and provide a forecast for the requested metric.',
    });
  },
);

register(
  {
    name: 'compare_periods',
    description: 'Compare metrics between two time periods.',
    input_schema: {
      type: 'object' as const,
      properties: {
        period_1_start: { type: 'string', description: 'Start date for period 1 (ISO)' },
        period_1_end: { type: 'string', description: 'End date for period 1 (ISO)' },
        period_2_start: { type: 'string', description: 'Start date for period 2 (ISO)' },
        period_2_end: { type: 'string', description: 'End date for period 2 (ISO)' },
      },
      required: ['period_1_start', 'period_1_end', 'period_2_start', 'period_2_end'],
    },
  },
  async (input, ctx) => {
    const [p1, p2] = await Promise.all([
      supabase.from('analytics_snapshots').select('*')
        .eq('company_id', ctx.companyId)
        .gte('period_start', input.period_1_start as string)
        .lte('period_end', input.period_1_end as string),
      supabase.from('analytics_snapshots').select('*')
        .eq('company_id', ctx.companyId)
        .gte('period_start', input.period_2_start as string)
        .lte('period_end', input.period_2_end as string),
    ]);

    return JSON.stringify({
      period_1: p1.data ?? [],
      period_2: p2.data ?? [],
      instruction: 'Compare the two periods and highlight significant changes in metrics.',
    });
  },
);

// ─── Nora (Client Success) Tools ───

register(
  {
    name: 'get_client_activity',
    description: 'Get all recent activity for this client across all agents and channels.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Look back N days (default 30)' },
      },
      required: [],
    },
  },
  async (input, ctx) => {
    const days = (input.days as number) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [activity, conversations, projects] = await Promise.all([
      supabase.from('agent_activity').select('*')
        .eq('company_id', ctx.companyId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('conversations').select('id, client_email, category, status, created_at')
        .eq('company_id', ctx.companyId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, status, type, created_at')
        .eq('company_id', ctx.companyId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false }),
    ]);

    return JSON.stringify({
      agent_activity: activity.data ?? [],
      conversations: conversations.data ?? [],
      projects: projects.data ?? [],
      period_days: days,
    });
  },
);

register(
  {
    name: 'calculate_satisfaction_score',
    description: 'Calculate a client satisfaction score based on signals.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const [reviews, projects, conversations] = await Promise.all([
      supabase.from('reviews').select('rating, sentiment_score')
        .eq('company_id', ctx.companyId).order('reviewed_at', { ascending: false }).limit(20),
      supabase.from('projects').select('status, type')
        .eq('company_id', ctx.companyId),
      supabase.from('conversations').select('status, category')
        .eq('company_id', ctx.companyId).order('created_at', { ascending: false }).limit(20),
    ]);

    return JSON.stringify({
      reviews: reviews.data ?? [],
      projects: projects.data ?? [],
      conversations: conversations.data ?? [],
      instruction: 'Calculate a satisfaction score (0-100) based on review ratings, project completion rates, and conversation patterns.',
    });
  },
);

register(
  {
    name: 'send_recap_email',
    description: 'Generate and queue a monthly recap email for the client.',
    input_schema: {
      type: 'object' as const,
      properties: {
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Recap email body' },
      },
      required: ['subject', 'body'],
    },
  },
  async (input, ctx) => {
    const { error } = await supabase.from('notifications').insert({
      recipient_type: 'brian',
      company_id: ctx.companyId,
      channel: 'email',
      title: `Client recap: ${input.subject}`,
      body: input.body as string,
      metadata: { agent: ctx.agentName, action: 'recap_email' },
    });

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'recap_queued', note: 'Recap email sent to Brian for review before sending to client.' });
  },
);

register(
  {
    name: 'check_renewal_dates',
    description: 'Check for upcoming contract renewals.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('company_id', ctx.companyId)
      .order('due_date', { ascending: true })
      .limit(10);

    return JSON.stringify({ invoices: data ?? [] });
  },
);

register(
  {
    name: 'get_churn_risk',
    description: 'Assess churn risk signals for this client.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  async (_input, ctx) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [recentActivity, recentConvos, reviews] = await Promise.all([
      supabase.from('agent_activity').select('created_at')
        .eq('company_id', ctx.companyId)
        .gte('created_at', thirtyDaysAgo.toISOString()),
      supabase.from('conversations').select('status, category, created_at')
        .eq('company_id', ctx.companyId)
        .gte('created_at', thirtyDaysAgo.toISOString()),
      supabase.from('reviews').select('rating, sentiment')
        .eq('company_id', ctx.companyId)
        .order('reviewed_at', { ascending: false })
        .limit(5),
    ]);

    return JSON.stringify({
      activity_count_30d: recentActivity.data?.length ?? 0,
      conversations_30d: recentConvos.data ?? [],
      recent_reviews: reviews.data ?? [],
      instruction: 'Assess churn risk based on engagement frequency, sentiment, and recent interactions.',
    });
  },
);

register(
  {
    name: 'schedule_touchpoint',
    description: 'Schedule a client check-in or touchpoint.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['check_in', 'review_meeting', 'strategy_session', 'feedback_request'],
          description: 'Type of touchpoint',
        },
        notes: { type: 'string', description: 'Notes about this touchpoint' },
        days_from_now: { type: 'number', description: 'Days from now to schedule' },
      },
      required: ['type', 'days_from_now'],
    },
  },
  async (input, ctx) => {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + (input.days_from_now as number));

    const { error } = await supabase.from('notifications').insert({
      recipient_type: 'brian',
      company_id: ctx.companyId,
      channel: 'portal',
      title: `Touchpoint: ${input.type}`,
      body: (input.notes as string) || `Scheduled ${input.type} with client`,
      metadata: { agent: ctx.agentName, action: 'touchpoint', type: input.type, scheduled_at: scheduledAt.toISOString() },
    });

    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'touchpoint_scheduled', date: scheduledAt.toISOString() });
  },
);

register(
  {
    name: 'collect_feedback',
    description: 'Collect and store client feedback.',
    input_schema: {
      type: 'object' as const,
      properties: {
        feedback_text: { type: 'string', description: 'The client\'s feedback' },
        sentiment: {
          type: 'string',
          enum: ['positive', 'neutral', 'negative'],
          description: 'Feedback sentiment',
        },
        topic: { type: 'string', description: 'What the feedback is about' },
      },
      required: ['feedback_text'],
    },
  },
  async (input, ctx) => {
    // Store as agent memory
    const { error } = await supabase.from('agent_memory').insert({
      agent_id: ctx.agentId,
      company_id: ctx.companyId,
      memory_type: 'feedback',
      content: `[${input.sentiment || 'neutral'}] ${input.topic ? input.topic + ': ' : ''}${input.feedback_text}`,
      source: 'conversation',
    });

    if (error && error.code !== '23505') return JSON.stringify({ error: error.message });
    return JSON.stringify({ status: 'feedback_recorded' });
  },
);

// ─── Public API ───

/**
 * Get Claude API tool definitions for the given tool names.
 */
export function getToolDefinitions(toolNames: string[]): AgentToolDefinition[] {
  const result: AgentToolDefinition[] = [];
  for (const name of toolNames) {
    const def = definitions.get(name);
    if (def) {
      result.push(def);
    } else {
      console.warn(`${LOG} Unknown tool: "${name}"`);
    }
  }
  return result;
}

/**
 * Execute a tool by name with the given input and context.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const handler = handlers.get(name);
  if (!handler) {
    return JSON.stringify({ error: `Tool "${name}" not found` });
  }

  try {
    return await handler(input, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} Tool "${name}" failed:`, msg);
    return JSON.stringify({ error: `Tool execution failed: ${msg}` });
  }
}

/**
 * Check if a tool is registered.
 */
export function hasTools(toolNames: string[]): { found: string[]; missing: string[] } {
  const found: string[] = [];
  const missing: string[] = [];
  for (const name of toolNames) {
    if (definitions.has(name)) {
      found.push(name);
    } else {
      missing.push(name);
    }
  }
  return { found, missing };
}
