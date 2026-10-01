import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { ALL_TYPES } from "../src/lib/game/cards";
import { botStep } from "../src/lib/game/bot";
import { addPlayer, applyAction, createState, reactionPlayers, tick } from "../src/lib/game/engine";
import { assertDeckIntegrity, assertRoomIntegrity, DECK_VERSION, getDeckCounts, physicalCards } from "../src/lib/game/deck";
import { prepareSavedRoom } from "../src/lib/game/compat";
import { peekStorageKey, shouldShowPeek } from "../src/lib/game/presentation";
import { dispatchAction, IDLE_MS, roundRobinRounds, startRoom, tournamentTick } from "../src/lib/game/tournament";
import { toView } from "../src/lib/game/view";
import type { Action, CardType, GameState } from "../src/lib/game/types";
import { act, arrange, counts, DUEL_COUNTS, finishGame, finishWithExplosion, makeGame, play, rematchAll, resolve, TEST_NOW } from "./game-fixtures";
import { CAT_AVATARS, DEFAULT_AVATAR, randomName, sanitizeAvatar } from "../src/lib/profile";

const ids = (s: GameState) => physicalCards(s).map((c) => c.id).sort();

for (const mode of ["friends", "bot"] as const) {
  test(`${mode}: 100 deals have exactly the 32 cards from the guide, never 4 Defuses`, () => {
    for (let i = 0; i < 100; i++) {
      const s = mode === "bot" ? createState("BOT00", "bot", { id: "human-token", name: "Я" }) : makeGame();
      assert.deepEqual(counts(s), DUEL_COUNTS);
      assert.equal(s.deck.length, 16);
      assert.equal(physicalCards(s).length, 32);
      assert.equal(new Set(ids(s)).size, 32);
      assert.equal(s.deckVersion, DECK_VERSION);
      assert(s.matchId);
      for (const p of s.players) {
        assert.equal(p.hand.length, 8);
        assert(p.hand.some((c) => c.type === "defuse"));
        assert(!p.hand.some((c) => c.type === "kitten"));
      }
    }
  });
}

for (const n of [3, 4, 5, 6]) {
  test(`${n}-player game: Defuse = players + 1 (one in each hand, one spare in the deck), exactly ONE kitten`, () => {
    for (let i = 0; i < 60; i++) {
      const s = makeGame(n);
      assert.deepEqual(counts(s), getDeckCounts(n));
      assert.equal(counts(s).defuse, n + 1);
      assert.equal(counts(s).kitten, 1);
      assert.equal(physicalCards(s).length, Object.values(getDeckCounts(n)).reduce((a, b) => a + b, 0));
      assert.equal(s.deck.filter((c) => c.type === "kitten").length, 1);
      assert.equal(s.deck.filter((c) => c.type === "defuse").length, 1, "the spare Defuse lies in the deck");
      for (const p of s.players) {
        assert.equal(p.hand.length, 8);
        assert.equal(p.hand.filter((c) => c.type === "defuse").length, 1, "each player starts with exactly one Defuse");
        assert(!p.hand.some((c) => c.type === "kitten"));
      }
      assert.equal(new Set(ids(s)).size, physicalCards(s).length);
    }
  });
}

test("Deck never has more than one kitten for any supported player count", () => {
  for (const n of [2, 3, 4, 5, 6]) assert.equal(getDeckCounts(n).kitten, 1);
  assert.throws(() => getDeckCounts(7));
});

test("5 and 6 players receive 8 cards each and keep a useful deck", () => {
  for (const [n, total, deckSize] of [[5, 54, 14], [6, 64, 16]] as const) {
    const s = makeGame(n);
    assert.equal(physicalCards(s).length, total);
    assert.equal(s.deck.length, deckSize);
    assert.equal(s.deck.filter((c) => c.type === "kitten").length, 1);
    assert.equal(s.deck.filter((c) => c.type === "defuse").length, 1);
    assert(s.players.every((p) => p.hand.length === 8 && p.hand.filter((c) => c.type === "defuse").length === 1));
    assert.equal(s.maxPlayers, n);
  }
  assert.equal(createState("SIXRM", "friends", { id: "host-six", name: "Хост" }, 999).maxPlayers, 6);
});


test("Spare Defuse is shuffled before the seven-card deal, per the supplied rules", (t) => {
  t.mock.method(Math, "random", () => 0.999999);
  const s = makeGame();
  assert.equal(s.players[0].hand.filter((c) => c.type === "defuse").length, 2);
  assert.equal(s.players[1].hand.filter((c) => c.type === "defuse").length, 1);
  assert.equal(s.deck.filter((c) => c.type === "defuse").length, 0);
  assert.deepEqual(counts(s), DUEL_COUNTS);
});

