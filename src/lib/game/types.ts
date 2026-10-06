export type CardType =
  | "kitten" | "defuse" | "attack" | "skip" | "favor" | "shuffle" | "future" | "nope"
  | "cat1" | "cat2" | "cat3";

export interface Card { id: string; type: CardType; }

export interface Player {
  id: string; name: string; isBot: boolean; hand: Card[]; exploded: boolean;
  avatar?: string; // cat smiley shown next to the name (optional for older saved games)
}

export type PendingKind = "attack" | "skip" | "favor" | "shuffle" | "future" | "pair" | "triple";

export interface Pending {
  kind: PendingKind; by: number; cards: Card[];
  named?: CardType; target?: number;
  nopes: number; lastBy: number; deadline: number;
  passed?: number[]; // responses in the current shared Nope window
}

export interface LogEntry {
  id: number; text: string; ts: number;
  for?: number; tone?: "info" | "danger" | "good" | "nope";
}

export interface Peek { player: number; cards: Card[]; seq: number; }

export interface ChatMessage {
  id: number;
  from: number; // room player index
  name: string;
  avatar: string;
  kind: "text" | "sticker";
  text?: string;
  sticker?: string; // sticker id, see src/lib/stickers.ts
  ts: number;
  tableId?: number | null; // which tournament table this belongs to (null if room-wide)
}

export type Mode = "friends" | "bot" | "tournament";
export type Status = "waiting" | "playing" | "finished";
export type Phase = "action" | "nope" | "favor" | "defuse";

export interface GameEvent {
  seq: number; kind: "explode" | "defused" | "nope" | "attack" | "shuffle" | "steal" | "start";
  player: number;
}

/** One table of the current round: an independent 2-player game. */
export interface TournamentTable {
  id: number;
  a: number; b: number;
  game: GameState;
  winner: number | null;
  lastSeq: number; lastChange: number;
}

export interface Tournament {
  rounds: [number, number][][];
  round: number;
  tables: TournamentTable[];
  bye: number | null;
  phase: "round" | "between" | "finished";
  nextRoundAt: number | null;
  nextTableId: number;
  wins: number[]; played: number[]; away: boolean[];
  champion: number | null;
  tie: number[];
}

export interface GameState {
  code: string; mode: Mode; maxPlayers: number;
  matchId?: string; // new per deal; optional for persisted games from older versions
  deckVersion?: number;
  rematchVotes?: number[]; // players (by index) who pressed «Реванш»; everyone must agree
  tournament: Tournament | null;
  status: Status; players: Player[];
  deck: Card[]; discard: Card[];
  current: number; turnsLeft: number; underAttack: boolean;
  phase: Phase; pending: Pending | null;
  favor: { giver: number; receiver: number } | null;
  defuse: { player: number; kitten: Card } | null;
  peek: Peek | null; log: LogEntry[];
  chat?: ChatMessage[]; // room-wide chat (optional: rooms saved before chat existed)
  winner: number | null;
  botNextAt: number | null; botKnown: string[];
  event: GameEvent | null; seq: number;
  games: number; score: number[]; hostId: string;
}

export type Action =
  | { type: "play"; cardIds: string[]; named?: CardType; target?: number }
  | { type: "draw" } | { type: "nope" } | { type: "pass" }
  | { type: "give"; cardId: string } | { type: "place"; position: number }
  | { type: "rematch" };

export interface PlayerView {
  name: string; avatar: string; isBot: boolean; handCount: number; exploded: boolean;
}

export interface TableSummary {
  id: number; num: number;
  seats: [number, number]; names: [string, string]; avatars: [string, string];
  status: "playing" | "finished";
  winner: number | null;
  turn: string | null;
  mine: boolean;
}

export interface Standing { idx: number; name: string; avatar: string; wins: number; played: number; }

export interface TournamentView {
  id: string;
  round: number; rounds: number;
  phase: "round" | "between" | "finished";
  nextRoundIn: number;
  tables: TableSummary[];
  bye: string | null; byeMe: boolean;
  standings: Standing[]; total: number;
  champion: number | null; tie: number[];
  names: string[]; avatars: string[]; myIdx: number;
  myTable: number | null;
}

export interface GameView {
  code: string; mode: Mode; maxPlayers: number;
  matchId: string;
  rematch: RematchInfo | null; // null while playing and in bot games (a rematch is instant there)
  tournament: TournamentView | null;
  spectator: boolean;
  tableId: number | null;
  status: Status; me: number; isHost: boolean;
  players: PlayerView[]; hand: Card[];
  deckCount: number; discardTop: Card | null; discardCount: number;
  current: number; turnsLeft: number; phase: Phase;
  pending: (Omit<Pending, "deadline"> & { msLeft: number; responder: number; responders: number[] }) | null;
  favor: { giver: number; receiver: number } | null;
  defuse: { player: number } | null;
  peek: Peek | null; log: LogEntry[];
  chat: ChatMessage[];
  winner: number | null; event: GameEvent | null;
  seq: number; score: number[];
}

export interface RematchInfo {
  ready: { name: string; avatar: string }[];
  waiting: { name: string; avatar: string }[];
  iVoted: boolean;
}

export interface GameListItem {
  code: string; mode: Mode; maxPlayers: number;
  playerCount: number; playerNames: string[]; playerAvatars: string[]; status: Status;
}
