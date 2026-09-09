-- Cover Club schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

-- ─────────────────────────────────────────────────────────────────────────
-- Profiles: one row per auth user. Display name is what the league sees;
-- email (in auth.users) is only used for sign-in.
-- ─────────────────────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are readable by anyone signed in"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- Auto-create a profile row (with a default name pulled from the email)
-- when someone signs up, so joins never hit a missing profile before
-- they've visited the Profile page.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- Leagues + membership. role is 'commissioner' or 'member'.
-- Seed is used for playoff bracket position (1-4); null before playoffs.
-- ─────────────────────────────────────────────────────────────────────────
create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season_year int not null,
  picks_per_week int not null default 5,
  created_at timestamptz not null default now()
);

create table league_members (
  league_id uuid not null references leagues(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('commissioner', 'member')),
  playoff_seed int,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

alter table leagues enable row level security;
alter table league_members enable row level security;

create policy "members can see their own leagues"
  on leagues for select
  using (exists (select 1 from league_members lm where lm.league_id = leagues.id and lm.user_id = auth.uid()));

create policy "members can see other members of their leagues"
  on league_members for select
  using (exists (select 1 from league_members lm where lm.league_id = league_members.league_id and lm.user_id = auth.uid()));

-- helper used throughout: is the current user a commissioner of this league?
create or replace function is_commissioner(p_league_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from league_members
    where league_id = p_league_id and user_id = auth.uid() and role = 'commissioner'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Weeks. type separates the regular season from the two playoff rounds.
-- ─────────────────────────────────────────────────────────────────────────
create table weeks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  week_number int not null,
  label text not null,                              -- e.g. "Week 1", "Wild Card (3v4)"
  type text not null default 'regular'
    check (type in ('regular', 'playoff_r1', 'playoff_r2')),
  created_at timestamptz not null default now(),
  unique (league_id, week_number)
);

alter table weeks enable row level security;
create policy "members can see weeks in their leagues"
  on weeks for select
  using (exists (select 1 from league_members lm where lm.league_id = weeks.league_id and lm.user_id = auth.uid()));
create policy "commissioners manage weeks"
  on weeks for all
  using (is_commissioner(league_id))
  with check (is_commissioner(league_id));

-- ─────────────────────────────────────────────────────────────────────────
-- Games. kickoff_at drives both the "locks at kickoff" rule and the
-- "hidden from others until kickoff" visibility rule. status moves
-- scheduled -> live -> final as ESPN's feed updates it (or is set directly
-- to 'final' by the commissioner when backfilling a past week).
-- ─────────────────────────────────────────────────────────────────────────
create table games (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'final')),
  home_score int,
  away_score int,
  live_clock text,
  -- reference spread pulled from the odds API at the time the game was created,
  -- used only as a default when a person opens the pick screen. Not authoritative
  -- for grading -- each pick freezes its own line (see `picks.line`).
  ref_spread_home numeric(4,1),
  espn_event_id text,                    -- for matching score updates
  created_at timestamptz not null default now()
);

alter table games enable row level security;
create policy "members can see games in their leagues"
  on games for select
  using (exists (
    select 1 from weeks w
    join league_members lm on lm.league_id = w.league_id
    where w.id = games.week_id and lm.user_id = auth.uid()
  ));
create policy "commissioners manage games"
  on games for all
  using (exists (select 1 from weeks w where w.id = games.week_id and is_commissioner(w.league_id)))
  with check (exists (select 1 from weeks w where w.id = games.week_id and is_commissioner(w.league_id)));

-- ─────────────────────────────────────────────────────────────────────────
-- Picks. `team` is the team code picked; `line` is THAT PERSON'S line at
-- the moment they locked in -- never recomputed, never shared across
-- people, which is what lets two people have different numbers on the
-- same game. `source` + `entered_by` distinguish a live self-submitted
-- pick from a commissioner backfill/correction, for audit purposes only --
-- both count identically toward scoring.
-- ─────────────────────────────────────────────────────────────────────────
create table picks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  team text not null,
  line numeric(4,1) not null,
  source text not null default 'member_submitted'
    check (source in ('member_submitted', 'commissioner_backfill', 'commissioner_correction')),
  entered_by uuid references profiles(id),
  locked_at timestamptz not null default now(),
  unique (game_id, user_id)
);

