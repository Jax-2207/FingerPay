# FingerPay (CampusCoin) — Build Guide

> **Project:** FingerPay — Passkey-secured campus token payments with an on-chain ledger  
> **Course:** Mini Project-III (UCBIL0571)  
> **Institution:** KIT’s College of Engineering, Kolhapur  
> **Team:** 4 members  
> **Status:** Authoritative implementation specification  
>
> This document supersedes earlier FingerPay proposals that described Aadhaar/PAN KYC, INR-pegged tokens, Cloud Functions, Cloudinary, Firestore-controlled balances, or a SHA-256 hash-chained database ledger.

## How to use this guide

1. Keep this file at `docs/BUILD_GUIDE.md`.
2. Copy **Part A — Master Rules** into the root `AGENTS.md`, then add the repository's agentic workflow rules without weakening Part A.
3. Implement **one phase at a time** from Part D.
4. Before implementation, follow the agentic workflow in `docs/ai/CODEX_AGENTIC_EXECUTION.md` if that file exists: intake, architecture review, task plan, roundtable, Senior Dev approval, implementation, review, QA, security review where applicable, sign-off, and context update.
5. A phase is complete only when its acceptance criteria pass, required tests pass, documentation is updated, and its commit/tag is verified.
6. Never ask an agent to build the entire project in one prompt.
7. If this guide conflicts with old project documents, this guide is authoritative for FingerPay product and technical requirements. Preserve useful historical material only when clearly marked superseded.

---

# PART A — MASTER RULES

Copy this part into the root `AGENTS.md`. The agentic workflow may be appended, but these rules must not be weakened.

## A1. Non-negotiable constraints

1. **No real money.** The only unit is CampusCoin (CPC), a demo token with no monetary guarantee. Never add payment gateways, bank APIs, UPI, Razorpay, or anything that touches rupees.
2. **No real identity documents.** No Aadhaar, PAN, or document uploads. Identity is a college PRN that Campus Accounts has pre-approved. Do not add Cloudinary.
3. **No biometric data stored by the application.** Fingerprints stay on the user's phone/authenticator. The server stores only WebAuthn public keys, credential IDs, counters, and required credential metadata.
4. **Closed loop.** CPC can only be minted by Campus Accounts, spent at registered merchants, refunded, and burned at settlement. There are no user-to-user transfers and no cash-out in the app.
5. **The smart contract is the source of truth for balances.** Firestore holds profiles, history, intents, analytics, and operational metadata only. Never treat a Firestore number as a balance.
6. **Secrets never enter the repository.** Use ignored `.env` files and a committed `.env.example`.
7. **Be honest about trust.** The backend, relayer, and Campus Accounts admin are trusted. Do not claim the system is fully decentralized.
8. Never claim CPC is redeemable at a fixed rupee rate. Any settlement in rupees happens outside the app through Campus Accounts.
9. Never expose admin or relayer private keys to the frontend, browser, client logs, source control, or public artifacts.
10. Never store PINs, raw WebAuthn assertions, biometric samples, or private keys in logs.

## A2. Engineering rules

- Language: TypeScript everywhere (strict mode, no `any`); Solidity for contracts.
- Package manager: pnpm workspaces. Use Node.js 20 or 22 LTS.
- Validate every external input with Zod. Share schemas from `packages/shared`.
- Token amounts are integers (CPC has 0 decimals). Use `bigint` in code and decimal strings in JSON.
- Pin dependency versions exactly. Use stable versions available when implementation begins and record chosen versions in `docs/DECISIONS.md`.
- Every feature ships with tests. A phase without passing required tests is not done.
- Use small commits with Conventional Commit messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Log with Pino. Never log PINs, private keys, assertions, bearer tokens, or secrets.
- Error responses always use `{ "error": { "code": "STRING_CODE", "message": "human text" } }`.
- If the specification is ambiguous, choose the simplest safe option, record it in `docs/DECISIONS.md`, and continue unless the ambiguity affects architecture, security, data model, contract behavior, or product semantics; in those cases request approval.
- If an API or dependency has changed, implement the closest safe working alternative, document the deviation in `docs/DECISIONS.md`, and test it.
- Never delete or weaken a test to make it pass.
- At the end of each phase, update `docs/PROGRESS.md` with what was built, what was tested, results, and known gaps.

## A3. Definition of done (every phase)

- All tasks in the phase are implemented.
- Acceptance criteria pass.
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass from the repository root.
- Relevant build, integration, rules, security, and E2E tests pass where required by the phase.
- `.env.example` and README commands are updated.
- `docs/PROGRESS.md` is updated.
- Relevant agentic living documents are updated, if present: `docs/ai/CONTEXT.md`, `WORKTODO.md`, `CHANGES.md`, and `KNOWN-ISSUES.md`.
- The work is committed using Conventional Commits.
- The `phase-N` tag exists and points to the intended commit. Do not claim this unless verified.

---

# PART B — PRODUCT AND TECHNICAL SPECIFICATION

## B1. What we are building

FingerPay is a closed-loop campus payment system. Students pay registered campus merchants using a phone passkey (WebAuthn user verification, typically fingerprint or device PIN) plus an application PIN. Balances and payments are recorded by EVM smart contracts.

Campus Accounts controls token issuance outside the app: a student pays the accounts office through the institution's normal process, then an authorized admin mints demo CPC against a receipt reference. Merchants request settlement in CPC; Campus Accounts approves and burns those tokens on-chain, then pays the merchant in rupees outside the app. The app does not process or transfer real money.

## B2. Roles

| Role | Permissions |
|---|---|
| **Admin (Campus Accounts)** | Import PRN allowlist; approve users and merchants; mint CPC against a receipt reference; approve refunds and settlements; pause/unpause the system; view audit logs and operational information. |
| **Merchant** | Apply for merchant status; create payment requests/QR codes; see payment status live; view transaction history; request settlement. |
| **User (student)** | Sign up using an allowlisted PRN; register a passkey and PIN; scan a merchant QR; pay; view on-chain balance, history, and spending analytics. |

