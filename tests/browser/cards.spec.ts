import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { games } from "../../src/db/schema";
import { assertRoomIntegrity } from "../../src/lib/game/deck";
import { CARD_INFO } from "../../src/lib/game/cards";
import { peekStorageKey } from "../../src/lib/game/presentation";
import { toView } from "../../src/lib/game/view";
import type { GameState, Mode } from "../../src/lib/game/types";
import { arrange, counts, DUEL_COUNTS } from "../game-fixtures";

const madeRooms: string[] = [];

async function createRoom(request: APIRequestContext, mode: Mode, host: string) {
  const res = await request.post("/api/games", { data: { mode, name: "Кот Борис", token: host, maxPlayers: 2 } });
  expect(res.ok()).toBeTruthy();
  const { code } = await res.json();
  madeRooms.push(code);
  return code as string;
}

async function joinRoom(request: APIRequestContext, code: string, token: string, name = "Кот Василий") {
  const res = await request.post(`/api/games/${code}/join`, { data: { token, name } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function state(code: string): Promise<GameState> {
  const [row] = await db.select().from(games).where(eq(games.code, code));
  if (!row) throw new Error("Test room is missing");
  return row.state as GameState;
}

/** Seed a deterministic scenario while preserving all real physical cards and row locking. */
async function scenario(code: string, change: (s: GameState) => void) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(games).where(eq(games.code, code)).for("update");
    const s = row.state as GameState;
    change(s);
    s.seq++;
    for (const table of s.tournament?.tables ?? []) {
      table.lastSeq = table.game.seq;
      table.lastChange = Date.now();
    }
    assertRoomIntegrity(s);
    await tx.update(games).set({ state: s, version: s.seq, updatedAt: new Date() }).where(eq(games.code, code));
  });
}

function currentGame(s: GameState) {
  return s.mode === "tournament" ? s.tournament!.tables[0].game : s;
}

async function initPlayer(page: Page, token: string) {
  await page.addInitScript((token) => {
    localStorage.setItem("ek_token", token);
    localStorage.setItem("ek_name", "Кот Борис");
    localStorage.setItem("ek_audio", JSON.stringify({ master: 0, music: 0, sfx: 0, muted: true, musicOn: false, sfxOn: false }));
  }, token);
}

const futureDialog = (page: Page) => page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "👁️ Грядущее", exact: true }) });