test("Inventory guard detects duplicate IDs and an extra Defuse", () => {
  const s = makeGame();
  const extra = { id: randomUUID(), type: "defuse" as const };
  s.deck.push(extra);
  assert.throws(() => assertDeckIntegrity(s), /defuse/);
  s.deck.pop();
  s.deck.push(s.players[0].hand[0]);
  assert.throws(() => assertDeckIntegrity(s), /повторная/);
});

test("Normal draw moves exactly one existing card and ends one turn", () => {
  const s = makeGame();
  arrange(s, [["defuse"], ["defuse"]], ["skip"]);
  const before = ids(s);
  const top = s.deck[0];
  act(s, 0, { type: "draw" });
  assert.equal(s.current, 1);
  assert(s.players[0].hand.some((c) => c.id === top.id));
  assert.deepEqual(ids(s), before);
});

test("Future shows exactly the next three cards in order, only to its owner", () => {
  const s = makeGame();
  arrange(s, [["future", "defuse"], ["defuse"]], ["cat1", "kitten", "skip"]);
  const deck = structuredClone(s.deck);
  const before = ids(s);
  play(s, 0, "future"); resolve(s);
  assert.deepEqual(s.peek?.cards, deck.slice(0, 3));
  assert.deepEqual(s.deck, deck);
  assert.equal(s.current, 0);
  assert.deepEqual(ids(s), before);
  assert(toView(s, s.players[0].id, TEST_NOW).peek);
  assert.equal(toView(s, s.players[1].id, TEST_NOW).peek, null);
  assert.equal(toView(s, "spectator-token", TEST_NOW).peek, null);
  assert(!toView(s, s.players[1].id, TEST_NOW).log.some((l) => l.for === 0));
});

test("Every Future play has a fresh sequence and opens after a previous dismissal", () => {
  const s = makeGame();
  arrange(s, [["future", "future", "future"], ["defuse"]]);
  let last = -1;
  for (let i = 0; i < 3; i++) {
    play(s, 0, "future"); resolve(s);
    const v = toView(s, s.players[0].id, TEST_NOW);
    assert(v.peek && v.peek.seq > last);
    assert(shouldShowPeek(v, last));
    assert(!shouldShowPeek(v, v.peek.seq));
    last = v.peek.seq;
  }
});

for (const n of [1, 2]) {
  test(`Future handles only ${n} cards left without adding or removing cards`, () => {
    const s = makeGame();
    arrange(s, [["future"], ["defuse"]], ["kitten", "skip"]);
    s.players[1].hand.push(...s.deck.splice(n));
    const before = structuredClone(s.deck);
    play(s, 0, "future"); resolve(s);
    assert.equal(s.peek?.cards.length, n);
    assert.deepEqual(s.peek?.cards, before);
    assert.deepEqual(s.deck, before);
  });
}

test("Future is available after 5 rematches: dismissal is scoped to a unique deal", () => {
  const s = makeGame();
  const saved = new Map<string, number>();
  const oldCards = new Set<string>();
  let previousMatch = "";
  for (let round = 0; round < 5; round++) {
    assert.notEqual(s.matchId, previousMatch);
    assert(physicalCards(s).every((c) => !oldCards.has(c.id)));
    ids(s).forEach((id) => oldCards.add(id));
    assert.deepEqual(counts(s), DUEL_COUNTS);
    previousMatch = s.matchId!;
    arrange(s, [["future", "future"], ["defuse"]]);
    for (let use = 0; use < 2; use++) {
      play(s, 0, "future"); resolve(s);
      const v = toView(s, s.players[0].id, TEST_NOW);
      const key = peekStorageKey(v);
      assert(shouldShowPeek(v, saved.get(key)), "The new Future must not inherit an old dismissal");
      saved.set(key, v.peek!.seq);
    }
    finishWithExplosion(s);
    const score = [...s.score];
    rematchAll(s);
    assert.deepEqual(s.score, score);
    assert.equal(s.peek, null);
    assert.equal(s.pending, null);
    assert.equal(s.favor, null);
    assert.equal(s.defuse, null);
    assert.equal(s.discard.length, 0);
    assert.equal(s.deck.length, 16);
    assert.equal(s.phase, "action");
    assert(s.players.every((p) => !p.exploded && p.hand.length === 8));
  }
});

test("Nope cancels Future; Nope of Nope restores it without restoring spent cards", () => {
  const s = makeGame();
  arrange(s, [["future", "nope"], ["nope"]]);
  play(s, 0, "future");
  act(s, 1, { type: "nope" });
  assert.equal(s.peek, null);
  act(s, 0, { type: "nope" });
  resolve(s);
  assert(s.peek);
  assert.equal(s.discard.filter((c) => c.type === "nope").length, 2);
  assert.equal(s.discard.filter((c) => c.type === "future").length, 1);

  arrange(s, [["future"], ["nope"]]);
  play(s, 0, "future"); act(s, 1, { type: "nope" }); resolve(s);
  assert.equal(s.peek, null);
  assert.equal(s.current, 0);
});

