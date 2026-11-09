# FingerPay context map

This file maps the authoritative architecture and current repository state; it is not a copy of source. **No application functionality has been implemented.** `docs/BUILD_GUIDE.md` Parts A-E is authoritative for product and technical requirements.

## PLANNED: Product and roles
FingerPay is a closed-loop campus payment demo using CampusCoin (CPC), with no monetary guarantee. Roles are User (student), Merchant, and Admin (Campus Accounts). Students use a pre-approved PRN allowlist, a WebAuthn passkey, and an application PIN. See `docs/ai/PROJECT-BRIEF.md` and guide Parts B1-B3.

## PLANNED: Architecture and modules
The EVM contracts are the source of truth for balances and token movements. Firebase Authentication/custom claims authenticate and authorize users. A Node/Express TypeScript backend verifies requests and submits contract calls through a trusted relayer. Firestore holds profiles, intents, transaction history, settlements, analytics, and operational metadata only. The React/Vite/Tailwind PWA supports User, Merchant, and Admin flows. See guide Parts B4-B6.

## PLANNED: Data map
Guide B8 defines PRN allowlist and user profiles; passkey public credentials; protected PIN hashes/lockout state; merchant profiles; payment intents; transactions; mints; settlements; indexer state; and admin logs. Contract token balances and payment state remain on-chain.

## IMPLEMENTED: Phase 0 repository tooling
pnpm workspaces (`contracts`, `shared`, `backend`, `frontend`), strict TypeScript configuration, ESLint/Prettier, Husky/lint-staged, root scripts, Firebase Auth/Firestore emulator configuration, safe `.env.example`, GitHub Actions CI, README setup, and one placeholder test per package plus configuration checks. Exact versions are recorded in `docs/DECISIONS.md`. Package contents are skeletons only; there are no contracts, business APIs, authentication flows, payment behavior, or product UI flows.

## PLANNED: Product implementation stack
Solidity, Hardhat, OpenZeppelin, TypeChain, ethers; Express, Zod, Pino, Firebase Auth/Admin, Firestore, WebAuthn, Argon2id, React/Vite/Tailwind, Hardhat tests, rules tests, and Playwright remain planned for their roadmap phases. See guide B5 and `docs/DECISIONS.md`.

## PLANNED: Phase status
Phase 0 repository scaffolding and checks are complete and signed off. Phase 1 is unblocked but has not started. Product/application features remain PLANNED. Phase roadmap and verification evidence are in `docs/PROGRESS.md` and `docs/ai/WORKTODO.md`.

## IMPLEMENTED: Repository guidance and Phase 0 tooling
Agentic workflow/configuration and Phase 0 repository tooling exist. This does not mean product functionality is implemented. The full threat model remains planned for Phase 8; current architecture notes are in `docs/THREAT_MODEL.md`.

## Canonical references
- Technical specification: `docs/BUILD_GUIDE.md`
- Active decisions: `docs/DECISIONS.md`
- Phase progress: `docs/PROGRESS.md`
- Threat model: `docs/THREAT_MODEL.md`
- Workflow protocol: `docs/ai/CODEX_AGENTIC_EXECUTION.md`
- Historical superseded proposals: `docs/ai/DECISIONS.md`
