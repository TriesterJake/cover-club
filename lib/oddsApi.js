// Pulls current NFL spreads from DraftKings via The Odds API
// (https://the-odds-api.com), free tier: no card required, ~500 credits/mo.
// A family-league volume (checked every 15-30 min, NFL spreads only, one
// region) comfortably fits inside the free tier.

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
      home_team: event.home_team,
      away_team: event.away_team,
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
export async function refreshOddsForWeek(supabaseAdmin, weekId) {
  const spreads = await fetchDraftKingsSpreads();
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
