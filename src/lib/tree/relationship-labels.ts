export type AddRelationshipType = 'child' | 'sibling' | 'spouse' | 'parent';

export function getAddRelationshipLabel(
  relationshipType: AddRelationshipType | undefined,
  anchorSex: 'M' | 'F' | '' | null | undefined,
): string {
  switch (relationshipType) {
    case 'child':
      return 'إضافة ابن/ابنة';
    case 'sibling':
      return 'إضافة أخ/أخت';
    case 'spouse':
      if (anchorSex === 'M') return 'إضافة زوجة جديدة';
      if (anchorSex === 'F') return 'إضافة زوج جديد';
      return 'إضافة زوج/زوجة';
    case 'parent':
      return 'إضافة والد/والدة';
    default:
      return 'إضافة شخص جديد';
  }
}
