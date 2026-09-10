// Pulls current NFL spreads from DraftKings via The Odds API
// (https://the-odds-api.com), free tier: no card required, ~500 credits/mo.
// A family-league volume (checked every 15-30 min, NFL spreads only, one
// region) comfortably fits inside the free tier.

// The Odds API returns full team names ("Kansas City Chiefs"); ESPN and
// the rest of this app use standard abbreviations ("KC"). Normalizing
// here means every game, from either source, is stored and matched
// consistently.
const TEAM_ABBR = {
  "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR", "Chicago Bears": "CHI", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL", "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
  "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX", "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
  "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB", "Tennessee Titans": "TEN", "Washington Commanders": "WSH",
};
function toAbbr(fullName) { return TEAM_ABBR[fullName] || fullName; }

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

export async function fetchDraftKingsSpreads() {
  const url =
    `${ODDS_API_BASE}/sports/americanfootball_nfl/odds` +
    `?apiKey=${process.env.ODDS_API_KEY}` +
    `&regions=us&markets=spreads&bookmakers=draftkings&oddsFormat=american`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API error: ${res.status} ${await res.text()}`);
  const events = await res.json();

  // Normalize into { home_team, away_team, kickoff_at, ref_spread_home, espn_event_id? }
  return events.map((event) => {
    const dk = event.bookmakers?.find((b) => b.key === "draftkings");
    const spreadsMarket = dk?.markets?.find((m) => m.key === "spreads");
    const homeOutcome = spreadsMarket?.outcomes?.find((o) => o.name === event.home_team);
    return {
      home_team: toAbbr(event.home_team),
      away_team: toAbbr(event.away_team),
      kickoff_at: event.commence_time,
      ref_spread_home: homeOutcome ? homeOutcome.point : null,
      odds_api_event_id: event.id,
    };
  });
}

// Upserts fetched spreads into `games` for a given week. Only fills
// ref_spread_home for games that don't have one yet (a game's default
// display line shouldn't jump around after it's been created -- individual
// PICKS freeze their own line regardless, but we don't want the pick
// screen's suggested default flickering on every refresh).
// Refreshes odds for an entire league at once: fetches every upcoming
// DraftKings game, and for each one, finds the week whose start_date/
// end_date range contains its kickoff and inserts it there. Games that
// don't fall inside any known week's range are skipped -- the
// commissioner can always add those by hand if needed (e.g. before the
// season's weeks have been set up yet).
// NFL scheduling is conventionally thought of in US Eastern time, but
// kickoff timestamps come back in UTC -- a Monday 8:20pm ET game is
// already past midnight UTC (next calendar day), so comparing raw UTC
// dates against week boundaries can push late games into the wrong week.
// Convert to Eastern first.
function kickoffDateEastern(isoString) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(isoString));
}

export async function refreshOddsForLeague(supabaseAdmin, leagueId) {
  const spreads = await fetchDraftKingsSpreads();
  if (spreads.length === 0) return [];

  const { data: weeks } = await supabaseAdmin
    .from("weeks")
    .select("id, start_date, end_date")
    .eq("league_id", leagueId)
    .not("start_date", "is", null);

  const results = [];
  for (const s of spreads) {
    const kickoffDate = kickoffDateEastern(s.kickoff_at);
    const week = (weeks || []).find((w) => kickoffDate >= w.start_date && kickoffDate <= w.end_date);
    if (!week) { results.push({ ...s, action: "skipped (no matching week)" }); continue; }

    const { data: existingGames } = await supabaseAdmin
      .from("games")
      .select("id, home_team, away_team, ref_spread_home")
      .eq("week_id", week.id);

    const match = existingGames?.find((g) => g.home_team === s.home_team && g.away_team === s.away_team);
    if (match) {
      if (match.ref_spread_home === null && s.ref_spread_home !== null) {
        await supabaseAdmin.from("games").update({ ref_spread_home: s.ref_spread_home }).eq("id", match.id);
      }
      results.push({ ...s, action: "matched", week_id: week.id });
    } else {
      await supabaseAdmin.from("games").insert({
        week_id: week.id,
        home_team: s.home_team,
        away_team: s.away_team,
        kickoff_at: s.kickoff_at,
        ref_spread_home: s.ref_spread_home,
      });
      results.push({ ...s, action: "created", week_id: week.id });
    }
  }
  return results;
}

// Legacy single-week version, kept for leagues that haven't set up dated
// weeks yet -- clusters games into whatever week is passed in.
export async function refreshOddsForWeek(supabaseAdmin, weekId) {
  const allSpreads = await fetchDraftKingsSpreads();
  if (allSpreads.length === 0) return [];

  // The Odds API returns every future game it currently has lines for --
  // not just "this week's" games, since NFL weeks aren't a concept it
  // knows about. Keep only the nearest cluster (one NFL week typically
  // spans Thursday through Monday night, so a 6-day window from the
  // earliest upcoming kickoff safely captures just that slate).
  const sorted = [...allSpreads].sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
  const earliest = new Date(sorted[0].kickoff_at);
  const windowEnd = new Date(earliest.getTime() + 6 * 24 * 60 * 60 * 1000);
  const spreads = sorted.filter((s) => new Date(s.kickoff_at) <= windowEnd);

  const { data: existingGames } = await supabaseAdmin
    .from("games")
    .select("id, home_team, away_team, ref_spread_home")
    .eq("week_id", weekId);

  const results = [];
  for (const s of spreads) {
    const match = existingGames?.find(
      (g) => g.home_team === s.home_team && g.away_team === s.away_team
    );
    if (match) {
      if (match.ref_spread_home === null && s.ref_spread_home !== null) {
        await supabaseAdmin.from("games").update({ ref_spread_home: s.ref_spread_home }).eq("id", match.id);
      }
      results.push({ ...s, action: "matched" });
    } else {
      await supabaseAdmin.from("games").insert({
        week_id: weekId,
        home_team: s.home_team,
        away_team: s.away_team,
        kickoff_at: s.kickoff_at,
        ref_spread_home: s.ref_spread_home,
      });
      results.push({ ...s, action: "created" });
    }
  }
  return results;
}