test("Nope chain, 3 players: only the player whose turn it is may answer a Nope", () => {
  const s = makeGame(3);
  arrange(s, [["skip", "nope", "nope"], ["nope", "defuse"], ["nope", "defuse"]]);
  play(s, 0, "skip");
  // The card is in force: every other living player may Nope it.
  assert.deepEqual(reactionPlayers(s), [1, 2]);
  act(s, 1, { type: "nope" });
  // Cancelled: ONLY the player who played the card may answer — player 2 has a Nope but cannot use it.
  assert.deepEqual(reactionPlayers(s), [0]);
  assert.throws(() => applyAction(s, 2, { type: "nope" }, TEST_NOW), /чей сейчас ход/);
  assert.throws(() => applyAction(s, 2, { type: "pass" }, TEST_NOW));
  assert.equal(s.pending!.nopes, 1);
  // The original player answers with their own Nope — the card is back in force.
  act(s, 0, { type: "nope" });
  assert.equal(s.pending!.nopes, 2);
  assert.deepEqual(reactionPlayers(s), [1, 2], "after the counter-Nope any other player may answer again");
  act(s, 2, { type: "nope" });
  assert.deepEqual(reactionPlayers(s), [0]);
  assert.throws(() => applyAction(s, 1, { type: "nope" }, TEST_NOW));
  // The owner passes: the third Nope stands and the card is cancelled.
  act(s, 0, { type: "pass" });
  assert.equal(s.pending, null);
  assert.equal(s.current, 0, "a cancelled Skip does not end the turn");
  assert.equal(s.discard.filter((c) => c.type === "nope").length, 3);
});

test("Nope chain, 4 players: passing by bystanders never lets them answer a Nope", () => {
  const s = makeGame(4);
  arrange(s, [["attack", "nope"], ["defuse"], ["defuse"], ["nope"]]);
  play(s, 0, "attack");
  assert.deepEqual(reactionPlayers(s), [1, 2, 3]);
  act(s, 1, { type: "pass" });
  assert.equal(s.phase, "nope");
  act(s, 3, { type: "nope" });
  assert.deepEqual(reactionPlayers(s), [0]);
  act(s, 0, { type: "nope" }); resolve(s);
  assert.equal(s.current, 1);
  assert.equal(s.turnsLeft, 2);
});

test("Nope chain: the Nope window of the owner times out and leaves the card cancelled", () => {
  const s = makeGame(3);
  arrange(s, [["skip"], ["nope"], ["defuse"]]);
  play(s, 0, "skip");
  act(s, 1, { type: "nope" });
  tick(s, s.pending!.deadline + 1, botStep);
  assert.equal(s.pending, null);
  assert.equal(s.current, 0);
});

test("Nope chain, duel: the rule is unchanged (only the other player answers)", () => {
  const s = makeGame(2);
  arrange(s, [["future", "nope"], ["nope"]]);
  play(s, 0, "future");
  assert.deepEqual(reactionPlayers(s), [1]);
  act(s, 1, { type: "nope" });
  assert.deepEqual(reactionPlayers(s), [0]);
  act(s, 0, { type: "nope" });
  assert.deepEqual(reactionPlayers(s), [1]);
  resolve(s);
  assert(s.peek, "an even number of Nopes leaves the card in force");
});

test("Nope timeout resolves an effect once, and pass does not erase other players' opportunity", () => {
  const s = makeGame(3);
  arrange(s, [["skip"], ["nope"], ["nope"]]);
  play(s, 0, "skip");
  const deadline = s.pending!.deadline;
  act(s, 1, { type: "pass" });
  assert(s.pending && s.current === 0);
  tick(s, deadline + 1, botStep);
  assert.equal(s.current, 1);
  tick(s, deadline + 100, botStep);
  assert.equal(s.current, 1);
  assertDeckIntegrity(s);
});

for (const underAttack of [false, true]) {
  test(`Skip ends exactly one turn; underAttack=${underAttack}`, () => {
    const s = makeGame();
    arrange(s, [["skip", "skip"], ["defuse"]]);
    s.underAttack = underAttack;
    s.turnsLeft = underAttack ? 2 : 1;
    const deck = structuredClone(s.deck);
    play(s, 0, "skip"); resolve(s);
    assert.deepEqual(s.deck, deck);
    assert.equal(s.turnsLeft, 1);
    assert.equal(s.current, underAttack ? 0 : 1);
    if (underAttack) { play(s, 0, "skip"); resolve(s); assert.equal(s.current, 1); }
  });
}

