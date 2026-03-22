import type { Target, CardType, Player } from '../core/types';
import { createInitialState, selectTarget, playCard, getResponder } from '../core/engine';
import type { GameEngineAdapter, MatchState } from './GameEngineAdapter';

export class LocalGameEngineAdapter implements GameEngineAdapter {
  private matches = new Map<string, MatchState>();

  private getPlayerRole(match: MatchState, walletAddress: string): Player {
    if (walletAddress === match.playerA) return 'player1';
    if (walletAddress === match.playerB) return 'player2';
    throw new Error('Player not in this match');
  }

  async createMatch(matchId: string, playerA: string, playerB: string): Promise<MatchState> {
    const match: MatchState = {
      matchId,
      playerA,
      playerB,
      gameState: createInitialState(),
      status: 'active',
    };
    this.matches.set(matchId, match);
    return match;
  }

  async submitShooterChoice(matchId: string, player: string, target: Target): Promise<MatchState> {
    const match = this.matches.get(matchId);
    if (!match) throw new Error('Match not found');

    const role = this.getPlayerRole(match, player);
    if (match.gameState.currentShooter !== role) throw new Error('Not your turn to shoot');

    let newGameState = selectTarget(match.gameState, target);

    // Auto-resolve if responder has no cards
    const responder = getResponder(newGameState.currentShooter);
    const hasCards = newGameState.players[responder].cards.some(c => !c.used);
    if (!hasCards) {
      newGameState = playCard(newGameState, null);
    }

    const updated: MatchState = {
      ...match,
      gameState: newGameState,
      status: newGameState.phase === 'gameOver' ? 'finished' : 'active',
    };
    this.matches.set(matchId, updated);
    return updated;
  }

  async submitResponderCard(matchId: string, player: string, card: CardType | null): Promise<MatchState> {
    const match = this.matches.get(matchId);
    if (!match) throw new Error('Match not found');

    const role = this.getPlayerRole(match, player);
    const responder = getResponder(match.gameState.currentShooter);
    if (role !== responder) throw new Error('Not your turn to respond');

    const newGameState = playCard(match.gameState, card);

    const updated: MatchState = {
      ...match,
      gameState: newGameState,
      status: newGameState.phase === 'gameOver' ? 'finished' : 'active',
    };
    this.matches.set(matchId, updated);
    return updated;
  }

  async getMatchState(matchId: string): Promise<MatchState> {
    const match = this.matches.get(matchId);
    if (!match) throw new Error('Match not found');
    return match;
  }
}
