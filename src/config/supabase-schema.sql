-- PCW Agent System — Supabase Schema
-- Run this in the Supabase SQL Editor to bootstrap the database.

-- 1) Companies
create table companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('bh_center', 'marketing_company')),
  gmail_address text not null unique,
  system_prompt_classification text,
  system_prompt_agent          text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 2) Brand Kits
create table brand_kits (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies (id) on delete cascade,
  primary_colors   jsonb,
  secondary_colors jsonb,
  fonts            jsonb,
  logo_url         text,
  tone             text,
  compliance_notes text,
  business_card_template jsonb,
  created_at       timestamptz not null default now()
);

-- 3) Conversations
create table conversations (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies (id) on delete cascade,
  thread_id            text,
  client_email         text not null,
  client_name          text,
  category             text,
  sub_type             text,
  status               text not null default 'active'
                         check (status in ('active', 'waiting_client', 'waiting_approval', 'completed', 'ignored')),
  conversation_history jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 4) Deliverables
create table deliverables (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  type            text not null check (type in ('flyer', 'business_card', 'website', 'social_media', 'other')),
  version         integer not null default 1,
  content         jsonb,
  file_urls       jsonb,
  preview_urls    jsonb,
  approval_status text not null default 'pending'
                    check (approval_status in ('pending', 'approved', 'changes_requested', 'rejected')),
  brian_feedback  text,
  created_at      timestamptz not null default now()
);

-- 5) Email Log
create table email_log (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies (id) on delete cascade,
  direction       text not null check (direction in ('inbound', 'outbound')),
  from_email      text not null,
  to_email        text not null,
  subject         text,
  body            text,
  classification  jsonb,
  gmail_message_id text,
  conversation_id uuid references conversations (id) on delete set null,
  sent_at         timestamptz not null default now()
);

-- Indexes for common query patterns
create index idx_conversations_company   on conversations (company_id);
create index idx_conversations_status    on conversations (status);
create index idx_conversations_thread    on conversations (thread_id);
create index idx_deliverables_conv       on deliverables (conversation_id);
create index idx_deliverables_approval   on deliverables (approval_status);
create index idx_email_log_company       on email_log (company_id);
create index idx_email_log_conversation  on email_log (conversation_id);
create unique index idx_email_log_gmail_msg on email_log (company_id, gmail_message_id);

-- Auto-update updated_at on conversations
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger conversations_updated_at
  before update on conversations
  for each row execute function update_updated_at();
