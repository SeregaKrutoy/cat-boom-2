"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { audio, type Track } from "@/lib/audio";

export function useAudioSettings() {
  return useSyncExternalStore(audio.subscribe, audio.getSettings, audio.getServerSettings);
}

/** Mounted once in the root layout: unlocks audio on the first user gesture. */
export function AudioRoot() {
  const s = useAudioSettings();
  const locked = useSyncExternalStore(audio.subscribe, audio.isLocked, audio.isLockedServer);
  useEffect(() => {
    audio.init();
  }, []);
  if (!locked || s.muted || !s.musicOn) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex justify-center px-4">
      <div className="animate-pop max-w-full rounded-full border border-line bg-surface/95 px-4 py-2 text-center text-sm font-semibold text-ink shadow-xl backdrop-blur">
        🎵 Нажми в любом месте — включится музыка
      </div>
    </div>
  );
}

/** Declares which background music should play on the current screen. */
export function MusicTrack({ track }: { track: Track }) {
  useEffect(() => {
    audio.setTrack(track);
  }, [track]);
  return null;
}

function Slider({
  label, icon, value, onChange, disabled, onRelease,
}: {
  label: string; icon: string; value: number; disabled?: boolean;
  onChange: (v: number) => void; onRelease?: () => void;
}) {
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-semibold text-ink">{icon} {label}</span>
        <span className="tabular-nums text-muted">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range" min={0} max={100} step={1} value={Math.round(value * 100)}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={onRelease}
        onKeyUp={onRelease}
        className="w-full accent-highlight"
      />
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-ink/5 px-4 py-3 text-left transition hover:bg-ink/10"
    >
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-ink/25"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const s = useAudioSettings();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const allOff = s.muted;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Настройки звука"
        className="animate-pop my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-md min-w-0 overflow-y-auto rounded-3xl border-2 border-line bg-surface p-5 text-ink shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-3xl">⚙️ Настройки</h2>
          <button onClick={onClose} aria-label="Закрыть" className="h-9 w-9 shrink-0 rounded-full bg-ink/10 font-bold hover:bg-ink/20">✕</button>
        </div>

        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-accent">Звук</p>
        <div className="space-y-4">
          <Switch label={allOff ? "🔇 Звук выключен" : "🔊 Звук включён"} checked={!s.muted} onChange={(v) => audio.update({ muted: !v })} />
          <Slider label="Общая громкость" icon="🎚️" value={s.master} disabled={allOff} onChange={(v) => audio.update({ master: v })} onRelease={() => audio.play("select")} />
          <Slider label="Музыка" icon="🎵" value={s.music} disabled={allOff || !s.musicOn} onChange={(v) => audio.update({ music: v })} />
          <Slider label="Звуковые эффекты" icon="💥" value={s.sfx} disabled={allOff || !s.sfxOn} onChange={(v) => audio.update({ sfx: v })} onRelease={() => audio.play("card")} />
        </div>

        <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-[0.16em] text-accent">Отдельно</p>
        <div className="space-y-2">
          <Switch label="🎵 Музыка" checked={s.musicOn} onChange={(v) => audio.update({ musicOn: v })} />
          <Switch label="💥 Звуковые эффекты" checked={s.sfxOn} onChange={(v) => audio.update({ sfxOn: v })} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(["card", "nope", "defused", "explode"] as const).map((n) => (
            <button
              key={n} onClick={() => audio.play(n)} data-nosound
              className="rounded-lg bg-ink/10 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/20"
            >
              {n === "card" ? "▶ Карта" : n === "nope" ? "▶ Неть" : n === "defused" ? "▶ Обезвредь" : "▶ Бабах"}
            </button>
          ))}
        </div>

        <div className="mt-6 flex justify-between gap-2">
          <button
            onClick={() => audio.update({ master: 0.8, music: 0.5, sfx: 0.8, muted: false, musicOn: true, sfxOn: true })}
            className="rounded-xl bg-ink/10 px-4 py-2 text-sm font-semibold hover:bg-ink/20"
          >
            Сбросить
          </button>
          <button onClick={onClose} className="rounded-xl bg-highlight px-6 py-2 font-display text-xl text-highlight-ink hover:brightness-110">Готово</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SettingsButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const s = useAudioSettings();
  const silent = s.muted || (!s.musicOn && !s.sfxOn);
  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)} title="Настройки звука" aria-label="Настройки звука"
        className={`flex shrink-0 items-center justify-center gap-2 rounded-full border border-line bg-panel text-ink transition hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          compact ? "h-9 w-9" : "h-10 px-3 sm:px-4"
        }`}
      >
        <span aria-hidden="true" className="text-base leading-none">{silent ? "🔇" : "🔊"}</span>
        {!compact && <span className="hidden text-sm font-semibold sm:inline">Звук</span>}
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}
