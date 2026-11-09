# FingerPay — Codex Agentic Execution Protocol

**Status:** PLANNED  
**Purpose:** Make every FingerPay implementation phase follow the agentic repository workflow while keeping `docs/BUILD_GUIDE.md` as the technical source of truth.

---

## 1. Authority and precedence

Use this order when instructions appear to conflict:

1. **`AGENTS.md`** — repository-wide operating rules and non-negotiable constraints.
2. **`docs/BUILD_GUIDE.md`** — authoritative FingerPay product specification, architecture, security requirements, data model, APIs, tests, and phase acceptance criteria.
3. **`docs/ai/CONTEXT.md`** — current map of what is planned, implemented, and where it lives. It must reflect verified repository reality.
4. **`docs/DECISIONS.md`** — canonical register for genuinely new or unresolved implementation decisions. `docs/ai/DECISIONS.md` is a historical archive of superseded proposals only.
5. **Feature/phase documents and approved task plans** — scope for the current work.
6. **The current user prompt** — selects the requested phase or task, but does not silently override the architecture or security invariants above.

The earlier FingerPay proposal using Aadhaar/PAN KYC, Cloud Functions, INR-pegged tokens, Firestore wallet balances, and a hash-chained database ledger is superseded. Do not revive it.

If two authoritative documents conflict, do not guess silently. Follow the safer existing constraint, record the conflict in `docs/ai/KNOWN-ISSUES.md`, and ask for clarification only if implementation cannot safely proceed. Do not reopen decisions already fixed in the BUILD_GUIDE.

## 2. Project invariants

The following remain mandatory throughout all phases:

- CampusCoin (CPC) is a demo closed-loop token with zero decimals and no monetary guarantee.
- No real-money, UPI, bank, Razorpay, or payment-gateway integration.
- No Aadhaar/PAN, KYC document upload, or Cloudinary.
- Fingerprints/biometrics remain on the user's authenticator/device. Store only WebAuthn public-key credential material required for verification.
- No user-to-user transfers and no in-app cash-out.
- The smart contract is the source of truth for balances. Firestore stores profiles, intents, history, analytics, and operational metadata—not balances.
- Only the approved contract flows may mint, pay, refund, and burn/settle CPC.
- The backend, relayer key, and Campus Accounts admin are trusted components. Never describe the system as fully decentralized.
- Secrets stay out of Git and frontend bundles.
- Validate external input; use strict TypeScript and shared Zod schemas; use `bigint` internally and decimal strings in JSON for token amounts.
- Never log PINs, assertions, private keys, tokens, or other secrets.
- Never weaken or delete a test to make a check pass.

## 3. Required workflow for each substantial phase

Follow the existing agentic repository workflow. Do not skip roles merely because one Codex session performs the work. If separate specialist agents are available, delegate to them; otherwise, perform each role as a clearly separated review pass and record the result.

### Stage 0 — Intake and scope lock

**Lead / Feature Intake**

1. Read `AGENTS.md` and `docs/ai/CONTEXT.md`.
2. Read only the relevant sections of `docs/BUILD_GUIDE.md`.
3. Identify the exact phase, goal, tasks, acceptance criteria, dependencies, and out-of-scope work.
4. Confirm the phase has not already been completed.
5. Create or update a phase/feature spec using `docs/templates/spec.md` when the work is substantial.
6. Do not start implementation during intake.

**Output:** scoped phase/feature spec and explicit out-of-scope list.

### Stage 1 — Architecture review

**Architect**

1. Review the proposed work against the established architecture.
2. Identify affected packages, modules, data collections, contracts, APIs, and trust boundaries.
3. Identify security, migration, compatibility, and operational implications.
4. Do not redesign decisions already fixed in `BUILD_GUIDE.md`.
5. Record only genuinely new decisions in canonical `docs/DECISIONS.md` using `docs/templates/adr.md`.

**Output:** concise design note, affected-file map, and ADRs only if needed. Architect does not write application code.

