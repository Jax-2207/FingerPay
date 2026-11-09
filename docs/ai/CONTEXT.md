# Context map

All product/technology below is **PLANNED** unless stated otherwise. No app implementation exists.

## PLANNED: Product and roles
Biometric payment using fingerprint + four-digit PIN and virtual tokens (1 INR = 1 token); roles User, Merchant, SuperAdmin. Flow: register, KYC, approval, recharge, merchant amount, fingerprint, PIN, transfer, transaction and ledger record. Token/compliance model unresolved. See `PROJECT-BRIEF.md`, `DECISIONS.md`.

## PLANNED: Modules
Auth/roles; KYC review; simulated wallet recharge; fingerprint/payment; hash-chained ledger; transaction history/expense dashboard; offers; admin analytics. Future scope, not v1: gateway/UPI, QR/NFC, AI fraud detection, multiple biometrics, offline, mobile apps.

## PLANNED: Entities
User, MerchantProfile, KycRequest, WalletTransaction, LedgerBlock, Offer, AuditLog (schemas TBD).

## PLANNED: Stack/structure
React, Tailwind, Framer Motion, Firebase Auth, Firestore, Cloud Functions, Cloudinary, WebAuthn, hashed PIN, SHA-256 ledger are proposals only. Single app vs monorepo unresolved. See `WORKTODO.md`.

## IMPLEMENTED: Scaffold
Docs/config only; no application code/runtime behavior. Check script is a stub. See `CHANGES.md`.
