"use client";
import { useEffect, useState } from "react";
import { fmtLine, gradePick, liveLean } from "@/lib/grading";
import { fetchJsonWithRetry } from "@/lib/fetchJson";
import { teamName, teamLogo } from "@/lib/teamNames";
import { formatKickoff } from "@/lib/formatKickoff";
import Nav from "@/components/Nav";

export default function PicksPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [week, setWeek] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);
  const [members, setMembers] = useState([]);
  const [hasLeague, setHasLeague] = useState(true);

  const load = async () => {
    setLoading(true);
    let data;
    try {
      data = await fetchJsonWithRetry("/api/week-data");
    } catch (e) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    setLoadError(false);
    setUserId(data.userId);
    setHasLeague(!!data.membership);
    setIsCommissioner(data.membership?.role === "commissioner");
    setWeek(data.week || null);
    setGames(data.games || []);
    setPicks(data.picks || []);
    setMembers(data.members || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const myPick = (gameId) => picks.find((p) => p.game_id === gameId && p.user_id === userId);
  const othersPicks = (gameId) => picks.filter((p) => p.game_id === gameId && p.user_id !== userId);
  const nameFor = (uid) => (uid === userId ? "You" : members.find((m) => m.user_id === uid)?.display_name || "Someone");
  const picksUsed = picks.filter((p) => p.user_id === userId).length;

  const submitPick = async (game, team) => {
    const line = team === game.home_team ? game.ref_spread_home : -game.ref_spread_home;
    if (!window.confirm(`Lock in ${team} ${fmtLine(line)}? This can't be changed once submitted.`)) return;
    const res = await fetch("/api/picks/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: game.id, team, line }),
    });
    const body = await res.json();
    if (!res.ok) { alert(body.error || "Something went wrong"); return; }
    load();
  };

  if (loading) return <><Nav isCommissioner={isCommissioner} /><div className="cc-body">Loading&hellip;</div></>;
  if (loadError) return (
    <>
      <Nav isCommissioner={false} />
      <div className="cc-body">
        Couldn't load your data just now -- this is usually temporary. <button className="cc-namelink" onClick={load}>Try again</button>
      </div>
    </>
  );
  if (!hasLeague) return (
    <>
      <Nav isCommissioner={false} />
      <div className="cc-body">
        You don't have a league yet. <a href="/create-league" style={{ color: "var(--accent)" }}>Create one here</a>.
      </div>
    </>
  );
  if (!week) return (
    <>
      <Nav isCommissioner={isCommissioner} />
      <div className="cc-body">No week has been set up yet -- if you're the commissioner, head to Commissioner Tools to create one.</div>
    </>
  );

  return (
    <>
      <Nav isCommissioner={isCommissioner} />
      <div className="cc-body">
        <div className="cc-weekrow">
          <span className="cc-weeklabel">{week.label} &middot; {picksUsed}/5 picks used</span>
        </div>

        {games.map((game) => {
          const pick = myPick(game.id);
          const others = othersPicks(game.id);
          const grade = pick ? gradePick(game, pick) : null;
          const live = pick ? liveLean(game, pick) : null;
          const kickoffPassed = new Date(game.kickoff_at) <= new Date();

          if (game.status !== "scheduled" || kickoffPassed) {
            return (
              <div className="cc-game" key={game.id}>
                <div className="cc-gamehead">
                  <span className="cc-when">{formatKickoff(game.kickoff_at)}</span>
                  <span className={"cc-status " + game.status}>{game.status.toUpperCase()}</span>
                </div>
                {game.status === "final" && (
                  <div className="cc-finalscore">
                    <span className="cc-num"><img src={teamLogo(game.home_team)} alt="" className="cc-logo-sm" />{teamName(game.home_team)} {game.home_score} &ndash; <img src={teamLogo(game.away_team)} alt="" className="cc-logo-sm" />{teamName(game.away_team)} {game.away_score}</span>
                    {pick && <span className={"cc-gradepill " + grade}>{grade === "win" ? "Covered · +1.0" : grade === "push" ? "Push · +0.5" : "No cover · +0"}</span>}
                  </div>
                )}
                {game.status === "live" && (
                  <div className="cc-livewrap">
                    <span className="cc-num"><img src={teamLogo(game.home_team)} alt="" className="cc-logo-sm" />{teamName(game.home_team)} {game.home_score} &ndash; <img src={teamLogo(game.away_team)} alt="" className="cc-logo-sm" />{teamName(game.away_team)} {game.away_score}</span>
                    <span className="cc-when">{game.live_clock}</span>
                  </div>
                )}
                {pick && (
                  <div className={"cc-pickbox" + (grade ? " " + grade : live ? " " + live : "")}>
                    <div className="cc-pickbox-label">Your pick</div>
                    <div className="cc-pickbox-team"><img src={teamLogo(pick.team)} alt="" className="cc-logo" />{teamName(pick.team)} <span className="cc-num">{fmtLine(pick.line)}</span></div>
                    {game.status === "live" && (
                      <div className="cc-pickbox-sub">
                        <span className={"cc-coverdot " + live}></span>
                        currently {live === "win" ? "covering" : live === "push" ? "right on the number" : "not covering"}
                      </div>
                    )}
                  </div>
                )}
                {!pick && <div className="cc-hiddennote">You didn't submit a pick for this game.</div>}
                {others.length > 0 && (
                  <div className="cc-leaguepicks">
                    <div className="cc-leaguepicks-title">Everyone else's picks</div>
                    {others.map((o) => (
                      <div className="cc-leaguepickrow" key={o.id}><span>{nameFor(o.user_id)}</span><span className="cc-num">{teamName(o.team)} {fmtLine(o.line)}</span></div>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div className="cc-game" key={game.id}>
              <div className="cc-gamehead">
                <span className="cc-when">{formatKickoff(game.kickoff_at)}</span>
                <span className="cc-status scheduled">LOCKS AT KICKOFF</span>
              </div>
              {pick ? (
                <>
                  <div className="cc-pickbox">
                    <div className="cc-pickbox-label">Your pick</div>
                    <div className="cc-pickbox-team"><img src={teamLogo(pick.team)} alt="" className="cc-logo" />{teamName(pick.team)} <span className="cc-num">{fmtLine(pick.line)}</span></div>
                    <div className="cc-pickbox-sub">🔒 locked {new Date(pick.locked_at).toLocaleString()}</div>
                  </div>
                  <div className="cc-hiddennote">Only you can see this until kickoff.</div>
                </>
              ) : picksUsed >= 5 ? (
                <div className="cc-hiddennote">You've already used all 5 picks this week.</div>
              ) : (
                <div className="cc-matchup">
                  <button className="cc-sidebtn" onClick={() => submitPick(game, game.home_team)}>
                    <div className="cc-team"><img src={teamLogo(game.home_team)} alt="" className="cc-logo" />{teamName(game.home_team)}</div>
                    <div className="cc-line cc-num">{game.ref_spread_home != null ? fmtLine(game.ref_spread_home) : "—"}</div>
                  </button>
                  <button className="cc-sidebtn" onClick={() => submitPick(game, game.away_team)}>
                    <div className="cc-team"><img src={teamLogo(game.away_team)} alt="" className="cc-logo" />{teamName(game.away_team)}</div>
                    <div className="cc-line cc-num">{game.ref_spread_home != null ? fmtLine(-game.ref_spread_home) : "—"}</div>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}