### Stage 2 — Implementation planning

**Tech Lead**

1. Break the phase into small, ordered tasks.
2. Identify dependencies and parallelizable work.
3. Define acceptance criteria for every task.
4. Define tests before implementation: contract, unit, integration, rules, UI, E2E, or security tests as applicable.
5. Ensure each task belongs to the current phase.
6. Do not add future-phase functionality unless the BUILD_GUIDE explicitly requires a minimal prerequisite.

**Output:** implementation plan with task IDs, files/modules, tests, and completion conditions. Tech Lead does not write application code.

### Stage 3 — Roundtable

**Roundtable participants:** Architect, Tech Lead, Senior Dev, QA Tester, and Security Reviewer when the phase touches money, authentication, passkeys, PINs, Firestore authorization, contracts, keys, or other security-sensitive behavior.

Each participant must add an entry to the current phase's discussion document (use `docs/templates/discussion.md`) and must either:

- raise one concrete objection, risk, missing test, or ambiguity; or
- explicitly state why no objection exists.

End the discussion with exactly one outcome:

- `PROCEED` — no blocking issues remain.
- `REVISE` — plan/spec changes are required before implementation.
- `BLOCKED` — a critical issue or missing decision prevents safe progress.

Do not implement while the outcome is `REVISE` or `BLOCKED`.

### Stage 4 — Senior Developer brief

**Senior Dev**

1. Review the approved plan and roundtable outcome.
2. Confirm implementation boundaries and coding conventions.
3. Identify likely failure modes and review checkpoints.
4. Confirm tests are defined before implementation.
5. Approve or return the plan for revision.

**Output:** implementation brief and explicit `APPROVED` or `CHANGES REQUIRED` status.

### Stage 5 — Implementation

**Developer**

1. Implement only tasks in the approved current-phase plan.
2. Follow `AGENTS.md`, `BUILD_GUIDE.md`, shared schemas, and recorded ADRs.
3. Do not silently change public APIs, schemas, contract interfaces, role permissions, token semantics, or security controls.
4. Add tests alongside the feature, using the test plan created before coding.
5. Keep changes small and reviewable.
6. Do not edit QA findings to make them disappear; fix implementation defects without weakening tests.
7. Do not mark work complete until the relevant checks have actually run.

**Output:** implementation, tests, concise change summary, and commands/results.

### Stage 6 — Senior Developer review

**Senior Dev**

Review the diff, not just the implementation summary. Check:

- scope matches the approved plan;
- architecture and interfaces match the BUILD_GUIDE;
- error handling and input validation are correct;
- no secrets or sensitive values are logged;
- tests cover success, rejection, edge, and failure paths;
- no unrelated or future-phase work was added;
- maintainability and type safety.

Return `APPROVED` or `CHANGES REQUIRED`, with actionable findings. Developer addresses findings, then Senior Dev re-reviews.

### Stage 7 — QA verification

**QA Tester**

1. Run the planned tests and relevant regression tests.
2. Run the repository's canonical check command.
3. Verify the phase acceptance criteria independently.
4. Test failure paths and boundary conditions, not only happy paths.
5. File reproducible bugs with steps, expected result, actual result, and severity.
6. QA does not implement fixes.

A QA pass requires no unresolved release-blocking defects and no unexplained test failures.

### Stage 8 — Security review

Required for changes involving contracts, CPC balances, mint/pay/refund/settlement, relayer/admin keys, authentication, roles, WebAuthn, PINs, Firestore rules, payment intents, rate limits, or personal data.

**Security Reviewer**

- Review the relevant threat boundaries and trust assumptions.
- Check authorization on both backend and contract layers.
- Check replay, race, expiry, idempotency, and amount-tampering protections.
- Check WebAuthn challenge/origin/rpID/user-verification requirements where relevant.
- Check PIN hashing, lockout, and secret handling where relevant.
- Check Firestore client read/write restrictions where relevant.
- Check closed-loop token invariants and contract access control where relevant.
- Record findings and severity. Security Reviewer does not implement fixes.

