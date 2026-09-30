export type CardType =
  | "kitten" | "defuse" | "attack" | "skip" | "favor" | "shuffle" | "future" | "nope"
  | "cat1" | "cat2" | "cat3";

export interface Card { id: string; type: CardType; }

export interface Player {
  id: string; name: string; isBot: boolean; hand: Card[]; exploded: boolean;
}

export type PendingKind = "attack" | "skip" | "favor" | "shuffle" | "future" | "pair" | "triple";

export interface Pending {
  kind: PendingKind; by: number; cards: Card[];
  named?: CardType; target?: number;
  nopes: number; lastBy: number; deadline: number;
}

export interface LogEntry {
  id: number; text: string; ts: number;
  for?: number; tone?: "info" | "danger" | "good" | "nope";
}

export interface Peek { player: number; cards: Card[]; seq: number; }

export type Mode = "friends" | "bot" | "tournament";
export type Status = "waiting" | "playing" | "finished";
export type Phase = "action" | "nope" | "favor" | "defuse";

export interface GameEvent {
  seq: number; kind: "explode" | "defused" | "nope" | "attack" | "shuffle" | "steal" | "start";
  player: number;
}

/** One table of the current round: an independent 2-player game. */
export interface TournamentTable {
  id: number; // unique across the whole tournament
  a: number; b: number; // room player indexes seated at this table
  game: GameState; // the actual game being played (players[0] = a, players[1] = b)
  winner: number | null; // room player index
  lastSeq: number; lastChange: number; // for auto-play of idle players
}

export interface Tournament {
  rounds: [number, number][][]; // round-robin schedule: pairs per round
  round: number; // current round index
  tables: TournamentTable[]; // tables of the current round (kept after the end)
  bye: number | null; // player resting this round (odd number of players)
  phase: "round" | "between" | "finished";
  nextRoundAt: number | null;
  nextTableId: number;
  wins: number[]; played: number[]; away: boolean[];
  champion: number | null;
  tie: number[]; // players sharing first place when it is a draw
}

export interface GameState {
  code: string; mode: Mode; maxPlayers: number;
  tournament: Tournament | null;
  status: Status; players: Player[];
  deck: Card[]; discard: Card[];
  current: number; turnsLeft: number; underAttack: boolean;
  phase: Phase; pending: Pending | null;
  favor: { giver: number; receiver: number } | null;
  defuse: { player: number; kitten: Card } | null;
  peek: Peek | null; log: LogEntry[];
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
  name: string; isBot: boolean; handCount: number; exploded: boolean;
}

export interface TableSummary {
  id: number; num: number; // num = table number within the round (1-based)
  seats: [number, number]; names: [string, string];
  status: "playing" | "finished";
  winner: number | null; // room player index
  turn: string | null; // name of the player who moves now
  mine: boolean;
}

export interface Standing { idx: number; name: string; wins: number; played: number; }

export interface TournamentView {
  round: number; rounds: number; // 1-based
  phase: "round" | "between" | "finished";
  nextRoundIn: number; // ms
  tables: TableSummary[];
  bye: string | null; byeMe: boolean;
  standings: Standing[]; total: number;
  champion: number | null; tie: number[];
  names: string[]; myIdx: number;
  myTable: number | null; // id of my table in the current round
}

export interface GameView {
  code: string; mode: Mode; maxPlayers: number;
  tournament: TournamentView | null;
  spectator: boolean; // watching a table I am not seated at
  tableId: number | null; // tournament table shown in this view
  status: Status; me: number; isHost: boolean;
  players: PlayerView[]; hand: Card[];
  deckCount: number; discardTop: Card | null; discardCount: number;
  current: number; turnsLeft: number; phase: Phase;
  pending: (Omit<Pending, "deadline"> & { msLeft: number; responder: number }) | null;
  favor: { giver: number; receiver: number } | null;
  defuse: { player: number } | null;
  peek: Peek | null; log: LogEntry[];
  winner: number | null; event: GameEvent | null;
  seq: number; score: number[];
}

export interface GameListItem {
  code: string; mode: Mode; maxPlayers: number;
  playerCount: number; playerNames: string[]; status: Status;
}
