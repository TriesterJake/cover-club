-- Password login: the commissioner invites people by email, and an invited
-- person creates their own account (email + password) on the login page.
-- This table holds those invites until the person signs up.
--
-- Only the server (service role) ever touches it -- the browser can't read
-- or write it, so nobody can see who has been invited.
create table if not exists public.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (league_id, email)
);

alter table public.league_invites enable row level security;
-- (no policies on purpose)

-- Supabase no longer grants Data API access to new tables automatically
-- (from Oct 30), so grant explicitly -- and only to the server role.
revoke all on public.league_invites from anon, authenticated;
grant select, insert, update, delete on public.league_invites to service_role;
