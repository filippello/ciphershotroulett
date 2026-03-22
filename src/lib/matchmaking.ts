/**
 * Matchmaking & Game Connection for CipherShot (Solana/PER)
 *
 * WebSocket-based matchmaking (unchanged) + Solana transaction submission.
 * Card plays go as plaintext to PER endpoint — TEE shields privacy.
 * No client-side encryption needed (unlike the old FHE approach).
 */

import { PublicKey, Transaction } from '@solana/web3.js';
import type { GameState, Target, CardType } from '@/game/core/types';
import {
  chooseTargetOnChain,
  playCardOnChain,
} from '@/lib/solana';
import { getProvider } from '@/lib/wallet';

// WebSocket URL for matchmaking + state relay
const WS_URL = import.meta.env.VITE_WS_URL
  || `ws://${window.location.hostname}:${Number(window.location.port) === 9000 ? 9001 : 3001}`;

export interface MatchFoundEvent {
  type: 'match_found';
  matchId: string;
  playerA: string;
  playerB: string;
}

export interface QueuedEvent {
  type: 'queued';
  position: number;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type ServerEvent = MatchFoundEvent | QueuedEvent | ErrorEvent;

export function connectMatchmaking(
  playerAddress: string,
  onEvent: (event: ServerEvent) => void,
): { close: () => void } {
  const ws = new WebSocket(WS_URL);
  let matchFound = false;
  let closedByUser = false;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join_queue', player: playerAddress }));
  };

  ws.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as ServerEvent;
      if (event.type === 'match_found') matchFound = true;
      onEvent(event);
    } catch { /* ignore malformed messages */ }
  };

  ws.onerror = () => {
    if (!matchFound && !closedByUser) {
      onEvent({ type: 'error', message: 'Connection lost' });
    }
  };

  ws.onclose = () => {
    if (!matchFound && !closedByUser) {
      onEvent({ type: 'error', message: 'Disconnected' });
    }
  };

  return {
    close: () => {
      closedByUser = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'leave_queue', player: playerAddress }));
      }
      ws.close();
    },
  };
}

// --- Game connection (after match found) ---

export function connectToMatch(
  matchId: string,
  playerAddress: string,
  onStateUpdate: (gameState: GameState) => void,
  onError: (msg: string) => void,
): GameConnection {
  return new GameConnection(matchId, playerAddress, onStateUpdate, onError);
}

export class GameConnection {
  private ws: WebSocket;
  private matchId: string;
  private player: string;
  private _solanaMode = false;
  private _matchPda: PublicKey | null = null;
  private _playerA: string = '';
  private _playerB: string = '';
  private _currentShotIndex: number = 0;
  private _closed = false;

  constructor(
    matchId: string,
    player: string,
    private onStateUpdate: (gameState: GameState) => void,
    private onError: (msg: string) => void,
  ) {
    this.matchId = matchId;
    this.player = player;
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      if (this._closed) return;
      this.ws.send(JSON.stringify({
        type: 'join_match',
        matchId: this.matchId,
        player: this.player,
      }));
    };

    this.ws.onmessage = (msg) => {
      if (this._closed) return;
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'state_update' && data.gameState) {
          if (data.solanaMode !== undefined) this._solanaMode = data.solanaMode;
          if (data.matchPda) this._matchPda = new PublicKey(data.matchPda);
          if (data.playerA) this._playerA = data.playerA;
          if (data.playerB) this._playerB = data.playerB;
          if (data.gameState.currentShotIndex !== undefined) {
            this._currentShotIndex = data.gameState.currentShotIndex;
          }
          this.onStateUpdate(data.gameState);
        }
      } catch { /* ignore */ }
    };

    this.ws.onerror = () => { if (!this._closed) this.onError('Connection lost'); };
    this.ws.onclose = () => { if (!this._closed) this.onError('Disconnected from match'); };
  }

  get solanaMode(): boolean {
    return this._solanaMode;
  }

  /**
   * Choose target. In Solana mode, sends tx to PER. In legacy mode, sends via WebSocket.
   */
  async chooseTarget(target: Target): Promise<void> {
    if (this._solanaMode && this._matchPda) {
      try {
        const wallet = await getSolanaWallet();
        const targetNum = target === 'self' ? 0 : 1;
        await chooseTargetOnChain(wallet, this._matchPda, targetNum);
        console.log('[Solana] chooseTarget tx confirmed');
      } catch (err) {
        console.error('[Solana] chooseTarget failed:', err);
        this.onError('Transaction failed');
      }
    } else {
      this.send({ type: 'choose_target', matchId: this.matchId, player: this.player, target });
    }
  }

  /**
   * Play card. In Solana mode, sends plaintext card to PER (TEE protects privacy).
   * No encryption needed — this is the key simplification over FHE.
   */
  async playCard(card: CardType | null): Promise<void> {
    if (this._solanaMode && this._matchPda) {
      try {
        const wallet = await getSolanaWallet();
        const cardNum = card === 'bluff' ? 1 : card === 'redirect' ? 2 : 0;
        await playCardOnChain(wallet, this._matchPda, {
          currentShotIndex: this._currentShotIndex,
          playerA: this._playerA,
          playerB: this._playerB,
        }, cardNum);
        console.log('[Solana] playCard tx confirmed (plaintext to TEE)');
      } catch (err) {
        console.error('[Solana] playCard failed:', err);
        this.onError('Transaction failed');
      }
    } else {
      this.send({ type: 'play_card', matchId: this.matchId, player: this.player, card });
    }
  }

  close(): void {
    this._closed = true;
    this.ws.close();
  }

  private send(msg: object): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}

/**
 * Get the connected Solana wallet (Phantom/Solflare/Backpack).
 * Uses getProvider() to avoid MetaMask's fake window.solana proxy.
 */
async function getSolanaWallet(): Promise<{
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}> {
  const provider = getProvider();
  if (!provider) {
    throw new Error('No Solana wallet found');
  }
  if (!provider.publicKey) {
    await provider.connect();
  }
  if (!provider.publicKey) {
    throw new Error('Solana wallet not connected');
  }
  return {
    publicKey: provider.publicKey as PublicKey,
    signTransaction: (tx: Transaction) => provider.signTransaction(tx),
  };
}
