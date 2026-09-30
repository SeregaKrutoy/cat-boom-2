// Synthesized sound engine (Web Audio API): sound effects + two generative music tracks.
// Everything is generated in the browser, so no audio files are needed.

export type Track = "menu" | "game";
export type SfxName =
  | "click" | "select" | "join" | "draw" | "card" | "nope" | "explode" | "defused"
  | "attack" | "shuffle" | "steal" | "start" | "win" | "lose" | "turn" | "error" | "peek";

export interface AudioSettings {
  master: number; // 0..1
  music: number; // 0..1
  sfx: number; // 0..1
  muted: boolean; // everything off
  musicOn: boolean;
  sfxOn: boolean;
}

const KEY = "ek_audio";
const DEFAULTS: AudioSettings = { master: 0.8, music: 0.5, sfx: 0.8, muted: false, musicOn: true, sfxOn: true };

let settings: AudioSettings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<AudioSettings>;
      const clamp = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v <= 1 ? v : d);
      settings = {
        master: clamp(p.master, DEFAULTS.master),
        music: clamp(p.music, DEFAULTS.music),
        sfx: clamp(p.sfx, DEFAULTS.sfx),
        muted: typeof p.muted === "boolean" ? p.muted : DEFAULTS.muted,
        musicOn: typeof p.musicOn === "boolean" ? p.musicOn : DEFAULTS.musicOn,
        sfxOn: typeof p.sfxOn === "boolean" ? p.sfxOn : DEFAULTS.sfxOn,
      };
    }
  } catch {
    // ignore broken storage
  }
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  noise: AudioBuffer;
}

let g: Graph | null = null;
let desired: Track | null = null;
let active: Track | null = null;
let trackGain: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let step = 0;
let inited = false;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (n: number) => Math.floor(Math.random() * n);

function applyGains() {
  if (!g) return;
  const t = g.ctx.currentTime;
  g.master.gain.setTargetAtTime(settings.muted ? 0 : Math.pow(settings.master, 2), t, 0.05);
  g.music.gain.setTargetAtTime(settings.musicOn ? Math.pow(settings.music, 2) * 0.55 : 0, t, 0.08);
  g.sfx.gain.setTargetAtTime(settings.sfxOn ? Math.pow(settings.sfx, 2) : 0, t, 0.05);
}

function ensureGraph(): Graph | null {
  if (typeof window === "undefined") return null;
  if (g) return g;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  const music = ctx.createGain();
  const sfx = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  music.connect(master);
  sfx.connect(master);
  master.connect(comp);
  comp.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  g = { ctx, master, music, sfx, noise };
  applyGains();
  // The moment the browser lets the context run, start the music (and tell the UI)
  ctx.onstatechange = () => {
    if (ctx.state === "running") {
      applyGains();
      startTrack();
    }
    listeners.forEach((l) => l());
  };
  return g;
}

