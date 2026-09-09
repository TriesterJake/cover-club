"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { fmtLine, gradePick, pointsFor } from "@/lib/grading";
import Nav from "@/components/Nav";

export default function ScoreboardPage() {
  const supabase = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [leagueId, setLeagueId] = useState(null);
  const [weeks, setWeeks] = useState([]);
  const [scope, setScope] = useState(null); // week id, or "season"
  const [members, setMembers] = useState([]);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);          // for the selected week
  const [seasonPoints, setSeasonPoints] = useState({}); // user_id -> total points across all weeks

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase.from("league_members").select("league_id, role").eq("user_id", user.id).limit(1).single();
      if (!membership) { setLoading(false); return; }
      setIsCommissioner(membership.role === "commissioner");
      setLeagueId(membership.league_id);

      const { data: leagueWeeks } = await supabase.from("weeks").select("*").eq("league_id", membership.league_id).order("week_number");
      setWeeks(leagueWeeks || []);
      setScope(leagueWeeks?.[leagueWeeks.length - 1]?.id || "season");

      const { data: leagueMembers } = await supabase.from("league_members").select("user_id, profiles(display_name)").eq("league_id", membership.league_id);
      setMembers((leagueMembers || []).map((m) => ({ user_id: m.user_id, display_name: m.profiles?.display_name })));

      // Season totals: pull every graded pick across every week and sum client-side.
      const { data: graded } = await supabase.from("graded_picks").select("user_id, points").eq("game_status", "final");
      const totals = {};
      (graded || []).forEach((g) => { totals[g.user_id] = (totals[g.user_id] || 0) + Number(g.points); });
      setSeasonPoints(totals);

      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!scope || scope === "season") return;
    (async () => {
      const { data: weekGames } = await supabase.from("games").select("*").eq("week_id", scope).order("kickoff_at");
      setGames(weekGames || []);
      const gameIds = (weekGames || []).map((g) => g.id);
      const { data: visiblePicks } = gameIds.length ? await supabase.from("picks").select("*").in("game_id", gameIds) : { data: [] };
      setPicks(visiblePicks || []);
    })();
  }, [scope]);

  if (loading) return <><Nav isCommissioner={isCommissioner} /><div className="cc-body">Loading&hellip;</div></>;

  const nameFor = (uid, myId) => (uid === myId ? "You" : members.find((m) => m.user_id === uid)?.display_name || "Someone");

  return (
    <>
      <Nav isCommissioner={isCommissioner} />
      <div className="cc-body">
        <div className="cc-scopetoggle">
          {weeks.map((w) => (
            <button key={w.id} className={"cc-scopebtn" + (scope === w.id ? " active" : "")} onClick={() => setScope(w.id)}>{w.label}</button>
          ))}
          <button className={"cc-scopebtn" + (scope === "season" ? " active" : "")} onClick={() => setScope("season")}>Season</button>
        </div>

        {scope === "season" ? (
          <table className="cc-simpletable">
            <thead><tr><th>Rank</th><th>Name</th><th style={{ textAlign: "right" }}>Points</th></tr></thead>
            <tbody>
              {members
                .map((m) => ({ ...m, pts: seasonPoints[m.user_id] || 0 }))
                .sort((a, b) => b.pts - a.pts)
                .map((m, i) => (
                  <tr key={m.user_id}>
                    <td className="cc-num">{i + 1}</td>
                    <td>{m.display_name}</td>
                    <td className="cc-num" style={{ textAlign: "right" }}>{m.pts.toFixed(1)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <ScoreboardGrid games={games} picks={picks} members={members} nameFor={nameFor} />
        )}
      </div>
    </>
  );
}

function ScoreboardGrid({ games, picks, members }) {
  const [myId, setMyId] = useState(null);
  useEffect(() => { supabaseBrowser().auth.getUser().then(({ data }) => setMyId(data.user?.id)); }, []);

  const pickFor = (userId, gameId) => picks.find((p) => p.user_id === userId && p.game_id === gameId);
  const totalFor = (userId) => games.reduce((sum, g) => {
    const p = pickFor(userId, g.id);
    return sum + pointsFor(gradePick(g, p));
  }, 0);

  return (
    <div className="cc-gridwrap">
      <table className="cc-grid">
        <thead><tr><th>Name</th><th>Pick 1</th><th>Pick 2</th><th>Pick 3</th><th>Pick 4</th><th>Pick 5</th><th>Total</th></tr></thead>
        <tbody>
          {members.map((m) => {
            const mine = m.user_id === myId;
            const theirPicks = games.filter((g) => pickFor(m.user_id, g.id));
            const cells = [];
            for (let i = 0; i < 5; i++) {
              const g = theirPicks[i];
              if (!g) { cells.push(<td key={i}><span className="cc-cell open">—</span></td>); continue; }
              const p = pickFor(m.user_id, g.id);
              const kickoffPassed = new Date(g.kickoff_at) <= new Date();
              const visible = mine || g.status !== "scheduled" || kickoffPassed;
              if (!visible) { cells.push(<td key={i}><span className="cc-cell hidden">🔒</span></td>); continue; }
              const label = <span className="cc-num">{p.team} {fmtLine(p.line)}</span>;
              const cls = g.status === "final" ? gradePick(g, p) : g.status === "live" ? "live" : "own-upcoming";
              cells.push(<td key={i}><span className={"cc-cell " + cls}>{label}</span></td>);
            }
            return (
              <tr key={m.user_id} className={mine ? "you" : ""}>
                <td className="name-cell">{mine ? "You" : m.display_name}</td>
                {cells}
                <td className="cc-num" style={{ textAlign: "right" }}>{totalFor(m.user_id).toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
