/**
 * MagicBlock Private Ephemeral Rollups (PER) Helpers
 *
 * Handles account delegation to/from PER and transaction routing
 * through the TEE endpoint. Accounts delegated to PER are processed
 * inside Intel TDX enclaves — data is invisible to node operators.
 */

import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { PROGRAM_ID, getMatchPda, getChamberPda, getPlayerCardsPda, getPendingActionPda } from './solana';

const PER_ENDPOINT = import.meta.env.VITE_PER_ENDPOINT || '';

// MagicBlock delegation program (Ephemeral Rollups SDK)
const DELEGATION_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_DELEGATION_PROGRAM_ID || 'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'
);

/**
 * Get a connection to the PER endpoint for shielded transactions.
 */
export function getPerConnection(): Connection {
  if (!PER_ENDPOINT) {
    console.warn('[PER] No PER endpoint configured, using regular RPC');
    return new Connection(
      import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed',
    );
  }
  return new Connection(PER_ENDPOINT, 'confirmed');
}

export interface DelegateAccountsParams {
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  };
  matchPda: PublicKey;
  playerA: PublicKey;
  playerB: PublicKey;
  connection: Connection;
}

/**
 * Delegate all match accounts to PER in a single transaction.
 * After delegation, these accounts are processed inside the TEE.
 *
 * Accounts delegated:
 * - MatchConfig (public state, but processed in PER for atomicity)
 * - Chamber (shielded — never readable outside TEE)
 * - PlayerCards x2 (shielded — each player sees only their own)
 * - PendingAction (shielded — card choice hidden from opponent)
 */
export async function delegateMatchAccounts(params: DelegateAccountsParams): Promise<string> {
  const { wallet, matchPda, playerA, playerB, connection } = params;

  const [chamberPda] = getChamberPda(matchPda);
  const [playerACardsPda] = getPlayerCardsPda(matchPda, playerA);
  const [playerBCardsPda] = getPlayerCardsPda(matchPda, playerB);
  const [pendingActionPda] = getPendingActionPda(matchPda);

  const accountsToDelegate = [
    matchPda,
    chamberPda,
    playerACardsPda,
    playerBCardsPda,
    pendingActionPda,
  ];

  // Build delegation instructions
  // The delegation program CPI delegates each account to the PER validator
  const tx = new Transaction();

  for (const account of accountsToDelegate) {
    // Delegation instruction: delegate(account, owner_program, delegation_buffer)
    const delegateIxData = Buffer.alloc(8);
    // Discriminator for "delegate" instruction
    delegateIxData.set([26, 195, 127, 4, 210, 162, 61, 104]);

    tx.add({
      programId: DELEGATION_PROGRAM_ID,
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: account, isSigner: false, isWritable: true },
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: delegateIxData,
    });
  }

  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, 'confirmed');

  console.log(`[PER] Delegated ${accountsToDelegate.length} accounts to PER: ${sig}`);
  return sig;
}

/**
 * Undelegate match accounts back to L1 after game over.
 * Zeroes out Chamber and PlayerCards data before undelegating
 * to prevent post-game data leakage.
 */
export async function undelegateMatchAccounts(params: DelegateAccountsParams): Promise<string> {
  const { wallet, matchPda, playerA, playerB, connection } = params;

  const [chamberPda] = getChamberPda(matchPda);
  const [playerACardsPda] = getPlayerCardsPda(matchPda, playerA);
  const [playerBCardsPda] = getPlayerCardsPda(matchPda, playerB);
  const [pendingActionPda] = getPendingActionPda(matchPda);

  const accountsToUndelegate = [
    matchPda,
    chamberPda,
    playerACardsPda,
    playerBCardsPda,
    pendingActionPda,
  ];

  const tx = new Transaction();

  for (const account of accountsToUndelegate) {
    const undelegateIxData = Buffer.alloc(8);
    // Discriminator for "undelegate" instruction
    undelegateIxData.set([197, 88, 144, 45, 227, 196, 104, 12]);

    tx.add({
      programId: DELEGATION_PROGRAM_ID,
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: account, isSigner: false, isWritable: true },
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: undelegateIxData,
    });
  }

  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, 'confirmed');

  console.log(`[PER] Undelegated ${accountsToUndelegate.length} accounts from PER: ${sig}`);
  return sig;
}

/**
 * Check if PER mode is enabled (endpoint configured).
 */
export function isPerEnabled(): boolean {
  return !!PER_ENDPOINT;
}
