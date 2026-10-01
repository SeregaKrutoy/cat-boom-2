import { GameError } from "@/lib/game/engine";
import { withGame } from "@/lib/game/store";
import { dispatchAction } from "@/lib/game/tournament";
import type { Action } from "@/lib/game/types";
import { toView } from "@/lib/game/view";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const body = (await req.json()) as { token?: string; action?: Action; watch?: number | null; matchId?: string };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!body.action || typeof body.action !== "object") return Response.json({ error: "Нет действия" }, { status: 400 });
    const action = body.action;
    const watch = typeof body.watch === "number" && Number.isSafeInteger(body.watch) ? body.watch : null;
    const { state } = await withGame(code.toUpperCase(), (s, now) => {
      const current = toView(s, token, now, watch);
      if (body.matchId !== undefined && body.matchId !== current.matchId) {
        throw new GameError("Уже началась другая партия. Дождись обновления стола.");
      }
      if (current.spectator && action.type !== "rematch") {
        throw new GameError("Ты смотришь чужой стол. Вернись к своему, чтобы сделать ход.");
      }
      dispatchAction(s, token, action, now);
    });
    return Response.json(toView(state, token, Date.now(), watch));
  } catch (e) {
    if (e instanceof GameError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
