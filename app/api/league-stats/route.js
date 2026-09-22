// app/api/league-stats/route.js
//
// Public-to-the-league stats endpoint. Follows the same pattern as the
// other critical routes in this app (create-league, week-data, picks/submit):
// verify the caller with the cookie-based client (getUser() is unaffected
// by the Supabase ES256/RLS bug), then do the actual reads with the
// service-role admin client so we're not depending on RLS at all.
//
// IMPORTANT privacy rule carried over from the rest of the app: a pick is
// only visible to anyone other than the person who made it once that
// specific game has kicked off. This endpoint aggregates across the whole
// league, so it must never let a not-yet-kicked-off pick leak into any of
// the numbers below. We enforce that by only ever fetching games whose
// kickoff_at is in the past, and only ever fetching picks for those games.

import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";
import { teamStats, favoriteVsUnderdog, personStats } from "@/lib/stats";

export async function GET(request) {
  const supabase = supabaseServer();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  // Resolve the caller's league. This app is used as one league per person
  // in practice, so we take their first membership row (same approach used
  // by /api/league-info).
  const { data: membership, error: membershipError } = await admin
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "Not in a league" }, { status: 404 });
  }

  const leagueId = membership.league_id;
  const nowIso = new Date().toISOString();

  const { data: weeks, error: weeksError } = await admin
    .from("weeks")
    .select("id, week_number, label, type")
    .eq("league_id", leagueId);

  if (weeksError) {
    return NextResponse.json({ error: weeksError.message }, { status: 500 });
  }

  const weekIds = (weeks || []).map((w) => w.id);
  if (weekIds.length === 0) {
    return NextResponse.json({
      viewerUserId: user.id,
      weeks: [],
      people: [],
      teamStats: [],
      favoriteVsUnderdog: {},
      personStats: [],
    });
  }

  // Only games that have already kicked off — this is the privacy
  // boundary described above.
  const { data: games, error: gamesError } = await admin
    .from("games")
    .select(
      "id, week_id, home_team, away_team, kickoff_at, status, home_score, away_score, ref_spread_home"
    )
    .in("week_id", weekIds)
    .lte("kickoff_at", nowIso);

  if (gamesError) {
    return NextResponse.json({ error: gamesError.message }, { status: 500 });
  }

  const gameIds = (games || []).map((g) => g.id);
  let picks = [];
  if (gameIds.length > 0) {
    const { data: pickRows, error: picksError } = await admin
      .from("picks")
      .select("id, game_id, user_id, team, line")
      .in("game_id", gameIds);

    if (picksError) {
      return NextResponse.json({ error: picksError.message }, { status: 500 });
    }
    picks = pickRows || [];
  }

  const { data: members, error: membersError } = await admin
    .from("league_members")
    .select("user_id, profiles(display_name)")
    .eq("league_id", leagueId);

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  const people = (members || []).map((m) => ({
    user_id: m.user_id,
    display_name: m.profiles?.display_name || "Unknown",
  }));

  const weekById = Object.fromEntries(
    (weeks || []).map((w) => [w.id, w])
  );

  return NextResponse.json({
    viewerUserId: user.id,
    weeks: weeks || [],
    weekById,
    people,
    teamStats: teamStats(games || [], picks),
    favoriteVsUnderdog: favoriteVsUnderdog(games || [], picks),
    personStats: personStats(games || [], picks, people),
  });
}