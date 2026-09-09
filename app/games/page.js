"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { fmtLine, gradePick } from "@/lib/grading";
import Nav from "@/components/Nav";

export default function GamesPage() {
  const supabase = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [weeks, setWeeks] = useState([]);
  const [scope, setScope] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);
  const [members, setMembers] = useState([]);
  const [myId, setMyId] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);
      const { data: membership } = await supabase.from("league_members").select("league_id, role").eq("user_id", user.id).limit(1).single();
      if (!membership) { setLoading(false); return; }
      setIsCommissioner(membership.role === "commissioner");

      const { data: leagueWeeks } = await supabase.from("weeks").select("*").eq("league_id", membership.league_id).order("week_number");
      setWeeks(leagueWeeks || []);
      setScope(leagueWeeks?.[leagueWeeks.length - 1]?.id);

      const { data: leagueMembers } = await supabase.from("league_members").select("user_id, profiles(display_name)").eq("league_id", membership.league_id);
      setMembers((leagueMembers || []).map((m) => ({ user_id: m.user_id, display_name: m.profiles?.display_name })));
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!scope) return;
    (async () => {
      const { data: weekGames } = await supabase.from("games").select("*").eq("week_id", scope).order("kickoff_at");
      setGames(weekGames || []);
      const gameIds = (weekGames || []).map((g) => g.id);
      const { data: visiblePicks } = gameIds.length ? await supabase.from("picks").select("*").in("game_id", gameIds) : { data: [] };
      setPicks(visiblePicks || []);
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
                    {stillHidden && p.user_id !== myId ? null : (
                      <span className={g.status === "final" ? "cc-cell " + gradePick(g, p) : ""}>
                        <span className="cc-num">{p.team} {fmtLine(p.line)}{stillHidden ? " 🔒" : ""}</span>
                      </span>
                    )}
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
