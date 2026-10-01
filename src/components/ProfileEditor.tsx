"use client";

import { useState } from "react";
import { CAT_AVATARS, MAX_NAME_LENGTH } from "@/lib/profile";

/** Name field with a cat-smiley picker and a «random name» button. */
export function ProfileEditor({
  id, name, avatar, onName, onAvatar, onReroll, label = "Твоё имя и смайлик",
}: {
  id: string;
  name: string;
  avatar: string;
  onName: (value: string) => void;
  onAvatar: (value: string) => void;
  onReroll: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const iconButton =
    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-ink/5 text-2xl transition hover:border-accent hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div className="min-w-0 text-left">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-muted">{label}</label>
      <div className="flex min-w-0 items-stretch gap-2">
        <button
          type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          aria-label={`Смайлик ${avatar}. Выбрать другой`} title="Выбрать смайлик" className={iconButton}
        >
          <span aria-hidden="true">{avatar}</span>
        </button>
        <input
          id={id} value={name} onChange={(e) => onName(e.target.value)} maxLength={MAX_NAME_LENGTH}
          autoComplete="off" placeholder="Как тебя зовут?"
          className="h-12 w-full min-w-0 flex-1 rounded-xl border border-line bg-ink/5 px-4 text-base text-ink outline-none placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
        <button type="button" onClick={onReroll} aria-label="Случайное имя" title="Случайное имя" className={iconButton}>
          <span aria-hidden="true">🎲</span>
        </button>
      </div>
      {open && (
        <div role="radiogroup" aria-label="Смайлик котёнка" className="mt-2 grid max-h-52 grid-cols-6 gap-1.5 overflow-y-auto rounded-xl border border-line bg-panel p-2 scrollbar-thin">
          {CAT_AVATARS.map((a) => (
            <button
              key={a} type="button" role="radio" aria-checked={a === avatar} aria-label={`Смайлик ${a}`}
              onClick={() => { onAvatar(a); setOpen(false); }}
              className={`flex h-11 min-w-0 items-center justify-center overflow-hidden rounded-lg px-0.5 text-xl transition sm:text-2xl ${
                a === avatar ? "bg-accent/25 ring-2 ring-accent" : "hover:bg-ink/10"
              }`}
            >
              <span aria-hidden="true">{a}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
