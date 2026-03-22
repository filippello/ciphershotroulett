# CipherShot — Zama fhEVM Integration Guide

## 1. Why FHE?

Currently the game has **two trust problems**:

1. **Chamber**: Shuffled in plaintext on the server — the server knows every round
2. **Cards**: When a player plays bluff or redirect, the opponent sees it immediately — bluff is pointless if the shooter knows it's a bluff

With **Zama fhEVM**, both the chamber AND the card played are **encrypted on-chain**:

- **Nobody** sees the chamber until each round is revealed
- **Nobody** sees what card the responder played until the shot resolves
- The shooter doesn't know if they got redirected or bluffed → real mind games
- The result (killed/not, final target) is the ONLY thing revealed

This is what makes the game actually strategic: you play a card face-down, the shot resolves, and THEN everyone sees what happened.

---

## 2. Current Architecture (What We Have)

```
┌─────────────┐     WebSocket      ┌──────────────┐
│  React UI   │ ◄────────────────► │  Node Server │
│  (Vercel)   │   state_update     │  (Railway)   │
│             │   choose_target    │              │
│  Phaser 3   │   play_card        │  In-Memory   │
│  Zustand    │                    │  GameState   │
└─────────────┘                    └──────────────┘
                                         │
                                   Plain JS engine
                                   chamber.ts (plaintext shuffle)
                                   resolver.ts (plaintext resolution)
                                   engine.ts (state machine)
```

### Key files:
| File | What it does | FHE impact |
|------|-------------|------------|
| `game/core/chamber.ts` | Shuffled chamber `[live,blank,...]` | **REPLACED** — encrypted on-chain |
| `game/core/resolver.ts` | Applies card + checks if live | **REPLACED** — all resolution on-chain (encrypted) |
| `game/core/cards.ts` | Card inventory (3 bluff, 2 redirect) | **REPLACED** — encrypted card counts on-chain |
| `game/core/engine.ts` | State machine (phases) | **SIMPLIFIED** — phase tracking only, no game logic |
| `server/matchStore.ts` | Holds GameState in memory | **REWRITTEN** — listens to contract events |
| `src/lib/wallet.ts` | MetaMask (Sepolia) | **CHANGED** — targets Zama devnet |

---

## 3. Target Architecture (With FHE)

```
┌─────────────┐     WebSocket      ┌──────────────┐
│  React UI   │ ◄────────────────► │  Node Server │
│  (Vercel)   │   state_update     │  (Railway)   │
│             │                    │              │
│  Phaser 3   │                    │  Event Relay │
│  Zustand    │                    │  (no secrets)│
└──────┬──────┘                    └──────┬───────┘
       │                                  │
       │  tx: chooseTarget()              │  listen events
       │  tx: playCard(encryptedCard)     │  from contract
       ▼                                  ▼
┌─────────────────────────────────────────────────────┐
│              Zama fhEVM (on-chain)                  │
│                                                     │
│  CipherShotGame.sol                                 │
│  ├── euint8[7] encryptedChamber     (FHE)          │
│  ├── euint8 encryptedCardPlayed     (FHE)          │
│  ├── euint8 playerA/B encBluffs/Redirects (FHE)    │
│  ├── resolveShot() → all math encrypted             │
│  ├── Gateway.requestDecryption() → reveal result    │
│  └── emit ShotResolved(killed, finalTarget, card)   │
└─────────────────────────────────────────────────────┘
```

### What's encrypted (FHE):
1. **Chamber** — 7 encrypted rounds, decrypted one at a time
2. **Card played** — responder submits encrypted card type, revealed only at resolution
3. **Card inventory** — each player's remaining bluffs/redirects are encrypted so the opponent doesn't know what they have left

### What's public (plaintext):
1. **Phase** — whose turn, what phase (choosingTarget, respondingCard, etc.)
2. **Target choice** — the shooter's target is public (self/opponent) — the strategy is in the RESPONSE
3. **Shot result** — after resolution: who was hit, was it live, what card was played

### What stays off-chain:
1. **Matchmaking** — WebSocket queue
2. **UI/animations** — React + Phaser
3. **Real-time relay** — server bridges contract events to WebSocket

---

## 4. Encrypted Card Mechanics — The Core Design

