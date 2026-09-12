import { supabaseAdmin } from "@/lib/supabaseServer";
import { refreshScoresForLeague, syncScheduleForLeague } from "@/lib/espnScores";
import { pickCurrentWeek } from "@/lib/currentWeek";

// Vercel Hobby caps functions at 60s -- set explicitly rather than
// relying on the (much lower) default, as extra headroom.
export const maxDuration = 60;

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: league } = await admin.from("leagues").select("id").limit(1).single();
  if (!league) return Response.json({ ok: false, reason: "no league found" });

  // Schedule sync lives here (not in refresh-odds) since it's ESPN-based
  // like the score check, with no API-credit budget to worry about --
  // splitting the two jobs' work in half is also what keeps each request
  // comfortably fast.
  const { data: allWeeks } = await admin.from("weeks").select("*").eq("league_id", league.id);
  const current = pickCurrentWeek(allWeeks || []);
  let scheduleResults = { skipped: "no current week found" };
  if (current) {
    scheduleResults = await syncScheduleForLeague(admin, league.id, [current.id]);
  }

  const scoreResults = await refreshScoresForLeague(admin, league.id);
  return Response.json({ ok: true, league_id: league.id, scheduleResults, scoreResults });
}