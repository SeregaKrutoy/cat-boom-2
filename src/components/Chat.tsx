"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_LEN } from "@/lib/game/chat";
import type { ChatMessage } from "@/lib/game/types";
import { STICKERS } from "@/lib/stickers";

/** Grid with every available sticker. Closes when a sticker or outside area is clicked. */
export function StickerGrid({
  onPick,
  onClose,
}: {
  onPick: (id: string) => void;
  onClose?: () => void;
}) {
  return (
    <>
      {onClose && (
        <div
          className="fixed inset-0 z-20 cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-hidden="true"
        />
      )}
      <div
        role="dialog"
        aria-label="Быстрые стикеры"
        className="relative z-30 grid max-h-[min(20rem,50vh)] w-72 max-w-[calc(100vw-2rem)] animate-pop grid-cols-4 gap-1.5 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-2.5 shadow-2xl scrollbar-thin"
      >
        {STICKERS.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            title={s.label}
            aria-label={`Стикер ${s.label}`}
            className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition hover:scale-105 hover:bg-ink/10 active:scale-95"
          >
            <span aria-hidden="true" className="text-3xl leading-none">
              {s.art}
            </span>
            <span className="w-full truncate text-center text-[10px] leading-tight text-muted">{s.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function MessageBubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  if (m.kind === "sticker") {
    const art = STICKERS.find((s) => s.id === m.sticker)?.art ?? "😼";
    return (
      <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
        <span aria-hidden="true" className="shrink-0 text-lg">
          {m.avatar}
        </span>
        <div className={`min-w-0 ${mine ? "items-end text-right" : ""}`}>
          <div className="truncate text-[11px] text-muted">
            {m.name}
            {mine ? " (ты)" : ""}
          </div>
          <div
            aria-label={`Стикер от ${m.name}`}
            className={`mt-0.5 inline-block animate-pop rounded-2xl border px-3 py-1.5 text-4xl leading-none shadow ${
              mine ? "border-highlight/50 bg-highlight/15" : "border-line bg-panel"
            }`}
          >
            {art}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
      <span aria-hidden="true" className="shrink-0 text-lg">
        {m.avatar}
      </span>
      <div className={`min-w-0 max-w-[85%] ${mine ? "items-end text-right" : ""}`}>
        <div className="truncate text-[11px] text-muted">
          {m.name}
          {mine ? " (ты)" : ""}
        </div>
        <div
          className={`mt-0.5 inline-block break-words rounded-2xl px-2.5 py-1.5 text-left text-sm leading-snug ${
            mine ? "bg-highlight text-highlight-ink" : "bg-panel text-ink"
          }`}
        >
          {m.text}
        </div>
      </div>
    </div>
  );
}

export function ChatPanel({
  messages,
  myIdx,
  onSendText,
  onSendSticker,
  compact = false,
}: {
  messages: ChatMessage[];
  myIdx: number;
  onSendText: (text: string) => Promise<void>;
  onSendSticker: (id: string) => Promise<void>;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSendText(text);
      setDraft("");
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const pick = async (id: string) => {
    setStickersOpen(false);
    setSending(true);
    try {
      await onSendSticker(id);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={listRef}
        className={`flex-1 space-y-2.5 overflow-y-auto px-3 py-2 scrollbar-thin ${compact ? "max-h-56" : ""}`}
      >
        {messages.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted">
            Пока тихо… Напиши что-нибудь или отправь стикер 😼
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} mine={m.from === myIdx} />
        ))}
      </div>
      {stickersOpen && (
        <div className="flex justify-center border-t border-line px-2 py-2">
          <StickerGrid onPick={pick} />
        </div>
      )}
      <form
        className="flex shrink-0 items-center gap-1.5 border-t border-line px-2 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <button
          type="button"
          onClick={() => setStickersOpen((o) => !o)}
          aria-label="Быстрые стикеры"
          title="Быстрые стикеры"
          className={`h-9 w-9 shrink-0 rounded-full text-xl transition hover:bg-ink/10 ${stickersOpen ? "bg-ink/10" : ""}`}
        >
          😀
        </button>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, CHAT_MAX_LEN))}
          placeholder="Сообщение…"
          maxLength={CHAT_MAX_LEN}
          aria-label="Сообщение в чат"
          className="h-9 min-w-0 flex-1 rounded-full border border-line bg-ink/5 px-3 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-accent"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Отправить сообщение"
          className="h-9 w-9 shrink-0 rounded-full bg-highlight text-base text-highlight-ink transition hover:brightness-110 disabled:opacity-40"
        >
          ➤
        </button>
      </form>
    </div>
  );
}

/** A sticker somebody just sent, sliding in attached to the left edge of the table without blocking center action. */
export function StickerFlash({ msg }: { msg: ChatMessage | null }) {
  if (!msg || msg.kind !== "sticker") return null;
  return <StickerStack msgs={[msg]} />;
}

/** A queue of fresh stickers, stacked along the left edge of the table. Each has its own lifetime. */
export function StickerStack({ msgs }: { msgs: ChatMessage[] }) {
  const stickers = msgs.filter((m) => m.kind === "sticker");
  if (!stickers.length) return null;
  return (
    <div className="pointer-events-none absolute left-2 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2 sm:left-4">
      {stickers.map((msg) => {
        const art = STICKERS.find((s) => s.id === msg.sticker)?.art ?? "😼";
        return (
          <div
            key={msg.id}
            data-testid="sticker-flash"
            className="pointer-events-none flex animate-sticker-left items-center gap-2.5 rounded-2xl border-2 border-highlight/70 bg-surface/95 px-3 py-2 shadow-2xl backdrop-blur-md sm:px-4 sm:py-2.5"
          >
            <span aria-hidden="true" className="shrink-0 text-4xl leading-none drop-shadow sm:text-5xl">
              {art}
            </span>
            <div className="min-w-0 max-w-[100px] text-left leading-tight sm:max-w-[140px]">
              <div className="truncate text-xs font-bold text-ink sm:text-sm">
                {msg.avatar} {msg.name}
              </div>
              <div className="text-[10px] text-muted">стикер</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
