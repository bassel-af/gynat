import { randomUUID } from 'crypto'
import type { GedcomData } from '../gedcom/types'

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface SeedTreeResult {
  treeId: string
  individualCount: number
  familyCount: number
  skipped: boolean
  /** Mapping from GEDCOM ID (e.g. "@I123@") to the generated DB UUID */
  gedcomToDbId: Record<string, string>
}

// ---------------------------------------------------------------------------
// Prisma client interface (minimal shape needed for seeding)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PrismaLike {
  $transaction: (fn: (tx: any) => Promise<any>) => Promise<any>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Main seeding function
// ---------------------------------------------------------------------------

/**
 * Takes parsed GEDCOM data and inserts tree records (individuals, families,
 * family_children) into the database for the given workspace.
 *
 * Idempotent: if the tree already contains individuals, seeding is skipped.
 * Uses a Prisma transaction for atomicity.
 *
 * @param workspaceId  - The workspace to seed tree data for
 * @param gedcomData   - Parsed GEDCOM data
 * @param prismaClient - Prisma client instance to use for DB operations
 */
export async function seedTreeFromGedcomData(
  workspaceId: string,
  gedcomData: GedcomData,
  prismaClient: PrismaLike,
): Promise<SeedTreeResult> {
  return prismaClient.$transaction(async (tx) => {
    // 1. Get or create FamilyTree
    let tree = await tx.familyTree.findUnique({
      where: { workspaceId },
      include: { individuals: true, families: { include: { children: true } } },
    })

    if (!tree) {
      tree = await tx.familyTree.create({
        data: { workspaceId },
        include: { individuals: true, families: { include: { children: true } } },
      })
    }

    const treeId = tree.id

    // 2. Idempotent check: skip if tree already has individuals
    const existingCount = await tx.individual.count({ where: { treeId } })
    if (existingCount > 0) {
      return {
        treeId,
        individualCount: 0,
        familyCount: 0,
        skipped: true,
        gedcomToDbId: {},
      }
    }

    const individualEntries = Object.values(gedcomData.individuals)
    const familyEntries = Object.values(gedcomData.families)

    // 3. If there's no data, return early
    if (individualEntries.length === 0 && familyEntries.length === 0) {
      return {
        treeId,
        individualCount: 0,
        familyCount: 0,
        skipped: false,
        gedcomToDbId: {},
      }
    }

    // 4. Build GEDCOM-ID to DB-UUID mapping for individuals
    const gedcomToDbId: Record<string, string> = {}
    for (const ind of individualEntries) {
      gedcomToDbId[ind.id] = randomUUID()
    }

    // 5. Build GEDCOM-ID to DB-UUID mapping for families
    const familyGedcomToDbId: Record<string, string> = {}
    for (const fam of familyEntries) {
      familyGedcomToDbId[fam.id] = randomUUID()
    }

    // 6. Create individuals
    await tx.individual.createMany({
      data: individualEntries.map((ind) => ({
        id: gedcomToDbId[ind.id],
        treeId,
        gedcomId: ind.id,
        givenName: ind.givenName || null,
        surname: ind.surname || null,
        fullName: ind.name || null,
        sex: ind.sex,
        birthDate: ind.birth || null,
        birthPlace: ind.birthPlace || null,
        birthDescription: ind.birthDescription || null,
        birthNotes: ind.birthNotes || null,
        deathDate: ind.death || null,
        deathPlace: ind.deathPlace || null,
        deathDescription: ind.deathDescription || null,
        deathNotes: ind.deathNotes || null,
        notes: ind.notes || null,
        isDeceased: ind.isDeceased,
        isPrivate: ind.isPrivate,
      })),
    })

    // 7. Create families
    if (familyEntries.length > 0) {
      await tx.family.createMany({
        data: familyEntries.map((fam) => ({
          id: familyGedcomToDbId[fam.id],
          treeId,
          gedcomId: fam.id,
          husbandId: fam.husband ? gedcomToDbId[fam.husband] ?? null : null,
          wifeId: fam.wife ? gedcomToDbId[fam.wife] ?? null : null,
        })),
      })

      // 8. Create family_children
      const familyChildRecords: { familyId: string; individualId: string }[] = []
      for (const fam of familyEntries) {
        const familyDbId = familyGedcomToDbId[fam.id]
        for (const childGedcomId of fam.children) {
          const childDbId = gedcomToDbId[childGedcomId]
          if (childDbId) {
            familyChildRecords.push({
              familyId: familyDbId,
              individualId: childDbId,
            })
          }
        }
      }

      if (familyChildRecords.length > 0) {
        await tx.familyChild.createMany({
          data: familyChildRecords,
        })
      }
    }

    return {
      treeId,
      individualCount: individualEntries.length,
      familyCount: familyEntries.length,
      skipped: false,
      gedcomToDbId,
    }
  })
}
