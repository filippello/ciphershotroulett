/**
 * Solana Account Listener for CipherShot
 *
 * Subscribes to MatchConfig account changes on Solana (or PER endpoint)
 * and relays state updates to WebSocket clients.
 * Replaces the old Ethereum contractListener.ts.
 */

import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import type { GameState, Player, Target, CardType, ShotResult, ShotType } from '../src/game/core/types.js';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PER_ENDPOINT = process.env.PER_ENDPOINT || '';
const PROGRAM_ID = new PublicKey(
  process.env.CIPHERSHOT_PROGRAM_ID || 'DMg6pfojshfqeUBbhwPKsTVbFFoppVm2QrctF1WfzXWn'
);

// Phase enum matching on-chain state
const PHASE_MAP: Record<number, GameState['phase']> = {
  0: 'choosingTarget',
  1: 'respondingCard',
  2: 'resolving',
  3: 'gameOver',
};

let connection: Connection | null = null;
let perConnection: Connection | null = null;
let serverKeypair: Keypair | null = null;
const subscriptions = new Map<string, number>(); // matchPda -> subscriptionId

// create_match discriminator from IDL
const CREATE_MATCH_DISCRIMINATOR = Buffer.from([107, 2, 184, 145, 70, 142, 17, 165]);

export interface MatchStateUpdate {
  matchId: string;
  matchPda: string;
  gameState: GameState;
}

/**
 * Initialize the Solana listener.
 * Returns true if Solana mode is available (program ID is configured).
 */
export function initSolanaListener(): boolean {
  if (!process.env.CIPHERSHOT_PROGRAM_ID) {
    console.log('[Solana] No CIPHERSHOT_PROGRAM_ID configured — running in legacy mode');
    return false;
  }

  connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  if (PER_ENDPOINT) {
    perConnection = new Connection(PER_ENDPOINT, 'confirmed');
  }

  // Load server keypair for signing match creation transactions
  const keypairPath = process.env.SERVER_KEYPAIR_PATH || `${process.env.HOME}/.config/solana/payer.json`;
  try {
    const raw = JSON.parse(readFileSync(keypairPath, 'utf-8'));
    serverKeypair = Keypair.fromSecretKey(Uint8Array.from(raw));
    console.log(`[Solana] Server keypair: ${serverKeypair.publicKey.toBase58()}`);
  } catch (err) {
    console.error(`[Solana] Failed to load keypair from ${keypairPath}:`, err);
    return false;
  }

  console.log(`[Solana] Listening to CipherShot program: ${PROGRAM_ID.toBase58()}`);
  console.log(`[Solana] RPC: ${SOLANA_RPC_URL}`);
  if (PER_ENDPOINT) console.log(`[Solana] PER: ${PER_ENDPOINT}`);

  return true;
}

/**
 * Create a match on-chain by sending a create_match transaction.
 * Returns the matchPda base58 string, or null on failure.
 */
export async function createMatchOnChain(
  playerA: string,
  playerB: string,
): Promise<{ matchPda: string; matchId: Buffer } | null> {
  if (!connection || !serverKeypair) {
    console.error('[Solana] Not initialized');
    return null;
  }

  const conn = perConnection || connection;
  const payer = serverKeypair;

  // Generate a unique 32-byte match_id
  const matchId = randomBytes(32);

  // Derive all PDAs
  const [matchPda] = getMatchPda(matchId);
  const playerAPubkey = new PublicKey(playerA);
  const playerBPubkey = new PublicKey(playerB);
  const [chamberPda] = getChamberPda(matchPda);
  const [playerACardsPda] = getPlayerCardsPda(matchPda, playerAPubkey);
  const [playerBCardsPda] = getPlayerCardsPda(matchPda, playerBPubkey);
  const [pendingActionPda] = getPendingActionPda(matchPda);

  // Build instruction data: discriminator(8) + match_id(32)
  const data = Buffer.concat([CREATE_MATCH_DISCRIMINATOR, matchId]);

  const ix = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: matchPda, isSigner: false, isWritable: true },
      { pubkey: chamberPda, isSigner: false, isWritable: true },
      { pubkey: playerAPubkey, isSigner: false, isWritable: false },
      { pubkey: playerBPubkey, isSigner: false, isWritable: false },
      { pubkey: playerACardsPda, isSigner: false, isWritable: true },
      { pubkey: playerBCardsPda, isSigner: false, isWritable: true },
      { pubkey: pendingActionPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  };

  const tx = new Transaction().add(ix);

  try {
    const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: 'confirmed' });
    console.log(`[Solana] Match created on-chain: ${matchPda.toBase58()} (tx: ${sig.slice(0, 16)}...)`);
    return { matchPda: matchPda.toBase58(), matchId };
  } catch (err) {
    console.error('[Solana] create_match tx failed:', err);
    return null;
  }
}

