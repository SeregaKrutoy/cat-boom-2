import { randomUUID } from "node:crypto";
import { CARD_INFO } from "./cards";
import { assertDeckIntegrity, dealCards, DECK_VERSION } from "./deck";
import { BOT_AVATAR, DEFAULT_AVATAR, sanitizeAvatar } from "../profile";
import type { Action, Card, CardType, GameState, LogEntry, Mode, PendingKind } from "./types";

export const NOPE_WINDOW_MS = 5000;
export const NOPE_WINDOW_BOT_MS = 6000;

export class GameError extends Error {}
function fail(msg: string): never { throw new GameError(msg); }

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function uid() { return randomUUID(); }

/** Next non-exploded player after `from`, wrapping around. */
export function nextAlive(s: GameState, from: number): number {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!s.players[idx].exploded) return idx;
  }
  return from;
}

export function aliveCount(s: GameState): number {
  return s.players.filter((p) => !p.exploded).length;
}

export function cardName(t: CardType) { return CARD_INFO[t].name; }

export function log(s: GameState, text: string, opts: Partial<Pick<LogEntry, "for" | "tone">> = {}) {
  const id = (s.log.length ? s.log[s.log.length - 1].id : 0) + 1;
  s.log.push({ id, text, ts: Date.now(), ...opts });
  if (s.log.length > 120) s.log.splice(0, s.log.length - 120);
}

function bump(s: GameState) { s.seq += 1; }
function setEvent(s: GameState, kind: NonNullable<GameState["event"]>["kind"], player: number) {
  s.event = { seq: s.seq + 1, kind, player };
}

// ─── Game creation ───
/** A tournament room has no player limit (it only needs 2+ to start). */
export const TOURNAMENT_UNLIMITED = 9999;

export function createState(code: string, mode: Mode, host: { id: string; name: string; avatar?: string }, maxPlayers = 2): GameState {
  const s: GameState = {
    code, mode, maxPlayers: mode === "tournament" ? TOURNAMENT_UNLIMITED : Math.max(2, Math.min(6, maxPlayers)),
    tournament: null,
    status: "waiting",
    players: [{ id: host.id, name: host.name, avatar: sanitizeAvatar(host.avatar), isBot: false, hand: [], exploded: false }],
    deck: [], discard: [], current: 0, turnsLeft: 1, underAttack: false,
    phase: "action", pending: null, favor: null, defuse: null, peek: null,
    log: [], chat: [], winner: null, botNextAt: null, botKnown: [], event: null,
    seq: 0, games: 0, score: [], hostId: host.id, matchId: uid(),
  };
  if (mode === "bot") {
    s.players.push({ id: "bot-" + uid(), name: "Бот Мурзик", avatar: BOT_AVATAR, isBot: true, hand: [], exploded: false });
    startGame(s, Date.now());
  } else if (mode === "tournament") {
    log(s, `${host.name} создал(а) турнир. Каждый сыграет с каждым!`);
  } else {
    log(s, `${host.name} создал(а) комнату (${s.maxPlayers} игрока(ов)). Ждём игроков…`);
  }
  return s;
}

/**
 * A rematch needs EVERY human player to press «Реванш». Bots agree automatically.
 * Returns true when the last missing player has voted and a new deal may start.
 */
export function registerRematchVote(s: GameState, pi: number): boolean {
  const votes = s.rematchVotes ?? (s.rematchVotes = []);
  if (!votes.includes(pi)) {
    votes.push(pi);
    const humans = s.players.filter((p) => !p.isBot).length;
    const ready = votes.filter((i) => !s.players[i]?.isBot).length;
    if (ready < humans) log(s, `${s.players[pi].name} готов(а) к реваншу (${ready}/${humans})`, { tone: "info" });
  }
  return s.players.every((p, i) => p.isBot || votes.includes(i));
}

