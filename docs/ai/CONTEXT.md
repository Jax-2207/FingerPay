# FingerPay context map

This file maps the authoritative architecture and current repository state; it is not a copy of source. Phase 1 smart contract functionality is implemented and verified; later product functionality remains PLANNED. `docs/BUILD_GUIDE.md` Parts A-E is authoritative for product and technical requirements.

## PLANNED: Product and roles

FingerPay is a closed-loop campus payment demo using CampusCoin (CPC), with no monetary guarantee. Roles are User (student), Merchant, and Admin (Campus Accounts). Students use a pre-approved PRN allowlist, a WebAuthn passkey, and an application PIN. See `docs/ai/PROJECT-BRIEF.md` and guide Parts B1-B3.

## PLANNED: Architecture and modules

The EVM contracts are the source of truth for balances and token movements. Firebase Authentication/custom claims authenticate and authorize users. A Node/Express TypeScript backend verifies requests and submits contract calls through a trusted relayer. Firestore holds profiles, intents, transaction history, settlements, analytics, and operational metadata only. The React/Vite/Tailwind PWA supports User, Merchant, and Admin flows. See guide Parts B4-B6.

## PLANNED: Data map

Guide B8 defines PRN allowlist and user profiles; passkey public credentials; protected PIN hashes/lockout state; merchant profiles; payment intents; transactions; mints; settlements; indexer state; and admin logs. Contract token balances and payment state remain on-chain.

## IMPLEMENTED: Phase 0 tooling and Phase 1 contracts

Phase 0 provides pnpm workspaces (`contracts`, `shared`, `backend`, `frontend`), strict TypeScript, ESLint/Prettier, hooks, root scripts, Firebase emulator configuration, safe `.env.example`, CI and placeholder tests. Phase 1 adds CampusCoin and FingerPay contracts, Hardhat/TypeChain setup, contract tests, local deploy/seed/ABI scripts and generated ABIs under `packages/shared/src/abi/`. No backend APIs, onboarding, authentication flows, payment APIs, or product UI flows are implemented yet.

## IMPLEMENTED / PLANNED: Product implementation stack

Solidity, Hardhat, OpenZeppelin, TypeChain and ethers are implemented for Phase 1. Express, Zod, Pino, Firebase Auth/Admin, Firestore, WebAuthn, Argon2id, React/Vite/Tailwind, rules tests and Playwright remain planned for later phases. See guide B5 and `docs/DECISIONS.md`.

## IMPLEMENTED: Phase status

Phases 0, 1, 2, 3, 4, 5, 6, and 7 are complete and signed off. Phase 8 (Hardening, security, and E2E tests) is the next planned phase. Roadmap and verification evidence are in `docs/PROGRESS.md` and `docs/ai/WORKTODO.md`.

## IMPLEMENTED: Repository guidance, tooling, contracts, onboarding, payment pipeline, contract controls, student, merchant, and admin frontends

Agentic workflow/configuration, Phase 0 tooling, Phase 1 smart contracts, Phase 2 shared schemas/backend foundation, Phase 3 student onboarding/passkeys/PIN, Phase 4 merchant management, minting, payment authorization pipeline, blockchain indexer, Phase 5 payment refunds, merchant settlement, emergency circuit breaker, admin audit logging, Phase 6 student frontend PWA, and Phase 7 merchant portal (terminal, QR, settlements) and admin console (user/merchant directory, PRN import, minting, refunds, settlement burns, circuit breaker, audit logs) exist and are verified. Hardening, security audits, and Playwright E2E tests remain planned for Phase 8. The full threat model remains planned for Phase 8; current architecture notes are in `docs/THREAT_MODEL.md`.

## Canonical references

- Technical specification: `docs/BUILD_GUIDE.md`
- Active decisions: `docs/DECISIONS.md`
- Phase progress: `docs/PROGRESS.md`
- Threat model: `docs/THREAT_MODEL.md`
- Workflow protocol: `docs/ai/CODEX_AGENTIC_EXECUTION.md`
- Historical superseded proposals: `docs/ai/DECISIONS.md`
