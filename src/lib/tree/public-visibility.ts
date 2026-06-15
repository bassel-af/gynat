/**
 * Public Tree — pure visibility logic.
 *
 * This file is the single source of truth for two public-tree decisions:
 *   1. WHO is "living" (`isPresumedLiving`) — used identically by the publish
 *      checkpoint and the public redactor so they can never disagree.
 *   2. WHAT a stranger sees (`redactForPublic`) — the one filter applied,
 *      ONCE and LAST, over the fully-composed public dataset (home tree plus
 *      any included public borrowed branches). Compose-then-redact: never
 *      redact-then-merge.
 *
 * No DB access here — callers pass already-composed `GedcomData`. Pure and
 * deterministic given an explicit `now`.
 */

import type { GedcomData, Individual } from '@/lib/gedcom/types'
import { INTERNAL_INDIVIDUAL_KEYS } from '@/lib/gedcom/types'
import type {
  CheckpointPerson,
  CheckpointHousehold,
  PublishCheckpointData,
} from '@/components/public-tree'
import {
  shouldHideBirthDate,
  type BirthDatePrivacySettings,
} from '@/lib/tree/birth-date-privacy'
import { blankPrivatePerson } from '@/lib/tree/mapper'

// ---------------------------------------------------------------------------
// Living-status rule
// ---------------------------------------------------------------------------

/**
 * Anyone whose birth date makes them this old or older is presumed deceased,
 * even without a deceased mark. A safe, well-understood genealogy cutoff that
 * clears out the obviously-dead without risking a living person.
 */
export const PRESUMED_DECEASED_AGE_YEARS = 130

/** Extracts a 4-digit year from a free-form date string ("12 JAN 1850" -> 1850). */
function extractYear(dateStr: string): number | null {
  const match = dateStr.match(/\d{4}/)
  return match ? Number(match[0]) : null
}

/**
 * The SINGLE living-status rule. A person is presumed LIVING when they are
 * NOT marked deceased AND were not born more than 130 years ago. A person
 * with neither a birth date nor a deceased mark is treated as living.
 */
export function isPresumedLiving(individual: Individual, now: Date): boolean {
  if (individual.isDeceased) return false

  const birthYear = extractYear(individual.birth)
  if (birthYear === null) return true // no date, not deceased -> living

  const age = now.getUTCFullYear() - birthYear
  if (age >= PRESUMED_DECEASED_AGE_YEARS) return false // presumed deceased

  return true
}

// ---------------------------------------------------------------------------
// Checkpoint view-model
// ---------------------------------------------------------------------------

function toGender(sex: Individual['sex']): 'male' | 'female' {
  return sex === 'F' ? 'female' : 'male'
}

/** Format the short meta line under a checkpoint person's name. */
function checkpointMeta(individual: Individual): string {
  const birthYear = extractYear(individual.birth)
  if (birthYear === null) return 'بلا تاريخ ميلاد'
  return `وُلد ${birthYear}`
}

/**
 * Builds the publish-checkpoint view-model from a tree. Returns every living
 * person grouped for review: a no-birth-date "attention" bucket first, then
 * the rest grouped by household. Built on `isPresumedLiving` so it agrees with
 * `redactForPublic`.
 */
export function computeLivingForCheckpoint(
  data: GedcomData,
  now: Date,
): PublishCheckpointData {
  const attention: CheckpointPerson[] = []
  // householdId -> members; keyed by the person's first spouse family, else
  // their family-as-child, else a synthetic per-person bucket.
  const householdMembers = new Map<string, CheckpointPerson[]>()

  for (const individual of Object.values(data.individuals)) {
    if (!isPresumedLiving(individual, now)) continue

    const person: CheckpointPerson = {
      id: individual.id,
      name: individual.name,
      gender: toGender(individual.sex),
      meta: checkpointMeta(individual),
    }

    const hasBirthDate = extractYear(individual.birth) !== null
    if (!hasBirthDate) {
      person.needsAttention = true
      attention.push(person)
      continue
    }

    const householdId =
      individual.familiesAsSpouse[0] ?? individual.familyAsChild ?? `solo:${individual.id}`
    const list = householdMembers.get(householdId) ?? []
    list.push(person)
    householdMembers.set(householdId, list)
  }

  const households: CheckpointHousehold[] = []
  for (const [id, members] of householdMembers) {
    households.push({
      id,
      title: `بيت ${members[0]?.name ?? ''}`.trim(),
      members,
    })
  }

  return {
    livingCount: attention.length + households.reduce((sum, h) => sum + h.members.length, 0),
    attention,
    households,
  }
}

// ---------------------------------------------------------------------------
// Public redactor
// ---------------------------------------------------------------------------

/** Strip all internal/composition fields and place-id references in place. */
function stripInternalFields(ind: Individual): void {
  const mutable = ind as unknown as Record<string, unknown>
  for (const key of INTERNAL_INDIVIDUAL_KEYS) {
    delete mutable[key]
  }
}

/** Blank all birth-date detail (keeps the person, hides exact birth). */
function hideBirth(ind: Individual): void {
  ind.birth = ''
  ind.birthHijriDate = ''
  ind.birthPlace = ''
  ind.birthDescription = ''
  ind.birthNotes = ''
}

/**
 * The SINGLE public redactor. Runs ONCE, LAST, over the fully-composed public
 * dataset. For each individual it sets `publicDisplay` and strips PII:
 *   - `isPrivate`        -> 'redacted' (name/dates/places/notes blanked)
 *   - `isPresumedLiving` -> 'living'   (exact birth hidden; name, relations,
 *                                        and notes/biography سيرة KEPT)
 *   - otherwise          -> 'full'
 * Internal fields (`_pointed`, `_sourceWorkspaceId`, `*PlaceId`, ...) are
 * ALWAYS stripped from every individual. Gender-based hide-birthdate toggles
 * are applied here, server-side. The input is not mutated.
 */
export function redactForPublic(
  data: GedcomData,
  now: Date,
  birthDatePrivacy: BirthDatePrivacySettings = {},
): GedcomData {
  const individuals: Record<string, Individual> = {}

  for (const [id, original] of Object.entries(data.individuals)) {
    const ind: Individual = { ...original }

    if (ind.isPrivate) {
      ind.publicDisplay = 'redacted'
      // Same PII blanking as the member redactor (shared helper, can't drift).
      blankPrivatePerson(ind)
    } else if (isPresumedLiving(ind, now)) {
      ind.publicDisplay = 'living'
      hideBirth(ind)
      // Per §7.3: notes/biography (سيرة) are NOT stripped for living people.
    } else {
      ind.publicDisplay = 'full'
      // Apply server-side gender-based hide-birthdate toggle (§7.4).
      if (shouldHideBirthDate(ind, birthDatePrivacy)) {
        hideBirth(ind)
      }
    }

    stripInternalFields(ind)
    individuals[id] = ind
  }

  const result: GedcomData = { individuals, families: data.families }
  if (data.radaFamilies) result.radaFamilies = data.radaFamilies
  return result
}
