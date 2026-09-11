// Display-only mapping from abbreviation (what's actually stored/matched
// in the database) to the mascot name people actually recognize. Doesn't
// touch how games are matched/synced -- purely cosmetic.
const TEAM_NAME = {
  ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills",
  CAR: "Panthers", CHI: "Bears", CIN: "Bengals", CLE: "Browns",
  DAL: "Cowboys", DEN: "Broncos", DET: "Lions", GB: "Packers",
  HOU: "Texans", IND: "Colts", JAX: "Jaguars", KC: "Chiefs",
  LV: "Raiders", LAC: "Chargers", LAR: "Rams", MIA: "Dolphins",
  MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants",
  NYJ: "Jets", PHI: "Eagles", PIT: "Steelers", SF: "49ers",
  SEA: "Seahawks", TB: "Buccaneers", TEN: "Titans", WSH: "Commanders",
};

export function teamName(abbr) {
  return TEAM_NAME[abbr] || abbr;
}

// ESPN hosts team logos at a predictable, public URL -- lowercase
// abbreviation, same convention ESPN's own API already uses (which is
// where these abbreviations come from in the first place).
export function teamLogo(abbr) {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;
}