alter table picks enable row level security;

-- Visibility rule: you can always see your own picks. You can see anyone
-- else's pick on a game only once that game has kicked off (or is final --
-- covers backfilled weeks, which are inserted as already-final).
create policy "picks visible to owner, or to anyone once the game has started"
  on picks for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from games g
      where g.id = picks.game_id
        and (g.status <> 'scheduled' or g.kickoff_at <= now())
    )
  );

-- A member can insert their own pick, but only before kickoff, and only if
-- they haven't already used up picks_per_week for that week, and only if
-- they don't already have a pick on that game (enforced by the unique
-- constraint above -- picks are final, no updates allowed for members).
create policy "members can submit their own pick before kickoff, up to the weekly limit"
  on picks for insert
  with check (
    user_id = auth.uid()
    and source = 'member_submitted'
    and exists (
      select 1 from games g where g.id = picks.game_id and g.status = 'scheduled' and g.kickoff_at > now()
    )
    and (
      select count(*) from picks p2
      join games g2 on g2.id = p2.game_id
      where p2.user_id = auth.uid()
        and g2.week_id = (select week_id from games where id = picks.game_id)
    ) < (
      select l.picks_per_week from leagues l
      join weeks w on w.league_id = l.id
      join games g3 on g3.week_id = w.id
      where g3.id = picks.game_id
      limit 1
    )
  );

-- Members can never update or delete a pick -- "picks are final" is
-- enforced at the database level, not just hidden in the UI.
-- (No update/delete policy for role 'member' means it's denied by default.)

-- Commissioners can insert/update/delete ANY pick in their league, any time
-- -- this is what powers backfill and corrections. Always tagged so it's
-- auditable.
create policy "commissioners can write any pick in their league"
  on picks for all
  using (exists (
    select 1 from games g join weeks w on w.id = g.week_id
    where g.id = picks.game_id and is_commissioner(w.league_id)
  ))
  with check (
    source in ('commissioner_backfill', 'commissioner_correction')
    and exists (
      select 1 from games g join weeks w on w.id = g.week_id
      where g.id = picks.game_id and is_commissioner(w.league_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Convenience view: per-pick grade + points, computed the same way
-- regardless of whether the pick was live or backfilled.
-- win = 1pt, push = 0.5pt, loss = 0pt.
-- ─────────────────────────────────────────────────────────────────────────
create view graded_picks as
select
  p.*,
  g.week_id,
  g.status as game_status,
  case
    when g.status <> 'final' then null
    else (
      case when p.team = g.home_team
        then (g.home_score - g.away_score) + p.line
        else (g.away_score - g.home_score) + p.line
      end
    )
  end as margin,
  case
    when g.status <> 'final' then null
    when (case when p.team = g.home_team then (g.home_score - g.away_score) + p.line
               else (g.away_score - g.home_score) + p.line end) > 0 then 'win'
    when (case when p.team = g.home_team then (g.home_score - g.away_score) + p.line
               else (g.away_score - g.home_score) + p.line end) = 0 then 'push'
    else 'loss'
  end as grade,
  case
    when g.status <> 'final' then 0
    when (case when p.team = g.home_team then (g.home_score - g.away_score) + p.line
               else (g.away_score - g.home_score) + p.line end) > 0 then 1
    when (case when p.team = g.home_team then (g.home_score - g.away_score) + p.line
               else (g.away_score - g.home_score) + p.line end) = 0 then 0.5
    else 0
  end as points
from picks p
join games g on g.id = p.game_id;

-- season / week standings are just aggregates over graded_picks -- no
-- separate table to keep in sync:
--   select user_id, sum(points) from graded_picks group by user_id;
--   select user_id, sum(points) from graded_picks where week_id = ? group by user_id;
