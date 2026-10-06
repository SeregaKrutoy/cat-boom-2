import { GameError } from "@/lib/game/engine";
import { postChat } from "@/lib/game/chat";
import { touchGame, withGame } from "@/lib/game/store";
import { toView } from "@/lib/game/view";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const body = (await req.json()) as {
      token?: string;
      text?: unknown;
      sticker?: unknown;
      watch?: number | null;
    };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) return Response.json({ error: "Нет токена игрока" }, { status: 400 });
    const watch = typeof body.watch === "number" && Number.isSafeInteger(body.watch) ? body.watch : null;
    const gameCode = code.toUpperCase();
    const { state } = await withGame(gameCode, (s, now) =>
      postChat(s, token, { text: body.text, sticker: body.sticker }, now, watch),
    );
    await touchGame(gameCode);
    return Response.json(toView(state, token, Date.now(), watch));
  } catch (e) {
    if (e instanceof GameError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
