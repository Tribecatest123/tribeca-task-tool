-- Tribeca Task Tool: canonical task store.
-- Namespaced tt_* to avoid colliding with other apps in the same Supabase project.
create table if not exists public.tt_tasks (
  task_id            text primary key,
  task_type          text not null check (task_type in ('calendar_event','reminder')),
  title              text not null,
  assignee_name      text,
  assignee_email     text not null,
  datetime_start     timestamptz,
  datetime_end       timestamptz,
  timezone           text not null default 'Asia/Kolkata',
  priority           text not null default 'normal' check (priority in ('high','normal','low')),
  notes              text,
  status             text not null default 'Draft',
  calendar_event_link text,
  reply_text         text,
  reply_received_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function public.tt_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tt_tasks_touch on public.tt_tasks;
create trigger tt_tasks_touch
  before update on public.tt_tasks
  for each row execute function public.tt_touch_updated_at();

-- Edge functions use the service-role key (bypasses RLS). RLS on with no public
-- policies keeps the table off the anon/public REST API.
alter table public.tt_tasks enable row level security;
