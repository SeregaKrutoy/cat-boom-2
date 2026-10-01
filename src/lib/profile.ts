/** Player profile helpers shared by the browser and the server (no browser APIs here). */

export const MAX_NAME_LENGTH = 24;
export const BOT_AVATAR = "🤖";
export const DEFAULT_AVATAR = "😼";

/** Cat faces a player may choose from. The server accepts only these. */
export const CAT_AVATARS = [
  "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "🐱", "🐈", "🐈‍⬛",
  "🦁", "🐯", "🐆", "😼💣", "😺🔥", "😸⚡", "😻✨", "🙀💥", "🐱🎩", "🐈‍⬛🌙", "🦁👑", "🐯⚔️",
] as const;

const ADJECTIVES = [
  "Грозный", "Пушистый", "Хитрый", "Сонный", "Дерзкий", "Ловкий", "Усатый", "Полосатый",
  "Взрывной", "Сердитый", "Храбрый", "Мудрый", "Рыжий", "Ленивый", "Шустрый", "Важный",
];
const CAT_NAMES = [
  "Барсик", "Мурзик", "Пушок", "Рыжик", "Васька", "Том", "Семён", "Борис",
  "Базилио", "Леопольд", "Матроскин", "Шнурок", "Тигран", "Персик", "Снежок", "Дымок",
];

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** A random funny cat name, e.g. «Хитрый Барсик». Never returns `exclude` again. */
export function randomName(exclude?: string): string {
  for (let i = 0; i < 20; i++) {
    const name = `${pick(ADJECTIVES)} ${pick(CAT_NAMES)}`;
    if (name !== exclude) return name;
  }
  return `${pick(ADJECTIVES)} ${pick(CAT_NAMES)}`;
}

export function randomAvatar(exclude?: string): string {
  for (let i = 0; i < 20; i++) {
    const avatar = pick(CAT_AVATARS);
    if (avatar !== exclude) return avatar;
  }
  return DEFAULT_AVATAR;
}

/** Anything that is not on the allowed list becomes the default smiley. */
export function sanitizeAvatar(value: unknown): string {
  return typeof value === "string" && (CAT_AVATARS as readonly string[]).includes(value) ? value : DEFAULT_AVATAR;
}

export function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
  return name || randomName();
}