for (const oneTurnAlreadyDrawn of [false, true]) {
  test(`Attack stacking adds two to remaining turns; already drew=${oneTurnAlreadyDrawn}`, () => {
    const s = makeGame();
    arrange(s, [["attack"], ["attack"]], ["cat1"]);
    play(s, 0, "attack"); resolve(s);
    assert.equal(s.current, 1);
    assert.equal(s.turnsLeft, 2);
    if (oneTurnAlreadyDrawn) act(s, 1, { type: "draw" });
    play(s, 1, "attack"); resolve(s);
    assert.equal(s.current, 0);
    assert.equal(s.turnsLeft, oneTurnAlreadyDrawn ? 3 : 4);
  });
}

test("Noping an Attack neither ends the turn nor makes the next player draw", () => {
  const s = makeGame();
  arrange(s, [["attack"], ["nope"]]);
  const deck = structuredClone(s.deck);
  play(s, 0, "attack"); act(s, 1, { type: "nope" }); resolve(s);
  assert.equal(s.current, 0);
  assert.equal(s.turnsLeft, 1);
  assert.equal(s.underAttack, false);
  assert.deepEqual(s.deck, deck);
});

for (const position of [0, 4, 20]) {
  test(`Defuse consumes one existing card and reinserts the SAME kitten at position ${position}`, () => {
    const s = makeGame();
    arrange(s, [["defuse", "cat1"], ["defuse"]], ["kitten"]);
    const before = ids(s);
    const kitten = s.deck[0];
    const remaining = s.deck.slice(1);
    act(s, 0, { type: "draw" });
    assert.equal(s.phase, "defuse");
    assert.equal(s.current, 0);
    assert.equal(s.discard.at(-1)?.type, "defuse");
    assert.equal(s.defuse?.kitten.id, kitten.id);
    assert(!s.players[0].hand.some((c) => c.type === "defuse"));
    assert.throws(() => applyAction(s, 1, { type: "nope" }, TEST_NOW), /Нечего отменять/);
    act(s, 0, { type: "place", position });
    const expected = [...remaining]; expected.splice(position, 0, kitten);
    assert.deepEqual(s.deck, expected);
    assert.deepEqual(ids(s), before);
    assert.equal(s.current, 1);
    assert.equal(s.defuse, null);
  });
}

test("Defuse during an Attack ends only one of the required turns", () => {
  const s = makeGame();
  arrange(s, [["defuse"], ["defuse"]], ["kitten"]);
  s.underAttack = true; s.turnsLeft = 2;
  act(s, 0, { type: "draw" }); act(s, 0, { type: "place", position: s.deck.length });
  assert.equal(s.current, 0);
  assert.equal(s.turnsLeft, 1);
  assert.equal(s.underAttack, true);
});

test("Explosion discards the remaining hand first and leaves the kitten on top", () => {
  const s = makeGame();
  arrange(s, [["cat1", "cat2", "skip"], ["defuse"]], ["kitten"]);
  const before = ids(s);
  act(s, 0, { type: "draw" });
  assert.equal(s.status, "finished");
  assert.equal(s.winner, 1);
  assert.equal(s.score[1], 1);
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.discard.at(-1)?.type, "kitten");
  assert.deepEqual(ids(s), before);
});

test("3+ players: the only kitten returns to the deck after a non-final explosion", () => {
  const s = makeGame(3);
  arrange(s, [["cat1"], ["skip"], ["defuse"]], ["kitten"]);
  act(s, 0, { type: "draw" });
  assert.equal(s.status, "playing");
  assert(s.players[0].exploded);
  assert.equal(s.current, 1);
  assert.equal(s.deck.filter((c) => c.type === "kitten").length, 1, "exactly one kitten is back in the deck");
  assert.equal(s.discard.some((c) => c.type === "kitten"), false);
  assert.equal(counts(s).kitten, 1);
  play(s, 1, "skip"); resolve(s);
  assert.equal(s.current, 2);
  assert.throws(() => applyAction(s, 0, { type: "nope" }, TEST_NOW), /выбыл/);
});

test("3 players: two explosions end the game, the kitten finishes on top of the discard", () => {
  const s = makeGame(3);
  arrange(s, [["cat1"], ["cat2"], ["defuse"]], ["kitten"]);
  act(s, 0, { type: "draw" });
  // put the (only) kitten on top for player 1 without touching any other card
  const k = s.deck.findIndex((c) => c.type === "kitten");
  s.deck.unshift(...s.deck.splice(k, 1));
  act(s, 1, { type: "draw" });
  assert.equal(s.status, "finished");
  assert.equal(s.winner, 2);
  assert.equal(s.discard.at(-1)?.type, "kitten");
  assert.equal(s.deck.some((c) => c.type === "kitten"), false);
  assert.equal(counts(s).kitten, 1);
});

