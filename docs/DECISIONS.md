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

Phase 0 dependency pins are finalized above.

### Phase 1 contract-toolchain pins (2026-11-09)

Selected before Phase 1 dependency installation. Hardhat Toolbox `6.1.2` is the Hardhat 2 compatible release (the npm `hh2` tag); it supplies the ethers v6, TypeChain, chai, and gas reporter integration required by Phase 1. Pin the package directly and let the committed pnpm lockfile pin its compatible peer graph. Use the exact Hardhat 2 release and OpenZeppelin v5 release below. The repository runtime remains Node `22.23.4` with pnpm `12.18.0` from the Phase 0 decision.

| Tool/package | Exact version |
|---|---:|
| Hardhat | 2.29.1 |
| `@nomicfoundation/hardhat-toolbox` | 6.1.2 (Hardhat 2 compatible `hh2` release) |
| `@nomicfoundation/hardhat-ethers` | 3.1.3 |
| `@nomicfoundation/hardhat-network-helpers` | 1.1.2 |
| `@types/mocha` | 10.0.10 |
| `@openzeppelin/contracts` | 5.6.1 |
| Solidity compiler | 0.8.28 |
| TypeScript | 5.9.3 (existing root pin) |
| ethers | 6.17.0 (Toolbox ethers v6 peer; direct pin) |
| `hardhat-gas-reporter` | 2.3.0 (Toolbox integration; direct pin) |
| Node.js / pnpm | 22.23.4 / 12.18.0 (existing repository pins) |

The compiler is pinned to an exact release within the BUILD_GUIDE B7 `^0.8.24` range. Use exact version strings for all direct additions and commit the resulting lockfile. Official Hardhat and npm package metadata were checked on 2026-11-09; the registry was not reachable from the local shell, so installation and lockfile resolution are the compatibility verification gate. If the resolver reports incompatible peers, stop and revise these pins here before retrying installation.

## Accepted Phase 1 contract decisions

### ADR-0001: Settlement by registered inactive merchants

- Status: ACCEPTED
- Date: 2026-11-09
- Feature: Phase 1 smart contracts

#### Context

BUILD_GUIDE B7 requires `settle()` to reject an unknown/inactive merchant according to an implementation policy but leaves the distinction open. Requiring active status could strand remaining CPC after administrative deactivation.

#### Options

1. Allow settlement only for active merchants; remaining CPC would require reactivation before settlement.
2. Allow settlement for previously registered merchants even when inactive; reject never-registered addresses.

#### Decision

Allow settlement for any previously registered merchant, active or inactive. Reject never-registered addresses. The user explicitly approved this policy on 2026-11-09. Track registration separately from active status so the contract can distinguish an inactive registered merchant from an unknown address.

#### Consequences

- Deactivation prevents new payments but does not prevent settlement of remaining merchant CPC.
- Contract state must preserve registration history; deactivation must not erase it.
- Tests must verify settlement succeeds for an inactive registered merchant and rejects a never-registered address.

### ADR-0002: Reject zero-value settlement

- Status: ACCEPTED
- Date: 2026-11-09
- Feature: Phase 1 smart contracts

#### Context

B7 lists `ZeroAmount` and amount-moving operations, but does not explicitly state the zero-value `settle()` behavior. Permitting zero could record a settlement without burning CPC and would make reconciliation misleading.

#### Options

1. Permit zero-value settlement as a zero-balance no-op.
2. Reject zero-value settlement with `ZeroAmount`.

#### Decision

Reject `settle()` when `amount == 0` with `ZeroAmount`. The user explicitly approved this policy on 2026-11-09.

#### Consequences

- All recorded settlements represent a positive CPC burn.
- Tests must assert the zero amount revert and verify no state change or `Settled` event.

### ADR-0003: Reject zero-value mint

- Status: ACCEPTED
- Date: 2026-11-09
- Feature: Phase 1 smart contracts

#### Context

B7 lists `ZeroAmount` but does not explicitly specify zero-value mint behavior. A zero-value mint would emit an issuance record without increasing CPC supply.

#### Options

1. Permit zero-value mint as a no-op.
2. Reject zero-value mint with `ZeroAmount`.

#### Decision

Reject `mint(to, amount, receiptRef)` when `amount == 0` with `ZeroAmount`. The user explicitly approved this policy on 2026-11-09.

#### Consequences

- Every successful `Minted` event corresponds to a positive CPC supply increase.
- Tests must assert the zero amount revert and verify no state change or `Minted` event.