// ───────── primitives ─────────
function tone(
  dest: AudioNode, t: number, midi: number, dur: number, type: OscillatorType, vol: number,
  o: { attack?: number; lp?: number } = {},
) {
  if (!g) return;
  const c = g.ctx;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = mtof(midi);
  const a = o.attack ?? 0.01;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.02));
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.lp;
    osc.connect(f);
    f.connect(gain);
  } else osc.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function sweep(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
  if (!g) return;
  const c = g.ctx;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(
  dest: AudioNode, t: number, dur: number, vol: number,
  type: BiquadFilterType, f0: number, f1 = f0, q = 1,
) {
  if (!g) return;
  const c = g.ctx;
  const src = c.createBufferSource();
  src.buffer = g.noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(gain);
  gain.connect(dest);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

// ───────── sound effects ─────────
const SFX: Record<SfxName, (d: AudioNode, t: number) => void> = {
  click: (d, t) => sweep(d, t, "triangle", 1200, 700, 0.05, 0.12),
  select: (d, t) => sweep(d, t, "sine", 500, 900, 0.09, 0.14),
  join: (d, t) => {
    tone(d, t, 76, 0.12, "sine", 0.2);
    tone(d, t + 0.09, 83, 0.18, "sine", 0.2);
  },
  draw: (d, t) => {
    noise(d, t, 0.18, 0.28, "bandpass", 2500, 800, 1.2);
    sweep(d, t, "sine", 300, 520, 0.1, 0.08);
  },
  card: (d, t) => {
    noise(d, t, 0.14, 0.32, "bandpass", 3000, 1200, 1);
    sweep(d, t + 0.05, "sine", 190, 90, 0.12, 0.28);
  },
  nope: (d, t) => {
    sweep(d, t, "sawtooth", 420, 120, 0.35, 0.22);
    sweep(d, t + 0.05, "square", 300, 90, 0.4, 0.1);
  },
  explode: (d, t) => {
    noise(d, t, 1.4, 0.9, "lowpass", 3200, 90, 0.7);
    sweep(d, t, "sine", 150, 28, 1.0, 0.8);
    for (let i = 0; i < 5; i++) noise(d, t + 0.25 + i * 0.12, 0.08, 0.18, "highpass", 3000, 3000);
  },
  defused: (d, t) => {
    [72, 76, 79, 84].forEach((m, i) => tone(d, t + i * 0.08, m, 0.28, "sine", 0.2));
    noise(d, t + 0.3, 0.3, 0.06, "highpass", 6000);
  },
  attack: (d, t) => {
    sweep(d, t, "sawtooth", 180, 900, 0.3, 0.18);
    noise(d, t + 0.28, 0.2, 0.35, "bandpass", 1500, 500);
    sweep(d, t + 0.3, "sine", 200, 55, 0.25, 0.4);
  },
  shuffle: (d, t) => {
    for (let i = 0; i < 7; i++) noise(d, t + i * 0.05, 0.08, 0.22, "bandpass", 1800 + rnd(2500), 1200, 1.5);
  },
  steal: (d, t) => {
    [66, 62, 57].forEach((m, i) => tone(d, t + i * 0.09, m, 0.16, "triangle", 0.22));
  },
  start: (d, t) => {
    [60, 64, 67].forEach((m, i) => tone(d, t + i * 0.1, m, 0.25, "square", 0.1, { lp: 2500 }));
    [72, 76, 79].forEach((m) => tone(d, t + 0.32, m, 0.6, "square", 0.09, { lp: 2500 }));
  },
  win: (d, t) => {
    [72, 76, 79, 84, 88].forEach((m, i) => tone(d, t + i * 0.11, m, 0.35, "triangle", 0.25));
    [72, 76, 79, 84].forEach((m) => tone(d, t + 0.6, m, 0.9, "triangle", 0.15));
  },
  lose: (d, t) => {
    [64, 62, 60, 55].forEach((m, i) => tone(d, t + i * 0.22, m, 0.42, "sawtooth", 0.13, { lp: 900 }));
  },
  turn: (d, t) => {
    tone(d, t, 81, 0.18, "sine", 0.2);
    tone(d, t + 0.12, 86, 0.25, "sine", 0.2);
  },
  error: (d, t) => sweep(d, t, "square", 200, 140, 0.18, 0.12),
  peek: (d, t) => {
    sweep(d, t, "sine", 600, 1300, 0.3, 0.12);
    tone(d, t + 0.25, 88, 0.3, "sine", 0.12);
  },
};

function play(name: SfxName, delay = 0) {
  load();
  if (!g || g.ctx.state !== "running") return;
  if (settings.muted || !settings.sfxOn) return;
  SFX[name](g.sfx, g.ctx.currentTime + 0.01 + delay);
}

// ───────── music ─────────
interface Chord { r: number; m: boolean }
const MENU_CHORDS: Chord[] = [{ r: 48, m: false }, { r: 45, m: true }, { r: 41, m: false }, { r: 43, m: false }];
const GAME_CHORDS: Chord[] = [{ r: 45, m: true }, { r: 41, m: false }, { r: 48, m: false }, { r: 40, m: false }];
const PENTA = [0, 2, 4, 7, 9];

function stepDur(t: Track) {
  return t === "menu" ? 60 / 98 / 2 : 60 / 112 / 2;
}

function playStep(track: Track, n: number, t: number, dest: AudioNode) {
  const s = n % 8;
  const bar = Math.floor(n / 8) % 4;
  const dur = stepDur(track);
  if (track === "menu") {
    const ch = MENU_CHORDS[bar];
    const tones = [0, ch.m ? 3 : 4, 7];
    if (s === 0) {
      tone(dest, t, ch.r - 12, dur * 3.6, "triangle", 0.34);
      tones.forEach((iv) => tone(dest, t, ch.r + 12 + iv, dur * 8, "sine", 0.05, { attack: 0.6 }));
    }
    if (s === 4) tone(dest, t, ch.r - 5, dur * 2.6, "triangle", 0.24);
    const idx = [0, 1, 2, 1, 0, 2, 1, 2][s];
    tone(dest, t, ch.r + 24 + tones[idx], 0.35, "triangle", 0.15);
    if (s % 2 === 0 && Math.random() < 0.45) {
      const m = 72 + PENTA[rnd(PENTA.length)] + (Math.random() < 0.2 ? 12 : 0);
      tone(dest, t, m, 0.5, "sine", 0.1, { attack: 0.02 });
    }
  } else {
    const ch = GAME_CHORDS[bar];
    const tones = [0, ch.m ? 3 : 4, 7];
    if ([1, 0, 1, 1, 0, 1, 0, 1][s]) tone(dest, t, ch.r, dur * 0.9, "sawtooth", 0.2, { lp: 320 });
    if (s === 0 || s === 4) sweep(dest, t, "sine", 130, 45, 0.16, 0.38);
    if (s % 2 === 1) noise(dest, t, 0.04, 0.05, "highpass", 7000);
    if (s === 0) tones.forEach((iv) => tone(dest, t, ch.r + 12 + iv, dur * 8, "triangle", 0.045, { attack: 0.5 }));
    if (Math.random() < 0.55) {
      tone(dest, t, ch.r + 24 + tones[rnd(3)], 0.2, "square", 0.045, { lp: 1800 });
    }
  }
}

function schedule() {
  if (!g || !active || !trackGain) return;
  const c = g.ctx;
  if (c.state !== "running") return;
  while (nextTime < c.currentTime + 0.4) {
    if (nextTime < c.currentTime) nextTime = c.currentTime + 0.05;
    playStep(active, step, nextTime, trackGain);
    nextTime += stepDur(active);
    step++;
  }
}

function startTrack() {
  if (!g) return;
  if (active === desired && (timer || desired === null)) return;
  const c = g.ctx;
  const now = c.currentTime;
  if (trackGain) {
    const old = trackGain;
    old.gain.cancelScheduledValues(now);
    old.gain.setTargetAtTime(0, now, 0.4);
    setTimeout(() => old.disconnect(), 3000);
    trackGain = null;
  }
  active = desired;
  if (!active) {
    if (timer) clearInterval(timer);
    timer = null;
    return;
  }
  trackGain = c.createGain();
  trackGain.gain.setValueAtTime(0.0001, now);
  trackGain.gain.linearRampToValueAtTime(1, now + 0.5);
  trackGain.connect(g.music);
  step = 0;
  nextTime = now + 0.1;
  if (!timer) timer = setInterval(schedule, 90);
}

function unlock() {
  const gr = ensureGraph();
  if (!gr) return;
  if (gr.ctx.state !== "running") gr.ctx.resume().catch(() => {});
  applyGains();
  startTrack();
}

// ───────── public API ─────────
export const audio = {
  init() {
    if (inited || typeof window === "undefined") return;
    inited = true;
    load();
    // Try to start right away (works when the browser already allows autoplay)
    unlock();
    // Otherwise start on the very first user gesture of any kind
    const gesture = () => unlock();
    for (const ev of ["pointerdown", "pointerup", "mousedown", "touchstart", "touchend", "keydown", "click"]) {
      window.addEventListener(ev, gesture, { capture: true, passive: true });
    }
    document.addEventListener(
      "click",
      (e) => {
        const el = (e.target as Element | null)?.closest?.("button, a, [role=button]");
        if (!el || el.hasAttribute("data-nosound")) return;
        if ((el as HTMLButtonElement).disabled) return;
        play("click");
      },
      true,
    );
    document.addEventListener("visibilitychange", () => {
      if (!g) return;
      if (document.hidden) void g.ctx.suspend();
      else void g.ctx.resume();
    });
  },
  setTrack(track: Track | null) {
    desired = track;
    if (g) startTrack();
  },
  /** True while the browser still blocks audio (waiting for a first click/tap). */
  isLocked(): boolean {
    return !g || g.ctx.state !== "running";
  },
  isLockedServer(): boolean {
    return false;
  },
  play,
  getSettings(): AudioSettings {
    load();
    return settings;
  },
  getServerSettings(): AudioSettings {
    return DEFAULTS;
  },
  update(patch: Partial<AudioSettings>) {
    load();
    settings = { ...settings, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // storage unavailable
    }
    applyGains();
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
