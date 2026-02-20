# CLAUDE.md — Phoenix Creative Works Full Agentic Marketing Platform v2

## What This Project Is

A fully agentic AI marketing platform where 10 AI agents run an entire marketing company. Clients interact through their own portal where AI agents engage them in real conversations, collect brand assets, scrape reference websites, build deliverables, and manage ongoing marketing operations. One person (Brian) reviews and approves everything through a command center dashboard.

The system already has a working v1 (email monitoring, classification, response drafting, approval queue, Canva deliverables, Slack/Make.com integration). This phase adds:
1. Agent framework with 10 specialized AI agents
2. Client-facing portal with real-time chat
3. Website scraping engine with Style DNA synthesis
4. Project management system
5. Sales pipeline and lead nurture
6. Content calendar and social media management
7. Review monitoring and reputation management
8. SEO tracking and competitive intelligence
9. Analytics and automated reporting
10. Client onboarding wizard with brand intake

## Tech Stack

### Core (already working)
- Runtime: Node.js 20+ with TypeScript (strict mode)
- AI: Claude API with tool use (function calling)
- Database: Supabase (PostgreSQL + Auth + Storage + Realtime)
- Hosting: Vercel (serverless functions + static)
- Email: Gmail API via OAuth2
- Design: Canva Connect API via OAuth2
- Notifications: Slack webhooks
- Triggers: Make.com outbound webhooks
- Admin Dashboard: React 19 + Vite + TypeScript

### New (to be added)
- Supabase Auth — client portal authentication
- Supabase Realtime — live chat between clients and agents
- Supabase Storage — screenshots, assets, deliverables
- Puppeteer — website scraping and screenshots
- Sharp — image processing, color extraction from screenshots
- Client Portal — React + Vite + TypeScript (separate app)
- Stripe — billing and invoicing (later phase)

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  BRIAN'S COMMAND CENTER                    │
│  Agent Feed · Agent Chat · Approvals · Analytics          │
└──────────────────────┬───────────────────────────────────┘
                       │
          ┌────────────┴────────────────┐
          │      AGENT ORCHESTRATOR      │
          │         (Atlas)              │
          │   Routes work · Tracks all   │
          └────────────┬────────────────┘
                       │
   ┌───────────────────┼───────────────────────┐
   │                   │                       │
┌──┴───┐         ┌─────┴─────┐          ┌──────┴─────┐
│INBOUND│        │ 10 AGENTS │         │  OUTBOUND   │
│Email  │        │ Atlas PM  │         │ Gmail Send  │
│Portal │        │ Marcus $  │         │ Slack       │
│Phone  │        │ Sarah ✍  │         │ Make.com    │
│Forms  │        │ Aria 🎨  │         │ Canva       │
│       │        │ Diego 🔍  │         │ Portal Push │
│       │        │ Mia 📱   │         │             │
│       │        │ Rex ⭐   │         │             │
│       │        │ Luna 🔭  │         │             │
│       │        │ Kai 📊   │         │             │
│       │        │ Nora 🤝  │         │             │
└───────┘        └───────────┘         └─────────────┘
                       │
          ┌────────────┴───────────────┐
          │         DATA LAYER          │
          │  Supabase PostgreSQL        │
          │  20+ tables · RLS           │
          │  Realtime · Storage · Auth  │
          └────────────────────────────┘

