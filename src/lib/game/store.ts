import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { botStep } from "./bot";
import { prepareSavedRoom } from "./compat";
import { assertRoomIntegrity } from "./deck";
import { GameError, tick } from "./engine";
import { DEFAULT_AVATAR } from "../profile";
import { tournamentTick } from "./tournament";
import type { GameListItem, GameState } from "./types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A room is "occupied" while someone has its page open (clients poll every second). */
const PRESENCE_TTL_SECONDS = 20;
/** Abandoned waiting rooms are deleted after this long without anyone. */
const ABANDONED_AFTER_MINUTES = 30;

export function newCode() {
  let c = "";
  for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return c;
}

/** Moves time-based things forward: bot moves / Nope windows, or every tournament table at once. */
function advance(s: GameState, now: number) {
  if (s.mode === "tournament") tournamentTick(s, now);
  else tick(s, now, botStep);
}

export async function insertGame(state: GameState) {
  await db.insert(games).values({ code: state.code, state, version: state.seq });
}

export async function withGame<T>(
  code: string,
  fn?: (s: GameState, now: number) => T,
): Promise<{ state: GameState; result: T | undefined }> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(games).where(eq(games.code, code)).for("update");
    if (!rows.length) throw new GameError("Игра не найдена");
    const state = rows[0].state as GameState;
    const now = Date.now();
    const snapshot = JSON.stringify(state);
    prepareSavedRoom(state, now);
    advance(state, now);
    let result: T | undefined;
    if (fn) {
      result = fn(state, now);
      advance(state, now);
    }
    assertRoomIntegrity(state);
    if (JSON.stringify(state) !== snapshot) {
      await tx.update(games).set({ state, version: state.seq, updatedAt: new Date() }).where(eq(games.code, code));
    }
    return { state, result };
  });
}

/** Presence heartbeat: marks the room as currently occupied (throttled to one write per 3s). */
export async function touchGame(code: string) {
  await db
    .update(games)
    .set({ lastSeenAt: sql`now()` })
    .where(and(eq(games.code, code), sql`${games.lastSeenAt} < now() - interval '3 seconds'`));
}

/** Waiting rooms that somebody is actually sitting in. */
export async function listOpenGames(): Promise<GameListItem[]> {
  // Drop rooms nobody has come back to for a long time
  await db
    .delete(games)
    .where(
      and(
        sql`(${games.state}->>'status') = 'waiting'`,
        sql`${games.lastSeenAt} < now() - make_interval(mins => ${ABANDONED_AFTER_MINUTES})`,
      ),
    );

  const rows = await db
    .select({ state: games.state })
    .from(games)
    .where(
      and(
        sql`(${games.state}->>'status') = 'waiting'`,
        sql`${games.lastSeenAt} > now() - make_interval(secs => ${PRESENCE_TTL_SECONDS})`,
      ),
    )
    .orderBy(desc(games.lastSeenAt))
    .limit(20);

  return rows
    .map((r) => r.state as GameState)
    .filter((s) => s.players.length > 0 && s.players.length < s.maxPlayers)
    .map((s) => ({
      code: s.code,
      mode: s.mode,
      maxPlayers: s.maxPlayers,
      playerCount: s.players.length,
      playerNames: s.players.map((p) => p.name),
      playerAvatars: s.players.map((p) => p.avatar ?? DEFAULT_AVATAR),
      status: s.status,
    }));
}
