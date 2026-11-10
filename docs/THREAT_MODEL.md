# FingerPay threat model

**Status: VALIDATED (Phase 8 Security Hardening & Audit Complete).**
This document records assets, trust boundaries, evaluated threats, verified security controls, automated test evidence, and honest operational limitations from `docs/BUILD_GUIDE.md` Parts A, B, C, and E.

---

## 1. Assets

- **CPC Balances & Lifecycle State:** Balances, mint, payment, refund, settlement, and contract roles on the EVM blockchain.
- **Identity & Student Data:** Student PRN, full name, institutional email, allowlist status, approval status, and merchant business profile.
- **Passkey Metadata:** WebAuthn credential IDs, public keys, authenticator counters, transports, and device types.
- **PIN Secrets:** Argon2id PIN hashes, failed attempt counters, and lockout timestamps in `pinSecrets`.
- **Payment Intents:** Short-lived intent records containing intent ID hash, merchant address, CPC amount, unique 32-byte nonce, expiry timestamp, WebAuthn challenge binding, and lifecycle status.
- **Privileged Credentials & Secrets:** Admin and relayer private keys, `WALLET_SALT`, Firebase Admin service credentials, and server environment configuration.
- **Audit Trails & Operational Logs:** Transaction index records, mint receipts, settlement disbursement references, indexer cursors, and admin audit events.
- **Infrastructure Integrity:** Backend API availability, serial relayer execution queue, Firebase Auth/Firestore services, and EVM RPC connectivity.

---

## 2. Actors and Trust Boundaries

- **Students & Merchants (Untrusted Endpoints):** Authenticated via Firebase Authentication, but their web clients, browsers, and mobile devices are untrusted execution environments. Inputs are strictly validated on the server.
- **Campus Accounts Administrator (Trusted Authority):** Trusted operator responsible for PRN allowlist imports, student approval, merchant activation/deactivation, CPC minting against external bank receipts, settlement authorization, and emergency circuit breaker operation.
- **Backend Application & Firebase Admin SDK (Trusted Middleware):** Trusted server-side environment enforcing Argon2id PIN verification, WebAuthn assertion verification, rate limiting, role-based authorization, limits enforcement, and atomic intent state transitions.
- **Relayer Service (Privileged Transaction Submitter):** Trusted signing service possessing `RELAYER_ROLE` on `FingerPay.sol`. Strictly constrained by smart contract invariants: can only execute `pay()` for valid, unexpired, non-replayed intents signed by active merchants.
- **Smart Contracts (Authoritative Financial Core):** `CampusCoin.sol` and `FingerPay.sol` enforce token balance movement, authorization, non-reentrancy, paused state, and disabled public transfers. Smart contracts are the single source of truth for balances; Firestore is a mirror and index.
- **External Networks & Third Parties (Untrusted):** Public internet, client local storage, QR code visual renderings, and external network traffic are treated as untrusted.

---

## 3. Threats, Verified Controls, and Automated Test Coverage