### 4.1 Why encrypt cards?

Without encryption:
```
Shooter: "I shoot opponent"
Responder plays REDIRECT (visible to shooter)
Shooter: "Oh, it redirected to me. Good thing this round was blank."
→ No surprise, no strategy
```

With FHE:
```
Shooter: "I shoot opponent"
Responder plays ??? (encrypted, nobody sees)
3... 2... 1...
REVEAL: Responder played REDIRECT. Round was LIVE. Shooter dies.
→ Real suspense. Real bluffing.
```

### 4.2 Card encoding

Cards are encoded as encrypted uint8:
- `0` = No card (pass)
- `1` = Bluff (no effect on target)
- `2` = Redirect (flips target)

The responder encrypts their choice client-side using `fhevmjs` and submits it as `einput`. The contract stores it as `euint8`. Nobody sees the value until the Gateway decrypts the final result.

### 4.3 Card inventory privacy

Each player's remaining card counts are also encrypted:

```solidity
euint8 playerABluffs;     // encrypted count (starts at 3)
euint8 playerARedirects;  // encrypted count (starts at 2)
```

When a player plays a card, the contract:
1. Receives encrypted card type (0, 1, or 2)
2. Conditionally decrements the correct counter (encrypted comparison)
3. Validates the player has cards left (encrypted `> 0` check)

The opponent never knows:
- How many bluffs you have left
- How many redirects you have left
- Whether you CAN bluff or redirect

This creates real information asymmetry. A player with 0 redirects left might still intimidate the opponent because they can't tell.

### 4.4 Your own cards

Each player can see their OWN card counts by requesting a **reencryption** from the contract using their private key. Zama's `TFHE.allow(value, playerAddress)` grants decrypt permission only to that specific player. The contract:

```solidity
// Allow each player to see only their own cards
TFHE.allow(m.playerABluffs, m.playerA);
TFHE.allow(m.playerARedirects, m.playerA);
TFHE.allow(m.playerBBluffs, m.playerB);
TFHE.allow(m.playerBRedirects, m.playerB);
```

Client-side, the player uses `fhevmjs` to reencrypt and read their own counts.

---

## 5. Smart Contract Design

### `CipherShotGame.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import "fhevm/gateway/GatewayCaller.sol";