Role assignment is controlled by backend-verified Firebase custom claims. A user must not be able to grant themselves a role or approval status.

## B3. End-to-end flows

### Top-up (outside app → inside app)

1. Student pays cash or completes the institution's normal fee/receipt process at the accounts office.
2. Admin opens the Mint screen and enters the student's PRN, integer CPC amount, and receipt reference.
3. Backend authenticates the Admin and calls the contract's `mint()`.
4. The contract emits `Minted`.
5. The indexer records the mint metadata; the displayed balance is read from the chain.

### Payment

1. Merchant enters an amount. Backend creates a payment intent with a cryptographically random nonce and a two-minute expiry.
2. Backend returns a short intent URL for a QR code.
3. Student scans the QR. The app fetches the intent and displays merchant name and exact amount.
4. Student taps Pay. The app requests WebAuthn authentication options whose challenge is bound to the exact intent identifier/hash.
5. Student approves using device user verification (for example fingerprint).
6. Student enters the application PIN.
7. App sends `{ assertion, pin }` to the backend.
8. Backend verifies the WebAuthn assertion, PIN (Argon2id with lockout), approval status, balance, limits, intent status, and expiry.
9. The relayer calls `FingerPay.pay(...)`.
10. Contract rejects reused/expired intents, inactive merchants, invalid amounts, and insufficient balances.
11. The indexer observes the `Payment` event and writes transaction history to Firestore.
12. Merchant screen updates to confirmed.

### Refund

Admin selects a confirmed transaction and authorizes `refund()`. Tokens move from the merchant account back to the original user account. Refunds are not cash refunds.

### Settlement

1. Merchant requests settlement of N CPC.
2. Admin reviews and approves or rejects the request.
3. Approval calls `settle()`, which burns N CPC from the merchant's on-chain balance.
4. Campus Accounts pays the merchant in rupees outside the app through its normal process.
5. Admin marks the request as paid after that external payment is completed.

## B4. Architecture

```text
 Student phone (PWA)       Merchant device (PWA)        Admin browser (PWA)
        |                         |                            |
        +-------------------------+----------------------------+
                                  |
                       Firebase Auth + HTTPS
                                  |
                                  v
                     Backend (Node + Express + TS)
              +-----------------+------------------+
              | WebAuthn        | PIN (Argon2id)    |
              | Intent + limits | Auth + roles      |
              +-----------------+------------------+
                                  |
                          Serial relayer queue
                                  |
                 +----------------+----------------+
                 |                                 |
                 v                                 v
          EVM chain                           Firestore
     CampusCoin + FingerPay          profiles, intents, history,
                                     settlements, analytics, logs
                 ^                                 |
                 |                                 |
                 +---------- Event indexer --------+
```

**Trust assumptions:** backend, relayer signing key, and Campus Accounts admin are trusted. The chain provides a public, tamper-evident record of contract state changes and events; it does not make the overall application trustless. User and merchant addresses are contract account identifiers controlled by contract logic, not by user-held private keys.

## B5. Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | pnpm workspaces | `contracts`, `shared`, `backend`, `frontend` |
| Contracts | Solidity `^0.8.24`, Hardhat, OpenZeppelin Contracts v5, TypeChain, ethers v6 | Local node first, then one EVM testnet |
| Backend | Node 20/22, Express, TypeScript, Zod, Pino, Helmet, express-rate-limit | Plain Express server, not Cloud Functions |
| Biometrics | `@simplewebauthn/server`, `@simplewebauthn/browser` | Passkeys; `userVerification: "required"` |
| PIN | `argon2` | Argon2id; server-side verification only |
| Authentication | Firebase Auth (email/password and Google) with custom claims for role | Firebase Admin SDK on backend |
| Data | Firestore | Firebase Emulator Suite for development and tests |
| Frontend | React, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, Recharts, `qrcode.react`, QR scanner library (`@yudiel/react-qr-scanner` or `html5-qrcode`) | Installable PWA |
| Tests | Hardhat tests (chai), Vitest, `@firebase/rules-unit-testing`, Playwright | Playwright Chromium virtual WebAuthn authenticator |
| Tooling | ESLint, Prettier, Husky, lint-staged, GitHub Actions CI |  |

Hosting note: WebAuthn and camera access require HTTPS or `localhost`. For phone testing, use a Cloudflare Tunnel/ngrok URL or HTTPS deployments. WebAuthn `rpID` must equal the frontend's domain. Backend validates `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` from environment configuration.

## B6. Repository structure

```text
fingerpay/
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── .github/workflows/ci.yml
├── docs/
│   ├── BUILD_GUIDE.md
│   ├── DECISIONS.md
│   ├── PROGRESS.md
│   ├── THREAT_MODEL.md
│   ├── DEMO_SCRIPT.md
│   └── REPORT_MATERIAL.md
├── packages/
│   ├── contracts/
│   │   ├── contracts/ (CampusCoin.sol, FingerPay.sol)
│   │   ├── test/
│   │   ├── scripts/ (deploy.ts, seed.ts, export-abi.ts)
│   │   └── hardhat.config.ts
│   ├── shared/
│   │   └── src/ (schemas, types, constants, intent.ts, abi/)
│   ├── backend/
│   │   └── src/
│   │       ├── index.ts, app.ts, config.ts
│   │       ├── middleware/ (auth, role, rateLimit, error)
│   │       ├── routes/ (auth, passkey, pin, intents, payments, merchants, admin, history)
│   │       ├── services/ (chain, relayer, webauthn, pin, limits, indexer, audit)
│   │       └── lib/ (firebase, logger, errors)
│   └── frontend/
│       └── src/ (pages, components, hooks, lib, routes)
└── firebase/
    ├── firestore.rules
    ├── firestore.indexes.json
    └── firebase.json
```

The agentic repository may additionally contain `.codex/`, `.agents/`, `docs/ai/`, and templates. Those support the development workflow and do not replace the application structure above.

## B7. Smart contract specification

