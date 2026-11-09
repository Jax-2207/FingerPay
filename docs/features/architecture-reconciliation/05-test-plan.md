# Documentation review plan

- Feature: DOC-001 Architecture reconciliation
- Status: PLANNED

## Checks
- C1 Authority: verify all Part headings A-E and required architecture against guide B1-B6 and Phase 0 in D.
- C2 Legacy: search active docs/agent instructions/skills for Aadhaar, PAN, Cloud Functions, Cloudinary, INR peg, Firestore balance source, hash-chain ledger, and SuperAdmin. Matches are permitted only in the guide's supersession note, explicitly superseded archive entries, and prohibition wording.
- C3 Canonical paths: verify root DECISIONS/PROGRESS/THREAT_MODEL exist; `docs/ai/DECISIONS.md` is archival; active references resolve to root docs.
- C4 Status: inspect context, brief, backlog, progress, and threat model; all app functionality must remain PLANNED/NOT STARTED.
- C5 Workflow: verify AGENTS incorporates Part A without weakening role gates, protocol uses canonical paths/roadmap, and agent/skill instructions preserve role boundaries and security requirements.
- C6 Roundtable: each applicable role has a concrete objection or explicit no-objection and resolution; exactly one final outcome is recorded.
- No package installation, runtime command, application test, or Phase 0 check is in scope; these belong to Phase 0.

## Required evidence
Record command output or file references for C1-C6 in 06-signoff.md. Any unchecked item remains UNVERIFIED and blocks PROCEED.
