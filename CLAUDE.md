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
- **AI:** Claude API with tool use (`@anthropic-ai/sdk`)
- **Database:** Supabase (`@supabase/supabase-js`)
- **Hosting:** Vercel
- **Email:** Gmail API
- **Design:** Canva API
- **Notifications:** Slack webhooks
- **Server:** Express

### Core Capabilities
1. **Email Monitoring** — Poll/webhook Gmail inboxes for all three companies
2. **Email Classification** — Claude classifies emails by type, urgency, and required action
3. **Intelligent Response** — Draft context-aware replies using Claude tool use
4. **Marketing Deliverables** — Generate flyers, business cards, and other collateral via Canva API
5. **Approval Queue** — All outbound emails and deliverables require human approval before sending
6. **Slack Notifications** — Alert team members of new items needing review

### Folder Structure
```
src/
  agents/    — AI agent definitions and orchestration
  tools/     — Claude tool-use function implementations
  config/    — Configuration and environment setup
  api/       — Express routes and middleware
  types/     — TypeScript type definitions
```

## Development

```bash
npm run dev      # Start dev server with hot reload
npm run build    # Compile TypeScript
npm start        # Run compiled output
```

## Conventions
- Strict TypeScript (`strict: true`)
- Environment variables via `.env` (never committed)
- All external actions (email send, Slack post) go through the approval queue