### CampusCoin.sol

Use OpenZeppelin ERC20. Token name `CampusCoin`, symbol `CPC`, and `decimals() = 0`.

- Has one `controller` address (the FingerPay contract), set once by the deployer through `setController`.
- `controllerTransfer(from, to, amount)`, `controllerMint(to, amount)`, and `controllerBurn(from, amount)` are callable only by the controller.
- Public `transfer`, `transferFrom`, and `approve` always revert with `TransfersDisabled()`.
- User and merchant addresses have no private keys; an address is an account identifier derived by the backend (see B9).

### FingerPay.sol

Use OpenZeppelin `AccessControl`, `Pausable`, and `ReentrancyGuard` where relevant.

Roles:
- `DEFAULT_ADMIN_ROLE`: Campus Accounts.
- `RELAYER_ROLE`: backend relayer.

State:
- `CampusCoin public immutable token`
- `mapping(address => bool) public merchantActive`
- `mapping(bytes32 => bool) public intentUsed`
- `mapping(bytes32 => PaymentRecord) public payments`
- `PaymentRecord { address user; address merchant; uint256 amount; bool refunded; }`

Functions:

```solidity
function registerMerchant(address merchant, bytes32 metaHash) external onlyRole(DEFAULT_ADMIN_ROLE);
function deactivateMerchant(address merchant) external onlyRole(DEFAULT_ADMIN_ROLE);
function mint(address to, uint256 amount, bytes32 receiptRef) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused;
function pay(address user, address merchant, uint256 amount, bytes32 nonce, uint64 expiry)
    external onlyRole(RELAYER_ROLE) whenNotPaused returns (bytes32 intentId);
function refund(bytes32 intentId) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused;
function settle(address merchant, uint256 amount, bytes32 settlementRef) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused;
function pause() external onlyRole(DEFAULT_ADMIN_ROLE);
function unpause() external onlyRole(DEFAULT_ADMIN_ROLE);
function computeIntentId(address merchant, uint256 amount, bytes32 nonce, uint64 expiry) public view returns (bytes32);
```

`computeIntentId`:

```solidity
keccak256(abi.encode(block.chainid, address(this), merchant, amount, nonce, expiry))
```

`pay` recomputes the identifier, binding the on-chain record to merchant, amount, nonce, expiry, chain ID, and contract address.

`pay` must revert if:
- amount is zero;
- `user == merchant`;
- merchant is not active;
- `block.timestamp > expiry`;
- intent has already been used;
- user balance is below amount.

On success it marks the intent used, stores `PaymentRecord`, calls `controllerTransfer`, and emits `Payment`.

`refund` reverts if the intent is unknown, already refunded, or merchant balance is below the amount. It transfers tokens from merchant back to user.

`settle` reverts if the merchant is unknown/inactive according to the chosen implementation policy, or the balance is too low; it burns the amount through the token controller. Record any interpretation of “unknown merchant” in `docs/DECISIONS.md`.

Events:

```solidity
event MerchantRegistered(address indexed merchant, bytes32 metaHash);
event MerchantDeactivated(address indexed merchant);
event Minted(address indexed to, uint256 amount, bytes32 indexed receiptRef);
event Payment(bytes32 indexed intentId, address indexed user, address indexed merchant, uint256 amount);
event Refunded(bytes32 indexed intentId, address indexed user, address indexed merchant, uint256 amount);
event Settled(address indexed merchant, uint256 amount, bytes32 indexed settlementRef);
```

Custom errors:
`ZeroAmount`, `SelfPayment`, `MerchantNotActive`, `IntentExpired`, `IntentAlreadyUsed`, `InsufficientBalance`, `UnknownPayment`, `AlreadyRefunded`, `TransfersDisabled`, `NotController`.

**Stretch (Phase 10 only):** verify passkey P-256 signatures on-chain using secp256r1 precompile (RIP-7212), only after confirming the chosen chain supports it.

## B8. Firestore data model

Collections are written only by the backend Admin SDK unless otherwise noted.

| Collection | Key fields |
|---|---|
| `prnAllowlist/{prn}` | `name`, `used` (bool), `importedBy`, `importedAt` |
| `users/{uid}` | `name`, `email`, `prn`, `role` (`user`/`merchant`/`admin`), `status` (`pending`/`approved`/`rejected`), `walletAddress`, `passkeyRegistered`, `pinSet`, `createdAt` |
| `passkeys/{credentialId}` | `uid`, `publicKey` (base64url), `counter`, `transports`, `createdAt` |
| `pinSecrets/{uid}` | `hash`, `failedAttempts`, `lockedUntil` — no client access ever |
| `merchants/{uid}` | `shopName`, `category`, `walletAddress`, `status`, `onChainRegisteredTx` |
| `paymentIntents/{id}` | `merchantUid`, `merchantAddress`, `amount`, `nonce`, `expiry`, `intentId`, `status` (`created`/`approved`/`submitted`/`confirmed`/`failed`/`expired`/`cancelled`), `userUid`, `txHash`, `failureReason`, `createdAt` |
| `transactions/{id}` | `intentId`, `userUid`, `merchantUid`, `amount`, `category`, `txHash`, `blockNumber`, `logIndex`, `status`, `createdAt`; ID = `txHash:logIndex` |
| `mints/{id}` | `adminUid`, `userUid`, `amount`, `receiptRef`, `txHash`, `createdAt` |
| `settlements/{id}` | `merchantUid`, `amount`, `status` (`requested`/`approved`/`paid`/`rejected`), `settlementRef`, `txHash`, `requestedAt`, `decidedAt` |
| `indexerState/main` | `lastProcessedBlock` |
| `adminLogs/{id}` | `actorUid`, `action`, `meta`, `createdAt` |

Client read access (Firestore rules):
- A user reads only their own `users`, `transactions`, and `mints` documents.
- A merchant reads only their own `merchants`, `paymentIntents`, `transactions`, and `settlements` documents.
- Admin reads operational data permitted by policy, but never `pinSecrets` or `passkeys`.
- All client writes to money-related collections are denied.
- `pinSecrets` and `passkeys` are never readable by clients.
- Users cannot modify their own `role`, `status`, or `walletAddress`.

