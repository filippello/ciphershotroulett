# CipherShot

**On-chain Russian Roulette with private game state via MagicBlock Ephemeral Rollups.**

Two players. One shotgun. Seven rounds. Bluff or redirect — but the chamber order is hidden inside a TEE. Nobody sees it until the trigger is pulled.

**[Play Live](https://ciphershot.vercel.app)**

---

## How It Works

A shotgun is loaded with **7 rounds** in random order: 3 live, 4 blank. Players alternate turns choosing to shoot themselves or their opponent. The defender responds with a card:

| Card | Count | Effect |
|------|-------|--------|
| **Bluff** | x3 | Does nothing — a decoy to confuse your opponent |
| **Redirect** | x2 | Reverses the shot back at the shooter |

Cards are revealed after a 3...2...1 countdown. The game ends when someone gets hit by a live round.

---

## Why Ephemeral Rollups

**The problem**: On-chain games need hidden state (chamber order, card plays), but Solana accounts are public. Traditional approaches use commit-reveal schemes or client-side encryption, adding latency and complexity.

**The ER solution**: MagicBlock Ephemeral Rollups run inside an Intel TDX Trusted Execution Environment. Game accounts are *delegated* from Solana L1 into the ER, where they become private:

- **Chamber order** — shuffled inside TEE at match creation, never leaves the enclave
- **Card plays** — sent as plaintext to the ER endpoint, TEE shields them from the opponent
- **Shot resolution** — normal Rust `if`/`match` logic inside TEE (instant, no FHE overhead)
- **Results** — TEE writes resolved round data to a public account; only outcomes are visible

When the game ends, accounts are undelegated back to L1 with sensitive data zeroed out. The match result lives on-chain permanently.

---

## Architecture

```
┌──────────────┐         ┌───────────────────────────────────┐
│  Solana L1   │         │  MagicBlock Ephemeral Rollup      │
│              │         │  (Intel TDX TEE)                  │
│  create_match│         │                                   │
│  init PDAs   │────────>│  delegate_match_a / _b            │
│              │  deleg  │     ↓                             │
│              │         │  create_match (shuffle chamber)   │
│              │         │  choose_target ──┐                │
│              │         │  play_card ──────┤ game loop      │
│              │         │  (resolve shot)──┘                │
│              │         │     ↓                             │
│              │<────────│  undelegate_match                 │
│  match result│  undeleg│  (zero chamber/cards, return)     │
│  on-chain    │         │                                   │
└──────────────┘         └───────────────────────────────────┘
```

---

## On-Chain Proof

- **Program ID**: [`DMg6pfojshfqeUBbhwPKsTVbFFoppVm2QrctF1WfzXWn`](https://solscan.io/account/DMg6pfojshfqeUBbhwPKsTVbFFoppVm2QrctF1WfzXWn?cluster=devnet)
- **Network**: Solana Devnet + MagicBlock ER
- **Payer Wallet**: [`FJASGessZXm5n3DWvcNEMxkbwi7wvx8XjezY5xoXsAMD`](https://solscan.io/account/FJASGessZXm5n3DWvcNEMxkbwi7wvx8XjezY5xoXsAMD?cluster=devnet)
- **Total Confirmed Transactions**: 20

### Example Transactions

| Type | Signature | What it proves |
|------|-----------|----------------|
| **CreateMatch** | [`2kAyL1y...hfQPe`](https://solscan.io/tx/2kAyL1yHsXpwpMKF6kS7NWFTqzPSEg46eCxb8wSpe3fxeZrm963kcrF6ksABHmtbtaVUSdFzKnrkpRVHfhjhfQPe?cluster=devnet) | Initializes 5 PDAs via SystemProgram — match, chambers, hands |
| **DelegateMatch** | [`35k86ua...vue3k`](https://solscan.io/tx/35k86uaKGqhDKukdtQsSrTxad18ox78xabQ2fdcGdoZC3Gg9bSayH8VptjcWzco5YmgYdULe75yDc8GMcAHvue3k?cluster=devnet) | Batch-delegates 20+ accounts to MagicBlock Ephemeral Rollup |
| **Game via ER** | [`4ApBWsT...2Zcm`](https://solscan.io/tx/4ApBWsTsP4tw3APDKreBJri9ZCFo3v6CcAoF2nuZGsJ8cm574ZRLTLABkcvabKsPa2xxSVY28hvGVcoeNbYX2Zcm?cluster=devnet) | Gameplay instruction routed through delegation program (`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`) |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Client | Vite + React + TypeScript |
| Game Rendering | Phaser 3 (960×540 canvas) |
| State Management | Zustand |
| Blockchain | Solana (Anchor framework) |
| Privacy | MagicBlock `ephemeral-rollups-sdk` (TEE) |
| Server | Node.js WebSocket (real-time relay) |
| Styling | CRT/arcade aesthetic, Press Start 2P font |

---

## Program Architecture

### Instructions

| Instruction | Purpose |
|-------------|---------|
| `create_match` | Init PDAs: MatchConfig, Chamber (Fisher-Yates shuffle), PlayerCards (×2), PendingAction, RoundResults |
| `delegate_match_a` | Delegate batch A to ER: match_config, chamber, player_a_cards |
| `delegate_match_b` | Delegate batch B to ER: player_b_cards, pending_action, round_results |
| `choose_target` | Shooter picks target (0 = self, 1 = opponent) |
| `play_card` | Defender plays card (0 = pass, 1 = bluff, 2 = redirect) → auto-resolves shot |
| `undelegate_match` | Zero sensitive data, return all accounts to L1 |

### Account Structs

| Account | PDA Seeds | Privacy | Contents |
|---------|-----------|---------|----------|
| `MatchConfig` | `["match", match_id]` | Public | Players, phase, shooter, alive status, winner |
| `Chamber` | `["chamber", match_config]` | Shielded in ER | 7 rounds: `[u8; 7]` (1 = live, 0 = blank) |
| `PlayerCards` | `["cards", match_config, player]` | Shielded in ER | Owner, bluff count, redirect count |
| `PendingAction` | `["action", match_config]` | Shielded in ER | Card played this turn |
| `RoundResults` | `["results", match_config]` | Public after resolution | All round outcomes (shooter, target, killed, card, index) |

---

## How to Run

### Prerequisites
- Node.js 18+
- Rust + Anchor CLI (for program development)
- Solana CLI

### Install & Run

```bash
npm install
npm run dev
```

This starts both:
- **Client** on `http://localhost:3000` (Vite)
- **Server** on `ws://localhost:3001` (WebSocket)

### Environment Variables

**Client** (prefix with `VITE_`):
```
VITE_CIPHERSHOT_PROGRAM_ID=DMg6pfojshfqeUBbhwPKsTVbFFoppVm2QrctF1WfzXWn
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_PER_ENDPOINT=<MagicBlock ER URL>
VITE_WS_URL=ws://localhost:3001
```

**Server**:
```
CIPHERSHOT_PROGRAM_ID=DMg6pfojshfqeUBbhwPKsTVbFFoppVm2QrctF1WfzXWn
SOLANA_RPC_URL=https://api.devnet.solana.com
PER_ENDPOINT=<MagicBlock ER URL>
PORT=3001
```

When `CIPHERSHOT_PROGRAM_ID` is set, the server runs in Solana mode. Without it, the game falls back to legacy in-memory mode.

### Build the Program

```bash
cd programs/ciphershot
anchor build
anchor deploy --provider.cluster devnet
```

---

## Privacy Model: TEE, Not FHE

CipherShot deliberately uses **hardware-based privacy** (Intel TDX TEE inside MagicBlock ER) instead of Fully Homomorphic Encryption:

| | TEE (MagicBlock ER) | FHE |
|--|---------------------|-----|
| **Latency** | ~10–50ms per instruction | Multi-second per operation |
| **Logic** | Normal Rust code | Specialized FHE circuits |
| **Client complexity** | Send plaintext to ER | Encrypt inputs client-side |
| **Trust model** | Hardware enclave isolation | Cryptographic guarantee |

The tradeoff is clear: TEE trusts hardware isolation rather than pure cryptography, but delivers real-time gameplay that FHE cannot match. For a game where sub-second resolution matters, this is the right call.

**Zero-on-undelegate**: When accounts return to L1, the `undelegate_match` instruction zeros out chamber data and card counts. Only the match outcome (winner, round results) persists publicly.

---

## License

MIT
