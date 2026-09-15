"use client";
import { useEffect, useState } from "react";
import { fetchJsonWithRetry } from "@/lib/fetchJson";
import Nav from "@/components/Nav";

// Monte Carlo simulation: projects everyone's remaining weeks forward many
// times and counts how often each person actually lands in the top 4,
// which is what makes this a genuine relative comparison against the real
// field in this league -- not a comparison against some fixed external
// bar that may not match how this particular season is playing out.
//
// There are two genuinely different kinds of uncertainty here, and both
// need to be modeled or this overreacts to early weeks:
//   1. Week-to-week luck -- even a known-skill person has good/bad weeks.
//   2. Uncertainty about someone's true skill itself -- with only a
//      little data, we don't actually know who's better yet, even after
//      blending toward the league's own current average. This second
//      kind is what was missing before: shrinking the *estimate* still
//      lets the simulation compound a small, fixed "known" edge into
//      near-certainty over many weeks. The fix is to redraw each
//      person's plausible skill level fresh in every trial (wider spread
//      early in the season, narrower once more real games are decided),
//      then simulate that trial's weekly luck around it.
const PRIOR_WEIGHT = 25; // roughly 5 weeks' worth of picks before someone's own results outweigh the group average

function bellNoise(sd) {
  // Sum of three uniforms is a cheap, dependency-free approximation of a
  // normal distribution; scaled here to have the given standard deviation.
  return (Math.random() + Math.random() + Math.random() - 1.5) * (sd / 0.5);
}

function estimatePlayoffOdds(standings, weeksRemaining, trials = 3000) {
  if (weeksRemaining <= 0) {
    const sorted = [...standings].sort((a, b) => b.pts - a.pts);
    const result = {};
    sorted.forEach((s, i) => { result[s.user_id] = i < 4 ? 100 : 0; });
    return result;
  }

  const totalPoints = standings.reduce((sum, s) => sum + s.pts, 0);
  const totalGames = standings.reduce((sum, s) => sum + (s.gamesDecided || 0), 0);
  const leagueAvgPerPick = totalGames > 0 ? totalPoints / totalGames : 0.5;

  const meanPerWeek = {};
  const skillUncertaintySD = {};
  standings.forEach((s) => {
    const n = (s.gamesDecided || 0) + PRIOR_WEIGHT;
    const blended = (s.pts + PRIOR_WEIGHT * leagueAvgPerPick) / n;
    meanPerWeek[s.user_id] = blended * 5; // 5 picks per week
    // How uncertain are we about this person's TRUE rate, not just this
    // week's luck? Shrinks as more of their real picks get decided.
    skillUncertaintySD[s.user_id] = Math.sqrt(0.25 / n) * 5;
  });

  const madePlayoffs = Object.fromEntries(standings.map((s) => [s.user_id, 0]));
  for (let t = 0; t < trials; t++) {
    const projected = standings.map((s) => {
      // Redraw this trial's plausible "true" skill level -- this is what
      // actually keeps early weeks humble, since in many trials a
      // currently-behind person's true skill draws out ahead anyway.
      const trueRate = meanPerWeek[s.user_id] + bellNoise(skillUncertaintySD[s.user_id]);
      let total = s.pts;
      for (let w = 0; w < weeksRemaining; w++) {
        total += Math.max(0, trueRate + bellNoise(0.8)); // this week's luck around that trial's skill level
      }
      return { user_id: s.user_id, total };
    });
    projected.sort((a, b) => b.total - a.total);
    projected.slice(0, 4).forEach((p) => { madePlayoffs[p.user_id]++; });
  }
  const pct = {};
  standings.forEach((s) => { pct[s.user_id] = Math.round((madePlayoffs[s.user_id] / trials) * 100); });
  return pct;
}

export default function PlayoffsPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [standings, setStandings] = useState([]);
  const [weeksPlayed, setWeeksPlayed] = useState(0);
  const [weeksRemaining, setWeeksRemaining] = useState(0);
  const [seeds, setSeeds] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchJsonWithRetry("/api/playoffs-data");
      setLoadError(false);
      setIsCommissioner(data.isCommissioner);
      setSeeds(data.seeds || []);
      setWeeksPlayed(data.weeksPlayed || 0);
      setWeeksRemaining(data.weeksRemaining || 0);
      setStandings(data.standings || []);
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (loading) return <><Nav isCommissioner={isCommissioner} /><div className="cc-body">Loading&hellip;</div></>;
  if (loadError) return (
    <>
      <Nav isCommissioner={isCommissioner} />
      <div className="cc-body">Couldn't load your data just now -- this is usually temporary. <button className="cc-namelink" onClick={load}>Try again</button></div>
    </>
  );

  const odds = estimatePlayoffOdds(standings, weeksRemaining);
  const bracketSeed = (n) => seeds.find((s) => s.playoff_seed === n)?.display_name || `Seed ${n}`;

  return (
    <>
      <Nav isCommissioner={isCommissioner} />
      <div className="cc-body">
        <div className="cc-weeklabel" style={{ display: "block", marginBottom: 10 }}>Format</div>
        <p className="cc-sub">Seeds 3 &amp; 4 face off pick&rsquo;em style through Wild Card round. The winner joins seeds 1 &amp; 2 (who get a bye) for the Divisional round. Whoever scores highest across those three takes the league.</p>

        {seeds.length > 0 && (
          <>
            <div className="cc-weeklabel" style={{ display: "block", margin: "20px 0 10px" }}>Bracket</div>
            <div className="cc-leaguepicks" style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "12px 16px" }}>
              <div className="cc-leaguepickrow"><span>Seed 1 (bye)</span><span>{bracketSeed(1)}</span></div>
              <div className="cc-leaguepickrow"><span>Seed 2 (bye)</span><span>{bracketSeed(2)}</span></div>
              <div className="cc-leaguepickrow"><span>Seed 3</span><span>{bracketSeed(3)}</span></div>
              <div className="cc-leaguepickrow"><span>Seed 4</span><span>{bracketSeed(4)}</span></div>
            </div>
          </>
        )}

        <div className="cc-weeklabel" style={{ display: "block", margin: "24px 0 4px" }}>Chance of making the playoffs</div>
        {weeksPlayed === 0 ? (
          <p className="cc-hiddennote" style={{ marginTop: 0 }}>
            Playoff odds will show up once the current week is fully wrapped up -- a single week in progress isn't
            enough real data to project from yet.
          </p>
        ) : (
          <>
            <p className="cc-hiddennote" style={{ marginTop: 0 }}>
              Simulated from each person's scoring rate so far, with {weeksRemaining} week{weeksRemaining === 1 ? "" : "s"} left in the regular season.
            </p>
            {[...standings].sort((a, b) => (odds[b.user_id] || 0) - (odds[a.user_id] || 0)).map((s) => (
              <div className="cc-oddsrow" key={s.user_id} style={{ marginBottom: 12 }}>
                <div className="cc-leaguepickrow"><span>{s.display_name}</span><span className="cc-num">{odds[s.user_id]}%</span></div>
                <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 3, height: 8, overflow: "hidden" }}>
                  <div style={{ background: "var(--accent)", height: "100%", width: `${odds[s.user_id]}%` }}></div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}