# Known issues and deferred decisions

- **PLANNED:** No application or product functionality has been implemented. Phase 0 tooling and package skeletons are complete; see `docs/PROGRESS.md`.
- **PLANNED:** Complete threat-model review and validation with implemented controls during Phase 8; the current `docs/THREAT_MODEL.md` is an architecture baseline, not a security audit.
- **TODO for Phase 1:** Choose and record the policy for settling an unknown/inactive merchant, as called out in BUILD_GUIDE B7.
- **Residual design risks:** backend, relayer, and Campus Accounts admin are trusted; four-to-six digit PIN hashes may be vulnerable to offline guessing if exposed; `WALLET_SALT` exposure enables deterministic address derivation and linkability, while backend or signing-key compromise can enable authorization abuse. Salt rotation may require migration. These limitations are documented in `docs/THREAT_MODEL.md`; no design change is made here.
- **PLANNED:** Testnet/faucet selection is deferred to Phase 9 and must be verified at that time.
- **LOW / DEFERRED:** GitHub Actions use maintained major-version tags rather than immutable commit SHAs. Security review found no Phase 0 blocker; consider SHA pinning during CI hardening.