Use backend Admin SDK for trusted writes and enforce authorization in backend routes as well as Firestore rules.

## B9. Wallet address derivation

No private keys exist for users or merchants. The backend derives an account identifier:

```ts
walletAddress = getAddress(
  "0x" + keccak256(
    abi.encodePacked("fingerpay:wallet:", uid, WALLET_SALT)
  ).slice(-40)
);
```

`WALLET_SALT` is a server secret in environment configuration. This address is an account ID inside the contract. Document in the report:

> Balances are held at addresses controlled by contract logic, not by user keys.

Do not expose `WALLET_SALT` or derived-address secrets to clients.

## B10. Backend API

All endpoints return JSON and live under `/api`. Authentication uses:

`Authorization: Bearer <Firebase ID token>`

Role comes from verified Firebase custom claims.

| Method and path | Role | Purpose |
|---|---|---|
| `POST /auth/signup-profile` | any signed-in | Create `users/{uid}` with PRN; check allowlist and mark PRN used; status starts `pending` |
| `GET /me` | any | Profile, chain-read balance, onboarding flags |
| `POST /passkey/register/options` | user, approved | WebAuthn registration options |
| `POST /passkey/register/verify` | user | Verify and store credential |
| `POST /pin/set` | user | Set 4–6 digit PIN and store Argon2id hash |
| `POST /merchant/apply` | any signed-in | Apply to become merchant |
| `POST /intents` | merchant, approved | Create payment intent `{ amount }` |
| `GET /intents/:id` | user or merchant | Intent details for payment confirmation |
| `POST /intents/:id/auth-options` | user | WebAuthn authentication options with challenge bound to intent ID |
| `POST /intents/:id/confirm` | user | Body `{ assertion, pin }`; verify pipeline and submit to chain |
| `POST /intents/:id/cancel` | merchant | Cancel unpaid intent |
| `GET /history` | user, merchant | Paginated transactions |
| `GET /analytics/spending` | user | Totals by category and day |
| `POST /settlements` | merchant | Request settlement `{ amount }` |
| `GET /admin/users?status=` | admin | List users |
| `POST /admin/users/:uid/decision` | admin | `{ approve: boolean }` |
| `POST /admin/prn/import` | admin | Import PRN allowlist from JSON or CSV |
| `POST /admin/merchants/:uid/decision` | admin | Approve/reject; approval registers merchant on-chain |
| `POST /admin/mint` | admin | `{ prn, amount, receiptRef }` |
| `POST /admin/refund` | admin | `{ intentId }` |
| `POST /admin/settlements/:id/decision` | admin | Approve (burns on-chain) or reject |
| `POST /admin/settlements/:id/mark-paid` | admin | Record external rupee payment completed |
| `POST /admin/pause` and `/admin/unpause` | admin | Circuit breaker |
| `GET /admin/logs` | admin | Audit log |
| `GET /health` | public | Liveness and chain connectivity |

### Confirm pipeline (strict order, fail closed)

1. Load intent. Require status `created`, not expired, and caller must not be the merchant.
2. Check user is `approved`, has a passkey and PIN set, and is not locked.
3. Verify WebAuthn assertion against stored credential. Expected challenge must be the exact intent hash/identifier; expected origin and rpID come from environment; require user verification. Reject non-increasing authenticator counters where the authenticator uses counters, while handling authenticators that legitimately report zero counters according to library guidance.
4. Verify PIN with Argon2id. On failure increment `failedAttempts`. After five failures, lock for 15 minutes. On success reset failure state.
5. Check chain balance, per-payment limit (default 200 CPC), and rolling 24-hour daily limit (default 500 CPC), configurable through environment.
6. In a Firestore transaction, move intent `created → approved`; this claims the intent and prevents concurrent double submission.
7. Relayer submits `pay()`. Move intent to `submitted`. Wait for one confirmation.
8. On success set `confirmed` and write transaction history. On revert set `failed` with a mapped reason. Handle uncertain RPC outcomes safely; do not blindly resubmit a possibly mined transaction.
9. Write an audit log entry. Never log PIN or assertion contents.

The contract's `computeIntentId` includes chain ID and contract address. The backend's shared intent computation and WebAuthn challenge encoding must be explicitly cross-tested against the deployed local contract. Keep one canonical byte encoding across frontend, backend, and contract; document any implementation detail needed to make the challenge exactly match.

### Rate limits

- Auth and PIN endpoints: 10 requests/minute/IP.
- Confirm endpoint: 5 requests/minute/user.
- Admin endpoints: 60 requests/minute.
- Apply appropriate additional limits to public endpoints and QR-intent creation to prevent abuse.

## B11. Frontend pages

| Route | Role | Content |
|---|---|---|
| `/login`, `/signup` | public | Email/password and Google login; PRN field on signup |
| `/pending` | user | Waiting for admin approval |
| `/onboarding` | user | Step 1 register passkey; step 2 set PIN |
| `/` | user | Dashboard, balance read from chain, recent transactions, Scan button |
| `/scan` | user | Camera QR scanner |
| `/pay/:intentId` | user | Merchant and amount, Pay button, fingerprint/passkey prompt, PIN pad, result |
| `/history` | user | Paginated history and chain explorer links |
| `/analytics` | user | Recharts spending by category and day |
| `/merchant` | merchant | Dashboard and today's total |
| `/merchant/terminal` | merchant | Amount keypad, QR display, live status via Firestore listener |
| `/merchant/transactions` | merchant | Transaction history |
| `/merchant/settlements` | merchant | Settlement requests and status |
| `/admin` | admin | Overview |
| `/admin/users`, `/admin/merchants` | admin | Approve/reject |
| `/admin/mint` | admin | Mint form with PRN, amount, receipt reference |
| `/admin/settlements`, `/admin/refunds` | admin | Approval queues |
| `/admin/chain` | admin | Contract addresses, recent events, pause switch |
| `/admin/logs` | admin | Audit log |