test("Favor honors a selected third player and transfers their chosen card, not a copy", () => {
  const s = makeGame(3);
  arrange(s, [["favor"], ["cat1"], ["cat2", "defuse"]]);
  const before = ids(s);
  const card = s.players[2].hand[0];
  play(s, 0, "favor", 1, { target: 2 }); resolve(s);
  assert.deepEqual(s.favor, { giver: 2, receiver: 0 });
  assert.throws(() => applyAction(s, 1, { type: "give", cardId: s.players[1].hand[0].id }, TEST_NOW));
  act(s, 2, { type: "give", cardId: card.id });
  assert(s.players[0].hand.some((c) => c.id === card.id));
  assert(!s.players[2].hand.some((c) => c.id === card.id));
  assert.equal(s.current, 0);
  assert.equal(s.phase, "action");
  assert.deepEqual(ids(s), before);
});

test("Favor targeting an empty hand completes without getting stuck", () => {
  const s = makeGame(); arrange(s, [["favor"], []]);
  play(s, 0, "favor"); resolve(s);
  assert.equal(s.favor, null);
  assert.equal(s.phase, "action");
});

for (const type of ["cat1", "attack", "defuse"] as const) {
  test(`Pair of ${type} steals exactly one card without applying its printed effect`, () => {
    const s = makeGame(); arrange(s, [[type, type], ["cat2", "skip"]]);
    const before = ids(s);
    play(s, 0, type, 2); resolve(s);
    assert.equal(s.players[0].hand.length, 1);
    assert.equal(s.players[1].hand.length, 1);
    assert.equal(s.discard.filter((c) => c.type === type).length, 2);
    assert.equal(s.current, 0);
    assert.equal(s.turnsLeft, 1);
    assert.deepEqual(ids(s), before);
  });
}

for (const namedExists of [true, false]) {
  test(`Triple receives the named card only if present: ${namedExists}`, () => {
    const s = makeGame();
    arrange(s, [["cat1", "cat1", "cat1"], namedExists ? ["defuse", "defuse"] : ["skip"]]);
    play(s, 0, "cat1", 3, { named: "defuse" }); resolve(s);
    assert.equal(s.players[0].hand.length, namedExists ? 1 : 0);
    assert.equal(s.players[1].hand.length, 1);
    assert.equal(s.current, 0);
  });
}

test("Nope cancels stealing combinations without returning the spent cards", () => {
  const s = makeGame(); arrange(s, [["cat1", "cat1"], ["nope", "defuse"]]);
  play(s, 0, "cat1", 2); act(s, 1, { type: "nope" }); resolve(s);
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.players[1].hand[0].type, "defuse");
  assert.equal(s.discard.length, 3);
});

test("Shuffle preserves all physical cards, changes only the deck order, and clears bot knowledge", (t) => {
  const s = makeGame(); arrange(s, [["shuffle"], ["defuse"]]);
  const deck = [...s.deck];
  s.botKnown = deck.slice(0, 3).map((c) => c.id);
  t.mock.method(Math, "random", () => 0);
  play(s, 0, "shuffle"); resolve(s);
  assert.notDeepEqual(s.deck, deck);
  assert.deepEqual(s.deck.map((c) => c.id).sort(), deck.map((c) => c.id).sort());
  assert.deepEqual(s.botKnown, []);
  assert.equal(s.current, 0);
});

test("Invalid play requests cannot partially remove, duplicate or create cards", () => {
  const s = makeGame(); arrange(s, [["future", "favor", "cat1", "cat1"], ["defuse"]]);
  const future = s.players[0].hand[0].id;
  const favor = s.players[0].hand[1].id;
  const cats = s.players[0].hand.filter((c) => c.type === "cat1").map((c) => c.id);
  const bad: unknown[] = [
    { type: "play", cardIds: [future, "missing-card"] },
    { type: "play", cardIds: [future, future] },
    { type: "play", cardIds: [future, favor] },
    { type: "play", cardIds: [favor], target: 200 },
    { type: "play", cardIds: [favor], target: 0 },
    { type: "play", cardIds: cats, target: -1 },
    { type: "play", cardIds: [future], named: "__proto__" },
    { type: "play" }, { type: "play", cardIds: "future" }, { type: "magic" },
  ];
  for (const action of bad) {
    const before = structuredClone(s);
    assert.throws(() => applyAction(s, 0, action as Action, TEST_NOW));
    assert.deepEqual(s, before);
  }
});

