import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";
import { refreshOddsForLeague } from "@/lib/oddsApi";
import { syncScheduleForLeague } from "@/lib/espnScores";

// Manual "resync everything" for the commissioner -- syncs every week's
// schedule/scores from ESPN and layers DraftKings lines on top, instead
// of the routine cron's current-week-only default. Uses your own login
// (not the CRON_SECRET), so it's a one-click button rather than editing
// URLs. Uses one Odds API credit per click, same as any odds sync.
export async function POST() {
  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("league_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership || membership.role !== "commissioner") {
    return NextResponse.json({ error: "Only commissioners can do this" }, { status: 403 });
  }

  const scheduleResults = await syncScheduleForLeague(admin, membership.league_id); // no weekIds = every week
  const oddsResults = await refreshOddsForLeague(admin, membership.league_id);

  return NextResponse.json({ ok: true, scheduleCount: scheduleResults.length, oddsCount: oddsResults.length });
}