export function getConnection(): Connection {
  if (!connection) throw new Error('Solana listener not initialized');
  return connection;
}

export function getPerConnection(): Connection {
  return perConnection || getConnection();
}

// PDA derivation helpers
export function getMatchPda(seed: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('match'), seed],
    PROGRAM_ID,
  );
}

export function getChamberPda(matchPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('chamber'), matchPda.toBuffer()],
    PROGRAM_ID,
  );
}

export function getPlayerCardsPda(matchPda: PublicKey, player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('cards'), matchPda.toBuffer(), player.toBuffer()],
    PROGRAM_ID,
  );
}

export function getPendingActionPda(matchPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('action'), matchPda.toBuffer()],
    PROGRAM_ID,
  );
}

export function getRoundResultPda(matchPda: PublicKey, shotIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('result'), matchPda.toBuffer(), Buffer.from([shotIndex])],
    PROGRAM_ID,
  );
}

/**
 * Subscribe to a match's MatchConfig account changes.
 * Fetches RoundResult accounts to build shot history for animations.
 */
export function subscribeToMatch(
  matchPdaStr: string,
  playerA: string,
  playerB: string,
  onUpdate: (state: MatchStateUpdate) => void,
): void {
  const conn = perConnection || connection;
  if (!conn) return;

  const matchPda = new PublicKey(matchPdaStr);

  const subId = conn.onAccountChange(
    matchPda,
    async (accountInfo) => {
      try {
        const info = deserializeMatchConfig(accountInfo.data as Buffer);

        // Fetch all RoundResult accounts up to currentShotIndex
        const roundResults = await fetchRoundResults(conn, matchPda, info.currentShotIndex, info.playerA, info.playerB);

        const gameState = matchInfoToGameState(info, playerA, playerB, roundResults);

        onUpdate({
          matchId: matchPdaStr,
          matchPda: matchPdaStr,
          gameState,
        });
      } catch (err) {
        console.error(`[Solana] Failed to deserialize MatchConfig:`, err);
      }
    },
    'confirmed',
  );

  subscriptions.set(matchPdaStr, subId);
  console.log(`[Solana] Subscribed to match: ${matchPdaStr.slice(0, 12)}...`);
}

/**
 * Fetch all RoundResult accounts for a match.
 */
async function fetchRoundResults(
  conn: Connection,
  matchPda: PublicKey,
  currentShotIndex: number,
  playerA: string,
  playerB: string,
): Promise<RoundResultInfo[]> {
  const results: RoundResultInfo[] = [];

  // Fetch results for all completed rounds (0..currentShotIndex-1)
  // If phase is choosingTarget and index > 0, the previous round was resolved
  for (let i = 0; i < currentShotIndex; i++) {
    try {
      const [resultPda] = getRoundResultPda(matchPda, i);
      const accountInfo = await conn.getAccountInfo(resultPda);
      if (accountInfo?.data) {
        const result = deserializeRoundResult(accountInfo.data as Buffer);
        results.push(result);
      }
    } catch {
      // Result may not exist yet
    }
  }

  // Also try fetching the result at currentShotIndex (just resolved)
  try {
    const [resultPda] = getRoundResultPda(matchPda, currentShotIndex);
    const accountInfo = await conn.getAccountInfo(resultPda);
    if (accountInfo?.data) {
      const result = deserializeRoundResult(accountInfo.data as Buffer);
      // Only add if not already included
      if (!results.some(r => r.shotIndex === result.shotIndex)) {
        results.push(result);
      }
    }
  } catch { /* may not exist */ }

  return results;
}

interface RoundResultInfo {
  shooter: string;
  finalTarget: string;
  killed: boolean;
  cardPlayed: number;
  shotIndex: number;
}

function deserializeRoundResult(data: Buffer): RoundResultInfo {
  let offset = 8; // skip discriminator
  const shooter = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const finalTarget = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const killed = data[offset] === 1;
  offset += 1;
  const cardPlayed = data[offset];
  offset += 1;
  const shotIndex = data[offset];
  return { shooter, finalTarget, killed, cardPlayed, shotIndex };
}

/**
 * Unsubscribe from a match.
 */
