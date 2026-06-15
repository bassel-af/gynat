/**
 * Phase 10b (task #16): one-time migration script that re-encrypts any
 * existing plaintext data sitting in the Bytes columns.
 *
 * Background
 * ----------
 * Task #5's Prisma migration used `ALTER COLUMN ... TYPE BYTEA USING
 * convert_to(col, 'UTF8')` to convert `String?` sensitive columns into
 * `Bytes?` without data loss. That leaves the existing rows with valid
 * UTF-8 byte sequences where the app now expects AES-256-GCM ciphertext
 * (12-byte IV || 16-byte auth tag || ciphertext). The running app will
 * throw on the first read through `dbTreeToGedcomData` because the auth
 * tag doesn't verify.
 *
 * This script walks every workspace and:
 *   1. Ensures the workspace has a wrapped data key (generates + wraps
 *      with the master key on demand).
 *   2. For every Individual / Family / RadaFamily row in that workspace's
 *      tree, looks at each encrypted-at-rest column:
 *        - If the stored bytes already decrypt cleanly → ciphertext,
 *          skip.
 *        - Else treat the bytes as UTF-8 plaintext → decode → encrypt
 *          with the workspace key → write back.
 *   3. For every TreeEditLog row in that workspace's tree:
 *        - If `snapshotBefore` or `snapshotAfter` lacks `_encrypted: true`,
 *          wrap it in an encrypted envelope via `encryptSnapshot`.
 *        - (Task #24) If `description` or `payload` Bytes columns do not
 *          decrypt cleanly under the workspace key, treat them as legacy
 *          plaintext UTF-8 (installed by the task #20 migration's
 *          `convert_to(col, 'UTF8')` USING clause) and re-encrypt them
 *          via `encryptField`. Payload plaintext is JSON text; we sanity-
 *          check it parses before re-wrapping so garbage bytes fail loudly.
 *
 * Deployment-order CRITICAL NOTE (task #24)
 * -----------------------------------------
 * This script MUST run AFTER task #20's schema migration
 * (`20260409101126_phase_10b_followup_encrypt_audit_description_payload`)
 * and BEFORE task #23's read-route deployment is exercised. The audit log
 * GET route (`src/app/api/workspaces/[id]/tree/audit-log/route.ts`) has NO
 * legacy-plaintext fallback — if it hits a row whose `description` or
 * `payload` is still UTF-8 bytes, `decryptAuditDescription` /
 * `decryptAuditPayload` will throw an "Unsupported state or unable to
 * authenticate data" error and the admin audit page will crash.
 *
 * Safe production deployment order:
 *   1. Ship the schema migration from #20 (safe: reversible with data).
 *   2. Ship the write-path changes from #22 (new writes land encrypted).
 *   3. Run `pnpm encrypt:existing` to re-encrypt any legacy rows.
 *   4. Ship the read-route changes from #23.
 *
 * In the local dev session, #20 + #22 + #24 are applied back-to-back so
 * there is no window where a broken read path is exposed.
 *
 * Idempotence
 * -----------
 * Running the script twice is a no-op on the second pass — every field
 * is checked via the "already decrypts?" gate before re-encryption. The
 * gate uses the AES-GCM auth tag, so a plaintext UTF-8 row (no tag) will
 * always fail the decrypt check and fall through to the encrypt branch.
 * A proper ciphertext row will always pass and be skipped.
 *
 * Usage
 * -----
 *   pnpm encrypt:existing
 *
 * The script reads `DATABASE_URL` from `.env` and `WORKSPACE_MASTER_KEY`
 * from `.env.local`. Both must be set. The script will fail fast if the
 * master key is missing or malformed.
 */

// Environment loading is handled by the tsx invocation in package.json:
//   tsx --env-file=.env.local --env-file-if-exists=.env scripts/encrypt-existing-data.ts
// This ensures WORKSPACE_MASTER_KEY + DATABASE_URL are populated before any
// imports execute (crucial because src/lib/db.ts calls getMasterKey() at
// module load).

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import {
  generateWorkspaceKey,
  wrapKey,
  unwrapKey,
  encryptField,
  decryptField,
} from '../src/lib/crypto/workspace-encryption';
import { encryptSnapshot } from '../src/lib/tree/encryption';
import { isLikelyPlaintextUtf8 } from './lib/utf8-guard';