| Threat Category                  | Potential Attack                                                             | Implemented & Verified Control                                                                                                                                                                                                       | Automated Test Evidence                                                   |
| -------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Role Escalation & Forgery**    | Student attempts administrative operations (mint, refund, pause, settlement) | Backend middleware verifies Firebase custom claims (`requireRole('admin')`); Firestore client rules deny all client writes (`allow write: if false`).                                                                                | `phase8.security.test.ts` (section 4), `phase3.rules.test.ts`             |
| **Unauthorized Token Movement**  | User attempts P2P transfer or in-app cash-out                                | Public ERC20 `transfer()`, `transferFrom()`, and `approve()` unconditionally revert with `TransfersDisabled()`. Tokens move only via controller functions invoked by `FingerPay.sol`.                                                | `CampusCoin.hardhat.ts`, `FingerPay.hardhat.ts`                           |
| **Intent Replay & Alteration**   | Replaying an intent or altering amount/merchant                              | Canonical `computeIntentId` cryptographically binds chain ID, contract address, merchant address, amount, nonce, and expiry. On-chain `intentUsed[intentId]` prevents replay. Intent cannot be paid twice.                           | `FingerPay.hardhat.ts`, `phase8.security.test.ts` (section 2)             |
| **Concurrent Double Confirm**    | Firing simultaneous payment confirmations for one intent                     | Atomic Firestore transaction transitions status `created -> approved`. Exactly one request claims the intent; concurrent requests receive 409 `INTENT_ALREADY_USED`.                                                                 | `phase8.security.test.ts` (section 2)                                     |
| **Passkey Assertion Replay**     | Replaying a captured WebAuthn assertion                                      | WebAuthn challenge is single-use, bound to the intent hash, stored server-side with TTL, and atomically deleted inside a Firestore transaction upon consumption.                                                                     | `phase8.security.test.ts` (section 1), `phase3.test.ts`                   |
| **Cross-Intent Challenge Reuse** | Using a challenge from Intent A to authorize Intent B                        | Backend checks `challengeData.intentId === intent.intentId` and verifies challenge equals `keccak256(intentId)`. Mismatches are rejected with `CHALLENGE_MISMATCH`.                                                                  | `phase8.security.test.ts` (section 1)                                     |
| **PIN Brute-Force & Guessing**   | Online brute-force attack on student PIN                                     | Argon2id hashing (19 MiB memory, 2 iterations, 1 lane). After 5 failed attempts across verify or confirm, account is locked for 15 minutes (`PIN_LOCKED` / `ACCOUNT_LOCKED`). Predictable PINs rejected upon setup (`PIN_TOO_WEAK`). | `phase8.security.test.ts` (section 3), `phase3.test.ts`, `phase4.test.ts` |
| **Self-Payment Exploit**         | Merchant/student pays themselves to churn or fake volume                     | Contract reverts with `SelfPayment()` if `user == merchant`. Backend rejects at options generation and confirmation if `intent.merchantUid === caller.uid` or wallet addresses match.                                                | `FingerPay.hardhat.ts`, `phase8.security.test.ts` (section 2)             |
| **Inactive Merchant Abuse**      | Taking payments while deactivated                                            | Contract reverts with `MerchantNotActive()`. Backend validates merchant active status in Firestore and on-chain before intent creation and payment execution.                                                                        | `FingerPay.hardhat.ts`, `phase4.test.ts`, `phase8.security.test.ts`       |
| **Underfunded Payment**          | User initiates payment exceeding balance                                     | Contract reverts with `InsufficientBalance()`. Backend pre-checks on-chain balance and rejects with 400 `INSUFFICIENT_BALANCE`.                                                                                                      | `FingerPay.hardhat.ts`, `phase8.security.test.ts` (section 2)             |
| **Direct Contract Bypass**       | Non-relayer invokes contract `pay()` directly                                | Contract enforces `onlyRole(RELAYER_ROLE)` on `pay()`. Unauthorized accounts revert with `AccessControlUnauthorizedAccount`.                                                                                                         | `FingerPay.hardhat.ts`                                                    |
| **Emergency Halt Bypass**        | Executing transactions during emergency                                      | `pause()` gates `mint`, `pay`, `refund`, and `settle` with `whenNotPaused`. Backend checks `isPaused()` and rejects with 503 `SYSTEM_PAUSED`.                                                                                        | `FingerPay.hardhat.ts`, `phase5.test.ts`                                  |
| **Data Leakage & IDOR**          | User inspects another user's balance, PIN, or audit logs                     | Firestore security rules block client reads of `pinSecrets`, `passkeys`, `adminLogs`, and other `users/{uid}`. API endpoints filter records strictly by verified token UID.                                                          | `phase3.rules.test.ts`, `phase8.security.test.ts` (section 4 & 5)         |
| **Information Disclosure**       | Server stack trace or database errors exposed to client                      | Standard error handler catches unhandled exceptions and returns generic `{ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }`. Logger redacts authorization headers, PINs, assertions, and private keys.         | `phase8.security.test.ts` (section 5), `foundation.test.ts`               |
| **DoS / Payload Flooding**       | Attacker spams large bodies or floods sensitive routes                       | Global API rate limiting (120 req/min), dedicated passkey rate limiting (20 req/min), payment confirm rate limiting (10 req/min), and strict JSON body limit (`MAX_JSON_BODY_BYTES` = 64KB, returns 413).                            | `app.ts`, `phase8.security.test.ts` (section 5)                           |

---

## 4. Honest Architectural Limitations & Residual Risks

1. **Trusted Centralized Components:**
   - The backend server, serial relayer, and Campus Accounts Administrator are trusted components. FingerPay is an authorized, closed-loop campus payment system, not a trustless decentralized protocol. Compromise of the server environment or admin key could allow unauthorized administrative actions.
