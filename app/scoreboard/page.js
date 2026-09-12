"use client";
import { useEffect, useState } from "react";
import { fmtLine, gradePick, pointsFor } from "@/lib/grading";
import { teamName, teamLogo } from "@/lib/teamNames";
import { pickCurrentWeek } from "@/lib/currentWeek";
import Nav from "@/components/Nav";

export default function ScoreboardPage() {
  const [loading, setLoading] = useState(true);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [myId, setMyId] = useState(null);
  const [weeks, setWeeks] = useState([]);
  const [scope, setScope] = useState(null); // week id, or "season"
  const [members, setMembers] = useState([]);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);
  const [seasonPoints, setSeasonPoints] = useState({});

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/league-weeks");
      const data = await res.json();
      setWeeks(data.weeks || []);
      setScope(pickCurrentWeek(data.weeks || [])?.id || "season");
    })();
  }, []);

  useEffect(() => {
    if (!scope) return;
    (async () => {
      setLoading(true);
      if (scope === "season") {
        const res = await fetch("/api/season-totals");
        const data = await res.json();
        setMyId(data.userId);
        setIsCommissioner(data.isCommissioner);
        setMembers(data.members || []);
        setSeasonPoints(data.totals || {});
      } else {
        const res = await fetch(`/api/week-data?weekId=${scope}`);
        const data = await res.json();
        setMyId(data.userId);
        setIsCommissioner(data.membership?.role === "commissioner");
        setGames(data.games || []);
        setPicks(data.picks || []);
        setMembers(data.members || []);
      }
      setLoading(false);
    })();
  }, [scope]);

  if (loading) return <><Nav isCommissioner={isCommissioner} /><div className="cc-body">Loading&hellip;</div></>;

  const pickFor = (userId, gameId) => picks.find((p) => p.user_id === userId && p.game_id === gameId);
  const totalFor = (userId) => games.reduce((sum, g) => sum + pointsFor(gradePick(g, pickFor(userId, g.id))), 0);

  return (
    <>
      <Nav isCommissioner={isCommissioner} />
      <div className="cc-body">
        <button className={"cc-seasonbtn" + (scope === "season" ? " active" : "")} onClick={() => setScope("season")}>
          🏆 Season Standings
        </button>
        <div className="cc-scopetoggle">
          {weeks.map((w) => (
            <button key={w.id} className={"cc-scopebtn" + (scope === w.id ? " active" : "")} onClick={() => setScope(w.id)}>{w.label}</button>
          ))}
        </div>

        {scope === "season" ? (
          <table className="cc-simpletable">
            <thead><tr><th>Rank</th><th>Name</th><th style={{ textAlign: "right" }}>Points</th></tr></thead>
            <tbody>
              {members
                .map((m) => ({ ...m, pts: seasonPoints[m.user_id] || 0 }))
                .sort((a, b) => b.pts - a.pts)
                .map((m, i) => (
                  <tr key={m.user_id} className={m.user_id === myId ? "you" : ""}>
                    <td className="cc-num">{i + 1}</td>
                    <td>{m.user_id === myId ? "You" : m.display_name}</td>
                    <td className="cc-num" style={{ textAlign: "right" }}>{m.pts.toFixed(1)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
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
                    const label = <span className="cc-num"><img src={teamLogo(p.team)} alt="" className="cc-logo-sm" />{teamName(p.team)} {fmtLine(p.line)}</span>;
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
        )}
      </div>
    </>
  );
}