export function addPlayer(s: GameState, id: string, name: string, now: number, avatar?: string) {
  if (s.players.some((p) => p.id === id)) return;
  if (s.status !== "waiting") fail("Игра уже началась");
  if (s.players.length >= s.maxPlayers) fail("Комната уже заполнена");
  s.players.push({ id, name, avatar: sanitizeAvatar(avatar ?? DEFAULT_AVATAR), isBot: false, hand: [], exploded: false });
  s.score.push(0);
  bump(s);
  log(s, `${name} присоединился(ась) к игре (${s.players.length}/${s.maxPlayers})`);
  // Never auto-start: even a full room waits for the host to press "start".
  if (s.players.length >= s.maxPlayers) {
    log(s, `Комната заполнена — хост может начинать игру!`, { tone: "good" });
  }
}

export function hostStart(s: GameState, playerId: string, now: number) {
  if (s.status !== "waiting") fail("Игра уже началась");
  if (s.hostId !== playerId) fail("Только создатель комнаты может начать игру");
  if (s.players.length < 2) fail("Нужно минимум 2 игрока");
  startGame(s, now);
}

export function startGame(s: GameState, now: number) {
  const n = s.players.length;
  const { hands, deck } = dealCards(n);
  s.matchId = uid();
  s.deckVersion = DECK_VERSION;
  s.players.forEach((p, i) => {
    p.hand = hands[i];
    p.exploded = false;
  });
  if (s.score.length < n) s.score = s.players.map(() => 0);
  s.deck = deck;
  s.discard = [];
  s.status = "playing";
  s.current = Math.floor(Math.random() * n);
  s.turnsLeft = 1;
  s.underAttack = false;
  s.phase = "action";
  s.pending = null; s.favor = null; s.defuse = null; s.peek = null;
  s.winner = null; s.botKnown = []; s.botNextAt = null;
  s.rematchVotes = [];
  s.games += 1;
  log(s, `Партия №${s.games} началась! ${n} игроков, в колоде ${deck.length} карт.`, { tone: "good" });
  log(s, `Первым ходит ${s.players[s.current].name}`);
  setEvent(s, "start", s.current);
  assertDeckIntegrity(s);
  bump(s);
  schedule(s, now);
}

// ─── Helpers ───
function takeCards(s: GameState, pi: number, ids: string[]): Card[] {
  const hand = s.players[pi].hand;
  // Validate the WHOLE request before removing anything.
  if (new Set(ids).size !== ids.length) fail("Одна карта не может быть сыграна дважды");
  const cards = ids.map((id) => hand.find((c) => c.id === id) ?? fail("Такой карты нет у тебя на руке"));
  const taken = new Set(ids);
  s.players[pi].hand = hand.filter((c) => !taken.has(c.id));
  return cards;
}

function chooseTarget(s: GameState, pi: number, requested?: number): number {
  const target = requested ?? nextAlive(s, pi);
  if (!Number.isInteger(target) || !s.players[target] || target === pi || s.players[target].exploded) {
    fail("Выбери живого соперника");
  }
  return target;
}

function validateAction(a: Action) {
  if (!a || typeof a !== "object") fail("Нет действия");
  switch (a.type) {
    case "play":
      if (!Array.isArray(a.cardIds) || a.cardIds.length < 1 || a.cardIds.length > 3 ||
          !a.cardIds.every((id) => typeof id === "string" && id.length > 0)) {
        fail("Можно сыграть 1 карту, пару или тройку");
      }
      if (new Set(a.cardIds).size !== a.cardIds.length) fail("Одна карта не может быть сыграна дважды");
      if (a.named !== undefined && !Object.hasOwn(CARD_INFO, a.named)) fail("Неизвестная карта");
      if (a.target !== undefined && !Number.isInteger(a.target)) fail("Неверная цель");
      return;
    case "give":
      if (typeof a.cardId !== "string" || !a.cardId) fail("Выбери карту");
      return;
    case "place":
      if (!Number.isSafeInteger(a.position) || a.position < 0) fail("Неверная позиция в колоде");
      return;
    case "draw": case "nope": case "pass": case "rematch": return;
    default: fail("Неизвестное действие");
  }
}

