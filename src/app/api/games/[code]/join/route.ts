import { addPlayer, GameError } from "@/lib/game/engine";
import { cleanName, sanitizeAvatar } from "@/lib/profile";
import { touchGame, withGame } from "@/lib/game/store";
import { toView } from "@/lib/game/view";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const gameCode = code.toUpperCase();
  try {
    const body = (await req.json()) as { name?: string; avatar?: string; token?: string };
    const token = (body.token ?? "").trim();
    const name = cleanName(body.name);
    const avatar = sanitizeAvatar(body.avatar);
    if (token.length < 8) return Response.json({ error: "Нет токена игрока" }, { status: 400 });
    const { state } = await withGame(gameCode, (s, now) => addPlayer(s, token, name, now, avatar));
    if (state.status === "waiting") await touchGame(gameCode);
    return Response.json(toView(state, token, Date.now()));
  } catch (e) {
    if (e instanceof GameError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
