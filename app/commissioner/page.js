"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { pickCurrentWeek } from "@/lib/currentWeek";
import Nav from "@/components/Nav";

function LineInput({ value, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <input
      type="number"
      step="0.5"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = parseFloat(draft);
        if (!isNaN(parsed)) onCommit(parsed);
        else setDraft(String(value)); // invalid/empty -- revert instead of saving garbage
      }}
    />
  );
}

export default function CommissionerPage() {
  const supabase = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [leagueId, setLeagueId] = useState(null);
  const [leagueName, setLeagueName] = useState("");
  const [myId, setMyId] = useState(null);
  const [weeks, setWeeks] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [games, setGames] = useState([]);
  const [picks, setPicks] = useState([]);
  const [warning, setWarning] = useState(null);
  const [addEmail, setAddEmail] = useState("");
  const [addError, setAddError] = useState(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState("");
  const router = useRouter();

  // new-week / new-game form state
  const [newWeekLabel, setNewWeekLabel] = useState("");
  const [newWeekNumber, setNewWeekNumber] = useState("");
  const [newWeekType, setNewWeekType] = useState("regular");
  const [newWeekStart, setNewWeekStart] = useState("");
  const [newWeekEnd, setNewWeekEnd] = useState("");
  const [newGame, setNewGame] = useState({ home_team: "", away_team: "", kickoff_at: "", home_score: "", away_score: "", ref_spread_home: "", status: "final" });
  const [seasonStartDate, setSeasonStartDate] = useState("");
  const [seasonSetupMsg, setSeasonSetupMsg] = useState(null);
  const [resyncMsg, setResyncMsg] = useState(null);
  const [resyncing, setResyncing] = useState(false);

  const resyncAll = async () => {
    setResyncing(true);
    setResyncMsg(null);
    const res = await fetch("/api/commissioner/resync-all", { method: "POST" });
    const body = await res.json();
    setResyncing(false);
    if (!res.ok) { setResyncMsg(body.error || "Something went wrong"); return; }
    setResyncMsg(`Done -- checked ${body.scheduleCount} scheduled games and ${body.oddsCount} odds updates across every week.`);
    loadWeekData(selectedWeek);
  };

  const setupSeason = async () => {
    if (!seasonStartDate) { alert("Pick a date first"); return; }
    const res = await fetch("/api/setup-season", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week1StartDate: seasonStartDate }),
    });
    const body = await res.json();
    if (!res.ok) { alert(body.error || "Something went wrong"); return; }
    setSeasonSetupMsg(`Created ${body.count} weeks. New games from the odds sync will now sort themselves automatically.`);
    load();
  };

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyId(user.id);
    const { data: membership } = await supabase.from("league_members").select("league_id, role").eq("user_id", user.id).limit(1).single();
    if (!membership || membership.role !== "commissioner") { setIsCommissioner(false); setLoading(false); return; }
    setIsCommissioner(true);
    setLeagueId(membership.league_id);

    const { data: league } = await supabase.from("leagues").select("name").eq("id", membership.league_id).single();
    setLeagueName(league?.name || "");

    const { data: leagueWeeks } = await supabase.from("weeks").select("*").eq("league_id", membership.league_id).order("week_number");
    setWeeks(leagueWeeks || []);
    setSelectedWeek((prev) => prev || pickCurrentWeek(leagueWeeks || [])?.id || null);

    const { data: leagueMembers } = await supabase.from("league_members").select("user_id, role, profiles(display_name, email)").eq("league_id", membership.league_id);
    setMembers((leagueMembers || []).map((m) => ({ user_id: m.user_id, display_name: m.profiles?.display_name, email: m.profiles?.email, role: m.role })));

    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const addMemberByEmail = async () => {
    setAddError(null);
    if (!addEmail) return;
    const { data: profile } = await supabase.from("profiles").select("id, display_name").eq("email", addEmail.trim()).maybeSingle();
    if (!profile) {
      setAddError("No one's signed in with that email yet -- have them visit the site and sign in once first, then try again.");
      return;
    }
    const { error } = await supabase.from("league_members").insert({ league_id: leagueId, user_id: profile.id, role: "member" });
    if (error) { setAddError(error.message); return; }
    setAddEmail("");
    load();
  };

  const removeMember = async (userId) => {
    if (!window.confirm("Remove this person from the league? Their past picks stay in the history, but they'll lose access.")) return;
    await supabase.from("league_members").delete().eq("league_id", leagueId).eq("user_id", userId);
    load();
  };

  const deleteLeague = async () => {
    if (confirmDeleteText !== leagueName) return;
    const { error } = await supabase.from("leagues").delete().eq("id", leagueId);
    if (error) { alert(error.message); return; }
    router.push("/create-league");
  };

  const loadWeekData = async (weekId) => {
    if (!weekId) return;
    const { data: weekGames } = await supabase.from("games").select("*").eq("week_id", weekId).order("kickoff_at");
    setGames(weekGames || []);
    const gameIds = (weekGames || []).map((g) => g.id);
    const { data: weekPicks } = gameIds.length ? await supabase.from("picks").select("*").in("game_id", gameIds) : { data: [] };
    setPicks(weekPicks || []);
  };
  useEffect(() => { loadWeekData(selectedWeek); }, [selectedWeek]);

  const createWeek = async () => {
    if (!newWeekLabel || !newWeekNumber) return;
    const { data, error } = await supabase.from("weeks").insert({
      league_id: leagueId, label: newWeekLabel, week_number: Number(newWeekNumber), type: newWeekType,
      start_date: newWeekStart || null, end_date: newWeekEnd || null,
    }).select().single();
    if (error) { alert(error.message); return; }
    setNewWeekLabel(""); setNewWeekNumber(""); setNewWeekType("regular"); setNewWeekStart(""); setNewWeekEnd("");
    await load();
    setSelectedWeek(data.id);
  };

  const addGame = async () => {
    const g = newGame;
    if (!g.home_team || !g.away_team || !g.kickoff_at) { alert("Fill in both teams and kickoff time."); return; }
    const { error } = await supabase.from("games").insert({
      week_id: selectedWeek,
      home_team: g.home_team.toUpperCase(),
      away_team: g.away_team.toUpperCase(),
      kickoff_at: new Date(g.kickoff_at).toISOString(),
      status: g.status,
      home_score: g.home_score === "" ? null : Number(g.home_score),
      away_score: g.away_score === "" ? null : Number(g.away_score),
      ref_spread_home: g.ref_spread_home === "" ? null : Number(g.ref_spread_home),
    });
    if (error) { alert(error.message); return; }
    setNewGame({ home_team: "", away_team: "", kickoff_at: "", home_score: "", away_score: "", ref_spread_home: "", status: "final" });
    loadWeekData(selectedWeek);
  };

  const removeGame = async (game) => {
    if (!window.confirm(`Remove ${game.home_team} vs ${game.away_team}? This also deletes any picks on it.`)) return;
    await supabase.from("games").delete().eq("id", game.id);
    loadWeekData(selectedWeek);
  };

  const pickFor = (userId, gameId) => picks.find((p) => p.user_id === userId && p.game_id === gameId);
  const pickCount = (userId) => picks.filter((p) => p.user_id === userId).length;

  const setPick = async (game, userId, team, line) => {
    const existing = pickFor(userId, game.id);
    if (!existing && pickCount(userId) >= 5) {
      setWarning(`${members.find((m) => m.user_id === userId)?.display_name} already has 5 picks this week. Remove one before adding another.`);
      return;
    }
    setWarning(null);
    // Update the screen right away so it feels instant; the save happens
    // in the background. If it fails, we resync from the server.
    setPicks((prev) => {
      const others = prev.filter((p) => !(p.user_id === userId && p.game_id === game.id));
      return [...others, { ...(existing || {}), id: existing?.id, game_id: game.id, user_id: userId, team, line }];
    });
    const res = await fetch("/api/commissioner/set-pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: game.id, userId, team, line }),
    });
    if (!res.ok) {
      const body = await res.json();
      alert(body.error || "Something went wrong");
      loadWeekData(selectedWeek); // resync since our optimistic update was wrong
    }
  };

  const clearPick = async (game, userId) => {
    const existing = pickFor(userId, game.id);
    if (!existing) return;
    setPicks((prev) => prev.filter((p) => !(p.user_id === userId && p.game_id === game.id)));
    setWarning(null);
    await fetch("/api/commissioner/clear-pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: game.id, userId }),
    });
  };

  if (loading) return <div className="cc-body">Loading&hellip;</div>;
  if (!isCommissioner) return (
    <>
      <Nav isCommissioner={false} />
      <div className="cc-body">Only league commissioners can see this page.</div>
    </>
  );

  return (
    <>
      <Nav isCommissioner={true} />
      <div className="cc-body">
        <div className="cc-weeklabel" style={{ display: "block", marginBottom: 10 }}>Commissioner Tools</div>
        <p className="cc-hiddennote" style={{ marginTop: 0 }}>
          Use this to backfill weeks played before the league started using the site, or to correct a mistake in the
          current week. Each pick stores each person's own line, and there's no lock/hide behavior here -- you're
          editing the underlying data directly.
        </p>

        <div className="cc-scopetoggle">
          {weeks.map((w) => <button key={w.id} className={"cc-scopebtn" + (selectedWeek === w.id ? " active" : "")} onClick={() => setSelectedWeek(w.id)}>{w.label}</button>)}
        </div>

        <details style={{ marginBottom: 18 }} open>
          <summary className="cc-namelink" style={{ cursor: "pointer" }}>League members ({members.length})</summary>
          <div style={{ marginTop: 10 }}>
            {members.map((m) => (
              <div className="cc-leaguepickrow" key={m.user_id}>
                <span>{m.display_name} {m.role === "commissioner" && <span className="cc-badge" style={{ marginLeft: 6, marginBottom: 0 }}>commissioner</span>}</span>
                {m.user_id !== myId && <button className="cc-namelink" onClick={() => removeMember(m.user_id)}>Remove</button>}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <input placeholder="family.member@email.com" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} style={{ padding: 8, flex: 1, minWidth: 200 }} />
              <button className="cc-savebtn" onClick={addMemberByEmail}>Add member</button>
            </div>
            {addError && <div className="cc-warning">{addError}</div>}
            <p className="cc-hiddennote">They need to have visited the site and signed in at least once before you can add them by email.</p>
          </div>
        </details>

        <div style={{ marginBottom: 18 }}>
          <button className="cc-savebtn" disabled={resyncing} onClick={resyncAll}>
            {resyncing ? "Resyncing…" : "Resync every week now"}
          </button>
          <p className="cc-hiddennote">
            The routine sync only checks the current week to stay fast. Use this if an older or future week's
            games/scores look stale, or right after generating a new season.
          </p>
          {resyncMsg && <div className="cc-savedbanner">{resyncMsg}</div>}
        </div>

        <details style={{ marginBottom: 18 }}>
          <summary className="cc-namelink" style={{ cursor: "pointer" }}>+ Set up the whole season at once</summary>
          <div style={{ marginTop: 10 }}>
            <p className="cc-hiddennote" style={{ marginTop: 0 }}>
              Generates all 18 regular-season weeks with real date ranges, so incoming games automatically sort
              into the correct week from now on. Pick the date of the Tuesday (or any day) right before Week 1's
              first game -- each week then runs 7 days from there.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="date" value={seasonStartDate} onChange={(e) => setSeasonStartDate(e.target.value)} style={{ padding: 8 }} />
              <button className="cc-savebtn" onClick={setupSeason}>Generate 18 weeks</button>
            </div>
            {seasonSetupMsg && <div className="cc-savedbanner" style={{ marginTop: 10 }}>{seasonSetupMsg}</div>}
          </div>
        </details>

        <details style={{ marginBottom: 18 }}>
          <summary className="cc-namelink" style={{ cursor: "pointer" }}>+ Create a single new week</summary>
          <p className="cc-hiddennote" style={{ marginTop: 8 }}>
            This is what you'll use for playoff weeks once the regular season ends -- set type to "Wild Card" or
            "Divisional" and the odds/schedule sync will automatically pull in the real playoff matchups from ESPN
            as soon as they're announced, same as it does for the regular season.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input placeholder="Label, e.g. Wild Card" value={newWeekLabel} onChange={(e) => setNewWeekLabel(e.target.value)} style={{ padding: 8 }} />
            <input placeholder="Week #" type="number" value={newWeekNumber} onChange={(e) => setNewWeekNumber(e.target.value)} style={{ padding: 8, width: 80 }} />
            <select value={newWeekType} onChange={(e) => setNewWeekType(e.target.value)} style={{ padding: 8 }}>
              <option value="regular">Regular season</option>
              <option value="playoff_r1">Wild Card</option>
              <option value="playoff_r2">Divisional</option>
            </select>
            <input type="date" value={newWeekStart} onChange={(e) => setNewWeekStart(e.target.value)} style={{ padding: 8 }} title="Start date (for sorting games into this week)" />
            <input type="date" value={newWeekEnd} onChange={(e) => setNewWeekEnd(e.target.value)} style={{ padding: 8 }} title="End date" />
            <button className="cc-savebtn" onClick={createWeek}>Create week</button>
          </div>
        </details>

        {selectedWeek && (
          <>
            <details style={{ marginBottom: 18 }}>
              <summary className="cc-namelink" style={{ cursor: "pointer" }}>+ Add a game to this week</summary>
              <p className="cc-hiddennote" style={{ marginTop: 8 }}>
                "Home line" is the spread from the home team's perspective (negative if they're favored, e.g. -3.5;
                positive if they're the underdog, e.g. +3.5). Set status to "Final" only for a game that's
                already been played -- that's what unlocks entering the score and lets picks get graded.
                Leave it "Scheduled" for a normal upcoming game.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input placeholder="Home (e.g. PHI)" value={newGame.home_team} onChange={(e) => setNewGame({ ...newGame, home_team: e.target.value })} style={{ padding: 8, width: 90 }} />
                <input placeholder="Away (e.g. DAL)" value={newGame.away_team} onChange={(e) => setNewGame({ ...newGame, away_team: e.target.value })} style={{ padding: 8, width: 90 }} />
                <input type="datetime-local" value={newGame.kickoff_at} onChange={(e) => setNewGame({ ...newGame, kickoff_at: e.target.value })} style={{ padding: 8 }} />
                <input placeholder="Home line" type="number" step="0.5" value={newGame.ref_spread_home} onChange={(e) => setNewGame({ ...newGame, ref_spread_home: e.target.value })} style={{ padding: 8, width: 90 }} />
                <select value={newGame.status} onChange={(e) => setNewGame({ ...newGame, status: e.target.value })} style={{ padding: 8 }}>
                  <option value="scheduled">Scheduled (live week)</option>
                  <option value="final">Final (backfilled)</option>
                </select>
                {newGame.status === "final" && (
                  <>
                    <input placeholder="Home score" type="number" value={newGame.home_score} onChange={(e) => setNewGame({ ...newGame, home_score: e.target.value })} style={{ padding: 8, width: 90 }} />
                    <input placeholder="Away score" type="number" value={newGame.away_score} onChange={(e) => setNewGame({ ...newGame, away_score: e.target.value })} style={{ padding: 8, width: 90 }} />
                  </>
                )}
                <button className="cc-savebtn" onClick={addGame}>Add game</button>
              </div>
            </details>

            <div className="cc-gridwrap">
              <table className="cc-grid">
                <thead><tr><th>Game</th>{members.map((m) => <th key={m.user_id}>{m.display_name}</th>)}</tr></thead>
                <tbody>
                  {games.map((g) => (
                    <tr key={g.id}>
                      <td className="name-cell">
                        {g.home_team}/{g.away_team}<br />
                        <span style={{ color: "var(--text-dim)", fontFamily: "Inter, sans-serif", fontSize: 11 }}>{g.status === "final" ? `${g.home_team} ${g.home_score} – ${g.away_team} ${g.away_score}` : "not played yet"}</span><br />
                        <button className="cc-namelink" style={{ fontSize: 11, color: "#E58C7C" }} onClick={() => removeGame(g)}>Remove</button>
                      </td>
                      {members.map((m) => {
                        const p = pickFor(m.user_id, g.id);
                        return (
                          <td key={m.user_id}>
                            <div className="cc-bfcell">
                              <select value={p?.team || ""} onChange={(e) => {
                                const team = e.target.value;
                                if (!team) { clearPick(g, m.user_id); return; }
                                const dflt = team === g.home_team ? g.ref_spread_home : -g.ref_spread_home;
                                setPick(g, m.user_id, team, p && p.team === team ? p.line : (dflt ?? 0));
                              }}>
                                <option value="">—</option>
                                <option value={g.home_team}>{g.home_team}</option>
                                <option value={g.away_team}>{g.away_team}</option>
                              </select>
                              {p && (
                                <div className="cc-lineinput">
                                  <span className="sign">{p.line > 0 ? "+" : ""}</span>
                                  <LineInput value={p.line} onCommit={(line) => setPick(g, m.user_id, p.team, line)} />
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className="name-cell">Picks used</td>
                    {members.map((m) => <td key={m.user_id} className="cc-num">{pickCount(m.user_id)}/5</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            {warning && <div className="cc-warning">⚠ {warning}</div>}
          </>
        )}

        <details style={{ marginTop: 40, borderTop: "1px solid var(--loss)", paddingTop: 16 }}>
          <summary className="cc-namelink" style={{ cursor: "pointer", color: "#E58C7C" }}>Danger zone</summary>
          <div style={{ marginTop: 10 }}>
            <p className="cc-hiddennote" style={{ marginTop: 0 }}>
              Deleting the league permanently removes every week, game, and pick in it -- there's no undo. Useful
              for clearing out a test league before you invite everyone for real.
            </p>
            <div className="cc-field">
              <label>Type the league name ({leagueName}) to confirm</label>
              <input value={confirmDeleteText} onChange={(e) => setConfirmDeleteText(e.target.value)} />
            </div>
            <button
              className="cc-savebtn"
              style={{ background: "var(--loss)", color: "#fff" }}
              disabled={confirmDeleteText !== leagueName}
              onClick={deleteLeague}
            >
              Delete this league
            </button>
          </div>
        </details>
      </div>
    </>
  );
}