import { randomUUID } from "node:crypto";
import { ALL_TYPES, CARD_INFO } from "./cards";
import type { Card, CardType, GameState } from "./types";

export const DECK_VERSION = 3;
export type DeckCounts = Record<CardType, number>;

/** The supplied rules describe a 32-card duel. Counts include both hands and the deck. */
export function getDeckCounts(players: number): DeckCounts {
  if (!Number.isInteger(players) || players < 2 || players > 6) {
    throw new Error("За одним столом должно быть от 2 до 6 игроков");
  }
  const duel = Object.fromEntries(ALL_TYPES.map((type) => [type, CARD_INFO[type].count])) as DeckCounts;
  if (players === 2) return duel;

  // Explicit multiplayer extension, not used for bots or tournament duels.
  // Defuse = players + 1 (one in each starting hand + one spare in the deck).
  // There is ALWAYS exactly one kitten, regardless of the number of players.
  const common = Math.max(4, players);
  const tactical = Math.max(5, players + 1);
  return {
    ...duel,
    kitten: 1,
    defuse: players + 1,
    attack: common,
    skip: common,
    favor: common,
    shuffle: common,
    future: tactical,
    nope: tactical,
    cat1: common,
    cat2: common,
    cat3: common,
  };
}

function mix<T>(cards: T[]): T[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/**
 * Create each physical card ONCE, then move it to its initial location.
 *
 * Duel (2 players, official rules): every player gets one Defuse, the remaining Defuse is shuffled
 * into the deck BEFORE the seven-card deal.
 * 3–6 players: Defuse = players + 1. Every player starts with exactly ONE Defuse in hand and the
 * single spare Defuse lies in the deck. There is never more than ONE kitten in any game.
 */
export function dealCards(players: number): { hands: Card[][]; deck: Card[] } {
  const counts = getDeckCounts(players);
  const cards = ALL_TYPES.flatMap((type) =>
    Array.from({ length: counts[type] }, () => ({ id: randomUUID(), type })),
  );
  const kittens = cards.filter((c) => c.type === "kitten");
  const spare = cards.filter((c) => c.type === "defuse");
  const others = cards.filter((c) => c.type !== "kitten" && c.type !== "defuse");
  const hands: Card[][] = Array.from({ length: players }, () => []);

  for (const hand of hands) hand.push(spare.pop()!);
  const duel = players === 2;
  if (duel) others.unshift(...spare.splice(0));
  mix(others);
  for (const hand of hands) hand.push(...others.splice(0, 7));
  return { hands, deck: mix([...others, ...spare, ...kittens]) };
}

/** Pending actions and peeks are references/snapshots, not additional physical cards. */
export function physicalCards(s: GameState): Card[] {
  return [
    ...s.deck,
    ...s.discard,
    ...s.players.flatMap((p) => p.hand),
    ...(s.defuse ? [s.defuse.kitten] : []),
  ];
}

export function assertDeckIntegrity(s: GameState): void {
  const expected = getDeckCounts(s.players.length);
  const cards = physicalCards(s);
  const ids = new Set<string>();
  const actual = Object.fromEntries(ALL_TYPES.map((type) => [type, 0])) as DeckCounts;
  for (const card of cards) {
    if (!card.id || ids.has(card.id) || !Object.hasOwn(actual, card.type)) {
      throw new Error("Нарушена целостность колоды: неизвестная или повторная карта");
    }
    ids.add(card.id);
    actual[card.type]++;
  }
  if (s.deck.filter((c) => c.type === "kitten").length > 1) {
    throw new Error("В колоде не может быть больше одного взрывного котёнка");
  }
  for (const type of ALL_TYPES) {
    if (actual[type] !== expected[type]) {
      throw new Error(`Нарушен состав колоды: ${type}, ожидалось ${expected[type]}, получено ${actual[type]}`);
    }
  }
}

/** Run before committing any room mutation to PostgreSQL. */
export function assertRoomIntegrity(s: GameState): void {
  if (s.mode === "tournament") {
    for (const table of s.tournament?.tables ?? []) {
      if (table.game.deckVersion === DECK_VERSION) assertDeckIntegrity(table.game);
    }
  } else if (s.deckVersion === DECK_VERSION && s.status !== "waiting") {
    assertDeckIntegrity(s);
  }
}
