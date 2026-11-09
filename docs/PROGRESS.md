# FingerPay phase progress

Phase 0 tooling and Phase 1 smart contracts are complete. Later application functionality remains **PLANNED**. This file is the canonical phase-level status record.

| Phase | Status | Evidence / next gate |
|---|---|---|
| 0 — Repository, tooling, and CI | COMPLETE | All Phase 0 acceptance criteria and workflow gates passed. Required commands pass on Node 22.23.4 / pnpm 12.18.0. See `docs/features/phase-0-repository/06-signoff.md`; release commit and `phase-0` tag are created after this record. |
| 1 — Smart contracts | COMPLETE | CampusCoin/FingerPay, tests, scripts and shared ABIs verified. See `docs/features/phase-1-smart-contracts/06-signoff.md`; `phase-1` tag follows the approved signoff commit. |
| 2 — Shared package and backend foundation | PLANNED | Phase 1 sign-off required. |
| 3 — PRN onboarding, approval, passkey, PIN | PLANNED | Phase 2 sign-off required. |
| 4 — Merchants, mint, payment pipeline | PLANNED | Phase 3 sign-off required. |
| 5 — Refunds, settlements, circuit breaker | PLANNED | Phase 4 sign-off required. |
| 6 — Student frontend | PLANNED | Phase 5 sign-off required. |
| 7 — Merchant and Admin frontends | PLANNED | Phase 6 sign-off required. |
| 8 — Hardening, security, E2E, threat model | PLANNED | Phase 7 sign-off required. |
| 9 — Testnet/demo and final docs | PLANNED | Phase 8 sign-off required. |
| 10 — Optional stretch | PLANNED / OPTIONAL | Only after Phases 0–9 pass; at most one goal. |

Phase 0 contains repository scaffolding. Phase 1 contract functionality is implemented; shared/backend/frontend product functionality remains PLANNED. Phase 0 and Phase 1 release commits and tags are recorded in their signoff documents and final completion reports.

## Phase 1 gas measurements

Measured with Hardhat gas reporter on the local Hardhat network (Solidity 0.8.28, optimizer 200 runs). Values are average gas per successful transaction; view calls and reverted calls are not included.

| Contract / function | Average gas |
|---|---:|
| CampusCoin deployment | 558,358 |
| CampusCoin `setController` | 44,182 |
| CampusCoin `controllerMint` | 70,717 |
| CampusCoin `controllerTransfer` | 54,178 |
| CampusCoin `controllerBurn` | 36,498 |
| FingerPay deployment | 1,181,339 |
| FingerPay `registerMerchant` | 70,262 |
| FingerPay `deactivateMerchant` | 25,586 |
| FingerPay `mint` | 80,947 |
| FingerPay `pay` | 160,328 |
| FingerPay `refund` | 91,815 |
| FingerPay `settle` | 50,813 |
| FingerPay `pause` | 47,044 |
| FingerPay `unpause` | 25,146 |

Verification used Node 24.14.1 and pnpm 12.18.0 at the user's direction. The repository's Node 22.23.4 pin is unchanged.
