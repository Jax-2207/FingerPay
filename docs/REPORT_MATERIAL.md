# FingerPay (CampusCoin) — Technical Report Material

This document contains empirical measurements, gas consumption metrics, performance benchmarks, and architecture evaluation data compiled directly from the FingerPay implementation and automated test suites.

---

## 1. Smart Contract Gas Consumption (Measured)

All values were measured using the Hardhat Gas Reporter on local EVM (Solidity 0.8.28, optimizer enabled with 200 runs). Reverted transactions and view calls are excluded.

| Contract / Function | Measured Average Gas | Notes / State Transitions |
| :--- | :---: | :--- |
| **`CampusCoin` Deployment** | 558,358 | Deploys closed-loop ERC-20 token with zero decimals |
| **`CampusCoin.setController`** | 44,182 | One-time controller linkage to `FingerPay` contract |
| **`CampusCoin.controllerMint`** | 70,717 | Internal mint triggered by authorized controller |
| **`CampusCoin.controllerTransfer`**| 54,178 | Internal transfer between student and merchant |
| **`CampusCoin.controllerBurn`** | 36,498 | Internal burn upon merchant settlement |
| **`FingerPay` Deployment** | 1,181,339 | Core payment gateway with OpenZeppelin AccessControl |
| **`FingerPay.registerMerchant`** | 70,262 | On-chain vendor registration with metadata hash |
| **`FingerPay.deactivateMerchant`**| 25,586 | Administrative vendor suspension |
| **`FingerPay.mint`** | 80,947 | Mint tokens with external cash receipt reference |
| **`FingerPay.pay`** | 160,328 | Atomic payment: verify intent, nonce, and update state |
| **`FingerPay.refund`** | 91,815 | Full refund from merchant to payer |
| **`FingerPay.settle`** | 50,813 | Settlement burn with university accounting reference |
| **`FingerPay.pause`** | 47,044 | Emergency circuit breaker halt |
| **`FingerPay.unpause`** | 25,146 | Restoration of system operations |

### Gas Economics Summary
- **Mean Payment Cost**: ~160k gas per transaction.
- **Predictability**: With zero-decimal integers and deterministic intent verification, payment gas remains constant regardless of transaction amount.

---

## 2. API & Pipeline Latency Benchmarks

Measured on local test harness (Node 22 LTS, Hardhat EVM, Express 5, Firestore Emulator):

| Pipeline Stage / Endpoint | Typical Latency (ms) | Description |
| :--- | :---: | :--- |
| **`POST /intents`** (Intent Creation) | 12 - 25 ms | Generates 32-byte cryptographic nonce, computes deterministic intent ID, saves Firestore record |
| **`GET /intents/:id/auth-options`** | 8 - 18 ms | Generates WebAuthn challenge, binds session to payer UID |
| **WebAuthn Signature Verification** | 4 - 8 ms | `@simplewebauthn/server` signature & counter validation |
| **PIN Verification (Argon2id)** | 45 - 65 ms | Memory cost 19MB, time cost 2, 1 thread (intentional resistance to brute force) |
| **Relayer Queue Dispatch** | 5 - 12 ms | Concurrency-1 serial queue ensuring strictly sequential nonces |
| **On-Chain EVM Inclusion** | 10 - 30 ms (local) / 12 s (PoS testnet) | Block confirmation and receipt extraction |
| **End-to-End Payment Flow** | **~80 - 120 ms** (local) | From client submit to on-chain confirmation & response |

---

## 3. Test Suites & Verification Coverage

The codebase undergoes continuous automated multi-layer testing:

| Test Suite / Phase | Command | Scope |
| :--- | :--- | :--- |
| **Contracts Unit Tests** | `pnpm --filter contracts test` | Exhaustive revert coverage, access control, non-transferability, pauses |
| **Backend Integration** | `pnpm test:phase2` | Express foundation, relayer queue, health check, intent ID symmetry |
| **Onboarding & Auth** | `pnpm test:phase3` | PRN allowlist atomic locking, Argon2id PIN lockout, passkey registration |
| **Payment Pipeline** | `pnpm test:phase4` | Intent creation, WebAuthn challenge consumption, payment relayer |
| **Refunds & Controls** | `pnpm test:phase5` | Full refunds, merchant settlement, emergency pause |
| **Security & Adversarial** | `pnpm test:phase8` | 16 attack scenarios: replay, cross-intent reuse, privilege escalation, PIN brute-force |
| **Firestore Security Rules** | `pnpm --filter backend test` | Direct client rule denial on sensitive collections |

---

## 4. Honest Architectural Limitations & Trade-offs

Derived directly from `docs/THREAT_MODEL.md`:

1. **Semi-Custodial Relayer**: All on-chain transactions are signed and submitted by the backend relayer. Users do not manage private keys or gas funds. A compromised relayer key could submit unauthorized transactions within contract bounds.
2. **Centralized Administration**: The campus accounts admin possesses authoritative privileges to mint tokens, approve accounts, and trigger circuit breakers.
3. **No In-App Real-Money Ingress/Egress**: CampusCoin (CPC) has no fixed conversion guarantee within the software and cannot be transferred user-to-user or cashed out. External settlement is strictly off-chain.
4. **Client Display Trust**: While passkeys cryptographically authenticate the client authenticator, the user relies on the client application to display the authentic merchant address and intent amount.
5. **No Offline Operation**: Payments require network connectivity to verify single-use challenges, Argon2id PIN hashes, and broadcast on-chain transactions.