contract CipherShotGame is GatewayCaller {

    enum Phase { ChoosingTarget, RespondingCard, Resolving, GameOver }

    struct Match {
        address playerA;
        address playerB;
        Phase phase;
        address currentShooter;
        uint8 currentShotIndex;

        // === FHE ENCRYPTED ===
        euint8[7] chamber;            // 1=live, 0=blank (shuffled)
        euint8 pendingCard;           // card played by responder (0=none, 1=bluff, 2=redirect)
        euint8 playerABluffs;         // remaining bluff count
        euint8 playerARedirects;      // remaining redirect count
        euint8 playerBBluffs;
        euint8 playerBRedirects;

        // === PLAINTEXT ===
        uint8 selectedTarget;         // 0=self, 1=opponent (public)
        bool playerAAlive;
        bool playerBAlive;
        address winner;
    }

    mapping(bytes32 => Match) public matches;

    // --- Events ---
    event MatchCreated(bytes32 indexed matchId, address playerA, address playerB);
    event TargetChosen(bytes32 indexed matchId, address shooter, uint8 target);
    event CardSubmitted(bytes32 indexed matchId, address responder);
    // NOTE: CardSubmitted does NOT reveal what card was played
    event ShotResolved(
        bytes32 indexed matchId,
        address shooter,
        address finalTarget,
        bool killed,
        uint8 cardPlayed,     // revealed ONLY here (0=none, 1=bluff, 2=redirect)
        uint8 shotIndex
    );
    event GameOver(bytes32 indexed matchId, address winner);

    // ========================
    //  CREATE MATCH
    // ========================

    function createMatch(
        bytes32 matchId,
        address playerA,
        address playerB
    ) external {
        Match storage m = matches[matchId];
        require(m.playerA == address(0), "Match exists");

        m.playerA = playerA;
        m.playerB = playerB;
        m.phase = Phase.ChoosingTarget;
        m.currentShooter = playerA;
        m.playerAAlive = true;
        m.playerBAlive = true;

        // Encrypted card inventories
        m.playerABluffs = TFHE.asEuint8(3);
        m.playerARedirects = TFHE.asEuint8(2);
        m.playerBBluffs = TFHE.asEuint8(3);
        m.playerBRedirects = TFHE.asEuint8(2);

        // Allow each player to read only their own card counts
        TFHE.allow(m.playerABluffs, playerA);
        TFHE.allow(m.playerARedirects, playerA);
        TFHE.allow(m.playerBBluffs, playerB);
        TFHE.allow(m.playerBRedirects, playerB);

        // Generate encrypted shuffled chamber
        _generateEncryptedChamber(m);

        emit MatchCreated(matchId, playerA, playerB);
    }

    // ========================
    //  CHOOSE TARGET (public)
    // ========================

    function chooseTarget(bytes32 matchId, uint8 target) external {
        Match storage m = matches[matchId];
        require(msg.sender == m.currentShooter, "Not your turn");
        require(m.phase == Phase.ChoosingTarget, "Wrong phase");
        require(target <= 1, "Invalid target");

        m.selectedTarget = target; // 0=self, 1=opponent
        m.phase = Phase.RespondingCard;

        emit TargetChosen(matchId, msg.sender, target);
    }

    // ========================
    //  PLAY CARD (encrypted!)
    // ========================

    /// @notice Responder submits encrypted card choice
    /// @param encCard Encrypted card type (0=none, 1=bluff, 2=redirect)
    /// @param inputProof The EIP-712 proof from fhevmjs
    function playCard(
        bytes32 matchId,
        einput encCard,
        bytes calldata inputProof
    ) external {
        Match storage m = matches[matchId];
        address responder = _getResponder(m);
        require(msg.sender == responder, "Not the responder");
        require(m.phase == Phase.RespondingCard, "Wrong phase");

        // Convert encrypted input to euint8
        euint8 cardType = TFHE.asEuint8(encCard, inputProof);

        // Validate card availability (all in encrypted domain)
        // If cardType == 1 (bluff): check bluffs > 0, decrement
        // If cardType == 2 (redirect): check redirects > 0, decrement
        _validateAndConsumeCard(m, responder, cardType);

        // Store encrypted card for resolution
        m.pendingCard = cardType;
        m.phase = Phase.Resolving;

        // NOTE: event does NOT reveal which card was played
        emit CardSubmitted(matchId, msg.sender);

        // Resolve shot (all encrypted math, then request decryption of result)
        _resolveShot(matchId, m);
    }

    // ========================
    //  ENCRYPTED RESOLUTION
    // ========================

    /// @dev Compute final target and liveness entirely in FHE, then decrypt result
    function _resolveShot(bytes32 matchId, Match storage m) internal {
        euint8 chamberRound = m.chamber[m.currentShotIndex];
        euint8 cardPlayed = m.pendingCard;

        // Determine if target gets flipped (redirect = cardType 2)
        ebool isRedirect = TFHE.eq(cardPlayed, TFHE.asEuint8(2));

        // Original target: 0=self, 1=opponent
        euint8 originalTarget = TFHE.asEuint8(m.selectedTarget);

        // Flipped target: self(0)→opponent(1), opponent(1)→self(0)
        // flip = 1 - original
        euint8 flippedTarget = TFHE.sub(TFHE.asEuint8(1), originalTarget);

        // Final target: redirect ? flipped : original
        euint8 finalTarget = TFHE.select(isRedirect, flippedTarget, originalTarget);

        // killed = (chamberRound == 1)  — live round
        ebool killed = TFHE.eq(chamberRound, TFHE.asEuint8(1));

        // We need to decrypt: finalTarget, killed, cardPlayed
        // Pack into request
        uint256[] memory cts = new uint256[](3);
        cts[0] = Gateway.toUint256(finalTarget);
        cts[1] = Gateway.toUint256(TFHE.asEuint8(killed));  // cast bool to uint8
        cts[2] = Gateway.toUint256(cardPlayed);

        TFHE.allowTransient(finalTarget, address(Gateway.GatewayContract()));
        TFHE.allowTransient(TFHE.asEuint8(killed), address(Gateway.GatewayContract()));
        TFHE.allowTransient(cardPlayed, address(Gateway.GatewayContract()));

        uint256 requestId = Gateway.requestDecryption(
            cts,
            this.onShotDecrypted.selector,
            0,
            block.timestamp + 100,
            false
        );

        // Store context for callback
        decryptionCtx[requestId] = DecryptionCtx({
            matchId: matchId,
            shotIndex: m.currentShotIndex
        });
    }

    struct DecryptionCtx {
        bytes32 matchId;
        uint8 shotIndex;
    }
    mapping(uint256 => DecryptionCtx) private decryptionCtx;

    // ========================
    //  GATEWAY CALLBACK
    // ========================

    /// @dev Called by Gateway after decryption — this is when the result is revealed
    function onShotDecrypted(
        uint256 requestId,
        uint8 decFinalTarget,    // 0=self(shooter), 1=opponent(responder)
        uint8 decKilled,         // 0=no, 1=yes
        uint8 decCardPlayed      // 0=none, 1=bluff, 2=redirect
    ) external onlyGateway {
        DecryptionCtx memory ctx = decryptionCtx[requestId];
        Match storage m = matches[ctx.matchId];

        bool killed = decKilled == 1;
        address responder = _getResponder(m);

        // Map target enum to actual address
        address targetPlayer = decFinalTarget == 0
            ? m.currentShooter  // shot self
            : responder;        // shot opponent

        if (killed) {
            if (targetPlayer == m.playerA) m.playerAAlive = false;
            else m.playerBAlive = false;
        }

        m.currentShotIndex++;

        emit ShotResolved(
            ctx.matchId,
            m.currentShooter,
            targetPlayer,
            killed,
            decCardPlayed,
            ctx.shotIndex
        );

        if (killed) {
            m.winner = m.playerAAlive ? m.playerA : m.playerB;
            m.phase = Phase.GameOver;
            emit GameOver(ctx.matchId, m.winner);
        } else if (m.currentShotIndex >= 7) {
            // Chamber exhausted — draw
            m.phase = Phase.GameOver;
            emit GameOver(ctx.matchId, address(0));
        } else {
            // Next turn — swap shooter
            m.currentShooter = m.currentShooter == m.playerA
                ? m.playerB
                : m.playerA;
            m.phase = Phase.ChoosingTarget;
        }

        delete decryptionCtx[requestId];
    }

    // ========================
    //  CARD VALIDATION (FHE)
    // ========================

    /// @dev Validate player has the card and decrement count — all encrypted
    function _validateAndConsumeCard(
        Match storage m,
        address player,
        euint8 cardType
    ) internal {
        bool isPlayerA = player == m.playerA;

        euint8 bluffs = isPlayerA ? m.playerABluffs : m.playerBBluffs;
        euint8 redirects = isPlayerA ? m.playerARedirects : m.playerBRedirects;

        ebool isBluff = TFHE.eq(cardType, TFHE.asEuint8(1));
        ebool isRedirect = TFHE.eq(cardType, TFHE.asEuint8(2));
        ebool isPass = TFHE.eq(cardType, TFHE.asEuint8(0));

        // Validate: if bluff, bluffs > 0; if redirect, redirects > 0; if pass, always ok
        ebool bluffValid = TFHE.or(TFHE.not(isBluff), TFHE.gt(bluffs, TFHE.asEuint8(0)));
        ebool redirectValid = TFHE.or(TFHE.not(isRedirect), TFHE.gt(redirects, TFHE.asEuint8(0)));
        ebool cardValid = TFHE.and(bluffValid, redirectValid);

        // Require valid (this leaks 1 bit: "was the card valid?" — acceptable,
        // the tx just reverts if invalid, same as a normal require)
        TFHE.optReq(cardValid);

        // Decrement the right counter: bluffs -= isBluff ? 1 : 0
        euint8 bluffDec = TFHE.select(isBluff, TFHE.asEuint8(1), TFHE.asEuint8(0));
        euint8 redirectDec = TFHE.select(isRedirect, TFHE.asEuint8(1), TFHE.asEuint8(0));

        euint8 newBluffs = TFHE.sub(bluffs, bluffDec);
        euint8 newRedirects = TFHE.sub(redirects, redirectDec);

        if (isPlayerA) {
            m.playerABluffs = newBluffs;
            m.playerARedirects = newRedirects;
            TFHE.allow(newBluffs, m.playerA);
            TFHE.allow(newRedirects, m.playerA);
        } else {
            m.playerBBluffs = newBluffs;
            m.playerBRedirects = newRedirects;
            TFHE.allow(newBluffs, m.playerB);
            TFHE.allow(newRedirects, m.playerB);
        }
    }

    // ========================
    //  CHAMBER GENERATION
    // ========================

    /// @dev Generate 7 encrypted rounds (3 live, 4 blank) with on-chain FHE shuffle
    function _generateEncryptedChamber(Match storage m) internal {
        // Init: [1,1,1,0,0,0,0]
        for (uint8 i = 0; i < 7; i++) {
            m.chamber[i] = TFHE.asEuint8(i < 3 ? 1 : 0);
        }

        // Fisher-Yates shuffle using FHE random
        for (uint8 i = 6; i > 0; i--) {
            euint8 rand = TFHE.randEuint8();
            euint8 j = TFHE.rem(rand, TFHE.asEuint8(i + 1));
            _encryptedSwap(m.chamber, i, j);
        }

        // Allow Gateway to decrypt chamber values (one at a time during resolution)
        for (uint8 i = 0; i < 7; i++) {
            TFHE.allowThis(m.chamber[i]);
            TFHE.allow(m.chamber[i], address(Gateway.GatewayContract()));
        }
    }

    /// @dev Oblivious swap: swap arr[indexI] with arr[encJ] without revealing j
    function _encryptedSwap(
        euint8[7] storage arr,
        uint8 indexI,
        euint8 encJ
    ) internal {
        euint8 valI = arr[indexI];
        for (uint8 k = 0; k <= indexI; k++) {
            ebool isTarget = TFHE.eq(encJ, TFHE.asEuint8(k));
            euint8 valK = arr[k];
            arr[k] = TFHE.select(isTarget, valI, valK);
            arr[indexI] = TFHE.select(isTarget, valK, arr[indexI]);
        }
    }

    // ========================
    //  HELPERS
    // ========================

    function _getResponder(Match storage m) internal view returns (address) {
        return m.currentShooter == m.playerA ? m.playerB : m.playerA;
    }
}
```

---

## 6. What Each Player Sees (Information Flow)

### During the game:

| Info | Shooter sees | Responder sees | Contract knows |
|------|-------------|----------------|----------------|
| Chamber | nothing | nothing | encrypted (can't read) |
| Target choice | their own choice | public (sees it) | plaintext |
| Card played | **nothing** (until resolve) | their own choice | encrypted |
| Opponent's card counts | **nothing** | **nothing** | encrypted |
| Own card counts | decrypts via reencryption | decrypts via reencryption | encrypted |
| Shot result | revealed after decrypt | revealed after decrypt | decrypted by Gateway |

### After resolution (ShotResolved event reveals):
- What card was played (bluff/redirect/none)
- Who was the final target
- Was the round live (killed or not)
- The round's position in the chamber

### Never revealed:
- Future chamber rounds (encrypted until their turn)
- Opponent's remaining card counts

---

## 7. Client-Side: Encrypted Card Submission

The responder encrypts their card choice using `fhevmjs` before submitting:

```typescript
import { createInstance } from 'fhevmjs';