async function playFuture(page: Page, request: APIRequestContext, code: string, otherToken: string | null) {
  // Test fixtures update the database, not React. Wait for polling to render the arranged hand.
  const arranged = currentGame(await state(code));
  const handSection = page.locator("main > section").last();
  await expect(handSection.getByText(`· карт: ${arranged.players[0].hand.length}`, { exact: true })).toBeVisible();
  await expect(handSection.getByRole("button", { name: CARD_INFO.future.name, exact: true }))
    .toHaveCount(arranged.players[0].hand.filter((c) => c.type === "future").length);
  const expected = arranged.deck.slice(0, 3).map((c) => CARD_INFO[c.type].name);
  await handSection.getByRole("button", { name: CARD_INFO.future.name, exact: true }).first().click();
  const responsePromise = page.waitForResponse((r) => r.url().endsWith(`/api/games/${code}/action`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Сыграть «Грядущее»", exact: true }).click();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBeTruthy();
  if (otherToken !== null && currentGame(await state(code)).phase === "nope") {
    const passed = await request.post(`/api/games/${code}/action`, { data: { token: otherToken, action: { type: "pass" } } });
    expect(passed.ok(), await passed.text()).toBeTruthy();
  }
  const dialog = futureDialog(page);
  await expect(dialog).toBeVisible();
  const titles = dialog.locator("[title]");
  await expect(titles).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    expect(await titles.nth(i).getAttribute("title")).toMatch(new RegExp(`^${expected[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`));
  }
  return dialog;
}

async function seedFuture(code: string) {
  await scenario(code, (s) => arrange(currentGame(s), [["future", "future", "cat1", "cat1", "defuse"], ["defuse"]], ["cat2", "skip", "kitten"]));
}

async function seedExplosion(code: string) {
  await scenario(code, (s) => arrange(currentGame(s), [["cat1"], ["defuse"]], ["kitten"]));
}

test.afterEach(async () => {
  for (const code of madeRooms.splice(0)) await db.delete(games).where(eq(games.code, code));
});
test.afterAll(async () => { await pool.end(); });

for (const mode of ["friends", "bot"] as const) {
test(`Future works after the real Rematch button against ${mode}, including stored dismissals`, async ({ page, request }) => {
  const host = randomUUID(), other = randomUUID();
  const code = await createRoom(request, mode, host);
  if (mode === "friends") await joinRoom(request, code, other);
  await seedFuture(code);
  await initPlayer(page, host);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/game/${code}`);

  for (let i = 0; i < 2; i++) {
    const dialog = await playFuture(page, request, code, mode === "bot" ? null : other);
    await dialog.getByRole("button", { name: "Запомнил(а)" }).click();
    await expect(dialog).not.toBeVisible();
  }
  const old = await state(code);
  const oldView = toView(old, host, Date.now());
  const oldKey = peekStorageKey(oldView);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), oldKey)).toBe(String(old.peek!.seq));

  await page.reload();
  await expect(page.getByRole("button", { name: "Взять карту", exact: true })).toBeVisible();
  await expect(futureDialog(page)).not.toBeVisible();

  await seedExplosion(code);
  await page.getByRole("button", { name: "Взять карту", exact: true }).click();
  await page.getByRole("button", { name: "Реванш!", exact: true }).click();
  if (mode === "friends") {
    // one player pressed the button: the game must keep waiting for the other
    await expect(page.getByRole("button", { name: /✓ Ты готов\(а\) · 1\/2/ })).toBeDisabled();
    await expect(page.getByText("Ждём остальных", { exact: false })).toBeVisible();
    await page.waitForTimeout(1500);
    expect((await state(code)).matchId).toBe(old.matchId);
    expect((await state(code)).status).toBe("finished");
    const vote = await request.post(`/api/games/${code}/action`, { data: { token: other, action: { type: "rematch" } } });
    expect(vote.ok(), await vote.text()).toBeTruthy();
  }
  await expect.poll(async () => (await state(code)).matchId).not.toBe(old.matchId);
  const afterRematch = await state(code);
  expect(counts(afterRematch)).toEqual(DUEL_COUNTS);
  expect(afterRematch.deck).toHaveLength(16);
  expect(afterRematch.players.every((p) => p.hand.length === 8)).toBeTruthy();

  const stale = await request.post(`/api/games/${code}/action`, {
    data: { token: host, matchId: old.matchId, action: { type: "draw" } },
  });
  expect(stale.status()).toBe(400);
  expect((await stale.json()).error).toContain("другая партия");

  await seedFuture(code);
  const dialog = await playFuture(page, request, code, mode === "bot" ? null : other);
  expect(peekStorageKey(toView(await state(code), host, Date.now()))).not.toBe(oldKey);
  await page.screenshot({ path: "test-results/future-after-rematch.png", fullPage: true });
  await dialog.getByRole("button", { name: "Запомнил(а)" }).click();
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});
}

test("Tournament lobby shows a large copyable code on 320px and keeps it above tables", async ({ page, request, context }) => {
  const host = randomUUID(), other = randomUUID(), third = randomUUID();
  const code = await createRoom(request, "tournament", host);
  await initPlayer(page, host);
  await page.setViewportSize({ width: 320, height: 740 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/game/${code}`);
  await expect(page.getByRole("heading", { name: "Зал ожидания турнира" })).toBeVisible();
  const visibleCode = page.getByTestId("room-code");
  await expect(visibleCode).toHaveText(code);
  expect(await visibleCode.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(32);
  const bounds = await visibleCode.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "Скопировать код комнаты" }).click();
  await expect(page.getByText("Код скопирован", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await page.screenshot({ path: "test-results/tournament-lobby-code.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

  await joinRoom(request, code, other);
  await joinRoom(request, code, third, "Кот Семён");
  await page.getByRole("button", { name: "Начать турнир (3 игр.)", exact: true }).click();
  await expect(page.getByText("В этом раунде у тебя пауза", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Скопировать код комнаты" })).toContainText(code);
  const s = await state(code);
  expect(counts(s.tournament!.tables[0].game)).toEqual(DUEL_COUNTS);
});

test("Future and result windows reset after New Tournament, even when the same people play", async ({ page, request }) => {
  const host = randomUUID(), other = randomUUID();
  const code = await createRoom(request, "tournament", host);
  await joinRoom(request, code, other);
  const started = await request.post(`/api/games/${code}/start`, { data: { token: host } });
  expect(started.ok()).toBeTruthy();
  await seedFuture(code);
  await initPlayer(page, host);
  await page.goto(`/game/${code}`);
  let dialog = await playFuture(page, request, code, other);
  await dialog.getByRole("button", { name: "Запомнил(а)" }).click();
  const old = await state(code);
  const oldMatch = currentGame(old).matchId;

  await seedExplosion(code);
  await page.getByRole("button", { name: "Взять карту", exact: true }).click();
  await page.getByRole("button", { name: "Новый турнир", exact: true }).click();
  await expect(page.getByRole("button", { name: /✓ Ты готов\(а\) · 1\/2/ })).toBeDisabled();
  await page.waitForTimeout(1500);
  expect((await state(code)).matchId).toBe(old.matchId);
  const vote = await request.post(`/api/games/${code}/action`, { data: { token: other, action: { type: "rematch" } } });
  expect(vote.ok(), await vote.text()).toBeTruthy();
  await expect.poll(async () => (await state(code)).matchId).not.toBe(old.matchId);
  const newTournament = await state(code);
  expect(currentGame(newTournament).matchId).not.toBe(oldMatch);
  expect(counts(currentGame(newTournament))).toEqual(DUEL_COUNTS);
  await seedFuture(code);
  dialog = await playFuture(page, request, code, other);
  await dialog.getByRole("button", { name: "Запомнил(а)" }).click();
  await seedExplosion(code);
  await page.getByRole("button", { name: "Взять карту", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Турнир окончен!", exact: true })).toBeVisible();
});

test("Favor in a 3-player room honors the chosen player in the real UI", async ({ page, request }) => {
  const host = randomUUID(), b = randomUUID(), c = randomUUID();
  const created = await request.post("/api/games", { data: { mode: "friends", maxPlayers: 3, token: host, name: "Кот Борис" } });
  const { code } = await created.json();
  madeRooms.push(code);
  await joinRoom(request, code, b, "Василий");
  await joinRoom(request, code, c, "Семён");
  await scenario(code, (s) => arrange(s, [["favor", "defuse"], ["cat1"], ["cat2", "defuse"]]));
  await initPlayer(page, host);
  await page.goto(`/game/${code}`);
  await page.getByRole("button", { name: CARD_INFO.favor.name, exact: true }).click();
  await page.getByRole("button", { name: "Сыграть «Подлижись»", exact: true }).click();
  const picker = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Выбери цель", exact: true }) });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: /Семён/ }).click();
  await expect.poll(async () => (await state(code)).pending?.target).toBe(2);
  const p1 = await request.post(`/api/games/${code}/action`, { data: { token: b, action: { type: "pass" } } });
  expect(p1.ok()).toBeTruthy();
  expect((await state(code)).phase).toBe("nope");
  const p2 = await request.post(`/api/games/${code}/action`, { data: { token: c, action: { type: "pass" } } });
  expect(p2.ok()).toBeTruthy();
  expect((await state(code)).favor).toEqual({ giver: 2, receiver: 0 });
  await expect(page.getByText("Семён выбирает карту…", { exact: true })).toBeVisible();
});

test("Nope chain, 3 players in the real UI: only the player whose turn it is may answer a Nope", async ({ page, request }) => {
  const host = randomUUID(), b = randomUUID(), c = randomUUID();
  const created = await request.post("/api/games", { data: { mode: "friends", maxPlayers: 3, token: host, name: "Кот Борис" } });
  const { code } = await created.json();
  madeRooms.push(code);
  await joinRoom(request, code, b, "Василий");
  await joinRoom(request, code, c, "Семён");
  await scenario(code, (s) => arrange(s, [["skip", "nope", "defuse"], ["nope", "nope", "defuse"], ["nope", "defuse"]]));
  // keep the reaction window open while the test talks to the server and the browser
  const keepOpen = () => scenario(code, (s) => { if (s.pending) s.pending.deadline = Date.now() + 60_000; });
  const nope = (token: string) => request.post(`/api/games/${code}/action`, { data: { token, action: { type: "nope" } } });

  await initPlayer(page, host);
  await page.goto(`/game/${code}`);
  const hand = page.locator("main > section").last();
  await expect(hand.getByText("· карт: 3", { exact: true })).toBeVisible();
  await hand.getByRole("button", { name: CARD_INFO.skip.name, exact: true }).click();
  const played = page.waitForResponse((r) => r.url().endsWith(`/api/games/${code}/action`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Сыграть «Слиняй»", exact: true }).click();
  expect((await played).ok()).toBeTruthy();
  await keepOpen();

  // player B cancels the card
  const first = await nope(b);
  expect(first.ok(), await first.text()).toBeTruthy();
  await keepOpen();

  // player C also has a Nope, but only the player whose turn it is may answer now
  const bystander = await nope(c);
  expect(bystander.status()).toBe(400);
  expect((await bystander.json()).error).toContain("чей сейчас ход");

  // the host sees that his card was cancelled and answers with his own Nope
  await expect(page.getByText("Твою карту отменили", { exact: false })).toBeVisible();
  const myNope = page.getByRole("button", { name: "✋ Неть!", exact: true });
  await expect(myNope).toBeEnabled();
  await myNope.click();
  await expect.poll(async () => (await state(code)).pending?.nopes).toBe(2);
  await keepOpen();

  // the card is in force again: now the other players may answer (B still has a Nope)
  const second = await nope(c);
  expect(second.ok(), await second.text()).toBeTruthy();
  await keepOpen();
  const again = await nope(b);
  expect(again.status()).toBe(400);
  expect((await again.json()).error).toContain("чей сейчас ход");

  // the host has nothing more to answer with and lets the cancellation stand
  await expect(page.getByText("Твою карту отменили", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /Пропустить/ }).click();
  await expect.poll(async () => (await state(code)).pending).toBeNull();
  const final = await state(code);
  expect(final.current).toBe(0);
  expect(final.discard.filter((x) => x.type === "nope")).toHaveLength(3);
  expect(final.discard.filter((x) => x.type === "skip")).toHaveLength(1);
  expect(final.deck.filter((x) => x.type === "kitten").length).toBeLessThanOrEqual(1);
});


// ───────────── profile: smiley + random names ─────────────

test("A first-time visitor gets a random cat name and more smileys; the public logo has a direct URL", async ({ page, request }) => {
  const logo = await request.get("/exploding-kitten-logo.png");
  expect(logo.ok()).toBeTruthy();
  expect(logo.headers()["content-type"]).toMatch(/^image\/(png|jpeg)/);
  expect((await logo.body()).byteLength).toBeGreaterThan(10_000);
  await page.addInitScript(() => {
    localStorage.setItem("ek_audio", JSON.stringify({ master: 0, music: 0, sfx: 0, muted: true, musicOn: false, sfxOn: false }));
  });
  await page.goto("/");
  await expect(page.locator('header img[src="/exploding-kitten-logo.png"]')).toBeVisible();
  await expect(page.getByText("ДУЭЛЬ · 2 ИГРОКА · МОЖНО С БОТОМ", { exact: true })).toHaveCount(0);
  const name = page.locator("#player-name");
  await expect(name).toHaveValue(/^[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+$/);
  const first = await name.inputValue();
  expect(await page.evaluate(() => localStorage.getItem("ek_name"))).toBe(first);

  // reroll: always a different name, and it is remembered
  const names = new Set([first]);
  for (let i = 0; i < 4; i++) {
    const before = await name.inputValue();
    await page.getByRole("button", { name: "Случайное имя", exact: true }).click();
    await expect(name).not.toHaveValue(before);
    names.add(await name.inputValue());
  }
  expect(names.size).toBeGreaterThan(2);
  const rerolled = await name.inputValue();
  expect(await page.evaluate(() => localStorage.getItem("ek_name"))).toBe(rerolled);

  // pick another cat smiley
  await page.getByRole("button", { name: /Выбрать другой/ }).click();
  await expect(page.getByRole("radiogroup", { name: "Смайлик котёнка" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Смайлик котёнка" }).getByRole("radio")).toHaveCount(24);
  await page.getByRole("radio", { name: "Смайлик 🐈‍⬛🌙", exact: true }).click();
  await expect(page.getByRole("radiogroup", { name: "Смайлик котёнка" })).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ek_avatar"))).toBe("🐈‍⬛🌙");

  // a returning visitor keeps the same name and smiley
  await page.reload();
  await expect(name).toHaveValue(rerolled);
  await expect(page.getByRole("button", { name: /Смайлик 🐈‍⬛🌙/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("The chosen smiley appears next to the name for everybody in the room and in the lobby", async ({ page, browser, request }) => {
  const host = randomUUID(), guest = randomUUID();
  await page.addInitScript(() => {
    localStorage.setItem("ek_audio", JSON.stringify({ master: 0, music: 0, sfx: 0, muted: true, musicOn: false, sfxOn: false }));
  });
  // the host picks a lion and creates a 2-player room through the real home screen
  await page.addInitScript((token) => localStorage.setItem("ek_token", token), host);
  await page.goto("/");
  await page.locator("#player-name").fill("Лев Леопольд");
  await page.getByRole("button", { name: /Выбрать другой/ }).click();
  await page.getByRole("radio", { name: "Смайлик 🦁", exact: true }).click();
  await page.getByRole("button", { name: /Создать комнату на 2/ }).click();
  await page.waitForURL(/\/game\//);
  const code = page.url().split("/game/")[1];
  madeRooms.push(code);
  const hostRow = page.locator("div").filter({ hasText: "Лев Леопольд (ты)" }).filter({ has: page.getByText("🦁", { exact: true }) }).last();
  await expect(hostRow).toBeVisible();

  // a guest opens the invitation link, gets a random name and picks another smiley
  const guestPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await guestPage.addInitScript((token) => {
    localStorage.setItem("ek_token", token);
    localStorage.setItem("ek_audio", JSON.stringify({ master: 0, music: 0, sfx: 0, muted: true, musicOn: false, sfxOn: false }));
  }, guest);
  await guestPage.goto(`/game/${code}`);
  await expect(guestPage.getByRole("heading", { name: /🦁 Лев Леопольд приглашает в игру!/ })).toBeVisible();
  const gName = guestPage.locator("#join-name");
  await expect(gName).toHaveValue(/^[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+$/);
  const before = await gName.inputValue();
  await guestPage.getByRole("button", { name: "Случайное имя", exact: true }).click();
  await expect(gName).not.toHaveValue(before);
  await guestPage.getByRole("button", { name: /Выбрать другой/ }).click();
  await guestPage.getByRole("radio", { name: "Смайлик 😹", exact: true }).click();
  const guestName = await gName.inputValue();
  await guestPage.getByRole("button", { name: "Играть", exact: true }).click();
  await expect.poll(async () => (await state(code)).status).toBe("playing");
  const saved = await state(code);
  expect(saved.players.map((p) => p.avatar)).toEqual(["🦁", "😹"]);
  expect(saved.players[1].name).toBe(guestName);

  // both see each other's smiley next to the name at the table
  const seats = (p: Page, who: string, smiley: string) =>
    p.locator("main section div").filter({ has: p.getByText(who, { exact: true }) }).filter({ has: p.getByText(smiley, { exact: true }) });
  await expect(seats(page, guestName, "😹").first()).toBeVisible();
  await expect(seats(guestPage, "Лев Леопольд", "🦁").first()).toBeVisible();
  // and the player's own smiley is shown next to his name in the header
  await expect(page.getByText(/^🦁 Лев Леопольд \d+$/)).toBeVisible();
  await expect(guestPage.getByText(new RegExp(`^😹 ${guestName} \\d+$`))).toBeVisible();
  await guestPage.close();
  void request;
});

test("The server ignores forged smileys and empty names", async ({ request }) => {
  const host = randomUUID(), guest = randomUUID();
  const created = await request.post("/api/games", { data: { mode: "friends", name: "   ", avatar: "<img src=x>", token: host } });
  const { code } = await created.json();
  madeRooms.push(code);
  const joined = await request.post(`/api/games/${code}/join`, { data: { token: guest, name: "", avatar: "💣" } });
  expect(joined.ok(), await joined.text()).toBeTruthy();
  const s = await state(code);
  expect(s.players.map((p) => p.avatar)).toEqual(["😼", "😼"]);
  for (const p of s.players) expect(p.name).toMatch(/^[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+$/);
});

test("Rematch in a 3-player room waits for everybody and shows who is ready", async ({ page, request }) => {
  const host = randomUUID(), b = randomUUID(), c = randomUUID();
  const created = await request.post("/api/games", { data: { mode: "friends", maxPlayers: 3, token: host, name: "Кот Борис", avatar: "😸" } });
  const { code } = await created.json();
  madeRooms.push(code);
  await joinRoom(request, code, b, "Василий");
  await joinRoom(request, code, c, "Семён");
  await scenario(code, (s) => {
    arrange(s, [["cat1"], ["defuse"], ["defuse"]], ["kitten"]);
    s.players[1].exploded = true; // two players left, then the host explodes: the game ends
    s.discard.push(...s.players[1].hand.splice(0));
  });
  await initPlayer(page, host);
  await page.goto(`/game/${code}`);
  await page.getByRole("button", { name: "Взять карту", exact: true }).click();
  const button = page.getByRole("button", { name: "Реванш!", exact: true });
  await expect(button).toBeEnabled();
  await expect(page.getByText("Василий", { exact: false }).first()).toBeVisible();
  await button.click();
  await expect(page.getByRole("button", { name: /✓ Ты готов\(а\) · 1\/3/ })).toBeDisabled();
  const list = page.locator("li").filter({ hasText: "😸 Кот Борис" });
  await expect(list).toContainText("готов(а)");
  await expect(page.locator("li").filter({ hasText: "Василий" })).toContainText("думает");
  const before = (await state(code)).matchId;
  const v1 = await request.post(`/api/games/${code}/action`, { data: { token: b, action: { type: "rematch" } } });
  expect(v1.ok()).toBeTruthy();
  await expect(page.getByRole("button", { name: /✓ Ты готов\(а\) · 2\/3/ })).toBeVisible();
  expect((await state(code)).matchId).toBe(before);
  const v2 = await request.post(`/api/games/${code}/action`, { data: { token: c, action: { type: "rematch" } } });
  expect(v2.ok()).toBeTruthy();
  await expect.poll(async () => (await state(code)).matchId).not.toBe(before);
  expect((await state(code)).status).toBe("playing");
  expect(counts(await state(code))).toEqual({ ...DUEL_COUNTS, kitten: 1, defuse: 4, attack: 4, skip: 4, favor: 4, shuffle: 4, future: 5, nope: 5 });
});


test("A six-player room starts only after the sixth player and gives everybody the correct cards", async ({ request }) => {
  const tokens = Array.from({ length: 6 }, () => randomUUID());
  const created = await request.post("/api/games", {
    data: { mode: "friends", maxPlayers: 6, token: tokens[0], name: "P0", avatar: "🐯" },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { code } = await created.json();
  madeRooms.push(code);
  for (let i = 1; i < 6; i++) {
    const joined = await request.post(`/api/games/${code}/join`, {
      data: { token: tokens[i], name: `P${i}`, avatar: ["😺", "😸", "😹", "🐈‍⬛", "🦁👑"][i - 1] },
    });
    expect(joined.ok(), await joined.text()).toBeTruthy();
    const s = await state(code);
    expect(s.players.length).toBe(i + 1);
    expect(s.status).toBe(i === 5 ? "playing" : "waiting");
  }
  const s = await state(code);
  expect(s.maxPlayers).toBe(6);
  expect(s.players).toHaveLength(6);
  expect(s.players.every((p) => p.hand.length === 8 && p.hand.filter((c) => c.type === "defuse").length === 1)).toBeTruthy();
  expect(s.deck).toHaveLength(16);
  expect(s.deck.filter((c) => c.type === "kitten")).toHaveLength(1);
  expect(s.deck.filter((c) => c.type === "defuse")).toHaveLength(1);
  expect(counts(s)).toEqual({
    kitten: 1, defuse: 7, attack: 6, skip: 6, favor: 6, shuffle: 6,
    future: 7, nope: 7, cat1: 6, cat2: 6, cat3: 6,
  });
  const seventh = await request.post(`/api/games/${code}/join`, {
    data: { token: randomUUID(), name: "Лишний", avatar: "😼" },
  });
  expect(seventh.status()).toBe(400);
});
