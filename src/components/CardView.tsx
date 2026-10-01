import { CARD_INFO } from "@/lib/game/cards";
import type { CardType } from "@/lib/game/types";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "w-20 h-28 text-[10px]",
  md: "w-24 h-36 sm:w-28 sm:h-40 text-[10px]",
  lg: "w-32 h-48 text-xs",
};

const EMOJI: Record<Size, string> = {
  sm: "text-3xl",
  md: "text-4xl sm:text-5xl",
  lg: "text-6xl",
};

export function CardFace({
  type,
  size = "md",
  selected,
  onClick,
  showText = true,
  disabled,
}: {
  type: CardType;
  size?: Size;
  selected?: boolean;
  onClick?: () => void;
  showText?: boolean;
  disabled?: boolean;
}) {
  const info = CARD_INFO[type];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      data-nosound={onClick ? "" : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      title={`${info.name}: ${info.description}`}
      aria-label={onClick ? info.name : undefined}
      aria-pressed={onClick ? !!selected : undefined}
      className={`relative shrink-0 ${SIZE[size]} rounded-xl border-4 ${info.accent} bg-gradient-to-br ${info.bg} shadow-lg shadow-black/40 flex flex-col items-center justify-between p-1.5 text-center transition-all duration-150 select-none ${
        onClick ? "cursor-pointer hover:-translate-y-2" : ""
      } ${selected ? "-translate-y-5 ring-4 ring-yellow-300 shadow-yellow-300/40" : ""} ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <div className="font-display leading-tight w-full text-center line-clamp-2">{info.short}</div>
      <div className={`${EMOJI[size]} drop-shadow`}>{info.emoji}</div>
      {showText && size !== "sm" ? (
        <div className="leading-tight line-clamp-3 opacity-90 text-[0.9em]">{info.description}</div>
      ) : (
        <div className="text-[0.75em] leading-tight opacity-75 line-clamp-1">{info.name}</div>
      )}
    </Tag>
  );
}

export function CardBack({ size = "md", className = "" }: { size?: Size; className?: string }) {
  return (
    <div
      className={`card-back shrink-0 ${SIZE[size]} rounded-xl border-4 border-red-950 shadow-lg shadow-black/40 flex flex-col items-center justify-center text-center ${className}`}
    >
      <span className={EMOJI[size]}>😼</span>
      {size !== "sm" && (
        <span className="font-display text-yellow-300 leading-none mt-1 text-[1.1em]">
          Взрывные
          <br />
          котята
        </span>
      )}
    </div>
  );
}