// Initialize fhEVM instance (once)
const fhevm = await createInstance({
  chainId: ZAMA_CHAIN_ID,
  networkUrl: ZAMA_RPC_URL,
});

// When responder plays a card:
async function playCardEncrypted(
  matchId: string,
  cardType: 0 | 1 | 2, // 0=pass, 1=bluff, 2=redirect
  walletClient: WalletClient,
) {
  // Encrypt the card type
  const input = fhevm.createEncryptedInput(
    CONTRACT_ADDRESS,
    walletClient.account.address,
  );
  input.add8(cardType); // encrypt as uint8
  const encrypted = input.encrypt();

  // Submit transaction — card is encrypted, nobody sees it
  await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: cipherShotAbi,
    functionName: 'playCard',
    args: [matchId, encrypted.handles[0], encrypted.inputProof],
  });
}
```

### Reading own card counts (reencryption):

```typescript
async function getMyCardCounts(
  matchId: string,
  playerAddress: string,
): Promise<{ bluffs: number; redirects: number }> {
  // Generate reencryption keypair
  const { publicKey, privateKey } = fhevm.generateKeypair();

  // Create EIP-712 signature for reencryption
  const eip712 = fhevm.createEIP712(publicKey, CONTRACT_ADDRESS);
  const signature = await walletClient.signTypedData(eip712);

  // Request reencryption of your bluff count
  const bluffsHandle = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: cipherShotAbi,
    functionName: 'getMyBluffs', // view function that returns the handle
    args: [matchId],
  });

  const bluffs = await fhevm.reencrypt(
    bluffsHandle,
    privateKey,
    publicKey,
    signature,
    CONTRACT_ADDRESS,
    playerAddress,
  );

  // Same for redirects...

  return { bluffs: Number(bluffs), redirects: Number(redirects) };
}
```

---

## 8. Server Adaptation

### New role: Event Relay (no game logic)

```typescript
// server/contractListener.ts
import { createPublicClient, webSocket, parseAbiItem } from 'viem';
import { zamaDevnet } from './chains';

