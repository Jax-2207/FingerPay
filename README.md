# FingerPay

FingerPay is a closed-loop campus payment demo using CampusCoin (CPC). The architecture and security requirements are defined in [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md). All application features remain planned while repository tooling is established.

## Requirements

- Node.js 22.23.4 (see `.nvmrc`; Node 22 LTS)
- Corepack with pnpm 12.18.0
- Java 21 or later to run the Firestore emulator

## Setup

```sh
corepack enable
corepack prepare pnpm@12.18.0 --activate
pnpm install
```

Copy `.env.example` to `.env` for local configuration. It contains safe emulator values only; never commit credentials.

## Firebase emulators

The local configuration starts Firebase Authentication and Cloud Firestore emulators on loopback addresses. No live Firebase project or credentials are required.

```sh
pnpm emulators
```

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Development

```sh
pnpm dev
```

The frontend command starts the Vite development server bound to `127.0.0.1`. The workspaces are scaffolding only; no payment, authentication, contract, or other business behavior is implemented in Phase 0.
