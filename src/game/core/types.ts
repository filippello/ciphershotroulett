export type Player = 'player1' | 'player2';
export type Target = 'self' | 'opponent';
export type CardType = 'bluff' | 'redirect';
export type ShotType = 'live' | 'blank';
export type GamePhase = 'choosingTarget' | 'respondingCard' | 'resolving' | 'gameOver';

export interface Card {
  id: string;
  type: CardType;
  used: boolean;
}

export interface PlayerState {
  cards: Card[];
  alive: boolean;
}

export interface ShotResult {
  shotType: ShotType;
  shooter: Player;
  originalTarget: Target;
  cardPlayed: CardType | null;
  finalTarget: Player;
  killed: boolean;
}

export interface GameState {
  phase: GamePhase;
  currentShooter: Player;
  chamber: ShotType[];
  currentShotIndex: number;
  players: Record<Player, PlayerState>;
  selectedTarget: Target | null;
  respondedCard: CardType | null;
  lastResult: ShotResult | null;
  winner: Player | null;
  shotHistory: ShotResult[];
}
