import type { Individual, GedcomData } from './types';

export interface PersonRelationships {
  parents: Individual[];
  siblings: Individual[];
  paternalUncles: Individual[];
  spouses: Individual[];
  children: Individual[];
}

export function getPersonRelationships(
  data: GedcomData,
  personId: string
): PersonRelationships {
  const { individuals, families } = data;
  const person = individuals[personId];

  const parents: Individual[] = [];
  const siblings: Individual[] = [];
  const paternalUncles: Individual[] = [];
  const spouses: Individual[] = [];
  const children: Individual[] = [];

  if (!person) {
    return { parents, siblings, paternalUncles, spouses, children };
  }

  // Parents & siblings from familyAsChild
  if (person.familyAsChild) {
    const family = families[person.familyAsChild];
    if (family) {
      if (family.husband && individuals[family.husband] && !individuals[family.husband].isPrivate) {
        parents.push(individuals[family.husband]);
      }
      if (family.wife && individuals[family.wife] && !individuals[family.wife].isPrivate) {
        parents.push(individuals[family.wife]);
      }
      for (const childId of family.children) {
        if (childId !== personId && individuals[childId] && !individuals[childId].isPrivate) {
          siblings.push(individuals[childId]);
        }
      }
    }
  }

  // Paternal uncles: father's brothers from the grandfather's family
  if (person.familyAsChild) {
    const birthFamily = families[person.familyAsChild];
    const fatherId = birthFamily?.husband;
    if (fatherId && individuals[fatherId]) {
      const father = individuals[fatherId];
      if (father.familyAsChild) {
        const grandfatherFamily = families[father.familyAsChild];
        if (grandfatherFamily) {
          for (const uncleId of grandfatherFamily.children) {
            if (uncleId !== fatherId && individuals[uncleId] && !individuals[uncleId].isPrivate) {
              paternalUncles.push(individuals[uncleId]);
            }
          }
        }
      }
    }
  }

  // Spouses & children from familiesAsSpouse
  const childIds = new Set<string>();
  for (const familyId of person.familiesAsSpouse) {
    const family = families[familyId];
    if (!family) continue;

    const spouseId = family.husband === personId ? family.wife : family.husband;
    if (spouseId && individuals[spouseId] && !individuals[spouseId].isPrivate) {
      // Avoid duplicate spouses
      if (!spouses.some((s) => s.id === spouseId)) {
        spouses.push(individuals[spouseId]);
      }
    }

    for (const childId of family.children) {
      if (!childIds.has(childId) && individuals[childId] && !individuals[childId].isPrivate) {
        childIds.add(childId);
        children.push(individuals[childId]);
      }
    }
  }

  return { parents, siblings, paternalUncles, spouses, children };
}

// ---------------------------------------------------------------------------
// Rada'a (foster/milk) relationships
// ---------------------------------------------------------------------------

export interface RadaRelationships {
  radaParents: Individual[];    // foster mother + father from _RADA_FAM where person is child
  radaSiblings: Individual[];   // other children in same _RADA_FAM (+ bio children of wet nurse)
  radaChildren: Individual[];   // children in _RADA_FAM where person is foster parent
}

export function getRadaRelationships(
  data: GedcomData,
  personId: string,
): RadaRelationships {
  const radaParents: Individual[] = [];
  const radaSiblings: Individual[] = [];
  const radaChildren: Individual[] = [];

  if (!data.radaFamilies || !data.individuals[personId]) {
    return { radaParents, radaSiblings, radaChildren };
  }

  const { individuals, families, radaFamilies } = data;
  const person = individuals[personId];
  const seenParentIds = new Set<string>();
  const seenSiblingIds = new Set<string>();
  const seenChildIds = new Set<string>();

  // Rada families where person is a child
  if (person.radaFamiliesAsChild) {
    for (const rfId of person.radaFamiliesAsChild) {
      const rf = radaFamilies[rfId];
      if (!rf) continue;

      // Foster parents
      for (const parentId of [rf.fosterFather, rf.fosterMother]) {
        if (parentId && individuals[parentId] && !individuals[parentId].isPrivate && !seenParentIds.has(parentId)) {
          seenParentIds.add(parentId);
          radaParents.push(individuals[parentId]);
        }
      }

      // Rada siblings: other children in the same rada family
      for (const childId of rf.children) {
        if (childId !== personId && individuals[childId] && !individuals[childId].isPrivate && !seenSiblingIds.has(childId)) {
          seenSiblingIds.add(childId);
          radaSiblings.push(individuals[childId]);
        }
      }

      // Also include biological children of the foster mother
      if (rf.fosterMother) {
        for (const fam of Object.values(families)) {
          if (fam.wife === rf.fosterMother || fam.husband === rf.fosterMother) {
            for (const bioChildId of fam.children) {
              if (bioChildId !== personId && individuals[bioChildId] && !individuals[bioChildId].isPrivate && !seenSiblingIds.has(bioChildId)) {
                seenSiblingIds.add(bioChildId);
                radaSiblings.push(individuals[bioChildId]);
              }
            }
          }
        }
      }
    }
  }

  // Rada families where person is a foster parent
  for (const rf of Object.values(radaFamilies)) {
    if (rf.fosterFather === personId || rf.fosterMother === personId) {
      for (const childId of rf.children) {
        if (individuals[childId] && !individuals[childId].isPrivate && !seenChildIds.has(childId)) {
          seenChildIds.add(childId);
          radaChildren.push(individuals[childId]);
        }
      }
    }
  }

  return { radaParents, radaSiblings, radaChildren };
}
