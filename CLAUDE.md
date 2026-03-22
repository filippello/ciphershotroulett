# CipherShot

## Stack
Vite + React + Phaser 3 + Zustand + TypeScript + Solana + MagicBlock PER (Private Ephemeral Rollups)

## Dev server
```bash
npm run dev
```
Listens on `0.0.0.0:3000`. External port: 9000 (devcontainer Docker mapping).

## Architecture
- `src/game/core/` — pure game logic (no rendering)
- `src/game/phaser/` — Phaser scenes and rendering
- `src/components/` — React UI overlays
- `programs/ciphershot/` — Anchor/Solana program (Rust) with BOLT ECS pattern

## Solana/PER Integration
- **Program**: `programs/ciphershot/` — match state, chamber, cards, resolution in Rust
- **Client Solana**: `src/lib/solana.ts` — Anchor program client (PDA derivation, instructions)
- **Client PER**: `src/lib/per.ts` — MagicBlock delegation helpers
- **Server**: Dual-mode — legacy (in-memory engine) or Solana (account subscription relay)
- **Config**: Set `CIPHERSHOT_PROGRAM_ID`, `SOLANA_RPC_URL`, `PER_ENDPOINT` env vars for Solana mode

## Privacy via TEE (not FHE)
Card plays are sent as **plaintext** to the PER endpoint. The Intel TDX Trusted Execution Environment
shields data from opponents and node operators — no client-side encryption needed.
- Chamber order: plaintext inside TEE, never leaves enclave
- Card plays: plaintext to PER, TEE shields from opponent
- Resolution: normal Rust if/match inside TEE (10-50ms vs multi-second FHE)
- Results: TEE writes directly to public account (no separate finalize/decrypt step)

## Solana Mode
When `CIPHERSHOT_PROGRAM_ID` env var is set on the server, it runs in Solana mode:
- Matchmaking creates on-chain matches (PDAs delegated to PER)
- `chooseTarget()` → Anchor instruction via PER
- `playCard()` → plaintext card via PER → TEE resolves privately
- Results written to RoundResult accounts (public after resolution)
- Without the env var, the game runs in legacy mode (in-memory, no blockchain)

## Constraints
- **Do NOT use Next.js** — consumes ~2GB RAM, exceeds this container's limit. Vite uses ~100MB.
- Keep dependencies minimal to stay within container memory.

## Solana program
```bash
cd programs/ciphershot
anchor build
anchor test
anchor deploy --provider.cluster devnet
```

## Environment Variables
### Client (VITE_ prefix)
- `VITE_CIPHERSHOT_PROGRAM_ID` — Deployed program ID
- `VITE_SOLANA_RPC_URL` — Solana RPC (default: devnet)
- `VITE_PER_ENDPOINT` — MagicBlock PER URL
- `VITE_WS_URL` — WebSocket server URL

### Server
- `CIPHERSHOT_PROGRAM_ID` — If set, enables Solana mode
- `SOLANA_RPC_URL` — Solana RPC endpoint
- `PER_ENDPOINT` — MagicBlock PER URL
- `PORT` — Server port (default: 3001)
