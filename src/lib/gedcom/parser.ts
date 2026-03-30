import type { Individual, Family, FamilyEvent, GedcomData } from './types';

function emptyFamilyEvent(): FamilyEvent {
  return { date: '', hijriDate: '', place: '', description: '', notes: '' };
}

const GEDCOM_MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

const HIJRI_MONTHS: Record<string, string> = {
  MUHAR: '01', SAFAR: '02', RABIA: '03', RABIT: '04',
  JUMAA: '05', JUMAT: '06', RAJAB: '07', SHAAB: '08',
  RAMAD: '09', SHAWW: '10', DHUAQ: '11', DHUAH: '12',
};

const DHIJRI_PREFIX = '@#DHIJRI@';

function formatCalendarDate(
  raw: string,
  monthMap: Record<string, string>,
  monthCodeLength: number,
): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // "15 MUHAR 1410" or "1 JAN 1990" → "15/01/1410" or "01/01/1990"
  const fullRe = new RegExp(`^(\\d{1,2})\\s+([A-Z]{${monthCodeLength}})\\s+(\\d{1,4})$`);
  const fullMatch = trimmed.match(fullRe);
  if (fullMatch) {
    const day = fullMatch[1].padStart(2, '0');
    const month = monthMap[fullMatch[2]] || fullMatch[2];
    return `${day}/${month}/${fullMatch[3]}`;
  }

  // "MUHAR 1410" or "JAN 1990" → "01/1410" or "01/1990"
  const monthYearRe = new RegExp(`^([A-Z]{${monthCodeLength}})\\s+(\\d{1,4})$`);
  const monthYearMatch = trimmed.match(monthYearRe);
  if (monthYearMatch) {
    const month = monthMap[monthYearMatch[1]] || monthYearMatch[1];
    return `${month}/${monthYearMatch[2]}`;
  }

  // Already numeric or year-only — return as-is
  return trimmed;
}

function formatHijriDate(raw: string): string {
  return formatCalendarDate(raw, HIJRI_MONTHS, 5);
}

function formatGedcomDate(raw: string): string {
  return formatCalendarDate(raw, GEDCOM_MONTHS, 3);
}

