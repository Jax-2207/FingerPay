---
name: webauthn-review
description: Review FingerPay WebAuthn registration and assertion flows for challenge binding, origin/RP ID, credential ownership, user verification, replay, expiry, counters, and sensitive logging. Use for passkey changes; not unrelated auth.
---

# WebAuthn review

Review the implemented flow against `docs/BUILD_GUIDE.md` and `docs/THREAT_MODEL.md`. Record verified behavior separately from assumptions. This skill reviews; it does not implement fixes.

## Review checks

1. **Challenge representation and binding:** Trace the challenge from server generation through browser options and assertion verification. Confirm that bytes are encoded exactly once, the verified challenge is the one issued to the client, and the server binds it to the authenticated user, operation purpose, exact payment intent when applicable, and expiry.
2. **Freshness and replay:** Confirm challenges cannot be reused after consumption, across users, intents, or purposes, or after expiry. Review retry behavior and whether a new challenge can make an old assertion valid again.
3. **Origin and RP ID:** Confirm expected origin and relying-party ID come from trusted configuration, match the intended application origin, and are checked during verification.
4. **Credential ownership:** Confirm only credentials registered to the authenticated account are accepted and public-key material is read from the trusted server store.
5. **User verification and counters:** Require user verification where the product flow requires it. Check counter updates and handle authenticators that report zero counters according to the library's behavior.
6. **Account and operation binding:** Confirm the subject is approved and authorized for the requested action before any protected operation is submitted. For payments, verify merchant, amount, expiry, and one-time intent state remain bound through contract submission.
7. **Data handling:** Keep private keys, PINs, raw biometric data, assertions, bearer tokens, and secrets out of logs and client persistence. Store only required credential metadata and public keys.
8. **Evidence:** Require tests for the exact encoded challenge, successful verification, wrong-user/wrong-intent rejection, expiry, replay, and relevant retry behavior. Do not claim a control is verified when its test or runtime evidence is absent.

## Review output

Record scope, inspected files and tests, findings with severity and evidence, residual risks, and `PASS`, `REVISE`, or `BLOCKED`. A security-sensitive semantic change that conflicts with the BUILD_GUIDE requires an explicit user decision and a recorded update before implementation.
