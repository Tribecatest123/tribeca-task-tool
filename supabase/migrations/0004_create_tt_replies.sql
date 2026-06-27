-- One row per inbound reply, so a task can accumulate a full reply thread
-- (the tt_tasks columns still mirror the latest reply for back-compat).
create table if not exists public.tt_replies (
  id             bigint generated always as identity primary key,
  task_id        text not null references public.tt_tasks(task_id) on delete cascade,
  assignee_email text,
  reply_text     text not null,
  received_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists tt_replies_task_id_idx on public.tt_replies(task_id, received_at);
alter table public.tt_replies enable row level security;
