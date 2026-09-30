import { GameError } from "@/lib/game/engine";
import { withGame } from "@/lib/game/store";
import { startRoom } from "@/lib/game/tournament";
import { toView } from "@/lib/game/view";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const body = await req.json();
    const token = (body.token ?? "").trim();
    const { state } = await withGame(code.toUpperCase(), (s, now) => startRoom(s, token, now));
    return Response.json(toView(state, token, Date.now()));
  } catch (e) {
    if (e instanceof GameError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
