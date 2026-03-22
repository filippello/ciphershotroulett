import { WebSocket } from 'ws';
import type { GameState, Target, CardType, Player } from '../src/game/core/types.js';
import { createInitialState, selectTarget, playCard, getResponder } from '../src/game/core/engine.js';
import { createMatchOnChain, subscribeToMatch } from './solanaListener.js';

export interface MatchRecord {
  matchId: string;
  matchPda: string | null; // Solana PDA base58 (null in legacy mode)
  playerA: string;
  playerB: string;
  gameState: GameState;
  status: 'active' | 'finished';
  connections: Map<string, WebSocket>; // playerAddress -> ws
  solanaMode: boolean;
}

const matches = new Map<string, MatchRecord>();

// ================================================================
// Legacy mode (in-memory game engine — no blockchain)
// ================================================================

export function createMatch(matchId: string, playerA: string, playerB: string): MatchRecord {
  const record: MatchRecord = {
    matchId,
    matchPda: null,
    playerA,
    playerB,
    gameState: createInitialState(),
    status: 'active',
    connections: new Map(),
    solanaMode: false,
  };
  matches.set(matchId, record);
  return record;
}

// ================================================================
// Solana/PER mode (on-chain — server is state relay)
// ================================================================

export async function createSolanaMatch(matchId: string, playerA: string, playerB: string): Promise<MatchRecord> {

  // Create the match on-chain
  const result = await createMatchOnChain(playerA, playerB);

  // Initial state — real state comes from on-chain subscription
  const gameState = createInitialState();
  gameState.chamber = Array(7).fill('blank') as GameState['chamber'];

  const record: MatchRecord = {
    matchId,
    matchPda: result?.matchPda || null,
    playerA,
    playerB,
    gameState,
    status: 'active',
    connections: new Map(),
    solanaMode: !!result,
  };
  matches.set(matchId, record);

  // Subscribe to on-chain state changes
  if (result) {
    subscribeToMatch(result.matchPda, playerA, playerB, (update) => {
      record.gameState = update.gameState;
      if (update.gameState.phase === 'gameOver') record.status = 'finished';
      broadcastState(record);
    });
  }

  return record;
}

// ================================================================
// Common
// ================================================================

export function getMatch(matchId: string): MatchRecord | undefined {
  return matches.get(matchId);
}

export function joinMatch(matchId: string, player: string, ws: WebSocket): MatchRecord | null {
  const match = matches.get(matchId);
  if (!match) return null;
  match.connections.set(player, ws);
  return match;
}

function getPlayerRole(match: MatchRecord, player: string): Player {
  if (player === match.playerA) return 'player1';
  if (player === match.playerB) return 'player2';
  throw new Error('Player not in match');
}

// ================================================================
// Legacy game actions (in-memory engine)
// ================================================================

export function handleChooseTarget(matchId: string, player: string, target: Target): MatchRecord | null {
  const match = matches.get(matchId);
  if (!match || match.status !== 'active' || match.solanaMode) return null;

  const role = getPlayerRole(match, player);
  if (match.gameState.currentShooter !== role) return null;
  if (match.gameState.phase !== 'choosingTarget') return null;

  let newState = selectTarget(match.gameState, target);

  // Auto-resolve if responder has no cards
  const responder = getResponder(newState.currentShooter);
  const hasCards = newState.players[responder].cards.some(c => !c.used);
  if (!hasCards) {
    newState = playCard(newState, null);
  }

  match.gameState = newState;
  if (newState.phase === 'gameOver') match.status = 'finished';
  return match;
}

export function handlePlayCard(matchId: string, player: string, card: CardType | null): MatchRecord | null {
  const match = matches.get(matchId);
  if (!match || match.status !== 'active' || match.solanaMode) return null;

  const role = getPlayerRole(match, player);
  const responder = getResponder(match.gameState.currentShooter);
  if (role !== responder) return null;
  if (match.gameState.phase !== 'respondingCard') return null;

  const newState = playCard(match.gameState, card);
  match.gameState = newState;
  if (newState.phase === 'gameOver') match.status = 'finished';
  return match;
}

/**
 * Update match state from Solana account subscription.
 * Called by solanaListener when MatchConfig account changes.
 */
export function updateMatchFromChain(matchId: string, gameState: GameState): MatchRecord | null {
  // Try by matchId first, then by matchPda
  let match = matches.get(matchId);
  if (!match) {
    for (const m of matches.values()) {
      if (m.matchPda === matchId) {
        match = m;
        break;
      }
    }
  }
  if (!match || !match.solanaMode) return null;

  match.gameState = gameState;
  if (gameState.phase === 'gameOver') match.status = 'finished';
  return match;
}

// ================================================================
// Broadcast
// ================================================================

export function broadcastState(match: MatchRecord): void {
  const msg = JSON.stringify({
    type: 'state_update',
    matchId: match.matchId,
    gameState: match.gameState,
    solanaMode: match.solanaMode,
    matchPda: match.matchPda,
    playerA: match.playerA,
    playerB: match.playerB,
  });
  for (const ws of match.connections.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}
