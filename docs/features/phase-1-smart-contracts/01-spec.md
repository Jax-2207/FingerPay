# Phase 1 — Smart contracts

- Status: APPROVED SCOPE — settlement policy approved; workflow gates pending
- Owner: Lead Orchestrator
- Authority: `docs/BUILD_GUIDE.md` B7 and Part D, Phase 1

## Problem / user value

Provide the on-chain source of truth for closed-loop CampusCoin balances and the approved payment lifecycle, with tested access control and deployment artifacts for local demonstrations.

## Scope

- Set up Hardhat with TypeScript, TypeChain, gas reporting, and exact dependency pins recorded before installation.
- Implement B7 `CampusCoin` and `FingerPay` contracts using OpenZeppelin v5.
- Add deploy, local seed, and ABI export scripts.
- Add contract tests for minting, payment success and rejection paths, refunds, settlement, pause, transfer restrictions, controller/access control, events, and intent determinism.
- Report per-function gas measurements in `docs/PROGRESS.md`.

## Out of scope

- Backend, frontend, Firebase, authentication, Firestore rules, or relayer-service feature code.
- Testnet deployment or production keys.
- Changes to approved token semantics, trust model, or package boundaries.

## Acceptance criteria

- `pnpm --filter contracts test` covers every B7 function, specified revert path, event, and role behavior.
- Deploy scripts work against a local Hardhat node and write deployment output under `packages/contracts/deployments/`.
- ABI export writes generated interfaces into `packages/shared/src/abi/`.
- Public ERC20 transfers always revert; controller-only token flows and role restrictions match B7.
- Phase 1 tests, build/typecheck, root lint/typecheck/test, and measured gas results are documented.

## Contract policies approved before implementation

B7 leaves settlement behavior for an unknown or inactive merchant as an implementation policy. Options:

1. Permit settlement only while the merchant is active. This is simpler, but deactivation can leave remaining CPC unsettled until reactivation.
2. Permit settlement for any previously registered merchant, including inactive merchants, but reject never-registered addresses. This supports exit after deactivation and requires tracking registration separately from active status.

The user approved option 2 on 2026-11-09. The decision is recorded as ADR-0001 in canonical `docs/DECISIONS.md`.

The user also approved rejecting zero-value `settle()` and `mint()` calls with `ZeroAmount`, recorded in ADR-0002 and ADR-0003. Implementation remains gated on final Roundtable and Senior Dev approval.
