# Payment challenge design

## Current failure

`phase4.ts` computes a base64url string from the 32-byte intent identifier and passes that string to `generateAuthenticationOptions`. The installed SimpleWebAuthn implementation treats string input as UTF-8 bytes before base64url encoding, so it returns a different challenge. The confirm path compares that value with the original intent bytes and rejects it. The test mock currently returns string inputs unchanged, masking the real library behavior.

## Approved design

1. Generate 32 cryptographically random bytes for every payment auth-options request.
2. Pass the bytes (`Uint8Array`/`Buffer`) to SimpleWebAuthn so it emits the canonical base64url challenge exactly once.
3. Store the returned challenge in the existing challenge record with `uid`, `intentId`, `purpose: payment`, and the intent expiry.
4. During confirm, atomically verify the stored record matches caller and current intent and consume it. Verify the assertion against that exact stored challenge, configured origin/RP ID, the caller-owned public credential, and required user verification.
5. Remove the deterministic comparison against a challenge derived directly from the intent ID. Intent binding is enforced by the challenge record's `intentId` equality inside the atomic transaction. A newly requested attempt gets a different challenge, so an assertion from a prior attempt cannot satisfy it.

## Security review

- Challenge bytes: the raw 32-byte random value is supplied to the real library; only the library's returned base64url value is stored/returned. It is not base64url-encoded before passing to the library.
- User/intent/purpose/expiry binding: kept in the existing Firestore record and checked before assertion verification; a cross-intent or cross-user record is rejected and atomically consumed.
- Replay: one challenge record is consumed atomically. A subsequent auth-options call creates distinct bytes, so a prior assertion cannot be reused with the fresh record. Confirmed/expired intents remain unavailable.
- Origin/RP ID and credential binding: `expectedOrigin` and `expectedRPID` remain config-bound; the assertion credential ID must belong to the caller; verification still requires user verification; counters are updated as before.
- PIN, balance, limits, intent state, and relayer ordering remain unchanged. No assertions, PINs, or challenge values are logged.
- Verification evidence is defined in `03-plan.md` and `05-test-plan.md`.

No additional architecture change or data migration is required. The user explicitly approved updating the BUILD_GUIDE's deterministic challenge wording.
