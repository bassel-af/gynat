import type {
  Individual,
  Family,
  FamilyEvent,
  GedcomData,
  RadaFamily,
  AncestryJump,
} from './types';
import { validateAncestryJump } from '../tree/ancestry-jump-validators';

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

// ---------------------------------------------------------------------------
// Ancestry jump («قفزة نسب») — ASSO collection
// ---------------------------------------------------------------------------

/**
 * One `ASSO` block read off an `INDI`, before we know whether it is a jump.
 * Resolution is deferred to the end of the parse because `_ANC_FAM`, the
 * target's `FAMS` and the `FAM` records themselves may all appear later.
 */
interface PendingAsso {
  ownerId: string;
  target: string;
  rela: string | null;
  role: string | null;
  ancFam: string | null;
  gapMin: number | null;
  gapMax: number | null;
  notes: string;
}

function parsePositiveInt(value: string | null): number | null {
  const parsed = parseInt((value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Mirrors the API's `notes` ceiling so a crafted file cannot exceed it. */
const MAX_JUMP_NOTES_LENGTH = 5000;

// ---------------------------------------------------------------------------
// Note text helpers
// ---------------------------------------------------------------------------

/**
 * A GEDCOM cross-reference pointer: `@XREF@`. An xref id never contains `@`,
 * so text that merely opens with the escaped `@@` is NOT a pointer — checking
 * only the first and last character would swallow it as a dangling NOTE ref.
 */
const POINTER_RE = /^@[^@]+@$/;

/** Reverse the `@@` escape the exporter writes for a literal at-sign. */
function unescapeNoteText(value: string): string {
  return value.replace(/@@/g, '@');
}

/** Top-level records the importer does not carry (sources, media, repositories, 7.0 shared notes). */
const SKIPPED_SOURCE_RECORDS = new Set(['SOUR', 'OBJE', 'REPO', 'SNOTE']);
/** Citations and media links on a person or a family. */
const SKIPPED_SOURCE_CITATIONS = new Set(['SOUR', 'OBJE']);

/**
 * How many source-related items `parseGedcom` leaves out of an import: each
 * top-level `SOUR` / `OBJE` / `REPO` / `SNOTE` record, plus each `SOUR` /
 * `OBJE` citation (pointer or inline) anywhere inside an `INDI` or `FAM`
 * record — on the record itself or under an event (BIRT, DEAT, MARR…).
 * Anything nested inside a counted item (media under a citation) is part of
 * it and not counted again. A `SOUR` inside `HEAD` names the exporting
 * program and is not counted.
 */
export function countSkippedSources(text: string): number {
  let count = 0;
  let recordTag: string | null = null;
  /** Level of the item just counted; deeper lines belong to it. */
  let countedLevel = Infinity;
  for (const line of text.split(/\r\n|\r|\n/)) {
    const parts = line.trim().replace(/^\uFEFF/, '').split(/\s+/);
    const level = parseInt(parts[0]);
    if (isNaN(level)) continue;
    if (level > countedLevel) continue;
    countedLevel = Infinity;
    const tag = POINTER_RE.test(parts[1] ?? '') ? parts[2] : parts[1];
    if (level === 0) {
      recordTag = tag ?? null;
      if (tag && SKIPPED_SOURCE_RECORDS.has(tag)) {
        count++;
        countedLevel = 0;
      }
    } else if ((recordTag === 'INDI' || recordTag === 'FAM') && tag && SKIPPED_SOURCE_CITATIONS.has(tag)) {
      count++;
      countedLevel = level;
    }
  }
  return count;
}

export function parseGedcom(text: string): GedcomData {
  // Strip UTF-8 BOM if present
  const cleanText = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const lines = cleanText.split(/\r\n|\r|\n/);
  const individuals: Record<string, Individual> = {};
  const families: Record<string, Family> = {};
  const radaFamilies: Record<string, RadaFamily> = {};
  const standaloneNotes: Record<string, string> = {};
  let currentRecord: Individual | Family | RadaFamily | null = null;
  let currentSubRecord: string | null = null;
  let currentLevel1Tag: string | null = null;
  let currentLevel2Tag: string | null = null;
  let currentStandaloneNoteId: string | null = null;
  const ancestryJumps: Record<string, AncestryJump> = {};
  const collectedAssos: PendingAsso[] = [];
  let pendingAsso: PendingAsso | null = null;

  /** End the open ASSO block; resolution happens after the whole file is read. */
  const flushPendingAsso = (): void => {
    if (pendingAsso) {
      // Level-3 CONT/CONC accumulation is unbounded, so the cap belongs here —
      // the point where the note text is complete.
      pendingAsso.notes = unescapeNoteText(pendingAsso.notes).slice(0, MAX_JUMP_NOTES_LENGTH);
      collectedAssos.push(pendingAsso);
    }
    pendingAsso = null;
  };

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
      flushPendingAsso();
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
          kunya: '',
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
      } else if (tag === '_RADA_FAM' && id) {
        currentRecord = {
          id,
          type: '_RADA_FAM',
          fosterFather: null,
          fosterMother: null,
          children: [],
          notes: '',
        };
        radaFamilies[id] = currentRecord;
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
        flushPendingAsso();
        currentSubRecord = tag;
        currentLevel1Tag = tag;
        currentLevel2Tag = null;
        if (currentRecord.type === 'INDI') {
          const indi = currentRecord as Individual;
          if (tag === 'ASSO' && value) {
            pendingAsso = {
              ownerId: indi.id,
              target: value,
              rela: null,
              role: null,
              ancFam: null,
              gapMin: null,
              gapMax: null,
              notes: '',
            };
          } else if (tag === 'NAME') {
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
          } else if (tag === '_KUNYA') {
            indi.kunya = value || '';
          } else if (tag === '_RADA_FAMC' && value) {
            if (!indi.radaFamiliesAsChild) indi.radaFamiliesAsChild = [];
            indi.radaFamiliesAsChild.push(value);
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
          } else if (tag === '_UMM_WALAD') {
            fam.isUmmWalad = true;
          }
        } else if (currentRecord.type === '_RADA_FAM') {
          const rada = currentRecord as RadaFamily;
          if (tag === '_RADA_HUSB') {
            rada.fosterFather = value || null;
          } else if (tag === '_RADA_WIFE') {
            rada.fosterMother = value || null;
          } else if (tag === '_RADA_CHIL' && value) {
            rada.children.push(value);
          } else if (tag === 'NOTE') {
            rada.notes = value || '';
          }
        }
      } else if (level === 2) {
        if (currentRecord.type === 'INDI') {
          const indi = currentRecord as Individual;
          if (currentSubRecord === 'ASSO' && pendingAsso) {
            if (tag === 'RELA') {
              pendingAsso.rela = (value ?? '').trim().toLowerCase();
            } else if (tag === 'ROLE') {
              pendingAsso.role = (value ?? '').trim();
            } else if (tag === '_ANC_FAM') {
              pendingAsso.ancFam = value || null;
            } else if (tag === '_GAP_MIN') {
              pendingAsso.gapMin = parsePositiveInt(value);
            } else if (tag === '_GAP_MAX') {
              pendingAsso.gapMax = parsePositiveInt(value);
            } else if (tag === 'NOTE') {
              pendingAsso.notes = value || '';
              currentLevel2Tag = 'NOTE';
            } else {
              currentLevel2Tag = tag;
            }
          } else if (currentSubRecord === 'NAME') {
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
            } else if (tag === 'NOTE') {
              event.notes = value || '';
              currentLevel2Tag = 'NOTE';
            } else {
              currentLevel2Tag = tag;
            }
          }
        } else if (currentRecord.type === '_RADA_FAM') {
          const rada = currentRecord as RadaFamily;
          if (currentLevel1Tag === 'NOTE' && (tag === 'CONT' || tag === 'CONC')) {
            if (tag === 'CONT') {
              rada.notes += '\n' + (value || '');
            } else {
              rada.notes += (value || '');
            }
          }
        }
      } else if (level === 3) {
        if (
          currentRecord.type === 'INDI' &&
          currentSubRecord === 'ASSO' &&
          currentLevel2Tag === 'NOTE' &&
          pendingAsso
        ) {
          if (tag === 'CONT') {
            pendingAsso.notes += '\n' + (value || '');
          } else if (tag === 'CONC') {
            pendingAsso.notes += (value || '');
          }
        } else if (currentRecord.type === 'INDI' && currentLevel2Tag === 'NOTE') {
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

  flushPendingAsso();

  // -------------------------------------------------------------------------
  // Resolve ancestry jumps («قفزة نسب»). Deferred to here so `_ANC_FAM`, the
  // target's `FAMS` and the `FAM` records can appear anywhere in the file.
  // -------------------------------------------------------------------------
  let jumpCounter = 0;
  let synthesizedFamilyCounter = 0;

  for (const asso of collectedAssos) {
    // Anything that is not an ancestry jump is an ordinary association: it is
    // ignored, never re-read as a parent link.
    const isJump = asso.rela === 'ancestor' || asso.role === '_ANCESTOR';
    if (!isJump) continue;

    const owner = individuals[asso.ownerId];
    if (!owner) continue;
    // Rule J3: recorded parents always win over an imported jump.
    if (owner.familyAsChild) continue;
    // v1: at most ONE jump per person — first in file wins.
    if (owner.ancestryJumpAsDescendant) continue;

    const target = individuals[asso.target];
    if (!target) continue;

    let familyId: string | null = null;
    if (asso.ancFam && families[asso.ancFam]) {
      // `_ANC_FAM` must CORROBORATE the ASSO: the target has to be one of the
      // couple. A family naming someone else would render «من وَلَد ‹شخص آخر›»
      // — a claim the file never made — so the whole jump is dropped rather
      // than quietly re-pointed.
      const claimed = families[asso.ancFam];
      if (claimed.husband !== target.id && claimed.wife !== target.id) continue;
      familyId = asso.ancFam;
    } else {
      familyId = target.familiesAsSpouse.find((id) => families[id]) ?? null;
    }

    if (!familyId) {
      // No family to point at — mint the same one-spouse family the editor
      // builds when only one ancestor is known.
      familyId = `@_ANCF${++synthesizedFamilyCounter}@`;
      families[familyId] = {
        id: familyId,
        type: 'FAM',
        husband: target.sex === 'F' ? null : target.id,
        wife: target.sex === 'F' ? target.id : null,
        children: [],
        marriageContract: emptyFamilyEvent(),
        marriage: emptyFamilyEvent(),
        divorce: emptyFamilyEvent(),
        isDivorced: false,
      };
      target.familiesAsSpouse.push(familyId);
    }

    const jumpId = `@_ANCJ${++jumpCounter}@`;
    ancestryJumps[jumpId] = {
      id: jumpId,
      type: '_ANC_JUMP',
      descendant: owner.id,
      ancestorFamily: familyId,
      generationsMin: asso.gapMin,
      generationsMax: asso.gapMax,
      notes: asso.notes,
    };
    owner.ancestryJumpAsDescendant = jumpId;

    const family = families[familyId];
    if (!family.ancestryJumpsAsAncestor) family.ancestryJumpsAsAncestor = [];
    family.ancestryJumpsAsAncestor.push(jumpId);
  }

  // -------------------------------------------------------------------------
  // Enforce the API's jump rules on the IMPORT path.
  //
  // `POST /ancestry-jumps` rejects a cycle, a self-reference and a spouse-less
  // ancestor couple with a 400. A crafted or corrupt file must not be able to
  // write state the API forbids, because the projection and the nasab code
  // rely on those invariants holding for EVERY write path — and the only two
  // writers besides the API are the import route and the seeder, both of which
  // reach the database through this function.
  //
  // Every assembled jump is checked against the FINISHED payload, then the
  // violators are removed together: in an A↔B loop each jump is a cycle only
  // while the other is present, so dropping them one at a time would leave one
  // half of the loop standing.
  // -------------------------------------------------------------------------
  if (Object.keys(ancestryJumps).length > 0) {
    const view: GedcomData = { individuals, families, ancestryJumps };
    const violators = Object.values(ancestryJumps).filter(
      (jump) =>
        validateAncestryJump(
          view,
          {
            descendantId: jump.descendant,
            ancestorFamilyId: jump.ancestorFamily,
            generationsMin: jump.generationsMin,
            generationsMax: jump.generationsMax,
          },
          // The row being checked is already wired into `view`; J4 must not
          // report it as the person's pre-existing jump.
          { ignoreJumpId: jump.id },
        ) !== null,
    );

    for (const jump of violators) {
      delete ancestryJumps[jump.id];

      const owner = individuals[jump.descendant];
      if (owner?.ancestryJumpAsDescendant === jump.id) {
        delete owner.ancestryJumpAsDescendant;
      }

      const family = families[jump.ancestorFamily];
      if (family?.ancestryJumpsAsAncestor) {
        const remaining = family.ancestryJumpsAsAncestor.filter((id) => id !== jump.id);
        if (remaining.length > 0) {
          family.ancestryJumpsAsAncestor = remaining;
        } else {
          delete family.ancestryJumpsAsAncestor;
        }
      }
    }
  }

  // Resolve a standalone NOTE reference, then reverse the `@@` escape. The
  // order matters: `standaloneNotes` is keyed by the RAW `@XREF@`.
  const resolveNote = (value: string): string => {
    if (POINTER_RE.test(value)) {
      const resolved = standaloneNotes[value];
      return unescapeNoteText(resolved !== undefined ? resolved : '');
    }
    return unescapeNoteText(value);
  };

  for (const id in individuals) {
    const indi = individuals[id];
    indi.notes = resolveNote(indi.notes);
    indi.birthNotes = resolveNote(indi.birthNotes);
    indi.deathNotes = resolveNote(indi.deathNotes);
  }

  for (const id in families) {
    const fam = families[id];
    for (const event of [fam.marriageContract, fam.marriage, fam.divorce]) {
      event.notes = resolveNote(event.notes);
    }
  }

  for (const id in radaFamilies) {
    radaFamilies[id].notes = resolveNote(radaFamilies[id].notes);
  }

  const result: GedcomData = { individuals, families };
  if (Object.keys(radaFamilies).length > 0) {
    result.radaFamilies = radaFamilies;
  }
  if (Object.keys(ancestryJumps).length > 0) {
    result.ancestryJumps = ancestryJumps;
  }
  return result;
}
