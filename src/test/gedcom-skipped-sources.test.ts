/**
 * Sources («المصادر») step 8 — GEDCOM import does not carry sources; it
 * counts what it leaves behind so the import can tell the user.
 */
import { describe, test, expect } from 'vitest';
import { countSkippedSources, parseGedcom } from '@/lib/gedcom/parser';
import { importSkippedSourcesNotice } from '@/components/sources/importSkippedSources';

const HEAD = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n';
const PEOPLE = `0 @I1@ INDI
1 NAME محمد /سعيد/
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME أحمد /سعيد/
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
`;
const TRLR = '0 TRLR\n';

describe('countSkippedSources', () => {
  test('a file with no sources counts zero', () => {
    expect(countSkippedSources(HEAD + PEOPLE + TRLR)).toBe(0);
  });

  test('counts each 5.5.1 SOUR, OBJE and REPO record', () => {
    const records = `0 @S1@ SOUR
1 TITL طبقات ابن سعد
0 @O1@ OBJE
1 FILE scan.jpg
0 @R1@ REPO
1 NAME مكتبة
`;
    expect(countSkippedSources(HEAD + PEOPLE + records + TRLR)).toBe(3);
  });

  test('counts a 7.0 shared note (SNOTE) record', () => {
    expect(countSkippedSources(HEAD + PEOPLE + '0 @N1@ SNOTE دفتر العائلة\n' + TRLR)).toBe(1);
  });

  test('counts a pointer citation on a person', () => {
    const ged = HEAD + PEOPLE.replace('1 SEX M\n1 FAMS', '1 SEX M\n1 SOUR @S1@\n2 PAGE ص ٩٠\n1 FAMS') + TRLR;
    expect(countSkippedSources(ged)).toBe(1);
  });

  test('counts an inline citation on a person', () => {
    const ged = HEAD + PEOPLE.replace('1 SEX M\n1 FAMS', '1 SEX M\n1 SOUR دفتر العائلة\n2 CONT رقم ١٢\n1 FAMS') + TRLR;
    expect(countSkippedSources(ged)).toBe(1);
  });

  test('counts a media link on a person', () => {
    const ged = HEAD + PEOPLE.replace('1 SEX M\n1 FAMS', '1 SEX M\n1 OBJE @O1@\n1 FAMS') + TRLR;
    expect(countSkippedSources(ged)).toBe(1);
  });

  test('counts citations and media links on a family', () => {
    const ged = HEAD + PEOPLE.replace('1 HUSB @I1@', '1 HUSB @I1@\n1 SOUR @S1@\n1 OBJE\n2 FILE photo.jpg') + TRLR;
    expect(countSkippedSources(ged)).toBe(2);
  });

  test('counts a citation nested under a person event', () => {
    const ged = HEAD + PEOPLE.replace('1 SEX M\n1 FAMS', '1 SEX M\n1 BIRT\n2 DATE 1900\n2 SOUR @S1@\n1 DEAT\n2 OBJE @O1@\n1 FAMS') + TRLR;
    expect(countSkippedSources(ged)).toBe(2);
  });

  test('counts a citation nested under a family event', () => {
    const ged = HEAD + PEOPLE.replace('1 HUSB @I1@', '1 HUSB @I1@\n1 MARR\n2 SOUR دفتر الزواج') + TRLR;
    expect(countSkippedSources(ged)).toBe(1);
  });

  test('media inside a citation is part of that citation, not counted twice', () => {
    const ged =
      HEAD +
      PEOPLE.replace('1 SEX M\n1 FAMS', '1 SEX M\n1 SOUR @S1@\n2 OBJE @O1@\n1 BIRT\n2 SOUR @S1@\n3 OBJE @O1@\n3 PAGE ص ٣\n2 DATE 1900\n1 FAMS') +
      TRLR;
    expect(countSkippedSources(ged)).toBe(2);
  });

  test('media nested inside a SOUR record is part of that record', () => {
    expect(countSkippedSources(HEAD + PEOPLE + '0 @S1@ SOUR\n1 OBJE @O1@\n' + TRLR)).toBe(1);
  });

  test('a SOUR line inside the HEAD record is not a source', () => {
    expect(countSkippedSources('0 HEAD\n1 SOUR MyGenealogyApp\n2 VERS 1.0\n' + PEOPLE + TRLR)).toBe(0);
  });

  test('adds records and citations together', () => {
    const ged =
      HEAD +
      PEOPLE.replace('1 SEX M\n1 FAMS', '1 SEX M\n1 SOUR @S1@\n1 FAMS').replace('1 HUSB @I1@', '1 HUSB @I1@\n1 SOUR @S1@') +
      '0 @S1@ SOUR\n1 TITL دفتر\n' +
      TRLR;
    expect(countSkippedSources(ged)).toBe(3);
  });

  test('counting does not change what the parser reads', () => {
    const ged = HEAD + PEOPLE.replace('1 SEX M\n1 FAMS', '1 SEX M\n1 SOUR @S1@\n1 FAMS') + '0 @S1@ SOUR\n' + TRLR;
    const parsed = parseGedcom(ged);
    expect(Object.keys(parsed.individuals)).toEqual(['@I1@', '@I2@']);
  });
});

describe('importSkippedSourcesNotice', () => {
  test('says nothing when no source was left out', () => {
    expect(importSkippedSourcesNotice(0)).toBeNull();
  });

  test('tells how many sources were left out and where to add them', () => {
    expect(importSkippedSourcesNotice(12)).toBe(
      'لم تُستورد المصادر المرفقة بالملف (١٢)، ويمكنك إضافتها يدويًا من صفحة كل شخص.',
    );
  });
});
