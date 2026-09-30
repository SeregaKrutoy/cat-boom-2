"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, getName, getToken, saveName } from "@/lib/client";
import { audio, type SfxName } from "@/lib/audio";
import { SettingsButton } from "./AudioControls";
import { CARD_INFO, NAMEABLE_TYPES, isCat } from "@/lib/game/cards";
import type { Action, Card, CardType, GameEvent, GameView, PendingKind } from "@/lib/game/types";
import { CardBack, CardFace } from "./CardView";
import { Rules } from "./Rules";
import { ThemeToggle } from "./ThemeToggle";

const KIND_LABEL: Record<PendingKind, string> = {
  attack: "Нападай", skip: "Слиняй", favor: "Подлижись",
  shuffle: "Затасуй", future: "Подсмуртри грядущее",
  pair: "Пара — кража", triple: "Тройка — требование",
};

const FLASH: Record<GameEvent["kind"], { text: string; cls: string }> = {
  explode: { text: "💥 БАБАХ!", cls: "text-danger" },
  defused: { text: "🧯 Обезврежено!", cls: "text-good" },
  nope: { text: "✋ НЕТЬ!", cls: "text-nope" },
  attack: { text: "⚔️ Нападай!", cls: "text-danger" },
  shuffle: { text: "🔀 Затасовано!", cls: "text-heading" },
  steal: { text: "🫳 Кража!", cls: "text-heading" },
  start: { text: "😼 Поехали!", cls: "text-heading" },
};

const EVENT_SFX: Record<GameEvent["kind"], SfxName> = {
  explode: "explode", defused: "defused", nope: "nope", attack: "attack",
  shuffle: "shuffle", steal: "steal", start: "start",
};

/** Plays sounds for whatever changed between two consecutive server views. */
function playSoundsFor(prev: GameView, v: GameView) {
  const newEvent = !!v.event && v.event.seq !== (prev.event?.seq ?? 0);
  if (newEvent && v.event) {
    audio.play(EVENT_SFX[v.event.kind]);
  } else if (v.pending && (!prev.pending || prev.pending.cards.length !== v.pending.cards.length || prev.pending.kind !== v.pending.kind)) {
    audio.play("card");
  } else if (v.status === "playing" && v.hand.length > prev.hand.length) {
    audio.play("draw");
  } else if (v.status === "waiting" && v.players.length > prev.players.length) {
    audio.play("join");
  }
  if (v.peek && v.peek.seq !== (prev.peek?.seq ?? 0)) audio.play("peek", 0.25);
  if (v.status === "playing" && v.me >= 0 && v.current === v.me && v.phase === "action" && (prev.current !== v.current || prev.phase !== "action" || prev.status !== "playing")) {
    audio.play("turn", newEvent ? 0.9 : 0.3);
  }
  if (v.tournament && prev.tournament?.phase !== "finished" && v.tournament.phase === "finished") {
    const t = v.tournament;
    audio.play(t.champion === t.myIdx || t.tie.includes(t.myIdx) ? "win" : "lose", 1.0);
  } else if (!v.spectator && prev.status !== "finished" && v.status === "finished") {
    audio.play(v.winner === v.me ? "win" : "lose", 1.0);
  }
}

