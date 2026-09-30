import { createState } from "@/lib/game/engine";
import { insertGame, newCode } from "@/lib/game/store";
import type { Mode } from "@/lib/game/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { mode?: Mode; name?: string; token?: string; maxPlayers?: number };
    const name = (body.name ?? "").trim().slice(0, 24) || "Игрок";
    const token = (body.token ?? "").trim();
    if (token.length < 8) return Response.json({ error: "Нет токена игрока" }, { status: 400 });
    const mode: Mode = body.mode === "bot" ? "bot" : body.mode === "tournament" ? "tournament" : "friends";
    const maxPlayers = mode === "tournament" ? 8 : Math.max(2, Math.min(4, Math.floor(body.maxPlayers ?? 2)));
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      try {
        await insertGame(createState(code, mode, { id: token, name }, maxPlayers));
        return Response.json({ code });
      } catch { /* collision */ }
    }
    return Response.json({ error: "Не удалось создать игру" }, { status: 500 });
  } catch {
    return Response.json({ error: "Неверный запрос" }, { status: 400 });
  }
}
