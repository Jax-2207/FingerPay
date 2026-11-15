# Payment WebAuthn challenge correctness

- ID/title: F-004 — Payment challenge correctness and retry freshness
- Status: APPROVED for implementation by user on 2026-11-15; user approved fresh per-attempt challenges after security review
- Owner: Codex / project lead
- Problem/user value: Payment confirmation fails with `Challenge hash mismatch` because the server supplies a base64url string to SimpleWebAuthn, which encodes string input as UTF-8 and base64url-encodes it again. The deterministic intent hash also repeats across retries, so a previous assertion could be replayed against a newly issued challenge record for the same intent.
- Scope / out of scope: Generate a fresh random 32-byte challenge per payment authorization attempt; store the exact challenge with the authenticated UID, intent ID, purpose, and expiry; atomically consume the record; verify the assertion against the stored challenge; update BUILD_GUIDE/threat model and tests. Out of scope: changing registration/passkey onboarding, PIN flow, contract/API shape, intent computation, or submitting a live student payment.
- User flows: Student opens a payment intent, approves a fresh passkey challenge, enters PIN, and receives confirmation only after the existing checks and on-chain transaction.
- Data/permissions: Challenge remains short-lived operational metadata in `webauthnChallenges`. No credential material or assertions are added to persistent records. No new endpoint or permission is introduced.
- Testable acceptance criteria:
  1. Each payment auth-options response contains a fresh random 32-byte challenge encoded exactly once as base64url, including retries for the same intent.
  2. The challenge record binds that exact challenge to UID, intent ID, payment purpose, and intent expiry; confirm atomically consumes it.
  3. A valid assertion for the issued challenge passes; an assertion signed for a previous challenge fails if paired with a newly issued challenge record.
  4. Cross-user, cross-intent, expired, and already-consumed challenges remain rejected; origin, RP ID, credential-owner, UV, PIN, limit, and on-chain checks remain intact.
  5. Challenge bytes are never logged, and no payment occurs during QA.
- Risks/open questions: The decision changes the BUILD_GUIDE's prior deterministic challenge wording. The approved design keeps intent binding server-side in the atomic challenge record and requires that same binding test coverage.
