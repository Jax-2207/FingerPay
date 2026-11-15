# F-003 implementation plan

## Tests (defined before implementation)

1. Frontend component test: choosing an image whose QR decodes to a FingerPay payment URL calls the local file decoder and navigates to the matching `/pay/:intentId` route.
2. Frontend component test: an unrecognized QR or decoder failure shows a friendly error and stays on `/scan`.
3. Frontend component test: non-image and over-10-MiB files are rejected before `scanFile` is called.
4. Regression test: existing manual intent URL/ID entry remains functional; camera scanner initialization is not replaced by the image option.
5. Typecheck/lint/build checks confirm the `Html5Qrcode.scanFile` integration and accessible input compile cleanly.

## Ordered tasks

- **F-003-T1 — Add local image scan control.** Own `Scan.tsx`. Add accessible file selection, local decode state, 10 MiB/type validation, error handling, and route valid decoded text through the existing parser. Preserve camera and manual paths. Acceptance: criteria 1–5 in `01-spec.md`.
- **F-003-T2 — Add UI regression coverage.** Own `qr-upload.test.tsx`. Cover valid URL routing, invalid/unreadable image, type/size rejection, and no payment submission. Acceptance: tests 1–4 above pass.
- **F-003-T3 — Update specification and status docs.** Update BUILD_GUIDE B11 and living docs only after implementation checks pass. Acceptance: behavior and verification are described accurately.

## Senior Developer brief

**APPROVED.** Keep scanning entirely in the client, use a separate file-scanner instance because `scanFile` is only valid when that instance is not camera-scanning, reject oversize and known non-image files, and never navigate to payment authorization until the existing parser accepts the decoded result. No payment, schema, or role changes are in scope.
