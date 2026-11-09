# Phase 0 architecture and tooling design

- Status: ARCHITECT APPROVED
- Authority: `docs/BUILD_GUIDE.md` B5, B6, and Part D Phase 0
- Reviewer: `/root/phase0_architect` (separate agent)

## Proposed structure

- Root pnpm workspace with `packages/contracts`, `packages/shared`, `packages/backend`, and `packages/frontend`.
- Contracts package gets only TypeScript/Hardhat scaffolding and a placeholder test; no Solidity contracts until Phase 1.
- Shared package gets only package/TypeScript scaffolding and a placeholder test; no product schemas or logic.
- Backend package gets only Express-oriented package/TypeScript scaffolding and a placeholder test; no endpoints or business behavior.
- Frontend package gets only React/Vite-oriented package/TypeScript scaffolding and a placeholder test; no product UI.
- Root strict TypeScript base config with package-level configs; root scripts coordinate lint, typecheck, test, build, and dev.
- Root ESLint, Prettier, Husky/lint-staged; Firebase Auth and Firestore emulator configuration; GitHub Actions CI; safe `.env.example`; setup README.

## Constraints and review notes

- Preserve existing agentic docs, skills, role definitions, templates, and canonical living docs.
- Reuse the same root commands locally and in CI. Keep secrets out of examples and Git.
- Pin exact dependency versions and record the selected versions in `docs/DECISIONS.md`.
- The current shell has Node 24.14.1 and no `pnpm` command. Phase 0 targets Node 20/22. Secure a supported runtime/package-manager path before claiming clean-clone checks pass.
- `scripts/check.sh` is a scaffold no-op; it does not replace the Phase 0 pnpm checks.
- No new architecture decision is needed.
