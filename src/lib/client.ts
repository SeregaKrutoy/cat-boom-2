"use client";

import { DEFAULT_AVATAR, randomAvatar, randomName, sanitizeAvatar } from "@/lib/profile";

const TOKEN_KEY = "ek_token";
const NAME_KEY = "ek_name";
const AVATAR_KEY = "ek_avatar";

export function getToken(): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

export function getName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function getAvatar(): string {
  if (typeof window === "undefined") return DEFAULT_AVATAR;
  return sanitizeAvatar(localStorage.getItem(AVATAR_KEY));
}

export function saveAvatar(avatar: string) {
  localStorage.setItem(AVATAR_KEY, sanitizeAvatar(avatar));
}

/** Saved profile; a first-time visitor gets a random cat name and smiley that are then remembered. */
export function loadProfile(): { name: string; avatar: string } {
  let name = (localStorage.getItem(NAME_KEY) ?? "").trim();
  if (!name) {
    name = randomName();
    localStorage.setItem(NAME_KEY, name);
  }
  let avatar = localStorage.getItem(AVATAR_KEY);
  if (!avatar || sanitizeAvatar(avatar) !== avatar) {
    avatar = randomAvatar();
    localStorage.setItem(AVATAR_KEY, avatar);
  }
  return { name, avatar };
}

export function saveName(name: string) {
  localStorage.setItem(NAME_KEY, name);
}

export async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ error: "Сервер не отвечает" }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Ошибка");
  return data as T;
}
