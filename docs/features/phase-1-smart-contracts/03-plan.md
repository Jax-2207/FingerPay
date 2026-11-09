# Phase 1 implementation plan — smart contracts

- Status: COMPLETE — Roundtable PROCEED; Senior Dev plan and implementation reviews APPROVED; QA and Security gates passed.
- Authority: `docs/BUILD_GUIDE.md` B7 and Part D, Phase 1.
- Scope boundary: `packages/contracts` plus generated ABIs under `packages/shared/src/abi/`; no backend, frontend, Firebase, or later-phase features.

## Tests and checks defined first

Create these tests before implementation work. Use Hardhat tests against deployed local contracts; assertions must cover exact state changes, emitted arguments, and rejection behavior. ADR-0001 through ADR-0003 finalize the relevant policies before tests are authored.

| Check | Required cases / acceptance evidence |
|---|---|
| P1-C1 CampusCoin behavior | Name `CampusCoin`, symbol `CPC`, and zero decimals. `setController` succeeds once for deployer; unauthorized and repeat attempts fail. Controller mint/transfer/burn succeed and update balances/supply correctly; non-controller calls fail. Public `transfer`, `transferFrom`, and `approve` always revert with `TransfersDisabled()`, including zero and nonzero amounts. |
| P1-C2 Merchant/access control | Admin can register and deactivate merchants; events include specified indexed values and `metaHash`. Non-admin calls fail. Relayer cannot perform admin operations; admin cannot use `pay` unless separately granted `RELAYER_ROLE`. Role grants/revokes have the expected effect. |
| P1-C3 Mint and pause | Admin mint emits exact `Minted` arguments and updates balance/supply. Per ADR-0003, zero amount reverts with `ZeroAmount` and causes no state change or `Minted` event. Unauthorized mint rejects. While paused, mint and pay reject; admin pause/unpause succeeds and unauthorized pause/unpause rejects. |
| P1-C4 Payment success and determinism | `computeIntentId` equals `keccak256(abi.encode(chainId, contract, merchant, amount, nonce, expiry))`; changing any bound field changes the ID. Successful relayer payment transfers CPC from user to active merchant, stores exact `PaymentRecord`, marks intent used, and emits exact `Payment` arguments. |
| P1-C5 Payment rejection paths | Cover zero amount, self-payment, inactive/unregistered merchant, expiry strictly past, replay, insufficient user balance, and unauthorized caller. At a fixed Hardhat timestamp, assert expiry equal to `block.timestamp` succeeds and strictly-past expiry reverts with `IntentExpired`. Assert failed calls leave balances, `intentUsed`, and `payments` unchanged. |
| P1-C6 Refund | Admin refund transfers the exact recorded amount from merchant to user, marks refunded, and emits exact `Refunded` arguments. Unknown intent, duplicate refund, insufficient merchant funds, unauthorized caller, and paused contract reject; failed calls preserve state. |
| P1-C7 Settlement policy | Per ADR-0001, active and previously registered inactive merchants may settle; never-registered addresses reject. Per ADR-0002, zero amount reverts with `ZeroAmount` and causes no state change or `Settled` event. Test admin authorization, exact burn/supply and merchant balance reduction, `Settled` arguments, insufficient balance, paused behavior, successful settlement for an inactive registered merchant, and rejection for an unknown address. |
| P1-C8 Scripts/artifacts | Deploy against a local Hardhat node; confirm both contracts deploy, controller is set, relayer role is granted, and `deployments/<network>.json` contains addresses. Seed script registers a local merchant and mints demo CPC through authorized flows. ABI export produces the two contract ABIs under `packages/shared/src/abi/`. |
| P1-C9 Quality, scope, gas | `pnpm --filter contracts test`, contracts build/typecheck, root `pnpm lint`, `pnpm typecheck`, `pnpm test`, and relevant build checks pass. Record measured per-function gas in `docs/PROGRESS.md`. Review final diff for Phase 1-only scope and absence of secrets or public transfer capability. |

## Ordered implementation tasks