UI requirements:
- Mobile-first design and large tap targets.
- Clear loading, empty, success, and error states.
- Never display secrets or raw assertions.
- Show transaction hash with explorer link when `VITE_EXPLORER_URL` is configured.
- Never store PINs or bearer tokens in `localStorage`.
- PWA installability does not imply offline payments. Payments require network connectivity.

## B12. Environment variables

`.env.example` must list all variables below with empty or safe local-development values only. Never commit real secrets.

```dotenv
# Backend
PORT=4000
NODE_ENV=development
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_NAME=FingerPay
WEBAUTHN_ORIGIN=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
RELAYER_PRIVATE_KEY=
ADMIN_PRIVATE_KEY=
FINGERPAY_ADDRESS=
CAMPUSCOIN_ADDRESS=
WALLET_SALT=
MAX_PAYMENT_CPC=200
DAILY_LIMIT_CPC=500
INTENT_TTL_SECONDS=120
EXPLORER_URL=

# Frontend
VITE_API_URL=http://localhost:4000/api
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_EXPLORER_URL=
```

`ADMIN_PRIVATE_KEY` signs admin-initiated contract calls (mint, register, refund, settle) after backend authentication of the Admin user. This is a trust assumption. Keep the key in environment configuration only. Consider a production-grade secret manager for deployed environments.

---

# PART C — TESTING STRATEGY

| Level | Tool | Required coverage |
|---|---|---|
| Contract | Hardhat + chai | Every function, revert, event, role restriction, and gas report |
| Shared | Vitest | Intent hash matches contract `computeIntentId` using a local deployed contract |
| Backend unit | Vitest | PIN lockout, limits, confirm pipeline ordering, error mapping |
| Backend integration | Vitest + Firebase emulators + local Hardhat node | Onboarding, mint, pay, refund, settle |
| Firestore rules | `@firebase/rules-unit-testing` | Role read boundaries and denied money-related writes |
| E2E | Playwright Chromium virtual WebAuthn authenticator | Register passkey, set PIN, pay, merchant sees success |
| Security | Manual + scripted | Replay, expired intent, wrong PIN lockout, double confirm, role escalation, amount tampering |

Coverage targets:
- Contracts: 100% of lines and meaningful branches.
- Backend: 80%+.
- Frontend: component/hook smoke tests plus E2E for main flows.

Tests must assert both successful outcomes and expected rejections. Never weaken a test to accommodate an insecure implementation.

---

# PART D — IMPLEMENTATION PHASES

Implement one phase at a time. The agentic workflow governs how each phase is planned and reviewed; this phase roadmap governs what may be implemented.

## Phase 0 — Repository, tooling, and CI

**Goal:** a clean monorepo that installs, lints, type-checks, and tests on a fresh clone.

### Tasks

- Create the structure in B6 with pnpm workspaces, strict base TypeScript config, and per-package configs.
- Add ESLint, Prettier, Husky, and lint-staged.
- Add root scripts: `lint`, `typecheck`, `test`, `build`, `dev`.
- Add `docs/DECISIONS.md`, `docs/PROGRESS.md`, `AGENTS.md` (Part A plus agentic workflow), `.gitignore`, and `.env.example`.
- Add `firebase/firebase.json` with Auth and Firestore emulators.
- Add GitHub Actions CI: install, lint, typecheck, test.
- Add one meaningful placeholder test per package so `pnpm test` runs.
- Ensure the repository's existing agentic structure is preserved and referenced rather than replaced.

### Acceptance criteria

- Fresh clone followed by `pnpm install && pnpm lint && pnpm typecheck && pnpm test` passes.
- CI workflow exists and is valid.
- No business features or Phase 1 contracts are implemented.

### Codex prompt

> Read `AGENTS.md`, `docs/ai/CONTEXT.md`, `docs/ai/CODEX_AGENTIC_EXECUTION.md`, and `docs/BUILD_GUIDE.md` (Parts A, B5, B6, and Phase 0). Implement **Phase 0 only** using the complete repository agentic workflow. Preserve existing agents, skills, templates, and living-document conventions. Create the pnpm monorepo with packages `contracts`, `shared`, `backend`, and `frontend`, strict TypeScript, ESLint, Prettier, Husky, lint-staged, GitHub Actions CI, Firebase emulator config, docs files, and `.env.example`. Add one placeholder passing test per package. Do not implement feature code or Phase 1 contracts. Complete intake, architecture review, Tech Lead plan, tests-first plan, roundtable, Senior Dev approval, implementation, Senior Dev review, QA, applicable security review, sign-off, and context update. Run lint, typecheck, and tests; update `docs/PROGRESS.md`; commit and tag `phase-0` only if all gates pass.

## Phase 1 — Smart contracts

**Goal:** fully tested `CampusCoin` and `FingerPay` contracts exactly as specified in B7.

### Tasks

- Set up Hardhat with TypeScript, TypeChain, and gas reporter.
- Implement `CampusCoin.sol` and `FingerPay.sol` using OpenZeppelin v5.
- Write `scripts/deploy.ts`: deploy both, call `setController`, grant `RELAYER_ROLE`, and save addresses to `deployments/<network>.json`.
- Write `scripts/seed.ts` for local demo data (register merchant, mint to user).
- Write `scripts/export-abi.ts` to copy ABIs to `packages/shared/src/abi/`.
- Test mint, successful payment, all payment reverts, refund, settlement, pause, public ERC20 transfer restrictions, controller restrictions, access control, event arguments, and intent determinism.

### Acceptance criteria

- `pnpm --filter contracts test` passes with every specified revert path covered.
- Deploy script works against `hardhat node` and writes the deployment file.
- ABI export produces files in `packages/shared`.

### Codex prompt

