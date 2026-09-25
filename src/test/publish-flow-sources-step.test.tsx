/**
 * Sources («المصادر») step 7 — the publish flow's ONE sources question.
 *
 * When a private tree goes public, the admin is asked once about the entries
 * visitors can't see yet: «كلها» / «لا شيء» (default — nothing changes) /
 * «أختار بنفسي». The change is applied through the admin bulk route ONLY after
 * the publish itself succeeded; a failed bulk leaves the tree published and
 * says so in a toast.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const mockShowToast = vi.fn();
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
  useOptionalToast: () => ({ showToast: mockShowToast }),
}));
vi.mock('@/context/WorkspaceTreeContext', () => ({ useOptionalWorkspaceTree: () => null }));

import { PublishFlowContainer } from '@/components/public-tree';

const PREVIEW = {
  checkpoint: { livingCount: 0, attention: [], households: [] },
  withheldBranches: [],
  confirmationPhrase: 'آل السعيد',
  currentLevel: 'private',
  publicSlug: null,
  allowReuse: false,
  personPagesIndexable: false,
};

const id = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TREE_ENTRY = 'eeeeeeee-1111-4000-8000-000000000001';

interface Setup {
  pendingIds?: string[];
  publicCount?: number;
  publicPeopleCount?: number;
  treeEntry?: { id: string; visibility: string } | null;
  patchOk?: boolean;
  bulkOk?: boolean;
  preview?: Record<string, unknown>;
}

let calls: { url: string; method: string; body: unknown }[] = [];
/** When set, the summary answer waits for it (a slow network). */
let summaryGate: Promise<void> | null = null;

function setup({
  pendingIds = [id(1), id(2), id(3)],
  publicCount = 0,
  publicPeopleCount = 0,
  treeEntry = null,
  patchOk = true,
  bulkOk = true,
  preview = PREVIEW,
}: Setup = {}) {
  calls = [];
  mockApiFetch.mockImplementation(async (url: string, opts?: { method?: string; body?: string }) => {
    const method = opts?.method ?? 'GET';
    calls.push({ url, method, body: opts?.body ? JSON.parse(opts.body) : undefined });
    const ok = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/publish-preview')) return ok(preview);
    if (url.includes('/sources/publish-summary')) {
      if (summaryGate) await summaryGate;
      return ok({ data: { pendingIds, publicCount, publicPeopleCount, treeEntry } });
    }
    if (url.includes('/tree/visibility') && method === 'PATCH') {
      return patchOk
        ? ok({ data: { visibility: 'public_link', publicSlug: 'xyz' } })
        : ok({ error: 'تعذّر' }, 500);
    }
    if (url.includes('/sources/bulk')) {
      return bulkOk ? ok({ data: { updated: (JSON.parse(opts!.body!) as { ids: string[] }).ids.length } }) : ok({ error: 'x' }, 500);
    }
    if (url.includes('/sources/tree-entry') && method === 'PUT') return ok({ data: { id: TREE_ENTRY } });
    if (/\/tree\/sources\?/.test(url)) {
      return ok({
        data: {
          entries: pendingIds.slice(0, 20).map((eid, i) => ({
            id: eid, individualId: `p-${i}`, text: `مصدر ${i}`, visibility: 'admins',
            createdAt: '', updatedAt: '', files: [], people: [{ id: `p-${i}`, name: `شخص ${i}` }], peopleCount: 1, fileCount: 0,
          })),
          total: pendingIds.length,
          nextCursor: null,
          matchedIds: pendingIds.slice(0, 500),
          matchedIdsTruncated: pendingIds.length > 500,
          scanTruncated: false,
          counts: { all: pendingIds.length, shared: 0, unlinked: 0 },
        },
      });
    }
    return ok({});
  });
  return render(<PublishFlowContainer workspaceId="ws-1" onClose={vi.fn()} />);
}

async function chooseLinkAndContinue() {
  fireEvent.click(await screen.findByText(/عامة عبر الرابط/));
  fireEvent.click(screen.getByText('متابعة'));
}

async function publish() {
  fireEvent.click(await screen.findByRole('button', { name: /نشر|تأكيد/ }));
}

const bulkCalls = () => calls.filter((c) => c.url.includes('/sources/bulk'));
const indexOf = (pred: (c: (typeof calls)[number]) => boolean) => calls.findIndex(pred);

beforeEach(() => {
  summaryGate = null;
  mockApiFetch.mockReset();
  mockShowToast.mockReset();
});

