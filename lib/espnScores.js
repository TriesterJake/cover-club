// ESPN's public scoreboard endpoint. Unofficial/undocumented but free, no
// key, and the de facto standard for small hobby projects like this one.
// If ESPN ever changes this shape, this is the one file to fix.

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export async function fetchEspnScores() {
  const res = await fetch(ESPN_SCOREBOARD_URL);
  if (!res.ok) throw new Error(`ESPN scoreboard error: ${res.status}`);
  const data = await res.json();

  return (data.events || []).map((event) => {
    const competition = event.competitions[0];
    const home = competition.competitors.find((c) => c.homeAway === "home");
    const away = competition.competitors.find((c) => c.homeAway === "away");
    const statusType = competition.status.type.name; // e.g. STATUS_SCHEDULED / STATUS_IN_PROGRESS / STATUS_FINAL

    let status = "scheduled";
    if (statusType === "STATUS_IN_PROGRESS" || statusType === "STATUS_HALFTIME") status = "live";
    if (statusType === "STATUS_FINAL") status = "final";

    return {
      espn_event_id: event.id,
      home_team_abbr: home?.team?.abbreviation,
      away_team_abbr: away?.team?.abbreviation,
      home_score: home?.score ? Number(home.score) : null,
      away_score: away?.score ? Number(away.score) : null,
      status,
      live_clock: status === "live" ? `${competition.status.type.shortDetail}` : null,
    };
  });
}

// Updates games in a week whose team abbreviations match ESPN's feed.
// Only touches status/scores/clock -- never spreads or picks.
// Updates games across EVERY week for a league, matching by team
// abbreviation against ESPN's current scoreboard feed.
export async function refreshScoresForLeague(supabaseAdmin, leagueId) {
  const espnGames = await fetchEspnScores();
  const { data: weeks } = await supabaseAdmin.from("weeks").select("id").eq("league_id", leagueId);
  const weekIds = (weeks || []).map((w) => w.id);
  if (!weekIds.length) return [];

  const { data: games } = await supabaseAdmin
    .from("games")
    .select("id, home_team, away_team, status")
    .in("week_id", weekIds);

  const updates = [];
  for (const g of games || []) {
    const match = espnGames.find(
      (e) => e.home_team_abbr === g.home_team && e.away_team_abbr === g.away_team
    );
    if (!match) continue;
    await supabaseAdmin
      .from("games")
      .update({
        status: match.status,
        home_score: match.home_score,
        away_score: match.away_score,
        live_clock: match.live_clock,
        espn_event_id: match.espn_event_id,
      })
      .eq("id", g.id);
    updates.push({ game_id: g.id, ...match });
  }
  return updates;
}

// Legacy single-week version, kept in case it's useful for a league that
// hasn't set up dated weeks.
export async function refreshScoresForWeek(supabaseAdmin, weekId) {
  const espnGames = await fetchEspnScores();
  const { data: games } = await supabaseAdmin
    .from("games")
    .select("id, home_team, away_team, status")
    .eq("week_id", weekId);

  const updates = [];
  for (const g of games || []) {
    const match = espnGames.find(
      (e) => e.home_team_abbr === g.home_team && e.away_team_abbr === g.away_team
    );
    if (!match) continue;
    await supabaseAdmin
      .from("games")
      .update({
        status: match.status,
        home_score: match.home_score,
        away_score: match.away_score,
        live_clock: match.live_clock,
        espn_event_id: match.espn_event_id,
      })
      .eq("id", g.id);
    updates.push({ game_id: g.id, ...match });
  }
  return updates;
}