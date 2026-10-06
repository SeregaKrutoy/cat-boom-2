/** Quick stickers shared by the browser and the server (no browser APIs here). */

export interface Sticker {
  id: string;
  art: string;
  label: string;
}

export const STICKERS: readonly Sticker[] = [
  // ── existing (ids are stored in chat history, never rename) ──
  { id: "hi", art: "👋", label: "Привет!" }, // приветствие
  { id: "gl", art: "🍀", label: "Удачи!" },
  { id: "boom", art: "💥", label: "Бабах!" },
  { id: "scared", art: "🙀", label: "А-а-а!" }, // удивление, шок, испуг
  { id: "laugh", art: "😹", label: "Ха-ха!" }, // безудержный смех
  { id: "cry", art: "😿", label: "Не-е-ет!" }, // грусть
  { id: "angry", art: "😾", label: "Р-р-р!" }, // гнев, ярость
  { id: "cool", art: "😎", label: "Легко!" }, // крутость, уверенность
  { id: "love", art: "😻", label: "Милота!" }, // романтика, влюблённость
  { id: "think", art: "🤔", label: "Хм-м…" }, // задумчивость, сомнение
  { id: "clap", art: "👏", label: "Браво!" },
  { id: "bomb", art: "💣", label: "Держите меня!" },
  // ── new ──
  { id: "sleepy", art: "😴", label: "Скукота…" }, // нейтральность, сонливость
  { id: "sixseven", art: "6️⃣7️⃣", label: "Six-seven!" },
  { id: "sing", art: "🎶", label: "Ля-ля-ля~" }, // напевает песню
  { id: "happy", art: "😸", label: "Ня!" }, // наивная радость, довольство
  { id: "wink", art: "😉", label: "Подмигну~" }, // игривость, флирт
  { id: "hooray", art: "🙌", label: "Ура!" }, // ликование, триумф
  { id: "like", art: "👍", label: "Класс!" }, // одобрение
  { id: "tease", art: "😜", label: "Бе-бе-бе!" }, // дразнилка, сумасбродство
  { id: "kiss", art: "😽", label: "Чмок!" }, // воздушный поцелуй
  { id: "awkward", art: "😅", label: "Ой-ой…" }, // смущение, неуверенность
  { id: "meh", art: "😐", label: "Мне всё равно" }, // абсолютное равнодушие
  { id: "eyeroll", art: "🙄", label: "Ну-ну…" }, // недовольство, скепсис
  { id: "confused", art: "😵‍💫", label: "Чего?!" }, // замешательство, «хм?»
  { id: "sly", art: "😼", label: "Хе-хе…" }, // злорадство, хитрость
  { id: "determined", art: "😤", label: "Ну держись!" }, // злость, решительность
  { id: "evil", art: "😈", label: "Муа-ха-ха!" }, // коварный план
  { id: "facepalm", art: "🤦", label: "Фейспалм" },
];

const IDS = new Set(STICKERS.map((s) => s.id));

export function isStickerId(value: unknown): value is string {
  return typeof value === "string" && IDS.has(value);
}

export function stickerById(id: string): Sticker | undefined {
  return STICKERS.find((s) => s.id === id);
}
