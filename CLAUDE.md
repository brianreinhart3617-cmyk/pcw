# PCW Agent System

Autonomous agentic AI system for Phoenix Creative Works (PCW).

## Overview

Monitors email inboxes for three companies, classifies incoming emails, responds intelligently, creates marketing deliverables, and routes everything through an approval queue before sending to clients.

### Companies Served
- **Phoenix Creative Works** — Marketing company (parent)
- **Behavioral Health Center 1** — Behavioral health services
- **Behavioral Health Center 2** — Behavioral health services

## Architecture

### Tech Stack
- **Runtime:** Node.js 20+ with TypeScript
- **AI:** Claude API — Sonnet for classification and response generation (`@anthropic-ai/sdk`)
- **Database:** Supabase (`@supabase/supabase-js`)
- **Hosting:** Vercel
- **Email:** Gmail API via OAuth2 (`googleapis`)
- **Design:** Canva Connect API via OAuth2 (native `fetch`)
- **Notifications:** Slack incoming webhooks, Make.com outbound webhooks
- **Server:** Express 5

### Core Capabilities
1. **Email Monitoring** — Polls Gmail inboxes every 60s for all three companies, deduplicates via `gmail_message_id` unique index
2. **Email Classification** — Claude Sonnet classifies emails by category, urgency, sentiment, and required action with per-company category lists (marketing vs BH center)
3. **Intelligent Response** — Claude Sonnet drafts context-aware replies using full conversation history, HIPAA-compliant prompts for BH centers
4. **Marketing Deliverables** — Generate flyers and business cards via Canva API with brand kit integration, export polling, and version tracking
5. **Approval Queue** — All outbound emails and deliverables require human approval before sending; approve/reject/request-changes with feedback
6. **Slack Notifications** — Alerts when new items need review in the approval queue
7. **Make.com Webhooks** — Fires outbound webhooks on system events (classification, drafts, approvals, deliverables) for external automation via Make.com scenarios

### Pipeline Flow
```
Inbound email → Gmail fetch → Log to email_log → Classify (Claude)
→ Create/update conversation → Generate draft response (Claude)
→ Submit to approval queue → Slack notification → Brian reviews
→ Approve → Send via Gmail → Log outbound email

Deliverable request → Fetch brand kit → Upload logo to Canva
→ Create Canva design (preset type) → Export (PDF/PNG)
→ Insert deliverable row → Slack notification → Brian reviews
→ Approve / Request changes → Regenerate new version if needed

All pipeline steps fire Make.com webhooks (fire-and-forget) for external automation.
```

### Folder Structure
```
src/
  agents/
    classifier.ts        — Email classification agent (structured prompt, JSON output)
    response-agent.ts    — Intelligent response agent (conversation-aware drafting)
  services/
    gmail.ts             — Gmail API operations (fetch, parse, send)
    email-monitor.ts     — Polling loop for all company inboxes
    email-processor.ts   — Orchestrates classify → conversation → response
    approval-queue.ts    — Draft submission, approve/reject/request-changes
    slack.ts             — Slack webhook notifications
    make.ts              — Make.com outbound webhook (fire-and-forget, native fetch)
    canva.ts             — Canva API wrappers (create design, export, upload asset)
    deliverable-generator.ts — Orchestrates brand kit → Canva design → export → deliverable row
  config/
    supabase.ts          — Supabase client initialization
    supabase-schema.sql  — Database schema (6 tables, indexes, triggers)
    gmail.ts             — Gmail OAuth2 client factory
    anthropic.ts         — Anthropic SDK client
    canva.ts             — Canva OAuth2 flow, token management, authenticated fetch wrapper
  api/
    email.ts             — GET /api/emails, POST /api/emails/poll, GET /api/emails/:id
    approval.ts          — Approval queue endpoints (queue, drafts, approve, reject, request-changes)
    canva.ts             — Canva OAuth flow, deliverable generation/regeneration endpoints
    make.ts              — Make.com status and test endpoints
  types/
    email.ts             — Core types (CompanyRecord, ParsedEmail, EmailClassification, etc.)
    approval.ts          — Approval queue types (PendingItem, SlackNotificationPayload)
    canva.ts             — Canva API types (tokens, designs, exports, deliverables)
    make.ts              — Make.com webhook event types (discriminated union, envelope)
  index.ts               — Express server entry point, mounts routes, starts monitor
```

### Database Schema (Supabase)
- **companies** — id, name, type, gmail_address, system_prompt_classification, system_prompt_agent, is_active
- **brand_kits** — id, company_id, colors, fonts, logo, tone, compliance_notes, business_card_template
- **conversations** — id, company_id, thread_id, client_email, category, sub_type, status, conversation_history (JSONB)
- **deliverables** — id, conversation_id, type, version, content, file_urls, preview_urls, approval_status, brian_feedback, canva_design_id, canva_export_url
- **email_log** — id, company_id, direction, from/to, subject, body, classification (JSONB), gmail_message_id, conversation_id
- **canva_tokens** — id, access_token, refresh_token, expires_at, scopes (single-row pattern for shared OAuth2 tokens)

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/emails` | List recent emails (limit 50) |
| GET | `/api/emails/:id` | Get single email |
| POST | `/api/emails/poll` | Trigger immediate inbox poll |
| GET | `/api/approval/queue` | List all pending approval items |
| POST | `/api/approval/drafts` | Submit draft response for approval |
| POST | `/api/approval/emails/:id/approve` | Approve and send email |
| POST | `/api/approval/emails/:id/reject` | Reject with feedback |
| POST | `/api/approval/emails/:id/request-changes` | Request changes with feedback |
| POST | `/api/approval/deliverables/:id/approve` | Approve deliverable |
| POST | `/api/approval/deliverables/:id/reject` | Reject with feedback |
| POST | `/api/approval/deliverables/:id/request-changes` | Request changes with feedback |
| GET | `/api/canva/auth` | Start Canva OAuth2 flow |
| GET | `/api/canva/callback` | Canva OAuth2 callback |
| GET | `/api/canva/status` | Check Canva connection status |
| POST | `/api/deliverables/generate` | Generate deliverable via Canva |
| POST | `/api/deliverables/:id/regenerate` | Regenerate with feedback |
| GET | `/api/make/status` | Check if Make.com webhook is configured |
| POST | `/api/make/test` | Fire test event to verify connectivity |

## Development

```bash
npm run dev      # Start dev server with hot reload
npm run build    # Compile TypeScript
npm start        # Run compiled output
```

### Environment Variables
```
PORT, NODE_ENV
ANTHROPIC_API_KEY
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI
GMAIL_REFRESH_TOKEN_PCW, GMAIL_REFRESH_TOKEN_BH1, GMAIL_REFRESH_TOKEN_BH2
SLACK_WEBHOOK_URL
CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, CANVA_REDIRECT_URI
MAKE_WEBHOOK_URL
```

## Conventions
- Strict TypeScript (`strict: true`)
- Environment variables via `.env` (never committed)
- All external actions (email send, Slack post) go through the approval queue
- Per-company customization via `system_prompt_classification` and `system_prompt_agent` columns
- Fire-and-forget pattern for async processing (classification, response generation) — errors logged, never block the polling loop
- Lazy env loading for optional integrations (Canva, Make.com) — app boots without credentials configured
- Single webhook URL for Make.com — `event_type` field in payload, Make.com Router module fans out to scenarios
- Single-row token table for Canva OAuth2 — one account serves all three companies
- Console logging with `[ServiceName]` prefixes for traceability
