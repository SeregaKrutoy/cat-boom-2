import { GameError } from "@/lib/game/engine";
import { touchGame, withGame } from "@/lib/game/store";
import { toView } from "@/lib/game/view";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const watchRaw = url.searchParams.get("watch");
  const watch = watchRaw !== null && watchRaw !== "" && Number.isFinite(Number(watchRaw)) ? Number(watchRaw) : null;
  const gameCode = code.toUpperCase();
  try {
    const { state } = await withGame(gameCode);
    // Only a real player of a waiting room counts as "someone at the table"
    if (state.status === "waiting" && state.players.some((p) => p.id === token)) {
      await touchGame(gameCode);
    }
    return Response.json(toView(state, token, Date.now(), watch));
  } catch (e) {
    if (e instanceof GameError) return Response.json({ error: e.message }, { status: 404 });
    console.error(e);
    return Response.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
