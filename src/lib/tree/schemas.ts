import { z } from 'zod';

// ---------------------------------------------------------------------------
// Individual — shared field definitions
// ---------------------------------------------------------------------------

/** Shared individual string fields with max lengths. All nullable + optional. */
export const individualFieldsSchema = z.object({
  givenName: z.string().max(200).nullable().optional(),
  surname: z.string().max(200).nullable().optional(),
  fullName: z.string().max(200).nullable().optional(),
  sex: z.enum(['M', 'F']).nullable().optional(),
  birthDate: z.string().max(50).nullable().optional(),
  birthPlace: z.string().max(500).nullable().optional(),
  birthPlaceId: z.string().uuid().nullable().optional(),
  birthDescription: z.string().max(500).nullable().optional(),
  birthNotes: z.string().max(5000).nullable().optional(),
  deathDate: z.string().max(50).nullable().optional(),
  deathPlace: z.string().max(500).nullable().optional(),
  deathPlaceId: z.string().uuid().nullable().optional(),
  deathDescription: z.string().max(500).nullable().optional(),
  deathNotes: z.string().max(5000).nullable().optional(),
  birthHijriDate: z.string().max(50).nullable().optional(),
  deathHijriDate: z.string().max(50).nullable().optional(),
  isDeceased: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

/** Create individual — extends shared fields with name requirement + isPrivate default */
export const createIndividualSchema = individualFieldsSchema
  .extend({
    isPrivate: z.boolean().optional().default(false),
  })
  .refine(
    (data) => data.givenName || data.fullName,
    { message: 'يجب تقديم الاسم الأول أو الاسم الكامل' },
  );

/** Update individual — uses shared fields directly (all optional, null allowed) */
export const updateIndividualSchema = individualFieldsSchema;

// ---------------------------------------------------------------------------
// Family — shared event field definitions
// ---------------------------------------------------------------------------

/** Shared marriage/divorce event fields. All nullable + optional. */
export const familyEventFieldsSchema = z.object({
  // Marriage contract
  marriageContractDate: z.string().max(50).nullable().optional(),
  marriageContractHijriDate: z.string().max(50).nullable().optional(),
  marriageContractPlace: z.string().max(500).nullable().optional(),
  marriageContractPlaceId: z.string().uuid().nullable().optional(),
  marriageContractDescription: z.string().max(500).nullable().optional(),
  marriageContractNotes: z.string().max(5000).nullable().optional(),
  // Marriage
  marriageDate: z.string().max(50).nullable().optional(),
  marriageHijriDate: z.string().max(50).nullable().optional(),
  marriagePlace: z.string().max(500).nullable().optional(),
  marriagePlaceId: z.string().uuid().nullable().optional(),
  marriageDescription: z.string().max(500).nullable().optional(),
  marriageNotes: z.string().max(5000).nullable().optional(),
  // Umm walad
  isUmmWalad: z.boolean().optional(),
  // Divorce
  isDivorced: z.boolean().optional(),
  divorceDate: z.string().max(50).nullable().optional(),
  divorceHijriDate: z.string().max(50).nullable().optional(),
  divorcePlace: z.string().max(500).nullable().optional(),
  divorcePlaceId: z.string().uuid().nullable().optional(),
  divorceDescription: z.string().max(500).nullable().optional(),
  divorceNotes: z.string().max(5000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Shared refinement: isUmmWalad=true ⟹ all MARC/MARR fields must be empty
// ---------------------------------------------------------------------------

const MARC_MARR_FIELDS = [
  'marriageContractDate', 'marriageContractHijriDate', 'marriageContractPlace',
  'marriageContractPlaceId', 'marriageContractDescription', 'marriageContractNotes',
  'marriageDate', 'marriageHijriDate', 'marriagePlace',
  'marriagePlaceId', 'marriageDescription', 'marriageNotes',
] as const;

function ummWaladRefine(data: Record<string, unknown>): boolean {
  if (!data.isUmmWalad) return true;
  for (const field of MARC_MARR_FIELDS) {
    const val = data[field];
    if (val !== undefined && val !== null && val !== '') return false;
  }
  return true;
}

const UMM_WALAD_REFINE_MESSAGE = 'أم ولد لا يمكن أن يكون لها عقد قران أو زفاف';

/** Create family — spouse IDs + children + event fields */
export const createFamilySchema = familyEventFieldsSchema.extend({
  husbandId: z.string().uuid().optional(),
  wifeId: z.string().uuid().optional(),
  childrenIds: z.array(z.string().uuid()).optional(),
}).refine(ummWaladRefine, { message: UMM_WALAD_REFINE_MESSAGE });

/** Update family — nullable spouse IDs + event fields */
export const updateFamilySchema = familyEventFieldsSchema.extend({
  husbandId: z.string().uuid().nullable().optional(),
  wifeId: z.string().uuid().nullable().optional(),
}).refine(ummWaladRefine, { message: UMM_WALAD_REFINE_MESSAGE });

// ---------------------------------------------------------------------------
// Rada'a (foster nursing) family
// ---------------------------------------------------------------------------

/** Create rada family — at least one foster parent or notes required, plus children */
export const createRadaFamilySchema = z.object({
  fosterFatherId: z.string().uuid().nullable().optional(),
  fosterMotherId: z.string().uuid().nullable().optional(),
  childrenIds: z.array(z.string().uuid()).min(1).max(50),
  notes: z.string().max(5000).nullable().optional(),
}).refine(
  (data) => data.fosterFatherId || data.fosterMotherId || (data.notes && data.notes.trim().length > 0),
  { message: 'يجب تحديد المرضعة أو زوجها أو إضافة ملاحظة' },
);

/** Update rada family — foster parents and notes, all optional */
export const updateRadaFamilySchema = z.object({
  fosterFatherId: z.string().uuid().nullable().optional(),
  fosterMotherId: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});