CLIENT PORTAL (separate React app):
┌──────────────────────────────────────┐
│  Client logs in → sees their portal  │
│  💬 Chat with agents                 │
│  📋 Project board                    │
│  📁 Asset library                    │
│  📊 Reports                          │
│  ⚙️ Brand settings                   │
└──────────────────────────────────────┘
```

## Agent Specifications

### Atlas — Project Manager & Orchestrator
- Routes incoming work to the right agent(s)
- Creates project timelines and assigns tasks
- Tracks deadlines, sends reminders, escalates blockers
- Coordinates multi-agent workflows (website project = Sarah + Aria + Diego + Kai)
- Generates weekly status reports

### Marcus — Sales & Lead Nurture
- Handles all inbound leads on PCW inbox
- Qualifies, scores, sends personalized follow-ups
- Generates proposals with pricing guardrails
- Tracks full pipeline with conversion metrics
- Breakup emails when leads go permanently cold
- Minimum project fee: configurable in companies table
- Escalate to Brian for deals over threshold

### Sarah — Content Strategist
- Writes blogs, social posts, email campaigns, website copy, ad copy
- Maintains brand voice per client from brand_kits table
- Repurposes content across formats (1 blog → 5 socials → 1 email → 1 flyer headline)
- HIPAA-compliant for BH centers — never includes PHI

### Aria — Design Director
- Creates visual concepts using brand_kits + style_profiles
- Generates designs via Canva API (flyers, cards, social graphics)
- Creates mood boards from scraped reference sites
- Presents multiple concepts, iterates on feedback
- Manages version control on all design deliverables

### Diego — SEO & Web Performance
- Runs weekly technical audits per client website
- Tracks keyword rankings over time
- Monitors page speed, Core Web Vitals, broken links
- Produces monthly SEO reports
- Competitor keyword monitoring

### Mia — Social Media Manager
- Plans and schedules content across platforms
- Monitors and drafts responses to comments/DMs
- Tracks engagement metrics per post
- Identifies trending topics for timely content
- Weekly performance reports

### Rex — Reputation & Review Manager
- Monitors Google, Yelp, Facebook, Healthgrades reviews
- Drafts response for each review (warm positive, empathetic negative)
- HIPAA-safe for BH centers — never confirms patient status
- Tracks sentiment trends, alerts on 1-star reviews
- Can proactively request reviews from satisfied clients

### Luna — Competitive Intelligence
- Monitors competitor websites for changes
- Tracks competitor social media and ad campaigns
- Identifies market gaps and opportunities
- Monthly competitive landscape briefs

### Kai — Analytics & Reporting
- Connects to Google Analytics, Ads, Facebook Ads
- Pulls performance data, identifies trends and anomalies
- Calculates campaign ROI
- Automated monthly reports per client
- Alerts Brian on significant metric changes

### Nora — Client Success Manager
- Tracks all client interactions across channels
- Monitors satisfaction signals (excessive revisions = red flag)
- Sends automated monthly recap emails
- Manages renewals and contract milestones
- Guides new clients through onboarding wizard

## Client Portal Flows

### Onboarding Wizard
1. Welcome — Nora greets, explains process
2. Brand Upload — logo, colors, fonts (drag & drop + AI color extraction from logo)
3. Brand Voice — conversational Q&A to determine tone and personality
4. Reference Sites — client shares 3-5 URLs they like, 1-2 they don't
   → Scraping engine captures screenshots, extracts colors/typography/layout
   → Client annotates what they like/dislike about each
5. Style DNA Synthesis — AI combines all references into a style profile
   → Shows summary to client for confirmation
6. Service Selection — what they need (website, social, SEO, etc.)
   → AI generates recommended package, routed to Brian for pricing approval
7. Project Kickoff — Atlas creates project, assigns agents

### Portal Chat
- Client sends message → Atlas routes to appropriate agent
- Agent responds in real-time (Supabase Realtime)
- Agents can show inline previews (designs, content drafts)
- Client approves/requests changes directly in chat
- Full conversation history preserved and searchable
- Each agent has distinct personality in chat

### Website Project Flow (via portal)
1. Client says "I need a new website"
2. Aria asks for reference site URLs
3. Scraping engine processes each URL
4. Client annotates likes/dislikes
5. Aria synthesizes Style DNA, presents to client
6. Sarah drafts all page copy (client reviews inline)
7. Aria generates mockups using Style DNA + copy + brand kit
8. Client reviews, provides feedback
9. Iterate until approved
10. Brian final review → approve for build
11. Diego sets up SEO, Kai configures analytics
12. Site launches, ongoing monitoring begins

## Website Scraping Engine

### Pipeline (per URL)
1. Puppeteer navigates to URL
2. Capture: full-page desktop screenshot (1920px), mobile (375px), hero section
3. Extract CSS: all colors (frequency + prominence), font families, sizes, weights
4. Claude Vision analyzes screenshots:
   - Layout patterns (grid, single column, sidebar, split)
   - Navigation style (sticky, hamburger, mega menu)
   - Hero section type (full bleed, video, text-focused, split)
   - Content section patterns (cards, alternating, timeline)
   - Footer style, whitespace usage, overall density
5. Content analysis: headings, tone, CTAs, messaging themes
6. Store everything in scraped_sites table
7. Upload screenshots to Supabase Storage

### Style DNA Synthesis
When client provides multiple positive + negative references:
1. Pull all scraped_sites for company_id
2. Claude analyzes patterns across positive references
3. Claude analyzes patterns across negative references
4. Synthesize into style_profiles record:
   - layout_preferences, color_direction, typography_direction
   - imagery_preferences, density_preference, overall_mood
   - avoid_list (from negative references)
5. Present synthesis to client for confirmation
6. Store in style_profiles table (one per company)

## Database

v1 tables (already exist): companies, brand_kits, conversations, deliverables, email_log, canva_tokens

v2 tables (new): agents, agent_memory, agent_activity, client_users, portal_conversations, portal_messages, projects, tasks, scraped_sites, style_profiles, leads, followup_sequences, content_calendar, reviews, seo_audits, keyword_rankings, analytics_snapshots, reports, competitors, competitor_snapshots, invoices, onboarding_sessions, notifications

Schema SQL: src/config/platform-schema-v2.sql

## API Endpoints (Existing + New)

### Existing (v1)
- GET /health
- GET /api/emails
- POST /api/emails/poll
- GET /api/approval/pending
- POST /api/approval/:id/approve
- POST /api/approval/:id/reject
- POST /api/approval/:id/changes
- GET /api/canva/auth
- GET /api/canva/callback
- POST /api/deliverables/generate
- GET /api/make/status
- POST /api/make/test
- GET /api/conversations
- GET /api/companies

### New (v2)
- POST /api/auth/register — client portal registration
- POST /api/auth/login — client portal login
- GET /api/auth/me — current user
- GET /api/agents — list all agents
- GET /api/agents/:name — get agent details + memory for company
- POST /api/agents/:name/chat — send message to agent (returns response)
- GET /api/agents/activity — agent activity feed (with filters)
- GET /api/portal/conversations — client's conversations
- POST /api/portal/conversations — start new conversation
- GET /api/portal/conversations/:id/messages — get messages
- POST /api/portal/conversations/:id/messages — send message
- GET /api/projects — list projects (filterable by company, status)
- POST /api/projects — create project
- GET /api/projects/:id — get project with tasks
- PATCH /api/projects/:id — update project
- GET /api/projects/:id/tasks — list tasks
- POST /api/scrape — submit URL for scraping
- GET /api/scrape/:id — get scrape results
- POST /api/scrape/synthesize/:companyId — generate Style DNA
- GET /api/style-profile/:companyId — get Style DNA
- GET /api/leads — list leads (filterable by stage)
- POST /api/leads — create lead
- PATCH /api/leads/:id — update lead stage/notes
- GET /api/leads/pipeline — pipeline summary stats
- GET /api/content-calendar/:companyId — get content calendar
- POST /api/content-calendar — create content item
- PATCH /api/content-calendar/:id — update/approve content
- GET /api/reviews/:companyId — get reviews
- POST /api/reviews/:id/respond — approve/edit review response
- GET /api/seo/:companyId/audit — latest audit results
- POST /api/seo/:companyId/audit — trigger new audit
- GET /api/seo/:companyId/keywords — keyword rankings
- GET /api/analytics/:companyId — analytics dashboard data
- GET /api/reports/:companyId — generated reports
- POST /api/reports/generate — trigger report generation
- GET /api/invoices/:companyId — list invoices
- POST /api/invoices — create invoice
- GET /api/onboarding/:companyId — onboarding status
- POST /api/onboarding/:companyId/step — advance onboarding step
- GET /api/notifications — Brian's notification feed

## File Structure

```
src/
  agents/
    classifier.ts          (existing)
    response-agent.ts      (existing)
    orchestrator.ts        (NEW — Atlas routing logic)
    agent-runner.ts        (NEW — generic agent execution engine)
    agent-tools.ts         (NEW — tool registry and execution)
    agents/
      marcus.ts            (NEW — sales agent logic)
      sarah.ts             (NEW — content agent logic)
      aria.ts              (NEW — design agent logic)
      diego.ts             (NEW — SEO agent logic)
      mia.ts               (NEW — social media agent logic)
      rex.ts               (NEW — reputation agent logic)
      luna.ts              (NEW — competitive intel agent logic)
      kai.ts               (NEW — analytics agent logic)
      nora.ts              (NEW — client success agent logic)
  services/
    email-monitor.ts       (existing)
    email-processor.ts     (existing)
    approval-queue.ts      (existing)
    gmail.ts               (existing)
    slack.ts               (existing)
    make.ts                (existing)
    canva.ts               (existing)
    deliverable-generator.ts (existing)
    scraper.ts             (NEW — Puppeteer scraping engine)
    style-synthesizer.ts   (NEW — Style DNA generation)
    project-manager.ts     (NEW — project/task CRUD)
    lead-manager.ts        (NEW — lead pipeline management)
    content-scheduler.ts   (NEW — content calendar operations)
    review-monitor.ts      (NEW — review polling and drafting)
    seo-auditor.ts         (NEW — SEO audit runner)
    analytics-collector.ts (NEW — pull analytics data)
    report-generator.ts    (NEW — automated report creation)
    notification-service.ts (NEW — unified notification dispatch)
    onboarding-service.ts  (NEW — onboarding wizard logic)
  config/
    supabase.ts            (existing)
    supabase-schema.sql    (existing — v1)
    platform-schema-v2.sql (NEW — v2 tables)
    gmail.ts               (existing)
    anthropic.ts           (existing)
    canva.ts               (existing)
  api/
    email.ts               (existing)
    approval.ts            (existing)
    canva.ts               (existing)
    make.ts                (existing)
    conversations.ts       (existing)
    companies.ts           (existing)
    auth.ts                (NEW — client portal auth)
    agents.ts              (NEW — agent endpoints)
    portal.ts              (NEW — portal conversation endpoints)
    projects.ts            (NEW — project endpoints)
    scrape.ts              (NEW — scraping endpoints)
    leads.ts               (NEW — lead pipeline endpoints)
    content.ts             (NEW — content calendar endpoints)
    reviews.ts             (NEW — review endpoints)
    seo.ts                 (NEW — SEO endpoints)
    analytics.ts           (NEW — analytics endpoints)
    reports.ts             (NEW — report endpoints)
    invoices.ts            (NEW — invoice endpoints)
    onboarding.ts          (NEW — onboarding endpoints)
    notifications.ts       (NEW — notification endpoints)
  types/
    email.ts               (existing)
    approval.ts            (existing)
    canva.ts               (existing)
    make.ts                (existing)
    agent.ts               (NEW)
    portal.ts              (NEW)
    project.ts             (NEW)
    scrape.ts              (NEW)
    lead.ts                (NEW)
    content.ts             (NEW)
    review.ts              (NEW)
    seo.ts                 (NEW)
    analytics.ts           (NEW)
  index.ts                 (existing — add new route mounts)

