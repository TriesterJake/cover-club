import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: membership } = await admin
    .from("league_members")
    .select("league_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ userId: user.id, membership: null });

  const { data: week } = await admin
    .from("weeks")
    .select("*")
    .eq("league_id", membership.league_id)
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!week) return NextResponse.json({ userId: user.id, membership, week: null });

  const { data: games } = await admin
    .from("games")
    .select("*")
    .eq("week_id", week.id)
    .order("kickoff_at", { ascending: true });

  const gameIds = (games || []).map((g) => g.id);
  const { data: allPicks } = gameIds.length
    ? await admin.from("picks").select("*").in("game_id", gameIds)
    : { data: [] };

  // Enforce the hide-until-kickoff rule here in code, since we can't rely
  // on the database's own row-level checks right now: your own picks
  // always show; other people's only show once that specific game has
  // started or gone final.
  const now = new Date();
  const visiblePicks = (allPicks || []).filter((p) => {
    if (p.user_id === user.id) return true;
    const g = games.find((g) => g.id === p.game_id);
    return g && (g.status !== "scheduled" || new Date(g.kickoff_at) <= now);
  });

  const { data: leagueMembers } = await admin
    .from("league_members")
    .select("user_id, profiles(display_name)")
    .eq("league_id", membership.league_id);

  return NextResponse.json({
    userId: user.id,
    membership,
    week,
    games: games || [],
    picks: visiblePicks,
    members: (leagueMembers || []).map((m) => ({ user_id: m.user_id, display_name: m.profiles?.display_name })),
  });
}