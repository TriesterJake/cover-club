// Picks "the current week" based on today's date falling inside a week's
// start_date/end_date range -- not just "whichever week has the highest
// number," which breaks the moment a commissioner pre-creates the whole
// season (every page would default to Week 18 forever).
export function todayEastern() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function pickCurrentWeek(weeks) {
  const today = todayEastern();
  const dated = weeks.filter((w) => w.start_date && w.end_date);

  const inRange = dated.find((w) => today >= w.start_date && today <= w.end_date);
  if (inRange) return inRange;

  // Between weeks, or no dates set on some: fall back to the most recent
  // week that has already started.
  const started = dated.filter((w) => w.start_date <= today).sort((a, b) => b.week_number - a.week_number);
  if (started.length) return started[0];

  // Season hasn't started yet, or no weeks have dates: earliest week.
  const byNumber = [...weeks].sort((a, b) => a.week_number - b.week_number);
  return byNumber[0] || null;
}