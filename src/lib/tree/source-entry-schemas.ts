/**
 * Sources («المصادر») — request schemas for the text-only entry API (step 4).
 *
 * An entry is a standalone piece of evidence on one person (or the tree-wide
 * entry). Every string carries a `.max()`.
 *
 * Step 5 (files): an entry carries text, files, or both — never neither.
 * Files are uploaded first on their own (staged, `POST sources/uploads`) and
 * attached here by id (`fileIds`). The schemas enforce "text or files" where
 * the request alone decides it (create); PATCH / PUT re-check it in the route
 * against the entry's stored files.
 */
import { z } from 'zod';
import { targetTreeIdSchema } from '@/lib/tree/schemas';

export const MAX_SOURCE_TEXT = 2000;
/** Upper bound on one bulk action — also the «تحديد الكل» id cap. */
export const MAX_BULK_IDS = 500;
export const MAX_SOURCE_PAGE = 50;
export const MAX_SOURCE_QUERY = 200;
/**
 * Text search and suggestions run on DECRYPTED text in memory (the column is
 * ciphertext). Fine at v1 scale; the scan is capped so one request never
 * decrypts an unbounded table.
 */
export const SOURCE_SCAN_CAP = 5000;
/** Suggestions returned per keystroke. */
export const MAX_SOURCE_SUGGESTIONS = 10;

const TEXT_MESSAGE = `نص المصدر مطلوب ولا يتجاوز ${MAX_SOURCE_TEXT} حرف`;

export const sourceTextSchema = z
  .string()
  .max(MAX_SOURCE_TEXT * 2, TEXT_MESSAGE) // raw guard before trimming
  .trim()
  .min(1, TEXT_MESSAGE)
  .max(MAX_SOURCE_TEXT, TEXT_MESSAGE);

/**
 * Text that may be absent: `''` and `null` both mean "no text"; anything else
 * must pass `sourceTextSchema` (so whitespace-only is still refused).
 */
export const optionalSourceTextSchema = z
  .union([z.literal(''), z.null(), sourceTextSchema])
  .transform((v) => (v === '' ? null : v));

/** Per-entry file cap (also the most ids one request may attach). */
export const MAX_FILES_PER_ENTRY = 20;

export const fileIdsSchema = z.array(z.string().uuid()).max(MAX_FILES_PER_ENTRY, `لا يمكن إرفاق أكثر من ${MAX_FILES_PER_ENTRY} ملفًا بالمصدر الواحد`);

export const TEXT_OR_FILES_MESSAGE = 'أضف نص المصدر أو ملفًا واحدًا على الأقل';

export const sourceVisibilitySchema = z.enum(['admins', 'members', 'public']);

export const createSourceEntrySchema = z
  .object({
    treeId: targetTreeIdSchema,
    text: optionalSourceTextSchema.optional().transform((v) => v ?? null),
    fileIds: fileIdsSchema.optional(),
    visibility: sourceVisibilitySchema.optional(),
  })
  .refine((d) => d.text !== null || (d.fileIds?.length ?? 0) > 0, { message: TEXT_OR_FILES_MESSAGE });

export const updateSourceEntrySchema = z
  .object({
    treeId: targetTreeIdSchema,
    /** `null` / `''` clears the text — only allowed while the entry keeps a file. */
    text: optionalSourceTextSchema.optional(),
    fileIds: fileIdsSchema.optional(),
    visibility: sourceVisibilitySchema.optional(),
  })
  .refine((d) => d.text !== undefined || d.visibility !== undefined || (d.fileIds?.length ?? 0) > 0, {
    message: 'لا يوجد ما يُعدَّل',
  });

/** The tree-wide entry («مصدر الشجرة») — upsert, at most one per tree. */
/** Omitted `text` keeps the stored text; `null` / `''` clears it (files must remain). */
export const putTreeEntrySchema = z.object({
  treeId: targetTreeIdSchema,
  text: optionalSourceTextSchema.optional(),
  fileIds: fileIdsSchema.optional(),
  visibility: sourceVisibilitySchema,
});

export const bulkSourceEntriesSchema = z
  .object({
    treeId: targetTreeIdSchema,
    ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS),
    action: z.enum(['setVisibility', 'delete']),
    visibility: sourceVisibilitySchema.optional(),
  })
  .refine((d) => d.action !== 'setVisibility' || d.visibility !== undefined, {
    message: 'اختر من يرى المصادر',
    path: ['visibility'],
  });

/** «المصادر» page. `cursor` is an opaque offset into the filtered list. */
export const listSourceEntriesQuerySchema = z.object({
  treeId: targetTreeIdSchema,
  q: z.string().max(MAX_SOURCE_QUERY).optional(),
  visibility: sourceVisibilitySchema.optional(),
  cursor: z.coerce.number().int().min(0).max(1_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_SOURCE_PAGE).default(20),
});

export const sourceSuggestionsQuerySchema = z.object({
  treeId: targetTreeIdSchema,
  q: z.string().max(MAX_SOURCE_QUERY).optional(),
});

export type SourceVisibilityInput = z.infer<typeof sourceVisibilitySchema>;
export type CreateSourceEntryInput = z.infer<typeof createSourceEntrySchema>;
export type UpdateSourceEntryInput = z.infer<typeof updateSourceEntrySchema>;
export type PutTreeEntryInput = z.infer<typeof putTreeEntrySchema>;
export type BulkSourceEntriesInput = z.infer<typeof bulkSourceEntriesSchema>;