dashboard/                 (existing — Brian's admin dashboard, expand)
  src/
    components/
      ApprovalQueue.tsx    (existing)
      EmailLog.tsx         (existing)
      Conversations.tsx    (existing)
      SystemStatus.tsx     (existing)
      AgentFeed.tsx        (NEW — real-time agent activity)
      AgentChat.tsx        (NEW — talk to any agent)
      ProjectBoard.tsx     (NEW — all projects kanban)
      LeadPipeline.tsx     (NEW — sales pipeline view)
      ClientOverview.tsx   (NEW — per-client summary)
      ContentCalendar.tsx  (NEW — calendar view)
      ReviewQueue.tsx      (NEW — review responses)
      SEODashboard.tsx     (NEW — SEO metrics)
      AnalyticsDash.tsx    (NEW — analytics overview)
      Notifications.tsx    (NEW — notification center)

portal/                    (NEW — client-facing portal, separate Vite app)
  src/
    App.tsx
    components/
      Login.tsx
      Dashboard.tsx
      Chat.tsx             (real-time agent chat)
      ProjectBoard.tsx     (client's project view)
      AssetLibrary.tsx     (deliverables + brand kit)
      Reports.tsx          (generated reports)
      BrandSettings.tsx    (edit brand kit)
      Onboarding/
        Welcome.tsx
        BrandUpload.tsx
        BrandColors.tsx
        BrandVoice.tsx
        ReferenceSites.tsx
        ReferenceFeedback.tsx
        StyleSynthesis.tsx
        ServiceSelection.tsx
        Complete.tsx
      Billing.tsx
    api/
      client.ts            (API client for portal)
    styles/
      portal.css
```

## Environment Variables

### Existing
- ANTHROPIC_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
- SUPABASE_ANON_KEY (new — for client portal RLS)
- GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET (per company)
- GMAIL_REFRESH_TOKEN_PCW / BH1 / BH2
- CANVA_CLIENT_ID / CANVA_CLIENT_SECRET
- SLACK_WEBHOOK_URL
- MAKE_WEBHOOK_URL

### New
- JWT_SECRET (for portal auth tokens)
- SUPABASE_STORAGE_BUCKET (for screenshots/assets)
- STRIPE_SECRET_KEY (later phase)
- STRIPE_WEBHOOK_SECRET (later phase)

## Code Standards
- TypeScript strict mode
- All agent tools must have explicit type definitions
- Every function must have JSDoc comments
- ESLint + Prettier
- Error handling: try/catch with structured error types
- Logging: structured JSON logs with agent_id, company_id context
- All Supabase queries use service role key in backend, anon key in portal

## Build Order (what to build and in what sequence)

### Phase 1: Agent Framework
Build the core agent runner — a generic engine that takes an agent definition (from the agents table), a message, company context, and conversation history, calls Claude API with the agent's system prompt and tools, executes tool calls, and returns the response. This is the foundation everything else runs on.

Files: src/agents/agent-runner.ts, src/agents/agent-tools.ts, src/agents/orchestrator.ts
Then: src/api/agents.ts endpoints

### Phase 2: Client Portal Foundation
Set up Supabase Auth for client users. Build the portal React app with login, dashboard shell, and the real-time chat interface using Supabase Realtime subscriptions. Wire chat to the agent runner so clients can talk to agents.

Files: portal/ (new Vite app), src/api/auth.ts, src/api/portal.ts

### Phase 3: Scraping Engine + Style DNA
Build the Puppeteer-based scraping pipeline. URL in → screenshots + color extraction + typography + Claude Vision layout analysis → stored in scraped_sites. Build the Style DNA synthesizer that combines multiple scraped sites into a style_profiles record.

Files: src/services/scraper.ts, src/services/style-synthesizer.ts, src/api/scrape.ts

### Phase 4: Client Onboarding Wizard
Build the multi-step onboarding flow in the portal. Each step collects data and stores it. The reference sites step triggers the scraping engine. The style synthesis step generates Style DNA. The service selection step creates a draft project.

Files: portal/src/components/Onboarding/*.tsx, src/services/onboarding-service.ts, src/api/onboarding.ts

### Phase 5: Project Management
Build project and task CRUD. Atlas orchestrator creates projects and assigns tasks to agents. Task completion triggers the next task in the chain. Project status updates push to portal in real-time.

Files: src/services/project-manager.ts, src/api/projects.ts, dashboard + portal project views

### Phase 6: Specialist Agents
Build each specialist agent's unique logic on top of the generic agent runner:
- Marcus: lead scoring, proposal generation, follow-up sequences
- Sarah: content templates, repurposing logic, SEO keyword integration
- Aria: Canva workflow, mood board generation, brand audit
- Others follow the same pattern

Files: src/agents/agents/*.ts (one per agent)

### Phase 7: Brian's Command Center Expansion
Expand the admin dashboard with: agent activity feed, agent chat, project board, lead pipeline, content calendar, review queue, SEO dashboard, analytics, notification center.

Files: dashboard/src/components/*.tsx (new components)

### Phase 8: Ongoing Automation
Build the background jobs: scheduled email polling, review monitoring, SEO audits, analytics collection, follow-up sequence execution, deadline reminders, report generation.

### Phase 9: Billing & Advanced
Stripe integration, invoice generation, client billing portal, advanced analytics, competitive intelligence automation.
