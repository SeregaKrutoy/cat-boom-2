import { listOpenGames } from "@/lib/game/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = await listOpenGames();
    return Response.json(list);
  } catch (e) {
    console.error(e);
    return Response.json([], { status: 200 });
  }
}
