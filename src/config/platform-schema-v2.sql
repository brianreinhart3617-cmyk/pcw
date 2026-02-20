-- ============================================================
-- PHOENIX CREATIVE WORKS — FULL AGENTIC MARKETING PLATFORM
-- Supabase Schema v2.0
-- ============================================================
-- Run AFTER the v1 schema (companies, brand_kits, conversations,
-- deliverables, email_log, canva_tokens are already created).
-- This adds: agents, client portal, projects, scraping, leads,
-- content calendar, reviews, SEO, analytics, invoicing.
-- ============================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- AGENT FRAMEWORK
-- ============================================================

-- Agent definitions (Atlas, Marcus, Sarah, Aria, Diego, Mia, Rex, Luna, Kai, Nora)
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,            -- 'atlas', 'marcus', 'sarah', etc.
  display_name text not null,           -- 'Atlas', 'Marcus', 'Sarah'
  role text not null,                   -- 'project_manager', 'sales', 'content', 'design', etc.
  avatar_url text,
  system_prompt text not null,          -- base system prompt for this agent
  tools jsonb not null default '[]',    -- list of tool names this agent can use
  model text not null default 'claude-sonnet-4-5-20250929',  -- which Claude model
  temperature float default 0.7,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Agent memory — per-client, per-agent persistent context
create table if not exists agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  memory_type text not null 
    check (memory_type in ('preference','fact','feedback','style','relationship','instruction')),
  content text not null,
  confidence float default 1.0,         -- 0.0-1.0, decays if contradicted
  source text,                          -- 'conversation', 'onboarding', 'manual'
  source_id uuid,                       -- optional ref to conversation/project
  created_at timestamptz default now(),
  expires_at timestamptz,               -- optional TTL for time-sensitive memories
  unique(agent_id, company_id, content) -- prevent duplicate memories
);

-- Agent activity log — everything every agent does
create table if not exists agent_activity (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id),
  company_id uuid references companies(id),
  action_type text not null,            -- 'email_draft', 'design_created', 'lead_scored', etc.
  description text not null,
  metadata jsonb default '{}',          -- flexible payload
  project_id uuid,                      -- optional project context
  conversation_id uuid,                 -- optional conversation context
  created_at timestamptz default now()
);

create index idx_agent_activity_agent on agent_activity(agent_id, created_at desc);
create index idx_agent_activity_company on agent_activity(company_id, created_at desc);
create index idx_agent_memory_lookup on agent_memory(agent_id, company_id, memory_type);

-- ============================================================
-- CLIENT PORTAL
-- ============================================================

-- Client portal users (clients log in to see their projects)
create table if not exists client_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  email text unique not null,
  name text not null,
  password_hash text not null,
  role text not null default 'member' 
    check (role in ('owner', 'admin', 'member')),
  avatar_url text,
  last_login timestamptz,
  is_active boolean default true,
  onboarding_completed boolean default false,
  notification_preferences jsonb default '{"email": true, "portal": true}',
  created_at timestamptz default now()
);

-- Portal conversations (client ↔ agent real-time chat)
create table if not exists portal_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  client_user_id uuid references client_users(id),
  agent_id uuid references agents(id),     -- null = routed by Atlas
  project_id uuid,                          -- optional project context (FK added after projects table)
  subject text,
  status text default 'active'
    check (status in ('active', 'waiting_client', 'waiting_agent', 
    'waiting_approval', 'closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Individual messages in portal conversations
create table if not exists portal_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references portal_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('client', 'agent', 'system')),
  sender_id uuid,                           -- client_user_id or agent_id
  content text not null,
  attachments jsonb default '[]',           -- [{url, filename, type}]
  metadata jsonb default '{}',              -- tool calls, agent reasoning, etc.
  created_at timestamptz default now()
);

create index idx_portal_messages_convo on portal_messages(conversation_id, created_at);
create index idx_portal_convos_company on portal_conversations(company_id, status);

