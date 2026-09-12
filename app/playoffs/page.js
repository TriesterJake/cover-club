"use client";
import { useEffect, useState } from "react";
import { fetchJsonWithRetry } from "@/lib/fetchJson";
import Nav from "@/components/Nav";

// Simple Monte Carlo: models each person's weekly score as a normal draw
// around an estimated points-per-week rate, simulates the remaining
// regular-season weeks many times, and reports how often each person
// finishes top-4 (i.e. makes the 1-4 seed playoff picture). This is a
// heuristic, not a guarantee -- swap in a sharper model later (e.g.
// per-matchup win probabilities) once there's more season data to
// calibrate against.
//
// Each person's estimated rate is blended with a neutral "nobody's shown
// anything yet" baseline (0.5 points per pick, i.e. a coin flip), weighted
// by how many of their picks have actually been decided so far. With zero
// games decided, everyone blends to the exact same neutral rate -- so
// week 1 correctly shows everyone at roughly the same starting odds,
// rather than snapping to false 100%/0% certainty off a couple of
// early games.
function simulatePlayoffOdds(standings, weeksRemaining, trials = 3000) {
  if (weeksRemaining <= 0) {
    const sorted = [...standings].sort((a, b) => b.pts - a.pts);
    const result = {};
    sorted.forEach((s, i) => { result[s.user_id] = i < 4 ? 100 : 0; });
    return result;
  }

  const PRIOR_MEAN_PER_PICK = 0.5; // neutral expectation before any real data
  const PRIOR_WEIGHT = 25; // roughly 5 weeks' worth of picks before real performance dominates the estimate

  const meanPerWeek = {};
  standings.forEach((s) => {
    const blended = (s.pts + PRIOR_WEIGHT * PRIOR_MEAN_PER_PICK) / ((s.gamesDecided || 0) + PRIOR_WEIGHT);
    meanPerWeek[s.user_id] = blended * 5; // 5 picks per week
  });

  const madePlayoffs = Object.fromEntries(standings.map((s) => [s.user_id, 0]));
  for (let t = 0; t < trials; t++) {
    const projected = standings.map((s) => {
      let total = s.pts;
      for (let w = 0; w < weeksRemaining; w++) {
        const mean = meanPerWeek[s.user_id];
        const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 0.8; // roughly bell-shaped
        total += Math.max(0, mean + noise);
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

  const odds = simulatePlayoffOdds(standings, weeksRemaining);
  const bracketSeed = (n) => seeds.find((s) => s.playoff_seed === n)?.display_name || `Seed ${n}`;

  return (
    <>
      <Nav isCommissioner={isCommissioner} />
      <div className="cc-body">
        <div className="cc-weeklabel" style={{ display: "block", marginBottom: 10 }}>Format</div>
        <p className="cc-sub">Seeds 3 &amp; 4 face off pick&rsquo;em style through Wild Card round. The winner joins seeds 1 &amp; 2 (who get a bye) for the Divisional/Conference rounds. Whoever scores highest across those three takes the league.</p>

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