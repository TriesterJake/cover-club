// lib/stats.js
//
// Pure computation functions for the public Stats tab. Nothing here talks to
// the database directly — the API route (app/api/league-stats/route.js)
// fetches the raw rows (already filtered so no not-yet-kicked-off picks ever
// reach this file) and hands them in as plain arrays.
//
// Shapes expected:
//   games:  [{ id, week_id, home_team, away_team, kickoff_at, status,
//               home_score, away_score, ref_spread_home }]
//   picks:  [{ id, game_id, user_id, team, line }]
//   weeks:  [{ id, week_number, label }]
//   people: [{ user_id, display_name }]
//
// "Final" means game.status === 'final' (score + grade are real).
// Everything else in `games` has already kicked off but may still be
// scheduled/live — fine for popularity/tendency stats, not for win/loss
// stats.

import { gradePick, pointsFor } from "@/lib/grading";

function isFinal(game) {
  return game.status === "final";
}

// against-the-spread cover margin from the HOME team's perspective,
// using the game's current ref_spread_home as the one canonical closing
// line for team-level (not per-person) cover stats.
function homeCoverMargin(game) {
  if (game.ref_spread_home === null || game.ref_spread_home === undefined) {
    return null;
  }
  return game.home_score - game.away_score + Number(game.ref_spread_home);
}

// ---------------------------------------------------------------------
// Team stats: cover rate + pick popularity, league-wide
// ---------------------------------------------------------------------
export function teamStats(games, picks) {
  const byTeam = {}; // abbr -> { team, gamesPlayed, covers, pushes, losses, timesPicked, pickWins, pickLosses, pickPushes }

  function ensure(team) {
    if (!byTeam[team]) {
      byTeam[team] = {
        team,
        gamesPlayed: 0,
        covers: 0,
        pushes: 0,
        losses: 0,
        timesPicked: 0,
        pickWins: 0,
        pickLosses: 0,
        pickPushes: 0,
      };
    }
    return byTeam[team];
  }

  for (const g of games) {
    if (!isFinal(g)) continue;
    const margin = homeCoverMargin(g);
    if (margin === null) continue;

    const home = ensure(g.home_team);
    const away = ensure(g.away_team);
    home.gamesPlayed++;
    away.gamesPlayed++;

    if (margin > 0) {
      home.covers++;
      away.losses++;
    } else if (margin < 0) {
      away.covers++;
      home.losses++;
    } else {
      home.pushes++;
      away.pushes++;
    }
  }

  for (const p of picks) {
    const t = ensure(p.team);
    t.timesPicked++;
  }

  // pick-level win rate per team (how often people who picked this team
  // actually won that pick, using each person's own frozen line)
  const gameById = Object.fromEntries(games.map((g) => [g.id, g]));
  for (const p of picks) {
    const g = gameById[p.game_id];
    if (!g || !isFinal(g)) continue;
    const grade = gradePick(g, p);
    const t = ensure(p.team);
    if (grade === "win") t.pickWins++;
    else if (grade === "loss") t.pickLosses++;
    else if (grade === "push") t.pickPushes++;
  }

  return Object.values(byTeam)
    .map((t) => {
      const decided = t.covers + t.losses;
      const decidedPicks = t.pickWins + t.pickLosses;
      return {
        ...t,
        coverRate: decided > 0 ? t.covers / decided : null,
        pickWinRate: decidedPicks > 0 ? t.pickWins / decidedPicks : null,
      };
    })
    .sort((a, b) => (b.coverRate ?? -1) - (a.coverRate ?? -1));
}

// ---------------------------------------------------------------------
// League-wide favorite vs underdog performance
// ---------------------------------------------------------------------
export function favoriteVsUnderdog(games, picks) {
  const gameById = Object.fromEntries(games.map((g) => [g.id, g]));
  const buckets = {
    favorite: { picks: 0, wins: 0, losses: 0, pushes: 0 },
    underdog: { picks: 0, wins: 0, losses: 0, pushes: 0 },
    pickem: { picks: 0, wins: 0, losses: 0, pushes: 0 },
  };

  for (const p of picks) {
    const g = gameById[p.game_id];
    if (!g || !isFinal(g)) continue;
    const line = Number(p.line);
    const bucketKey = line < 0 ? "favorite" : line > 0 ? "underdog" : "pickem";
    const bucket = buckets[bucketKey];
    const grade = gradePick(g, p);
    bucket.picks++;
    if (grade === "win") bucket.wins++;
    else if (grade === "loss") bucket.losses++;
    else if (grade === "push") bucket.pushes++;
  }

  for (const key of Object.keys(buckets)) {
    const b = buckets[key];
    const decided = b.wins + b.losses;
    b.winRate = decided > 0 ? b.wins / decided : null;
  }

  return buckets;
}

