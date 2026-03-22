/**
 * MagicBlock Private Ephemeral Rollups (PER) Helpers
 *
 * Client-side utilities for PER connection routing.
 * Account delegation/undelegation is handled server-side via CPI
 * (the CipherShot program invoke_signed into the delegation program).
 */

import { Connection } from '@solana/web3.js';

const PER_ENDPOINT = import.meta.env.VITE_PER_ENDPOINT || '';

/**
 * Get a connection to the PER endpoint for shielded transactions.
 * Falls back to regular RPC if PER is not configured.
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

/**
 * Check if PER mode is enabled (endpoint configured).
 */
export function isPerEnabled(): boolean {
  return !!PER_ENDPOINT;
}