test("Invalid reinsertion positions leave the defused kitten and all other cards untouched", () => {
  const s = makeGame(); arrange(s, [["defuse"], ["defuse"]], ["kitten"]);
  act(s, 0, { type: "draw" });
  for (const position of [NaN, Infinity, -1, 1.5, s.deck.length + 1]) {
    const before = structuredClone(s);
    assert.throws(() => applyAction(s, 0, { type: "place", position }, TEST_NOW));
    assert.deepEqual(s, before);
  }
});

for (const type of ["cat1", "cat2", "cat3", "defuse", "nope"] as const) {
  test(`${type} cannot be used as an ordinary single action`, () => {
    const s = makeGame(); arrange(s, [[type], ["defuse"]]);
    const before = structuredClone(s);
    assert.throws(() => applyAction(s, 0, { type: "play", cardIds: [s.players[0].hand[0].id] }, TEST_NOW));
    assert.deepEqual(s, before);
  });
}

test("Legacy oversized games are redealt once without losing the score", () => {
  const s = makeGame();
  delete s.deckVersion;
  delete s.matchId;
  s.deck.push({ id: randomUUID(), type: "defuse" }, { id: randomUUID(), type: "kitten" });
  s.score = [3, 2];
  prepareSavedRoom(s, TEST_NOW);
  assert.deepEqual(counts(s), DUEL_COUNTS);
  assert.deepEqual(s.score, [3, 2]);
  assert(s.log.some((l) => l.text.includes("пересдана")));
  const id = s.matchId;
  prepareSavedRoom(s, TEST_NOW + 1);
  assert.equal(s.matchId, id);
});

test("Already-correct saved games keep their hands when adding rule metadata", () => {
  const s = makeGame(); const before = ids(s);
  delete s.deckVersion; delete s.matchId;
  prepareSavedRoom(s, TEST_NOW);
  assert.deepEqual(ids(s), before);
  assert.equal(s.games, 1);
});

for (const n of [2, 3, 4, 5, 6]) {
  test(`160 complete ${n}-player games preserve exact counts after EVERY move`, () => {
    for (let trial = 0; trial < 160; trial++) {
      const s = makeGame(n);
      s.players.forEach((p) => p.isBot = true);
      const initial = ids(s);
      let now = TEST_NOW;
      let steps = 0;
      while (s.status === "playing" && steps++ < 3000) {
        now += 2000;
        tick(s, now, botStep);
        assertDeckIntegrity(s);
        assert(s.deck.filter((c) => c.type === "kitten").length <= 1, "never more than one kitten in the deck");
        assert.deepEqual(ids(s), initial);
        if (s.pending) for (const c of s.pending.cards) assert(s.discard.some((d) => d.id === c.id));
      }
      assert.equal(s.status, "finished", `Game ${trial} got stuck in ${s.phase}`);
      assert.equal(s.players.filter((p) => !p.exploded).length, 1);
      assert.equal(s.discard.at(-1)?.type, "kitten");
    }
  });
}

for (const n of [2, 3, 4, 9, 10]) {
  test(`Tournament of ${n}: every table has 32 cards; all pairs, restart and privacy work`, () => {
    const s = createState("TOUR0", "tournament", { id: "tournament-player-0", name: "P0" });
    for (let i = 1; i < n; i++) addPlayer(s, `tournament-player-${i}`, `P${i}`, TEST_NOW);
    startRoom(s, s.hostId, TEST_NOW);
    const tournamentId = s.matchId;
    const firstMatch = s.tournament!.tables[0].game.matchId;
    const firstTableId = s.tournament!.tables[0].id;
    const schedule = roundRobinRounds(n).flat();
    assert.equal(new Set(schedule.map(([a, b]) => [a, b].sort((x, y) => x - y).join("-"))).size, n * (n - 1) / 2);
    for (const table of s.tournament!.tables) {
      assert.deepEqual(counts(table.game), DUEL_COUNTS);
      const token = s.players[table.a].id;
      const v = toView(s, token, TEST_NOW);
      assert.equal(v.hand.length, 8);
      const other = s.tournament!.tables.find((x) => x.id !== table.id);
      if (other) {
        const spectator = toView(s, token, TEST_NOW, other.id);
        assert.equal(spectator.hand.length, 0);
        assert.equal(spectator.peek, null);
        assert(spectator.spectator);
      }
    }
    let now = TEST_NOW;
    let guard = 0;
    while (s.tournament!.phase !== "finished" && guard++ < 20000) {
      now += IDLE_MS + 100;
      tournamentTick(s, now);
      assertRoomIntegrity(s);
      for (const table of s.tournament!.tables) assert.deepEqual(counts(table.game), DUEL_COUNTS);
    }
    assert.equal(s.tournament!.phase, "finished");
    assert(s.tournament!.played.every((x) => x === n - 1));
    assert.equal(s.tournament!.wins.reduce((a, b) => a + b, 0), n * (n - 1) / 2);
    // «Новый турнир» starts only after EVERY player agrees
    const everyone = s.players.map((p) => p.id);
    for (const id of everyone.slice(0, -1)) {
      dispatchAction(s, id, { type: "rematch" }, now);
      assert.equal(s.tournament!.phase, "finished", "the tournament must wait for the others");
      assert.equal(s.matchId, tournamentId);
    }
    dispatchAction(s, everyone.at(-1)!, { type: "rematch" }, now);
    assert.notEqual(s.matchId, tournamentId);
    assert.notEqual(s.tournament!.tables[0].game.matchId, firstMatch);
    assert.notEqual(s.tournament!.tables[0].id, firstTableId);
    assert(s.tournament!.wins.every((w) => w === 0));
    assertRoomIntegrity(s);
  });
}

