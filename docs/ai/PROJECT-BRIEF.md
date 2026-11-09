# FingerPay brief

**PLANNED:** Design intent only; no code or stack decision verified. Users register, submit Aadhaar/PAN images for KYC, await SuperAdmin approval, recharge a wallet, then pay merchants using fingerprint and four-digit PIN. Virtual tokens are described at 1 INR = 1 token. Roles: User, Merchant, SuperAdmin. Payment should record transfer, transaction, and ledger block.

Proposed, unselected stack: React, Tailwind, Framer Motion, Firebase Auth, Firestore, Cloud Functions, Cloudinary, WebAuthn, hashed PIN, SHA-256 hash-chained ledger. Planned extras: expense dashboard, vouchers/offers, admin analytics. Future scope, not v1: real gateway/UPI, QR/NFC, AI fraud detection, multiple biometrics, offline, mobile apps.

Do not carry over report errors: Trendzee products/orders/wishlist/virtual try-on/AI recommendations; Razorpay as blockchain; JWT as auth; QR/NFC or AI fraud detection as built.
