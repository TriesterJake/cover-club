"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { fmtLine, gradePick, liveLean } from "@/lib/grading";
import { teamName, teamLogo } from "@/lib/teamNames";
import { formatKickoff } from "@/lib/formatKickoff";
import { pickCurrentWeek } from "@/lib/currentWeek";
import { fetchJsonWithRetry } from "@/lib/fetchJson";
import Nav from "@/components/Nav";

// Live field-position strip: 10-yard end zones on each side of a 100-yard
// field, away team on the left and home team on the right. ball_yard is
// measured from the away end zone (0-100). Only shown while a game is live
// and only if ESPN gave us who has the ball; if the exact yard line is
// missing we still show the "who has the ball" text, just without the strip.
function LiveSituation({ game }) {
  const { possession_team: poss, ball_yard: yard, down_distance: dd, home_team: home, away_team: away } = game;
  if (poss !== home && poss !== away) return null;

  let spot = null;
  if (yard != null) {
    spot = yard === 50 ? "the 50" : yard < 50 ? `${away} ${yard}` : `${home} ${100 - yard}`;
  }
  const pct = yard != null ? ((10 + yard) / 120) * 100 : null;
  const arrow = poss === away ? "▶" : "◀"; // direction the offense is driving

  const endzone = (side, abbr) => ({
    position: "absolute", top: 0, bottom: 0, [side]: 0, width: `${(10 / 120) * 100}%`,
    background: "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <div style={{ marginBottom: 10 }}>
      {pct != null && (
        <div style={{ position: "relative", height: 28, borderRadius: 4, overflow: "hidden", background: "rgba(63,166,106,0.18)", border: "1px solid var(--line)" }}>
          <div style={endzone("left", away)}><img src={teamLogo(away)} alt={away} style={{ height: 14, width: 14, objectFit: "contain" }} /></div>
          <div style={endzone("right", home)}><img src={teamLogo(home)} alt={home} style={{ height: 14, width: 14, objectFit: "contain" }} /></div>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${((10 + i * 10) / 120) * 100}%`, width: 1, background: "rgba(255,255,255,0.12)" }} />
          ))}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pct}%`, transform: "translateX(-50%)", display: "flex", alignItems: "center", fontSize: 15, lineHeight: 1 }} title={spot ? `Ball on ${spot}` : undefined}>
            &#127944;
          </div>
        </div>
      )}
      <div className="cc-hiddennote" style={{ marginTop: 6, fontStyle: "normal" }}>
        &#127944; {teamName(poss)} ball {arrow}{dd ? ` · ${dd}` : ""}{spot ? ` · on ${spot}` : ""}
      </div>
    </div>
  );
}

function GamesPageInner() {
  const searchParams = useSearchParams();
  const weekParam = searchParams.get("week");
  const highlightId = searchParams.get("highlight");
  const hasScrolledRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [myId, setMyId] = useState(null);
  const [weeks, setWeeks] = useState([]);
  const [scope, setScope] = useState(weekParam || null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJsonWithRetry("/api/league-weeks");
        setWeeks(data.weeks || []);
        // If we arrived with a specific week in the URL (e.g. clicked
        // through from the Scoreboard), honor that instead of defaulting
        // to the current week.
        setScope((prev) => prev || pickCurrentWeek(data.weeks || [])?.id || null);
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

  // Once the right week's games are actually rendered, scroll to and
  // briefly highlight the specific game we were sent here for.
  useEffect(() => {
    if (!highlightId || loading || hasScrolledRef.current) return;
    const el = document.getElementById(`game-${highlightId}`);
    if (el) {
      hasScrolledRef.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("cc-highlighted");
      setTimeout(() => el.classList.remove("cc-highlighted"), 2200);
    }
  }, [highlightId, loading, games]);

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
          const homeHasBall = g.status === "live" && g.possession_team === g.home_team;
          const awayHasBall = g.status === "live" && g.possession_team === g.away_team;
          return (
            <div className="cc-game" id={`game-${g.id}`} key={g.id}>
              <div className="cc-gamehead">
                <span className="cc-when">
                  <img src={teamLogo(g.home_team)} alt="" className="cc-logo-sm" />{teamName(g.home_team)} / <img src={teamLogo(g.away_team)} alt="" className="cc-logo-sm" />{teamName(g.away_team)} &middot; {formatKickoff(g.kickoff_at)}
                </span>
                <span className={"cc-status " + g.status}>{g.status.toUpperCase()}</span>
              </div>
              {!stillHidden && g.home_score != null && (
                <div className="cc-when cc-num" style={{ marginBottom: 8, display: "block" }}>
                  {homeHasBall ? "🏈 " : ""}{teamName(g.home_team)} {g.home_score} &ndash; {awayHasBall ? "🏈 " : ""}{teamName(g.away_team)} {g.away_score}{g.status === "live" ? " · " + g.live_clock : ""}
                </div>
              )}
              {g.status === "live" && <LiveSituation game={g} />}
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

export default function GamesPage() {
  return (
    <Suspense fallback={<div className="cc-body">Loading&hellip;</div>}>
      <GamesPageInner />
    </Suspense>
  );
}