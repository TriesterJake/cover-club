"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { todayEastern } from "@/lib/currentWeek";
import Nav from "@/components/Nav";

// Simple Monte Carlo: models each person's weekly score as a normal draw
// around their season-average points-per-week (5 picks -> mean around
// 2.0-3.0 typically), simulates the remaining regular-season weeks many
// times, and reports how often each person finishes top-4 (i.e. makes
// the 1-4 seed playoff picture). This is a heuristic, not a guarantee --
// swap in a sharper model later (e.g. per-matchup win probabilities) once
// there's more season data to calibrate against.
function simulatePlayoffOdds(standings, weeksRemaining, weeksPlayed, trials = 3000) {
  if (weeksPlayed === 0 || weeksRemaining <= 0) {
    const sorted = [...standings].sort((a, b) => b.pts - a.pts);
    const result = {};
    sorted.forEach((s, i) => { result[s.user_id] = i < 4 ? 100 : 0; });
    return result;
  }
  const meanPerWeek = Object.fromEntries(standings.map((s) => [s.user_id, s.pts / weeksPlayed]));
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
  const supabase = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [standings, setStandings] = useState([]);
  const [weeksPlayed, setWeeksPlayed] = useState(0);
  const [weeksRemaining, setWeeksRemaining] = useState(0);
  const [seeds, setSeeds] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase.from("league_members").select("league_id, role, playoff_seed").eq("user_id", user.id).limit(1).single();
      if (!membership) { setLoading(false); return; }
      setIsCommissioner(membership.role === "commissioner");

      const { data: leagueMembers } = await supabase.from("league_members").select("user_id, playoff_seed, profiles(display_name)").eq("league_id", membership.league_id).order("playoff_seed");
      setSeeds((leagueMembers || []).filter((m) => m.playoff_seed).sort((a, b) => a.playoff_seed - b.playoff_seed));

      const { data: leagueWeeks } = await supabase.from("weeks").select("id, start_date, end_date").eq("league_id", membership.league_id).eq("type", "regular");
      const today = todayEastern();
      const played = (leagueWeeks || []).filter((w) => w.end_date && w.end_date < today).length;
      setWeeksPlayed(played);
      setWeeksRemaining(Math.max(0, (leagueWeeks || []).length - played));

      const { data: graded } = await supabase.from("graded_picks").select("user_id, points").eq("game_status", "final");
      const totals = {};
      (leagueMembers || []).forEach((m) => { totals[m.user_id] = 0; });
      (graded || []).forEach((g) => { totals[g.user_id] = (totals[g.user_id] || 0) + Number(g.points); });
      setStandings((leagueMembers || []).map((m) => ({ user_id: m.user_id, display_name: m.profiles?.display_name, pts: totals[m.user_id] || 0 })));

      setLoading(false);
    })();
  }, []);

  if (loading) return <><Nav isCommissioner={isCommissioner} /><div className="cc-body">Loading&hellip;</div></>;

  const odds = simulatePlayoffOdds(standings, weeksRemaining, weeksPlayed || 1);
  const bracketSeed = (n) => seeds.find((s) => s.playoff_seed === n)?.profiles?.display_name || `Seed ${n}`;

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
      </div>
    </>
  );
}