test("The audit covers every card type in the game", () => {
  assert.deepEqual([...ALL_TYPES].sort(), Object.keys(DUEL_COUNTS).sort());
});

// ───────────── rematch needs everybody ─────────────

for (const n of [2, 3, 4, 5, 6]) {
  test(`${n} players: a rematch starts only after ALL of them press the button`, () => {
    const s = makeGame(n);
    finishGame(s);
    const matchId = s.matchId;
    const score = [...s.score];
    for (let i = 0; i < n - 1; i++) {
      act(s, i, { type: "rematch" });
      assert.equal(s.status, "finished", `still finished after ${i + 1} of ${n} votes`);
      assert.equal(s.matchId, matchId);
      assert.deepEqual(s.rematchVotes, Array.from({ length: i + 1 }, (_, k) => k));
      const view = toView(s, s.players[0].id, TEST_NOW);
      assert.equal(view.rematch?.ready.length, i + 1);
      assert.equal(view.rematch?.waiting.length, n - i - 1);
      assert.equal(view.rematch?.iVoted, true);
    }
    // the last player has not voted yet and sees that the game waits for them
    const waiting = toView(s, s.players[n - 1].id, TEST_NOW);
    assert.equal(waiting.rematch?.iVoted, false);
    act(s, n - 1, { type: "rematch" });
    assert.equal(s.status, "playing");
    assert.notEqual(s.matchId, matchId);
    assert.deepEqual(s.rematchVotes, []);
    assert.deepEqual(s.score, score, "the score survives a rematch");
    assert.deepEqual(counts(s), getDeckCounts(n));
    assert.equal(toView(s, s.players[0].id, TEST_NOW).rematch, null);
  });
}

test("Pressing «Реванш» twice does not count twice and does not start the game", () => {
  const s = makeGame(3);
  finishGame(s);
  act(s, 0, { type: "rematch" });
  act(s, 0, { type: "rematch" });
  act(s, 0, { type: "rematch" });
  assert.deepEqual(s.rematchVotes, [0]);
  assert.equal(s.status, "finished");
  assert.equal(s.log.filter((l) => l.text.includes("готов(а) к реваншу")).length, 1);
});

test("A rematch cannot be requested while the game is still going", () => {
  const s = makeGame(3);
  assert.throws(() => applyAction(s, 0, { type: "rematch" }, TEST_NOW), /ещё идёт/);
  assert.deepEqual(s.rematchVotes, []);
});

test("Against the bot a rematch is instant (the bot always agrees)", () => {
  const s = createState("BOTRM", "bot", { id: "human-token-1", name: "Я" });
  finishGame(s);
  const matchId = s.matchId;
  assert.equal(toView(s, "human-token-1", TEST_NOW).rematch, null);
  act(s, 0, { type: "rematch" });
  assert.equal(s.status, "playing");
  assert.notEqual(s.matchId, matchId);
});

test("Votes of an old finished game never leak into the next one", () => {
  const s = makeGame(3);
  finishGame(s);
  act(s, 0, { type: "rematch" });
  act(s, 1, { type: "rematch" });
  act(s, 2, { type: "rematch" });
  finishGame(s);
  assert.deepEqual(s.rematchVotes, []);
  act(s, 2, { type: "rematch" });
  assert.equal(s.status, "finished");
  act(s, 0, { type: "rematch" });
  assert.equal(s.status, "finished");
  act(s, 1, { type: "rematch" });
  assert.equal(s.status, "playing");
});

