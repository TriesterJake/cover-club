import { supabaseAdmin } from "@/lib/supabaseServer";
import { refreshScoresForLeague, syncScheduleForLeague } from "@/lib/espnScores";
import { pickCurrentWeek } from "@/lib/currentWeek";

// Vercel Hobby caps functions at 60s -- set explicitly rather than
// relying on the (much lower) default, as extra headroom.
export const maxDuration = 60;

// Each stage is wrapped so that one failure (ESPN hiccup, a database error)
// is reported in the response body and in Vercel's logs instead of crashing
// the whole request with a 500. A 500 is what makes cron-job.org count a
// failure and eventually disable the job; a temporary ESPN outage shouldn't
// do that. Open the job's history in cron-job.org to read the response body.
async function stage(name, fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    console.error(`refresh-scores: ${name} failed:`, e);
    return { ok: false, error: `${name}: ${e?.message || String(e)}` };
  }
}

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const errors = [];

  const adminStage = await stage("database connection", () => supabaseAdmin());
  if (!adminStage.ok) return Response.json({ ok: false, errors: [adminStage.error] });
  const admin = adminStage.value;

  const leagueStage = await stage("find league", async () => {
    const { data, error } = await admin.from("leagues").select("id").limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });
  if (!leagueStage.ok) return Response.json({ ok: false, errors: [leagueStage.error] });
  const league = leagueStage.value;
  if (!league) return Response.json({ ok: false, reason: "no league found" });

  // Schedule sync lives here (not in refresh-odds) since it's ESPN-based
  // like the score check, with no API-credit budget to worry about.
  let scheduleResults = { skipped: "no current week found" };
  const sched = await stage("schedule sync", async () => {
    const { data: allWeeks, error } = await admin.from("weeks").select("*").eq("league_id", league.id);
    if (error) throw new Error(error.message);
    const current = pickCurrentWeek(allWeeks || []);
    return current ? await syncScheduleForLeague(admin, league.id, [current.id]) : scheduleResults;
  });
  if (sched.ok) scheduleResults = sched.value; else errors.push(sched.error);

  let scoreResults = [];
  const scores = await stage("score refresh", () => refreshScoresForLeague(admin, league.id));
  if (scores.ok) scoreResults = scores.value; else errors.push(scores.error);

  return Response.json({ ok: errors.length === 0, league_id: league.id, errors, scheduleResults, scoreResults });
}