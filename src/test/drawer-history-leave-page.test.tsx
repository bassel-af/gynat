import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Phone drawer dead Back press: tapping «عرض صفحة الشخص» while the drawer's
// history sentinel is the current entry must REPLACE it, not push on top.
// jsdom can't fire the async popstate (the stack itself is browser-verified);
// these lock the decision.

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }));

import { DRAWER_HISTORY_SENTINEL_KEY } from '@/lib/utils/drawer-history';
import { ViewSwitcherIconButton } from '@/components/tree/ViewSwitcherIconButton/ViewSwitcherIconButton';

const ctx = { slug: 'al-saeed', individualId: 'I7' };
const PERSON_HREF = '/workspaces/al-saeed/tree/person/I7';

function onSentinel() {
  window.history.replaceState({ [DRAWER_HISTORY_SENTINEL_KEY]: true }, '');
}

beforeEach(() => {
  routerReplace.mockClear();
  window.history.replaceState(null, '');
});

describe('ViewSwitcherIconButton — leaving the page from inside the drawer', () => {
  it('on the drawer sentinel, REPLACES it with the person page (default push suppressed)', () => {
    onSentinel();
    render(<ViewSwitcherIconButton currentMode="tree" ctx={ctx} />);
    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'عرض صفحة الشخص' }));
    expect(routerReplace).toHaveBeenCalledWith(PERSON_HREF);
    expect(notPrevented).toBe(false);
  });

  it('without the sentinel (desktop / drawer closed), leaves navigation to the Link', () => {
    render(<ViewSwitcherIconButton currentMode="tree" ctx={ctx} />);
    fireEvent.click(screen.getByRole('link', { name: 'عرض صفحة الشخص' }));
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('on the sentinel, a modifier-click (open in new tab) is not intercepted', () => {
    onSentinel();
    render(<ViewSwitcherIconButton currentMode="tree" ctx={ctx} />);
    fireEvent.click(screen.getByRole('link', { name: 'عرض صفحة الشخص' }), { metaKey: true });
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
