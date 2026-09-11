// Same grading math as the prototype: works for ANY line, per person,
// independent of what line anyone else had on the same game.
export function fmtLine(n) {
  return (n > 0 ? "+" : "") + Number(n).toFixed(1);
}

export function gradePick(game, pick) {
  if (!pick || game.status !== "final") return null;
  const teamScore = pick.team === game.home_team ? game.home_score : game.away_score;
  const oppScore = pick.team === game.home_team ? game.away_score : game.home_score;
  const result = (teamScore - oppScore) + Number(pick.line);
  if (result > 0) return "win";
  if (result === 0) return "push";
  return "loss";
}

export function pointsFor(grade) {
  return grade === "win" ? 1 : grade === "push" ? 0.5 : 0;
}

// Separate from gradePick on purpose: this is just a live "currently
// covering" indicator while a game is in progress, and must never affect
// actual scoring/totals (which only ever count `final` games).
export function liveLean(game, pick) {
  if (!pick || game.status !== "live") return null;
  const teamScore = pick.team === game.home_team ? game.home_score : game.away_score;
  const oppScore = pick.team === game.home_team ? game.away_score : game.home_score;
  const result = (teamScore - oppScore) + Number(pick.line);
  if (result > 0) return "win";
  if (result === 0) return "push";
  return "loss";
}