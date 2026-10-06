import { isStickerId } from "../stickers";
import { GameError } from "./engine";
import type { GameState } from "./types";

export const CHAT_MAX_LEN = 200;
export const CHAT_KEEP = 50;
const CHAT_COOLDOWN_MS = 700;

function fail(msg: string): never {
  throw new GameError(msg);
}

/** Appends a chat message or quick sticker. In tournaments, stickers are scoped to the active table. */
export function postChat(
  s: GameState,
  token: string,
  input: { text?: unknown; sticker?: unknown },
  now: number,
  watch?: number | null,
): void {
  const pi = s.players.findIndex((p) => p.id === token);
  if (pi < 0) fail("Ты не участник этой игры");
  const me = s.players[pi];
  if (me.isBot) fail("Боты в чат не пишут");

  const hasText = typeof input.text === "string" && input.text.trim().length > 0;
  const hasSticker = typeof input.sticker === "string" && input.sticker.length > 0;
  if (hasText === hasSticker) fail("Отправь либо сообщение, либо стикер");

  const chat = (s.chat ??= []);
  for (let i = chat.length - 1; i >= 0; i--) {
    if (chat[i].from === pi) {
      if (now - chat[i].ts < CHAT_COOLDOWN_MS) fail("Не так быстро! Подожди секунду.");
      break;
    }
  }

  // Determine which tournament table this message belongs to (if in an active tournament round)
  let tableId: number | null = null;
  if (s.mode === "tournament" && s.tournament && s.status === "playing" && s.tournament.phase === "round") {
    const t = s.tournament;
    const watched = typeof watch === "number" ? t.tables.find((tb) => tb.id === watch) : null;
    if (watched) {
      tableId = watched.id;
    } else {
      const myTable = t.tables.find((tb) => tb.a === pi || tb.b === pi);
      if (myTable) {
        tableId = myTable.id;
      } else {
        const defaultTable = t.tables.find((x) => x.game.status === "playing") ?? t.tables[0];
        tableId = defaultTable?.id ?? null;
      }
    }
  }

  if (hasSticker) {
    if (!isStickerId(input.sticker)) fail("Такого стикера нет");
    chat.push({
      id: (chat.length ? chat[chat.length - 1].id : 0) + 1,
      from: pi,
      name: me.name,
      avatar: me.avatar ?? "😼",
      kind: "sticker",
      sticker: input.sticker as string,
      tableId,
      ts: now,
    });
  } else {
    const text = (input.text as string).replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LEN);
    if (!text) fail("Пустое сообщение");
    chat.push({
      id: (chat.length ? chat[chat.length - 1].id : 0) + 1,
      from: pi,
      name: me.name,
      avatar: me.avatar ?? "😼",
      kind: "text",
      text,
      tableId,
      ts: now,
    });
  }
  if (chat.length > CHAT_KEEP) chat.splice(0, chat.length - CHAT_KEEP);
  s.seq += 1;
}
