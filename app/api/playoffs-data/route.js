import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("league_members").select("league_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ isCommissioner: false, seeds: [], standings: [], weeksPlayed: 0, weeksRemaining: 0 });

  const { data: leagueMembers } = await admin
    .from("league_members").select("user_id, playoff_seed, profiles(display_name)").eq("league_id", membership.league_id);

  const seeds = (leagueMembers || [])
    .filter((m) => m.playoff_seed)
    .sort((a, b) => a.playoff_seed - b.playoff_seed)
    .map((m) => ({ playoff_seed: m.playoff_seed, display_name: m.profiles?.display_name }));

  const { data: leagueWeeks } = await admin
    .from("weeks").select("id, start_date, end_date").eq("league_id", membership.league_id).eq("type", "regular");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const weeksPlayed = (leagueWeeks || []).filter((w) => w.end_date && w.end_date < today).length;
  const weeksRemaining = Math.max(0, (leagueWeeks || []).length - weeksPlayed);

  const { data: graded } = await admin.from("graded_picks").select("user_id, points").eq("game_status", "final");
  const totals = {};
  (leagueMembers || []).forEach((m) => { totals[m.user_id] = 0; });
  (graded || []).forEach((g) => { totals[g.user_id] = (totals[g.user_id] || 0) + Number(g.points); });

  const standings = (leagueMembers || []).map((m) => ({
    user_id: m.user_id, display_name: m.profiles?.display_name, pts: totals[m.user_id] || 0,
  }));

  return NextResponse.json({ isCommissioner: membership.role === "commissioner", seeds, standings, weeksPlayed, weeksRemaining });
}