"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, getName, getToken, saveName } from "@/lib/client";
import type { GameListItem } from "@/lib/game/types";

export function HomeClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [openGames, setOpenGames] = useState<GameListItem[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(getName());
  }, []);

  const loadGames = useCallback(async () => {
    try {
      const list = await api<GameListItem[]>("/api/games/list");
      setOpenGames(list);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGames();
    const id = setInterval(loadGames, 5000);
    return () => clearInterval(id);
  }, [loadGames]);

  async function create(mode: "bot" | "friends" | "tournament") {
    setError(null);
    const n = name.trim() || "Игрок";
    saveName(n);
    setBusy(mode);
    try {
      const { code } = await api<{ code: string }>("/api/games", {
        mode, name: n, token: getToken(),
        maxPlayers: mode === "bot" ? 2 : maxPlayers,
      });
      router.push(`/game/${code}`);
    } catch (e) { setError((e as Error).message); setBusy(null); }
  }

  async function join(c?: string) {
    const gc = (c ?? code).trim().toUpperCase();
    if (gc.length < 4) return setError("Введи код комнаты");
    setError(null);
    const n = name.trim() || "Игрок";
    saveName(n);
    setBusy("join-" + gc);
    try {
      await api(`/api/games/${gc}/join`, { name: n, token: getToken() });
      router.push(`/game/${gc}`);
    } catch (e) { setError((e as Error).message); setBusy(null); }
  }

  return (
    <div className="w-full min-w-0 rounded-[2rem] border border-line bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-2xl">😼</span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Стол уже накрыт</p>
          <h2 className="font-display mt-1 text-2xl leading-tight text-ink sm:text-3xl">С кем сыграем?</h2>
        </div>
      </div>

      <label htmlFor="player-name" className="mb-1.5 block text-sm font-semibold text-muted">Твоё имя</label>
      <input
        id="player-name" value={name} onChange={(e) => setName(e.target.value)}
        maxLength={24} placeholder="Например, Кот Борис"
        className="w-full min-w-0 rounded-xl border border-line bg-ink/5 px-4 py-3 text-base text-ink outline-none placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/15"
      />

      <div className="mt-4 grid min-w-0 gap-2.5">
        <button onClick={() => create("bot")} disabled={!!busy}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-mint/40 bg-mint-soft px-3 py-3 font-semibold leading-tight text-ink transition hover:brightness-110 disabled:opacity-60">
          <span>🤖</span><span>{busy === "bot" ? "Создаём…" : "Играть с ботом"}</span>
        </button>
        <button onClick={() => create("friends")} disabled={!!busy}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent px-3 py-3 font-semibold leading-tight text-white shadow-lg shadow-accent/25 transition hover:brightness-110 disabled:opacity-60">
          <span>👥</span><span>{busy === "friends" ? "Создаём…" : `Создать комнату на ${maxPlayers}`}</span>
        </button>
      </div>

      <button onClick={() => create("tournament")} disabled={!!busy}
        className="mt-2.5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-highlight/50 bg-gold-soft px-3 py-3 font-semibold leading-tight text-ink transition hover:brightness-110 disabled:opacity-60">
        <span>🏆</span>
        <span className="text-left leading-tight">
          {busy === "tournament" ? "Создаём…" : "Создать турнир"}
          <span className="block text-xs font-normal text-muted">каждый с каждым · от 2 игроков, без ограничений</span>
        </span>
      </button>

      {/* Player count selector */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-sm text-muted">Игроков:</span>
        {[2, 3, 4].map((n) => (
          <button key={n} onClick={() => setMaxPlayers(n)}
            className={`h-9 w-9 rounded-lg text-sm font-bold transition ${
              maxPlayers === n ? "bg-accent text-white" : "bg-ink/10 text-muted hover:bg-ink/20"
            }`}>{n}</button>
        ))}
      </div>

      {/* Open games */}
      {openGames.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-muted">Открытые игры</h3>
            <button onClick={loadGames} className="text-xs text-accent hover:underline">Обновить</button>
          </div>
          <div className="max-h-40 space-y-2 overflow-y-auto scrollbar-thin">
            {openGames.map((g) => (
              <button key={g.code} onClick={() => join(g.code)} disabled={!!busy}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-ink/5 p-2.5 text-left transition hover:bg-ink/10 disabled:opacity-60">
                <span className="font-display text-lg text-accent">{g.code}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{g.playerNames.join(", ")}</p>
                  <p className="text-xs text-muted">{g.mode === "tournament" ? `${g.playerCount} игр. · 🏆 турнир` : `${g.playerCount}/${g.maxPlayers} · ${g.mode === "bot" ? "бот" : "друзья"}`}</p>
                </div>
                <span className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white">Войти</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="my-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
        <span className="h-px flex-1 bg-line" />или войди по коду<span className="h-px flex-1 bg-line" />
      </div>
      <div className="flex min-w-0 gap-2">
        <label htmlFor="room-code" className="sr-only">Код комнаты</label>
        <input id="room-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && join()} maxLength={8} placeholder="ABCDE"
          className="min-w-0 flex-1 rounded-xl border border-line bg-ink/5 px-3 py-3 text-base font-bold uppercase tracking-[0.2em] text-ink outline-none placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/15" />
        <button onClick={() => join()} disabled={!!busy}
          className="shrink-0 rounded-xl bg-highlight px-4 py-3 font-semibold text-highlight-ink transition hover:brightness-110 disabled:opacity-60">
          {busy === "join" ? "…" : "Войти"}
        </button>
      </div>
      {error && <p role="alert" className="mt-4 break-words rounded-xl border border-nope/50 bg-nope/10 px-3 py-2 text-sm text-nope">{error}</p>}
    </div>
  );
}
