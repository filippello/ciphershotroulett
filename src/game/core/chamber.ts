import type { ShotType } from './types';

/**
 * Fisher-Yates shuffle (pure — returns a new array).
 */
function shuffle<T>(source: readonly T[]): T[] {
  const arr = [...source];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Generate a shuffled chamber with 3 live rounds and 4 blanks (7 total).
 */
export function generateChamber(): ShotType[] {
  const rounds: ShotType[] = [
    'live', 'live', 'live',
    'blank', 'blank', 'blank', 'blank',
  ];
  return shuffle(rounds);
}