-- ============================================================
-- PROJECTS & TASKS
-- ============================================================

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  type text not null 
    check (type in ('website', 'branding', 'logo', 'flyer', 'business_card', 
    'brochure', 'social_campaign', 'seo', 'content', 'ad_campaign', 
    'email_campaign', 'reputation', 'other')),
  status text not null default 'active'
    check (status in ('draft', 'active', 'in_progress', 'review', 
    'revision', 'completed', 'cancelled', 'on_hold')),
  requirements jsonb,                   -- structured requirements from intake
  timeline jsonb,                       -- [{milestone, date, status}]
  assigned_agents text[] default '{}',  -- agent names assigned
  priority text default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  budget decimal,
  quoted_amount decimal,
  deadline timestamptz,
  completed_at timestamptz,
  source text default 'email'           -- 'email', 'portal', 'manual'
    check (source in ('email', 'portal', 'manual', 'phone')),
  portal_conversation_id uuid,          -- link to portal chat where project was discussed
  email_conversation_id uuid references conversations(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add FK from portal_conversations to projects
alter table portal_conversations 
  add constraint fk_portal_convo_project 
  foreign key (project_id) references projects(id);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  agent_id uuid references agents(id),
  title text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'waiting_review', 
    'completed', 'blocked', 'cancelled')),
  depends_on uuid[] default '{}',       -- task IDs this depends on
  result jsonb,                          -- what the agent produced
  feedback text,                         -- Brian's feedback if revision needed
  deadline timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index idx_projects_company on projects(company_id, status);
create index idx_tasks_project on tasks(project_id, status);
create index idx_tasks_agent on tasks(agent_id, status);

-- ============================================================
-- WEBSITE SCRAPING & STYLE DNA
-- ============================================================

-- Individual scraped website references
create table if not exists scraped_sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  url text not null,
  screenshot_desktop_url text,          -- Supabase Storage URL
  screenshot_mobile_url text,
  screenshot_hero_url text,
  html_snapshot text,                   -- raw HTML (truncated if huge)
  color_palette jsonb,                  -- [{hex, name, frequency, role}]
  typography jsonb,                     -- [{family, weight, size, usage}]
  layout_analysis jsonb,                -- Claude Vision output
  content_analysis jsonb,               -- tone, messaging, CTAs
  style_tags text[],                    -- ['minimalist','bold','photography-heavy']
  client_notes text,                    -- what the client said about this site
  client_annotations jsonb,             -- [{section, note, sentiment}]
  sentiment text check (sentiment in ('positive', 'negative', 'mixed')),
  scrape_status text default 'pending'
    check (scrape_status in ('pending', 'scraping', 'analyzing', 'complete', 'failed')),
  error_message text,
  scraped_at timestamptz,
  analyzed_at timestamptz,
  created_at timestamptz default now()
);

-- Synthesized style profile (one per company, built from multiple scraped sites)
create table if not exists style_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade unique,
  layout_preferences jsonb,             -- {type, navigation, hero, sections, footer}
  color_direction jsonb,                -- {primary_mood, accent_mood, avoid}
  typography_direction jsonb,           -- {heading_style, body_style, pairings}
  imagery_preferences jsonb,            -- {style, mood, stock_vs_custom, editing}
  density_preference text,              -- 'minimal', 'moderate', 'dense'
  overall_mood text,                    -- 'professional', 'playful', 'bold', etc.
  avoid_list text[],                    -- things client explicitly doesn't want
  raw_synthesis text,                   -- Claude's full narrative synthesis
  source_sites uuid[],                  -- references to scraped_sites.id
  version integer default 1,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index idx_scraped_sites_company on scraped_sites(company_id);