export function unsubscribeFromMatch(matchPdaStr: string): void {
  const conn = perConnection || connection;
  if (!conn) return;

  const subId = subscriptions.get(matchPdaStr);
  if (subId !== undefined) {
    conn.removeAccountChangeListener(subId);
    subscriptions.delete(matchPdaStr);
  }
}

interface OnChainMatchInfo {
  playerA: string;
  playerB: string;
  phase: number;
  currentShooter: string;
  currentShotIndex: number;
  selectedTarget: number;
  playerAAlive: boolean;
  playerBAlive: boolean;
  winner: string;
}

function deserializeMatchConfig(data: Buffer): OnChainMatchInfo {
  let offset = 8; // skip discriminator

  // match_id: [u8; 32]
  offset += 32;

  const playerA = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const playerB = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const currentShooter = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const phase = data[offset];
  offset += 1;

  const currentShotIndex = data[offset];
  offset += 1;

  const selectedTarget = data[offset];
  offset += 1;

  const playerAAlive = data[offset] === 1;
  offset += 1;

  const playerBAlive = data[offset] === 1;
  offset += 1;

  const winner = new PublicKey(data.subarray(offset, offset + 32)).toBase58();

  return { playerA, playerB, phase, currentShooter, currentShotIndex, selectedTarget, playerAAlive, playerBAlive, winner };
}

function matchInfoToGameState(
  info: OnChainMatchInfo,
  expectedPlayerA: string,
  expectedPlayerB: string,
  roundResults: RoundResultInfo[] = [],
): GameState {
  const shooterRole: Player = info.currentShooter === info.playerA ? 'player1' : 'player2';
  const phase = PHASE_MAP[info.phase] || 'choosingTarget';

  const targetMap = (val: number): Target | null => val === 0 ? 'self' : val === 1 ? 'opponent' : null;
  const cardTypeMap: Record<number, CardType | null> = { 0: null, 1: 'bluff', 2: 'redirect' };

  let winner: Player | null = null;
  if (info.winner !== PublicKey.default.toBase58()) {
    winner = info.winner === info.playerA ? 'player1' : 'player2';
  }

  // Build shot history from round results
  const shotHistory: import('../src/game/core/types.js').ShotResult[] = roundResults.map((r) => {
    const rShooterRole: Player = r.shooter === info.playerA ? 'player1' : 'player2';
    const rTargetRole: Player = r.finalTarget === info.playerA ? 'player1' : 'player2';
    return {
      shotType: (r.killed ? 'live' : 'blank') as import('../src/game/core/types.js').ShotType,
      shooter: rShooterRole,
      originalTarget: (rShooterRole === rTargetRole ? 'self' : 'opponent') as Target,
      cardPlayed: cardTypeMap[r.cardPlayed] ?? null,
      finalTarget: rTargetRole,
      killed: r.killed,
    };
  });

  const lastResult = shotHistory.length > 0 ? shotHistory[shotHistory.length - 1] : null;

  // Track card usage from history
  const p1Cards = buildPlayerCards(shotHistory, 'player1');
  const p2Cards = buildPlayerCards(shotHistory, 'player2');

  return {
    phase,
    currentShooter: shooterRole,
    chamber: Array(7).fill('blank') as GameState['chamber'],
    currentShotIndex: info.currentShotIndex,
    players: {
      player1: { cards: p1Cards, alive: info.playerAAlive },
      player2: { cards: p2Cards, alive: info.playerBAlive },
    },
    selectedTarget: targetMap(info.selectedTarget),
    respondedCard: null,
    lastResult,
    winner,
    shotHistory,
  };
}

function buildPlayerCards(history: import('../src/game/core/types.js').ShotResult[], role: Player) {
  let bluffsUsed = 0;
  let redirectsUsed = 0;

  for (const r of history) {
    const responder: Player = r.shooter === 'player1' ? 'player2' : 'player1';
    if (responder === role && r.cardPlayed) {
      if (r.cardPlayed === 'bluff') bluffsUsed++;
      if (r.cardPlayed === 'redirect') redirectsUsed++;
    }
  }

  const cards = [];
  for (let i = 0; i < 3; i++) {
    cards.push({ id: `bluff-${i}`, type: 'bluff' as CardType, used: i < bluffsUsed });
  }
  for (let i = 0; i < 2; i++) {
    cards.push({ id: `redirect-${i}`, type: 'redirect' as CardType, used: i < redirectsUsed });
  }
  return cards;
}

