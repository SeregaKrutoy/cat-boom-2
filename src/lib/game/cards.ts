import type { CardType } from "./types";

export interface CardInfo {
  name: string;
  short: string;
  emoji: string;
  count: number;
  description: string;
  bg: string; // tailwind classes for card face
  accent: string;
}

export const CARD_INFO: Record<CardType, CardInfo> = {
  kitten: {
    name: "Взрывной котёнок",
    short: "Котёнок",
    emoji: "💣",
    count: 1,
    description:
      "Немедленно покажи эту карту. Если у тебя нет «Обезвредь»-карты, ты взорвался. Вот и сказочке конец, и игре.",
    bg: "from-zinc-900 to-black text-white",
    accent: "border-red-600",
  },
  defuse: {
    name: "Обезвредь",
    short: "Обезвредь",
    emoji: "🧯",
    count: 3,
    description:
      "Взяв «Взрывного котёнка», сыграй эту карту и тайно помести котёнка в любое место колоды. Твой ход завершён.",
    bg: "from-lime-300 to-lime-500 text-lime-950",
    accent: "border-lime-600",
  },
  attack: {
    name: "Нападай (2x)",
    short: "Нападай",
    emoji: "⚔️",
    count: 2,
    description:
      "Немедленно заверши свой ход(ы) и не бери карту. Соперник должен сделать 2 хода подряд. Если ответит тем же — ходит оставшиеся ходы + 2.",
    bg: "from-orange-300 to-orange-500 text-orange-950",
    accent: "border-orange-600",
  },
  skip: {
    name: "Слиняй",
    short: "Слиняй",
    emoji: "🏃",
    count: 3,
    description:
      "Немедленно заверши свой ход и не бери карту. Под «Нападай» завершает только 1 из ходов.",
    bg: "from-sky-300 to-sky-500 text-sky-950",
    accent: "border-sky-600",
  },
  favor: {
    name: "Подлижись",
    short: "Подлижись",
    emoji: "🖤",
    count: 3,
    description: "Заставь соперника отдать тебе одну карту по его выбору.",
    bg: "from-zinc-500 to-zinc-800 text-white",
    accent: "border-zinc-900",
  },
  shuffle: {
    name: "Затасуй",
    short: "Затасуй",
    emoji: "🔀",
    count: 2,
    description:
      "Тщательно перемешай колоду. Пригодится, когда ты будешь знать, что грядёт «Взрывной котёнок».",
    bg: "from-amber-200 to-amber-500 text-amber-950",
    accent: "border-amber-700",
  },
  future: {
    name: "Подсмуртри грядущее (3x)",
    short: "Грядущее",
    emoji: "👁️",
    count: 3,
    description:
      "Посмотри 3 верхние карты колоды, не показывая их сопернику, и верни их назад в том же порядке.",
    bg: "from-pink-300 to-pink-500 text-pink-950",
    accent: "border-pink-600",
  },
  nope: {
    name: "Неть",
    short: "Неть",
    emoji: "✋",
    count: 3,
    description:
      "Отмени действие любой карты, кроме «Взрывного котёнка» и «Обезвредь». Можно отменить чужую «Неть». Играется в любой момент.",
    bg: "from-red-500 to-red-700 text-white",
    accent: "border-red-800",
  },
  cat1: {
    name: "Бородакот",
    short: "Бородакот",
    emoji: "🧔",
    count: 4,
    description:
      "Кошкокарта. Сама по себе бесполезна. Сыграй 2 одинаковые, чтобы украсть случайную карту у соперника.",
    bg: "from-stone-100 to-stone-300 text-stone-900",
    accent: "border-stone-500",
  },
  cat2: {
    name: "Котопингвин",
    short: "Котопингвин",
    emoji: "🐧",
    count: 4,
    description:
      "Кошкокарта. Сама по себе бесполезна. Сыграй 2 одинаковые, чтобы украсть случайную карту у соперника.",
    bg: "from-slate-100 to-slate-300 text-slate-900",
    accent: "border-slate-500",
  },
  cat3: {
    name: "Шляпокот",
    short: "Шляпокот",
    emoji: "🎩",
    count: 4,
    description:
      "Кошкокарта. Сама по себе бесполезна. Сыграй 2 одинаковые, чтобы украсть случайную карту у соперника.",
    bg: "from-yellow-200 to-yellow-400 text-yellow-950",
    accent: "border-yellow-600",
  },
};

export const ALL_TYPES = Object.keys(CARD_INFO) as CardType[];
export const NAMEABLE_TYPES: CardType[] = ALL_TYPES.filter((t) => t !== "kitten");
export const isCat = (t: CardType) => t === "cat1" || t === "cat2" || t === "cat3";