// ---------------------------------------------------------------------
// Per-person stats
// ---------------------------------------------------------------------
export function personStats(games, picks, people) {
  const gameById = Object.fromEntries(games.map((g) => [g.id, g]));
  const nameById = Object.fromEntries(
    people.map((p) => [p.user_id, p.display_name])
  );

  // group picks by user
  const byUser = {};
  for (const p of picks) {
    if (!byUser[p.user_id]) byUser[p.user_id] = [];
    byUser[p.user_id].push(p);
  }

  // majority team per game, computed once from ALL eligible picks
  // (games that have already kicked off), used for contrarian tracking.
  const picksByGame = {};
  for (const p of picks) {
    if (!picksByGame[p.game_id]) picksByGame[p.game_id] = [];
    picksByGame[p.game_id].push(p);
  }
  const majorityTeamByGame = {};
  for (const [gameId, gPicks] of Object.entries(picksByGame)) {
    const counts = {};
    for (const p of gPicks) counts[p.team] = (counts[p.team] || 0) + 1;
    const entries = Object.entries(counts);
    if (entries.length < 2) continue; // need at least 2 distinct people to have "the field"
    entries.sort((a, b) => b[1] - a[1]);
    const [topTeam, topCount] = entries[0];
    const tie = entries.length > 1 && entries[1][1] === topCount;
    majorityTeamByGame[gameId] = tie ? null : topTeam;
  }

  const results = [];

  for (const [userId, userPicks] of Object.entries(byUser)) {
    const finalPicksSorted = userPicks
      .filter((p) => isFinal(gameById[p.game_id]))
      .map((p) => ({ pick: p, game: gameById[p.game_id] }))
      .sort(
        (a, b) => new Date(a.game.kickoff_at) - new Date(b.game.kickoff_at)
      );

    // favorite team (most picked)
    const teamCounts = {};
    for (const p of userPicks) teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
    let favoriteTeam = null;
    let favoriteTeamCount = 0;
    for (const [team, count] of Object.entries(teamCounts)) {
      if (count > favoriteTeamCount) {
        favoriteTeam = team;
        favoriteTeamCount = count;
      }
    }

    // favorite-leaning vs underdog-leaning
    let favLeanCount = 0;
    let dogLeanCount = 0;
    let pickemCount = 0;
    for (const p of userPicks) {
      const line = Number(p.line);
      if (line < 0) favLeanCount++;
      else if (line > 0) dogLeanCount++;
      else pickemCount++;
    }

    // home vs away tendency
    let homeCount = 0;
    let awayCount = 0;
    for (const p of userPicks) {
      const g = gameById[p.game_id];
      if (!g) continue;
      if (p.team === g.home_team) homeCount++;
      else if (p.team === g.away_team) awayCount++;
    }

    // streaks (pushes are neutral: they don't extend or break a streak)
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let currentStreak = 0; // positive = win streak, negative = loss streak
    let runningWin = 0;
    let runningLoss = 0;
    for (const { pick, game } of finalPicksSorted) {
      const grade = gradePick(game, pick);
      if (grade === "win") {
        runningWin++;
        runningLoss = 0;
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      } else if (grade === "loss") {
        runningLoss++;
        runningWin = 0;
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      } else {
        // push: streak-neutral
        runningWin = 0;
        runningLoss = 0;
      }
      longestWinStreak = Math.max(longestWinStreak, runningWin);
      longestLossStreak = Math.max(longestLossStreak, runningLoss);
    }

    // best week (by points)
    const pointsByWeek = {};
    for (const { pick, game } of finalPicksSorted) {
      const grade = gradePick(game, pick);
      const pts = pointsFor(grade) || 0;
      pointsByWeek[game.week_id] = (pointsByWeek[game.week_id] || 0) + pts;
    }
    let bestWeekId = null;
    let bestWeekPoints = -1;
    for (const [weekId, pts] of Object.entries(pointsByWeek)) {
      if (pts > bestWeekPoints) {
        bestWeekId = weekId;
        bestWeekPoints = pts;
      }
    }

    // push frequency
    let wins = 0,
      losses = 0,
      pushes = 0;
    for (const { pick, game } of finalPicksSorted) {
      const grade = gradePick(game, pick);
      if (grade === "win") wins++;
      else if (grade === "loss") losses++;
      else if (grade === "push") pushes++;
    }
    const decided = wins + losses + pushes;

    // contrarian tracking
    let contrarianCount = 0;
    let contrarianWins = 0;
    let contrarianDecided = 0;
    let consensusCount = 0;
    let consensusWins = 0;
    let consensusDecided = 0;
    for (const p of userPicks) {
      const majority = majorityTeamByGame[p.game_id];
      if (majority === null || majority === undefined) continue; // no clear field/majority
      const isContrarian = p.team !== majority;
      const game = gameById[p.game_id];
      const grade = isFinal(game) ? gradePick(game, p) : null;
      if (isContrarian) {
        contrarianCount++;
        if (grade === "win" || grade === "loss") {
          contrarianDecided++;
          if (grade === "win") contrarianWins++;
        }
      } else {
        consensusCount++;
        if (grade === "win" || grade === "loss") {
          consensusDecided++;
          if (grade === "win") consensusWins++;
        }
      }
    }

    results.push({
      userId,
      displayName: nameById[userId] || "Unknown",
      favoriteTeam,
      favoriteTeamCount,
      favLeanCount,
      dogLeanCount,
      pickemCount,
      favLeanRate:
        favLeanCount + dogLeanCount > 0
          ? favLeanCount / (favLeanCount + dogLeanCount)
          : null,
      homeCount,
      awayCount,
      homeRate:
        homeCount + awayCount > 0 ? homeCount / (homeCount + awayCount) : null,
      longestWinStreak,
      longestLossStreak,
      currentStreak,
      bestWeekId,
      bestWeekPoints: bestWeekId ? bestWeekPoints : null,
      wins,
      losses,
      pushes,
      pushRate: decided > 0 ? pushes / decided : null,
      contrarianCount,
      contrarianWinRate:
        contrarianDecided > 0 ? contrarianWins / contrarianDecided : null,
      consensusCount,
      consensusWinRate:
        consensusDecided > 0 ? consensusWins / consensusDecided : null,
    });
  }

  return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ---------------------------------------------------------------------
// Head-to-head: for every pair of people, how they've done when they
// picked opposite sides of the same (final) game.
// ---------------------------------------------------------------------
export function headToHead(games, picks, people) {
  const gameById = Object.fromEntries(games.map((g) => [g.id, g]));
  const nameById = Object.fromEntries(
    people.map((p) => [p.user_id, p.display_name])
  );

  const picksByGame = {};
  for (const p of picks) {
    const g = gameById[p.game_id];
    if (!g || !isFinal(g)) continue;
    if (!picksByGame[p.game_id]) picksByGame[p.game_id] = [];
    picksByGame[p.game_id].push(p);
  }

  // pairKey -> { a, b, aWins, bWins, ties }
  const pairs = {};

  function pairKey(u1, u2) {
    return [u1, u2].sort().join("::");
  }

  for (const [gameId, gPicks] of Object.entries(picksByGame)) {
    const game = gameById[gameId];
    for (let i = 0; i < gPicks.length; i++) {
      for (let j = i + 1; j < gPicks.length; j++) {
        const p1 = gPicks[i];
        const p2 = gPicks[j];
        if (p1.team === p2.team) continue; // same side, not a head-to-head
        const g1 = gradePick(game, p1);
        const g2 = gradePick(game, p2);
        const key = pairKey(p1.user_id, p2.user_id);
        if (!pairs[key]) {
          const [u1, u2] = key.split("::");
          pairs[key] = {
            userA: u1,
            userB: u2,
            aWins: 0,
            bWins: 0,
            ties: 0,
          };
        }
        const rec = pairs[key];
        const aIsP1 = p1.user_id === rec.userA;
        const p1Beat = g1 === "win" && g2 === "loss";
        const p2Beat = g2 === "win" && g1 === "loss";
        if (p1Beat) {
          aIsP1 ? rec.aWins++ : rec.bWins++;
        } else if (p2Beat) {
          aIsP1 ? rec.bWins++ : rec.aWins++;
        } else {
          rec.ties++;
        }
      }
    }
  }

  return Object.values(pairs).map((rec) => ({
    ...rec,
    nameA: nameById[rec.userA] || "Unknown",
    nameB: nameById[rec.userB] || "Unknown",
  }));
}