Do not claim a security review passed if the review was not performed. For an implementation or configuration change covered by a stub skill, the gate remains blocked until the skill is completed and applied. For a documentation-only architecture review, the Security Reviewer may assess the architecture directly without treating the stub as completed; the outcome must explicitly state that the skill is deferred and no implementation controls were validated. Complete each stub skill during its designated implementation phase.

### Stage 9 — Lead sign-off and phase gate

The phase may be signed off only when all applicable conditions are true:

- all current-phase tasks are complete;
- BUILD_GUIDE acceptance criteria pass;
- Senior Dev review is approved;
- QA verification passes;
- required Security review passes;
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and the relevant build/integration/E2E checks pass;
- no known blocker is hidden or reclassified;
- `.env.example`, README commands, and relevant documentation are updated;
- `docs/PROGRESS.md` is updated with built work, tests run, results, and known gaps;
- `docs/ai/CONTEXT.md`, `WORKTODO.md`, `CHANGES.md`, and `KNOWN-ISSUES.md` are updated.

Only then create the Conventional Commit(s) and the required `phase-N` Git tag, provided the user has authorized commits/tags or the phase prompt explicitly requests them. Never claim a tag exists unless verified with Git.

If any gate fails, stop phase progression, report the exact failure, and fix it within the current phase. Do not begin the next phase.

## 4. Phase-specific scope control

The phase roadmap in Part D of `docs/BUILD_GUIDE.md` is authoritative:

- Phase 0: repository tooling and CI.
- Phase 1: smart contracts.
- Phase 2: shared package and backend foundation.
- Phase 3: PRN onboarding, approval, passkeys, PIN, and Firestore rules.
- Phase 4: merchants, mint, payment pipeline, indexer, history, analytics.
- Phase 5: refunds, settlements, circuit breaker, audit logs.
- Phase 6: student frontend.
- Phase 7: merchant and admin frontends.
- Phase 8: hardening, security, and E2E tests.
- Phase 9: testnet/demo deployment and final documentation.
- Phase 10: at most one optional stretch goal, only after Phases 0–9 pass.

Do not implement the entire project in one task. Do not start a later phase while the current phase is not signed off.

## 5. Living documentation rules

After every approved task/phase:

- `docs/ai/CONTEXT.md` is a concise map, not a copy of source code.
- Change `PLANNED` to `IMPLEMENTED` only for functionality that exists and has passed its required tests.
- `docs/ai/CHANGES.md` records date, phase/task ID, what changed, why, and affected files.
- `docs/ai/WORKTODO.md` tracks Backlog / In Progress / Done, with evidence for completed work.
- `docs/ai/KNOWN-ISSUES.md` records unresolved issues, limitations, and deferred work.
- `docs/PROGRESS.md` is the canonical phase-level implementation and verification status.
- `docs/DECISIONS.md` is the canonical register for genuinely new or unresolved decisions. Do not duplicate the BUILD_GUIDE as fake ADRs.
- `docs/THREAT_MODEL.md` is canonical; its complete threat analysis and validation are Phase 8 deliverables. Earlier architecture notes must be labeled PLANNED and must not claim a completed security audit.
- Keep workflow documents under `docs/ai/`. `docs/ai/DECISIONS.md` is retained only as an explicitly SUPERSEDED historical archive that points to `docs/DECISIONS.md`.

## 6. How to handle ambiguity or outdated instructions

- Prefer the simplest safe implementation consistent with the BUILD_GUIDE.
- Record a concise decision in canonical `docs/DECISIONS.md`.
- If a BUILD_GUIDE requirement is impossible or an upstream API has changed, implement the closest safe working alternative only when it preserves the product/security intent; document the deviation and tests.
- If a conflict changes architecture, security, data model, contract behavior, or product semantics, stop and request approval rather than silently changing it.
- Never invent test results, deployment success, gas measurements, latency measurements, coverage percentages, or Git tags.

