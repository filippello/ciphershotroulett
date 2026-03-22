/**
 * Solana Program Client for CipherShot
 *
 * Typed helpers for on-chain game actions via Anchor.
 * Transactions are routed through the PER endpoint (MagicBlock Private Ephemeral Rollups)
 * so card plays remain private inside the TEE — no client-side encryption needed.
 */

import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import type { GameState, Player, Target, CardType, ShotResult, ShotType } from '@/game/core/types';

// Program ID — set after deployment
export const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_CIPHERSHOT_PROGRAM_ID || 'DMg6pfojshfqeUBbhwPKsTVbFFoppVm2QrctF1WfzXWn'
);

const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PER_ENDPOINT = import.meta.env.VITE_PER_ENDPOINT || '';

// Phase enum matching on-chain state
const PHASE_MAP: Record<number, GameState['phase']> = {
  0: 'choosingTarget',
  1: 'respondingCard',
  2: 'resolving',
  3: 'gameOver',
};

export function getConnection(): Connection {
  return new Connection(RPC_URL, 'confirmed');
}

export function getPerConnection(): Connection {
  if (!PER_ENDPOINT) return getConnection();
  return new Connection(PER_ENDPOINT, 'confirmed');
}

// PDA derivation helpers
export function getMatchPda(matchId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('match'), matchId],
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
 * Build a chooseTarget instruction.
 * Target: 0 = self, 1 = opponent.
 */
export async function chooseTargetOnChain(
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  matchPda: PublicKey,
  target: number,
): Promise<string> {
  const connection = getPerConnection();

  // Build instruction data: discriminator(8) + target(1)
  // Anchor discriminator for "choose_target" = sha256("global:choose_target")[0..8]
  const discriminator = Buffer.from([140, 34, 4, 44, 141, 142, 230, 237]); // from IDL
  const data = Buffer.concat([discriminator, Buffer.from([target])]);

  const ix = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: matchPda, isSigner: false, isWritable: true },
    ],
    data,
  };

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
  await connection.confirmTransaction(sig, 'confirmed');

  return sig;
}

/**
 * Build a playCard instruction.
 * Card: 0 = pass, 1 = bluff, 2 = redirect.
 * Sent as plaintext — the TEE protects privacy.
 */
export async function playCardOnChain(
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  matchPda: PublicKey,
  matchConfig: { currentShotIndex: number; playerA: string; playerB: string },
  card: number,
): Promise<string> {
  const connection = getPerConnection();

  const [chamberPda] = getChamberPda(matchPda);
  const [responderCardsPda] = getPlayerCardsPda(matchPda, wallet.publicKey);
  const [pendingActionPda] = getPendingActionPda(matchPda);
  // Single RoundResults account (all results stored in one PDA)
  const [roundResultsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('results'), matchPda.toBuffer()],
    PROGRAM_ID,
  );

  // Anchor discriminator for "play_card" = sha256("global:play_card")[0..8]
  const discriminator = Buffer.from([63, 150, 161, 24, 68, 231, 108, 9]); // from IDL
  const data = Buffer.concat([discriminator, Buffer.from([card])]);

  const ix = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: matchPda, isSigner: false, isWritable: true },
      { pubkey: chamberPda, isSigner: false, isWritable: true },
      { pubkey: responderCardsPda, isSigner: false, isWritable: true },
      { pubkey: pendingActionPda, isSigner: false, isWritable: true },
      { pubkey: roundResultsPda, isSigner: false, isWritable: true },
    ],
    data,
  };

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
  await connection.confirmTransaction(sig, 'confirmed');

  return sig;
}

/**
 * Deserialize on-chain MatchConfig account data into a partial GameState-compatible format.
 */
export interface OnChainMatchInfo {
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

export function deserializeMatchConfig(data: Buffer): OnChainMatchInfo {
  // Skip 8-byte discriminator
  let offset = 8;

  // match_id: [u8; 32]
  offset += 32;

  // player_a: Pubkey (32 bytes)
  const playerA = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  // player_b: Pubkey (32 bytes)
  const playerB = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  // current_shooter: Pubkey (32 bytes)
  const currentShooter = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  // phase: u8
  const phase = data[offset];
  offset += 1;

  // current_shot_index: u8
  const currentShotIndex = data[offset];
  offset += 1;

  // selected_target: u8
  const selectedTarget = data[offset];
  offset += 1;

  // player_a_alive: bool
  const playerAAlive = data[offset] === 1;
  offset += 1;

  // player_b_alive: bool
  const playerBAlive = data[offset] === 1;
  offset += 1;

  // winner: Pubkey (32 bytes)
  const winner = new PublicKey(data.subarray(offset, offset + 32)).toBase58();

  return {
    playerA,
    playerB,
    phase,
    currentShooter,
    currentShotIndex,
    selectedTarget,
    playerAAlive,
    playerBAlive,
    winner,
  };
}

/**
 * Deserialize RoundResult account data.
 */
export function deserializeRoundResult(data: Buffer): {
  shooter: string;
  finalTarget: string;
  killed: boolean;
  cardPlayed: number;
  shotIndex: number;
} {
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
 * Convert on-chain MatchConfig info into a GameState compatible with the frontend store.
 */
export function matchInfoToGameState(
  info: OnChainMatchInfo,
  roundResults: Array<{ shooter: string; finalTarget: string; killed: boolean; cardPlayed: number; shotIndex: number }>,
): GameState {
  const shooterRole: Player = info.currentShooter === info.playerA ? 'player1' : 'player2';
  const phase = PHASE_MAP[info.phase] || 'choosingTarget';

  const cardTypeMap: Record<number, CardType | null> = { 0: null, 1: 'bluff', 2: 'redirect' };
  const targetMap = (val: number): Target | null => val === 0 ? 'self' : val === 1 ? 'opponent' : null;

  // Build shot history from round results
  const shotHistory: ShotResult[] = roundResults.map((r) => {
    const rShooterRole: Player = r.shooter === info.playerA ? 'player1' : 'player2';
    const rTargetRole: Player = r.finalTarget === info.playerA ? 'player1' : 'player2';
    return {
      shotType: (r.killed ? 'live' : 'blank') as ShotType,
      shooter: rShooterRole,
      originalTarget: rShooterRole === rTargetRole ? 'self' as Target : 'opponent' as Target,
      cardPlayed: cardTypeMap[r.cardPlayed] ?? null,
      finalTarget: rTargetRole,
      killed: r.killed,
    };
  });

  // Track card usage from history to build player cards
  const p1Cards = buildPlayerCards(shotHistory, 'player1');
  const p2Cards = buildPlayerCards(shotHistory, 'player2');

  const lastResult = shotHistory.length > 0 ? shotHistory[shotHistory.length - 1] : null;

  // Determine winner
  let winner: Player | null = null;
  if (info.winner !== PublicKey.default.toBase58()) {
    winner = info.winner === info.playerA ? 'player1' : 'player2';
  }

  return {
    phase,
    currentShooter: shooterRole,
    chamber: Array(7).fill('blank') as GameState['chamber'], // Chamber is hidden in PER
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

function buildPlayerCards(history: ShotResult[], role: Player) {
  // Start with 3 bluffs + 2 redirects
  let bluffsUsed = 0;
  let redirectsUsed = 0;

  for (const r of history) {
    // The responder is the non-shooter
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
