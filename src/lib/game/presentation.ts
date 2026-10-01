import type { GameView } from "./types";

/** A new deal, table, tournament run or seat must never reuse a previous peek dismissal. */
export function peekStorageKey(view: Pick<GameView, "code" | "matchId" | "me">): string {
  return `ek:peek:${view.code}:${view.matchId}:${view.me}`;
}

export function shouldShowPeek(view: Pick<GameView, "peek" | "me" | "status" | "spectator">, dismissed?: number): boolean {
  return view.status === "playing" && !view.spectator && !!view.peek &&
    view.peek.player === view.me && view.peek.seq !== dismissed;
}

export function readPeekDismissal(key: string): number | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  } catch { return undefined; }
}

export function savePeekDismissal(key: string, seq: number): void {
  try { window.sessionStorage.setItem(key, String(seq)); } catch { /* in-memory dismissal still works */ }
}
