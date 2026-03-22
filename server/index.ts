import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { addToQueue, removeFromQueue, setSolanaMode } from './matchmaking.js';
import {
  joinMatch, handleChooseTarget, handlePlayCard,
  broadcastState, getMatch,
} from './matchStore.js';
import { initSolanaListener, subscribeToMatch } from './solanaListener.js';

const PORT = Number(process.env.PORT) || 3001;
const SOLANA_MODE = initSolanaListener();
setSolanaMode(SOLANA_MODE);

if (SOLANA_MODE) {
  console.log(`CipherShot server running in SOLANA/PER MODE on :${PORT}`);
} else {
  console.log(`CipherShot server running in LEGACY MODE on :${PORT}`);
}

const server = http.createServer((_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(200);
  res.end(JSON.stringify({ status: 'ok', port: PORT, solanaMode: SOLANA_MODE }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  let playerAddress: string | null = null;

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());

      // --- Matchmaking ---
      if (msg.type === 'join_queue' && msg.player) {
        playerAddress = msg.player;
        addToQueue(playerAddress, ws);
        console.log(`Player queued: ${playerAddress.slice(0, 8)}...`);
      }

      if (msg.type === 'leave_queue' && playerAddress) {
        removeFromQueue(playerAddress);
        console.log(`Player left queue: ${playerAddress.slice(0, 8)}...`);
      }

      // --- Match join ---
      if (msg.type === 'join_match' && msg.matchId && msg.player) {
        playerAddress = msg.player;
        const match = joinMatch(msg.matchId, msg.player, ws);
        if (match) {
          ws.send(JSON.stringify({
            type: 'state_update',
            matchId: match.matchId,
            gameState: match.gameState,
            solanaMode: match.solanaMode,
            matchPda: match.matchPda,
            playerA: match.playerA,
            playerB: match.playerB,
          }));
          console.log(`Player joined match: ${msg.player.slice(0, 8)}... → ${msg.matchId.slice(0, 8)}...`);
        }
      }

      // --- Legacy game actions (only in non-Solana mode) ---
      if (!SOLANA_MODE) {
        if (msg.type === 'choose_target' && msg.matchId && msg.player && msg.target) {
          const match = handleChooseTarget(msg.matchId, msg.player, msg.target);
          if (match) {
            broadcastState(match);
            console.log(`Action: ${msg.player.slice(0, 8)}... chose target ${msg.target}`);
          }
        }

        if (msg.type === 'play_card' && msg.matchId && msg.player) {
          const match = handlePlayCard(msg.matchId, msg.player, msg.card ?? null);
          if (match) {
            broadcastState(match);
            console.log(`Action: ${msg.player.slice(0, 8)}... played ${msg.card ?? 'pass'}`);
          }
        }
      }

    } catch { /* ignore malformed */ }
  });

  ws.on('close', () => {
    if (playerAddress) {
      removeFromQueue(playerAddress);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CipherShot matchmaking server on :${PORT}`);
});
