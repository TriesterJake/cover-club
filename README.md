# The Cover Club

Real, deployable version of the family pick'em app we prototyped. Free-tier
hosting throughout: Supabase (database + auth) and Vercel (the website
itself).

## 1. Create the database (Supabase)

1. Go to supabase.com, create a free account and a new project.
2. Open **SQL Editor** and run `supabase/migrations/0001_init.sql`, then
   run `supabase/migrations/0002_league_management.sql` right after it.
   Together they create every table, the visibility rules, the grading
   view, and self-serve league creation/membership/deletion.
3. Go to **Authentication -> Providers** and make sure **Email** is
   enabled. You don't need to touch **URL Configuration** yet -- you'll
   come back and set your real site URL once it's deployed (step 3).
4. Go to **Project Settings -> API**. You'll need three values in a
   minute: the **Project URL**, the **anon public** key, and the
   **service_role** key (keep this last one secret -- never put it in
   anything that reaches the browser).

## 2. Get an odds API key

1. Go to the-odds-api.com and sign up for the free tier (no card needed).
2. Copy your API key from the dashboard.

## 3. Deploy the website (Vercel)

1. Push this folder to a GitHub repo.
2. Go to vercel.com, sign in, "Add New Project", import that repo.
3. In the project's **Environment Variables**, add everything from
   `.env.example` using your real values from steps 1-2.
4. Deploy. You'll get a real URL like `cover-club.vercel.app` (or attach
   your own domain later, e.g. `pickem.yourfamily.com`).
5. Back in Supabase, under **Authentication -> URL Configuration**, set
   the Site URL to that Vercel URL so magic-link emails redirect correctly.

## 4. Create your league and add people

1. Visit your new site and sign in with your email (magic link).
2. Since you have no league yet, you'll land on **Create your league** --
   fill in a name and season year. You become commissioner automatically.
3. In **Commissioner Tools**, use **Add member** to add family by email --
   they just need to have visited the site and signed in once first (so
   they exist in the system), then you can add them by typing their email.
4. Want to wipe a test league before going live? **Commissioner Tools ->
   Danger zone -> Delete this league** -- removes every week/game/pick in
   it and can't be undone. Handy for exactly your situation: try it out
   solo this weekend, delete it, then create the real one and add everyone
   next week (or just keep the same league and add people to it -- either
   works).

## 5. Keep odds and scores updating automatically

`vercel.json` schedules two routes to run on their own:
- `/api/cron/refresh-odds` -- pulls current DraftKings spreads every 30 min
- `/api/cron/refresh-scores` -- pulls live scores every 5 min

**Heads up:** Vercel's free Hobby plan has historically limited cron jobs
to once a day (Pro removes that limit). Check your plan's current cron
limits when you deploy -- Vercel changes this occasionally. If Hobby won't
run these often enough for live game-day updates, a free workaround is an
external pinger like cron-job.org hitting those same URLs on whatever
schedule you want (they just need the `Authorization: Bearer <CRON_SECRET>`
header).

## 6. Weekly commissioner routine

- Before the week opens: as commissioner, sign in and either let the odds
  cron auto-create that week's games, or add them by hand in
  **Commissioner Tools**.
- Once everyone starts using the site mid-season, use **Commissioner
  Tools -> [old week] -> Add game** (mark status "Final", enter the score)
  and then fill in each person's pick + their own line from your old
  screenshots. It counts toward season totals immediately.
- If a live pick ever needs correcting, the same tool works on the current
  week too.

## What's simplified for v1 (safe to improve later)

- **One league per person** -- pages assume each signed-in person belongs
  to exactly one league. Fine for everyone in one family league; would
  need a league-switcher if someone's ever in more than one.
- **Add-by-email requires a prior sign-in** -- there's no email-invite
  system yet (nothing gets sent automatically). The person has to visit
  the site and sign in once before a commissioner can add them. Fine for
  "hey, go sign into this link" over text, less fine at real scale.
- **Playoff odds** are a lightweight Monte Carlo based on each person's
  scoring rate so far -- reasonable, not fancy. Easy to swap for a sharper
  model later.
- **Week/game creation** in Commissioner Tools is manual for the live week
  too, unless you rely on the odds cron to auto-create games from the
  current NFL slate.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your real values
npm run dev
```
