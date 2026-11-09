# FingerPay project brief

**Status: PLANNED.** This concise brief summarizes `docs/BUILD_GUIDE.md`, the authoritative technical specification. No application functionality has been implemented.

FingerPay is a closed-loop campus payment demo using CampusCoin (CPC), a token with zero decimals and no monetary guarantee. Campus Accounts manages a pre-approved PRN allowlist and authorized admin actions. Students authenticate with Firebase Auth, register a WebAuthn passkey, set a 4–6 digit application PIN verified server-side with Argon2id, and pay registered merchants through a short-lived QR payment intent. CampusCoin/FingerPay Solidity contracts enforce token balances and movements. Firebase/Firestore stores profiles, intents, history, analytics, and operational metadata; it is not the balance source of truth. Merchants may request settlement; CPC is burned on-chain and any rupee payment occurs outside the app through Campus Accounts.

Roles: User (student), Merchant, and Admin (Campus Accounts). Trust assumptions include the backend, relayer key, and Campus Accounts admin. The system is not fully decentralized and does not process real-money payments.

Planned stack: pnpm workspaces; Solidity, Hardhat, OpenZeppelin, TypeChain, ethers; Node/Express/TypeScript; Firebase Auth and Firestore; WebAuthn passkeys; Argon2id; React/Vite/Tailwind PWA. See guide Parts A-E for requirements, APIs, security, tests, and phases.

The older Aadhaar/PAN upload, INR-pegged token, Cloud Functions, Cloudinary, Firestore-balance, hash-chain ledger, and SuperAdmin proposals are superseded. Historical details remain marked in `docs/ai/DECISIONS.md`.
