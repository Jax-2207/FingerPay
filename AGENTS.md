# Workflow and invariants

Read `docs/ai/CONTEXT.md` first, then only task-needed files. Do not read `docs/reference/` by default; use `docs/ai/PROJECT-BRIEF.md`.

Feature flow: Lead spec -> Architect design -> Tech Lead plan -> Roundtable -> Senior Dev brief -> Developer implementation -> Senior Dev review -> QA -> Security (money/auth/biometric/KYC only) -> Lead sign-off -> update-context. Architect/Tech Lead write docs, not code. Developer codes only tasks in `03-plan.md`. QA writes/runs tests and files bugs, not fixes. Security reviews, not implements.

Each roundtable role adds an entry to `docs/features/<id>/04-discussion.md` with a concrete objection or why none exists; conclude PROCEED / REVISE / BLOCKED. Architecture/data/security/dependency decisions need numbered ADRs (context, options, decision, consequences, status). Gates: testable criteria; no roundtable blockers; tests defined first; Senior Dev approval; QA pass/no regressions; `scripts/check.sh` green; update-context done.

Role remits: Lead owns scope/acceptance/sign-off; Architect design/ADRs; Tech Lead test-first plans; Senior Dev briefs/reviews; Developer approved tasks; QA verification/bugs; Security review.

Invariants: money/token balances never negative; ledger append-only; never log raw biometric data or PII; never commit secrets. Mark unknowns TODO, UNVERIFIED, or PLANNED. Mark IMPLEMENTED only when present and tests pass. Single check command: `scripts/check.sh`; do not claim checks pass unless run.
