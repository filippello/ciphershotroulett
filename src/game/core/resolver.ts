import type { CardType, GameState, Player, ShotResult, Target } from './types';

/**
 * Return the opponent of a given player.
 */
function opponentOf(player: Player): Player {
  return player === 'player1' ? 'player2' : 'player1';
}

/**
 * Resolve who actually gets shot after considering the card played.
 *
 * - bluff (or null): no effect — target stays as chosen.
 * - redirect: flips the target.
 *   - 'self' becomes opponent, 'opponent' becomes self.
 */
export function resolveTarget(
  shooter: Player,
  originalTarget: Target,
  cardPlayed: CardType | null,
): Player {
  const redirected = cardPlayed === 'redirect';

  if (originalTarget === 'self') {
    return redirected ? opponentOf(shooter) : shooter;
  }
  // originalTarget === 'opponent'
  return redirected ? shooter : opponentOf(shooter);
}

/**
 * Resolve the current shot using the game state.
 * Returns a complete ShotResult without mutating state.
 */
export function resolveShot(state: GameState): ShotResult {
  const shotType = state.chamber[state.currentShotIndex];
  const shooter = state.currentShooter;
  const originalTarget = state.selectedTarget!;
  const cardPlayed = state.respondedCard;

  const finalTarget = resolveTarget(shooter, originalTarget, cardPlayed);
  const killed = shotType === 'live';

  return {
    shotType,
    shooter,
    originalTarget,
    cardPlayed,
    finalTarget,
    killed,
  };
}