function endTurnStep(s: GameState) {
  s.turnsLeft -= 1;
  if (s.turnsLeft <= 0) {
    s.current = nextAlive(s, s.current);
    s.turnsLeft = 1;
    s.underAttack = false;
    log(s, `Ход переходит к ${s.players[s.current].name}`);
  } else {
    log(s, `${s.players[s.current].name}: осталось ходов — ${s.turnsLeft}`);
  }
}

/**
 * The player a pending card is played "on".
 * Favor/pair/triple carry an explicit target; every other card targets the next
 * alive player after the one who played it (the one most affected by the move).
 */
export function pendingTarget(s: GameState): number {
  const p = s.pending;
  if (!p) return -1;
  if (p.target !== undefined && s.players[p.target] && !s.players[p.target].exploded) return p.target;
  if (p.target !== undefined && s.players[p.target]?.exploded) return nextAlive(s, p.target);
  return nextAlive(s, p.by);
}

/**
 * Who may play «Неть» right now — a duel between the two involved players only.
 *  - Card in force (0, 2, 4… Nopes): ONLY the targeted player may contest it.
 *  - Card cancelled (1, 3, 5… Nopes): ONLY the player who played the card may
 *    answer with their own Nope. Bystanders can never join the chain.
 */
export function reactionPlayers(s: GameState): number[] {
  const p = s.pending;
  if (!p) return [];
  const passed = p.passed ?? [];
  const canAct = (i: number) => i >= 0 && !s.players[i].exploded && !passed.includes(i);
  if (p.nopes % 2 === 1) return canAct(p.by) ? [p.by] : [];
  const t = pendingTarget(s);
  if (t === p.by) return [];
  return canAct(t) ? [t] : [];
}

export function responder(s: GameState): number {
  return reactionPlayers(s)[0] ?? -1;
}

export function actor(s: GameState): number {
  if (s.status !== "playing") return -1;
  switch (s.phase) {
    case "nope": return responder(s);
    case "favor": return s.favor ? s.favor.giver : -1;
    case "defuse": return s.defuse ? s.defuse.player : -1;
    default: return s.current;
  }
}

export function schedule(s: GameState, now: number) {
  const a = actor(s);
  if (a >= 0 && s.players[a]?.isBot) {
    if (s.botNextAt === null) {
      const base = s.phase === "nope" ? 900 : 1100;
      s.botNextAt = now + base + Math.floor(Math.random() * 700);
    }
  } else {
    s.botNextAt = null;
  }
}

const KIND_LABEL: Record<PendingKind, string> = {
  attack: "Нападай", skip: "Слиняй", favor: "Подлижись",
  shuffle: "Затасуй", future: "Подсмуртри грядущее",
  pair: "Пара — кража случайной карты", triple: "Тройка — требование карты",
};
export function kindLabel(k: PendingKind) { return KIND_LABEL[k]; }

function openPending(s: GameState, pi: number, kind: PendingKind, cards: Card[], now: number, named?: CardType, target?: number) {
  s.pending = { kind, by: pi, cards, named, target, nopes: 0, lastBy: pi, deadline: 0, passed: [] };
  s.phase = "nope";
  setNopeDeadline(s, now);
}

function setNopeDeadline(s: GameState, now: number) {
  const p = s.pending!;
  const r = responder(s);
  const rp = s.players[r];
  if (s.mode === "bot" && rp && !rp.isBot) {
    const hasNope = rp.hand.some((c) => c.type === "nope");
    p.deadline = hasNope ? now + NOPE_WINDOW_BOT_MS : now;
  } else {
    p.deadline = now + NOPE_WINDOW_MS;
  }
  s.botNextAt = null;
}

