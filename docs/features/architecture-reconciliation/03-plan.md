# Documentation task plan

- Status: REVIEW REQUIRED
- Scope: documentation reconciliation only; no Phase 0 implementation.

## Checks defined before tasks
1. **Authority:** verify all Parts A-E and compare architecture checklist items with guide B1-B6 and Phase 0 in D.
2. **Legacy:** search active docs, agents, protocol, and skills; old terms may remain only in explicit SUPERSEDED archives, guide supersession statements, or warnings against revival.
3. **Canonical docs:** verify root `docs/DECISIONS.md`, `docs/PROGRESS.md`, and `docs/THREAT_MODEL.md` exist; `docs/ai/DECISIONS.md` is archival; active references resolve to root docs.
4. **Living docs:** verify context, brief, backlog, known issues, progress, and threat model agree with the guide and keep app functionality PLANNED.
5. **Workflow:** verify AGENTS, protocol, role definitions, skills, and templates preserve gates/remits and use canonical paths/roadmap.
6. **Final state:** record search evidence and explicit outcomes for all roles; Roundtable ends with exactly PROCEED, REVISE, or BLOCKED.

## Tasks
- DOC-1: Lead fixes scope and criteria in 01-spec.md. Evidence: authority check.
- DOC-2: Architect verifies the guide and maps changes in 02-design.md. Evidence: source review.
- DOC-3: Tech Lead approves this docs-only plan and defines static checks before edits. Evidence: tests-first/task mapping.
- DOC-4: Establish canonical root docs and reconcile context, brief, backlog, issues, glossary, progress, and threat model. Evidence: checks 3-4 and per-file status/path review.
- DOC-5: Reconcile AGENTS, execution protocol, legacy ADR archive, role definitions, and relevant skills. Evidence: checks 2 and 5 plus search output.
- DOC-6: Roundtable records Architect, Tech Lead, Senior Dev, QA, and Security Reviewer input and resolves objections in 04-discussion.md. Evidence: every role has one objection/no-objection and a recorded disposition.
- DOC-7: Security Reviewer completes the applicable post-roundtable architecture/security review; Senior Dev reviews the reconciled documentation diff. Evidence: risk wording, no false implementation claims, and preservation of gates.
- DOC-8: Lead completes 06-signoff.md after all checks/reviews pass.

## Completion conditions
All checks in the test plan pass by inspection/search, specialist outcomes are explicit, Roundtable is PROCEED, no application functionality is marked IMPLEMENTED, and Phase 0 is only READY TO START (not complete). Any unresolved BUILD_GUIDE or security blocker prevents readiness. No specific unresolved blocker is currently accepted as waived; record any such blocker in 04-discussion.md and leave Phase 0 blocked until resolved.
