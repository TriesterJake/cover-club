"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { authedFetch } from "@/lib/authedFetch";
import { teamName, teamLogo } from "@/lib/teamNames";

function pct(x) {
  if (x === null || x === undefined) return "—";
  return `${Math.round(x * 100)}%`;
}

export default function StatsPage() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("teams"); // teams | people | h2h

  async function load(isRetry = false) {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await authedFetch("/api/league-stats", { method: "GET" });
      if (!res.ok) throw new Error("Failed to load stats");
      const json = await res.json();
      setData(json);
    } catch (e) {
      if (!isRetry) {
        return load(true);
      }
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <>
        <Nav />
        <div className="cc-body">
          <p className="cc-sub">Loading stats…</p>
        </div>
      </>
    );
  }

  if (loadError || !data) {
    return (
      <>
        <Nav />
        <div className="cc-body">
          <p className="cc-sub">Couldn&rsquo;t load stats just now.</p>
          <button className="cc-savebtn" onClick={() => load()}>Try again</button>
        </div>
      </>
    );
  }

  const { teamStats, favoriteVsUnderdog, personStats, headToHead, weekById } = data;

  return (
    <>
      <Nav />
      <div className="cc-body">
        <div className="cc-weekrow">
          <span className="cc-weeklabel">Stats</span>
        </div>
        <span className="cc-badge">
          Updates as games kick off &mdash; nothing here is hidden from the league
        </span>

        <div className="cc-scopetoggle">
          <button
            className={"cc-scopebtn" + (scope === "teams" ? " active" : "")}
            onClick={() => setScope("teams")}
          >
            Teams
          </button>
          <button
            className={"cc-scopebtn" + (scope === "people" ? " active" : "")}
            onClick={() => setScope("people")}
          >
            People
          </button>
          <button
            className={"cc-scopebtn" + (scope === "h2h" ? " active" : "")}
            onClick={() => setScope("h2h")}
          >
            Head-to-Head
          </button>
        </div>

        {scope === "teams" && (
          <TeamsTab teamStats={teamStats} favoriteVsUnderdog={favoriteVsUnderdog} />
        )}
        {scope === "people" && (
          <PeopleTab personStats={personStats} weekById={weekById} />
        )}
        {scope === "h2h" && <HeadToHeadTab headToHead={headToHead} />}
      </div>
    </>
  );
}

