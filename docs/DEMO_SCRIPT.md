# FingerPay — Demonstration Script & Evaluator Guide

This document provides a step-by-step walkthrough for evaluating and demonstrating the **FingerPay (CampusCoin)** closed-loop campus payment system. It covers both desktop evaluation and live mobile smartphone testing.

---

## 1. Prerequisites & Environment Setup

### 1.1 Local Services Checklist
Ensure the following three services are running concurrently in separate terminal windows:

1. **Local EVM Blockchain Node**:
   ```powershell
   corepack pnpm --filter @fingerpay/contracts node
   ```
   *Listens on `http://127.0.0.1:8545` (Chain ID: `31337`).*

2. **Backend API Server**:
   ```powershell
   corepack pnpm --filter @fingerpay/backend start
   ```
   *Listens on `http://localhost:4000`.*

3. **Frontend Application**:
   ```powershell
   corepack pnpm dev
   ```
   *Listens on `http://127.0.0.1:5173`.*

4. **Seed Demo Accounts**:
   ```powershell
   corepack pnpm demo:seed
   ```
   *Populates demo admin, 2 merchants, 5 students with pre-minted balances, and free PRNs.*

---

## 2. Demo Credentials Quick Reference

| Role | Email | Password | PRN / Identifier | Starting CPC | Default PIN |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin@campus.edu` | `Password123!` | N/A | N/A | N/A |
| **Merchant 1** | `canteen@campus.edu` | `Password123!` | Campus Central Canteen | 0 CPC | N/A |
| **Merchant 2** | `bookstore@campus.edu` | `Password123!` | University Bookstore | 0 CPC | N/A |
| **Student 1** | `student1@campus.edu` | `Password123!` | `PRN2026001` (Aarav Sharma) | 150 CPC | `9512` |
| **Student 2** | `student2@campus.edu` | `Password123!` | `PRN2026002` (Ananya Rao) | 100 CPC | `9512` |
| **Student 3** | `student3@campus.edu` | `Password123!` | `PRN2026003` (Rohan Gupta) | 75 CPC | `9512` |
| **Student 4** | `student4@campus.edu` | `Password123!` | `PRN2026004` (Priya Nair) | 50 CPC | `9512` |
| **Student 5** | `student5@campus.edu` | `Password123!` | `PRN2026005` (Devansh Verma) | 200 CPC | `9512` |

> [!NOTE]
> **Free PRNs for Testing Live Signup**: `PRN2026006` through `PRN2026010` are present in the allowlist and unassigned.

---

## 3. Demonstration Walkthrough (7 Scenes)

### Scene 1: New Student Signup & PRN Validation
- **Goal**: Demonstrate closed-loop identity onboarding restricted strictly to the university PRN allowlist.
- **Steps**:
  1. Navigate to `http://127.0.0.1:5173/signup`.
  2. Attempt to submit an invalid PRN (e.g., `PRN9999999`) or enter an unallowlisted name. Notice immediate rejection with `PRN_INVALID`.
  3. Enter an allowed PRN: `PRN2026006` (Name: `Kavita Iyer`), email: `kavita@campus.edu`, password: `Password123!`.
  4. Submit. The system registers the Firebase account, locks the PRN atomically in Firestore, derives the deterministic EVM wallet address, and sets status to `pending`.

### Scene 2: Admin Approval & Student Security Setup
- **Goal**: Demonstrate two-tier authorization (Admin review + WebAuthn/PIN registration).
- **Steps**:
  1. Open an incognito browser window or log out, then sign in as `admin@campus.edu` / `Password123!`.
  2. Navigate to **Admin Console -> Users & Approvals**.
  3. Locate `Kavita Iyer` (`PRN2026006`) with status `pending`. Click **Approve**.
  4. Log back in as `kavita@campus.edu`. The dashboard prompts for **Security Setup**.
  5. Click **Register Passkey** (prompts browser biometric/platform authenticator via WebAuthn).
  6. Enter security PIN: `4821` (rejects weak patterns like `0000` or `1234`).
  7. Confirm PIN. Student profile is now fully active.

### Scene 3: Admin Minting of CampusCoin (CPC)
- **Goal**: Demonstrate closed-loop demo token creation linked to a cash/bank receipt reference outside the app.
- **Steps**:
  1. As Admin (`admin@campus.edu`), go to **Admin Console -> Mint Tokens**.
  2. Enter Student PRN: `PRN2026006`.
  3. Enter Amount: `100` CPC.
  4. Enter External Receipt Ref: `FEE-CASH-2026-9041`.
  5. Click **Mint CPC**.
  6. Confirm the modal dialog showing exact PRN, derived wallet, and amount.
  7. View transaction receipt on-chain. Log into `kavita@campus.edu` and verify the balance shows `100 CPC` (read directly from smart contract via backend).

