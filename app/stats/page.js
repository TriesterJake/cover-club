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
  const [scope, setScope] = useState("teams"); // teams | people

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

  const { teamStats, favoriteVsUnderdog, personStats, weekById, viewerUserId } = data;

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
        </div>

        {scope === "teams" && (
          <TeamsTab teamStats={teamStats} favoriteVsUnderdog={favoriteVsUnderdog} />
        )}
        {scope === "people" && (
          <PeopleTab
            personStats={personStats}
            weekById={weekById}
            viewerUserId={viewerUserId}
          />
        )}
      </div>
    </>
  );
}

function TeamsTab({ teamStats, favoriteVsUnderdog }) {
  const sorted = [...teamStats].filter((t) => t.gamesPlayed > 0 || t.timesPicked > 0);

  return (
    <section>
      <p className="cc-weeklabel" style={{ marginTop: 18 }}>Favorites vs. underdogs, league-wide</p>
      <p className="cc-hiddennote" style={{ marginTop: 0, marginBottom: 10 }}>
        Every graded pick, split by whether the person picked the favorite or the underdog on their own line.
      </p>
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
      <div className="cc-statnote">
        <p><strong>ATS record</strong> (against-the-spread): the team&rsquo;s own win-loss-push record versus the closing line on each game &mdash; not tied to who picked what.</p>
        <p><strong>Cover rate</strong>: that ATS record as a win percentage, pushes excluded.</p>
        <p><strong>Pick win rate</strong>: of the people who actually picked this team, how many won <em>their own</em> pick. This can differ from cover rate, because each person&rsquo;s pick is graded on the line they had when they picked &mdash; not the closing line used above.</p>
        <p>
          The &ldquo;closing line&rdquo; here is each game&rsquo;s current <code>ref_spread_home</code> value &mdash; the last DraftKings number our odds sync wrote before kickoff (it refreshes roughly every minute right up until then). It&rsquo;s not a separately captured snapshot, just whatever the last successful sync saw, so treat it as very close to the true closing number rather than guaranteed exact.
        </p>
      </div>
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

function PeopleTab({ personStats, weekById, viewerUserId }) {
  const you = personStats.find((p) => p.userId === viewerUserId);
  const everyoneElse = personStats.filter((p) => p.userId !== viewerUserId);
  const ordered = you ? [you, ...everyoneElse] : personStats;

  return (
    <div>
      <p className="cc-hiddennote" style={{ marginTop: 0 }}>
        <strong>Contrarian picks</strong> are picks made against that game&rsquo;s majority &mdash; the side most of the league picked. <strong>Went with the field</strong> is the opposite: picking the same side as the majority.
      </p>
      <div className="cc-statgrid">
        {ordered.map((p) => {
          const isYou = p.userId === viewerUserId;
          return (
            <div key={p.userId} className={"cc-statcard" + (isYou ? " you" : "")}>
              {isYou ? (
                <p className="cc-team cc-you-label" style={{ marginBottom: 2 }}>You</p>
              ) : null}
              <p className={isYou ? "cc-sub" : "cc-team"} style={{ marginBottom: 8 }}>
                {p.displayName}
              </p>
              <div className="cc-statlist">
                <StatRow label="Favorite team" value={p.favoriteTeam ? `${teamName(p.favoriteTeam)} (${p.favoriteTeamCount}x)` : "—"} />
                <StatRow
                  label="Favorite vs. underdog"
                  value={`${pct(p.favLeanRate)} favorites (${p.favLeanCount} fav / ${p.dogLeanCount} dog${p.pickemCount ? ` / ${p.pickemCount} even` : ""})`}
                />
                <StatRow label="Home vs. away" value={`${pct(p.homeRate)} home (${p.homeCount} home / ${p.awayCount} away)`} />
                <StatRow label="Record" value={`${p.wins}-${p.losses}${p.pushes ? `-${p.pushes}` : ""}`} />
                <StatRow label="Push frequency" value={pct(p.pushRate)} />
                <StatRow
                  label="Best week"
                  value={p.bestWeekId ? `${weekById[p.bestWeekId]?.label || "Week"} — ${p.bestWeekPoints} pts` : "—"}
                />
                <StatRow label="Contrarian picks" value={`${p.contrarianCount} made, ${pct(p.contrarianWinRate)} win rate`} />
                <StatRow label="Went with the field" value={`${p.consensusCount} times, ${pct(p.consensusWinRate)} win rate`} />
              </div>
            </div>
          );
        })}
      </div>
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