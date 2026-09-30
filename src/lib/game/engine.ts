import { CARD_INFO } from "./cards";
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

function uid() { return Math.random().toString(36).slice(2, 10); }

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

// ─── Deck construction ───
const DECK_COUNTS: Partial<Record<CardType, number>> = {
  attack: 4, skip: 4, favor: 4, shuffle: 4, future: 5, nope: 5,
  cat1: 4, cat2: 4, cat3: 4,
};

function buildDeck(n: number): Card[] {
  const make = (type: CardType): Card => ({ id: uid(), type });
  let base: Card[] = [];
  (Object.entries(DECK_COUNTS) as [CardType, number][]).forEach(([t, cnt]) => {
    for (let i = 0; i < cnt; i++) base.push(make(t));
  });
  base = shuffle(base);
  // Deal hands: each player gets 1 defuse + 7 base cards
  const players: Card[][] = [];
  for (let i = 0; i < n; i++) {
    players.push([make("defuse"), ...base.splice(0, 7)]);
  }
  // Deck = remaining base + 2 extra defuses + n kittens
  const deck = [...base];
  for (let i = 0; i < 2; i++) deck.push(make("defuse"));
  for (let i = 0; i < n; i++) deck.push(make("kitten"));
  shuffle(deck);
  return deck; // hands dealt separately
}

function dealHands(n: number): { hands: Card[][]; deck: Card[] } {
  const make = (type: CardType): Card => ({ id: uid(), type });
  let base: Card[] = [];
  (Object.entries(DECK_COUNTS) as [CardType, number][]).forEach(([t, cnt]) => {
    for (let i = 0; i < cnt; i++) base.push(make(t));
  });
  base = shuffle(base);
  const hands: Card[][] = [];
  for (let i = 0; i < n; i++) {
    hands.push([make("defuse"), ...base.splice(0, 7)]);
  }
  const deck = [...base];
  for (let i = 0; i < 2; i++) deck.push(make("defuse"));
  for (let i = 0; i < n; i++) deck.push(make("kitten"));
  shuffle(deck);
  return { hands, deck };
}

// ─── Game creation ───
/** A tournament room has no player limit (it only needs 2+ to start). */
export const TOURNAMENT_UNLIMITED = 9999;

export function createState(code: string, mode: Mode, host: { id: string; name: string }, maxPlayers = 2): GameState {
  const s: GameState = {
    code, mode, maxPlayers: mode === "tournament" ? TOURNAMENT_UNLIMITED : Math.max(2, Math.min(4, maxPlayers)),
    tournament: null,
    status: "waiting",
    players: [{ id: host.id, name: host.name, isBot: false, hand: [], exploded: false }],
    deck: [], discard: [], current: 0, turnsLeft: 1, underAttack: false,
    phase: "action", pending: null, favor: null, defuse: null, peek: null,
    log: [], winner: null, botNextAt: null, botKnown: [], event: null,
    seq: 0, games: 0, score: [], hostId: host.id,
  };
  if (mode === "bot") {
    s.players.push({ id: "bot-" + uid(), name: "Бот Мурзик 🤖", isBot: true, hand: [], exploded: false });
    startGame(s, Date.now());
  } else if (mode === "tournament") {
    log(s, `${host.name} создал(а) турнир. Каждый сыграет с каждым!`);
  } else {
    log(s, `${host.name} создал(а) комнату (${s.maxPlayers} игрока(ов)). Ждём игроков…`);
  }
  return s;
}

