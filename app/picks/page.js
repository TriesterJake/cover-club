"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { fmtLine, gradePick } from "@/lib/grading";
import Nav from "@/components/Nav";

export default function PicksPage() {
  const supabase = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [week, setWeek] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);        // every pick visible to me on this week's games
  const [members, setMembers] = useState([]);    // { user_id, display_name }
  const [picksUsed, setPicksUsed] = useState(0);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: membership } = await supabase
      .from("league_members")
      .select("league_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    if (!membership) { setLoading(false); return; }
    setIsCommissioner(membership.role === "commissioner");

    const { data: currentWeek } = await supabase
      .from("weeks")
      .select("*")
      .eq("league_id", membership.league_id)
      .order("week_number", { ascending: false })
      .limit(1)
      .single();
    setWeek(currentWeek);
    if (!currentWeek) { setLoading(false); return; }

    const { data: weekGames } = await supabase
      .from("games")
      .select("*")
      .eq("week_id", currentWeek.id)
      .order("kickoff_at", { ascending: true });
    setGames(weekGames || []);

    const gameIds = (weekGames || []).map((g) => g.id);
    const { data: visiblePicks } = gameIds.length
      ? await supabase.from("picks").select("*").in("game_id", gameIds)
      : { data: [] };
    setPicks(visiblePicks || []);
    setPicksUsed((visiblePicks || []).filter((p) => p.user_id === user.id).length);

    const { data: leagueMembers } = await supabase
      .from("league_members")
      .select("user_id, profiles(display_name)")
      .eq("league_id", membership.league_id);
    setMembers((leagueMembers || []).map((m) => ({ user_id: m.user_id, display_name: m.profiles?.display_name })));

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const myPick = (gameId) => picks.find((p) => p.game_id === gameId && p.user_id === userId);
  const othersPicks = (gameId) => picks.filter((p) => p.game_id === gameId && p.user_id !== userId);
  const nameFor = (uid) => (uid === userId ? "You" : members.find((m) => m.user_id === uid)?.display_name || "Someone");

  const submitPick = async (game, team) => {
    const line = team === game.home_team ? game.ref_spread_home : -game.ref_spread_home;
    if (!window.confirm(`Lock in ${team} ${fmtLine(line)}? This can't be changed once submitted.`)) return;
    const { error } = await supabase.from("picks").insert({
      game_id: game.id,
      user_id: userId,
      team,
      line,
      source: "member_submitted",
    });
    if (error) {
      alert(error.message.includes("row-level security")
        ? "Couldn't lock that pick in -- you may already have 5 picks this week, or the game has started."
        : error.message);
      return;
    }
    load();
  };

  if (loading) return <div className="cc-body">Loading&hellip;</div>;
  if (!week) return <div className="cc-body">No week has been set up yet -- ask your commissioner.</div>;

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
          const kickoffPassed = new Date(game.kickoff_at) <= new Date();

          if (game.status !== "scheduled" || kickoffPassed) {
            return (
              <div className="cc-game" key={game.id}>
                <div className="cc-gamehead">
                  <span className="cc-when">{new Date(game.kickoff_at).toLocaleString()}</span>
                  <span className={"cc-status " + game.status}>{game.status.toUpperCase()}</span>
                </div>
                {game.status === "final" && (
                  <div className="cc-finalscore">
                    <span className="cc-num">{game.home_team} {game.home_score} &ndash; {game.away_team} {game.away_score}</span>
                    {pick && <span className={"cc-gradepill " + grade}>{grade === "win" ? "Covered · +1.0" : grade === "push" ? "Push · +0.5" : "No cover · +0"}</span>}
                  </div>
                )}
                {game.status === "live" && (
                  <div className="cc-livewrap">
                    <span className="cc-num">{game.home_team} {game.home_score} &ndash; {game.away_team} {game.away_score}</span>
                    <span className="cc-when">{game.live_clock}</span>
                  </div>
                )}
                {pick && (
                  <div className={"cc-pickbox" + (grade ? " " + grade : "")}>
                    <div className="cc-pickbox-label">Your pick</div>
                    <div className="cc-pickbox-team">{pick.team} <span className="cc-num">{fmtLine(pick.line)}</span></div>
                    {game.status === "live" && <div className="cc-pickbox-sub"><span className={"cc-coverdot " + gradePick({ ...game, status: "final" }, pick)}></span>live</div>}
                  </div>
                )}
                {!pick && <div className="cc-hiddennote">You didn't submit a pick for this game.</div>}
                {others.length > 0 && (
                  <div className="cc-leaguepicks">
                    <div className="cc-leaguepicks-title">Everyone else's picks</div>
                    {others.map((o) => (
                      <div className="cc-leaguepickrow" key={o.id}><span>{nameFor(o.user_id)}</span><span className="cc-num">{o.team} {fmtLine(o.line)}</span></div>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          // scheduled and not yet kicked off
          return (
            <div className="cc-game" key={game.id}>
              <div className="cc-gamehead">
                <span className="cc-when">{new Date(game.kickoff_at).toLocaleString()}</span>
                <span className="cc-status scheduled">LOCKS AT KICKOFF</span>
              </div>
              {pick ? (
                <>
                  <div className="cc-pickbox">
                    <div className="cc-pickbox-label">Your pick</div>
                    <div className="cc-pickbox-team">{pick.team} <span className="cc-num">{fmtLine(pick.line)}</span></div>
                    <div className="cc-pickbox-sub">🔒 locked {new Date(pick.locked_at).toLocaleString()}</div>
                  </div>
                  <div className="cc-hiddennote">Only you can see this until kickoff.</div>
                </>
              ) : picksUsed >= 5 ? (
                <div className="cc-hiddennote">You've already used all 5 picks this week.</div>
              ) : (
                <div className="cc-matchup">
                  <button className="cc-sidebtn" onClick={() => submitPick(game, game.home_team)}>
                    <div className="cc-team">{game.home_team}</div>
                    <div className="cc-line cc-num">{game.ref_spread_home != null ? fmtLine(game.ref_spread_home) : "—"}</div>
                  </button>
                  <button className="cc-sidebtn" onClick={() => submitPick(game, game.away_team)}>
                    <div className="cc-team">{game.away_team}</div>
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