function StandingsTable({ v, compact = false }: { v: GameView; compact?: boolean }) {
  const t = v.tournament!;
  const busyNow = new Set(t.phase === "round" ? t.tables.filter((x) => x.status === "playing").flatMap((x) => x.seats) : []);
  return (
    <div className="w-full min-w-0 text-left">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-display text-lg text-heading">🏆 Таблица</span>
        <span className="text-xs text-muted">раунд {t.round} / {t.rounds}</span>
      </div>
      <div className={`space-y-1 overflow-y-auto pr-1 scrollbar-thin ${compact ? "max-h-56" : "max-h-[40vh]"}`}>
        {t.standings.map((r, place) => (
          <div key={r.idx} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${r.idx === t.myIdx ? "bg-accent-soft" : "bg-ink/5"}`}>
            <span className="w-6 shrink-0 text-center font-bold text-muted">{place + 1}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-ink">
              {r.name}{r.idx === t.myIdx ? " (ты)" : ""}{busyNow.has(r.idx) ? " ⚔️" : ""}
            </span>
            <span className="shrink-0 tabular-nums text-muted">{r.played}/{t.total - 1}</span>
            <span className="w-10 shrink-0 text-right font-display text-base text-heading">{r.wins}</span>
          </div>
        ))}
      </div>
      {!compact && <p className="mt-2 text-xs text-muted">Сыграно матчей / всего · число побед</p>}
    </div>
  );
}

/** Strip with every table of the round: switch between them to watch any game. */
function TableSwitcher({ v, countdown, onPick }: { v: GameView; countdown: number; onPick: (id: number | null) => void }) {
  const t = v.tournament!;
  return (
    <div className="min-w-0 border-b border-line bg-panel px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-display text-base text-heading">🏆 Раунд {t.round} из {t.rounds}</span>
        <span className="text-muted">столов: {t.tables.length}</span>
        {t.bye && (
          <span className="text-muted">
            отдыхает: <b className="text-ink">{t.byeMe ? "ты" : t.bye}</b>
          </span>
        )}
        {t.phase === "between" && (
          <span className="rounded-full bg-highlight px-2 py-0.5 text-xs font-bold text-highlight-ink">
            Следующий раунд через {countdown} с
          </span>
        )}
        {t.phase === "finished" && (
          <span className="rounded-full bg-highlight px-2 py-0.5 text-xs font-bold text-highlight-ink">Турнир окончен</span>
        )}
        {v.spectator && t.myTable !== null && (
          <button onClick={() => onPick(null)} className="ml-auto rounded-full bg-accent px-3 py-0.5 text-xs font-bold text-white hover:brightness-110">
            ← К моему столу
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto overscroll-x-contain pb-1 scrollbar-thin">
        {t.tables.map((tb) => {
          const active = tb.id === v.tableId;
          const winner = tb.winner !== null ? t.names[tb.winner] : null;
          return (
            <button
              key={tb.id}
              onClick={() => onPick(tb.mine ? null : tb.id)}
              className={`flex w-40 shrink-0 flex-col rounded-xl border px-2.5 py-1.5 text-left transition ${
                active ? "border-highlight bg-highlight/15" : "border-line bg-ink/5 hover:bg-ink/10"
              }`}
            >
              <span className="flex items-center justify-between text-xs font-bold text-ink">
                <span>Стол {tb.num}{tb.mine ? " · мой" : ""}</span>
                <span className={tb.status === "finished" ? "text-good" : "text-heading"}>{tb.status === "finished" ? "✓" : "●"}</span>
              </span>
              <span className="truncate text-xs text-ink">{tb.names[0]} — {tb.names[1]}</span>
              <span className="truncate text-[11px] text-muted">
                {tb.status === "finished" ? `победил(а) ${winner}` : tb.turn ? `ходит ${tb.turn}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function sortHand(hand: Card[]) {
  const order = Object.keys(CARD_INFO) as CardType[];
  return [...hand].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

export function GameClient({ code }: { code: string }) {
  const [token, setToken] = useState("");
  const [view, setView] = useState<GameView | null>(null);
  const [recvAt, setRecvAt] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [tripleOpen, setTripleOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [pendingNamed, setPendingNamed] = useState<CardType | undefined>();
  const [dismissedPeek, setDismissedPeek] = useState<Record<string, number>>({});
  const [dismissedRound, setDismissedRound] = useState(0);
  const [dismissedFinal, setDismissedFinal] = useState(false);
  const [defusePos, setDefusePos] = useState(0);
  const [flash, setFlash] = useState<GameEvent | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [copied, setCopied] = useState(false);
  const seqRef = useRef(-1);
  const prevRef = useRef<GameView | null>(null);
  const eventSeq = useRef<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tournament: which table is being watched (null = my own table) and request bookkeeping
  const watchRef = useRef<number | null>(null);
  const reqRef = useRef(0);
  const tableRef = useRef<number | null | undefined>(undefined);
  const roundRef = useRef<number | null>(null);
  const loadRef = useRef<() => void>(() => {});

  const accept = useCallback((v: GameView) => {
    if (v.seq < seqRef.current) return;
    seqRef.current = v.seq;
    // A different table is on screen: start sounds and flashes from a clean slate
    if (v.tableId !== tableRef.current) {
      tableRef.current = v.tableId;
      prevRef.current = null;
      eventSeq.current = null;
    }
    const round = v.tournament?.round ?? null;
    if (roundRef.current !== null && round !== null && round !== roundRef.current && v.tournament?.phase === "round") {
      watchRef.current = null; // new round: back to my own table
      audio.play("start");
      setFlash({ seq: -1, kind: "start", player: 0 });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 1700);
    }
    roundRef.current = round;
    const prev = prevRef.current;
    if (prev) playSoundsFor(prev, v);
    prevRef.current = v;
    const evSeq = v.event?.seq ?? 0;
    if (eventSeq.current !== null && v.event && evSeq !== eventSeq.current) {
      setFlash(v.event);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 1700);
    }
    eventSeq.current = evSeq;
    setView(v);
    setRecvAt(Date.now());
  }, []);

  useEffect(() => {
    const t = getToken();
    setToken(t);
    setJoinName(getName());
  }, [code]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const load = async () => {
      const req = reqRef.current;
      try {
        const w = watchRef.current;
        const v = await api<GameView>(`/api/games/${code}?token=${encodeURIComponent(token)}${w !== null ? `&watch=${w}` : ""}`);
        if (alive && req === reqRef.current) accept(v);
      } catch (e) {
        if (alive && seqRef.current < 0) setFatal((e as Error).message);
      }
    };
    loadRef.current = load;
    load();
    const id = setInterval(load, 1000);
    return () => { alive = false; clearInterval(id); };
  }, [token, code, accept]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const showToast = (msg: string) => { audio.play("error"); setToast(msg); setTimeout(() => setToast((t) => t === msg ? null : t), 3000); };

  function pickTable(id: number | null) {
    watchRef.current = id;
    reqRef.current += 1; // answers for the previous table are now stale
    loadRef.current();
  }

  async function send(action: Action) {
    if (busy) return;
    setBusy(true);
    try {
      const req = reqRef.current;
      const v = await api<GameView>(`/api/games/${code}/action`, { token, action, watch: watchRef.current });
      if (req === reqRef.current) accept(v);
      if (action.type === "play") setSelected([]);
    } catch (e) { showToast((e as Error).message); } finally { setBusy(false); }
  }

  async function join() {
    const n = joinName.trim() || "Игрок";
    saveName(n);
    setBusy(true);
    try {
      const v = await api<GameView>(`/api/games/${code}/join`, { token, name: n });
      accept(v);
    } catch (e) { showToast((e as Error).message); } finally { setBusy(false); }
  }

  async function startGame() {
    if (busy) return;
    setBusy(true);
    try {
      const v = await api<GameView>(`/api/games/${code}/start`, { token });
      accept(v);
    } catch (e) { showToast((e as Error).message); } finally { setBusy(false); }
  }

  // ── Fatal / loading ──
  if (fatal) return (
    <Centered>
      <div className="mb-4 text-6xl">🙀</div>
      <h1 className="font-display max-w-full break-words text-3xl sm:text-4xl">{fatal}</h1>
      <Link href="/" className="mt-6 inline-block font-display text-xl rounded-xl bg-highlight text-highlight-ink px-6 py-3">На главную</Link>
    </Centered>
  );
  if (!view) return (
    <Centered>
      <div className="animate-bounce text-6xl">💣</div>
      <p className="mt-4 font-display text-2xl">Загружаем стол…</p>
    </Centered>
  );

  const me = view.me;
  const opponents = view.players.map((p, i) => ({ ...p, idx: i })).filter((p) => p.idx !== me);
  const meP = me >= 0 ? view.players[me] : null;
  const hand = sortHand(view.hand);
  const validSel = selected.filter((id) => hand.some((c) => c.id === id));
  const selCards = hand.filter((c) => validSel.includes(c.id));
  const myTurn = view.status === "playing" && view.phase === "action" && view.current === me;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/game/${view.code}` : "";
  const msLeft = view.pending ? Math.max(0, view.pending.msLeft - (now - recvAt)) : 0;
  const iRespond = view.phase === "nope" && view.pending?.responder === me;
  const hasNope = hand.some((c) => c.type === "nope");
  const tv = view.tournament;
  const roundCountdown = tv ? Math.max(0, Math.ceil((tv.nextRoundIn - (now - recvAt)) / 1000)) : 0;
  const peekKey = `peek_${code}_${view.tableId ?? "x"}`;
  const dismissedSeq = dismissedPeek[peekKey] ?? Number(sessionStorage.getItem(peekKey) ?? 0);

  // ── Waiting room ──
  if (view.status === "waiting") {
    return (
      <Centered>
        {me >= 0 ? (
          <>
            <div className="mb-2 text-7xl">{view.mode === "tournament" ? "🏆" : "⏳"}</div>
            <h1 className="font-display max-w-full break-words text-3xl sm:text-4xl">
              {view.mode === "tournament" ? "Зал ожидания турнира" : "Зал ожидания"}
            </h1>
            <p className="mt-2 text-muted">
              Комната {view.code} · {view.mode === "tournament" ? `${view.players.length} игр.` : `${view.players.length}/${view.maxPlayers} игроков`}
            </p>
            {view.mode === "tournament" && (
              <div className="mx-auto mt-2 max-w-md text-sm text-muted">
                <p>
                  Каждый сыграет с каждым один на один. Все матчи раунда идут <b className="text-ink">одновременно на разных столах</b>.
                  Кому не хватило пары — отдыхает и смотрит другие столы. Побеждает тот, у кого больше побед.
                </p>
                {view.players.length >= 2 && (
                  <p className="mt-1">
                    Сейчас: <b className="text-ink">{view.players.length}</b> игр. · раундов:{" "}
                    <b className="text-ink">{view.players.length % 2 ? view.players.length : view.players.length - 1}</b> · матчей:{" "}
                    <b className="text-ink">{(view.players.length * (view.players.length - 1)) / 2}</b> · столов одновременно:{" "}
                    <b className="text-ink">{Math.floor(view.players.length / 2)}</b>
                  </p>
                )}
              </div>
            )}
            <div className="mt-6 max-h-[40vh] w-full max-w-md space-y-2 overflow-y-auto pr-1 scrollbar-thin">
              {view.players.map((p, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-xl border p-3 ${
                  i === me ? "border-accent bg-accent-soft" : "border-line bg-panel"
                }`}>
                  <span className="text-2xl">{p.isBot ? "🤖" : "😼"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{p.name}{i === me ? " (ты)" : ""}</p>
                    <p className="text-xs text-muted">{i === 0 ? "создатель" : "участник"}</p>
                  </div>
                  {i === 0 && <span className="rounded-lg bg-highlight px-2 py-1 text-xs font-bold text-highlight-ink">Хост</span>}
                </div>
              ))}
            </div>
            {view.isHost ? (
              <button onClick={startGame} disabled={view.players.length < 2 || busy}
                className="mt-6 font-display text-2xl rounded-2xl bg-accent px-8 py-3 text-white shadow-lg hover:brightness-110 disabled:opacity-40">
                {view.players.length < 2 ? (view.mode === "tournament" ? `Ждём игроков (${view.players.length}, нужно минимум 2)` : `Ждём игрока (${view.players.length}/${view.maxPlayers})`) : view.mode === "tournament" ? `Начать турнир (${view.players.length} игр.)` : "Начать игру!"}
              </button>
            ) : (
              <p className="mt-6 text-muted">Ждём, пока хост начнёт игру…</p>
            )}
            <div className="mt-6 w-full max-w-md">
              <p className="mb-1 text-sm text-muted">Пригласи друга:</p>
              <div className="flex gap-2">
                <input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-xl border border-line bg-ink/5 px-3 py-2 text-sm text-ink" />
                <button onClick={() => { navigator.clipboard?.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="shrink-0 rounded-xl bg-highlight px-4 font-semibold text-highlight-ink">
                  {copied ? "✓" : "Копировать"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2 text-7xl">😼</div>
            <h1 className="font-display max-w-full break-words text-3xl sm:text-4xl">{view.players[0]?.name} зовёт на дуэль!</h1>
            <div className="mx-auto mt-6 flex w-full max-w-sm gap-2">
              <input value={joinName} onChange={(e) => setJoinName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && join()} placeholder="Твоё имя" maxLength={24}
                className="min-w-0 flex-1 rounded-xl border border-line bg-ink/5 px-4 py-3 text-ink" />
              <button onClick={join} disabled={busy} className="font-display text-xl rounded-xl bg-highlight px-5 text-highlight-ink">Играть</button>
            </div>
          </>
        )}
        <Link href="/" className="mt-8 block text-muted underline">На главную</Link>
        {toast && <Toast text={toast} />}
      </Centered>
    );
  }

  if (me < 0 && !view.spectator) return (
    <Centered>
      <div className="mb-2 text-7xl">🚪</div>
      <h1 className="font-display max-w-full break-words text-3xl sm:text-4xl">Комната уже заполнена</h1>
      <p className="mt-2 text-muted">Сейчас играют: {view.players.map((p) => p.name).join(", ")}</p>
      <Link href="/" className="mt-6 inline-block font-display text-xl rounded-xl bg-highlight text-highlight-ink px-6 py-3">Создать свою игру</Link>
    </Centered>
  );

  // ── Play button logic ──
  let playLabel = "Выбери карты";
  let playOk = false;
  let needsName = false;
  let needsTarget = false;
  if (selCards.length === 1) {
    const t = selCards[0].type;
    if (t === "nope") playLabel = "«Неть» — только в ответ";
    else if (t === "defuse") playLabel = "«Обезвредь» сработает сама";
    else if (isCat(t)) playLabel = "Нужна пара одинаковых";
    else {
      playLabel = `Сыграть «${CARD_INFO[t].short}»`;
      playOk = true;
    }
  } else if (selCards.length >= 2) {
    const same = selCards.every((c) => c.type === selCards[0].type);
    if (!same) playLabel = "Нужны одинаковые карты";
    else if (selCards.length === 2) {
      playLabel = "Пара: украсть карту";
      playOk = true; needsTarget = true;
    } else if (selCards.length === 3) {
      playLabel = "Тройка: назвать карту";
      playOk = true; needsName = true; needsTarget = true;
    } else playLabel = "Максимум 3 карты";
  }
  if (!myTurn) playOk = false;

  const toggle = (id: string) => {
    audio.play("select");
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-3));
  };

  const doPlay = (target?: number, named?: CardType) => {
    const nm = named ?? pendingNamed;
    if (needsName && !nm) return;
    send({ type: "play", cardIds: validSel, named: nm, target });
    setTargetOpen(false); setPendingNamed(undefined);
    setTripleOpen(false);
  };

  // With a single living opponent there is nobody to choose — target is automatic
  const soleTarget = view.players.map((p, i) => ({ p, i })).filter(({ p, i }) => i !== me && !p.exploded);

  const onPlay = () => {
    if (!playOk) return;
    if (needsName) { setTripleOpen(true); return; }
    if (needsTarget) {
      if (soleTarget.length === 1) doPlay(soleTarget[0].i);
      else setTargetOpen(true);
      return;
    }
    doPlay();
  };

  // ── Status ──
  const spectating = view.spectator;
  let status = "";
  if (view.status === "finished") status = view.tournament ? "Матч окончен" : "Партия окончена";
  else if (spectating && view.tournament) {
    const tbl = view.tournament.tables.find((x) => x.id === view.tableId);
    status = `👀 Стол ${tbl?.num ?? ""}: ${view.players[0].name} против ${view.players[1].name} · ходит ${view.players[view.current]?.name}`;
  }
  else if (view.phase === "nope" && view.pending) {
    status = iRespond ? "Соперник сыграл карту — ответишь «Неть»?"
      : view.players[view.pending.responder].isBot
        ? `${view.players[view.pending.responder].name} думает…`
        : `Ждём ответа от ${view.players[view.pending.responder].name}…`;
  } else if (view.phase === "favor" && view.favor) {
    status = view.favor.giver === me ? "Выбери карту, которую отдашь" : `${view.players[view.favor.giver].name} выбирает карту…`;
  } else if (view.phase === "defuse" && view.defuse) {
    status = view.defuse.player === me ? "Спрячь котёнка обратно в колоду" : `${view.players[view.defuse.player].name} прячет котёнка…`;
  } else if (myTurn) {
    status = `Твой ход! Играй карты или бери из колоды${view.turnsLeft > 1 ? ` · ходов: ${view.turnsLeft}` : ""}`;
  } else {
    status = `Ходит ${view.players[view.current]?.name}${view.turnsLeft > 1 ? ` · ходов: ${view.turnsLeft}` : ""}`;
  }

  const risk = view.deckCount ? Math.round(100 / view.deckCount) : 0;
  const peekVisible = view.peek && view.peek.seq > dismissedSeq;
  const shaking = flash?.kind === "explode" || flash?.kind === "attack";
  const aliveOpponents = opponents.filter((p) => !p.exploded);

  return (
    <div className={`game-surface min-h-screen flex min-w-0 flex-col ${shaking ? "animate-shake" : ""}`}>
      {/* Header */}
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-3 py-3 sm:flex-nowrap sm:gap-3 sm:px-4">
        <Link href="/" className="font-display min-w-0 max-w-[52vw] truncate text-[clamp(1rem,4.2vw,1.5rem)] leading-none sm:max-w-none">
          Взрывные <span className="text-heading">котята</span>
        </Link>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5 text-sm sm:gap-2">
          <span className="hidden rounded-full bg-panel px-3 py-1 sm:inline">
            {view.mode === "bot" ? "🤖 Бот" : tv ? `🏆 Турнир · ${tv.total} игр.` : `${view.players.length} игрока(ов)`}
          </span>
          <span className="max-w-[42vw] truncate rounded-full bg-panel px-2.5 py-1 font-display text-sm sm:max-w-none sm:px-3 sm:text-base">
            {tv ? `${tv.names[tv.myIdx]} · ${tv.standings.find((r) => r.idx === tv.myIdx)?.wins ?? 0} поб.` : `${meP?.name} ${view.score[me] ?? 0}`}
          </span>
          <SettingsButton compact />
          <ThemeToggle compact />
          <button onClick={() => setShowRules(true)} className="h-9 w-9 shrink-0 rounded-full border border-line bg-ink/10 font-bold hover:bg-ink/20" title="Правила">?</button>
        </div>
      </header>

      {tv && <TableSwitcher v={view} countdown={roundCountdown} onPick={pickTable} />}

      <div className="grid min-w-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="flex min-w-0 flex-col">
          {/* Opponents */}
          <section className="px-2 pt-3 sm:px-4">
            <div className="flex flex-wrap justify-center gap-2">
              {opponents.map((p) => (
                <div key={p.idx} className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition ${
                  view.current === p.idx && view.status === "playing"
                    ? "border-highlight bg-highlight text-highlight-ink"
                    : p.exploded ? "border-line bg-panel opacity-40" : "border-line bg-panel"
                }`}>
                  <span className="shrink-0 text-xl">{p.isBot ? "🤖" : "😼"}</span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm leading-tight">{p.name}</p>
                    <p className="text-xs opacity-80">
                      {p.exploded ? "💥 выбыл" : `карт: ${p.handCount}`}
                      {view.current === p.idx && !p.exploded ? " · ход" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Table */}
          <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 px-3 py-5 sm:px-4">
            <div className="min-h-8 max-w-full break-words px-1 text-center font-display text-lg leading-tight text-heading sm:text-2xl">{status}</div>

            <div className="flex max-w-full items-end justify-center gap-4 sm:gap-10">
              <div className="flex flex-col items-center gap-2">
                <button onClick={() => myTurn && send({ type: "draw" })} disabled={!myTurn || busy}
                  className={`relative transition ${myTurn ? "cursor-pointer hover:-translate-y-1" : "cursor-default"}`}
                  title="Взять карту и закончить ход">
                  <div className="absolute left-2 top-2"><CardBack size="md" /></div>
                  <div className="absolute left-1 top-1"><CardBack size="md" /></div>
                  <CardBack size="md" className={myTurn ? "ring-4 ring-highlight animate-pulse" : ""} />
                </button>
                <div className="text-sm text-muted">Колода: <b>{view.deckCount}</b></div>
                <div className="text-xs text-danger">Шанс котёнка: {risk}%</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                {view.discardTop ? (
                  <CardFace type={view.discardTop.type} size="md" />
                ) : (
                  <div className="flex h-36 w-24 items-center justify-center rounded-xl border-2 border-dashed border-line p-2 text-center text-xs text-muted sm:h-40 sm:w-28">Сброс</div>
                )}
                <div className="text-sm text-muted">Сброс: {view.discardCount}</div>
                <div className="text-xs opacity-0">.</div>
              </div>
            </div>

            {/* Pending action */}
            {view.phase === "nope" && view.pending && (
              <div className="animate-pop w-full max-w-lg rounded-2xl border-2 border-highlight/60 bg-panel-strong p-4">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-8">
                    {view.pending.cards.map((c) => (
                      <CardFace key={c.id} type={c.type} size="sm" showText={false} />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-muted">{view.players[view.pending.by].name} играет</div>
                    <div className="font-display text-xl leading-tight">{KIND_LABEL[view.pending.kind]}</div>
                    {view.pending.target !== undefined && (
                      <div className="text-sm text-muted">Цель: {view.players[view.pending.target]?.name}</div>
                    )}
                    {view.pending.named && (
                      <div className="text-sm text-heading">Требует: «{CARD_INFO[view.pending.named].name}»</div>
                    )}
                    {view.pending.nopes > 0 && (
                      <div className="mt-1 text-sm">
                        {"✋".repeat(view.pending.nopes)}{" "}
                        <b className={view.pending.nopes % 2 ? "text-nope" : "text-good"}>
                          {view.pending.nopes % 2 ? "отменено" : "снова в силе"}
                        </b>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full bg-highlight transition-all duration-200" style={{ width: `${Math.min(100, (msLeft / 6000) * 100)}%` }} />
                </div>
                {iRespond && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => send({ type: "nope" })} disabled={!hasNope || busy}
                      className="flex-1 rounded-xl border-2 border-[#f09082] bg-[#d8483c] py-2 font-display text-2xl text-white hover:brightness-110 disabled:opacity-40">
                      ✋ Неть!
                    </button>
                    <button onClick={() => send({ type: "pass" })} disabled={busy}
                      className="flex-1 rounded-xl bg-ink/10 py-2 font-display text-xl hover:bg-ink/20">
                      Пропустить ({Math.ceil(msLeft / 1000)})
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* My hand */}
          {spectating ? (
            <section className="w-full min-w-0 border-t border-line bg-panel-strong px-4 py-5 text-center">
              {tv?.byeMe ? (
                <>
                  <p className="font-display text-xl text-heading">😴 В этом раунде у тебя пауза</p>
                  <p className="mt-1 text-sm text-muted">
                    Переключайся между столами сверху и смотри любую игру. В следующем раунде сыграешь с новым соперником.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-xl text-heading">👀 Ты смотришь чужой стол</p>
                  <p className="mt-1 text-sm text-muted">Карты игроков скрыты. Выбери другой стол сверху или вернись к своему.</p>
                </>
              )}
            </section>
          ) : (
          <section className="w-full min-w-0 border-t border-line bg-panel-strong px-2 pb-4 pt-3 sm:px-4">
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
              <div className={`flex max-w-full min-w-0 items-center gap-2 rounded-full px-3 py-1 sm:px-4 ${myTurn ? "bg-highlight text-highlight-ink" : "bg-panel"}`}>
                <span className="font-display min-w-0 max-w-[55vw] truncate text-lg sm:max-w-none">{meP?.name}</span>
                <span className="shrink-0 text-sm opacity-80">· карт: {hand.length}</span>
              </div>
              <div className="flex w-full min-w-0 gap-2 sm:ml-auto sm:w-auto">
                <button onClick={onPlay} disabled={!playOk || busy}
                  className="min-w-0 flex-1 whitespace-normal break-words rounded-xl bg-accent px-2 py-2 text-center font-display text-sm leading-tight text-white hover:brightness-110 disabled:opacity-40 sm:flex-none sm:px-4 sm:text-lg">
                  {playLabel}
                </button>
                <button onClick={() => send({ type: "draw" })} disabled={!myTurn || busy}
                  className="min-w-0 flex-1 whitespace-normal break-words rounded-xl bg-highlight px-2 py-2 text-center font-display text-sm leading-tight text-highlight-ink hover:brightness-110 disabled:opacity-40 sm:flex-none sm:px-4 sm:text-lg">
                  Взять карту
                </button>
              </div>
            </div>
            <div className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain px-1 pb-2 pt-6 scrollbar-thin">
              {hand.length === 0 && <div className="px-4 py-10 text-muted">У тебя нет карт. Остаётся только брать из колоды…</div>}
              {hand.map((c) => (
                <CardFace key={c.id} type={c.type} selected={validSel.includes(c.id)} onClick={() => toggle(c.id)} />
              ))}
            </div>
          </section>
          )}
        </main>

        {/* Log */}
        <aside className="flex max-h-[40vh] min-w-0 flex-col overflow-hidden border-l border-line bg-panel-strong lg:sticky lg:top-0 lg:max-h-[calc(100svh-60px)]">
          {tv && (
            <div className="border-b border-line px-3 py-3">
              <StandingsTable v={view} compact />
            </div>
          )}
          <div className="border-b border-line px-4 py-2 font-display text-lg">Журнал</div>
          <div className="flex flex-1 flex-col-reverse space-y-1.5 overflow-y-auto px-4 py-2 text-sm scrollbar-thin">
            {[...view.log].reverse().map((l) => (
              <div key={l.id} className={`rounded-md px-2 py-1 ${
                l.for !== undefined ? "border-l-2 border-highlight bg-highlight/15" : ""
              } ${l.tone === "danger" ? "text-danger" : l.tone === "good" ? "text-good" : l.tone === "nope" ? "text-nope" : "text-ink"}`}>
                {l.for !== undefined && <span className="mr-1 text-[10px] uppercase text-heading">лично</span>}
                {l.text}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* ── Modals ── */}
      {peekVisible && view.peek && (
        <Modal>
          <h2 className="font-display text-3xl text-heading">👁️ Грядущее</h2>
          <p className="text-sm text-muted">3 верхние карты колоды (слева — самая верхняя)</p>
          <div className="my-5 flex flex-wrap justify-center gap-3">
            {view.peek.cards.map((c, i) => (
              <div key={c.id} className="flex flex-col items-center gap-1">
                <CardFace type={c.type} size="md" />
                <span className="text-xs text-muted">{i + 1}-я</span>
              </div>
            ))}
            {view.peek.cards.length === 0 && <p className="text-muted">Колода пуста</p>}
          </div>
          <button onClick={() => { const sq = view.peek!.seq; setDismissedPeek((d) => ({ ...d, [peekKey]: sq })); sessionStorage.setItem(peekKey, String(sq)); }}
            className="rounded-xl bg-highlight px-6 py-2 font-display text-xl text-highlight-ink">
            Запомнил(а)
          </button>
        </Modal>
      )}

      {view.phase === "favor" && view.favor?.giver === me && (
        <Modal>
          <h2 className="font-display text-3xl">🖤 Подлижись</h2>
          <p className="text-sm text-muted">{view.players[view.favor.receiver].name} подлизывается. Выбери карту:</p>
          <div className="my-5 flex max-h-[55vh] flex-wrap justify-center gap-2 overflow-y-auto pt-4">
            {hand.map((c) => (
              <CardFace key={c.id} type={c.type} size="md" showText={false} onClick={() => send({ type: "give", cardId: c.id })} />
            ))}
          </div>
        </Modal>
      )}

      {view.phase === "defuse" && view.defuse?.player === me && (
        <Modal>
          <h2 className="font-display text-3xl text-good">🧯 Котёнок обезврежен!</h2>
          <p className="text-sm text-muted">Тайно положи его обратно в колоду.</p>
          <div className="my-5">
            <div className="font-display text-2xl text-heading">
              {Math.min(defusePos, view.deckCount) === 0 ? "На самый верх"
                : Math.min(defusePos, view.deckCount) === view.deckCount ? "В самый низ"
                : `${Math.min(defusePos, view.deckCount) + 1}-й сверху`}
            </div>
            <input type="range" min={0} max={view.deckCount} value={Math.min(defusePos, view.deckCount)}
              onChange={(e) => setDefusePos(Number(e.target.value))} className="mt-3 w-full accent-highlight" />
            <div className="flex justify-between text-xs text-muted">
              <span>верх</span><span>низ ({view.deckCount + 1} позиций)</span>
            </div>
            <div className="mt-3 flex justify-center gap-2 text-sm">
              <button onClick={() => setDefusePos(0)} className="rounded-lg bg-ink/10 px-3 py-1">Наверх 😈</button>
              <button onClick={() => setDefusePos(Math.floor(Math.random() * (view.deckCount + 1)))} className="rounded-lg bg-ink/10 px-3 py-1">Случайно</button>
              <button onClick={() => setDefusePos(view.deckCount)} className="rounded-lg bg-ink/10 px-3 py-1">Вниз</button>
            </div>
          </div>
          <button onClick={() => send({ type: "place", position: Math.min(defusePos, view.deckCount) })} disabled={busy}
            className="rounded-xl bg-highlight px-6 py-2 font-display text-xl text-highlight-ink">
            Спрятать котёнка
          </button>
        </Modal>
      )}

      {/* Triple: name a card */}
      {tripleOpen && (
        <Modal onClose={() => setTripleOpen(false)}>
          <h2 className="font-display text-3xl">Назови карту</h2>
          <p className="text-sm text-muted">Если она есть у соперника — он обязан её отдать.</p>
          <div className="my-5 flex flex-wrap justify-center gap-2">
            {NAMEABLE_TYPES.map((t) => (
              <CardFace key={t} type={t} size="md" onClick={() => {
                if (soleTarget.length === 1) { doPlay(soleTarget[0].i, t); return; }
                setPendingNamed(t); setTripleOpen(false); setTargetOpen(true);
              }} />
            ))}
          </div>
          <button onClick={() => setTripleOpen(false)} className="text-muted underline">Отмена</button>
        </Modal>
      )}

      {/* Target picker for pair/triple */}
      {targetOpen && (
        <Modal onClose={() => setTargetOpen(false)}>
          <h2 className="font-display text-3xl">Выбери цель</h2>
          <p className="text-sm text-muted">
            {pendingNamed ? `Кому назначить «${CARD_INFO[pendingNamed].name}»?` : "У кого украсть случайную карту?"}
          </p>
          <div className="my-5 flex flex-wrap justify-center gap-3">
            {aliveOpponents.map((p) => (
              <button key={p.idx} onClick={() => doPlay(p.idx)}
                className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 transition hover:border-highlight hover:bg-highlight/10">
                <span className="text-2xl">{p.isBot ? "🤖" : "😼"}</span>
                <div className="text-left">
                  <p className="font-semibold text-ink">{p.name}</p>
                  <p className="text-xs text-muted">карт: {p.handCount}</p>
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => setTargetOpen(false)} className="text-muted underline">Отмена</button>
        </Modal>
      )}

      {/* Tournament: final standings */}
      {tv?.phase === "finished" && !dismissedFinal && !flash && (
        <Modal wide>
          <div className="text-8xl">🏆</div>
          <h2 className="mt-2 font-display text-4xl text-heading sm:text-5xl">Турнир окончен!</h2>
          <p className="mt-2 text-lg text-ink">
            {tv.champion !== null
              ? tv.champion === tv.myIdx
                ? "Ты чемпион! Каждый сыграл с каждым — и ты победил(а) чаще всех."
                : `Чемпион — ${tv.names[tv.champion]}.`
              : `Ничья за первое место: ${tv.tie.map((i) => tv.names[i]).join(", ")}.`}
          </p>
          <div className="mx-auto mt-5 max-w-lg rounded-2xl border border-line bg-panel p-3">
            <StandingsTable v={view} />
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button onClick={() => send({ type: "rematch" })} disabled={busy}
              className="rounded-xl bg-highlight px-6 py-2 font-display text-2xl text-highlight-ink hover:brightness-110 disabled:opacity-50">
              Новый турнир
            </button>
            <button onClick={() => setDismissedFinal(true)} className="rounded-xl bg-ink/10 px-5 py-2 font-display text-xl hover:bg-ink/20">Посмотреть столы</button>
            <Link href="/" className="flex items-center rounded-xl bg-ink/10 px-5 py-2 font-display text-xl">В меню</Link>
          </div>
        </Modal>
      )}

      {/* Tournament: my match is over, the round goes on */}
      {tv && tv.phase !== "finished" && !spectating && view.status === "finished" && dismissedRound !== tv.round && !flash && (
        <Modal wide>
          <div className="text-7xl">{view.winner === me ? "🎉" : "💥"}</div>
          <h2 className={`mt-2 font-display text-3xl sm:text-4xl ${view.winner === me ? "text-heading" : "text-ink"}`}>
            {view.winner === me ? "Ты выиграл(а) матч!" : `Матч выиграл(а) ${view.players[view.winner ?? 0]?.name}`}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {tv.phase === "between"
              ? `Все столы доиграли. Следующий раунд начнётся через ${roundCountdown} с.`
              : "Ждём, пока доиграют остальные столы. Пока можно посмотреть их партии."}
          </p>
          <div className="mx-auto mt-5 max-w-lg rounded-2xl border border-line bg-panel p-3">
            <StandingsTable v={view} />
          </div>
          <div className="mt-5 flex justify-center">
            <button onClick={() => setDismissedRound(tv.round)}
              className="rounded-xl bg-highlight px-6 py-2 font-display text-2xl text-highlight-ink hover:brightness-110">
              Смотреть другие столы
            </button>
          </div>
        </Modal>
      )}

      {/* Game over */}
      {view.status === "finished" && !flash && !view.tournament && (
        <Modal>
          <div className="text-8xl">{view.winner === me ? "🏆" : "💥"}</div>
          <h2 className={`mt-2 font-display text-4xl sm:text-5xl ${view.winner === me ? "text-heading" : "text-danger"}`}>
            {view.winner === me ? "Ты победил(а)!" : "Ты выбыл(а)!"}
          </h2>
          <p className="mt-2 text-muted">
            {view.winner === me ? "Поздравляем! Ты последний выживший!" : `Победитель — ${view.players[view.winner ?? 0]?.name}.`}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => send({ type: "rematch" })} disabled={busy}
              className="rounded-xl bg-highlight px-6 py-2 font-display text-2xl text-highlight-ink">
              Реванш!
            </button>
            <Link href="/" className="flex items-center rounded-xl bg-ink/10 px-5 py-2 font-display text-xl">В меню</Link>
          </div>
        </Modal>
      )}

      {showRules && (
        <Modal onClose={() => setShowRules(false)} wide>
          <div className="max-h-[75vh] overflow-y-auto pr-2 text-left scrollbar-thin">
            <Rules />
          </div>
          <button onClick={() => setShowRules(false)} className="mt-4 rounded-xl bg-highlight px-6 py-2 font-display text-xl text-highlight-ink">Понятно</button>
        </Modal>
      )}

      {flash && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className={`animate-boom max-w-[calc(100vw-2rem)] break-words px-3 text-center font-display text-[clamp(2rem,12vw,6rem)] drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] ${FLASH[flash.kind].cls}`}>
            {FLASH[flash.kind].text}
          </div>
        </div>
      )}

      {toast && <Toast text={toast} />}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="game-surface flex min-h-screen min-w-0 flex-col items-center justify-center overflow-x-clip px-4 text-center">{children}</div>;
}

function Toast({ text }: { text: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-pop break-words rounded-xl border border-accent bg-surface px-4 py-2 text-center text-ink shadow-xl">
      {text}
    </div>
  );
}

function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`animate-pop my-auto max-h-[calc(100dvh-1.5rem)] w-full min-w-0 overflow-x-hidden overflow-y-auto break-words ${wide ? "max-w-5xl" : "max-w-xl"} rounded-3xl border-2 border-line bg-surface p-4 text-center shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
