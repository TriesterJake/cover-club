-- Adds: self-serve league creation, member add-by-email, and league deletion.
-- Run this in the Supabase SQL editor after 0001_init.sql.

-- Store email on profiles too (mirrored from auth.users) so a commissioner
-- can look someone up to add them without needing SQL/admin access. Note:
-- this makes email addresses visible to any signed-in user of the app via
-- the existing "profiles are readable by anyone signed in" policy -- fine
-- for a small trusted family league, worth tightening if this ever opens
-- up publicly.
alter table profiles add column email text;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, split_part(new.email, '@', 1), new.email);
  return new;
end;
$$;

-- backfill email for anyone who already signed up under the old trigger
update profiles p set email = u.email from auth.users u where p.id = u.id and p.email is null;

-- Any signed-in person can create a league (they become its founding
-- commissioner in the same step, handled by the app).
create policy "signed-in users can create a league"
  on leagues for insert
  with check (auth.role() = 'authenticated');

-- Only a league's commissioner can delete it. Every weeks/games/picks row
-- underneath cascades automatically (see the `on delete cascade` foreign
-- keys in 0001_init.sql) -- deleting the league is enough to clean
-- everything up.
create policy "commissioners can delete their league"
  on leagues for delete
  using (is_commissioner(id));

-- Founding commissioner: a user can insert themselves into a brand new
-- league as commissioner, as long as that league has no members yet.
create policy "creator can seat themselves as founding commissioner"
  on league_members for insert
  with check (
    user_id = auth.uid()
    and role = 'commissioner'
    and not exists (select 1 from league_members lm2 where lm2.league_id = league_members.league_id)
  );

-- An existing commissioner can add other members to their league.
create policy "commissioners can add members to their league"
  on league_members for insert
  with check (is_commissioner(league_id));

-- An existing commissioner can remove members (e.g. someone who joined by
-- mistake, or leaves the league).
create policy "commissioners can remove members"
  on league_members for delete
  using (is_commissioner(league_id));
