# Phase 0 verification plan

- Status: EXECUTED; see `06-signoff.md` for exact results.
- Scope: Phase 0 tooling/configuration only; no feature behavior.

## Checks

- **P0-C1 Install:** `pnpm install` resolves all four workspace packages from the root on Node 20 or 22.
- **P0-C2 Tests:** each package exports only a package identity constant; its test imports that constant and asserts it equals that package's manifest name. Capture root Vitest output proving all four workspace test files execute with four assertions passing; two additional config assertions verify CI and emulator settings.
- **P0-C3 Lint:** `pnpm lint` covers all four packages and exits successfully.
- **P0-C4 Typecheck/build:** `pnpm typecheck` and `pnpm build` pass with strict TypeScript settings and package configurations.
- **P0-C5 CI/security:** target Node 20 or 22. Parse `.github/workflows/ci.yml` with the pinned `yaml` parser installed as a dev dependency and assert the workflow defines install, lint, typecheck, and test steps; CI must invoke the same root commands. Statically verify workflow permissions are least-privilege and it does not expose repository secrets to untrusted pull-request jobs.
- **P0-C6 Firebase/config/docs:** parse `firebase/firebase.json` with Node and assert `auth` and `firestore` emulator entries with localhost host bindings and safe local ports. `.env.example` has only safe local defaults; README setup covers supported Node, pnpm, install, emulators, checks, and dev start.
- **P0-C7 Scope:** inspect the final diff for absence of business behavior, Phase 1 contracts, secrets, and unrelated changes.
- **P0-C8 Hooks/workspaces:** pnpm recognizes all four workspaces; Husky/lint-staged config invokes configured checks on staged files.

No business-feature tests are appropriate for placeholder packages. QA executed acceptance commands on Node 22.23.4 with pnpm 12.18.0. An initial frozen install attempt encountered a user-level pnpm store access denial in the sandbox; the approved elevated retry succeeded. No check is reported PASS unless run.