-- ============================================================
-- SALES PIPELINE (Marcus)
-- ============================================================

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),  -- which company is the prospect for
  email text not null,
  name text,
  company_name text,
  phone text,
  source text default 'email'
    check (source in ('email', 'portal', 'referral', 'website', 'social', 'phone', 'cold_outreach')),
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'qualified', 'discovery_scheduled',
    'proposal_sent', 'negotiating', 'won', 'lost', 'cold', 'nurture')),
  score integer default 0 check (score >= 0 and score <= 100),
  budget_range text,
  budget_amount decimal,
  services_interested text[],
  timeline text,                        -- 'asap', '1_month', '3_months', 'exploring'
  pain_points text[],
  notes jsonb default '[]',             -- [{date, note, agent}]
  next_followup timestamptz,
  followup_count integer default 0,
  conversation_id uuid references conversations(id),
  portal_conversation_id uuid references portal_conversations(id),
  won_amount decimal,
  won_at timestamptz,
  lost_reason text,
  lost_at timestamptz,
  assigned_agent text default 'marcus',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Follow-up sequences
create table if not exists followup_sequences (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  sequence_type text not null,          -- 'new_lead', 'post_discovery', 'post_proposal', 're_engage'
  step integer not null default 1,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  email_subject text,
  email_body text,
  status text default 'pending'
    check (status in ('pending', 'sent', 'replied', 'cancelled')),
  created_at timestamptz default now()
);

create index idx_leads_stage on leads(stage, next_followup);
create index idx_leads_company on leads(company_id, stage);
create index idx_followups_pending on followup_sequences(status, scheduled_at) 
  where status = 'pending';

-- ============================================================
-- CONTENT CALENDAR (Sarah + Mia)
-- ============================================================

create table if not exists content_calendar (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  project_id uuid references projects(id),
  platform text not null,               -- 'instagram', 'facebook', 'linkedin', 'x', 'blog', 'email', 'google_ads'
  content_type text not null,           -- 'post', 'story', 'reel', 'blog', 'newsletter', 'ad_copy'
  title text,
  body text,
  media_urls text[],                    -- attached images/videos
  media_descriptions text[],            -- alt text / image descriptions for designer
  hashtags text[],
  call_to_action text,
  target_audience text,
  scheduled_at timestamptz,
  published_at timestamptz,
  status text default 'draft'
    check (status in ('idea', 'draft', 'pending_approval', 'approved', 
    'scheduled', 'published', 'cancelled')),
  engagement_metrics jsonb,             -- {likes, shares, comments, reach, clicks}
  external_post_id text,                -- ID from Buffer/platform after posting
  created_by_agent text,                -- agent name
  approved_by text,                     -- 'brian' or auto-approved
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_content_calendar_schedule on content_calendar(company_id, scheduled_at, status);

-- ============================================================
-- REVIEW MONITORING (Rex)
-- ============================================================

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  platform text not null,               -- 'google', 'yelp', 'facebook', 'healthgrades', 'bbb'
  external_review_id text,              -- platform's ID for dedup
  reviewer_name text,
  rating integer check (rating >= 1 and rating <= 5),
  review_text text,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  sentiment_score float,                -- -1.0 to 1.0
  key_topics text[],                    -- extracted topics
  response_draft text,
  response_final text,                  -- what was actually posted
  response_status text default 'pending'
    check (response_status in ('pending', 'draft_ready', 'approved', 'posted', 'skipped')),
  response_posted_at timestamptz,
  flagged boolean default false,        -- urgent attention needed
  flag_reason text,
  reviewed_at timestamptz,              -- when review was posted
  created_at timestamptz default now(),
  unique(company_id, platform, external_review_id)
);

create index idx_reviews_pending on reviews(company_id, response_status) 
  where response_status in ('pending', 'draft_ready');

-- ============================================================
-- SEO TRACKING (Diego)
-- ============================================================

create table if not exists seo_audits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  url text not null,
  page_speed_desktop integer,           -- 0-100
  page_speed_mobile integer,
  seo_score integer,
  accessibility_score integer,
  best_practices_score integer,
  core_web_vitals jsonb,                -- {lcp, fid, cls, inp}
  issues jsonb,                         -- [{severity, category, description, recommendation}]
  recommendations jsonb,
  meta_tags jsonb,                      -- {title, description, og_tags}
  broken_links text[],
  audited_at timestamptz default now()
);

