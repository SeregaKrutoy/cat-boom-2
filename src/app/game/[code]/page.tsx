import { MusicTrack } from "@/components/AudioControls";
import { GameClient } from "@/components/GameClient";

export default async function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <>
      <MusicTrack track="game" />
      <GameClient key={code.toUpperCase()} code={code.toUpperCase()} />
    </>
  );
}
