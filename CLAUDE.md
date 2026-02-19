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
- **Design:** Canva API (planned)
- **Notifications:** Slack incoming webhooks
- **Server:** Express 5

### Core Capabilities
1. **Email Monitoring** — Polls Gmail inboxes every 60s for all three companies, deduplicates via `gmail_message_id` unique index
2. **Email Classification** — Claude Sonnet classifies emails by category, urgency, sentiment, and required action with per-company category lists (marketing vs BH center)
3. **Intelligent Response** — Claude Sonnet drafts context-aware replies using full conversation history, HIPAA-compliant prompts for BH centers
4. **Marketing Deliverables** — Deliverable tracking with approval workflow (Canva integration planned)
5. **Approval Queue** — All outbound emails and deliverables require human approval before sending; approve/reject/request-changes with feedback
6. **Slack Notifications** — Alerts when new items need review in the approval queue

### Pipeline Flow
```
Inbound email → Gmail fetch → Log to email_log → Classify (Claude)
→ Create/update conversation → Generate draft response (Claude)
→ Submit to approval queue → Slack notification → Brian reviews
→ Approve → Send via Gmail → Log outbound email
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
  config/
    supabase.ts          — Supabase client initialization
    supabase-schema.sql  — Database schema (5 tables, indexes, triggers)
    gmail.ts             — Gmail OAuth2 client factory
    anthropic.ts         — Anthropic SDK client
  api/
    email.ts             — GET /api/emails, POST /api/emails/poll, GET /api/emails/:id
    approval.ts          — Approval queue endpoints (queue, drafts, approve, reject, request-changes)
  types/
    email.ts             — Core types (CompanyRecord, ParsedEmail, EmailClassification, etc.)
    approval.ts          — Approval queue types (PendingItem, SlackNotificationPayload)
  index.ts               — Express server entry point, mounts routes, starts monitor
```

### Database Schema (Supabase)
- **companies** — id, name, type, gmail_address, system_prompt_classification, system_prompt_agent, is_active
- **brand_kits** — id, company_id, colors, fonts, logo, tone, compliance_notes, business_card_template
- **conversations** — id, company_id, thread_id, client_email, category, sub_type, status, conversation_history (JSONB)
- **deliverables** — id, conversation_id, type, version, content, file_urls, preview_urls, approval_status, brian_feedback
- **email_log** — id, company_id, direction, from/to, subject, body, classification (JSONB), gmail_message_id, conversation_id

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
CANVA_API_KEY
```

## Conventions
- Strict TypeScript (`strict: true`)
- Environment variables via `.env` (never committed)
- All external actions (email send, Slack post) go through the approval queue
- Per-company customization via `system_prompt_classification` and `system_prompt_agent` columns
- Fire-and-forget pattern for async processing (classification, response generation) — errors logged, never block the polling loop
- Console logging with `[ServiceName]` prefixes for traceability