### Scene 4: Merchant Payment Terminal QR Generation
- **Goal**: Demonstrate merchant payment intent creation with TTL countdown and dynamic QR code.
- **Steps**:
  1. Log into `canteen@campus.edu` / `Password123!`.
  2. Navigate to **Terminal** (`/merchant/terminal`).
  3. Enter payment amount: `35` CPC.
  4. Click **Generate QR**.
  5. The terminal renders the QR code containing canonical intent payload:
     `fingerpay:intent:<intentId>?amount=35&merchant=...`
  6. A 5-minute live expiration timer ticks down in real time.

### Scene 5: Student Payment & On-Chain Settlement
- **Goal**: Demonstrate touchless scan, WebAuthn assertion verification, server-side PIN check, and relayer blockchain transaction.
- **Steps**:
  1. As Student (`student1@campus.edu` or `kavita@campus.edu`), open `/scan` or click **Pay** on dashboard.
  2. Scan the merchant QR (or paste the intent code in developer test mode).
  3. The payment screen displays:
     - Merchant: `Campus Central Canteen`
     - Amount: `35 CPC`
     - Expiry countdown
  4. Click **Confirm Payment**.
  5. Authenticate via Passkey (biometric prompt).
  6. Enter PIN: `9512`.
  7. Submit. The backend atomically:
     - Consumes the single-use challenge.
     - Verifies WebAuthn authenticator signature and counter.
     - Verifies Argon2id PIN hash.
     - Submits transaction to the `FingerPay` smart contract via serial relayer queue.
  8. Student dashboard shows instant confirmation; balance decreases by 35 CPC.
  9. Merchant terminal immediately updates with green success checkmark via Firestore real-time listener.

### Scene 6: Merchant Settlement
- **Goal**: Demonstrate end-of-day campus vendor accounting and on-chain token burning.
- **Steps**:
  1. In the Merchant console (`canteen@campus.edu`), go to **Settlements**.
  2. Click **Request Settlement** for earned CPC balance (e.g., 35 CPC).
  3. In Admin console (`admin@campus.edu`), go to **Settlements Queue**.
  4. Review pending settlement request, confirm bank account / campus ledger reference.
  5. Click **Approve & Execute Settlement**.
  6. Smart contract burns 35 CPC from the merchant balance; on-chain supply decreases accordingly.

### Scene 7: Emergency Circuit Breaker (Contract Pause)
- **Goal**: Demonstrate administrative security controls in incident response.
- **Steps**:
  1. In Admin console, navigate to **Chain Controls**.
  2. Toggle **System Pause** to ON.
  3. Confirm the warning modal.
  4. Attempt any payment or minting operation. Backend immediately rejects with `503 SYSTEM_PAUSED` and smart contract reverts with `EnforcedPause()`.
  5. Toggle pause back to OFF to restore full operational capability.

---

## 4. Mobile Phone Testing Guide (Real Device over HTTPS)

WebAuthn requires a secure context (`https://` or `localhost`). To test on a physical smartphone:

### Option A: Local HTTPS Tunnel (Recommended)
1. Run local tunnel tool (e.g. `cloudflared` or `ngrok`):
   ```sh
   ngrok http 5173
   ```
2. Note the generated HTTPS address: `https://<subdomain>.ngrok-free.app`.
3. In `packages/backend/.env`, set:
   ```env
   CORS_ORIGINS=https://<subdomain>.ngrok-free.app,http://localhost:5173
   WEBAUTHN_RP_ID=<subdomain>.ngrok-free.app
   WEBAUTHN_ORIGIN=https://<subdomain>.ngrok-free.app
   ```
4. Restart the backend and open the HTTPS URL on your iOS Safari or Android Chrome phone.
5. Biometric prompts (FaceID / TouchID / Android Biometrics) will trigger natively.

### Option B: Android Chrome Remote Port Forwarding
1. Connect Android device via USB with USB Debugging enabled.
2. In desktop Chrome, open `chrome://inspect/#devices`.
3. Port forward `5173` to `localhost:5173` and `4000` to `localhost:4000`.
4. Open `http://localhost:5173` on the phone's Chrome browser (Chromium treats `localhost` as a secure context).

