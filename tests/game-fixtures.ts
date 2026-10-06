import assert from "node:assert/strict";
import { addPlayer, applyAction, createState, hostStart, responder } from "../src/lib/game/engine";
import { assertDeckIntegrity, physicalCards } from "../src/lib/game/deck";
import type { Action, Card, CardType, GameState } from "../src/lib/game/types";

export const TEST_NOW = 1_000_000;
export const DUEL_COUNTS = {
  kitten: 1, defuse: 3, attack: 2, skip: 3, favor: 3, shuffle: 2,
  future: 3, nope: 3, cat1: 4, cat2: 4, cat3: 4,
};

export function makeGame(n = 2): GameState {
  const s = createState("TESTS", "friends", { id: "player-token-0", name: "Игрок 0" }, n);
  for (let i = 1; i < n; i++) addPlayer(s, `player-token-${i}`, `Игрок ${i}`, TEST_NOW);
  // Full rooms never auto-start: the host presses "start", like in the real UI.
  hostStart(s, "player-token-0", TEST_NOW);
  s.current = 0;
  return s;
}

/** Deterministic scenarios move existing cards; they never manufacture extra cards. */
export function arrange(s: GameState, hands: CardType[][], top: CardType[] = []): void {
  const pool = physicalCards(s);
  const take = (type: CardType): Card => {
    const i = pool.findIndex((c) => c.type === type);
    assert(i >= 0, `Fixture cannot find ${type}`);
    return pool.splice(i, 1)[0];
  };
  s.players.forEach((p, i) => { p.hand = (hands[i] ?? []).map(take); p.exploded = false; });
  const head = top.map(take);
  s.deck = [...head, ...pool];
  s.discard = [];
  s.phase = "action";
  s.pending = null;
  s.favor = null;
  s.defuse = null;
  s.peek = null;
  s.current = 0;
  s.turnsLeft = 1;
  s.underAttack = false;
  s.status = "playing";
  s.winner = null;
  s.botKnown = [];
  s.botNextAt = null;
  s.event = null;
  s.seq++;
  assertDeckIntegrity(s);
}

export function act(s: GameState, pi: number, action: Action, now = TEST_NOW) {
  applyAction(s, pi, action, now);
  assertDeckIntegrity(s);
}

export function play(s: GameState, pi: number, type: CardType, count = 1, extra: { named?: CardType; target?: number } = {}) {
  const cards = s.players[pi].hand.filter((c) => c.type === type).slice(0, count);
  assert.equal(cards.length, count);
  act(s, pi, { type: "play", cardIds: cards.map((c) => c.id), ...extra });
}

export function resolve(s: GameState) {
  let guard = 0;
  while (s.phase === "nope") {
    assert(guard++ < 20, "Reaction window never completed");
    const pi = responder(s);
    assert(pi >= 0);
    act(s, pi, { type: "pass" });
  }
}

export function counts(s: GameState): Record<CardType, number> {
  const result = Object.fromEntries(Object.keys(DUEL_COUNTS).map((type) => [type, 0])) as Record<CardType, number>;
  physicalCards(s).forEach((c) => result[c.type]++);
  return result;
}

/** Everybody presses «Реванш» (the engine only deals again after the last human agrees). */
export function rematchAll(s: GameState) {
  s.players.forEach((p, i) => { if (!p.isBot) act(s, i, { type: "rematch" }); });
}

export function finishWithExplosion(s: GameState, loser = 0) {
  const hands: CardType[][] = s.players.map((_, i) => i === loser ? ["cat1"] : ["defuse"]);
  arrange(s, hands, ["kitten"]);
  s.current = loser;
  act(s, loser, { type: "draw" });
}

/** Plays a game of any size to its end: everybody except the last player explodes one by one. */
export function finishGame(s: GameState) {
  let guard = 0;
  while (s.status === "playing" && guard++ < 10) {
    const loser = s.players.findIndex((p) => !p.exploded);
    const mine = s.players[loser].hand;
    s.discard.push(...mine.filter((c) => c.type === "defuse"));
    s.players[loser].hand = mine.filter((c) => c.type !== "defuse");
    const k = s.deck.findIndex((c) => c.type === "kitten");
    s.deck.unshift(...s.deck.splice(k, 1));
    s.phase = "action"; s.pending = null; s.favor = null; s.defuse = null;
    s.current = loser; s.turnsLeft = 1;
    act(s, loser, { type: "draw" });
  }
  assert.equal(s.status, "finished");
}