create table if not exists keyword_rankings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  keyword text not null,
  position integer,
  previous_position integer,
  change_direction text check (change_direction in ('up', 'down', 'stable', 'new')),
  url text,                             -- which page ranks
  search_volume integer,
  difficulty integer,                   -- 0-100
  tracked_at timestamptz default now()
);

create index idx_keyword_rankings_track on keyword_rankings(company_id, keyword, tracked_at desc);

-- ============================================================
-- ANALYTICS (Kai)
-- ============================================================

create table if not exists analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  source text not null,                 -- 'google_analytics', 'google_ads', 'facebook_ads', 'internal'
  period_start date not null,
  period_end date not null,
  metrics jsonb not null,               -- flexible: {sessions, pageviews, bounce_rate, conversions, spend, cpc, etc.}
  comparison_metrics jsonb,             -- previous period for delta calculation
  anomalies jsonb,                      -- [{metric, expected, actual, severity}]
  created_at timestamptz default now(),
  unique(company_id, source, period_start, period_end)
);

-- Generated reports
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  report_type text not null,            -- 'monthly_summary', 'seo_report', 'social_report', 'competitive_brief'
  title text not null,
  content text not null,                -- markdown or HTML
  data jsonb,                           -- structured data used to generate
  file_url text,                        -- PDF export URL
  period_start date,
  period_end date,
  generated_by_agent text,
  sent_to_client boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- COMPETITIVE INTELLIGENCE (Luna)
-- ============================================================

create table if not exists competitors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  website_url text,
  social_handles jsonb,                 -- {instagram, facebook, linkedin, x}
  industry text,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists competitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid references competitors(id) on delete cascade,
  snapshot_type text not null,          -- 'website', 'social', 'ads', 'pricing', 'jobs'
  data jsonb not null,                  -- flexible payload per type
  changes_detected jsonb,               -- what changed since last snapshot
  analysis text,                        -- Claude's analysis of changes
  captured_at timestamptz default now()
);

-- ============================================================
-- INVOICING & BILLING
-- ============================================================

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  project_id uuid references projects(id),
  invoice_number text unique not null,
  amount decimal not null,
  tax_amount decimal default 0,
  total decimal not null,
  status text default 'draft'
    check (status in ('draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled', 'refunded')),
  line_items jsonb not null,            -- [{description, quantity, rate, amount}]
  notes text,
  payment_terms text default 'net_30',
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  payment_method text,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- CLIENT ONBOARDING TRACKING
-- ============================================================

create table if not exists onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  client_user_id uuid references client_users(id),
  current_step text not null default 'welcome'
    check (current_step in ('welcome', 'brand_upload', 'brand_colors', 'brand_voice',
    'reference_sites', 'reference_feedback', 'style_synthesis', 
    'service_selection', 'complete')),
  brand_data_collected jsonb default '{}',
  reference_urls text[] default '{}',
  service_selections text[] default '{}',
  ai_recommendations jsonb,             -- what agents recommended based on intake
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- NOTIFICATION QUEUE (unified for Slack, email, portal)
-- ============================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('brian', 'client', 'agent')),
  recipient_id uuid,                    -- client_user_id or agent_id (null for brian)
  company_id uuid references companies(id),
  channel text not null check (channel in ('slack', 'email', 'portal', 'sms')),
  title text not null,
  body text not null,
  action_url text,                      -- deep link into dashboard/portal
  metadata jsonb default '{}',
  read_at timestamptz,
  sent_at timestamptz,
  status text default 'pending'
    check (status in ('pending', 'sent', 'read', 'failed')),
  created_at timestamptz default now()
);

create index idx_notifications_pending on notifications(recipient_type, status, created_at)
  where status = 'pending';

-- ============================================================
-- UPDATED_AT TRIGGERS (for new tables)
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply trigger to all tables with updated_at
do $$
declare
  t text;
begin
  for t in 
    select unnest(array[
      'agents', 'portal_conversations', 'projects', 'style_profiles',
      'leads', 'content_calendar', 'invoices', 'onboarding_sessions'
    ])
  loop
    execute format(
      'create trigger set_updated_at before update on %I 
       for each row execute function update_updated_at()', t
    );
  end loop;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (for client portal)
