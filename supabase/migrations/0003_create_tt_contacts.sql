-- Real contacts so /parse uses deliverable email addresses instead of fabricated
-- "<name>@example.com" placeholders. Looked up by name_key = lowercased first token
-- of assignee_name; on match it OVERRIDES the model's assignee_name/email.
create table if not exists public.tt_contacts (
  name_key  text primary key,
  full_name text not null,
  email     text not null
);
alter table public.tt_contacts enable row level security;
insert into public.tt_contacts (name_key, full_name, email) values
  ('darshak', 'Darshak Bhatt', 'darshakbhatt94@gmail.com'),
  ('kalpesh', 'Kalpesh Mehta', 'kalpesh.mehta@gmail.com')
on conflict (name_key) do update
  set full_name = excluded.full_name, email = excluded.email;
