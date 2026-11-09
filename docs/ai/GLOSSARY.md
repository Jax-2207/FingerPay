# FingerPay glossary

- **CPC:** CampusCoin, a closed-loop demo token with zero decimals and no monetary guarantee.
- **PRN:** College Permanent Registration Number checked against the pre-approved allowlist.
- **Campus Accounts:** Authorized administrative function for CPC minting and external merchant settlement.
- **Passkey:** WebAuthn credential whose private key remains on the authenticator/device.
- **WebAuthn assertion:** Signed proof from the authenticator for a specific challenge; never log or persist raw assertions.
- **Application PIN:** 4–6 digit PIN verified server-side using Argon2id and lockout controls.
- **Payment intent:** Short-lived merchant request bound to amount, merchant, nonce, expiry, chain ID, and contract address.
- **Relayer:** Trusted backend-controlled account that submits approved payment calls and pays gas.
- **Indexer:** Backend process that reads contract events and mirrors relevant transaction metadata to Firestore.
- **Closed-loop token:** Demo credit restricted to defined campus contract flows; not a general cryptocurrency or cash equivalent.
- **PLANNED / IMPLEMENTED:** Product functionality stays PLANNED until present and required tests pass.
