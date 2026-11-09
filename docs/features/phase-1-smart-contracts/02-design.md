# Phase 1 design review

- Status: ARCHITECT REVIEWED; SETTLEMENT POLICY APPROVED
- Scope: BUILD_GUIDE B7 and Part D, Phase 1 only.

## Architecture and boundaries

- `packages/contracts`: Hardhat/TypeScript, CampusCoin and FingerPay contracts, contract tests, deploy/seed/ABI-export scripts, and local deployment output.
- `packages/shared/src/abi/`: generated contract ABIs only.
- No backend, frontend, Firebase, or application-policy changes in this phase. Contract state remains authoritative for CPC balances and payment movement.
- Campus Accounts `DEFAULT_ADMIN_ROLE` controls merchant registration/deactivation, minting, pause, refund, and settlement approval paths. `RELAYER_ROLE` submits payment calls. Public ERC20 transfer entry points remain disabled.

## Review outcome

The Architect found the package boundaries and trust roles consistent with the approved BUILD_GUIDE. No architecture redesign or new ADR is needed.

## Unresolved behavior

B7 leaves settlement behavior open. The Architect recommends allowing settlement for previously registered inactive merchants while rejecting never-registered addresses. The user approved this policy on 2026-11-09; it is recorded as ADR-0001 in `docs/DECISIONS.md`. The contract must track registration separately from active status. The user also approved zero-value mint and settlement reverts with `ZeroAmount` (ADR-0002/0003).

Architect participation: role-based review pass by a separate subagent; no `.codex/agents/architect.toml` definition exists.