## 7. Reusable Codex prompt for a phase

Copy this prompt and replace `{N}` with the requested phase number:

> Read `AGENTS.md`, `docs/ai/CONTEXT.md`, and `docs/BUILD_GUIDE.md`. Implement **Phase {N} only**, following the phase's tasks and acceptance criteria in Part D.
>
> **Mandatory agentic workflow:** Use the repository's existing skills, specialist agent definitions, templates, and workflow. Execute the stages in `docs/ai/CODEX_AGENTIC_EXECUTION.md`: intake/scope lock → Architect review → Tech Lead task plan and tests-first plan → Roundtable → Senior Dev brief/approval → Developer implementation → Senior Dev diff review → QA verification → Security review when applicable → Lead sign-off → living-document updates.
>
> Use the specialist agents if available. If they are not available in this Codex session, perform each role as a separate, clearly labeled review pass and record its output in the appropriate phase discussion/plan document. Do not pretend a separate agent was invoked when it was not.
>
> Do not skip a gate. If Roundtable returns `REVISE` or `BLOCKED`, or Senior Dev/QA/Security review does not pass, stop and resolve the issue before proceeding. Implement only approved tasks belonging to Phase {N}; do not implement future phases.
>
> Follow the BUILD_GUIDE architecture and security invariants. The BUILD_GUIDE is authoritative for product and technical requirements; the agentic workflow governs how the work is planned, reviewed, tested, and signed off. Do not revive the superseded KYC/Aadhaar/PAN, Cloud Functions, INR-pegged token, Firestore-balance, or hash-chain-ledger design.
>
> Run the required checks and report exact commands and results. Update `docs/PROGRESS.md`, `docs/ai/CONTEXT.md`, `docs/ai/WORKTODO.md`, `docs/ai/CHANGES.md`, and `docs/ai/KNOWN-ISSUES.md`. Update `.env.example` and README commands when relevant.
>
> Commit with Conventional Commit messages and create tag `phase-{N}` only after every gate and acceptance criterion passes. Verify the commit and tag exist. If any check cannot run, report it as unverified and do not claim the phase is complete. Do not weaken or delete tests.

## 8. First implementation task: Phase 0

After the scaffolding repository and this protocol are reviewed, use the reusable prompt with `{N} = 0`, plus this Phase 0 scope reminder:

> Implement Phase 0 only. Create the pnpm workspace, strict TypeScript configuration, package skeletons for contracts/shared/backend/frontend, ESLint, Prettier, Husky/lint-staged, root scripts, Firebase emulator configuration, GitHub Actions CI, `.env.example`, README setup commands, and one meaningful placeholder test per package as specified in the BUILD_GUIDE. Do not implement business features or Phase 1 contracts. Run `pnpm install`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` only when the user/environment permits package installation and network access. Update progress and living docs. Complete all agentic workflow gates before tagging `phase-0`.

---

## 9. Suggested phase discussion record

For each substantial phase, create a phase-specific discussion record, for example:

`docs/features/phase-0-repository/04-discussion.md`

Include:

- Phase and scope.
- Participants/roles actually involved.
- One objection or explicit no-objection statement per role.
- Resolution for every objection.
- Final outcome: `PROCEED`, `REVISE`, or `BLOCKED`.
- Date and links to the plan/spec/ADR.

Do not claim a role participated unless its review was actually performed.

## 10. Completion report format

At the end of each phase, report:

1. Phase and scope completed.
2. Tasks implemented.
3. Files/modules changed.
4. Tests and exact commands run.
5. Acceptance criteria: pass/fail/unverified.
6. Architect, Tech Lead, Roundtable, Senior Dev, QA, and Security outcomes (mark not applicable where appropriate).
7. Documentation updated.
8. Commit hash and tag, if created and verified.
9. Known issues and deferred work.
10. Whether the next phase is unblocked.

**A phase is not complete merely because code was written. It is complete only after the workflow gates and BUILD_GUIDE acceptance criteria pass.**
