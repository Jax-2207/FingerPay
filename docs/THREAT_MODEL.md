# FingerPay threat model

**Status: PLANNED architecture baseline.** This records design-level assets, trust boundaries, and known risks from `docs/BUILD_GUIDE.md` Parts A, B, and E. It is not an audit of implemented controls. Complete and validate the threat model with Phase 8 security tests and review.

## Assets

- CPC balances, mint/payment/refund/settlement state, and contract roles on the EVM chain.
- User PRN, name, email, role, approval status, and merchant profile data.
- WebAuthn credential IDs, public keys, counters, and required metadata.
- PIN hashes and lockout state in `pinSecrets`.
- Payment intent amount, merchant, nonce, expiry, challenge binding, and status.
- Admin and relayer private keys, `WALLET_SALT`, Firebase credentials, and environment configuration.
- Transaction, mint, settlement, indexer, and admin audit metadata.
- Availability and integrity of the backend, relayer queue, Firebase services, Firestore, and chain connectivity.

## Actors and trust boundaries

- Users and merchants are authenticated but their clients/devices are untrusted inputs.
- Campus Accounts Admin is trusted for allowlist import, approvals, mint, refund, settlement, and pause actions.
- Backend and Firebase Admin SDK are trusted for server-side authorization, PIN/passkey verification, Firestore writes, and relayer submission.
- Relayer and its key are trusted to submit approved payment calls; contract roles constrain its on-chain authority.
- Solidity contracts enforce token movement and balance state. Firestore is a metadata/history mirror, not a balance authority.
- External networks, browsers, QR contents, and client-provided request data are untrusted.

## Threats and guide-specified controls (all PLANNED)

| Threat | Planned control / boundary |
|---|---|
| Forged role or self-approval | Roles come from backend-verified Firebase custom claims; backend routes and Firestore rules enforce access. Users cannot write their role, status, or wallet address. |
| Unauthorized token movement or mint | Contract access control, disabled public ERC20 transfers, and contract-only controller paths. Relayer receives only the specified relayer role; Admin controls admin functions. |
| Replay or altered payment intent | Short-lived single-use nonce/intent; challenge binds to exact intent; amount, merchant, expiry, chain ID, and contract address are included in canonical intent computation; on-chain replay rejection. |
| Concurrent/double payment submission | Firestore transaction claims `created -> approved`; serial relayer queue; on-chain used-intent check; uncertain RPC outcomes must not be blindly resubmitted. |
| PIN guessing or credential exposure | Argon2id server-side verification, five-failure/15-minute lockout, no client access to `pinSecrets`, and no PIN logging. Four-to-six-digit PIN hashes remain vulnerable to offline guessing if exposed; the guide does not specify a pepper or separate PIN secret, so do not claim that mitigation. |
| Passkey assertion replay, origin substitution, or credential theft | WebAuthn user verification required; challenge is intent-bound and single-use; expected origin/rpID come from backend environment; only public credential material is stored. No biometric sample or raw assertion is stored/logged. |
| PRN/profile data exposure | PRN allowlist and user profile are sensitive profile data. Use backend authorization and least-privilege Firestore reads; no identity document uploads are in scope. |
| Exposure of private keys or server secrets | Admin/relayer keys and `WALLET_SALT` are environment-only, never client-visible or logged; repository secrets are prohibited. Deployment secret-manager choice remains operational work. |
| Derived account identity compromise/linkability | B9 derives contract account identifiers from UID and `WALLET_SALT`. Salt exposure enables deterministic address derivation and linkability; backend or signing-key compromise can enable authorization abuse. Salt rotation may require account migration. The guide fixes this derivation for now; this note does not redesign it. |
| Database tampering or stale history | Contract state/events are authoritative for CPC. Firestore writes are backend-only and indexed transaction records use chain event identifiers; the overall backend remains trusted and the app is not trustless. |
| Service outage or malicious QR/client display | Payment requires network connectivity; intent expiry and server-side verification reduce risk. Users must verify merchant and exact amount shown by the app. Availability and malicious client display remain limitations. |

## Known limitations and validation status

- Backend, relayer, and Campus Accounts Admin are trusted components; admin compromise can authorize destructive administrative actions.
- Low-entropy PINs create residual offline-guessing risk if Argon2id hashes are exposed. Phase 3 must implement the specified lockout and protect `pinSecrets`; additional secret separation is not specified in the guide.
- Contract account identifiers are backend-derived rather than controlled by user-held private keys. Salt compromise and rotation have identity/linkability implications.
- No offline payments; external rupee settlement occurs outside the app.
- This baseline has not been validated against running code, Firestore rules, contract tests, or E2E tests. Full threat review and attack tests are a Phase 8 deliverable.
