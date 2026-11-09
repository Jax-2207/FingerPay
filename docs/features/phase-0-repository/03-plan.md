# Phase 0 implementation plan

- Status: COMPLETE; all tasks P0-0 through P0-7 passed; see `06-signoff.md`.
- Scope: BUILD_GUIDE Part D Phase 0 only.

## Tests/checks defined first

See `05-test-plan.md`, defined before implementation tasks. It maps the install, per-package tests, lint, typecheck/build, CI, emulator/config/docs, scope, and hooks/workspace checks to Phase 0 acceptance criteria.

## Ordered tasks

1. **P0-0 Dependency selection (before install) — COMPLETE.** Stable exact versions and compatible Node/pnpm versions were selected after package metadata and primary documentation checks and recorded in canonical `docs/DECISIONS.md`.
2. **P0-1 Workspace and package skeletons.** Add pnpm workspace config, root and package manifests, strict base/per-package TS configs, and minimal contracts/shared/backend/frontend source directories. Accept when pnpm recognizes four packages and TypeScript strictness is enabled. No business feature code.
3. **P0-2 Placeholder tests.** Add one test per package that imports its package identity constant and asserts the value matches the package name. Accept when root `pnpm test` output shows all four package test files and four passing assertions.
4. **P0-3 Quality tooling and root scripts.** Add ESLint, Prettier, Husky/lint-staged, and `lint`, `typecheck`, `test`, `build`, `dev` scripts. Accept when defined root checks run consistently and staged-file hooks are configured.
5. **P0-4 Emulator, environment, and README.** Add Firebase Auth/Firestore emulator config, safe `.env.example`, and setup instructions. Accept when local setup, checks, emulator use, and dev command are documented without real credentials.
6. **P0-5 CI.** Add GitHub Actions install/lint/typecheck/test workflow. Accept when the YAML parser check passes, CI invokes equivalent root checks on Node 20 or 22, workflow permissions are least-privilege, and no secrets are exposed to untrusted pull-request jobs.
7. **P0-6 Verify and document.** Run required acceptance commands and checks; review diff boundaries; update progress, context, backlog, changes, and issues with exact results. Accept when no business/Phase 1 scope has slipped in and all results are accurately recorded.
8. **P0-7 Release gates — COMPLETE.** Senior Dev, QA, Security, and Lead approvals are recorded in `06-signoff.md`; commit and verified phase tag are part of release completion.

## Dependencies

P0-0 must be complete before any dependency installation. P0-1 depends on P0-0. P0-2 and P0-3 depend on P0-1. P0-4 depends on P0-1. P0-5 depends on P0-3. P0-6 depends on P0-1 through P0-5. P0-7 depends on P0-6 and all review gates.

## Explicit boundary

No Phase 1 contract implementation, business APIs, authentication flows, data rules, payment behavior, UI flows, deployment, or real credentials.
