# Phase 0 — Repository, tooling, and CI

- ID/title: Phase 0 — repository, tooling, and CI
- Status: INTAKE LOCKED
- Owner: Lead

## Problem and user value

The reconciled FingerPay repository needs a clean-clone monorepo foundation with repeatable install, lint, typecheck, test, and build workflows before business functionality begins.

## Scope

- Create pnpm workspaces for `contracts`, `shared`, `backend`, and `frontend`.
- Add strict TypeScript base and per-package configurations, ESLint, Prettier, Husky, and lint-staged.
- Add root scripts `lint`, `typecheck`, `test`, `build`, and `dev`.
- Add a minimal package skeleton and one meaningful placeholder test to each workspace.
- Configure Firebase Auth and Firestore emulators.
- Add GitHub Actions CI for install, lint, typecheck, and tests.
- Add `.env.example` with empty or safe local-only values, README setup instructions, and update stale scaffold checks if needed.
- Preserve the existing specialist agents, skills, templates, canonical docs, and agentic workflow.

## Out of scope

- Solidity contracts or business logic, auth/onboarding, payments, Firestore rules, frontend features, deployment, or any Phase 1+ task.
- Real credentials, secrets, live Firebase projects, chain access, or deployment.

## Testable acceptance criteria

1. `pnpm install` succeeds from the repository root on the supported Node 20/22 runtime.
2. `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` succeed from the root.
3. Each of the four packages has a passing, meaningful placeholder test without implementing product behavior.
4. GitHub Actions CI uses a supported Node version and runs install, lint, typecheck, and test.
5. Firebase Auth and Firestore emulator configuration is present and uses safe local defaults.
6. `.env.example` contains no secrets; README documents prerequisites, install, emulators, checks, and development startup.
7. No business features or Phase 1 contracts are implemented; existing workflow structure is preserved.

## Risks and environment notes

- Current shell has Node v24.14.1 and `pnpm` is not currently on PATH. Phase 0 targets Node 20/22; determine whether Corepack or an approved runtime manager can provide the required environment. Do not claim the supported clean-clone check if it was not run on a supported runtime.
- Exact stable dependency versions must be pinned and recorded in `docs/DECISIONS.md` when selected.
- The architecture reconciliation changes are already present in the worktree; keep them intact and include them only if their separate review is complete.
