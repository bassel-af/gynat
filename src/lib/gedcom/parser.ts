import type { Individual, Family, GedcomData } from './types';

const GEDCOM_MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function formatGedcomDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // "1 JAN 1990" or "01 JAN 1990" → "01/01/1990"
  const fullMatch = trimmed.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/);
  if (fullMatch) {
    const day = fullMatch[1].padStart(2, '0');
    const month = GEDCOM_MONTHS[fullMatch[2]] || fullMatch[2];
    return `${day}/${month}/${fullMatch[3]}`;
  }

  // "JAN 1990" → "01/1990"
  const monthYearMatch = trimmed.match(/^([A-Z]{3})\s+(\d{4})$/);
  if (monthYearMatch) {
    const month = GEDCOM_MONTHS[monthYearMatch[1]] || monthYearMatch[1];
    return `${month}/${monthYearMatch[2]}`;
  }

  // Already numeric or year-only — return as-is
  return trimmed;
}

export function parseGedcom(text: string): GedcomData {
  const lines = text.split(/\r\n|\r|\n/);
  const individuals: Record<string, Individual> = {};
  const families: Record<string, Family> = {};
  let currentRecord: Individual | Family | null = null;
  let currentSubRecord: string | null = null;
  let currentLevel1Tag: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    const level = parseInt(parts[0]);

    if (isNaN(level)) continue;

    let id: string | null = null;
    let tag: string | null = null;
    let value: string | null = null;

    if (parts[1] && parts[1].startsWith('@') && parts[1].endsWith('@')) {
      id = parts[1];
      tag = parts[2];
      value = parts.slice(3).join(' ');
    } else {
      tag = parts[1];
      value = parts.slice(2).join(' ');
    }

    if (level === 0) {
      currentSubRecord = null;
      currentLevel1Tag = null;
      if (tag === 'INDI' && id) {
        currentRecord = {
          id,
          type: 'INDI',
          name: '',
          givenName: '',
          surname: '',
          sex: null,
          birth: '',
          birthPlace: '',
          death: '',
          deathPlace: '',
          notes: '',
          isDeceased: false,
          isPrivate: false,
          familiesAsSpouse: [],
          familyAsChild: null,
        };
        individuals[id] = currentRecord;
      } else if (tag === 'FAM' && id) {
        currentRecord = {
          id,
          type: 'FAM',
          husband: null,
          wife: null,
          children: [],
        };
        families[id] = currentRecord;
      } else {
        currentRecord = null;
      }
    } else if (currentRecord) {
      if (level === 1) {
        currentSubRecord = tag;
        currentLevel1Tag = tag;
        if (currentRecord.type === 'INDI') {
          const indi = currentRecord as Individual;
          if (tag === 'NAME') {
            const rawName = value || '';
            const parsedName = rawName.replace(/\//g, '').trim();
            indi.name = parsedName;
            // Extract givenName and surname from NAME line format: "GivenName /Surname/"
            const surnameMatch = rawName.match(/\/([^/]*)\//)
            if (surnameMatch) {
              indi.surname = surnameMatch[1].trim();
              indi.givenName = rawName.substring(0, rawName.indexOf('/')).trim();
            }
            // Check if name indicates a private individual
            if (parsedName.toUpperCase() === 'PRIVATE' || parsedName.toLowerCase() === 'private') {
              indi.isPrivate = true;
            }
          } else if (tag === 'SEX') {
            indi.sex = value === 'M' ? 'M' : value === 'F' ? 'F' : null;
          } else if (tag === 'DEAT') {
            indi.isDeceased = true;
          } else if (tag === 'NOTE') {
            indi.notes = value || '';
          } else if (tag === 'FAMS' && value) {
            indi.familiesAsSpouse.push(value);
          } else if (tag === 'FAMC' && value) {
            indi.familyAsChild = value;
          }
        } else if (currentRecord.type === 'FAM') {
          const fam = currentRecord as Family;
          if (tag === 'HUSB') {
            fam.husband = value || null;
          } else if (tag === 'WIFE') {
            fam.wife = value || null;
          } else if (tag === 'CHIL' && value) {
            fam.children.push(value);
          }
        }
      } else if (level === 2) {
        if (currentRecord.type === 'INDI') {
          const indi = currentRecord as Individual;
          if (currentSubRecord === 'NAME') {
            if (tag === 'GIVN') {
              indi.givenName = value || '';
            } else if (tag === 'SURN') {
              indi.surname = value || '';
            }
          } else if (tag === 'DATE') {
            if (currentSubRecord === 'BIRT') {
              indi.birth = formatGedcomDate(value || '');
            } else if (currentSubRecord === 'DEAT') {
              indi.death = formatGedcomDate(value || '');
            }
          } else if (tag === 'PLAC') {
            if (currentSubRecord === 'BIRT') {
              indi.birthPlace = value || '';
            } else if (currentSubRecord === 'DEAT') {
              indi.deathPlace = value || '';
            }
          } else if (currentLevel1Tag === 'NOTE') {
            if (tag === 'CONT') {
              indi.notes += '\n' + (value || '');
            } else if (tag === 'CONC') {
              indi.notes += (value || '');
            }
          }
        }
      }
    }
  }

  return { individuals, families };
}