2. **Malicious Client Display Risk:**
   - If an attacker compromises a student's smartphone OS or browser display, malicious software could render a false merchant name or amount on the client screen while submitting an assertion for a different intent. Mitigated by explicit visual verification against the physical merchant POS terminal display and short intent TTL (120s), but impossible to eliminate cryptographically without dedicated hardware secure elements.
3. **Single Admin Key Authority:**
   - In the current implementation, administrative actions (`mint`, `refund`, `settle`, `pause`) rely on a single Campus Accounts administrator role without multi-signature or timelock requirements.
4. **Low-Entropy PIN Offline Guessing:**
   - Student PINs are 4 to 6 numeric digits. While Argon2id with 19 MiB memory and 15-minute online lockout prevents online brute-force attacks, low-entropy PINs remain vulnerable to offline dictionary guessing if `pinSecrets` database records are ever exfiltrated.
5. **Deterministic Custodial Wallet Derivation:**
   - Student wallet addresses are derived on the server via `keccak256(uid + WALLET_SALT)`. Users do not hold individual EVM private keys; transactions are authorized via WebAuthn and submitted by the relayer. Exposure of `WALLET_SALT` permits linkability between Firebase UIDs and on-chain addresses.
6. **No Offline Payment Mode:**
   - Payment intent creation, WebAuthn challenge resolution, and on-chain execution require continuous network connectivity between the merchant terminal, student client, backend API, Firebase, and the EVM blockchain.
7. **Demo Closed-Loop Token:**
   - CampusCoin (CPC) is a closed-loop demonstration token with zero monetary guarantee and no fixed exchange rate. Real rupee reconciliation and merchant disbursements occur strictly outside the application by campus accounts staff.

| Threat Category | Potential Attack | Implemented & Verified Control | Automated Test Evidence |
|---|---|---|---|
| **Role Escalation & Forgery** | Student attempts administrative operations (mint, refund, pause, settlement) | Backend middleware verifies Firebase custom claims (`requireRole('admin')`); Firestore client rules deny all client writes (`allow write: if false`). | `phase8.security.test.ts` (section 4), `phase3.rules.test.ts` |
| **Unauthorized Token Movement** | User attempts P2P transfer or in-app cash-out | Public ERC20 `transfer()`, `transferFrom()`, and `approve()` unconditionally revert with `TransfersDisabled()`. Tokens move only via controller functions invoked by `FingerPay.sol`. | `CampusCoin.hardhat.ts`, `FingerPay.hardhat.ts` |
| **Intent Replay & Alteration** | Replaying an intent or altering amount/merchant | Canonical `computeIntentId` cryptographically binds chain ID, contract address, merchant address, amount, nonce, and expiry. On-chain `intentUsed[intentId]` prevents replay. Intent cannot be paid twice. | `FingerPay.hardhat.ts`, `phase8.security.test.ts` (section 2) |
| **Concurrent Double Confirm** | Firing simultaneous payment confirmations for one intent | Atomic Firestore transaction transitions status `created -> approved`. Exactly one request claims the intent; concurrent requests receive 409 `INTENT_ALREADY_USED`. | `phase8.security.test.ts` (section 2) |
| **Passkey Assertion Replay** | Replaying a captured WebAuthn assertion | WebAuthn challenge is single-use, bound to the intent hash, stored server-side with TTL, and atomically deleted inside a Firestore transaction upon consumption. | `phase8.security.test.ts` (section 1), `phase3.test.ts` |
| **Cross-Intent Challenge Reuse** | Using a challenge from Intent A to authorize Intent B | Backend checks `challengeData.intentId === intent.intentId` and verifies challenge equals `keccak256(intentId)`. Mismatches are rejected with `CHALLENGE_MISMATCH`. | `phase8.security.test.ts` (section 1) |
| **PIN Brute-Force & Guessing** | Online brute-force attack on student PIN | Argon2id hashing (19 MiB memory, 2 iterations, 1 lane). After 5 failed attempts across verify or confirm, account is locked for 15 minutes (`PIN_LOCKED` / `ACCOUNT_LOCKED`). Predictable PINs rejected upon setup (`PIN_TOO_WEAK`). | `phase8.security.test.ts` (section 3), `phase3.test.ts`, `phase4.test.ts` |
| **Self-Payment Exploit** | Merchant/student pays themselves to churn or fake volume | Contract reverts with `SelfPayment()` if `user == merchant`. Backend rejects at options generation and confirmation if `intent.merchantUid === caller.uid` or wallet addresses match. | `FingerPay.hardhat.ts`, `phase8.security.test.ts` (section 2) |
| **Inactive Merchant Abuse** | Taking payments while deactivated | Contract reverts with `MerchantNotActive()`. Backend validates merchant active status in Firestore and on-chain before intent creation and payment execution. | `FingerPay.hardhat.ts`, `phase4.test.ts`, `phase8.security.test.ts` |
| **Underfunded Payment** | User initiates payment exceeding balance | Contract reverts with `InsufficientBalance()`. Backend pre-checks on-chain balance and rejects with 400 `INSUFFICIENT_BALANCE`. | `FingerPay.hardhat.ts`, `phase8.security.test.ts` (section 2) |
| **Direct Contract Bypass** | Non-relayer invokes contract `pay()` directly | Contract enforces `onlyRole(RELAYER_ROLE)` on `pay()`. Unauthorized accounts revert with `AccessControlUnauthorizedAccount`. | `FingerPay.hardhat.ts` |
| **Emergency Halt Bypass** | Executing transactions during emergency | `pause()` gates `mint`, `pay`, `refund`, and `settle` with `whenNotPaused`. Backend checks `isPaused()` and rejects with 503 `SYSTEM_PAUSED`. | `FingerPay.hardhat.ts`, `phase5.test.ts` |
| **Data Leakage & IDOR** | User inspects another user's balance, PIN, or audit logs | Firestore security rules block client reads of `pinSecrets`, `passkeys`, `adminLogs`, and other `users/{uid}`. API endpoints filter records strictly by verified token UID. | `phase3.rules.test.ts`, `phase8.security.test.ts` (section 4 & 5) |
| **Information Disclosure** | Server stack trace or database errors exposed to client | Standard error handler catches unhandled exceptions and returns generic `{ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }`. Logger redacts authorization headers, PINs, assertions, and private keys. | `phase8.security.test.ts` (section 5), `foundation.test.ts` |
| **DoS / Payload Flooding** | Attacker spams large bodies or floods sensitive routes | Global API rate limiting (120 req/min), dedicated passkey rate limiting (20 req/min), payment confirm rate limiting (10 req/min), and strict JSON body limit (`MAX_JSON_BODY_BYTES` = 64KB, returns 413). | `app.ts`, `phase8.security.test.ts` (section 5) |

