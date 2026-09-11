import { supabaseAdmin } from "@/lib/supabaseServer";
import { refreshOddsForLeague } from "@/lib/oddsApi";
import { syncScheduleForLeague } from "@/lib/espnScores";
import { pickCurrentWeek } from "@/lib/currentWeek";

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: league } = await admin.from("leagues").select("id").limit(1).single();
  if (!league) return Response.json({ ok: false, reason: "no league found" });

  const { searchParams } = new URL(request.url);
  const fullSync = searchParams.get("full") === "true";

  // Regular runs only touch the current week -- looping every week on
  // every single scheduled run was slow enough to time out. Pass
  // ?full=true (e.g. right after setting up a new season, or if you
  // suspect an older/future week's games are stale) to sync everything.
  let weekIds = null;
  if (!fullSync) {
    const { data: allWeeks } = await admin.from("weeks").select("*").eq("league_id", league.id);
    const current = pickCurrentWeek(allWeeks || []);
    weekIds = current ? [current.id] : null;
  }

  const scheduleResults = await syncScheduleForLeague(admin, league.id, weekIds);
  const oddsResults = await refreshOddsForLeague(admin, league.id);

  return Response.json({ ok: true, league_id: league.id, fullSync, scheduleResults, oddsResults });
}