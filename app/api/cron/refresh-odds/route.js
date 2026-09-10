import { supabaseAdmin } from "@/lib/supabaseServer";
import { refreshOddsForLeague } from "@/lib/oddsApi";
import { syncScheduleForLeague } from "@/lib/espnScores";

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: league } = await admin.from("leagues").select("id").limit(1).single();
  if (!league) return Response.json({ ok: false, reason: "no league found" });

  // First, make sure every game for every week actually exists (from
  // ESPN's full schedule, regardless of betting-market status)...
  const scheduleResults = await syncScheduleForLeague(admin, league.id);
  // ...then layer DraftKings' current line on top for whichever games
  // are still upcoming.
  const oddsResults = await refreshOddsForLeague(admin, league.id);

  return Response.json({ ok: true, league_id: league.id, scheduleResults, oddsResults });
}