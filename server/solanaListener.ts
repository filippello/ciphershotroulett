/**
 * Solana Account Listener for CipherShot
 *
 * Subscribes to MatchConfig account changes on Solana (or PER endpoint)
 * and relays state updates to WebSocket clients.
 * Replaces the old Ethereum contractListener.ts.
 */

import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
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

// Anchor instruction discriminators (sha256("global:<name>")[0..8])
const CREATE_MATCH_DISCRIMINATOR = Buffer.from([107, 2, 184, 145, 70, 142, 17, 165]);
const DELEGATE_MATCH_A_DISCRIMINATOR = Buffer.from([185, 173, 74, 33, 238, 29, 138, 71]);
const DELEGATE_MATCH_B_DISCRIMINATOR = Buffer.from([1, 45, 49, 218, 105, 174, 131, 94]);
const UNDELEGATE_MATCH_DISCRIMINATOR = Buffer.from([142, 117, 126, 27, 242, 11, 103, 14]);

// MagicBlock programs
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
const MAGIC_PROGRAM_ID = new PublicKey('Magic11111111111111111111111111111111111111');
const MAGIC_CONTEXT_ID = new PublicKey('MagicContext1111111111111111111111111111111');

// Delegation program's top_up_ephemeral_balance discriminator
const TOP_UP_EPHEMERAL_BALANCE_DISCRIMINATOR = Buffer.from([9, 0, 0, 0, 0, 0, 0, 0]);

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
    // MagicBlock ER needs explicit WebSocket endpoint for subscriptions
    const wsEndpoint = PER_ENDPOINT.replace('https://', 'wss://').replace('http://', 'ws://');
    perConnection = new Connection(PER_ENDPOINT, {
      commitment: 'confirmed',
      wsEndpoint,
    });
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

  // create_match MUST go to L1 — accounts don't exist on ER yet
  const conn = connection;
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

  // Derive RoundResults PDA (single account for all results)
  const [roundResultsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('results'), matchPda.toBuffer()],
    PROGRAM_ID,
  );

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
      { pubkey: roundResultsPda, isSigner: false, isWritable: true },
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

// Delegation PDA helpers (derived from the delegation program)
function getDelegationBufferPda(account: PublicKey): [PublicKey, number] {
  // Buffer PDA is derived from the OWNER program (CipherShot), not the delegation program
  return PublicKey.findProgramAddressSync(
    [Buffer.from('buffer'), account.toBuffer()],
    PROGRAM_ID,
  );
}

function getDelegationRecordPda(account: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('delegation'), account.toBuffer()],
    DELEGATION_PROGRAM_ID,
  );
}

function getDelegationMetadataPda(account: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('delegation-metadata'), account.toBuffer()],
    DELEGATION_PROGRAM_ID,
  );
}

/**
 * Build the accounts for a single "del" field in the #[delegate] macro expansion.
 * For each del field X, the macro generates: buffer_X, delegation_record_X, delegation_metadata_X, X
 */
function buildDelFieldAccounts(pda: PublicKey): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] {
  const [buffer] = getDelegationBufferPda(pda);
  const [record] = getDelegationRecordPda(pda);
  const [metadata] = getDelegationMetadataPda(pda);
  return [
    { pubkey: buffer, isSigner: false, isWritable: true },
    { pubkey: record, isSigner: false, isWritable: true },
    { pubkey: metadata, isSigner: false, isWritable: true },
    { pubkey: pda, isSigner: false, isWritable: true },
  ];
}

/**
 * Top up ephemeral balance for a player on the ER.
 * This allows the player to pay tx fees on the Ephemeral Rollup.
 */
