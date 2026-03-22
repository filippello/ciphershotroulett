import type { GameState, Target, CardType } from '../core/types';

export interface MatchState {
  matchId: string;
  playerA: string; // wallet address
  playerB: string;
  gameState: GameState;
  status: 'active' | 'finished';
}

export interface GameEngineAdapter {
  createMatch(matchId: string, playerA: string, playerB: string): Promise<MatchState>;
  submitShooterChoice(matchId: string, player: string, target: Target): Promise<MatchState>;
  submitResponderCard(matchId: string, player: string, card: CardType | null): Promise<MatchState>;
  getMatchState(matchId: string): Promise<MatchState>;
}