function stealRandom(s: GameState, from: number, to: number) {
  const hand = s.players[from].hand;
  if (!hand.length) { log(s, `У ${s.players[from].name} нет карт — красть нечего`); return; }
  const card = hand.splice(Math.floor(Math.random() * hand.length), 1)[0];
  s.players[to].hand.push(card);
  log(s, `${s.players[to].name} украл(а) случайную карту у ${s.players[from].name}`, { tone: "info" });
  log(s, `Ты украл(а): ${cardName(card.type)}`, { for: to });
  log(s, `У тебя украли: ${cardName(card.type)}`, { for: from, tone: "danger" });
  setEvent(s, "steal", to);
}

function resolvePending(s: GameState, now: number) {
  const p = s.pending!;
  s.pending = null; s.phase = "action";
  const name = s.players[p.by].name;
  if (p.nopes % 2 === 1) {
    log(s, `Действие «${KIND_LABEL[p.kind]}» (${name}) отменено картой «Неть»`, { tone: "nope" });
    return;
  }
  // Determine target
  let target = p.target ?? nextAlive(s, p.by);
  if (s.players[target].exploded) target = nextAlive(s, target);
  const targetName = s.players[target].name;

  switch (p.kind) {
    case "attack": {
      const turns = s.underAttack ? s.turnsLeft + 2 : 2;
      s.current = nextAlive(s, p.by);
      s.turnsLeft = turns;
      s.underAttack = true;
      log(s, `${name} нападает! ${s.players[s.current].name} должен(на) сделать ходов: ${turns}`, { tone: "danger" });
      setEvent(s, "attack", s.current);
      break;
    }
    case "skip":
      log(s, `${name} слинял(а) и не берёт карту`);
      endTurnStep(s);
      break;
    case "shuffle":
      shuffle(s.deck);
      s.botKnown = [];
      log(s, `${name} тщательно перемешал(а) колоду`);
      setEvent(s, "shuffle", p.by);
      break;
    case "future": {
      const cards = s.deck.slice(0, 3);
      s.peek = { player: p.by, cards, seq: s.seq + 1 };
      if (s.players[p.by].isBot) {
        s.botKnown = Array.from(new Set([...s.botKnown, ...cards.map((c) => c.id)]));
      }
      log(s, `${name} подсмотрел(а) 3 верхние карты колоды`);
      log(s, `Сверху вниз: ${cards.map((c) => cardName(c.type)).join(" → ")}`, {
        for: p.by, tone: cards.some((c) => c.type === "kitten") ? "danger" : "info",
      });
      break;
    }
    case "favor":
      if (!s.players[target].hand.length) {
        log(s, `У ${targetName} нет карт, подлизываться бесполезно`);
      } else {
        s.phase = "favor";
        s.favor = { giver: target, receiver: p.by };
        log(s, `${s.players[target].name} выбирает карту, которую отдаст ${name}`);
      }
      break;
    case "pair":
      stealRandom(s, target, p.by);
      break;
    case "triple": {
      const named = p.named!;
      const hand = s.players[target].hand;
      const idx = hand.findIndex((c) => c.type === named);
      if (idx >= 0) {
        const card = hand.splice(idx, 1)[0];
        s.players[p.by].hand.push(card);
        log(s, `${name} потребовал(а) «${cardName(named)}» и получил(а) её!`, { tone: "danger" });
        setEvent(s, "steal", p.by);
      } else {
        log(s, `${name} потребовал(а) «${cardName(named)}», но такой карты нет — ничего не досталось`);
      }
      break;
    }
  }
}

