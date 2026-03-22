import type { CardType, GameState, Player, Target } from './types';
import { generateChamber } from './chamber';
import { generatePlayerCards, canPlayCard, markCardUsed } from './cards';
import { resolveShot } from './resolver';

/**
 * Return the opponent of the given player.
 */
export function getResponder(shooter: Player): Player {
  return shooter === 'player1' ? 'player2' : 'player1';
}

/**
 * Create the initial game state for a new game.
 */
export function createInitialState(): GameState {
  return {
    phase: 'choosingTarget',
    currentShooter: 'player1',
    chamber: generateChamber(),
    currentShotIndex: 0,
    players: {
      player1: { cards: generatePlayerCards(), alive: true },
      player2: { cards: generatePlayerCards(), alive: true },
    },
    selectedTarget: null,
    respondedCard: null,
    lastResult: null,
    winner: null,
    shotHistory: [],
  };
}

/**
 * The current shooter selects a target ('self' or 'opponent').
 * Transitions to the 'respondingCard' phase.
 */
export function selectTarget(state: GameState, target: Target): GameState {
  if (state.phase !== 'choosingTarget') {
    return state;
  }

  return {
    ...state,
    selectedTarget: target,
    phase: 'respondingCard',
  };
}

/**
 * The responder plays a card (or null to skip).
 * Then the shot is resolved immediately.
 */
export function playCard(
  state: GameState,
  cardType: CardType | null,
): GameState {
  if (state.phase !== 'respondingCard') {
    return state;
  }

  const responder = getResponder(state.currentShooter);

  // Validate card play
  if (cardType !== null && !canPlayCard(state.players[responder].cards, cardType)) {
    return state;
  }

  // Mark the card as used if one was played
  let updatedPlayers = { ...state.players };
  if (cardType !== null) {
    const responderCards = state.players[responder].cards;
    const cardToUse = responderCards.find((c) => c.type === cardType && !c.used);
    if (cardToUse) {
      updatedPlayers = {
        ...updatedPlayers,
        [responder]: {
          ...updatedPlayers[responder],
          cards: markCardUsed(responderCards, cardToUse.id),
        },
      };
    }
  }

  // Build intermediate state for resolution
  const stateForResolve: GameState = {
    ...state,
    respondedCard: cardType,
    players: updatedPlayers,
  };

  return resolveAndAdvance(stateForResolve);
}

/**
 * Internal: resolve the shot outcome, check for kill, and advance the game.
 * Returns a new GameState — never mutates.
 */
function resolveAndAdvance(state: GameState): GameState {
  const result = resolveShot(state);
  const newHistory = [...state.shotHistory, result];

  // Apply kill if the shot was live
  let updatedPlayers = { ...state.players };
  if (result.killed) {
    updatedPlayers = {
      ...updatedPlayers,
      [result.finalTarget]: {
        ...updatedPlayers[result.finalTarget],
        alive: false,
      },
    };
  }

  // Check for game over
  if (result.killed) {
    const winner = getResponder(result.finalTarget as Player);
    return {
      ...state,
      phase: 'gameOver',
      players: updatedPlayers,
      lastResult: result,
      winner,
      shotHistory: newHistory,
      selectedTarget: null,
      respondedCard: null,
    };
  }

  // No kill — advance to next shot
  const nextShotIndex = state.currentShotIndex + 1;

  // If we've exhausted the chamber, game ends in a draw-like state
  // (shouldn't happen with 3 live rounds, but handle gracefully)
  if (nextShotIndex >= state.chamber.length) {
    return {
      ...state,
      phase: 'gameOver',
      players: updatedPlayers,
      lastResult: result,
      winner: null,
      shotHistory: newHistory,
      currentShotIndex: nextShotIndex,
      selectedTarget: null,
      respondedCard: null,
    };
  }

  // Swap shooter and responder for the next turn
  const nextShooter = getResponder(state.currentShooter);

  return {
    ...state,
    phase: 'choosingTarget',
    currentShooter: nextShooter,
    currentShotIndex: nextShotIndex,
    players: updatedPlayers,
    lastResult: result,
    selectedTarget: null,
    respondedCard: null,
    winner: null,
    shotHistory: newHistory,
  };
}