| ID | Task and affected paths | Depends on | Completion criteria |
|---|---|---|---|
| P1-0 | **Resolve contract policy questions before implementation — COMPLETE.** User approved the merchant settlement rule in ADR-0001, zero settlement rejection in ADR-0002, and zero mint rejection in ADR-0003. | None | Decisions are explicit, dated, and tests have deterministic expected behavior. |
| P1-1 | Select compatible **exact** versions for Hardhat, Hardhat TypeScript tooling, TypeChain, ethers v6, OpenZeppelin v5, gas reporter, and contract-test dependencies. Record chosen versions in `docs/DECISIONS.md` before installing. Inspect and extend `packages/contracts/package.json`, root scripts/config only as needed. | P1-0 | Compatibility checked against current Node/pnpm and existing TypeScript/tool versions; all dependency specs are exact; decision recorded before `pnpm install`. |
| P1-2 | Configure Hardhat, TypeScript, TypeChain, gas reporting, contract test runner and scripts in `packages/contracts/` (manifest, config, tsconfig, test setup as needed). | P1-1 | `pnpm --filter contracts` exposes test/build/typecheck and local node/deploy commands; generated TypeChain types work; no unrelated workspace configuration changes. |
| P1-3 | Author `CampusCoin` tests in `packages/contracts/test/` from P1-C1 before writing contract implementation. Tests may fail because the target contract is absent; assertions and expected custom errors must be complete. | P1-2; P1-C1 defined | Test source contains all `CampusCoin` success, access-control, supply/balance, and transfer-restriction assertions before `CampusCoin.sol` is created. |
| P1-4 | Implement `packages/contracts/contracts/CampusCoin.sol`. | P1-3 | P1-C1 passes, including disabled public ERC20 entry points and controller-only operations. |
| P1-5 | Author `FingerPay` tests in `packages/contracts/test/` for P1-C2–P1-C7 before writing `FingerPay.sol`. | P1-4; P1-C2–P1-C7 defined | Test source contains deterministic cases for roles, registration, zero-value mint, pause, payment, expiry equality/past, refund, and the approved active/inactive merchant settlement policy before `FingerPay.sol` is created. |
| P1-6 | Implement `packages/contracts/contracts/FingerPay.sol` with roles, merchant state/history, mint, intent computation, pay, pause, refund, and settlement. | P1-5; P1-0 | P1-C2–P1-C7 pass; behavior follows B7 and ADR-0001–0003. |
| P1-7 | Add `packages/contracts/scripts/deploy.ts`, `seed.ts`, `export-abi.ts`; generated interfaces under `packages/shared/src/abi/`; deployment artifacts under `packages/contracts/deployments/`. | P1-6 | P1-C8 passes against a local Hardhat node; generated artifacts are reproducible and deployment output contains no secret material. |
| P1-8 | Run all P1-C1–P1-C9 checks; inspect gas report; update `docs/PROGRESS.md`, `docs/ai/CONTEXT.md`, `WORKTODO.md`, `CHANGES.md`, `KNOWN-ISSUES.md`, and task status/signoff artifacts. | P1-1–P1-7 | Commands and measured gas are recorded accurately; all Phase 1 acceptance criteria and applicable workflow gates have evidence; gaps are explicit. |

## Dependencies and approval gates

- P1-0 is complete. ADR-0001 through ADR-0003 record the user-approved behaviors. Do not change them without new approval.
- P1-1 exact version selection and recording must precede dependency installation.
- P1-3 and P1-5 author tests before their corresponding contract implementation tasks P1-4 and P1-6. P1-C1–P1-C9 are now deterministic and unconditional.
- Roundtable and Senior Dev approved the finalized plan before implementation. Contract security review is required; QA and Senior Dev review the actual implementation before Lead sign-off.
- No testnet deployment, application features, or Phase 2 work is included.

## Completion status

P1-0 through P1-8 are complete. Phase 1 acceptance criteria P1-C1 through P1-C9 passed; final command results, gas measurements, role reviews and acceptance evidence are recorded in `06-signoff.md` and `docs/PROGRESS.md`.
