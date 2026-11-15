# F-004 implementation plan

## Tests (defined before implementation)

1. Backend auth-options integration test: decode the returned challenge and assert it is 32 bytes, canonical base64url, and distinct across two requests for the same unpaid intent.
2. Backend payment integration test: a valid assertion for the stored challenge reaches the existing confirm pipeline; the test mock must encode byte input like the pinned SimpleWebAuthn library rather than pass string input through.
3. Backend security test: after obtaining a first challenge, obtain a second challenge for the same intent and attempt to submit an assertion carrying the first challenge with the second challenge record; expect authentication rejection and no relayer call.
4. Backend security regressions: cross-user, cross-intent, expired, consumed challenge, and intent-state rejection tests continue to pass.
5. Direct library test: a 32-byte input to the installed `generateAuthenticationOptions` yields exactly the base64url representation of those bytes, guarding against accidental string double-encoding.

## Ordered tasks

- **F-004-T1 — Replace deterministic challenge with per-attempt bytes.** Update `phase4.ts` to create random bytes, store the returned challenge, and remove the deterministic expected-intent comparison while preserving atomic metadata checks and verifier configuration. Acceptance: criteria 1–4 in `01-spec.md`.
- **F-004-T2 — Make regression coverage model the real library.** Correct test mocks and add fresh-challenge/replayed-assertion coverage plus direct library encoding coverage. Acceptance: tests 1–5 above pass.
- **F-004-T3 — Align authoritative docs.** Update BUILD_GUIDE B3/B10, threat model, and living docs after checks pass. Acceptance: documented challenge semantics match verified implementation.

## Senior Developer brief

**APPROVED.** Generate random bytes with the Node cryptographic RNG for every attempt. Store only the canonical challenge string returned by SimpleWebAuthn in the existing atomic challenge record. Do not weaken user, intent, purpose, expiry, origin, RP ID, credential-owner, UV, PIN, balance, limit, or intent-state checks. No on-chain payment is authorized for this work.
