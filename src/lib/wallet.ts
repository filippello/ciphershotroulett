/**
 * Solana Wallet Integration for CipherShot
 *
 * Detects Phantom, Solflare, or Backpack — explicitly skips MetaMask's
 * Solana proxy (which injects window.solana but doesn't actually work).
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Get the real Solana wallet provider, preferring Phantom > Solflare > Backpack.
 * MetaMask injects a fake window.solana — we skip it by checking isPhantom.
 */
function getProvider(): any {
  if (typeof window === 'undefined') return null;
  // Phantom injects window.phantom.solana (preferred) and window.solana
  const phantom = (window as any).phantom?.solana;
  if (phantom?.isPhantom) return phantom;
  // Fallback: window.solana if it's actually Phantom (not MetaMask proxy)
  const solana = (window as any).solana;
  if (solana?.isPhantom) return solana;
  // Solflare
  const solflare = (window as any).solflare;
  if (solflare?.isSolflare) return solflare;
  // Backpack
  const backpack = (window as any).backpack;
  if (backpack) return backpack;
  return null;
}

export function hasWalletProvider(): boolean {
  return !!getProvider();
}

export async function connectWallet(): Promise<{ address: string }> {
  const provider = getProvider();
  if (!provider) {
    throw new Error('No Solana wallet detected. Install Phantom, Solflare, or Backpack.');
  }

  const resp = await provider.connect();
  const pubkey: PublicKey = resp.publicKey;
  return { address: pubkey.toBase58() };
}

export { getProvider };

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}