-- ============================================================

-- Enable RLS on client-facing tables
alter table client_users enable row level security;
alter table portal_conversations enable row level security;
alter table portal_messages enable row level security;
alter table projects enable row level security;
alter table deliverables enable row level security;
alter table scraped_sites enable row level security;
alter table reports enable row level security;
alter table invoices enable row level security;

-- Client users can only see their own company's data
create policy "client_users_own_company" on client_users
  for select using (company_id = (
    select company_id from client_users where id = auth.uid()
  ));

create policy "portal_convos_own_company" on portal_conversations
  for all using (company_id = (
    select company_id from client_users where id = auth.uid()
  ));

create policy "portal_messages_own_convo" on portal_messages
  for all using (conversation_id in (
    select id from portal_conversations where company_id = (
      select company_id from client_users where id = auth.uid()
    )
  ));

create policy "projects_own_company" on projects
  for select using (company_id = (
    select company_id from client_users where id = auth.uid()
  ));

create policy "deliverables_own_company" on deliverables
  for select using (conversation_id in (
    select id from conversations where company_id = (
      select company_id from client_users where id = auth.uid()
    )
  ));

create policy "reports_own_company" on reports
  for select using (company_id = (
    select company_id from client_users where id = auth.uid()
  ));

create policy "invoices_own_company" on invoices
  for select using (company_id = (
    select company_id from client_users where id = auth.uid()
  ));

-- Service role bypasses RLS (for backend)
-- Already handled by Supabase service role key

-- ============================================================
-- SEED: Default agents
-- ============================================================

insert into agents (name, display_name, role, system_prompt, tools, model) values
('atlas', 'Atlas', 'project_manager', 
 'You are Atlas, the project manager for Phoenix Creative Works. You coordinate all work across the agency. When a new request comes in, you determine which agents need to be involved, create project timelines, assign tasks, and track everything to completion. You are organized, proactive, and keep everyone on track. You escalate to Brian when decisions require human judgment — pricing commitments, major strategy changes, or client escalations.',
 '["create_project","assign_task","update_task","get_project_status","route_to_agent","notify_brian","notify_client","check_deadlines"]',
 'claude-sonnet-4-5-20250929'),

('marcus', 'Marcus', 'sales',
 'You are Marcus, the sales and lead nurture agent for Phoenix Creative Works. You handle all inbound leads from first touch to signed deal. You qualify leads, score them, send personalized follow-ups, generate proposals, and negotiate within pricing guardrails. You are persistent but not pushy, professional but warm. You know PCW''s services, pricing, and packages inside out. Minimum project fees and negotiation limits are in your tools. You escalate to Brian for deals over $5000 or custom pricing.',
 '["send_email","get_lead_history","score_lead","generate_proposal","schedule_followup","update_pipeline","get_brand_kit","search_past_projects"]',
 'claude-sonnet-4-5-20250929'),

('sarah', 'Sarah', 'content',
 'You are Sarah, the content strategist for Phoenix Creative Works. You write blog posts, social media content, email campaigns, website copy, ad copy, and press releases. You maintain each client''s brand voice and adapt your writing style per company. For BH centers, you are warm, empathetic, and HIPAA-compliant — never including PHI. For the marketing company, you are professional and creative. You can repurpose one piece of content into multiple formats.',
 '["get_brand_kit","get_style_dna","get_client_history","create_content","schedule_content","repurpose_content","search_keywords"]',
 'claude-sonnet-4-5-20250929'),

('aria', 'Aria', 'design',
 'You are Aria, the design director for Phoenix Creative Works. You create visual concepts — mood boards, flyers, business cards, social graphics, website mockups, and brand materials. You use each client''s brand kit (colors, fonts, logo) and their Style DNA profile (extracted from reference websites they shared). You present multiple concepts, explain your design rationale, and iterate based on feedback. You work through Canva API for production assets.',
 '["get_brand_kit","get_style_dna","get_scraped_references","generate_canva_design","create_mood_board","brand_audit","search_stock_images"]',
 'claude-sonnet-4-5-20250929'),

