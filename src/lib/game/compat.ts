import { randomUUID } from "node:crypto";
import { assertDeckIntegrity, DECK_VERSION } from "./deck";
import { log, startGame } from "./engine";
import type { GameState } from "./types";

/** Upgrade saved games without silently taking cards from somebody's hand. */
function prepareTable(s: GameState, now: number): boolean {
  let changed = false;
  if (!s.matchId) {
    s.matchId = randomUUID();
    changed = true;
  }
  if (s.status === "playing" && s.deckVersion !== DECK_VERSION) {
    let correct = false;
    try { assertDeckIntegrity(s); correct = true; } catch { /* legacy oversized deck */ }
    if (correct) {
      s.deckVersion = DECK_VERSION;
      changed = true;
    } else {
      startGame(s, now);
      log(s, "Состав колоды исправлен. Эта партия пересдана; счёт предыдущих партий сохранён.", { tone: "info" });
      return true;
    }
  }
  if (changed) s.seq++;
  return changed;
}

export function prepareSavedRoom(s: GameState, now: number): void {
  if (!Array.isArray(s.chat)) s.chat = [];
  if (s.mode !== "tournament") {
    prepareTable(s, now);
    return;
  }
  if (!s.matchId) {
    s.matchId = randomUUID();
    s.seq++;
  }
  for (const table of s.tournament?.tables ?? []) {
    if (prepareTable(table.game, now)) {
      table.lastSeq = table.game.seq;
      table.lastChange = now;
      s.seq++;
    }
  }
}