export function parseGedcom(text: string): GedcomData {
  const lines = text.split(/\r\n|\r|\n/);
  const individuals: Record<string, Individual> = {};
  const families: Record<string, Family> = {};
  const standaloneNotes: Record<string, string> = {};
  let currentRecord: Individual | Family | null = null;
  let currentSubRecord: string | null = null;
  let currentLevel1Tag: string | null = null;
  let currentLevel2Tag: string | null = null;
  let currentStandaloneNoteId: string | null = null;

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
      currentLevel2Tag = null;
      currentStandaloneNoteId = null;
      if (tag === 'NOTE' && id) {
        // Standalone NOTE record: "0 @ID@ NOTE [optional first line]"
        currentRecord = null;
        currentStandaloneNoteId = id;
        standaloneNotes[id] = value || '';
      } else if (tag === 'INDI' && id) {
        currentRecord = {
          id,
          type: 'INDI',
          name: '',
          givenName: '',
          surname: '',
          sex: null,
          birth: '',
          birthPlace: '',
          birthDescription: '',
          birthNotes: '',
          birthHijriDate: '',
          death: '',
          deathPlace: '',
          deathDescription: '',
          deathNotes: '',
          deathHijriDate: '',
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
          marriageContract: emptyFamilyEvent(),
          marriage: emptyFamilyEvent(),
          divorce: emptyFamilyEvent(),
          isDivorced: false,
        };
        families[id] = currentRecord;
      } else {
        currentRecord = null;
      }
    } else if (currentStandaloneNoteId && level === 1 && (tag === 'CONT' || tag === 'CONC')) {
      // Continuation of a standalone NOTE record
      if (tag === 'CONT') {
        standaloneNotes[currentStandaloneNoteId] += '\n' + (value || '');
      } else {
        standaloneNotes[currentStandaloneNoteId] += (value || '');
      }
    } else if (currentRecord) {
      if (level === 1) {
        currentSubRecord = tag;
        currentLevel1Tag = tag;
        currentLevel2Tag = null;
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
          } else if (tag === 'BIRT') {
            // Capture inline event descriptor (e.g., "1 BIRT born at home")
            if (value && value.trim()) {
              indi.birthDescription = value.trim();
            }
          } else if (tag === 'DEAT') {
            indi.isDeceased = true;
            // Capture inline event descriptor (e.g., "1 DEAT توفيت بالسرطان")
            if (value && value.trim() && value.trim() !== 'Y') {
              indi.deathDescription = value.trim();
            }
          } else if (tag === 'NOTE') {
            const noteVal = value || '';
            if (noteVal.startsWith('@') && noteVal.endsWith('@')) {
              // NOTE reference — will be resolved after parsing
              indi.notes = noteVal;
            } else {
              indi.notes = noteVal;
            }
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
          } else if (tag === 'MARC') {
            if (value && value.trim()) {
              fam.marriageContract.description = value.trim();
            }
          } else if (tag === 'MARR') {
            if (value && value.trim()) {
              fam.marriage.description = value.trim();
            }
          } else if (tag === 'DIV') {
            fam.isDivorced = true;
            const trimVal = (value || '').trim();
            if (trimVal && trimVal !== 'Y') {
              fam.divorce.description = trimVal;
            }
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
            const dateVal = value || '';
            if (dateVal.startsWith(DHIJRI_PREFIX)) {
              const hijriPart = dateVal.slice(DHIJRI_PREFIX.length).trim();
              if (currentSubRecord === 'BIRT') {
                indi.birthHijriDate = formatHijriDate(hijriPart);
              } else if (currentSubRecord === 'DEAT') {
                indi.deathHijriDate = formatHijriDate(hijriPart);
              }
            } else {
              if (currentSubRecord === 'BIRT') {
                indi.birth = formatGedcomDate(dateVal);
              } else if (currentSubRecord === 'DEAT') {
                indi.death = formatGedcomDate(dateVal);
              }
            }
          } else if (tag === 'PLAC') {
            if (currentSubRecord === 'BIRT') {
              indi.birthPlace = value || '';
            } else if (currentSubRecord === 'DEAT') {
              indi.deathPlace = value || '';
            }
          } else if (tag === 'CAUS') {
            if (currentSubRecord === 'BIRT') {
              indi.birthDescription = value || '';
            } else if (currentSubRecord === 'DEAT') {
              indi.deathDescription = value || '';
            }
          } else if (tag === '_HIJR') {
            if (currentSubRecord === 'BIRT') {
              indi.birthHijriDate = value || '';
            } else if (currentSubRecord === 'DEAT') {
              indi.deathHijriDate = value || '';
            }
          } else if (tag === 'NOTE' && (currentSubRecord === 'BIRT' || currentSubRecord === 'DEAT')) {
            if (currentSubRecord === 'BIRT') {
              indi.birthNotes = value || '';
            } else {
              indi.deathNotes = value || '';
            }
            currentLevel2Tag = 'NOTE';
          } else if (currentLevel1Tag === 'NOTE' && (tag === 'CONT' || tag === 'CONC')) {
            // General note continuation — don't update currentLevel2Tag
            if (tag === 'CONT') {
              indi.notes += '\n' + (value || '');
            } else {
              indi.notes += (value || '');
            }
          } else {
            currentLevel2Tag = tag;
          }
        } else if (currentRecord.type === 'FAM') {
          const fam = currentRecord as Family;
          const eventMap: Record<string, FamilyEvent | undefined> = {
            'MARC': fam.marriageContract,
            'MARR': fam.marriage,
            'DIV': fam.divorce,
          };
          const event = eventMap[currentSubRecord ?? ''];
          if (event) {
            if (tag === 'DATE') {
              const dateVal = value || '';
              if (dateVal.startsWith(DHIJRI_PREFIX)) {
                const hijriPart = dateVal.slice(DHIJRI_PREFIX.length).trim();
                event.hijriDate = formatHijriDate(hijriPart);
              } else {
                event.date = formatGedcomDate(dateVal);
              }
            } else if (tag === 'PLAC') {
              event.place = value || '';
            } else if (tag === '_HIJR') {
              event.hijriDate = value || '';
            } else if (tag === 'NOTE') {
              event.notes = value || '';
              currentLevel2Tag = 'NOTE';
            } else {
              currentLevel2Tag = tag;
            }
          }
        }
      } else if (level === 3) {
        if (currentRecord.type === 'INDI' && currentLevel2Tag === 'NOTE') {
          const indi = currentRecord as Individual;
          if (currentSubRecord === 'BIRT') {
            if (tag === 'CONT') {
              indi.birthNotes += '\n' + (value || '');
            } else if (tag === 'CONC') {
              indi.birthNotes += (value || '');
            }
          } else if (currentSubRecord === 'DEAT') {
            if (tag === 'CONT') {
              indi.deathNotes += '\n' + (value || '');
            } else if (tag === 'CONC') {
              indi.deathNotes += (value || '');
            }
          }
        } else if (currentRecord.type === 'FAM' && currentLevel2Tag === 'NOTE') {
          const fam = currentRecord as Family;
          const eventMap: Record<string, FamilyEvent | undefined> = {
            'MARC': fam.marriageContract,
            'MARR': fam.marriage,
            'DIV': fam.divorce,
          };
          const event = eventMap[currentSubRecord ?? ''];
          if (event) {
            if (tag === 'CONT') {
              event.notes += '\n' + (value || '');
            } else if (tag === 'CONC') {
              event.notes += (value || '');
            }
          }
        }
      }
    }
  }

  // Resolve standalone NOTE references on individuals
  for (const id in individuals) {
    const indi = individuals[id];
    if (indi.notes.startsWith('@') && indi.notes.endsWith('@')) {
      const resolved = standaloneNotes[indi.notes];
      indi.notes = resolved !== undefined ? resolved : '';
    }
    if (indi.birthNotes.startsWith('@') && indi.birthNotes.endsWith('@')) {
      const resolved = standaloneNotes[indi.birthNotes];
      indi.birthNotes = resolved !== undefined ? resolved : '';
    }
    if (indi.deathNotes.startsWith('@') && indi.deathNotes.endsWith('@')) {
      const resolved = standaloneNotes[indi.deathNotes];
      indi.deathNotes = resolved !== undefined ? resolved : '';
    }
  }

  // Resolve standalone NOTE references on family events
  for (const id in families) {
    const fam = families[id];
    const events = [fam.marriageContract, fam.marriage, fam.divorce];
    for (const event of events) {
      if (event.notes.startsWith('@') && event.notes.endsWith('@')) {
        const resolved = standaloneNotes[event.notes];
        event.notes = resolved !== undefined ? resolved : '';
      }
    }
  }

  return { individuals, families };
}