// ---------------------------------------------------------------------------
// Constants: which fields get the bytes-migration treatment.
// Keep in sync with INDIVIDUAL_ENCRYPTED_FIELDS / FAMILY_ENCRYPTED_FIELDS
// in src/lib/tree/encryption.ts.
// ---------------------------------------------------------------------------

const INDIVIDUAL_FIELDS = [
  'givenName',
  'surname',
  'fullName',
  'birthDate',
  'birthPlace',
  'birthDescription',
  'birthNotes',
  'birthHijriDate',
  'deathDate',
  'deathPlace',
  'deathDescription',
  'deathNotes',
  'deathHijriDate',
  'kunya',
  'notes',
] as const;

const FAMILY_FIELDS = [
  'marriageContractDate',
  'marriageContractHijriDate',
  'marriageContractPlace',
  'marriageContractDescription',
  'marriageContractNotes',
  'marriageDate',
  'marriageHijriDate',
  'marriagePlace',
  'marriageDescription',
  'marriageNotes',
  'divorceDate',
  'divorceHijriDate',
  'divorcePlace',
  'divorceDescription',
  'divorceNotes',
] as const;

const RADA_FAMILY_FIELDS = ['notes'] as const;

// ---------------------------------------------------------------------------
// Master key loader — manual version of src/lib/crypto/master-key.ts
// (we can't import it because it reads process.env at import time via a
// cached singleton, and we need to fail fast with a clearer error here).
// ---------------------------------------------------------------------------

function loadMasterKey(): Buffer {
  const raw = process.env.WORKSPACE_MASTER_KEY;
  if (!raw) {
    throw new Error(
      'WORKSPACE_MASTER_KEY is not set. Check .env.local. Generate one via: openssl rand -base64 32',
    );
  }
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== 32) {
    throw new Error(
      `WORKSPACE_MASTER_KEY must decode to exactly 32 bytes (got ${decoded.length}). Regenerate via: openssl rand -base64 32`,
    );
  }
  return decoded;
}

// ---------------------------------------------------------------------------
// Per-field migration: ensure the Buffer is AES-GCM ciphertext under `key`.
// Returns `{ changed: true, newValue }` when a re-encryption happened, or
// `{ changed: false }` when the value was already ciphertext (or null).
// ---------------------------------------------------------------------------

type FieldResult = { changed: false } | { changed: true; newValue: Buffer };

function migrateField(current: unknown, key: Buffer): FieldResult {
  if (current === null || current === undefined) {
    return { changed: false };
  }
  // Prisma's driver adapter returns Uint8Array; normalize to Buffer.
  const buf = Buffer.isBuffer(current)
    ? current
    : current instanceof Uint8Array
      ? Buffer.from(current)
      : null;
  if (!buf) {
    return { changed: false };
  }
  // Ciphertext check: AES-GCM packed format is IV(12) + tag(16) + ciphertext(>=0).
  // If the blob is too short, it can't be valid ciphertext → treat as plaintext.
  if (buf.length >= 28) {
    try {
      // If this succeeds, the blob is already ciphertext under this key.
      decryptField(buf, key);
      return { changed: false };
    } catch {
      // Fall through — either plaintext or ciphertext under a different key.
    }
  }
  // Treat as plaintext UTF-8. Skip empty strings (null-equivalent).
  const asString = buf.toString('utf8');
  if (asString.length === 0) {
    return { changed: false };
  }
  const encrypted = encryptField(asString, key);
  return { changed: true, newValue: encrypted };
}

// ---------------------------------------------------------------------------
// Snapshot migration: for TreeEditLog.snapshotBefore / snapshotAfter
// ---------------------------------------------------------------------------

type SnapshotResult = { changed: false } | { changed: true; newValue: { _encrypted: true; data: string } };

