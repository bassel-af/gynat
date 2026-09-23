/**
 * Shared "create one individual" step, used by the individuals POST route and
 * by the «قفزة نسب» move-to-new-father route (inside its transaction).
 * Encrypts the sensitive fields, applies the kunya-feature strip and the
 * `isDeceased` default, and builds the matching `create individual` audit row
 * (plaintext snapshot wrapped in an encrypted envelope). The row is RETURNED,
 * not written — each caller writes it via `writeTreeEditLog` where its own
 * flow wants it (the POST alongside the tree touch; the move route with its
 * other audit rows, after every stale-check has passed).
 */
import type { z } from 'zod';
import type { Prisma } from '../../../generated/prisma/client';
import type { createIndividualSchema } from '@/lib/tree/schemas';
import {
  snapshotIndividual,
  encryptAuditDescription,
  JSON_NULL,
  type TreeEditLogEntry,
} from '@/lib/tree/audit';
import { encryptIndividualInput, encryptSnapshot } from '@/lib/tree/encryption';

/** The individual-create body, minus the `treeId` routing field. */
export type CreateIndividualFields = Omit<z.infer<typeof createIndividualSchema>, 'treeId'>;

export interface CreateIndividualArgs {
  treeId: string;
  userId: string;
  input: CreateIndividualFields;
  workspaceKey: Buffer;
  /** The workspace's kunya feature toggle — off strips any submitted kunya. */
  enableKunya: boolean;
  isUndo: boolean;
}

export async function createIndividual(
  db: Pick<Prisma.TransactionClient, 'individual'>,
  { treeId, userId, input, workspaceKey, enableKunya, isUndo }: CreateIndividualArgs,
) {
  const data = { ...input };
  if (!enableKunya) {
    delete data.kunya;
  }

  const { isPrivate, isDeceased, ...fields } = data;
  const deceased = isDeceased ?? (fields.deathDate != null);

  // Encrypt sensitive fields BEFORE handing them to Prisma. The returned row
  // carries Buffer/Uint8Array values for those fields — `fields` stays the
  // plaintext source for the audit snapshot.
  const individual = await db.individual.create({
    // Cast via unknown — Prisma Bytes column type is Uint8Array<ArrayBuffer>
    // while Node Buffer is a subclass with ArrayBufferLike. Runtime OK.
    data: {
      treeId,
      ...encryptIndividualInput(fields, workspaceKey),
      isDeceased: deceased,
      isPrivate,
      createdById: userId,
    } as unknown as Prisma.IndividualUncheckedCreateInput,
  });

  const auditEntry: TreeEditLogEntry = {
    treeId,
    userId,
    action: 'create',
    entityType: 'individual',
    entityId: individual.id,
    snapshotBefore: JSON_NULL,
    // The Json column stores `{ _encrypted: true, data: "<base64>" }`; the audit
    // log read path calls `decryptSnapshot` to unwrap it.
    snapshotAfter: encryptSnapshot(
      snapshotIndividual({ id: individual.id, ...fields, isDeceased: deceased, isPrivate }),
      workspaceKey,
    ),
    description: encryptAuditDescription('create', 'individual', fields.givenName ?? null, workspaceKey, { isUndo }),
  };

  return { individual, auditEntry };
}