---

## 4. Honest Architectural Limitations & Residual Risks

1. **Trusted Centralized Components:**
   - The backend server, serial relayer, and Campus Accounts Administrator are trusted components. FingerPay is an authorized, closed-loop campus payment system, not a trustless decentralized protocol. Compromise of the server environment or admin key could allow unauthorized administrative actions.
2. **Malicious Client Display Risk:**
   - If an attacker compromises a student's smartphone OS or browser display, malicious software could render a false merchant name or amount on the client screen while submitting an assertion for a different intent. Mitigated by explicit visual verification against the physical merchant POS terminal display and short intent TTL (120s), but impossible to eliminate cryptographically without dedicated hardware secure elements.
3. **Single Admin Key Authority:**
   - In the current implementation, administrative actions (`mint`, `refund`, `settle`, `pause`) rely on a single Campus Accounts administrator role without multi-signature or timelock requirements.
4. **Low-Entropy PIN Offline Guessing:**
   - Student PINs are 4 to 6 numeric digits. While Argon2id with 19 MiB memory and 15-minute online lockout prevents online brute-force attacks, low-entropy PINs remain vulnerable to offline dictionary guessing if `pinSecrets` database records are ever exfiltrated.
5. **Deterministic Custodial Wallet Derivation:**
   - Student wallet addresses are derived on the server via `keccak256(uid + WALLET_SALT)`. Users do not hold individual EVM private keys; transactions are authorized via WebAuthn and submitted by the relayer. Exposure of `WALLET_SALT` permits linkability between Firebase UIDs and on-chain addresses.
6. **No Offline Payment Mode:**
   - Payment intent creation, WebAuthn challenge resolution, and on-chain execution require continuous network connectivity between the merchant terminal, student client, backend API, Firebase, and the EVM blockchain.
7. **Demo Closed-Loop Token:**
   - CampusCoin (CPC) is a closed-loop demonstration token with zero monetary guarantee and no fixed exchange rate. Real rupee reconciliation and merchant disbursements occur strictly outside the application by campus accounts staff.
