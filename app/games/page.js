"use client";
import { useEffect, useState } from "react";
import { fmtLine, gradePick, liveLean } from "@/lib/grading";
import { pickCurrentWeek } from "@/lib/currentWeek";
import Nav from "@/components/Nav";

export default function GamesPage() {
  const [loading, setLoading] = useState(true);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [myId, setMyId] = useState(null);
  const [weeks, setWeeks] = useState([]);
  const [scope, setScope] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/league-weeks");
      const data = await res.json();
      setWeeks(data.weeks || []);
      setScope(pickCurrentWeek(data.weeks || [])?.id || null);
    })();
  }, []);

  useEffect(() => {
    if (!scope) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/week-data?weekId=${scope}`);
      const data = await res.json();
      setMyId(data.userId);
      setIsCommissioner(data.membership?.role === "commissioner");
      setGames(data.games || []);
      setPicks(data.picks || []);
      setMembers(data.members || []);
      setLoading(false);
    })();
  }, [scope]);

  if (loading) return <><Nav isCommissioner={isCommissioner} /><div className="cc-body">Loading&hellip;</div></>;

  const nameFor = (uid) => (uid === myId ? "You" : members.find((m) => m.user_id === uid)?.display_name || "Someone");

  return (
    <>
      <Nav isCommissioner={isCommissioner} />
      <div className="cc-body">
        <div className="cc-weeklabel" style={{ marginBottom: 4, display: "block" }}>Browse every game and see who picked it</div>
        <div className="cc-scopetoggle" style={{ marginTop: 10 }}>
          {weeks.map((w) => <button key={w.id} className={"cc-scopebtn" + (scope === w.id ? " active" : "")} onClick={() => setScope(w.id)}>{w.label}</button>)}
        </div>
        {games.length === 0 && <div className="cc-hiddennote">No games in this week yet.</div>}
        {games.map((g) => {
          const entries = picks.filter((p) => p.game_id === g.id);
          const kickoffPassed = new Date(g.kickoff_at) <= new Date();
          const stillHidden = g.status === "scheduled" && !kickoffPassed;
          return (
            <div className="cc-game" key={g.id}>
              <div className="cc-gamehead">
                <span className="cc-when">{g.home_team} / {g.away_team}{stillHidden ? " · " + new Date(g.kickoff_at).toLocaleString() : ""}</span>
                <span className={"cc-status " + g.status}>{g.status.toUpperCase()}</span>
              </div>
              {!stillHidden && g.home_score != null && (
                <div className="cc-when cc-num" style={{ marginBottom: 8, display: "block" }}>
                  {g.home_team} {g.home_score} &ndash; {g.away_team} {g.away_score}{g.status === "live" ? " · " + g.live_clock : ""}
                </div>
              )}
              {entries.length === 0 ? (
                <div className="cc-hiddennote">No visible picks on this game yet.</div>
              ) : (
                entries.map((p) => (
                  <div className="cc-leaguepickrow" key={p.id}>
                    <span>{nameFor(p.user_id)}</span>
                    <span className={g.status === "final" ? "cc-cell " + gradePick(g, p) : g.status === "live" ? "cc-cell " + liveLean(g, p) : ""}>
                      <span className="cc-num">{p.team} {fmtLine(p.line)}{stillHidden ? " 🔒" : ""}</span>
                    </span>
                  </div>
                ))
              )}
              {stillHidden && <div className="cc-hiddennote">Everyone else's picks on this game are hidden until kickoff.</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}