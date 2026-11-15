# QR image upload design

## Components and data flow

- `packages/frontend/src/pages/Scan.tsx` adds an image input and uses the existing `html5-qrcode` dependency's `scanFile` method in the browser.
- The upload decoder uses its own reader element/instance so choosing an image does not stop or reconfigure the live camera scanner.
- Decoded text is passed through the existing intent URL/ID parser. A valid result navigates to `/pay/:intentId`; merchant and amount are still loaded and presented by the existing payment page.
- The browser validates image MIME type when available and rejects files larger than 10 MiB. The file is neither posted to the backend nor persisted.
- Backend payment authorization, intent schema, Firestore collections, contracts, and credential boundaries do not change in this feature.

## Decision

Use the already pinned browser QR library for local image decoding. This follows the current architecture and adds no dependency or server data flow, so no ADR is required.

## Affected files

- Frontend: `packages/frontend/src/pages/Scan.tsx`
- Frontend QA: `packages/frontend/test/qr-upload.test.tsx`
- Product specification: `docs/BUILD_GUIDE.md` B11
- Feature workflow: this directory and the living docs after verification
