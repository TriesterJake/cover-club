// ESPN's public scoreboard endpoint. Unofficial/undocumented but free, no
// key, and the de facto standard for small hobby projects like this one.
// If ESPN ever changes this shape, this is the one file to fix.

// Pulls the FULL schedule for a given NFL week directly from ESPN --
// unlike the odds feed, this lists every game regardless of whether a
// sportsbook still has a live market on it, so games that already
// started or finished still show up here. No spreads in this data, just
// matchup/kickoff/status/score -- refreshOddsForLeague layers the
// DraftKings line on top afterward for whichever games are still
// upcoming.
export async function fetchEspnWeekSchedule(year, week, seasontype = 2) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?year=${year}&seasontype=${seasontype}&week=${week}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN schedule error: ${res.status}`);
  const data = await res.json();

  return (data.events || []).map((event) => {
    const competition = event.competitions[0];
    const home = competition.competitors.find((c) => c.homeAway === "home");
    const away = competition.competitors.find((c) => c.homeAway === "away");
    const statusType = competition.status.type.name;
    let status = "scheduled";
    if (statusType === "STATUS_IN_PROGRESS" || statusType === "STATUS_HALFTIME") status = "live";
    if (statusType === "STATUS_FINAL") status = "final";
    return {
      espn_event_id: event.id,
      home_team: home?.team?.abbreviation,
      away_team: away?.team?.abbreviation,
      kickoff_at: event.date,
      status,
      home_score: home?.score ? Number(home.score) : null,
      away_score: away?.score ? Number(away.score) : null,
      live_clock: status === "live" ? competition.status.type.shortDetail : null,
    };
  });
}

// Ensures every game for every regular-season week of a league exists in
// the database, with whatever status/score ESPN currently shows --
// including games that already happened, which the odds feed alone can
// never create since it only lists upcoming games.
export async function syncScheduleForLeague(supabaseAdmin, leagueId, weekIds = null) {
  const { data: league } = await supabaseAdmin.from("leagues").select("season_year").eq("id", leagueId).single();
  const year = parseInt((league?.season_year || "").slice(0, 4)) || new Date().getFullYear();

  let weeksQuery = supabaseAdmin
    .from("weeks").select("id, week_number, type").eq("league_id", leagueId)
    .in("type", ["regular", "playoff_r1", "playoff_r2"]);
  if (weekIds) weeksQuery = weeksQuery.in("id", weekIds);
  const { data: weeks } = await weeksQuery;

  const results = [];
  for (const week of weeks || []) {
    // ESPN's postseason numbering: seasontype=3, week=1 is Wild Card,
    // week=2 is Divisional -- our two playoff round types map directly.
    const seasontype = week.type === "regular" ? 2 : 3;
    const espnWeek = week.type === "playoff_r1" ? 1 : week.type === "playoff_r2" ? 2 : week.week_number;

    let scheduleGames;
    try {
      scheduleGames = await fetchEspnWeekSchedule(year, espnWeek, seasontype);
    } catch (e) {
      results.push({ week_number: week.week_number, type: week.type, error: e.message });
      continue;
    }

    const { data: existingGames } = await supabaseAdmin
      .from("games").select("id, home_team, away_team").eq("week_id", week.id);

    // Writes happen in parallel rather than one at a time -- looping
    // every week sequentially with one-by-one writes is what caused
    // this to time out in the first place.
    await Promise.all(scheduleGames.map(async (g) => {
      const match = existingGames?.find((eg) => eg.home_team === g.home_team && eg.away_team === g.away_team);
      if (match) {
        await supabaseAdmin.from("games").update({
          status: g.status, home_score: g.home_score, away_score: g.away_score,
          live_clock: g.live_clock, espn_event_id: g.espn_event_id, kickoff_at: g.kickoff_at,
        }).eq("id", match.id);
        results.push({ week_number: week.week_number, ...g, action: "updated" });
      } else {
        await supabaseAdmin.from("games").insert({
          week_id: week.id, home_team: g.home_team, away_team: g.away_team,
          kickoff_at: g.kickoff_at, status: g.status,
          home_score: g.home_score, away_score: g.away_score,
          live_clock: g.live_clock, espn_event_id: g.espn_event_id,
        });
        results.push({ week_number: week.week_number, ...g, action: "created" });
      }
    }));
  }
  return results;
}

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