> Implement Phase 1 from `docs/BUILD_GUIDE.md` (B7 and Phase 1 tasks). Use the agentic workflow. Create `CampusCoin.sol` and `FingerPay.sol` using OpenZeppelin v5, Hardhat, TypeChain, and ethers v6, with deploy, seed, and ABI-export scripts. Write comprehensive tests for every function, revert, event, and role. Public ERC20 transfer functions must always revert. Do not touch backend or frontend feature code. Run tests, report measured gas per function in `docs/PROGRESS.md`, and commit/tag `phase-1` only after all gates pass.

## Phase 2 — Shared package and backend foundation

**Goal:** a running authenticated Express server connected to Firebase and the chain.

### Tasks

- `packages/shared`: Zod schemas for requests/responses in B10, shared types, constants, and `intent.ts` implementing `computeIntentId(chainId, contract, merchant, amount, nonce, expiry)` exactly as the contract.
- Backend skeleton: `config.ts` with Zod-validated environment; `app.ts` with Helmet, CORS allowlist, JSON body limit, and Pino HTTP logging; standard error middleware; `/health`.
- Firebase Admin initialization, emulator-aware.
- Auth middleware verifies Firebase ID token and reads role claim; `requireRole(...)`.
- `services/chain.ts`: provider, contract instances from ABIs/deployments, chain balance reads, address derivation.
- `services/relayer.ts`: one signer with serial queue (concurrency 1), nonce handling, and custom-error decoding.
- `services/audit.ts` to write `adminLogs`.
- Integration harness starts Hardhat node, deploys contracts, starts emulators, and boots app.

### Acceptance criteria

- `GET /health` reports `ok` and chain connectivity.
- Test proves shared `computeIntentId` equals contract `computeIntentId`.
- Auth middleware rejects missing, invalid, and wrong-role tokens.

### Codex prompt

> Implement Phase 2 from `docs/BUILD_GUIDE.md` (B3, B8, B9, B10, and Phase 2 tasks). Build shared Zod schemas, types, constants, and intent computation; backend config, Express app, standard errors, Firebase Admin auth and role middleware, chain service, serial-queue relayer, audit logger, and integration harness. Add the cross-check that TypeScript intent computation equals the deployed contract. Do not implement business endpoints. Follow the agentic workflow and commit/tag `phase-2` only after all gates pass.

## Phase 3 — Onboarding: PRN, approval, passkey, and PIN

**Goal:** a student can sign up, be approved, register a passkey, and set a PIN.

### Tasks

- `POST /admin/prn/import` for JSON/CSV and `POST /auth/signup-profile`; validate allowlist, mark PRN used atomically, derive/store wallet address, status `pending`.
- `GET /admin/users` and `POST /admin/users/:uid/decision`; approval sets custom claim `role=user`.
- WebAuthn registration options/verification with `@simplewebauthn/server`; store public credential data only. Require user verification, prefer resident key, exclude existing credentials.
- Store registration challenges server-side with expiry and single use (Firestore collection or suitable short-lived store).
- PIN service: Argon2id hash/verify, 5-failure/15-minute lockout, 4–6 digits, reject trivial PINs such as `0000` and `1234`.
- Implement `/passkey/register/options`, `/passkey/register/verify`, `/pin/set`, and `/me`.
- Firestore security rules and rules tests.

### Acceptance criteria

- PRN not allowlisted and already-used PRN are rejected.
- Approved user can register passkey and set PIN; unapproved user cannot.
- Five wrong PIN attempts lock account; correct PIN during lockout is rejected.
- Rules tests prove `pinSecrets` and `passkeys` are unreadable and users cannot write `role`, `status`, or `walletAddress`.

### Codex prompt

> Implement Phase 3 from `docs/BUILD_GUIDE.md` (B8, B10, and Phase 3 tasks). Build PRN import, signup profile, admin approval with custom claims, WebAuthn passkey registration, Argon2id PIN setup/verification with lockout, `/me`, and Firestore rules with rules-unit-tests. Never store biometric data or log PINs. Write integration tests for every rejection path. Follow the agentic workflow and commit/tag `phase-3` only after all gates pass.

## Phase 4 — Merchants, mint, and payment pipeline

**Goal:** a complete secure payment from merchant QR to on-chain confirmation.

### Tasks

- Merchant onboarding: `/merchant/apply`, admin decision, on-chain merchant registration, custom claim `role=merchant`.
- `/admin/mint`: resolve PRN to wallet, call `mint`, write mint metadata and audit log.
- `/intents`: validate amount, generate random 32-byte nonce, expiry = now + `INTENT_TTL_SECONDS`, compute canonical intent ID.
- Implement intent fetch, WebAuthn auth options, strict confirm pipeline from B10, and merchant cancel.
- Limits service: per-payment and rolling 24-hour daily limits using confirmed transactions.
- Indexer listens for `Minted`, `Payment`, `Refunded`, and `Settled`; idempotently writes transaction records using `txHash:logIndex`, tracks last processed block, and backfills missed blocks.
- Expired-intent sweeper.
- `/history` and `/analytics/spending`.

### Acceptance criteria

- Happy-path integration: mint → merchant intent → user auth options → mock/virtual WebAuthn assertion and PIN → confirmed payment → correct on-chain balances → visible history.
- Rejections: expired intent, reused intent, wrong PIN/lockout, wrong challenge/assertion, insufficient balance, per-payment/daily limit exceeded, self-payment, double-confirm race, inactive merchant, paused contract.
- Indexer restart causes no duplicate or missing transactions.

### Codex prompt

> Implement Phase 4 from `docs/BUILD_GUIDE.md` (B3, B7, B10, and Phase 4 tasks). Build merchant onboarding, admin mint, payment intents, strict confirm pipeline (WebAuthn challenge bound to exact intent, then PIN, limits, Firestore claim transaction, then relayer `pay`), event indexer with backfill, expiry sweeper, history, and spending analytics. Add happy-path and every listed rejection test, including concurrent double-confirm. Follow the agentic workflow and commit/tag `phase-4` only after all gates pass.

## Phase 5 — Refunds, settlements, and circuit breaker

**Goal:** complete token lifecycle: refund, settle, and pause.

