import type { Card, CardType } from './types';

let cardCounter = 0;

function nextCardId(): string {
  cardCounter += 1;
  return `card-${cardCounter}`;
}

/**
 * Generate 5 cards for a player: 3 bluff, 2 redirect.
 * Each card has a unique ID.
 */
export function generatePlayerCards(): Card[] {
  const types: CardType[] = ['bluff', 'bluff', 'bluff', 'redirect', 'redirect'];
  return types.map((type) => ({
    id: nextCardId(),
    type,
    used: false,
  }));
}

/**
 * Check whether the player has an unused card of the given type.
 */
export function canPlayCard(cards: readonly Card[], type: CardType): boolean {
  return cards.some((c) => c.type === type && !c.used);
}

/**
 * Return a new cards array with the specified card marked as used.
 */
export function markCardUsed(cards: readonly Card[], cardId: string): Card[] {
  return cards.map((c) =>
    c.id === cardId ? { ...c, used: true } : { ...c },
  );
}
