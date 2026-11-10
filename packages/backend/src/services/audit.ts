import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Logger } from 'pino';
import { AuditLogInputSchema, type AuditLogInput } from '@fingerpay/shared';

export class AuditLogger {
  constructor(
    private readonly firestore: Firestore,
    private readonly logger: Logger,
  ) {}

  async write(input: AuditLogInput): Promise<void> {
    const entry = AuditLogInputSchema.parse(input);
    await this.firestore.collection('adminLogs').add({
      actorUid: entry.actorUid,
      action: entry.action,
      meta: entry.meta,
      createdAt: FieldValue.serverTimestamp(),
    });
    this.logger.info({ actorUid: entry.actorUid, action: entry.action }, 'Audit event recorded');
  }
}
