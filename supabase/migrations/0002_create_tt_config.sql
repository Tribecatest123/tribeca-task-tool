-- Private key/value config read only by edge functions (service role). No public policy.
-- The actual secret values are inserted out-of-band (SQL), never committed to the repo.
create table if not exists public.tt_config (
  key   text primary key,
  value text not null
);
alter table public.tt_config enable row level security;
