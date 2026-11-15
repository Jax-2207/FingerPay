# Test plan — F-004 payment challenge correctness

- Feature/status: F-004 payment challenge correctness / approved for implementation
- Acceptance criteria covered: All criteria in `01-spec.md`
- Unit tests: Direct use of installed `generateAuthenticationOptions` with random 32-byte input; assert canonical base64url output and length.
- Integration tests: Phase 4 auth-options and confirm happy path with Firestore emulator; test mock encodes raw bytes as the real library does.
- Security/rules tests: Phase 8 replay, cross-user, cross-intent, expiry, atomic one-time consumption, required user verification, and no-relayer-on-rejected-assertion cases.
- Regression checks: Existing approval/PIN/limit/intent-state/circuit breaker checks; frontend payment flow remains unchanged; no payment is submitted during browser QA.
- Commands/expected results: `corepack pnpm exec vitest run packages/backend/test/webauthn-challenge.test.ts packages/backend/test/phase4.test.ts packages/backend/test/phase8.security.test.ts`; `corepack pnpm lint`; `corepack pnpm typecheck`; `corepack pnpm test`; `corepack pnpm build`. The emulator-backed phase tests must run with their configured test harness; all expected outcomes are pass.
