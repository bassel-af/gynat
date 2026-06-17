import { z } from 'zod';

// ---------------------------------------------------------------------------
// Collections — Zod request schemas (Lane A foundation).
//
// titleAr / descriptionAr are PLAINTEXT curation labels (course / section
// names, not family PII) — see the schema comment on `Collection`. Length caps
// mirror the existing tree schemas (`src/lib/tree/schemas.ts`).
//
// Collection VISIBILITY changes REUSE the public-tree `visibilityPatchSchema`
// (`src/lib/tree/publish-schemas.ts`). Import it from there at the route layer
// rather than redefining a second visibility ladder.
// ---------------------------------------------------------------------------

export { visibilityPatchSchema } from '@/lib/tree/publish-schemas';
export type { VisibilityPatchInput } from '@/lib/tree/publish-schemas';

/** A non-empty Arabic title (1..max) that also rejects whitespace-only input. */
function titleField(max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((v) => v.trim().length > 0, { message: 'العنوان مطلوب' });
}

// ---------------------------------------------------------------------------
// Collection create / update
// ---------------------------------------------------------------------------

export const createCollectionSchema = z.object({
  titleAr: titleField(150),
  descriptionAr: z.string().max(2000).nullable().optional(),
});

export const updateCollectionSchema = z.object({
  titleAr: titleField(150).optional(),
  descriptionAr: z.string().max(2000).nullable().optional(),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

// ---------------------------------------------------------------------------
// Extra tree create — an `extra`-kind FamilyTree that lives inside collections.
// ---------------------------------------------------------------------------

export const createExtraTreeSchema = z.object({
  nameAr: titleField(150),
});

export type CreateExtraTreeInput = z.infer<typeof createExtraTreeSchema>;

// ---------------------------------------------------------------------------
// Add item — discriminated union on `kind`.
//
// Three shapes (the UX contract in `src/lib/collections/api.ts`):
//  - own/extra tree: picked directly inside the workspace (treeId + linkMode)
//  - linked-in tree: brought from another family by pasted link/code
//    (linkInput + linkMode) — Lane B resolves it into a branchPointer
//  - nested collection: childCollectionId
// ---------------------------------------------------------------------------

const itemLinkModeSchema = z.enum(['linked', 'copied']);

// A `kind:'tree'` item is EITHER an own/extra tree (treeId) OR a brought-in
// tree (linkInput) — exactly one. Both share linkMode + title/description. The
// two tree sub-shapes can't be separate discriminated-union branches (Zod
// forbids a duplicate discriminator value), so they are one branch refined to
// enforce the treeId-XOR-linkInput rule.
const treeItemSchema = z
  .object({
    kind: z.literal('tree'),
    treeId: z.string().uuid().optional(),
    linkInput: z.string().min(1).max(500).optional(),
    linkMode: itemLinkModeSchema,
    titleAr: titleField(150),
    descriptionAr: z.string().max(2000).nullable().optional(),
  })
  .refine((d) => (d.treeId != null) !== (d.linkInput != null), {
    message: 'يجب تحديد شجرة من المساحة أو لصق رابط — وليس كليهما',
  });

const nestedItemSchema = z.object({
  kind: z.literal('collection'),
  childCollectionId: z.string().uuid(),
  titleAr: titleField(150),
  descriptionAr: z.string().max(2000).nullable().optional(),
});

// NOTE: a plain union (not z.discriminatedUnion) because the tree branch is a
// refined object (treeId XOR linkInput) and Zod's discriminatedUnion rejects a
// ZodEffects member. The `kind` literal on each branch keeps discrimination
// effectively exact — only one branch can match a given `kind`.
export const addItemSchema = z.union([treeItemSchema, nestedItemSchema]);

export type AddItemInput = z.infer<typeof addItemSchema>;

// ---------------------------------------------------------------------------
// Update item — re-title / re-describe / reorder.
// ---------------------------------------------------------------------------

export const updateItemSchema = z.object({
  titleAr: titleField(150).optional(),
  descriptionAr: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

// ---------------------------------------------------------------------------
// Resolve link — preview a pasted public-tree link / private share code.
// ---------------------------------------------------------------------------

export const resolveLinkSchema = z.object({
  input: z.string().min(1).max(500),
});

export type ResolveLinkInput = z.infer<typeof resolveLinkSchema>;