test("Tournament «Новый турнир» also waits for every player", () => {
  const s = createState("TRMAT", "tournament", { id: "tournament-player-0", name: "P0" });
  addPlayer(s, "tournament-player-1", "P1", TEST_NOW);
  addPlayer(s, "tournament-player-2", "P2", TEST_NOW);
  startRoom(s, s.hostId, TEST_NOW);
  let now = TEST_NOW, guard = 0;
  while (s.tournament!.phase !== "finished" && guard++ < 5000) { now += IDLE_MS + 100; tournamentTick(s, now); }
  assert.equal(s.tournament!.phase, "finished");
  const before = s.matchId;
  dispatchAction(s, s.players[0].id, { type: "rematch" }, now);
  const view = toView(s, s.players[1].id, now);
  assert.equal(view.rematch?.ready.length, 1);
  assert.equal(view.rematch?.waiting.length, 2);
  assert.equal(s.matchId, before);
  assert.throws(() => dispatchAction(s, "stranger-token-1", { type: "rematch" }, now));
  dispatchAction(s, s.players[1].id, { type: "rematch" }, now);
  assert.equal(s.tournament!.phase, "finished");
  dispatchAction(s, s.players[2].id, { type: "rematch" }, now);
  assert.notEqual(s.matchId, before);
  assert.equal(s.tournament!.phase, "round");
  assert.deepEqual(s.rematchVotes, []);
});

// ───────────── profile: smiley + random names ─────────────

test("Only whitelisted cat smileys are accepted; anything else becomes the default", () => {
  assert(CAT_AVATARS.length >= 24, "the picker includes additional cat variants");
  for (const extra of ["🐈‍⬛", "🐯", "🐆", "😼💣", "🐈‍⬛🌙", "🦁👑"]) assert(CAT_AVATARS.includes(extra as never));
  for (const a of CAT_AVATARS) assert.equal(sanitizeAvatar(a), a);
  for (const bad of ["💣", "<script>", "", "😼😼", undefined, null, 5, "🤖"]) assert.equal(sanitizeAvatar(bad), DEFAULT_AVATAR);
});

test("Random names are readable, short, and a reroll never returns the same name", () => {
  const seen = new Set<string>();
  let previous = randomName();
  for (let i = 0; i < 500; i++) {
    const name = randomName(previous);
    assert.notEqual(name, previous);
    assert(name.length >= 5 && name.length <= 24, name);
    assert.match(name, /^[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+$/);
    seen.add(name);
    previous = name;
  }
  assert(seen.size > 100, "enough variety");
});

test("Chosen smileys are stored per player and shown to everybody; bots keep the robot", () => {
  const s = createState("AVTRS", "friends", { id: "host-token-1", name: "Хост", avatar: "🦁" }, 3);
  addPlayer(s, "guest-token-1", "Гость", TEST_NOW, "🙀");
  addPlayer(s, "guest-token-2", "Хакер", TEST_NOW, "💣");
  assert.deepEqual(s.players.map((p) => p.avatar), ["🦁", "🙀", DEFAULT_AVATAR]);
  const view = toView(s, "guest-token-1", TEST_NOW);
  assert.deepEqual(view.players.map((p) => p.avatar), ["🦁", "🙀", DEFAULT_AVATAR]);
  const bot = createState("AVTBT", "bot", { id: "human-token-2", name: "Я", avatar: "😻" });
  assert.deepEqual(toView(bot, "human-token-2", TEST_NOW).players.map((p) => p.avatar), ["😻", "🤖"]);
  assert.equal(bot.players[1].name, "Бот Мурзик");
});

test("Tournament tables, standings and the lobby keep each player's smiley", () => {
  const s = createState("AVTTR", "tournament", { id: "tournament-aaaa-0", name: "A", avatar: "😸" });
  addPlayer(s, "tournament-aaaa-1", "B", TEST_NOW, "🐈");
  addPlayer(s, "tournament-aaaa-2", "C", TEST_NOW, "😾");
  startRoom(s, s.hostId, TEST_NOW);
  const v = toView(s, "tournament-aaaa-0", TEST_NOW);
  assert.deepEqual(v.tournament!.avatars, ["😸", "🐈", "😾"]);
  assert(v.tournament!.standings.every((r) => ["😸", "🐈", "😾"].includes(r.avatar)));
  for (const t of v.tournament!.tables) assert(t.avatars.every((a) => ["😸", "🐈", "😾"].includes(a)));
  for (const table of s.tournament!.tables) {
    assert.equal(table.game.players[0].avatar, s.players[table.a].avatar);
    assert.equal(table.game.players[1].avatar, s.players[table.b].avatar);
  }
});

test("Saved games from before smileys still render (default smiley)", () => {
  const s = makeGame(2);
  s.players.forEach((p) => delete p.avatar);
  delete s.rematchVotes;
  assert.deepEqual(toView(s, s.players[0].id, TEST_NOW).players.map((p) => p.avatar), [DEFAULT_AVATAR, DEFAULT_AVATAR]);
  finishGame(s);
  delete s.rematchVotes;
  act(s, 0, { type: "rematch" });
  act(s, 1, { type: "rematch" });
  assert.equal(s.status, "playing");
});