function migrateSnapshot(current: unknown, key: Buffer): SnapshotResult {
  if (current === null || current === undefined) {
    return { changed: false };
  }
  // Already an envelope?
  if (
    typeof current === 'object' &&
    (current as { _encrypted?: unknown })._encrypted === true
  ) {
    return { changed: false };
  }
  // Legacy plaintext JSON object — wrap it.
  const envelope = encryptSnapshot(current as object, key);
  return { changed: true, newValue: envelope };
}

// ---------------------------------------------------------------------------
// Main migration driver
// ---------------------------------------------------------------------------

interface MigrationStats {
  workspacesSeen: number;
  workspacesKeyCreated: number;
  individualsSeen: number;
  individualsUpdated: number;
  individualFieldsEncrypted: number;
  familiesSeen: number;
  familiesUpdated: number;
  familyFieldsEncrypted: number;
  radaFamiliesSeen: number;
  radaFamiliesUpdated: number;
  radaFamilyFieldsEncrypted: number;
  editLogsSeen: number;
  editLogSnapshotsEncrypted: number;
  // Task #24 — description + payload re-encryption counters
  editLogsUpdated: number;
  editLogDescriptionsEncrypted: number;
  editLogPayloadsEncrypted: number;
}

async function migrateWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  workspaceNameAr: string,
  masterKey: Buffer,
  stats: MigrationStats,
): Promise<void> {
  console.log(`\n→ Workspace ${workspaceNameAr} (${workspaceId})`);
  stats.workspacesSeen++;

  // Step 1: ensure the workspace has a wrapped key. All subsequent writes
  // go through this key.
  let workspaceKey: Buffer;
  const existingWorkspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { encryptedKey: true },
  });
  if (!existingWorkspace) {
    console.log('   (workspace disappeared mid-run, skipping)');
    return;
  }
  if (existingWorkspace.encryptedKey) {
    const storedKeyBuf = Buffer.from(existingWorkspace.encryptedKey);
    workspaceKey = unwrapKey(storedKeyBuf, masterKey);
    console.log(`   workspace key: already present, unwrapped OK`);
  } else {
    workspaceKey = generateWorkspaceKey();
    const wrapped = wrapKey(workspaceKey, masterKey);
    await prisma.workspace.update({
      where: { id: workspaceId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { encryptedKey: wrapped } as any,
    });
    stats.workspacesKeyCreated++;
    console.log(`   workspace key: GENERATED + wrapped + saved`);
  }

  // Step 2: find the main tree for this workspace (if any)
  const tree = await prisma.familyTree.findFirst({
    where: { workspaceId, kind: 'main' },
    select: { id: true },
  });
  if (!tree) {
    console.log('   no tree — nothing to migrate');
    return;
  }
  const treeId = tree.id;

  // Step 3: walk individuals
  const individuals = await prisma.individual.findMany({
    where: { treeId },
  });
  stats.individualsSeen += individuals.length;

  for (const ind of individuals) {
    const updates: Record<string, Buffer> = {};
    for (const field of INDIVIDUAL_FIELDS) {
      const result = migrateField(
        (ind as unknown as Record<string, unknown>)[field],
        workspaceKey,
      );
      if (result.changed) {
        updates[field] = result.newValue;
      }
    }
    if (Object.keys(updates).length > 0) {
      await prisma.individual.update({
        where: { id: ind.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: updates as any,
      });
      stats.individualsUpdated++;
      stats.individualFieldsEncrypted += Object.keys(updates).length;
    }
  }
  console.log(
    `   individuals: ${individuals.length} seen, ${stats.individualsUpdated} updated (+${stats.individualFieldsEncrypted} fields encrypted)`,
  );

  // Reset per-workspace counters for cleaner logs? No — stats are cumulative.

  // Step 4: walk families
  const families = await prisma.family.findMany({
    where: { treeId },
  });
  stats.familiesSeen += families.length;

  for (const fam of families) {
    const updates: Record<string, Buffer> = {};
    for (const field of FAMILY_FIELDS) {
      const result = migrateField(
        (fam as unknown as Record<string, unknown>)[field],
        workspaceKey,
      );
      if (result.changed) {
        updates[field] = result.newValue;
      }
    }
    if (Object.keys(updates).length > 0) {
      await prisma.family.update({
        where: { id: fam.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: updates as any,
      });
      stats.familiesUpdated++;
      stats.familyFieldsEncrypted += Object.keys(updates).length;
    }
  }
  console.log(`   families: ${families.length} seen`);

  // Step 5: walk rada families
  const radaFamilies = await prisma.radaFamily.findMany({
    where: { treeId },
  });
  stats.radaFamiliesSeen += radaFamilies.length;

  for (const rf of radaFamilies) {
    const updates: Record<string, Buffer> = {};
    for (const field of RADA_FAMILY_FIELDS) {
      const result = migrateField(
        (rf as unknown as Record<string, unknown>)[field],
        workspaceKey,
      );
      if (result.changed) {
        updates[field] = result.newValue;
      }
    }
    if (Object.keys(updates).length > 0) {
      await prisma.radaFamily.update({
        where: { id: rf.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: updates as any,
      });
      stats.radaFamiliesUpdated++;
      stats.radaFamilyFieldsEncrypted += Object.keys(updates).length;
    }
  }
  console.log(`   rada families: ${radaFamilies.length} seen`);

  // Step 6: walk audit log entries and re-wrap snapshots + re-encrypt
  // description/payload Bytes columns (task #24).
  const editLogs = await prisma.treeEditLog.findMany({
    where: { treeId },
    select: {
      id: true,
      snapshotBefore: true,
      snapshotAfter: true,
      description: true,
      payload: true,
    },
  });
  stats.editLogsSeen += editLogs.length;

  for (const log of editLogs) {
    const updates: Record<string, unknown> = {};
    const beforeResult = migrateSnapshot(log.snapshotBefore, workspaceKey);
    if (beforeResult.changed) {
      updates.snapshotBefore = beforeResult.newValue;
    }
    const afterResult = migrateSnapshot(log.snapshotAfter, workspaceKey);
    if (afterResult.changed) {
      updates.snapshotAfter = afterResult.newValue;
    }

    // description: Bytes column. If it decrypts under the workspace key
    // it's already ciphertext — skip. Otherwise treat as legacy UTF-8
    // plaintext (from the task #20 migration's `convert_to(col, 'UTF8')`
    // USING clause) and re-encrypt.
    if (log.description) {
      const descBuf = Buffer.isBuffer(log.description)
        ? log.description
        : Buffer.from(log.description);
      let alreadyEncrypted = false;
      if (descBuf.length >= 28) {
        try {
          decryptField(descBuf, workspaceKey);
          alreadyEncrypted = true;
        } catch {
          // Fall through to re-encrypt.
        }
      }
      if (!alreadyEncrypted) {
        // Sanity guard mirrors the JSON.parse check on the payload branch:
        // if the bytes don't look like plaintext UTF-8 (binary control bytes,
        // invalid UTF-8 sequences), skip the row instead of re-wrapping
        // garbage. The warning log carries ONLY a stable identifier — never
        // the description content, which could be PII.
        if (!isLikelyPlaintextUtf8(descBuf)) {
          console.warn(
            `   [skip] edit log ${log.id} description: bytes failed UTF-8 sanity guard`,
          );
        } else {
          const plaintext = descBuf.toString('utf8');
          updates.description = encryptField(plaintext, workspaceKey);
          stats.editLogDescriptionsEncrypted++;
        }
      }
    }

    // payload: Bytes column; the plaintext (if legacy) is JSON text.
    if (log.payload) {
      const payBuf = Buffer.isBuffer(log.payload)
        ? log.payload
        : Buffer.from(log.payload);
      let alreadyEncrypted = false;
      if (payBuf.length >= 28) {
        try {
          decryptField(payBuf, workspaceKey);
          alreadyEncrypted = true;
        } catch {
          // Fall through.
        }
      }
      if (!alreadyEncrypted) {
        const plaintext = payBuf.toString('utf8');
        // Sanity-check: if this was a legacy Json column hand-migrated
        // to Bytes via `convert_to("payload"::text, 'UTF8')`, the bytes
        // must be valid JSON. Fail loudly on garbage so we don't silently
        // re-wrap corruption.
        JSON.parse(plaintext);
        updates.payload = encryptField(plaintext, workspaceKey);
        stats.editLogPayloadsEncrypted++;
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.treeEditLog.update({
        where: { id: log.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: updates as any,
      });
      if ('snapshotBefore' in updates || 'snapshotAfter' in updates) {
        stats.editLogSnapshotsEncrypted++;
      }
      if ('description' in updates || 'payload' in updates) {
        stats.editLogsUpdated++;
      }
    }
  }
  console.log(
    `   edit logs: ${editLogs.length} seen, ${stats.editLogSnapshotsEncrypted} snapshots wrapped, ${stats.editLogDescriptionsEncrypted} descriptions encrypted, ${stats.editLogPayloadsEncrypted} payloads encrypted`,
  );
}

async function main(): Promise<void> {
  // Fail fast if the master key is missing/bad.
  const masterKey = loadMasterKey();
  console.log('Master key loaded (32 bytes).');

  // Sanity: make sure DATABASE_URL is set too.
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Check .env or .env.local.');
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const stats: MigrationStats = {
    workspacesSeen: 0,
    workspacesKeyCreated: 0,
    individualsSeen: 0,
    individualsUpdated: 0,
    individualFieldsEncrypted: 0,
    familiesSeen: 0,
    familiesUpdated: 0,
    familyFieldsEncrypted: 0,
    radaFamiliesSeen: 0,
    radaFamiliesUpdated: 0,
    radaFamilyFieldsEncrypted: 0,
    editLogsSeen: 0,
    editLogSnapshotsEncrypted: 0,
    editLogsUpdated: 0,
    editLogDescriptionsEncrypted: 0,
    editLogPayloadsEncrypted: 0,
  };

  try {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, nameAr: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`Found ${workspaces.length} workspace(s) to migrate.`);

    for (const ws of workspaces) {
      await migrateWorkspace(prisma, ws.id, ws.nameAr, masterKey, stats);
    }

    console.log('\n======================================');
    console.log('Phase 10b encryption migration complete');
    console.log('======================================');
    console.log(`Workspaces scanned:           ${stats.workspacesSeen}`);
    console.log(`Workspaces gaining new key:   ${stats.workspacesKeyCreated}`);
    console.log(`Individuals scanned:          ${stats.individualsSeen}`);
    console.log(`Individuals updated:          ${stats.individualsUpdated}`);
    console.log(`Individual fields encrypted:  ${stats.individualFieldsEncrypted}`);
    console.log(`Families scanned:             ${stats.familiesSeen}`);
    console.log(`Families updated:             ${stats.familiesUpdated}`);
    console.log(`Family fields encrypted:      ${stats.familyFieldsEncrypted}`);
    console.log(`Rada families scanned:        ${stats.radaFamiliesSeen}`);
    console.log(`Rada families updated:        ${stats.radaFamiliesUpdated}`);
    console.log(`Rada family fields encrypted: ${stats.radaFamilyFieldsEncrypted}`);
    console.log(`Edit log entries scanned:     ${stats.editLogsSeen}`);
    console.log(`Edit log snapshots wrapped:   ${stats.editLogSnapshotsEncrypted}`);
    console.log(`Edit log desc/payload rows:   ${stats.editLogsUpdated}`);
    console.log(`Edit log descriptions enc:    ${stats.editLogDescriptionsEncrypted}`);
    console.log(`Edit log payloads enc:        ${stats.editLogPayloadsEncrypted}`);
    console.log('\nRun the script again to confirm idempotence —');
    console.log('the second pass should report 0 updates.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n✗ Migration failed:');
  console.error(err);
  process.exit(1);
});