const client = createPublicClient({
  chain: zamaDevnet,
  transport: webSocket(ZAMA_WS_RPC),
});

// Listen for all game events and relay to WebSocket clients
export function startEventListener(onGameEvent: (event: GameEvent) => void) {

  // Target chosen — update UI immediately
  client.watchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: cipherShotAbi,
    eventName: 'TargetChosen',
    onLogs: (logs) => {
      for (const log of logs) {
        onGameEvent({
          type: 'target_chosen',
          matchId: log.args.matchId,
          shooter: log.args.shooter,
          target: log.args.target,
        });
      }
    },
  });

  // Card submitted — start suspense countdown (card is still secret!)
  client.watchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: cipherShotAbi,
    eventName: 'CardSubmitted',
    onLogs: (logs) => {
      for (const log of logs) {
        onGameEvent({
          type: 'card_submitted',  // NOTE: no card type revealed here
          matchId: log.args.matchId,
          responder: log.args.responder,
        });
      }
    },
  });

  // Shot resolved — the big reveal!
  client.watchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: cipherShotAbi,
    eventName: 'ShotResolved',
    onLogs: (logs) => {
      for (const log of logs) {
        onGameEvent({
          type: 'shot_resolved',
          matchId: log.args.matchId,
          shooter: log.args.shooter,
          finalTarget: log.args.finalTarget,
          killed: log.args.killed,
          cardPlayed: log.args.cardPlayed,  // NOW revealed
          shotIndex: log.args.shotIndex,
        });
      }
    },
  });
}
```

### Animation timing with FHE latency:

```
CardSubmitted event received
  ↓