### Tasks

- Admin refund endpoint calls `refund`, updates transaction metadata, and writes audit log.
- Merchant settlement request validates amount against chain balance and prevents overlapping open requests exceeding available balance.
- Admin settlement decision: approval calls `settle` and stores reference/tx hash; rejection stores reason.
- Mark-paid records external rupee payment after approval and must enforce the state machine.
- Admin pause/unpause; payment endpoints return clear `SYSTEM_PAUSED`.
- Admin logs endpoint.
- Indexer handles `Refunded` and `Settled` and updates related statuses.

### Acceptance criteria

Test refund success, insufficient merchant funds, double refund, settlement approve/burn/balance reduction, over-balance rejection, mark-paid state machine, pause blocking `pay` and `mint`, and audit entry for every admin action.

### Codex prompt

> Implement Phase 5 from `docs/BUILD_GUIDE.md` (B3, B7, B10, and Phase 5 tasks): refunds, settlement requests and approval that burns CPC on-chain, mark-paid, pause/unpause with `SYSTEM_PAUSED`, audit logs, and indexer support. Write tests for every success and failure case. Follow the agentic workflow and commit/tag `phase-5` only after all gates pass.

## Phase 6 — Frontend foundation and student app

**Goal:** a student can complete the journey on a phone.

### Tasks

- Vite + React + TypeScript + Tailwind; React Router; TanStack Query.
- Typed API client attaches Firebase ID token and maps standard errors to user-friendly messages.
- Firebase client initialization (emulator-aware), auth context, role claims, route guards.
- Pages: login, signup with PRN, pending, onboarding with passkey and PIN, student dashboard, QR scanner, payment screen, history, analytics.
- PWA manifest and service worker for installability; no offline payments.
- Loading, empty, error, and success states; mobile-first layout.

### Acceptance criteria

With backend, emulators, and local chain running, a UI-created student can onboard and, after admin mint, scan a QR and pay. Tests cover auth guards and API error mapping. No PIN or token is stored in `localStorage` or logged.

### Codex prompt

> Implement Phase 6 from `docs/BUILD_GUIDE.md` (B5, B10, B11, and Phase 6 tasks). Build the React/Vite/Tailwind student PWA: auth, role guards, signup with PRN, passkey/PIN onboarding, dashboard, QR scanner, payment screen, history, and Recharts analytics. Use TanStack Query and typed shared schemas. Handle loading, empty, and error states. Add guard and API error-mapping tests. Follow the agentic workflow and commit/tag `phase-6` only after all gates pass.

## Phase 7 — Merchant and admin frontends

**Goal:** merchants can take payments and admins can operate the campus token system.

### Tasks

Merchant:
- `/merchant` dashboard.
- `/merchant/terminal`: amount keypad, QR, live status via Firestore listener, expiry countdown, cancellation.
- `/merchant/transactions`.
- `/merchant/settlements`.

Admin:
- Overview.
- User and merchant approval.
- PRN import.
- Mint.
- Settlement and refund queues.
- Chain page with contract addresses, recent events, and pause switch.
- Audit logs.

Destructive actions (mint, pause, refund, settle) require a confirmation dialog showing exact values. Show transaction explorer links when configured.

### Acceptance criteria

Manual walkthrough: admin imports PRNs, approves user and merchant, mints CPC, merchant creates QR, student pays, merchant sees live success, merchant requests settlement, admin approves and marks paid. Route guards prevent users from accessing merchant/admin routes.

### Codex prompt

> Implement Phase 7 from `docs/BUILD_GUIDE.md` (B11 and Phase 7 tasks): merchant terminal with QR and live status, merchant history and settlements, and full admin console. Add confirmation dialogs for destructive actions and explorer links. Add route-guard tests. Follow the agentic workflow and commit/tag `phase-7` only after all gates pass.

## Phase 8 — Hardening, security, and E2E tests

**Goal:** protect the main flows against hostile input and common attacks.

### Tasks

- Review rate limiting, Helmet, strict CORS, body limits, generic error messages, and authorization.
- Playwright E2E using Chromium virtual WebAuthn authenticator: onboarding, payment success, wrong PIN, lockout, expired QR, admin mint, refund, settlement.
- Security tests: assertion replay, assertion reuse on another intent, admin routes as user, intent amount tampering, concurrent confirms, direct contract `pay` from non-relayer.
- Write `docs/THREAT_MODEL.md`: assets, actors, trust assumptions, threats, mitigations, and known limitations (trusted relayer/admin key, malicious client display risk, single admin, demo tokens, custodial account identifiers, no offline mode).

### Acceptance criteria

E2E suite passes locally with one command. Every scripted attack is rejected. Threat model is complete and honest.

### Codex prompt

> Implement Phase 8 from `docs/BUILD_GUIDE.md` (B10, Part C, and Phase 8 tasks). Add rate limiting/security headers, Playwright virtual-WebAuthn E2E tests, scripted security tests for replay, cross-intent reuse, privilege escalation, amount tampering, concurrent confirms, and non-relayer payment. Write `docs/THREAT_MODEL.md` with honest limitations. Fix bugs without weakening tests. Follow the agentic workflow and commit/tag `phase-8` only after all gates pass.

## Phase 9 — Testnet deployment, demo mode, and documentation

**Goal:** public demo, rehearsed script, and report-ready measured material.

### Tasks

- Select one EVM testnet that is live and has a working faucet at implementation time; verify before use. Ethereum Sepolia is an example, not a guaranteed choice. If no suitable testnet is usable, retain local node and document why.
- Fund deployer, admin, and relayer accounts using testnet funds.
- Deploy and record addresses in `deployments/<network>.json`.
- Verify contracts on explorer if supported.
- Deploy backend/frontend over HTTPS or use an HTTPS tunnel for demo. Set WebAuthn RP ID/origin to frontend domain.
- Configure production Firebase rules and create first admin using a controlled one-off script.
- `pnpm demo:seed`: create demo admin, two merchants, five students with fake PRNs and minted demo balances.
- Write `docs/DEMO_SCRIPT.md`, README setup/architecture/commands, and `docs/REPORT_MATERIAL.md`.
- Report measured gas, latency, test coverage, and limitations. Never invent measurements.

