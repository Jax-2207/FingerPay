# Architecture reconciliation and Phase 0 readiness

- ID/title: DOC-001 Architecture reconciliation and Phase 0 readiness
- Status: APPROVED
- Owner: Lead

## Problem and user value
The repository's initial context, brief, backlog, and proposed ADRs describe a superseded design. The authoritative `docs/BUILD_GUIDE.md` now defines a different closed-loop CampusCoin architecture. The documentation needs a consistent, reviewable baseline before Phase 0 starts.

## Scope
- Verify Parts A-E and the architecture in `docs/BUILD_GUIDE.md`.
- Preserve the agentic workflow while correcting canonical documentation references.
- Reconcile existing documentation and mark earlier proposals SUPERSEDED without erasing their history.
- Record architecture and security reviews and a roundtable outcome.
- Establish Phase 0 as ready to start only if the docs and reviews agree.

## Out of scope
- Phase 0 tooling, package skeletons, tests, dependencies, CI, or any application functionality.
- Resolving design choices the guide explicitly leaves to a later phase.
- Commit or phase tag.

## Acceptance criteria
1. The guide contains Parts A-E and specifies the expected CampusCoin, PRN allowlist, role, Firebase, WebAuthn, Argon2id, Solidity/Hardhat/OpenZeppelin, Express/TypeScript, Firestore metadata, contract-balance, React/Vite/Tailwind PWA, and pnpm workspace architecture.
2. No active document presents Aadhaar/PAN uploads, Cloud Functions, Cloudinary, INR-pegged tokens, Firestore balances, hash-chain database ledger, or SuperAdmin as current requirements.
3. Prior proposals remain as clearly marked historical SUPERSEDED material.
4. `docs/DECISIONS.md`, `docs/PROGRESS.md`, and `docs/THREAT_MODEL.md` are canonical; existing `docs/ai/` workflow docs point to them where appropriate.
5. All application capabilities remain PLANNED and Phase 0 remains unimplemented.
6. Architect, Tech Lead, Roundtable, Security Reviewer, and Senior Dev provide explicit outcomes; no unresolved blocker remains for Phase 0 readiness.

## Risks and open questions
The guide leaves a Phase 1 interpretation for settling an unknown/inactive merchant and requires dependency versions to be selected at implementation time. These are recorded as future implementation decisions, not Phase 0 architecture blockers.
