# FingerPay decision register

This is the canonical decision register. `docs/BUILD_GUIDE.md` is authoritative for requirements already settled there; do not copy those requirements into duplicate ADRs. Historical proposals are retained and marked SUPERSEDED in `docs/ai/DECISIONS.md`.

## Recorded decisions

No new architecture decision was made during DOC-001. Product and technical architecture are set by BUILD_GUIDE Parts A-E.

### Phase 0 toolchain pins (2026-11-09)

Selected before dependency installation to provide a reproducible Phase 0 workspace. Node 22.23.4 is the supported local/CI runtime; Vite 8 requires Node 20.19+ or 22.12+, Vitest 5 requires Node 22.12+, and lint-staged 17 requires Node 22.22.1+. These versions therefore use the Node 22 line, as allowed by BUILD_GUIDE A2.

| Tool/package | Exact version |
|---|---:|
| Node.js | 22.23.4 |
| pnpm | 12.18.0 |
| TypeScript | 5.9.3 |
| ESLint | 10.14.0 |
| `@eslint/js` | 10.0.1 |
| `typescript-eslint` | 8.72.1 |
| Prettier | 3.9.10 |
| Husky | 9.1.7 |
| lint-staged | 17.6.0 |
| Vitest | 5.1.0 |
| Vite | 8.3.7 |
| React / React DOM | 19.3.1 |
| `@types/react` / `@types/react-dom` | 19.3.0 |
| `@vitejs/plugin-react` | 6.3.0 |
| `@types/node` | 22.20.5 |
| `globals` | 17.14.0 |
| Firebase CLI (`pnpm dlx firebase-tools`) | 15.35.0 (on-demand; not installed as a workspace dependency) |
| YAML parser (`yaml`) | 2.9.1 |

All manifest dependency specifications will use exact versions (no semver ranges); the pnpm lockfile will be committed. Registry metadata and official Node/Vite/Vitest/Firebase documentation were checked before selecting these pins. If installation demonstrates incompatibility, stop, document the revised pin here, then install.

## Pending implementation-time decisions

- **Phase 1:** Select and document the policy for `settle()` when the merchant is unknown or inactive, as specifically required by BUILD_GUIDE B7.

The Phase 1 item is a bounded implementation choice, not an unresolved architecture ADR. Phase 0 dependency pins are finalized above.
