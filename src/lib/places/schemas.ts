import { z } from 'zod';

/** Schema for validating search query parameters */
export const searchPlacesSchema = z.object({
  q: z.string().max(200).trim().default(''),
});

/** Schema for creating a new place */
export const createPlaceSchema = z.object({
  nameAr: z.string().min(1).max(200).trim(),
  nameEn: z.string().max(200).trim().optional(),
  parentId: z.string().uuid().optional(),
});
