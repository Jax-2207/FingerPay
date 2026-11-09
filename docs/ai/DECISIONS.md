# Historical decision proposals — SUPERSEDED

This file preserves the initial scaffold's proposed decisions for historical traceability. None is an active option or requirement. `docs/BUILD_GUIDE.md` is authoritative, and the canonical register for genuinely new or unresolved decisions is `docs/DECISIONS.md`. The old seven-item F-000 is retired; see the Phase 0–10 roadmap in BUILD_GUIDE Part D.

## ADR-0001 Customer identification at merchant device — SUPERSEDED
**Status:** SUPERSEDED by BUILD_GUIDE B2, B3, B8, and B10: onboarding is through a pre-approved PRN allowlist and the user scans a merchant payment-intent QR before passkey authorization. No alternate biometric architecture is active.
**Context:** WebAuthn proves an enrolled person is present, not which customer. **Options:** user ID/phone first; QR first; discoverable credentials; different biometric. **Decision:** TODO. **Consequences:** TODO.

## ADR-0002 Ledger block creation — SUPERSEDED
**Status:** SUPERSEDED by BUILD_GUIDE B4, B7, and B8: Solidity contracts are the source of truth for balances/payments; Firestore mirrors application metadata and indexed history. There is no hash-chained database ledger.
**Context:** ledger append-only integrity. **Options:** server Cloud Function + append-only rules; client-side. **Decision:** TODO. **Consequences:** TODO.

## ADR-0003 Wallet transfer atomicity — SUPERSEDED
**Status:** SUPERSEDED by BUILD_GUIDE B7 and B10: token movement is enforced by contract calls; Firestore transactions claim payment intents to prevent duplicate submissions. Firestore wallet balances are not used.
**Context:** avoid partial balance/record updates. **Options:** Firestore transactions + security rules; alternatives TBD. **Decision:** TODO. **Consequences:** TODO.

## ADR-0004 PIN handling — SUPERSEDED
**Status:** SUPERSEDED by BUILD_GUIDE B10: server-side Argon2id verification, 4–6 digits, and a five-failure/15-minute lockout are specified. Implementation details must follow that guide.
**Context:** four-digit payment PIN. **Options:** server hashing, attempt limits, lockout; alternatives TBD. **Decision:** TODO. **Consequences:** TODO.

## ADR-0005 KYC documents and PII — SUPERSEDED
**Status:** SUPERSEDED by BUILD_GUIDE A1, B2, and B8: no Aadhaar/PAN or document upload. Identity uses a Campus Accounts pre-approved PRN allowlist; profile and credential data still require protection.
**Context:** sensitive Aadhaar/PAN images. **Options:** Cloudinary vs Firebase Storage; access, PII handling, retention. **Decision:** TODO. **Consequences:** TODO.

## ADR-0006 Token model — SUPERSEDED
**Status:** SUPERSEDED by BUILD_GUIDE A1 and B1: CPC is a closed-loop demo token with zero decimals and no monetary guarantee; it is not pegged to INR and the app does not process real money.
**Context:** 1 INR = 1 token wording. **Options:** closed-loop simulation; real money connection (compliance implications). **Decision:** TODO. **Consequences:** TODO.

## ADR-0007 Repository structure — SUPERSEDED
**Status:** SUPERSEDED by BUILD_GUIDE B5, B6, and Phase 0: use pnpm workspaces with contracts, shared, backend, and frontend packages. Backend is Express/TypeScript, not Cloud Functions.
**Context:** planned web and functions. **Options:** single app; monorepo. **Decision:** TODO. **Consequences:** TODO.