export async function topUpEphemeralBalance(
  player: PublicKey,
  lamports: number = 100_000_000, // 0.1 SOL
): Promise<string | null> {
  if (!connection || !serverKeypair) return null;

  const payer = serverKeypair;
  const index = 0;

  // Ephemeral balance PDA: ["balance", player, index] @ DELEGATION_PROGRAM_ID
  const [ephemeralBalancePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('balance'), player.toBuffer(), Buffer.from([index])],
    DELEGATION_PROGRAM_ID,
  );

  // Data: discriminator(8) + amount(u64 LE) + index(u8)
  const data = Buffer.alloc(17);
  TOP_UP_EPHEMERAL_BALANCE_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(BigInt(lamports), 8);
  data[16] = index;

  const ix = {
    programId: DELEGATION_PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: player, isSigner: false, isWritable: false },
      { pubkey: ephemeralBalancePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  };

  const tx = new Transaction().add(ix);

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed' });
    console.log(`[Solana] Topped up ephemeral balance for ${player.toBase58().slice(0, 8)}...: ${sig.slice(0, 16)}...`);
    return sig;
  } catch (err: any) {
    console.error('[Solana] top_up_ephemeral_balance failed:', err?.message || err);
    return null;
  }
}

/**
 * Delegate all match accounts to MagicBlock Ephemeral Rollups.
 * Uses the #[delegate] macro from ephemeral-rollups-sdk.
 *
 * Account layout (expanded by macro):
 *   payer
 * Split into two txs (A + B) to avoid stack overflow (3 del fields each).
 */
export async function delegateMatchAccounts(
  matchPda: PublicKey,
  matchId: Buffer,
  playerA: PublicKey,
  playerB: PublicKey,
): Promise<string | null> {
  if (!connection || !serverKeypair) {
    console.error('[Solana] Not initialized for delegation');
    return null;
  }

  if (!PER_ENDPOINT) {
    console.log('[Solana] PER_ENDPOINT not configured, skipping delegation');
    return null;
  }

  const payer = serverKeypair;
  const [chamberPda] = getChamberPda(matchPda);
  const [playerACardsPda] = getPlayerCardsPda(matchPda, playerA);
  const [playerBCardsPda] = getPlayerCardsPda(matchPda, playerB);
  const [pendingActionPda] = getPendingActionPda(matchPda);
  const [roundResultsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('results'), matchPda.toBuffer()],
    PROGRAM_ID,
  );

  // === Batch A: match_config, chamber, player_a_cards ===
  const dataA = Buffer.concat([
    DELEGATE_MATCH_A_DISCRIMINATOR,
    matchId,              // match_id: [u8; 32]
    playerA.toBuffer(),   // player_a: Pubkey
  ]);

  const ixA = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      ...buildDelFieldAccounts(matchPda),
      ...buildDelFieldAccounts(chamberPda),
      ...buildDelFieldAccounts(playerACardsPda),
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: dataA,
  };

  const txA = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }))
    .add(ixA);

  try {
    const sigA = await sendAndConfirmTransaction(connection, txA, [payer], { commitment: 'confirmed' });
    console.log(`[Solana] Batch A delegated: ${sigA.slice(0, 16)}...`);
  } catch (err: any) {
    if (err?.logs) console.error('[Solana] delegate_match_a logs:', err.logs);
    console.error('[Solana] delegate_match_a failed:', err?.message || err);
    return null;
  }

  // === Batch B: player_b_cards, pending_action, round_results ===
  const dataB = Buffer.concat([
    DELEGATE_MATCH_B_DISCRIMINATOR,
    matchPda.toBuffer(),  // match_key: Pubkey
    playerB.toBuffer(),   // player_b: Pubkey
  ]);

  const ixB = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      ...buildDelFieldAccounts(playerBCardsPda),
      ...buildDelFieldAccounts(pendingActionPda),
      ...buildDelFieldAccounts(roundResultsPda),
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: dataB,
  };

  const txB = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }))
    .add(ixB);

  try {
    const sigB = await sendAndConfirmTransaction(connection, txB, [payer], { commitment: 'confirmed' });
    console.log(`[Solana] Batch B delegated: ${sigB.slice(0, 16)}...`);
    return sigB;
  } catch (err: any) {
    if (err?.logs) console.error('[Solana] delegate_match_b logs:', err.logs);
    console.error('[Solana] delegate_match_b failed:', err?.message || err);
    return null;
  }
}

/**
 * Zero out sensitive match data via undelegate_match instruction.
 * Sent to ER endpoint. Actual undelegation is handled by ER infrastructure.
 */