### Acceptance criteria

A person with only README can run locally in under 20 minutes. Demo works on real phones over HTTPS. Report material contains actual measured numbers, not placeholders.

### Codex prompt

> Implement Phase 9 from `docs/BUILD_GUIDE.md` (Phase 9 tasks). Verify a live EVM testnet and faucet before selecting it; fall back to local node if unavailable. Add deployment configuration, demo seed with fake PRNs, README setup and architecture diagram, demo script, and report material populated only with measured gas, latency, and coverage numbers. Follow the agentic workflow and commit/tag `phase-9` only after all gates pass.

## Phase 10 — Optional stretch goal

Only after Phases 0–9 are green, choose **at most one**:

1. On-chain passkey verification using secp256r1 precompile (RIP-7212) or verified library, after confirming chain support.
2. Merkle anchoring of batches of transactions.
3. NFC campus card + PIN (Web NFC support limitations apply).
4. Offers module (Firestore only).

Keep the feature behind a feature flag, write a design note in `docs/DECISIONS.md`, and add tests without breaking existing functionality.

### Codex prompt template

> Implement stretch goal #N from Phase 10 of `docs/BUILD_GUIDE.md`. First write a short design note in `docs/DECISIONS.md` and verify the required chain/browser capability. Keep it behind a feature flag, add tests, and do not break existing tests. Follow the agentic workflow and commit/tag `phase-10` only after all gates pass.

---

# PART E — APPENDICES

## E1. Security checklist

Verify before demo:

- `pinSecrets` and `passkeys` are unreadable by clients (rules tests).
- PIN is never logged or returned; lockout works.
- WebAuthn requires user verification; challenge is single-use; origin and rpID are checked.
- Intent is short-lived, single-use, and bound to merchant, amount, nonce, expiry, chain ID, and contract address.
- `pay` is callable only by relayer on-chain.
- Public ERC20 transfer functions revert.
- Admin and relayer keys are environment-only and never frontend-visible.
- CORS allowlist and rate limits are active.
- `pause()` is tested.
- No Aadhaar, PAN, real identity documents, or real-money integrations exist.
- Demo PRNs are fake.
- Firestore is not treated as the balance source of truth.
- Refund and settlement state transitions are idempotent and auditable.

## E2. Report corrections

When preparing the academic report:

- Replace Trendzee/products/orders/wishlist content with the FingerPay data model (B8), workflows, and DFDs.
- Replace Razorpay text with the blockchain implementation: contracts, relayer, and indexer.
- Replace generic JWT descriptions with Firebase Auth, custom claims, WebAuthn, and Argon2id PIN.
- Remove “1₹ = 1 Token”. State that CPC is demo credit issued by Campus Accounts; it has no monetary guarantee.
- Remove Aadhaar/PAN uploads and Cloudinary. Describe PRN allowlist verification.
- Correct figure index to actual figures and correct any name spelling errors against the source record.
- Describe QR as an implemented payment flow; keep NFC and AI fraud detection in future scope unless separately implemented and tested.
- Describe implemented rule-based limits as fraud/risk controls, not AI fraud detection.
- Add limitations: trusted relayer, trusted admin, demo tokens, contract-controlled account identifiers, backend trust, and no offline payments.

## E3. Viva questions

1. **Why not just use a database?**  
   Merchants and Campus Accounts can independently verify mint, payment, refund, and settlement events on a public ledger rather than relying solely on the app database. The backend/relayer remain trusted components.

2. **Where is the biometric stored?**  
   The biometric sample is not stored by FingerPay. Device/authenticator verifies the user and produces a WebAuthn assertion. The server stores the public-key credential material needed to verify assertions.

3. **What stops replay?**  
   The WebAuthn challenge is bound to the payment intent; intents are short-lived and single-use in backend state and on-chain contract state. Assertions cannot authorize a different intent.

4. **What if the relayer is compromised?**  
   The relayer can call only functions allowed by its contract role. It cannot mint, refund, settle, or pause unless separately granted authority. Campus Accounts can revoke its role. Backend compromise can still disrupt or misuse valid payment flows, so the relayer/backend remain trusted.

5. **Why a closed-loop token?**  
   It models campus credits without building an in-app real-money wallet. Real money remains outside the application with Campus Accounts.

6. **What are the limitations?**  
   Trusted backend, relayer, and admin; demo-only token; contract-controlled account identifiers; single-admin assumptions unless expanded; dependence on connectivity; and no offline payments.

7. **Why WebAuthn instead of storing fingerprints?**  
   WebAuthn uses public-key cryptography and device user verification. FingerPay receives an assertion, not fingerprint data.

8. **Why is Firestore not the balance source of truth?**  
   The contract enforces token movement and exposes balances/events. Firestore is a query-friendly mirror for profiles, history, and analytics.

## E4. Glossary

- **CPC:** CampusCoin, the demo token.
- **PRN:** College Permanent Registration Number used with the pre-approved allowlist.
- **Intent:** A short-lived merchant payment request.
- **Passkey:** A WebAuthn credential whose private key remains on the authenticator/device and is unlocked through device user verification.
- **WebAuthn assertion:** Signed proof produced by the authenticator for a specific challenge.
- **Relayer:** Backend-controlled account that pays gas and submits `pay()` after backend verification.
- **Indexer:** Backend process that reads blockchain events and mirrors relevant metadata into Firestore.
- **Campus Accounts:** Authorized administrative function responsible for token issuance and external merchant settlement.
- **Closed-loop token:** Demo credit usable only within the defined campus contract flows; not a general cryptocurrency or cash equivalent.
- **RP ID:** WebAuthn relying-party identifier, normally the frontend's domain.
- **RIP-7212:** Proposed/implemented secp256r1 verification precompile support on certain EVM chains; verify actual chain support before relying on it.
