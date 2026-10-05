import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(request) {
  const { gameId, team, line: clientLine } = await request.json();

  const supabase = supabaseServer();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: game } = await admin.from("games").select("*").eq("id", gameId).single();
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.status !== "scheduled" || new Date(game.kickoff_at) <= new Date()) {
    return NextResponse.json({ error: "This game has already started -- picks lock at kickoff." }, { status: 400 });
  }

  // The team must actually be playing in this game.
  if (team !== game.home_team && team !== game.away_team) {
    return NextResponse.json({ error: "That team isn't in this game." }, { status: 400 });
  }

  // The line is decided by the server, never by the browser: it's the
  // game's current line, from the picked team's side. If the line has moved
  // since the page was loaded, reject instead of silently locking in a
  // different number than the person confirmed -- the page reloads so they
  // can see the new line and decide again.
  if (game.ref_spread_home === null || game.ref_spread_home === undefined) {
    return NextResponse.json({ error: "There's no line posted for this game yet." }, { status: 400 });
  }
  const homeLine = Number(game.ref_spread_home);
  const line = team === game.home_team ? homeLine : -homeLine;
  if (Number(clientLine) !== line) {
    const shown = (line > 0 ? "+" : "") + line.toFixed(1);
    return NextResponse.json(
      { error: `The line just changed -- it's now ${team} ${shown}. Your page has been refreshed; pick again if you still want it.`, lineChanged: true },
      { status: 409 }
    );
  }

  const { data: existingOnThisGame } = await admin
    .from("picks").select("id").eq("game_id", gameId).eq("user_id", user.id).maybeSingle();
  if (existingOnThisGame) {
    return NextResponse.json({ error: "You already picked this game -- picks are final." }, { status: 400 });
  }

  const { data: league } = await admin.from("leagues").select("picks_per_week").eq(
    "id", (await admin.from("weeks").select("league_id").eq("id", game.week_id).single()).data.league_id
  ).single();

  const { data: weekGames } = await admin.from("games").select("id").eq("week_id", game.week_id);
  const weekGameIds = (weekGames || []).map((g) => g.id);
  const { count: picksThisWeek } = await admin
    .from("picks").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).in("game_id", weekGameIds);

  if ((picksThisWeek || 0) >= (league?.picks_per_week ?? 5)) {
    return NextResponse.json({ error: `You've already used all ${league?.picks_per_week ?? 5} picks this week.` }, { status: 400 });
  }

  const { error: insertErr } = await admin.from("picks").insert({
    game_id: gameId, user_id: user.id, team, line, source: "member_submitted",
  });
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}