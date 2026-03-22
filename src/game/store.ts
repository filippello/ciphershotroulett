import { create } from 'zustand';
import type { GameState, Target, CardType } from './core/types';
import { createInitialState } from './core/engine';
import type { GameConnection } from '@/lib/matchmaking';

interface GameStore {
  gameState: GameState;
  animating: boolean;
  connection: GameConnection | null;
  pendingState: GameState | null;
  txPending: boolean;

  // Actions
  setConnection: (conn: GameConnection | null) => void;
  receiveState: (state: GameState) => void;
  chooseTarget: (target: Target) => Promise<void>;
  respondWithCard: (cardType: CardType | null) => Promise<void>;
  setAnimating: (animating: boolean) => void;
  setTxPending: (pending: boolean) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: createInitialState(),
  animating: false,
  connection: null,
  pendingState: null,
  txPending: false,

  setConnection: (connection) => {
    set({ connection });
  },

  receiveState: (gameState) => {
    const { gameState: prev, animating } = get();
    const shouldAnimate = gameState.lastResult &&
      gameState.lastResult !== prev.lastResult &&
      gameState.shotHistory.length > prev.shotHistory.length;

    if (shouldAnimate) {
      const animState: GameState = {
        ...prev,
        lastResult: gameState.lastResult,
        shotHistory: gameState.shotHistory,
      };
      set({
        gameState: animState,
        animating: true,
        pendingState: gameState,
        txPending: false,
      });
    } else if (animating) {
      set({ pendingState: gameState, txPending: false });
    } else {
      set({ gameState, txPending: false });
    }
  },

  chooseTarget: async (target) => {
    const { connection, animating, gameState, txPending } = get();
    if (animating || txPending || gameState.phase !== 'choosingTarget') return;
    if (connection) {
      // Solana txs have brief latency, show pending state
      if (connection.solanaMode) {
        set({ txPending: true });
      }
      try {
        await connection.chooseTarget(target);
      } catch {
        set({ txPending: false });
      }
    }
  },

  respondWithCard: async (cardType) => {
    const { connection, animating, gameState, txPending } = get();
    if (animating || txPending || gameState.phase !== 'respondingCard') return;
    if (connection) {
      if (connection.solanaMode) {
        set({ txPending: true });
      }
      try {
        await connection.playCard(cardType);
      } catch {
        set({ txPending: false });
      }
    }
  },

  setAnimating: (animating) => {
    if (!animating) {
      const pending = get().pendingState;
      if (pending) {
        set({ animating: false, gameState: pending, pendingState: null });
        return;
      }
    }
    set({ animating });
  },

  setTxPending: (txPending) => {
    set({ txPending });
  },

  resetGame: () => {
    const { connection } = get();
    if (connection) connection.close();
    set({
      gameState: createInitialState(),
      animating: false,
      connection: null,
      pendingState: null,
      txPending: false,
    });
  },
}));
