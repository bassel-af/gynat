import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  TREE_VIEW_MODES,
  getViewMode,
  getNextViewMode,
  viewModeFromPathname,
  FOCUS_PARAM,
} from '@/lib/tree/view-modes';
import { ViewSwitcherIconButton } from '@/components/tree/ViewSwitcherIconButton/ViewSwitcherIconButton';

describe('view-modes href builders', () => {
  it('exposes exactly the tree and person modes in order', () => {
    expect(TREE_VIEW_MODES.map((m) => m.id)).toEqual(['tree', 'person']);
  });

  it('builds the person href from slug + individualId', () => {
    const href = getViewMode('person').href({ slug: 'al-saeed', individualId: 'I7' });
    expect(href).toBe('/workspaces/al-saeed/tree/person/I7');
  });

  it('threads treeId through the person href', () => {
    const href = getViewMode('person').href({
      slug: 'al-saeed',
      individualId: 'I7',
      treeId: 'extra-9',
    });
    expect(href).toBe('/workspaces/al-saeed/tree/person/I7?treeId=extra-9');
  });

  it('returns to the canvas with a focus param centered on the person', () => {
    const href = getViewMode('tree').href({ slug: 'al-saeed', individualId: 'I7' });
    expect(href).toBe(`/workspaces/al-saeed/tree?${FOCUS_PARAM}=I7`);
  });

  it('threads treeId AND focus together on return to the canvas', () => {
    const href = getViewMode('tree').href({
      slug: 'al-saeed',
      individualId: 'I7',
      treeId: 'extra-9',
    });
    expect(href).toBe(`/workspaces/al-saeed/tree?treeId=extra-9&${FOCUS_PARAM}=I7`);
  });

  it('plain canvas href when no person is in context', () => {
    expect(getViewMode('tree').href({ slug: 'al-saeed' })).toBe('/workspaces/al-saeed/tree');
  });

  it('getNextViewMode flips between the two modes', () => {
    expect(getNextViewMode('tree').id).toBe('person');
    expect(getNextViewMode('person').id).toBe('tree');
  });
});

// The sidebar renders on BOTH views (they share the shell), so its view-switcher
// and person-click behavior must reflect the CURRENT view, derived from the
// route. (Bugs 2 + 3.)
describe('viewModeFromPathname — current view from the route', () => {
  it('is "person" on the person route', () => {
    expect(viewModeFromPathname('/workspaces/al-saeed/tree/person/I7')).toBe('person');
  });

  it('is "person" on the person route even with a trailing extra-tree query in the path string', () => {
    expect(viewModeFromPathname('/workspaces/al-saeed/tree/person/I7/')).toBe('person');
  });

  it('is "tree" on the canvas route', () => {
    expect(viewModeFromPathname('/workspaces/al-saeed/tree')).toBe('tree');
  });

  it('is "tree" for null / undefined (defensive default)', () => {
    expect(viewModeFromPathname(null)).toBe('tree');
    expect(viewModeFromPathname(undefined)).toBe('tree');
  });
});

describe('ViewSwitcherIconButton', () => {
  const ctx = { slug: 'al-saeed', individualId: 'I7' };

  it('on the canvas, shows the NEXT (person) label and links to the person route', () => {
    render(<ViewSwitcherIconButton currentMode="tree" ctx={ctx} />);
    const link = screen.getByRole('link', { name: 'عرض صفحة الشخص' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/workspaces/al-saeed/tree/person/I7');
  });

  it('on the person page, shows the NEXT (tree) label and links back to the canvas with focus', () => {
    render(<ViewSwitcherIconButton currentMode="person" ctx={ctx} />);
    const link = screen.getByRole('link', { name: 'عرض في الشجرة' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', `/workspaces/al-saeed/tree?${FOCUS_PARAM}=I7`);
  });

  it('applies the host-provided className so it matches sibling action buttons', () => {
    render(<ViewSwitcherIconButton currentMode="tree" ctx={ctx} className="focusButton" />);
    expect(screen.getByRole('link')).toHaveClass('focusButton');
  });

  it('renders an svg icon (the destination mode glyph)', () => {
    const { container } = render(<ViewSwitcherIconButton currentMode="tree" ctx={ctx} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  // Regression guard for the layout split: the switcher is a pure per-person
  // navigation affordance. It has NO `canEdit` prop and no edit-permission
  // coupling — it renders identically whether or not the viewer can edit, so
  // the split can't have altered edit-pen gating through this component. (The
  // "only when a person is selected" gate lives in PersonDetail's pre-existing
  // `if (!person) return null`, which the surgical PersonDetail diff leaves
  // untouched — only an import + the button insertion were added.)
  it('takes no edit-permission prop — decoupled from canEdit gating', () => {
    const props = { currentMode: 'tree' as const, ctx };
    // @ts-expect-error — there is no canEdit prop on the switcher.
    render(<ViewSwitcherIconButton {...props} canEdit={false} />);
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('threads the active extra-tree id into the destination href', () => {
    render(
      <ViewSwitcherIconButton
        currentMode="tree"
        ctx={{ slug: 'al-saeed', individualId: 'I7', treeId: 'extra-9' }}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/workspaces/al-saeed/tree/person/I7?treeId=extra-9',
    );
  });
});
