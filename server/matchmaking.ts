import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import { createMatch, createSolanaMatch } from './matchStore.js';

interface QueueEntry {
  player: string;
  ws: WebSocket;
}

const queue: QueueEntry[] = [];

// Set by server/index.ts based on whether Solana program is configured
let solanaEnabled = false;

export function setSolanaMode(enabled: boolean): void {
  solanaEnabled = enabled;
}

export function addToQueue(player: string, ws: WebSocket): void {
  // Don't allow the same WebSocket connection to re-queue
  const existingWs = queue.findIndex(e => e.ws === ws);
  if (existingWs !== -1) {
    ws.send(JSON.stringify({ type: 'queued', position: existingWs + 1 }));
    return;
  }

  queue.push({ player, ws });
  ws.send(JSON.stringify({ type: 'queued', position: queue.length }));

  tryMatch();
}

export function removeFromQueue(player: string): void {
  const idx = queue.findIndex(e => e.player === player);
  if (idx !== -1) queue.splice(idx, 1);
}

async function tryMatch(): Promise<void> {
  while (queue.length >= 2) {
    const a = queue.shift()!;
    const b = queue.shift()!;

    // Verify both connections are still alive
    if (a.ws.readyState !== WebSocket.OPEN) {
      queue.unshift(b);
      continue;
    }
    if (b.ws.readyState !== WebSocket.OPEN) {
      queue.unshift(a);
      continue;
    }

    const matchId = uuidv4();

    if (solanaEnabled) {
      // Solana/PER mode: create on-chain match
      try {
        await createSolanaMatch(matchId, a.player, b.player);
        console.log(`[Solana] Match created: ${matchId} | ${a.player.slice(0, 8)}... vs ${b.player.slice(0, 8)}...`);
      } catch (err) {
        console.error('[Solana] Failed to create match:', err);
        // Fall back to legacy mode for this match
        createMatch(matchId, a.player, b.player);
        console.log(`[Solana] Fallback to legacy match: ${matchId}`);
      }
    } else {
      createMatch(matchId, a.player, b.player);
    }

    const event = JSON.stringify({
      type: 'match_found',
      matchId,
      playerA: a.player,
      playerB: b.player,
    });

    a.ws.send(event);
    b.ws.send(event);

    console.log(`Match created: ${matchId} | ${a.player.slice(0, 8)}... vs ${b.player.slice(0, 8)}...`);
  }
}
