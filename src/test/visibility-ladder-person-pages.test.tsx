import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VisibilityLadder, type VisibilityLevel } from '@/components/public-tree/VisibilityLadder';
import { ManagePublicPanel } from '@/components/public-tree/ManagePublicPanel';

// ---------------------------------------------------------------------------
// The friendly "a page for each person in search results" opt-in.
//
// Behaviour pinned here (not cosmetics):
//   1. It is GATED on the search level — it is meaningless for a private or
//      link-only tree, so it must not render there.
//   2. It is OFF by default (opt-in, never inherited).
//   3. Clicking it reports intent upward (the caller persists).
//   4. The already-public admin can reach it from the manage panel without
//      republishing — gated on the SAME search level.
// ---------------------------------------------------------------------------

const PERSON_PAGES_LABEL = /صفحة لكل فرد في نتائج البحث/;

function renderLadder(
  level: VisibilityLevel,
  overrides: Partial<React.ComponentProps<typeof VisibilityLadder>> = {},
) {
  return render(
    <VisibilityLadder
      level={level}
      allowReuse={false}
      personPagesIndexable={false}
      {...overrides}
    />,
  );
}

function personPagesCheckbox() {
  return screen.queryByRole('checkbox', { name: PERSON_PAGES_LABEL });
}

describe('VisibilityLadder — person-pages opt-in', () => {
  test('is not offered for a private tree', () => {
    renderLadder('private');
    expect(personPagesCheckbox()).toBeNull();
  });

  test('is not offered for a link-only tree', () => {
    renderLadder('link');
    expect(personPagesCheckbox()).toBeNull();
  });

  test('is offered once the search level is chosen', () => {
    renderLadder('search');
    expect(personPagesCheckbox()).toBeTruthy();
  });

  test('is unchecked by default', () => {
    renderLadder('search');
    expect((personPagesCheckbox() as HTMLInputElement).checked).toBe(false);
  });

  test('reflects an already-enabled value as checked', () => {
    renderLadder('search', { personPagesIndexable: true });
    expect((personPagesCheckbox() as HTMLInputElement).checked).toBe(true);
  });

  test('reports the opt-in upward when clicked', () => {
    const onPersonPagesIndexableChange = vi.fn();
    renderLadder('search', { onPersonPagesIndexableChange });
    fireEvent.click(personPagesCheckbox()!);
    expect(onPersonPagesIndexableChange).toHaveBeenCalledWith(true);
  });

  test('reports opting back out when an enabled box is clicked', () => {
    const onPersonPagesIndexableChange = vi.fn();
    renderLadder('search', { personPagesIndexable: true, onPersonPagesIndexableChange });
    fireEvent.click(personPagesCheckbox()!);
    expect(onPersonPagesIndexableChange).toHaveBeenCalledWith(false);
  });

  // Regression: the owner removed the review/warning step, so the search level
  // must not keep promising one.
  test('the search level no longer promises a review step that does not exist', () => {
    renderLadder('private');
    expect(screen.queryByText(/يمر بمراجعة/)).toBeNull();
  });
});

describe('ManagePublicPanel — person-pages opt-in', () => {
  function renderPanel(
    currentLevel: 'link' | 'search',
    overrides: Partial<React.ComponentProps<typeof ManagePublicPanel>> = {},
  ) {
    render(
      <ManagePublicPanel
        currentLevel={currentLevel}
        shareUrl="https://gynat.com/family/abc"
        personPagesIndexable={false}
        {...overrides}
      />,
    );
    // Settings are collapsed by default — the admin came for the link.
    fireEvent.click(screen.getByText('تعديل الإعدادات'));
  }

  test('an already search-listed tree can toggle it without republishing', () => {
    renderPanel('search');
    expect(personPagesCheckbox()).toBeTruthy();
  });

  test('a link-only tree is not offered it', () => {
    renderPanel('link');
    expect(personPagesCheckbox()).toBeNull();
  });

  test('ticking it only stages the change — nothing is reported until «حفظ التغيير»', () => {
    const onChangeLevel = vi.fn();
    renderPanel('search', { onChangeLevel });
    // One footer, one primary: with nothing pending it is just «تم».
    expect(screen.getByText('تم')).toBeTruthy();
    expect(screen.queryByText('حفظ التغيير')).toBeNull();

    fireEvent.click(personPagesCheckbox()!);
    expect(onChangeLevel).not.toHaveBeenCalled();
    // A pending change swaps «تم» for save + discard — never both «تم» and save.
    expect(screen.queryByText('تم')).toBeNull();
    expect(screen.getByText('إلغاء')).toBeTruthy();

    fireEvent.click(screen.getByText('حفظ التغيير'));
    expect(onChangeLevel).toHaveBeenCalledWith('search', true);
  });

  test('«إلغاء» discards the pending tick and brings «تم» back', () => {
    const onChangeLevel = vi.fn();
    renderPanel('search', { onChangeLevel });
    fireEvent.click(personPagesCheckbox()!);
    fireEvent.click(screen.getByText('إلغاء'));
    expect(onChangeLevel).not.toHaveBeenCalled();
    expect((personPagesCheckbox() as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('تم')).toBeTruthy();
    expect(screen.queryByText('حفظ التغيير')).toBeNull();
  });

  test('unticking a saved opt-in is staged the same way', () => {
    const onChangeLevel = vi.fn();
    renderPanel('search', { personPagesIndexable: true, onChangeLevel });
    fireEvent.click(personPagesCheckbox()!);
    fireEvent.click(screen.getByText('حفظ التغيير'));
    expect(onChangeLevel).toHaveBeenCalledWith('search', false);
  });
});