// ─── Actions ───
export function applyAction(s: GameState, pi: number, a: Action, now: number) {
  validateAction(a);
  if (!Number.isInteger(pi) || !s.players[pi]) fail("Игрок не найден");
  if (a.type === "rematch") {
    if (s.status !== "finished") fail("Партия ещё идёт");
    if (registerRematchVote(s, pi)) {
      startGame(s, now);
    } else {
      bump(s);
    }
    return;
  }
  if (s.status !== "playing") fail("Игра не идёт");
  const me = s.players[pi];
  if (me.exploded) fail("Ты выбыл(а) из игры");

  switch (a.type) {
    case "play": {
      if (s.phase !== "action" || s.current !== pi) fail("Сейчас не твой ход");
      const ids = a.cardIds;
      if (ids.length < 1 || ids.length > 3) fail("Можно сыграть 1 карту, пару или тройку");
      const preview = ids.map((id) => me.hand.find((c) => c.id === id) ?? fail("Нет такой карты"));
      const t = preview[0].type;
      if (ids.length === 1) {
        if (t === "kitten") fail("Котёнок разыгрывается только при взятии из колоды");
        if (t === "nope") fail("«Неть» играется только в ответ на действие соперника");
        if (t === "defuse") fail("«Обезвредь» сработает сама");
        if (t === "cat1" || t === "cat2" || t === "cat3") fail("Кошкокарта сама по себе бесполезна — нужна пара или тройка");
        const target = t === "favor" ? chooseTarget(s, pi, a.target) : nextAlive(s, pi);
        const cards = takeCards(s, pi, ids);
        s.discard.push(...cards);
        log(s, `${me.name} играет «${cardName(t)}» (на: ${s.players[target].name})`);
        openPending(s, pi, t as PendingKind, cards, now, undefined, target);
      } else {
        if (!preview.every((c) => c.type === t)) fail("Для комбинации нужны одинаковые карты");
        const target = chooseTarget(s, pi, a.target);
        if (!s.players[target].hand.length) fail("У соперника нет карт — красть нечего");
        if (ids.length === 3 && (!a.named || a.named === "kitten" || !CARD_INFO[a.named])) {
          fail("Назови карту, которую хочешь получить");
        }
        const cards = takeCards(s, pi, ids);
        s.discard.push(...cards);
        if (ids.length === 2) {
          log(s, `${me.name} играет пару «${cardName(t)}» — хочет украсть случайную карту у ${s.players[target].name}`);
          openPending(s, pi, "pair", cards, now, undefined, target);
        } else {
          log(s, `${me.name} играет три «${cardName(t)}» и требует «${cardName(a.named!)}» от ${s.players[target].name}`);
          openPending(s, pi, "triple", cards, now, a.named, target);
        }
      }
      break;
    }
    case "nope": {
      if (s.phase !== "nope" || !s.pending) fail("Нечего отменять");
      if (!reactionPlayers(s).includes(pi)) {
        if (s.pending.nopes % 2 === 1) fail("Ответить на «Неть» может только игрок, чей сейчас ход");
        const t = pendingTarget(s);
        fail(t >= 0 ? `Оспорить карту может только ${s.players[t].name} — ход сделан на него` : "Сейчас нельзя ответить на эту карту");
      }
      const nope = me.hand.find((c) => c.type === "nope") ?? fail("У тебя нет карты «Неть»");
      takeCards(s, pi, [nope.id]);
      s.discard.push(nope);
      s.pending.nopes += 1;
      s.pending.lastBy = pi;
      s.pending.passed = [];
      log(s, `${me.name}: «НЕТЬ!»`, { tone: "nope" });
      setEvent(s, "nope", pi);
      setNopeDeadline(s, now);
      break;
    }
    case "pass": {
      if (s.phase !== "nope" || !s.pending) fail("Нечего пропускать");
      if (!reactionPlayers(s).includes(pi)) fail("Ответ уже пропущен");
      s.pending.passed = [...(s.pending.passed ?? []), pi];
      if (reactionPlayers(s).length === 0) resolvePending(s, now);
      break;
    }
    case "draw": {
      if (s.phase !== "action" || s.current !== pi) fail("Сейчас не твой ход");
      const card = s.deck.shift() ?? fail("Колода пуста");
      s.botKnown = s.botKnown.filter((id) => id !== card.id);
      if (card.type === "kitten") {
        const defuse = me.hand.find((c) => c.type === "defuse");
        if (defuse) {
          takeCards(s, pi, [defuse.id]);
          s.discard.push(defuse);
          s.phase = "defuse";
          s.defuse = { player: pi, kitten: card };
          log(s, `💣 ${me.name} вытянул(а) Взрывного котёнка… но обезвредил(а) его!`, { tone: "good" });
          setEvent(s, "defused", pi);
        } else {
          me.exploded = true;
          // Remaining hand goes to the discard first, so the kitten stays on top
          s.discard.push(...me.hand);
          me.hand = [];
          log(s, `💥 БАБАХ! ${me.name} взорвался(ась)!`, { tone: "danger" });
          setEvent(s, "explode", pi);
          const alive = s.players.filter((p) => !p.exploded);
          if (alive.length <= 1) {
            s.discard.push(card); // the kitten stays on top of the discard
            s.status = "finished";
            s.winner = s.players.findIndex((p) => !p.exploded);
            if (s.winner >= 0) s.score[s.winner] += 1;
            log(s, `🏆 Победитель — ${s.players[s.winner]?.name}!`, { tone: "good" });
          } else {
            // There is only ONE kitten in any game: it goes back into the deck, so play continues
            s.deck.splice(Math.floor(Math.random() * (s.deck.length + 1)), 0, card);
            s.botKnown = [];
            log(s, "Котёнок снова замешан в колоду — он по-прежнему один", { tone: "danger" });
            // Pass turn to next alive player
            s.current = nextAlive(s, pi);
            s.turnsLeft = 1;
            s.underAttack = false;
            log(s, `Ход переходит к ${s.players[s.current].name} (осталось ${alive.length} игроков)`);
          }
        }
      } else {
        me.hand.push(card);
        log(s, `${me.name} берёт карту из колоды`);
        log(s, `Ты взял(а): ${cardName(card.type)}`, { for: pi });
        if (!me.exploded) endTurnStep(s);
      }
      break;
    }
    case "place": {
      if (s.phase !== "defuse" || !s.defuse || s.defuse.player !== pi) fail("Сейчас нечего класть");
      if (a.position > s.deck.length) fail("Неверная позиция в колоде");
      const pos = a.position;
      s.deck.splice(pos, 0, s.defuse.kitten);
      if (me.isBot) s.botKnown.push(s.defuse.kitten.id);
      else s.botKnown = [];
      s.defuse = null; s.phase = "action";
      log(s, `${me.name} тайно вернул(а) котёнка в колоду`);
      log(s, `Котёнок лежит на позиции ${pos + 1} сверху (из ${s.deck.length})`, { for: pi });
      endTurnStep(s);
      break;
    }
    case "give": {
      if (s.phase !== "favor" || !s.favor || s.favor.giver !== pi) fail("Сейчас ничего отдавать не нужно");
      const [card] = takeCards(s, pi, [a.cardId]);
      const rec = s.favor.receiver;
      s.players[rec].hand.push(card);
      log(s, `${me.name} отдал(а) карту ${s.players[rec].name}`);
      log(s, `Ты получил(а): ${cardName(card.type)}`, { for: rec });
      log(s, `Ты отдал(а): ${cardName(card.type)}`, { for: pi });
      s.favor = null; s.phase = "action";
      break;
    }
    default:
      fail("Неизвестное действие");
  }
  bump(s);
  s.botNextAt = null;
  schedule(s, now);
}

// ─── Time-based progression ───
export function tick(s: GameState, now: number, botStep: (s: GameState, pi: number, now: number) => void): boolean {
  const before = s.seq;
  const botBefore = s.botNextAt;
  if (s.status === "playing" && s.phase === "nope" && s.pending && now >= s.pending.deadline) {
    resolvePending(s, now);
    bump(s);
    s.botNextAt = null;
    schedule(s, now);
  }
  schedule(s, now);
  const a = actor(s);
  if (a >= 0 && s.players[a].isBot && s.botNextAt !== null && now >= s.botNextAt) {
    s.botNextAt = null;
    try {
      botStep(s, a, now);
    } catch (e) {
      if (s.phase === "nope") applyAction(s, a, { type: "pass" }, now);
      else if (s.phase === "action") applyAction(s, a, { type: "draw" }, now);
      else throw e;
    }
    schedule(s, now);
  }
  return s.seq !== before || s.botNextAt !== botBefore;
}