function TeamsTab({ teamStats, favoriteVsUnderdog }) {
  const sorted = [...teamStats].filter((t) => t.gamesPlayed > 0 || t.timesPicked > 0);

  return (
    <section>
      <p className="cc-weeklabel" style={{ marginTop: 18 }}>Favorites vs. underdogs, league-wide</p>
      <table className="cc-simpletable">
        <thead>
          <tr>
            <th></th>
            <th>Picks</th>
            <th>Record</th>
            <th>Win rate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Favorites</td>
            <td>{favoriteVsUnderdog.favorite.picks}</td>
            <td>
              {favoriteVsUnderdog.favorite.wins}-{favoriteVsUnderdog.favorite.losses}
              {favoriteVsUnderdog.favorite.pushes ? `-${favoriteVsUnderdog.favorite.pushes}` : ""}
            </td>
            <td>{pct(favoriteVsUnderdog.favorite.winRate)}</td>
          </tr>
          <tr>
            <td>Underdogs</td>
            <td>{favoriteVsUnderdog.underdog.picks}</td>
            <td>
              {favoriteVsUnderdog.underdog.wins}-{favoriteVsUnderdog.underdog.losses}
              {favoriteVsUnderdog.underdog.pushes ? `-${favoriteVsUnderdog.underdog.pushes}` : ""}
            </td>
            <td>{pct(favoriteVsUnderdog.underdog.winRate)}</td>
          </tr>
          {favoriteVsUnderdog.pickem.picks > 0 && (
            <tr>
              <td>Pick&rsquo;em (even)</td>
              <td>{favoriteVsUnderdog.pickem.picks}</td>
              <td>
                {favoriteVsUnderdog.pickem.wins}-{favoriteVsUnderdog.pickem.losses}
              </td>
              <td>{pct(favoriteVsUnderdog.pickem.winRate)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="cc-weeklabel" style={{ marginTop: 26 }}>Team cover rate &amp; popularity</p>
      <table className="cc-simpletable">
        <thead>
          <tr>
            <th>Team</th>
            <th>Cover rate</th>
            <th>ATS record</th>
            <th>Times picked</th>
            <th>Pick win rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.team}>
              <td>
                <img src={teamLogo(t.team)} alt="" className="cc-logo-sm" />
                {teamName(t.team)}
              </td>
              <td>{pct(t.coverRate)}</td>
              <td>
                {t.covers}-{t.losses}
                {t.pushes ? `-${t.pushes}` : ""}
              </td>
              <td>{t.timesPicked}</td>
              <td>{pct(t.pickWinRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PeopleTab({ personStats, weekById }) {
  return (
    <div className="cc-statgrid">
      {personStats.map((p) => (
        <div key={p.userId} className="cc-statcard">
          <p className="cc-team" style={{ marginBottom: 8 }}>{p.displayName}</p>
          <div className="cc-statlist">
            <StatRow label="Favorite team" value={p.favoriteTeam ? `${teamName(p.favoriteTeam)} (${p.favoriteTeamCount}x)` : "—"} />
            <StatRow
              label="Favorite vs. underdog"
              value={`${pct(p.favLeanRate)} favorites (${p.favLeanCount} fav / ${p.dogLeanCount} dog${p.pickemCount ? ` / ${p.pickemCount} even` : ""})`}
            />
            <StatRow label="Home vs. away" value={`${pct(p.homeRate)} home (${p.homeCount} home / ${p.awayCount} away)`} />
            <StatRow label="Record" value={`${p.wins}-${p.losses}${p.pushes ? `-${p.pushes}` : ""}`} />
            <StatRow label="Push frequency" value={pct(p.pushRate)} />
            <StatRow label="Longest win streak" value={p.longestWinStreak} />
            <StatRow label="Longest losing streak" value={p.longestLossStreak} />
            <StatRow
              label="Current streak"
              value={p.currentStreak === 0 ? "—" : p.currentStreak > 0 ? `${p.currentStreak}W` : `${Math.abs(p.currentStreak)}L`}
            />
            <StatRow
              label="Best week"
              value={p.bestWeekId ? `${weekById[p.bestWeekId]?.label || "Week"} — ${p.bestWeekPoints} pts` : "—"}
            />
            <StatRow label="Contrarian picks" value={`${p.contrarianCount} made, ${pct(p.contrarianWinRate)} win rate`} />
            <StatRow label="Went with the field" value={`${p.consensusCount} times, ${pct(p.consensusWinRate)} win rate`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="cc-statrow">
      <span className="cc-sub">{label}</span>
      <span className="cc-num">{value}</span>
    </div>
  );
}

function HeadToHeadTab({ headToHead }) {
  const sorted = [...headToHead].sort(
    (a, b) => a.nameA.localeCompare(b.nameA) || a.nameB.localeCompare(b.nameB)
  );

  if (sorted.length === 0) {
    return (
      <p className="cc-sub" style={{ marginTop: 18 }}>
        No head-to-head matchups yet &mdash; that happens once two people pick opposite sides of the same game.
      </p>
    );
  }

  return (
    <section>
      <p className="cc-sub" style={{ marginTop: 18, marginBottom: 6 }}>
        Counted whenever two people picked opposite sides of the same game &mdash; whoever&rsquo;s pick graded a win takes the head-to-head.
      </p>
      <table className="cc-simpletable">
        <thead>
          <tr>
            <th></th>
            <th></th>
            <th>Record</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((rec, i) => (
            <tr key={i}>
              <td>{rec.nameA}</td>
              <td>{rec.nameB}</td>
              <td>
                {rec.aWins}-{rec.bWins}
                {rec.ties ? ` (${rec.ties} tied)` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}