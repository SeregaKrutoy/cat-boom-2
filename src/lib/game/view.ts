import { reactionPlayers, responder } from "./engine";
import { BOT_AVATAR, DEFAULT_AVATAR } from "../profile";
import type { GameState, GameView, RematchInfo, TournamentView } from "./types";

const avatarOf = (p: { avatar?: string; isBot: boolean }) => p.avatar ?? (p.isBot ? BOT_AVATAR : DEFAULT_AVATAR);

/** Who has pressed «Реванш» (not shown in bot games, where a rematch is instant). */
function rematchInfo(s: GameState, me: number): RematchInfo | null {
  if (s.status !== "finished" || s.players.some((p) => p.isBot)) return null;
  const votes = s.rematchVotes ?? [];
  const info = (i: number) => ({ name: s.players[i].name, avatar: avatarOf(s.players[i]) });
  const all = s.players.map((_, i) => i);
  return {
    ready: all.filter((i) => votes.includes(i)).map(info),
    waiting: all.filter((i) => !votes.includes(i)).map(info),
    iVoted: me >= 0 && votes.includes(me),
  };
}

/** View of a single game (a normal room, or one tournament table) for one player. */
function plainView(s: GameState, token: string, now: number): GameView {
  const me = s.players.findIndex((p) => p.id === token);
  const p = s.pending;
  return {
    code: s.code,
    matchId: s.matchId ?? `legacy:${s.code}:${s.games}`,
    mode: s.mode,
    maxPlayers: s.maxPlayers,
    tournament: null,
    spectator: false,
    tableId: null,
    status: s.status,
    me,
    isHost: me >= 0 && s.players[me].id === s.hostId,
    players: s.players.map((pl) => ({
      name: pl.name,
      avatar: avatarOf(pl),
      isBot: pl.isBot,
      handCount: pl.hand.length,
      exploded: pl.exploded,
    })),
    hand: me >= 0 ? s.players[me].hand : [],
    deckCount: s.deck.length,
    discardTop: s.discard.length ? s.discard[s.discard.length - 1] : null,
    discardCount: s.discard.length,
    current: s.current,
    turnsLeft: s.turnsLeft,
    phase: s.phase,
    pending: p
      ? {
          kind: p.kind,
          by: p.by,
          cards: p.cards,
          named: p.named,
          target: p.target,
          nopes: p.nopes,
          lastBy: p.lastBy,
          msLeft: Math.max(0, p.deadline - now),
          responder: responder(s),
          responders: reactionPlayers(s),
          passed: p.passed ?? [],
        }
      : null,
    favor: s.favor,
    defuse: s.defuse ? { player: s.defuse.player } : null,
    peek: s.peek && s.peek.player === me ? s.peek : null,
    log: s.log.filter((l) => l.for === undefined || l.for === me).slice(-50),
    chat: (s.chat ?? []).slice(-50),
    winner: s.winner,
    event: s.event,
    rematch: rematchInfo(s, me),
    seq: s.seq,
    score: s.score,
  };
}

/**
 * Tournament: the player sees one table in full. By default that is their own table;
 * a player who rests (or asks to) can watch any other table. Spectators never see hands.
 */
function tournamentView(s: GameState, token: string, now: number, watch: number | null): GameView {
  const t = s.tournament!;
  const ri = s.players.findIndex((p) => p.id === token);
  const mine = t.tables.find((x) => x.a === ri || x.b === ri) ?? null;

  let shown = watch !== null ? t.tables.find((x) => x.id === watch) : undefined;
  if (!shown) shown = mine ?? t.tables.find((x) => x.game.status === "playing") ?? t.tables[0];
  const seated = shown.a === ri || shown.b === ri;
  const base = plainView(shown.game, seated ? token : "", now);

  const standings = s.players
    .map((p, i) => ({ idx: i, name: p.name, avatar: avatarOf(p), wins: t.wins[i], played: t.played[i] }))
    .sort((a, b) => b.wins - a.wins || a.played - b.played || a.name.localeCompare(b.name));

  const tv: TournamentView = {
    id: s.matchId ?? `legacy:${s.code}:${s.games}`,
    round: t.round + 1,
    rounds: t.rounds.length,
    phase: t.phase,
    nextRoundIn: t.nextRoundAt !== null ? Math.max(0, t.nextRoundAt - now) : 0,
    tables: t.tables.map((tb, i) => ({
      id: tb.id,
      num: i + 1,
      seats: [tb.a, tb.b],
      names: [s.players[tb.a].name, s.players[tb.b].name],
      avatars: [avatarOf(s.players[tb.a]), avatarOf(s.players[tb.b])],
      status: tb.game.status === "finished" ? "finished" : "playing",
      winner: tb.winner,
      turn: tb.game.status === "playing" ? (tb.game.players[tb.game.current]?.name ?? null) : null,
      mine: tb.a === ri || tb.b === ri,
    })),
    bye: t.bye !== null ? s.players[t.bye].name : null,
    byeMe: t.bye !== null && t.bye === ri,
    standings,
    total: s.players.length,
    champion: t.champion,
    tie: t.tie,
    names: s.players.map((p) => p.name),
    avatars: s.players.map(avatarOf),
    myIdx: ri,
    myTable: mine ? mine.id : null,
  };

  return {
    ...base,
    code: s.code,
    mode: "tournament",
    maxPlayers: s.maxPlayers,
    isHost: s.players[ri].id === s.hostId,
    seq: s.seq, // room-wide counter: grows whenever any table changes, whichever table is shown
    score: [],
    tournament: tv,
    rematch: t.phase === "finished" ? rematchInfo(s, ri) : null,
    chat: (s.chat ?? [])
      .filter((m) => !m.tableId || m.tableId === shown.id)
      .slice(-50),
    spectator: !seated,
    tableId: shown.id,
  };
}

export function toView(s: GameState, token: string, now: number, watch: number | null = null): GameView {
  const ri = s.players.findIndex((p) => p.id === token);
  if (s.mode === "tournament" && s.tournament && s.status !== "waiting" && ri >= 0) {
    return tournamentView(s, token, now, watch);
  }
  return plainView(s, token, now);
}
