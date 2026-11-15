# QR image upload for student scan

- ID/title: F-003 — QR image upload
- Status: APPROVED for implementation by user on 2026-11-15
- Owner: Codex / project lead
- Problem/user value: A student may have a screenshot or saved image of a merchant QR but cannot use the live camera scanner. Add an image-file option beside the existing camera scan and manual-entry fallback.
- Scope / out of scope: Student `/scan` page only; decode image QR codes in the browser; accept image files up to 10 MiB; route valid FingerPay intent URLs/IDs through the existing payment flow. Out of scope: uploading image contents to the backend, storing files, camera redesign, changing payment authorization, or auto-submitting payment.
- User flows: Student opens Scan & Pay, selects a QR image, reviews the resulting merchant/amount on the existing payment page, and separately authorizes payment.
- Data/permissions: Selected image is read locally by the browser decoder and is not sent to an API or persisted by FingerPay. Existing student authentication and payment authorization remain unchanged.
- Testable acceptance criteria:
  1. The scan page offers a clearly labeled image chooser alongside camera scanning and manual entry.
  2. A valid image QR containing a FingerPay payment URL or intent ID navigates to the existing `/pay/:intentId` page.
  3. Unreadable, non-image, oversized, or non-payment QR inputs show a clear error and do not navigate or submit payment.
  4. The selected file is processed locally; no upload request or file persistence is added.
  5. Existing camera and manual-entry behavior remains available.
- Risks/open questions: Large image decoding can consume browser memory; limit image files to 10 MiB. Existing payment intent expiry and approval checks remain authoritative.
