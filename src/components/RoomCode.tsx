"use client";

import { useState } from "react";

export function RoomCode({ code, compact = false }: { code: string; compact?: boolean }) {
  const [message, setMessage] = useState("");
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Код скопирован");
    } catch {
      setMessage("Выдели код и скопируй его вручную");
    }
    window.setTimeout(() => setMessage(""), 2500);
  }

  if (compact) {
    return (
      <button type="button" onClick={copyCode} aria-label="Скопировать код комнаты" title={message || "Скопировать код комнаты"}
        className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs hover:border-accent">
        <span className="text-muted">Код:</span><span className="font-mono font-bold tracking-wider text-heading">{code}</span>
        <span aria-hidden="true">{message === "Код скопирован" ? "✓" : "⧉"}</span>
      </button>
    );
  }

  return (
    <div className="mx-auto my-4 w-full max-w-sm rounded-2xl border border-highlight/40 bg-panel p-4 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Код комнаты</p>
      <p data-testid="room-code" className="my-2 select-all break-all font-mono text-[clamp(2rem,9vw,3rem)] font-bold tracking-[0.14em] text-heading">{code}</p>
      <button type="button" onClick={copyCode} aria-label="Скопировать код комнаты"
        className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-highlight-ink hover:brightness-110">Скопировать код</button>
      <p aria-live="polite" className="mt-2 text-xs text-muted">{message || "Друзья могут ввести этот код на главной"}</p>
    </div>
  );
}
