/**
 * Public tree viewer (`/family/<publicSlug>`) — the person panel's links.
 *
 * The anonymous viewer reuses the member `Sidebar`/`PersonDetail` inside a
 * `WorkspaceTreeProvider` carrying `publicSlug`. Every href it renders must
 * target the PUBLIC routes: a `/workspaces/…` link sends a logged-out visitor
 * to login (and a logged-in one to «Workspace not found»). The «عرض صفحة الشخص»
 * button appears only when the public person page actually serves
 * (`hasPublicPersonPage`), so it never links to a 404.
 *
 * Real `TreeProvider` + `WorkspaceTreeProvider` + `Sidebar` + `PersonDetail`;
 * only the React Flow canvas is stubbed with one "card" per person that selects
 * it (what clicking a canvas card does).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect, type ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GedcomData } from '@/lib/gedcom/types';
import { ind, fam } from './helpers/hashim-fixture';

let routeSlug = 'abc';
let pathname = '/family/abc';
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: routeSlug }),
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/tree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/tree')>();
  const { useTree } = await import('@/context/TreeContext');
  function CanvasStub() {
    const { data, setSelectedPersonId } = useTree();
    return (
      <div data-testid="canvas">
        {Object.keys(data?.individuals ?? {}).map((id) => (
          <button key={id} data-testid={`card-${id}`} onClick={() => setSelectedPersonId(id)}>
            card
          </button>
        ))}
      </div>
    );
  }
  return { ...actual, FamilyTree: CanvasStub };
});

const mockApiFetch = vi.fn(async () => new Response(JSON.stringify({ data: { entries: [], inherited: null } })));
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...(a as [])) }));

import { PublicTreeViewer } from '@/components/public-tree';
import { TreeProvider, useTree } from '@/context/TreeContext';
import { WorkspaceTreeProvider } from '@/context/WorkspaceTreeContext';
import { PersonDetail } from '@/components/ui/Sidebar/PersonDetail';

const FATHER = 'aaaaaaaa-0000-4000-8000-000000000001';
const SON = 'aaaaaaaa-0000-4000-8000-000000000002';
const BLANK = 'aaaaaaaa-0000-4000-8000-000000000003';
const SPACES = 'aaaaaaaa-0000-4000-8000-000000000004';

const person = (id: string, name: string, extra: Partial<Parameters<typeof ind>[0]> = {}) =>
  ind({ id, name, givenName: name, publicDisplay: 'full', ...extra });

// Public-redacted shape: a father with a named son, a nameless son and a
// whitespace-named son.
const DATA: GedcomData = {
  individuals: {
    [FATHER]: person(FATHER, 'سعيد', { familiesAsSpouse: ['F1'] }),
    [SON]: person(SON, 'أحمد', { familyAsChild: 'F1' }),
    [BLANK]: person(BLANK, '', { familyAsChild: 'F1' }),
    [SPACES]: person(SPACES, '   ', { givenName: '', familyAsChild: 'F1' }),
  },
  families: { F1: fam({ id: 'F1', husband: FATHER, children: [SON, BLANK, SPACES] }) },
};

const PERSON_PAGE_LABEL = 'عرض صفحة الشخص';

beforeEach(() => {
  routeSlug = 'abc';
  pathname = '/family/abc';
  mockApiFetch.mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { entries: [] } }))));
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
});
afterEach(() => vi.unstubAllGlobals());

function renderPublicViewer() {
  return render(
    <PublicTreeViewer data={DATA} familyName="آل سعيد" calendar="hijri" slug="abc" />,
  );
}

async function selectOnCanvas(id: string) {
  fireEvent.click(await screen.findByTestId(`card-${id}`));
}

describe('public tree viewer — person panel links', () => {
  it('links «عرض صفحة الشخص» to the public person page and never into the member area', async () => {
    renderPublicViewer();
    await selectOnCanvas(SON);
    const link = await screen.findByRole('link', { name: PERSON_PAGE_LABEL });
    expect(link).toHaveAttribute('href', `/family/abc/person/${SON}`);
    expect(document.querySelectorAll('a[href^="/workspaces/"]')).toHaveLength(0);
  });

  it.each([
    ['a blank name', BLANK],
    ['a whitespace-only name', SPACES],
  ])('hides the button for a person with %s', async (_label, id) => {
    renderPublicViewer();
    await selectOnCanvas(id);
    // The panel for the selected person is up (the focus button is always there).
    await screen.findByRole('button', { name: 'التركيز في الشجرة' });
    expect(screen.queryByRole('link', { name: PERSON_PAGE_LABEL })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Member surface regression: no publicSlug → the member href, unchanged.
// ---------------------------------------------------------------------------

/** Feeds DATA into the real TreeContext (as the member tree client does). */
function Seeded({ children }: { children: ReactNode }) {
  const { data, setData } = useTree();
  useEffect(() => {
    setData(DATA);
  }, [setData]);
  return <>{data ? children : null}</>;
}

describe('member tree — person panel link is unchanged', () => {
  function renderMember({ personId = SON, activeTreeId }: { personId?: string; activeTreeId?: string } = {}) {
    routeSlug = 'al-saeed';
    pathname = '/workspaces/al-saeed/tree';
    return render(
      <TreeProvider>
        <WorkspaceTreeProvider
          workspaceId="ws-1"
          canEdit={false}
          isAdmin={false}
          refreshTree={async () => undefined}
          activeTreeId={activeTreeId}
        >
          <Seeded>
            <PersonDetail personId={personId} />
          </Seeded>
        </WorkspaceTreeProvider>
      </TreeProvider>,
    );
  }

  it('links to the member person route on the main tree', async () => {
    renderMember();
    const link = await screen.findByRole('link', { name: PERSON_PAGE_LABEL });
    expect(link).toHaveAttribute('href', `/workspaces/al-saeed/tree/person/${SON}`);
  });

  it('keeps ?treeId= for an extra tree', async () => {
    renderMember({ activeTreeId: 'extra-9' });
    const link = await screen.findByRole('link', { name: PERSON_PAGE_LABEL });
    expect(link).toHaveAttribute('href', `/workspaces/al-saeed/tree/person/${SON}?treeId=extra-9`);
  });

  it('shows the button for a blank-name person (member gate is unchanged)', async () => {
    renderMember({ personId: BLANK });
    const link = await screen.findByRole('link', { name: PERSON_PAGE_LABEL });
    expect(link).toHaveAttribute('href', `/workspaces/al-saeed/tree/person/${BLANK}`);
  });
});