export async function undelegateMatchAccounts(
  matchPda: PublicKey,
  playerA: PublicKey,
  playerB: PublicKey,
): Promise<string | null> {
  const conn = perConnection || connection;
  if (!conn || !serverKeypair) {
    console.error('[Solana] Not initialized for undelegation');
    return null;
  }

  const payer = serverKeypair;
  const [chamberPda] = getChamberPda(matchPda);
  const [playerACardsPda] = getPlayerCardsPda(matchPda, playerA);
  const [playerBCardsPda] = getPlayerCardsPda(matchPda, playerB);
  const [pendingActionPda] = getPendingActionPda(matchPda);

  const ix = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: matchPda, isSigner: false, isWritable: true },
      { pubkey: chamberPda, isSigner: false, isWritable: true },
      { pubkey: playerACardsPda, isSigner: false, isWritable: true },
      { pubkey: playerBCardsPda, isSigner: false, isWritable: true },
      { pubkey: pendingActionPda, isSigner: false, isWritable: true },
      // Auto-added by #[commit] macro
      { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
      { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: UNDELEGATE_MATCH_DISCRIMINATOR,
  };

  const tx = new Transaction().add(ix);

  try {
    const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: 'confirmed' });
    console.log(`[Solana] Match data zeroed: ${sig.slice(0, 16)}...`);
    return sig;
  } catch (err) {
    console.error('[Solana] undelegate_match tx failed:', err);
    return null;
  }
}

const pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Subscribe to a match's MatchConfig account changes.
 * Uses WebSocket subscription + polling fallback for ER compatibility.
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
  let lastShotIndex = -1;
  let lastPhase = -1;

  const processUpdate = async () => {
    try {
      const accountInfo = await conn.getAccountInfo(matchPda);
      if (!accountInfo?.data) return;

      const info = deserializeMatchConfig(accountInfo.data as Buffer);

      // Only broadcast if state actually changed
      if (info.currentShotIndex === lastShotIndex && info.phase === lastPhase) return;
      lastShotIndex = info.currentShotIndex;
      lastPhase = info.phase;

      const roundResults = await fetchRoundResults(conn, matchPda, info.currentShotIndex, info.playerA, info.playerB);
      const gameState = matchInfoToGameState(info, playerA, playerB, roundResults);

      console.log(`[Solana] Match update: phase=${info.phase} shot=${info.currentShotIndex}`);

      onUpdate({
        matchId: matchPdaStr,
        matchPda: matchPdaStr,
        gameState,
      });
    } catch (err) {
      // Account might not be ready yet on ER
    }
  };

  // Try WebSocket subscription
  const subId = conn.onAccountChange(
    matchPda,
    async () => { await processUpdate(); },
    'confirmed',
  );
  subscriptions.set(matchPdaStr, subId);

  // Also poll every 2s as fallback (ER WebSocket may not work)
  const interval = setInterval(processUpdate, 2000);
  pollingIntervals.set(matchPdaStr, interval);

  console.log(`[Solana] Subscribed to match: ${matchPdaStr.slice(0, 12)}... (ws + polling)`);
}

/**
 * Fetch round results from the single RoundResults account.
 */
async function fetchRoundResults(
  conn: Connection,
  matchPda: PublicKey,
  currentShotIndex: number,
  playerA: string,
  playerB: string,
): Promise<RoundResultInfo[]> {
  const results: RoundResultInfo[] = [];

  try {
    const [roundResultsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('results'), matchPda.toBuffer()],
      PROGRAM_ID,
    );
    const accountInfo = await conn.getAccountInfo(roundResultsPda);
    if (!accountInfo?.data) return results;

    const data = accountInfo.data as Buffer;
    // Skip 8-byte discriminator, then read entries (67 bytes each)
    const count = data[8 + 469]; // count field after data array
    const ENTRY_SIZE = 67;

    for (let i = 0; i < count && i < 7; i++) {
      const offset = 8 + i * ENTRY_SIZE;
      const shooter = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
      const finalTarget = new PublicKey(data.subarray(offset + 32, offset + 64)).toBase58();
      const killed = data[offset + 64] === 1;
      const cardPlayed = data[offset + 65];
      const shotIndex = data[offset + 66];
      results.push({ shooter, finalTarget, killed, cardPlayed, shotIndex });
    }
  } catch {
    // Account may not be available yet
  }

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

  const interval = pollingIntervals.get(matchPdaStr);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(matchPdaStr);
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