export function addPlayer(s: GameState, id: string, name: string, now: number) {
  if (s.players.some((p) => p.id === id)) return;
  if (s.status !== "waiting") fail("Игра уже началась");
  if (s.players.length >= s.maxPlayers) fail("Комната уже заполнена");
  s.players.push({ id, name, isBot: false, hand: [], exploded: false });
  s.score.push(0);
  log(s, `${name} присоединился(ась) к игре (${s.players.length}/${s.maxPlayers})`);
  // Tournaments start only when the host presses "start" — any number of players from 2 up
  if (s.mode !== "tournament" && s.players.length >= s.maxPlayers) {
    startGame(s, now);
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
  const { hands, deck } = dealHands(n);
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
  s.games += 1;
  log(s, `Партия №${s.games} началась! ${n} игроков, в колоде ${deck.length} карт.`, { tone: "good" });
  log(s, `Первым ходит ${s.players[s.current].name}`);
  setEvent(s, "start", s.current);
  bump(s);
  schedule(s, now);
}

// ─── Helpers ───
function takeCards(s: GameState, pi: number, ids: string[]): Card[] {
  const hand = s.players[pi].hand;
  const out: Card[] = [];
  for (const id of ids) {
    const idx = hand.findIndex((c) => c.id === id);
    if (idx < 0) fail("Такой карты нет у тебя на руке");
    out.push(hand.splice(idx, 1)[0]);
  }
  return out;
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

export function responder(s: GameState): number {
  return s.pending ? nextAlive(s, s.pending.lastBy) : -1;
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
  s.pending = { kind, by: pi, cards, named, target, nopes: 0, lastBy: pi, deadline: 0 };
  s.phase = "nope";
  setNopeDeadline(s, now);
}

function setNopeDeadline(s: GameState, now: number) {
  const p = s.pending!;
  const r = nextAlive(s, p.lastBy);
  const rp = s.players[r];
  if (s.mode === "bot" && !rp.isBot) {
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
      s.peek = { player: p.by, cards, seq: (s.peek?.seq ?? 0) + 1 };
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
  if (a.type === "rematch") {
    if (s.status !== "finished") fail("Партия ещё идёт");
    startGame(s, now);
    return;
  }
  if (s.status !== "playing") fail("Игра не идёт");
  const me = s.players[pi];
  if (me.exploded) fail("Ты выбыл(а) из игры");

  switch (a.type) {
    case "play": {
      if (s.phase !== "action" || s.current !== pi) fail("Сейчас не твой ход");
      const ids = Array.from(new Set(a.cardIds));
      if (ids.length < 1 || ids.length > 3) fail("Можно сыграть 1 карту, пару или тройку");
      const preview = ids.map((id) => me.hand.find((c) => c.id === id) ?? fail("Нет такой карты"));
      const t = preview[0].type;
      if (ids.length === 1) {
        if (t === "nope") fail("«Неть» играется только в ответ на действие соперника");
        if (t === "defuse") fail("«Обезвредь» сработает сама");
        if (t === "cat1" || t === "cat2" || t === "cat3") fail("Кошкокарта сама по себе бесполезна — нужна пара или тройка");
        const cards = takeCards(s, pi, ids);
        s.discard.push(...cards);
        log(s, `${me.name} играет «${cardName(t)}»`);
        openPending(s, pi, t as PendingKind, cards, now);
      } else {
        if (!preview.every((c) => c.type === t)) fail("Для комбинации нужны одинаковые карты");
        const target = a.target ?? nextAlive(s, pi);
        if (s.players[target]?.exploded || target === pi) fail("Выбери живого соперника");
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
      if (responder(s) !== pi) fail("Сейчас очередь другого игрока");
      const nope = me.hand.find((c) => c.type === "nope") ?? fail("У тебя нет карты «Неть»");
      takeCards(s, pi, [nope.id]);
      s.discard.push(nope);
      s.pending.nopes += 1;
      s.pending.lastBy = pi;
      log(s, `${me.name}: «НЕТЬ!»`, { tone: "nope" });
      setEvent(s, "nope", pi);
      setNopeDeadline(s, now);
      break;
    }
    case "pass": {
      if (s.phase !== "nope" || !s.pending) fail("Нечего пропускать");
      if (responder(s) !== pi) fail("Сейчас очередь другого игрока");
      resolvePending(s, now);
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
          s.discard.push(card);
          log(s, `💥 БАБАХ! ${me.name} взорвался(ась)!`, { tone: "danger" });
          setEvent(s, "explode", pi);
          const alive = s.players.filter((p) => !p.exploded);
          if (alive.length <= 1) {
            s.status = "finished";
            s.winner = s.players.findIndex((p) => !p.exploded);
            if (s.winner >= 0) s.score[s.winner] += 1;
            log(s, `🏆 Победитель — ${s.players[s.winner]?.name}!`, { tone: "good" });
          } else {
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
      const pos = Math.max(0, Math.min(s.deck.length, Math.floor(a.position)));
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
  schedule(s, now);
}

// ─── Time-based progression ───
export function tick(s: GameState, now: number, botStep: (s: GameState, pi: number, now: number) => void): boolean {
  const before = s.seq;
  const botBefore = s.botNextAt;
  if (s.status === "playing" && s.phase === "nope" && s.pending && now >= s.pending.deadline) {
    const r = responder(s);
    if (!s.players[r].isBot) {
      resolvePending(s, now);
      bump(s);
      schedule(s, now);
    }
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
