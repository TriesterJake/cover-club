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

// Fetches with a hard timeout so a slow third-party API fails fast with a
// clear error, instead of silently eating the whole request's time budget
// and causing the cron job itself to time out with no useful error at all.
export async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`Request to ${url} timed out after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const SHARPAPI_BASE = "https://api.sharpapi.io/api/v1";

// Switched from The Odds API to SharpAPI: same idea (free tier, real
// DraftKings sportsbook odds, no scraping), but a much larger free
// request budget (12/min = ~17,280/day, vs ~16/day before) and an
// explicitly documented 60-second data delay on the free tier -- tighter
// than what we were effectively getting before. Requires a free API key
// from sharpapi.io, set as SHARPAPI_KEY.
export async function fetchDraftKingsSpreads() {
  const url =
    `${SHARPAPI_BASE}/odds?league=nfl&sportsbook=draftkings&market=point_spread&limit=200`;

  const res = await fetchWithTimeout(url, { headers: { "X-API-Key": process.env.SHARPAPI_KEY } });
  if (!res.ok) throw new Error(`SharpAPI error: ${res.status} ${await res.text()}`);
  const { data } = await res.json();

  // The API returns one row per (event, selection) -- two rows per game
  // (home side and away side of the same spread market), not one row
  // per game. We only need the home-team row; the away side is always
  // its exact mirror for a standard point spread.
  //
  // We deliberately do NOT filter to is_main_line=true here: a price
  // that's actively moving briefly sits "not yet classified" as either
  // main or alternate, and requiring confirmed-main status was excluding
  // exactly the freshest numbers right when a line was changing -- which
  // is exactly when accuracy matters most. We only exclude CONFIRMED
  // alternate lines, and when more than one candidate remains for the
  // same game, keep whichever has the most recent timestamp.
  const byEvent = {};
  for (const row of data || []) {
    if (row.selection_type !== "home") continue;
    if (row.is_alternate_line === true) continue;
    const existing = byEvent[row.event_id];
    if (existing && new Date(existing.timestamp) >= new Date(row.timestamp)) continue;

    const homeAbbr = row.home?.abbreviation || toAbbr(row.home_team);
    const awayAbbr = row.away?.abbreviation || toAbbr(row.away_team);
    byEvent[row.event_id] = {
      home_team: homeAbbr,
      away_team: awayAbbr,
      kickoff_at: row.event_start_time,
      ref_spread_home: row.line,
      odds_api_event_id: row.event_id,
      timestamp: row.timestamp,
    };
  }
  return Object.values(byEvent);
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

  const existingByWeek = {}; // cache so we don't re-query the same week repeatedly
  const getExisting = async (weekId) => {
    if (!existingByWeek[weekId]) {
      const { data } = await supabaseAdmin
        .from("games").select("id, home_team, away_team, ref_spread_home").eq("week_id", weekId);
      existingByWeek[weekId] = data || [];
    }
    return existingByWeek[weekId];
  };

  const results = await Promise.all(spreads.map(async (s) => {
    const kickoffDate = kickoffDateEastern(s.kickoff_at);
    const week = (weeks || []).find((w) => kickoffDate >= w.start_date && kickoffDate <= w.end_date);
    if (!week) return { ...s, action: "skipped (no matching week)" };

    const existingGames = await getExisting(week.id);
    const match = existingGames.find((g) => g.home_team === s.home_team && g.away_team === s.away_team);
    if (match) {
      // Always refresh the displayed line to match DraftKings' current
      // value (this was previously only ever set once -- which is why
      // it could drift from the real line the longer it had been since
      // the game was first synced). Already-locked picks are completely
      // unaffected either way, since each pick permanently freezes its
      // own line at the moment it's submitted.
      if (s.ref_spread_home !== null && s.ref_spread_home !== match.ref_spread_home) {
        await supabaseAdmin.from("games").update({ ref_spread_home: s.ref_spread_home }).eq("id", match.id);
      }
      return { ...s, action: "matched", week_id: week.id };
    } else {
      await supabaseAdmin.from("games").insert({
        week_id: week.id,
        home_team: s.home_team,
        away_team: s.away_team,
        kickoff_at: s.kickoff_at,
        ref_spread_home: s.ref_spread_home,
      });
      return { ...s, action: "created", week_id: week.id };
    }
  }));
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
      if (s.ref_spread_home !== null && s.ref_spread_home !== match.ref_spread_home) {
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