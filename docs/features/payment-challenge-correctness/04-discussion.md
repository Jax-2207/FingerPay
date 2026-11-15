# Roundtable discussion — F-004 payment challenge correctness

- **Architect:** No objection after the user's decision. The existing Firestore challenge record already binds caller, intent, purpose, and expiry; a per-attempt random challenge fits the current backend boundary and requires no schema migration or endpoint change.
- **Tech Lead:** No objection. Tests must exercise the installed library's string-versus-byte semantics and assert a fresh challenge for retries before implementation.
- **Senior Dev:** No objection. Keep the Firestore transaction as the single-use gate and ensure assertion verification still precedes PIN, limits, and relayer payment in the existing order.
- **QA Tester:** No objection with the added replay test pairing a prior assertion with a new challenge record, plus existing cross-user, cross-intent, expiry, and consumed-record cases.
- **Security Reviewer:** Review found the deterministic challenge was not fresh across retries; a prior assertion could be paired with a newly issued record for the same unpaid intent. The user approved fresh random 32-byte challenges per attempt, stored against caller and intent. The design retains exact origin/RP ID verification, credential ownership, required user verification, expiry, and atomic consumption. No remaining blocker identified for the planned change.

## Outcome

PROCEED

## Senior Developer brief

APPROVED — tests are defined before implementation; the implementation boundary is `phase4.ts`, its regression tests, and aligned challenge documentation. No contract, role, API, PIN, or payment amount semantics may change.

## Post-implementation review (2026-11-15)

- **Senior Developer:** APPROVED — Review of the implementation confirmed raw random bytes reach SimpleWebAuthn, the exact canonical challenge is stored and consumed, and existing authorization and payment ordering remains unchanged.
- **QA Tester:** PASS — Phase 4 integration passed 14/14; Phase 8 security integration passed 17/17, including a previous-attempt assertion paired with a fresh same-intent challenge. Root lint, typecheck, tests, and build passed.
- **Security Reviewer:** PASS — Challenge encoding, per-attempt freshness, atomic UID/intent/purpose/expiry binding, single use, origin/RP ID, credential ownership, required UV, and no-relayer-on-failed-assertion behavior were checked. No payment was submitted.
