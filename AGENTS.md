# FingerPay agent instructions

Read `docs/ai/CONTEXT.md` first, then only task-needed files. `docs/BUILD_GUIDE.md` is the authoritative technical specification; this file and `docs/ai/CODEX_AGENTIC_EXECUTION.md` govern workflow. Do not read `docs/reference/` by default; use `docs/ai/PROJECT-BRIEF.md`.

## Master rules from BUILD_GUIDE Part A
- CPC is a closed-loop demo token with zero monetary guarantee. Never integrate real-money gateways, banks, UPI, Razorpay, or rupee transactions in the app.
- Identity uses the Campus Accounts PRN allowlist. Never add Aadhaar/PAN collection, document uploads, or Cloudinary.
- Fingerprint samples remain on the user's device. The server may store only WebAuthn public keys, credential IDs, counters, and required credential metadata.
- CPC can only be minted by Campus Accounts, spent at registered merchants, refunded, and burned at settlement. No user-to-user transfers or in-app cash-out.
- Smart contracts are the balance source of truth. Firestore is for profiles, intents, history, analytics, and operational metadata; never treat a Firestore number as a balance.
- Keep secrets out of source control. Use ignored `.env` files and committed `.env.example` values that are empty or safe local defaults.
- The backend, relayer, and Campus Accounts admin are trusted. Do not call the system fully decentralized.
- Do not claim CPC is redeemable at a fixed rupee rate. External settlement is handled by Campus Accounts outside the app.
- Never expose admin/relayer keys to frontend code, client logs, source control, or public artifacts. Never log PINs, WebAuthn assertions, biometric samples, private keys, bearer tokens, or secrets.
- Use strict TypeScript (no `any`) and Solidity for contracts. Use pnpm workspaces and Node 20/22 LTS. Validate external inputs with Zod and share schemas from `packages/shared`.
- CPC has zero decimals. Use integer amounts, `bigint` internally, and decimal strings in JSON. Pin dependency versions exactly and record chosen versions in `docs/DECISIONS.md` when implementation begins.
- Every feature has tests. Use Conventional Commits. Log with Pino. API errors use `{ "error": { "code": "STRING_CODE", "message": "human text" } }`.
- If the specification is ambiguous, record the simplest safe choice in `docs/DECISIONS.md`; if it affects architecture, security, data, contract behavior, or product semantics, stop and request approval. For changed upstream APIs/dependencies, use the closest safe alternative and document/test the deviation.
- Never delete or weaken tests. At phase end update `docs/PROGRESS.md` with work, tests, results, and gaps.
- A phase is done only after its tasks, acceptance criteria, root `pnpm lint`, `pnpm typecheck`, `pnpm test`, relevant checks, docs, commit, and verified `phase-N` tag pass.

## Agentic workflow
Lead spec -> Architect design -> Tech Lead plan -> Roundtable -> Senior Dev brief/approval -> Developer implementation -> Senior Dev review -> QA -> Security review when applicable -> Lead sign-off -> update-context. Follow `docs/ai/CODEX_AGENTIC_EXECUTION.md` for stage details.

- Architect and Tech Lead write docs, not application code. Developer implements only approved tasks in the feature's `03-plan.md`. QA writes/runs tests and files bugs, not fixes. Security reviews, not implements.
- Each roundtable role records one concrete objection or why none exists in `docs/features/<id>/04-discussion.md`; the outcome is PROCEED, REVISE, or BLOCKED.
- Record only genuinely new or unresolved decisions in canonical `docs/DECISIONS.md`; do not duplicate requirements settled by BUILD_GUIDE.
- Security review applies to contract/token/balance, authentication/roles, passkeys, PINs, Firestore authorization, keys/secrets, intents, and personal-data changes.
- Gates: testable acceptance criteria; no open roundtable blockers; tests defined before implementation tasks; Senior Dev approval; QA pass without regressions; all BUILD_GUIDE checks green; living docs updated.

## Invariants and status discipline
- Contract balances cannot become negative; token transfers only follow the approved contract flows. On-chain state/events, not a database hash chain, establish token state.
- Never log raw biometric data or personal data. Never commit secrets.
- Mark unknowns TODO/UNVERIFIED and planned work PLANNED. Mark application functionality IMPLEMENTED only when it exists and required tests pass.
- Canonical docs: `docs/BUILD_GUIDE.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/THREAT_MODEL.md`. Workflow and context documents stay under `docs/ai/`; `docs/ai/DECISIONS.md` is historical only and points to the canonical register.
- Root checks are `pnpm lint`, `pnpm typecheck`, and `pnpm test`; run phase-specific checks required by BUILD_GUIDE. Do not claim checks pass unless run.
