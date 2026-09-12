"use client";
import { useEffect, useState } from "react";
import { fmtLine, gradePick, liveLean } from "@/lib/grading";
import { teamName, teamLogo } from "@/lib/teamNames";
import { formatKickoff } from "@/lib/formatKickoff";
import { pickCurrentWeek } from "@/lib/currentWeek";
import { fetchJsonWithRetry } from "@/lib/fetchJson";
import Nav from "@/components/Nav";

export default function GamesPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [myId, setMyId] = useState(null);
  const [weeks, setWeeks] = useState([]);
  const [scope, setScope] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJsonWithRetry("/api/league-weeks");
        setWeeks(data.weeks || []);
        setScope(pickCurrentWeek(data.weeks || [])?.id || null);
      } catch {
        setLoadError(true);
        setLoading(false);
      }
    })();
  }, []);

  const loadWeek = async () => {
    if (!scope) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchJsonWithRetry(`/api/week-data?weekId=${scope}`);
      setLoadError(false);
      setMyId(data.userId);
      setIsCommissioner(data.membership?.role === "commissioner");
      setGames(data.games || []);
      setPicks(data.picks || []);
      setMembers(data.members || []);
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  };
  useEffect(() => { loadWeek(); }, [scope]);

  if (loading) return <><Nav isCommissioner={isCommissioner} /><div className="cc-body">Loading&hellip;</div></>;
  if (loadError) return (
    <>
      <Nav isCommissioner={isCommissioner} />
      <div className="cc-body">Couldn't load your data just now -- this is usually temporary. <button className="cc-namelink" onClick={loadWeek}>Try again</button></div>
    </>
  );

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
          // Your own pick, if you have one, sorts to the top of the list.
          const sortedEntries = [...entries].sort((a, b) => (a.user_id === myId ? -1 : b.user_id === myId ? 1 : 0));
          const kickoffPassed = new Date(g.kickoff_at) <= new Date();
          const stillHidden = g.status === "scheduled" && !kickoffPassed;
          return (
            <div className="cc-game" key={g.id}>
              <div className="cc-gamehead">
                <span className="cc-when">
                  <img src={teamLogo(g.home_team)} alt="" className="cc-logo-sm" />{teamName(g.home_team)} / <img src={teamLogo(g.away_team)} alt="" className="cc-logo-sm" />{teamName(g.away_team)} &middot; {formatKickoff(g.kickoff_at)}
                </span>
                <span className={"cc-status " + g.status}>{g.status.toUpperCase()}</span>
              </div>
              {!stillHidden && g.home_score != null && (
                <div className="cc-when cc-num" style={{ marginBottom: 8, display: "block" }}>
                  {teamName(g.home_team)} {g.home_score} &ndash; {teamName(g.away_team)} {g.away_score}{g.status === "live" ? " · " + g.live_clock : ""}
                </div>
              )}
              {sortedEntries.length === 0 ? (
                <div className="cc-hiddennote">
                  {stillHidden
                    ? "You haven't picked this game yet, and everyone else's picks stay hidden until kickoff."
                    : "Nobody picked this game."}
                </div>
              ) : (
                sortedEntries.map((p) => (
                  <div className={"cc-leaguepickrow" + (p.user_id === myId ? " you" : "")} key={p.id}>
                    <span>{nameFor(p.user_id)}</span>
                    <span className={g.status === "final" ? "cc-cell " + gradePick(g, p) : g.status === "live" ? "cc-cell " + liveLean(g, p) : ""}>
                      <span className="cc-num">
                        <img src={teamLogo(p.team)} alt="" className="cc-logo-sm" />{teamName(p.team)} {fmtLine(p.line)}{stillHidden ? " 🔒" : ""}
                      </span>
                    </span>
                  </div>
                ))
              )}
              {stillHidden && sortedEntries.length > 0 && <div className="cc-hiddennote">Everyone else's picks on this game are hidden until kickoff.</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}