('diego', 'Diego', 'seo',
 'You are Diego, the SEO and web performance specialist for Phoenix Creative Works. You run technical audits, track keyword rankings, monitor page speed, find broken links, analyze competitors'' SEO strategies, and produce monthly performance reports. You speak in clear, non-technical language when talking to clients but can go deep on technical details with Brian. You proactively identify issues before they impact rankings.',
 '["audit_website","check_page_speed","track_keywords","get_keyword_rankings","analyze_competitors_seo","check_broken_links","generate_seo_report","optimize_content"]',
 'claude-sonnet-4-5-20250929'),

('mia', 'Mia', 'social_media',
 'You are Mia, the social media manager for Phoenix Creative Works. You plan content calendars, write platform-specific posts, schedule content, monitor engagement, respond to comments and DMs, and track performance metrics. You know what works on each platform — Instagram vs LinkedIn vs Facebook vs X. You identify trending topics and suggest timely content. For BH centers, you understand compliance requirements around health marketing.',
 '["schedule_post","get_engagement_metrics","draft_social_reply","find_trending_topics","get_best_posting_times","generate_social_report","get_brand_kit"]',
 'claude-sonnet-4-5-20250929'),

('rex', 'Rex', 'reputation',
 'You are Rex, the reputation and review manager for Phoenix Creative Works. You monitor Google Business, Yelp, Facebook, and Healthgrades reviews. You draft thoughtful, on-brand responses — warm and grateful for positive reviews, professional and empathetic for negative ones, always inviting offline resolution for complaints. For BH centers, you NEVER confirm or deny patient status in responses. You track sentiment trends and alert Brian immediately for 1-star reviews.',
 '["get_new_reviews","draft_review_response","get_sentiment_trends","send_review_request","get_competitor_ratings","generate_reputation_report","alert_brian"]',
 'claude-sonnet-4-5-20250929'),

('luna', 'Luna', 'competitive_intelligence',
 'You are Luna, the competitive intelligence agent for Phoenix Creative Works. You monitor competitor websites, social media, ad campaigns, pricing pages, and job postings. You identify market gaps, track new service launches, and produce monthly competitive landscape briefs. You are analytical and strategic, connecting dots between competitor moves and opportunities for PCW''s clients.',
 '["scrape_competitor_site","get_competitor_social","search_ad_library","track_competitor_pricing","get_competitor_jobs","generate_competitive_brief","identify_market_gaps"]',
 'claude-sonnet-4-5-20250929'),

('kai', 'Kai', 'analytics',
 'You are Kai, the analytics and reporting agent for Phoenix Creative Works. You connect to Google Analytics, Google Ads, and Facebook Ads. You pull performance data, identify trends, flag anomalies, calculate ROI, and produce automated reports. You translate complex data into clear insights. When something looks off — traffic drops, conversion changes, spend anomalies — you alert Brian before the client notices.',
 '["get_analytics_data","detect_anomalies","calculate_roi","generate_report","get_conversion_data","forecast_metrics","compare_periods"]',
 'claude-sonnet-4-5-20250929'),

('nora', 'Nora', 'client_success',
 'You are Nora, the client success manager for Phoenix Creative Works. You track every client interaction, monitor satisfaction signals, manage renewals, and ensure no client falls through the cracks. You send monthly recap emails showing everything accomplished. You are warm, attentive, and proactive. When a client seems unhappy (excessive revisions, delayed approvals, short responses), you flag it to Brian. You also handle client onboarding, guiding new clients through the brand intake and reference site collection process.',
 '["get_client_activity","calculate_satisfaction_score","send_recap_email","check_renewal_dates","get_churn_risk","schedule_touchpoint","collect_feedback","get_brand_kit"]',
 'claude-sonnet-4-5-20250929')

on conflict (name) do update set
  display_name = excluded.display_name,
  role = excluded.role,
  system_prompt = excluded.system_prompt,
  tools = excluded.tools,
  model = excluded.model;
