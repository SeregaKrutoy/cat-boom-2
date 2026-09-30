import { botStep } from "./bot";
import { actor, applyAction, createState, GameError, log, startGame, tick } from "./engine";
import type { Action, GameState, Tournament, TournamentTable } from "./types";

/** Pause between rounds before the next one starts automatically. */
export const BETWEEN_ROUNDS_MS = 10_000;
/** A player who does nothing for this long gets an automatic move (so a table never stalls). */
export const IDLE_MS = 60_000;
/** Once a player has been auto-played, they are treated as away and get moves much faster. */
export const AWAY_IDLE_MS = 6_000;

function fail(msg: string): never {
  throw new GameError(msg);
}

// A function call, so TypeScript does not assume the status stayed the same after a move
const isFinished = (g: GameState) => g.status === "finished";

/**
 * Round-robin by the circle method: every pair meets exactly once.
 * Each round is a set of pairs that play at the same time on different tables.
 * With an odd number of players one player rests each round.
 */
export function roundRobinRounds(n: number): [number, number][][] {
  const ids: (number | null)[] = Array.from({ length: n }, (_, i) => i);
  if (n % 2 === 1) ids.push(null);
  const m = ids.length;
  const rounds: [number, number][][] = [];
  for (let r = 0; r < m - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i];
      const b = ids[m - 1 - i];
      if (a !== null && b !== null) pairs.push([a, b]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop()!);
  }
  return rounds;
}

function makeTable(s: GameState, id: number, a: number, b: number, now: number): TournamentTable {
  const pa = s.players[a];
  const pb = s.players[b];
  const g = createState(s.code, "friends", { id: pa.id, name: pa.name }, 2);
  g.players.push({ id: pb.id, name: pb.name, isBot: false, hand: [], exploded: false });
  g.score = [0, 0];
  g.log = [];
  startGame(g, now);
  return { id, a, b, game: g, winner: null, lastSeq: g.seq, lastChange: now };
}

function startRound(s: GameState, r: number, now: number) {
  const t = s.tournament!;
  t.round = r;
  t.phase = "round";
  t.nextRoundAt = null;
  t.tables = t.rounds[r].map(([a, b]) => makeTable(s, t.nextTableId++, a, b, now));
  const seated = new Set(t.rounds[r].flat());
  const resting = s.players.findIndex((_, i) => !seated.has(i));
  t.bye = resting >= 0 ? resting : null;
  log(
    s,
    `Раунд ${r + 1} из ${t.rounds.length}: играют ${t.tables.length} стол(а/ов)` +
      (t.bye !== null ? `, отдыхает ${s.players[t.bye].name}` : ""),
    { tone: "good" },
  );
}

export function startTournament(s: GameState, now: number) {
  const n = s.players.length;
  if (n < 2) fail("Нужно минимум 2 игрока");
  const rounds = roundRobinRounds(n);
  const t: Tournament = {
    rounds,
    round: 0,
    tables: [],
    bye: null,
    phase: "round",
    nextRoundAt: null,
    nextTableId: 1,
    wins: Array(n).fill(0),
    played: Array(n).fill(0),
    away: Array(n).fill(false),
    champion: null,
    tie: [],
  };
  s.tournament = t;
  s.status = "playing";
  s.winner = null;
  s.games += 1;
  log(s, `🏟️ Турнир начался! Участников: ${n}, раундов: ${rounds.length}. Каждый сыграет с каждым.`, { tone: "good" });
  startRound(s, 0, now);
  s.seq += 1;
}

/** Starts a waiting room: a normal game, or a tournament with whoever has gathered. */
export function startRoom(s: GameState, token: string, now: number) {
  if (s.status !== "waiting") fail("Игра уже началась");
  if (s.hostId !== token) fail("Только создатель комнаты может начать игру");
  if (s.players.length < 2) fail("Нужно минимум 2 игрока");
  if (s.mode === "tournament") startTournament(s, now);
  else startGame(s, now);
}

function finishTournament(s: GameState) {
  const t = s.tournament!;
  t.phase = "finished";
  t.nextRoundAt = null;
  s.status = "finished";
  const best = Math.max(...t.wins);
  const leaders = t.wins.map((w, i) => (w === best ? i : -1)).filter((i) => i >= 0);
  if (leaders.length === 1) {
    t.champion = leaders[0];
    s.winner = leaders[0];
    log(s, `🏆 Турнир окончен! Чемпион — ${s.players[leaders[0]].name} (${best} побед)`, { tone: "good" });
  } else {
    t.tie = leaders;
    log(s, `🏆 Турнир окончен! Ничья: ${leaders.map((i) => s.players[i].name).join(", ")} (по ${best} побед)`, {
      tone: "good",
    });
  }
}