Start countdown: 3... 2... 1...  (our existing SuspenseOverlay)
  ↓
Meanwhile Gateway is decrypting (~2-5 seconds)
  ↓
ShotResolved event received
  ↓
Show card reveal (big card in center)
  ↓
Play shot animation (aim + fire)
  ↓
Show result
```

The countdown naturally masks the Gateway decryption latency. If decryption finishes before the countdown, we wait. If it takes longer, we extend with a "..." loading state.

---

## 9. UX Changes

### What the player experiences:

**Current flow:**
1. Choose target → opponent sees immediately
2. Respond with card → opponent sees card type immediately
3. Suspense countdown (cosmetic)
4. Result

**New flow with FHE:**
1. Choose target → opponent sees (public, intentional)
2. Respond with card → opponent sees **"Card played"** but NOT which card
3. Suspense countdown (real suspense — nobody knows the card!)
4. **Simultaneous reveal**: card type + live/blank + who got hit
5. Result

### UI changes needed:

**CardDisplay.tsx:**
- Show own cards (read via reencryption from contract)
- Opponent's hand: show card count as "?" or "UNKNOWN" (can't read encrypted counts)
- After each ShotResolved: update card counts

**ActionPanel.tsx:**
- "PLAY CARD" buttons → trigger encrypted tx instead of WebSocket message
- Add tx confirmation state (pending/confirmed)
- Disable buttons while tx is pending

**SuspenseOverlay.tsx:**
- CardSubmitted → start countdown immediately (card still secret)
- ShotResolved → show the revealed card type, then animate shot
- If Gateway is slow: show "DECRYPTING..." after countdown finishes

---

## 10. Migration Steps

### Phase 1: Contract Development
1. Set up Hardhat + `fhevm` dependency
2. Write `CipherShotGame.sol` (see Section 5)
3. Test with Zama's local mock node (`npx hardhat node` with fhEVM plugin)
4. Test encrypted card submission + resolution
5. Test encrypted shuffle produces valid 3-live/4-blank distribution
6. Deploy to Zama devnet

### Phase 2: Server → Event Relay
1. Add `contractListener.ts` — watch for contract events
2. Rewrite `matchStore.ts` — build GameState from events, not from engine
3. `createMatch` → call contract `createMatch()` when matchmaking pairs players
4. Remove `chamber.ts`, `resolver.ts`, `cards.ts` usage from server
5. Keep matchmaking WebSocket as-is (pairs players, then creates on-chain match)

### Phase 3: Client → Encrypted Actions
1. Add `fhevmjs` dependency
2. Update `wallet.ts` — target Zama chain
3. `chooseTarget` → sends plaintext tx (target is public)
4. `playCard` → encrypts card with `fhevmjs`, sends tx
5. Read own card counts via reencryption
6. Show opponent card counts as unknown

### Phase 4: UX Polish
1. Tune SuspenseOverlay timing to handle Gateway latency
2. Add tx pending states in ActionPanel
3. Handle tx failures / reverts (e.g., "no cards left" revert)
4. Test full 2-player game on Zama devnet
5. Adjust card reveal animation (card is revealed in ShotResolved, not CardSubmitted)

---

## 11. File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `game/core/chamber.ts` | **DELETE** | Replaced by on-chain FHE chamber |
| `game/core/resolver.ts` | **DELETE** | Resolution on-chain |
| `game/core/cards.ts` | **DELETE** | Card inventory on-chain (encrypted) |
| `game/core/engine.ts` | **SIMPLIFY** | Phase tracking only |
| `server/matchStore.ts` | **REWRITE** | Build state from contract events |
| `server/contractListener.ts` | **NEW** | Watch contract events |
| `server/index.ts` | **ADAPT** | createMatch calls contract |
| `src/lib/wallet.ts` | **UPDATE** | Zama chain config |
| `src/lib/fhe.ts` | **NEW** | fhevmjs instance + helpers |
| `src/lib/matchmaking.ts` | **ADAPT** | Actions → encrypted tx |
| `src/game/store.ts` | **ADAPT** | Add tx pending states |
| `src/components/CardDisplay.tsx` | **ADAPT** | Own cards via reencryption, opponent "?" |
| `src/components/ActionPanel.tsx` | **ADAPT** | Tx submission + pending state |
| `src/components/SuspenseOverlay.tsx` | **ADAPT** | Handle Gateway latency |
| `contracts/CipherShotGame.sol` | **NEW** | Core FHE contract |
| `hardhat.config.ts` | **NEW** | Hardhat + fhevm setup |

---

## 12. Gas & Performance Estimates

| Operation | FHE ops | Estimated gas | Latency |
|-----------|---------|--------------|---------|
| `createMatch` (chamber gen + shuffle) | ~50 | 3-5M gas | ~10s |
| `chooseTarget` | 0 | ~50K gas | ~2s |
| `playCard` (encrypt + validate + resolve) | ~20 | 1-2M gas | ~3s |
| Gateway decryption callback | 0 (plaintext) | ~100K gas | 2-5s after request |

**Total per game (7 rounds max):** ~10-20M gas

---

## 13. Resources

- **Zama fhEVM docs**: https://docs.zama.ai/fhevm
- **fhevmjs (client encryption)**: https://docs.zama.ai/fhevm/fundamentals/inputs
- **Reencryption (read own data)**: https://docs.zama.ai/fhevm/fundamentals/decryption/reencryption
- **Gateway (async decrypt)**: https://docs.zama.ai/fhevm/fundamentals/decryption/decrypt
- **TFHE.optReq (encrypted require)**: https://docs.zama.ai/fhevm/fundamentals/conditions
- **Example contracts**: https://github.com/zama-ai/fhevm/tree/main/examples
- **Hardhat fhEVM plugin**: https://docs.zama.ai/fhevm/getting-started/hardhat
