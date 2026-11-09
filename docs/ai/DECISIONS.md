# Proposed decisions

All entries **PROPOSED**, no decisions made. Resolve in F-000.

## ADR-0001 Customer identification at merchant device
**Context:** WebAuthn proves an enrolled person is present, not which customer. **Options:** user ID/phone first; QR first; discoverable credentials; different biometric. **Decision:** TODO. **Consequences:** TODO.

## ADR-0002 Ledger block creation
**Context:** ledger append-only integrity. **Options:** server Cloud Function + append-only rules; client-side. **Decision:** TODO. **Consequences:** TODO.

## ADR-0003 Wallet transfer atomicity
**Context:** avoid partial balance/record updates. **Options:** Firestore transactions + security rules; alternatives TBD. **Decision:** TODO. **Consequences:** TODO.

## ADR-0004 PIN handling
**Context:** four-digit payment PIN. **Options:** server hashing, attempt limits, lockout; alternatives TBD. **Decision:** TODO. **Consequences:** TODO.

## ADR-0005 KYC documents and PII
**Context:** sensitive Aadhaar/PAN images. **Options:** Cloudinary vs Firebase Storage; access, PII handling, retention. **Decision:** TODO. **Consequences:** TODO.

## ADR-0006 Token model
**Context:** 1 INR = 1 token wording. **Options:** closed-loop simulation; real money connection (compliance implications). **Decision:** TODO. **Consequences:** TODO.

## ADR-0007 Repository structure
**Context:** planned web and functions. **Options:** single app; monorepo. **Decision:** TODO. **Consequences:** TODO.
