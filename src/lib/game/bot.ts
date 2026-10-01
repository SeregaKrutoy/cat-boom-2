import { applyAction } from "./engine";
import type { Card, CardType, GameState } from "./types";

const VALUE: Record<CardType, number> = {
  kitten: 100, defuse: 90, nope: 60, attack: 55, skip: 50,
  shuffle: 40, future: 35, favor: 30, cat1: 5, cat2: 5, cat3: 5,
};

function count(hand: Card[], t: CardType) { return hand.filter((c) => c.type === t).length; }
function find(hand: Card[], t: CardType) { return hand.find((c) => c.type === t); }
function chance(p: number) { return Math.random() < p; }

function pickTarget(s: GameState, from: number): number {
  const alive = s.players.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.exploded && i !== from);
  if (!alive.length) return from;
  alive.sort((a, b) => b.p.hand.length - a.p.hand.length);
  return alive[0].i;
}

function knownTop(s: GameState): Card | null {
  const top = s.deck[0];
  return top && s.botKnown.includes(top.id) ? top : null;
}

function kittenKnownIndex(s: GameState): number {
  for (let i = 0; i < s.deck.length; i++) {
    if (s.deck[i].type === "kitten" && s.botKnown.includes(s.deck[i].id)) return i;
  }
  return -1;
}

export function botStep(s: GameState, pi: number, now: number) {
  const me = s.players[pi];
  const hand = me.hand;

  // ── Nope window ──
  if (s.phase === "nope" && s.pending) {
    const p = s.pending;
    const hasNope = count(hand, "nope") > 0;
    let want = 0;
    if (hasNope) {
      if (p.by !== pi) {
        const top = knownTop(s);
        switch (p.kind) {
          case "attack": want = s.deck.length <= 6 ? 0.85 : 0.6; break;
          case "skip": want = top?.type === "kitten" ? 0.95 : 0.3; break;
          case "shuffle": want = top?.type === "kitten" ? 0.95 : 0.05; break;
          case "favor": want = 0.35; break;
          case "pair": want = hand.length <= 3 || count(hand, "defuse") > 0 ? 0.55 : 0.35; break;
          case "triple": want = p.named && count(hand, p.named) > 0 ? (p.named === "defuse" ? 0.98 : 0.7) : 0; break;
          case "future": want = 0.1; break;
        }
      } else {
        const k = kittenKnownIndex(s);
        if ((p.kind === "attack" || p.kind === "skip" || p.kind === "shuffle") && k === 0) want = 0.95;
        else if (p.kind === "attack") want = 0.55;
        else if (p.kind === "triple" && p.named === "defuse") want = 0.7;
        else want = 0.25;
      }
    }
    if (hasNope && chance(want)) applyAction(s, pi, { type: "nope" }, now);
    else applyAction(s, pi, { type: "pass" }, now);
    return;
  }

  // ── Favor: give least valuable card ──
  if (s.phase === "favor") {
    const sorted = [...hand].sort((a, b) => {
      const va = VALUE[a.type] + (count(hand, a.type) >= 2 && VALUE[a.type] < 10 ? 8 : 0);
      const vb = VALUE[b.type] + (count(hand, b.type) >= 2 && VALUE[b.type] < 10 ? 8 : 0);
      return va - vb;
    });
    applyAction(s, pi, { type: "give", cardId: sorted[0].id }, now);
    return;
  }

  // ── Defuse placement ──
  if (s.phase === "defuse") {
    const n = s.deck.length;
    let pos: number;
    if (s.turnsLeft > 1) {
      pos = Math.max(s.turnsLeft, Math.floor(n / 2) + Math.floor(Math.random() * (n - Math.floor(n / 2) + 1)));
    } else {
      const r = Math.random();
      if (r < 0.55) pos = 0;
      else if (r < 0.75) pos = Math.min(1, n);
      else pos = Math.floor(Math.random() * (n + 1));
    }
    applyAction(s, pi, { type: "place", position: Math.min(pos, n) }, now);
    return;
  }

  // ── Own turn ──
  if (s.phase !== "action" || s.current !== pi) return;
  const top = knownTop(s);
  const play = (cards: Card[], named?: CardType, target?: number) =>
    applyAction(s, pi, { type: "play", cardIds: cards.map((c) => c.id), named, target }, now);
  const target = pickTarget(s, pi);

  if (top?.type === "kitten") {
    const attack = find(hand, "attack");
    if (attack) return play([attack]);
    const skip = find(hand, "skip");
    if (skip) return play([skip]);
    const sh = find(hand, "shuffle");
    if (sh) return play([sh]);
    if (s.players[target].hand.length) {
      const fav = find(hand, "favor");
      if (fav) return play([fav], undefined, target);
      for (const t of ["cat1", "cat2", "cat3"] as CardType[]) {
        const cs = hand.filter((c) => c.type === t);
        if (cs.length >= 3) return play(cs.slice(0, 3), "skip", target);
        if (cs.length >= 2) return play(cs.slice(0, 2), undefined, target);
      }
    }
    return applyAction(s, pi, { type: "draw" }, now);
  }

  if (top) return applyAction(s, pi, { type: "draw" }, now);

  const risk = 1 / Math.max(1, s.deck.length); // the deck always holds exactly one kitten
  const defuses = count(hand, "defuse");

  if (s.players[target].hand.length) {
    for (const t of ["cat1", "cat2", "cat3"] as CardType[]) {
      const cs = hand.filter((c) => c.type === t);
      if (cs.length >= 3 && chance(0.8)) return play(cs.slice(0, 3), defuses === 0 ? "defuse" : "nope", target);
      if (cs.length >= 2 && chance(0.6)) return play(cs.slice(0, 2), undefined, target);
    }
  }

  const future = find(hand, "future");
  if (future && risk >= 0.1 && chance(0.85)) return play([future]);

  if (risk >= 0.25 || (defuses === 0 && risk >= 0.15)) {
    const attack = find(hand, "attack");
    if (attack && chance(0.75)) return play([attack]);
    const skip = find(hand, "skip");
    if (skip && chance(0.7)) return play([skip]);
  }

  const fav = find(hand, "favor");
  if (fav && s.players[target].hand.length && chance(0.35)) return play([fav], undefined, target);

  return applyAction(s, pi, { type: "draw" }, now);
}
