# Architecture reconciliation design

- Status: PLANNED
- Authority: `docs/BUILD_GUIDE.md` Parts A-E

The guide fixes a closed-loop CampusCoin (CPC) demo-credit system. It defines PRN allowlist onboarding; User, Merchant, and Admin roles; Firebase Authentication/custom claims; WebAuthn passkeys; server-side Argon2id PIN verification; Solidity contracts with Hardhat and OpenZeppelin; an Express/TypeScript backend; Firestore for application metadata/history; the contracts as balance source of truth; a React/Vite/Tailwind PWA; and pnpm workspaces.

Reconciliation keeps `docs/ai/DECISIONS.md` as an archival record of the old proposals, labels its entries SUPERSEDED, and makes `docs/DECISIONS.md` the only active decision register. `docs/PROGRESS.md` records phase status; `docs/THREAT_MODEL.md` is a planned security artifact whose full phase-8 review remains future work. The workflow protocol and context map remain in `docs/ai/`.

No new architecture decision is needed: these choices are fixed by the guide. The guide's explicit Phase 1 policy choices and exact dependency pins remain deferred until their implementation phase.

No application package, business feature, or Phase 0 tool is added by this documentation reconciliation.