/** Records the result of a finished table and ends the round when every table is done. */
function settleTable(s: GameState, tb: TournamentTable, now: number) {
  const t = s.tournament!;
  const wl = tb.game.winner;
  if (wl === null || wl < 0) return;
  const w = wl === 0 ? tb.a : tb.b;
  tb.winner = w;
  t.wins[w] += 1;
  t.played[tb.a] += 1;
  t.played[tb.b] += 1;
  log(s, `Стол ${t.tables.indexOf(tb) + 1}: победил(а) ${s.players[w].name}`);
  if (t.tables.every((x) => x.winner !== null)) {
    if (t.round + 1 >= t.rounds.length) finishTournament(s);
    else {
      t.phase = "between";
      t.nextRoundAt = now + BETWEEN_ROUNDS_MS;
    }
  }
}

/** Plays a move for an idle player using the same brain as the bot. */
function autoPlay(g: GameState, pi: number, now: number) {
  log(g, `⏱ ${g.players[pi].name} слишком долго думает — ход сделан автоматически`);
  try {
    botStep(g, pi, now);
  } catch {
    if (g.phase === "action") applyAction(g, pi, { type: "draw" }, now);
    else if (g.phase === "nope") applyAction(g, pi, { type: "pass" }, now);
    else if (g.phase === "defuse") applyAction(g, pi, { type: "place", position: 0 }, now);
    else if (g.phase === "favor") applyAction(g, pi, { type: "give", cardId: g.players[pi].hand[0].id }, now);
  }
}

/** Time-based progression for every table at once. Returns true if anything changed. */
export function tournamentTick(s: GameState, now: number): boolean {
  const t = s.tournament;
  if (!t || s.status !== "playing") return false;
  let changed = false;

  if (t.phase === "round") {
    for (const tb of t.tables) {
      const g = tb.game;
      if (g.status !== "playing") continue;
      const before = g.seq;
      tick(g, now, botStep); // "Nope" windows expire on their own
      if (g.seq === before) {
        const a = actor(g);
        if (a >= 0) {
          const ri = a === 0 ? tb.a : tb.b;
          if (now - tb.lastChange > (t.away[ri] ? AWAY_IDLE_MS : IDLE_MS)) {
            autoPlay(g, a, now);
            t.away[ri] = true;
          }
        }
      }
      if (g.seq !== before) {
        tb.lastSeq = g.seq;
        tb.lastChange = now;
        changed = true;
      }
      if (isFinished(g) && tb.winner === null) {
        settleTable(s, tb, now);
        changed = true;
      }
    }
  } else if (t.phase === "between" && t.nextRoundAt !== null && now >= t.nextRoundAt) {
    startRound(s, t.round + 1, now);
    changed = true;
  }

  if (changed) s.seq += 1;
  return changed;
}

function tournamentAction(s: GameState, pi: number, a: Action, now: number) {
  const t = s.tournament;
  if (!t || s.status === "waiting") fail("Турнир ещё не начался");
  if (a.type === "rematch") {
    if (t.phase !== "finished") fail("Турнир ещё идёт");
    startTournament(s, now);
    return;
  }
  if (t.phase === "finished") fail("Турнир окончен");
  const tb = t.tables.find((x) => x.a === pi || x.b === pi);
  if (!tb) fail("В этом раунде у тебя пауза — смотри другие столы");
  if (tb.game.status !== "playing") fail("Твой матч в этом раунде уже сыгран — дождись остальных");
  applyAction(tb.game, tb.a === pi ? 0 : 1, a, now);
  t.away[pi] = false;
  tb.lastSeq = tb.game.seq;
  tb.lastChange = now;
  if (isFinished(tb.game) && tb.winner === null) settleTable(s, tb, now);
  s.seq += 1;
}

/** Routes a player's action to the right game: the room itself, or their tournament table. */
export function dispatchAction(s: GameState, token: string, a: Action, now: number) {
  const pi = s.players.findIndex((p) => p.id === token);
  if (pi < 0) fail("Ты не участник этой игры");
  if (s.mode === "tournament") tournamentAction(s, pi, a, now);
  else applyAction(s, pi, a, now);
}