describe('publish flow — «المصادر في الشجرة المنشورة»', () => {
  test('is skipped entirely when every entry is already public (N = 0) and there is no pending tree-wide entry', async () => {
    setup({ pendingIds: [], publicCount: 4 });
    await chooseLinkAndContinue();
    await screen.findByText('تأكيد النشر');
    expect(screen.queryByText('المصادر في الشجرة المنشورة')).toBeNull();
  });

  test('asks with the counts, and «لا شيء» is the default', async () => {
    setup({ pendingIds: [id(1), id(2), id(3)], publicCount: 2, publicPeopleCount: 42 });
    await chooseLinkAndContinue();
    const step = (await screen.findByText('المصادر في الشجرة المنشورة')).closest('[role="dialog"]') as HTMLElement;
    expect(step).toHaveTextContent('لديك ٣ مصادر يراها أعضاء مساحة العائلة أو المشرفون فقط');
    expect(step).toHaveTextContent('ومصدران (تظهر على ٤٢ شخصًا) يظهر لهم أصلًا');
    expect(within(step).getByRole('radio', { name: 'لا شيء' })).toBeChecked();
  });

  test('the already-public line leaves out the people count when those sources show on nobody', async () => {
    setup({ pendingIds: [id(1)], publicCount: 1, publicPeopleCount: 0 });
    await chooseLinkAndContinue();
    const step = (await screen.findByText('المصادر في الشجرة المنشورة')).closest('[role="dialog"]') as HTMLElement;
    expect(step).toHaveTextContent('ومصدر واحد يظهر لهم أصلًا');
    expect(step).not.toHaveTextContent('تظهر على');
  });

  test('«لا شيء» (default) publishes and sends nothing about sources', async () => {
    setup();
    await chooseLinkAndContinue();
    await screen.findByText('المصادر في الشجرة المنشورة');
    fireEvent.click(screen.getByText('متابعة'));
    await publish();
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    await screen.findByText(/xyz/);
    expect(bulkCalls()).toEqual([]);
    expect(calls.some((c) => c.url.includes('/sources/tree-entry'))).toBe(false);
  });

  test('«كلها» sends every pending id AFTER the publish succeeded, in batches of 500', async () => {
    const many = Array.from({ length: 501 }, (_, i) => id(i + 1));
    setup({ pendingIds: many });
    await chooseLinkAndContinue();
    fireEvent.click(await screen.findByRole('radio', { name: 'كلها' }));
    fireEvent.click(screen.getByText('متابعة'));
    await publish();

    await waitFor(() => expect(bulkCalls()).toHaveLength(2));
    const patchAt = indexOf((c) => c.method === 'PATCH');
    const firstBulkAt = indexOf((c) => c.url.includes('/sources/bulk'));
    expect(patchAt).toBeGreaterThanOrEqual(0);
    expect(firstBulkAt).toBeGreaterThan(patchAt);
    const sent = bulkCalls().flatMap((c) => (c.body as { ids: string[] }).ids);
    expect(sent).toEqual(many);
    for (const c of bulkCalls()) {
      expect(c.body).toMatchObject({ action: 'setVisibility', visibility: 'public' });
      expect((c.body as { ids: string[] }).ids.length).toBeLessThanOrEqual(500);
    }
  });

  test('a failed publish sends nothing about sources', async () => {
    setup({ patchOk: false });
    await chooseLinkAndContinue();
    fireEvent.click(await screen.findByRole('radio', { name: 'كلها' }));
    fireEvent.click(screen.getByText('متابعة'));
    await publish();
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(bulkCalls()).toEqual([]);
  });

  test('a failed sources change keeps the tree published and says so in a toast', async () => {
    setup({ bulkOk: false });
    await chooseLinkAndContinue();
    fireEvent.click(await screen.findByRole('radio', { name: 'كلها' }));
    fireEvent.click(screen.getByText('متابعة'));
    await publish();
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('المصادر'), 'error'),
    );
    await screen.findByText(/xyz/); // success screen with the share link
  });

  test('«أختار بنفسي» lists the pending entries and sends only the ticked ones', async () => {
    setup({ pendingIds: [id(1), id(2), id(3)] });
    await chooseLinkAndContinue();
    fireEvent.click(await screen.findByRole('radio', { name: 'أختار بنفسي' }));
    const listCall = await waitFor(() => {
      const c = calls.find((x) => /\/tree\/sources\?/.test(x.url));
      expect(c).toBeTruthy();
      return c!;
    });
    expect(listCall.url).toContain('scope=pending');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'تحديد مصدر 1' }));
    fireEvent.click(screen.getByText('متابعة'));
    await publish();
    await waitFor(() => expect(bulkCalls()).toHaveLength(1));
    expect((bulkCalls()[0].body as { ids: string[] }).ids).toEqual([id(2)]);
  });

  test('the tree-wide entry is offered separately («ومصدر الشجرة») and raised with its own call', async () => {
    setup({ pendingIds: [id(1)], treeEntry: { id: TREE_ENTRY, visibility: 'members' } });
    await chooseLinkAndContinue();
    fireEvent.click(await screen.findByRole('radio', { name: 'كلها' }));
    const box = screen.getByRole('checkbox', { name: 'ومصدر الشجرة' });
    expect(box).toBeChecked();
    fireEvent.click(screen.getByText('متابعة'));
    await publish();
    await waitFor(() => expect(calls.some((c) => c.url.includes('/sources/tree-entry') && c.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.url.includes('/sources/tree-entry'))!;
    expect(put.body).toEqual({ visibility: 'public' });
    const patchAt = indexOf((c) => c.method === 'PATCH');
    expect(indexOf((c) => c.url.includes('/sources/tree-entry'))).toBeGreaterThan(patchAt);
  });

  test('the ladder waits for the sources summary, so a quick «متابعة» can never skip the question', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    summaryGate = gate;
    setup();
    await waitFor(() => expect(calls.some((c) => c.url.includes('/sources/publish-summary'))).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/عامة عبر الرابط/)).toBeNull();
    release();
    await chooseLinkAndContinue();
    expect(await screen.findByText('المصادر في الشجرة المنشورة')).toBeInTheDocument();
  });

  test('a tree that is already public never sees the step (manage panel)', async () => {
    setup({ preview: { ...PREVIEW, currentLevel: 'link', publicSlug: 'abc' } });
    await screen.findByText('تعديل الإعدادات');
    expect(calls.some((c) => c.url.includes('publish-summary'))).toBe(false);
  });
});
