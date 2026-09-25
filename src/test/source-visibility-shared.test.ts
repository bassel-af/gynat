/**
 * Sources («المصادر») — shared-source gate additions (rework R1).
 *
 * A source is linked to MANY people. The gate still answers per
 * (source, person); two new helpers answer the per-source questions:
 *   - `visibleLinkedPeople` — the linked people on whom this viewer may see
 *     this source (the ONLY input for names, counts and «مشترك مع»).
 *   - `canViewSourceAnywhere` — admin: always (incl. orphans); others: the
 *     tree-wide gate, or at least one visible linked person.
 */
import { describe, test, expect } from 'vitest';
import {
  visibleLinkedPeople,
  canViewSourceAnywhere,
  type SourceViewer,
} from '@/lib/tree/source-visibility';

const admin: SourceViewer = { kind: 'admin' };
const member: SourceViewer = { kind: 'member' };
const visitor: SourceViewer = { kind: 'public' };

const A = { id: 'A', isPrivate: false, publicShown: true };
const P = { id: 'P', isPrivate: true, publicShown: false };
const C = { id: 'C', isPrivate: false, publicShown: false };
const B = { id: 'B', isPrivate: false, pointed: true, publicShown: true };

const src = (visibility: 'admins' | 'members' | 'public', isTreeWide = false) => ({
  visibility,
  isTreeWide,
});

describe('visibleLinkedPeople', () => {
  test('admin sees every native linked person, private included, order kept', () => {
    expect(visibleLinkedPeople(src('admins'), [A, P, C], admin).map((p) => p.id)).toEqual(['A', 'P', 'C']);
  });

  test('member never gets a private person', () => {
    expect(visibleLinkedPeople(src('members'), [A, P, C], member).map((p) => p.id)).toEqual(['A', 'C']);
  });

  test('member gets nobody on an admins-level source', () => {
    expect(visibleLinkedPeople(src('admins'), [A, C], member)).toEqual([]);
  });

  test('public visitor gets only people the public tree shows', () => {
    expect(visibleLinkedPeople(src('public'), [A, P, C], visitor).map((p) => p.id)).toEqual(['A']);
  });

  test('borrowed people are nobody\'s', () => {
    expect(visibleLinkedPeople(src('public'), [B], admin)).toEqual([]);
  });

  test('unknown level or viewer is fail-closed', () => {
    expect(visibleLinkedPeople({ visibility: 'secret' as never, isTreeWide: false }, [A], admin)).toEqual([]);
    expect(visibleLinkedPeople(src('public'), [A], { kind: 'root' } as never)).toEqual([]);
  });
});

describe('canViewSourceAnywhere', () => {
  test('admin sees an orphan (no linked people)', () => {
    expect(canViewSourceAnywhere(src('admins'), [], admin)).toBe(true);
  });

  test('member never sees an orphan', () => {
    expect(canViewSourceAnywhere(src('members'), [], member)).toBe(false);
  });

  test('member sees a source with one visible linked person', () => {
    expect(canViewSourceAnywhere(src('members'), [P, C], member)).toBe(true);
  });

  test('member does not see a source linked only to a private person', () => {
    expect(canViewSourceAnywhere(src('members'), [P], member)).toBe(false);
  });

  test('tree-wide source follows the tree-wide gate (no people)', () => {
    expect(canViewSourceAnywhere(src('members', true), [], member)).toBe(true);
    expect(canViewSourceAnywhere(src('admins', true), [], member)).toBe(false);
    expect(canViewSourceAnywhere(src('public', true), [], visitor)).toBe(true);
  });

  test('public visitor never sees an orphan', () => {
    expect(canViewSourceAnywhere(src('public'), [], visitor)).toBe(false);
  });

  test('admin still needs a known level (fail-closed)', () => {
    expect(canViewSourceAnywhere({ visibility: 'x' as never, isTreeWide: false }, [], admin)).toBe(false);
  });
});
