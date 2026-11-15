# Test plan — F-003 QR image upload

- Feature/status: F-003 QR image upload / approved for implementation
- Acceptance criteria covered: All criteria in `01-spec.md`
- Unit tests: `packages/frontend/test/qr-upload.test.tsx` with a mocked `Html5Qrcode` scanner; verify file validation, local decode result routing, and decode errors.
- Integration tests: None; file decoding is browser-local and the destination is covered by the existing student payment page tests.
- Security/rules tests: Confirm through component behavior that file contents are not passed to API calls; code review verifies no upload/persistence path was added.
- Regression checks: Existing manual URL/ID flow; existing camera scanner initialization; payment page still requires explicit student authorization.
- Commands/expected results: `corepack pnpm exec vitest run packages/frontend/test/qr-upload.test.tsx packages/frontend/test/student-flow.test.tsx`; `corepack pnpm lint`; `corepack pnpm typecheck`; `corepack pnpm test`; `corepack pnpm build`. All should pass. No payment transaction is part of the test.
