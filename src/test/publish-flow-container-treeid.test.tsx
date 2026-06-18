import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// PublishFlowContainer — treeId threading (the unified-publish guarantee).
//
// The SAME container drives publishing for the main tree AND every extra tree;
// the only difference is `treeId`. These tests pin the two load-bearing wiring
// points that make that true:
//   (1) the preview fetch carries `?treeId=` (so the right tree's checkpoint
//       and confirm-phrase load), and
//   (2) the visibility PATCH body carries `treeId` (so the right tree is
//       published) — while the main-tree case sends NO treeId.
// ---------------------------------------------------------------------------

const mockApiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// The list screen mounts the container OUTSIDE the tree provider — the optional
// hook returns null there. Emulate that (no canvas refresh to assert).
vi.mock('@/context/WorkspaceTreeContext', () => ({
  useOptionalWorkspaceTree: () => null,
}));

import { PublishFlowContainer } from '@/components/public-tree';

const PREVIEW = {
  checkpoint: { livingCount: 0, attention: [], households: [] },
  withheldBranches: [],
  confirmationPhrase: 'فرع بني تميم',
  currentLevel: 'private',
  publicSlug: null,
  allowReuse: false,
};

function previewResponse() {
  return { ok: true, json: async () => PREVIEW };
}
function patchResponse() {
  return { ok: true, json: async () => ({ data: { visibility: 'public_link', publicSlug: 'xyz' } }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PublishFlowContainer — preview fetch', () => {
  test('fetches the preview WITH ?treeId for an extra tree', async () => {
    mockApiFetch.mockResolvedValue(previewResponse());
    render(
      <PublishFlowContainer
        workspaceId="ws-1"
        treeId="extra-9"
        familyName="فرع بني تميم"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(mockApiFetch.mock.calls[0][0]).toBe(
      '/api/workspaces/ws-1/tree/publish-preview?treeId=extra-9',
    );
  });

  test('fetches the preview WITHOUT a treeId query for the main tree', async () => {
    mockApiFetch.mockResolvedValue(previewResponse());
    render(
      <PublishFlowContainer workspaceId="ws-1" familyName="آل السعيد" onClose={vi.fn()} />,
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(mockApiFetch.mock.calls[0][0]).toBe(
      '/api/workspaces/ws-1/tree/publish-preview',
    );
  });
});

describe('PublishFlowContainer — visibility PATCH', () => {
  // Walk the real PublishFlow to going-public: choose link → continue → type phrase → publish.
  async function walkToPublish(phrase: string) {
    fireEvent.click(await screen.findByText(/عامة عبر الرابط/));
    fireEvent.click(screen.getByText('متابعة'));
    const input = await screen.findByPlaceholderText(phrase);
    fireEvent.change(input, { target: { value: phrase } });
    // The publish/confirm button label in PublishFlow.
    const publishBtn = await screen.findByRole('button', { name: /نشر|تأكيد/ });
    fireEvent.click(publishBtn);
  }

  test('PATCHes visibility with the extra treeId in the body and the typed phrase', async () => {
    mockApiFetch.mockImplementation((_url: string, opts?: { method?: string }) =>
      opts?.method === 'PATCH'
        ? Promise.resolve(patchResponse())
        : Promise.resolve(previewResponse()),
    );
    const onChanged = vi.fn();
    render(
      <PublishFlowContainer
        workspaceId="ws-1"
        treeId="extra-9"
        familyName="فرع بني تميم"
        onClose={vi.fn()}
        onChanged={onChanged}
      />,
    );
    await walkToPublish('فرع بني تميم');

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
    });
    const patchCall = mockApiFetch.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(patchCall[0]).toBe('/api/workspaces/ws-1/tree/visibility');
    const body = JSON.parse(patchCall[1].body);
    expect(body.treeId).toBe('extra-9');
    expect(body.level).toBe('link');
    expect(body.confirmationPhrase).toBe('فرع بني تميم');
    // The list screen's row-refresh callback fires with the new level.
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('link'));
  });

  test('main-tree publish sends NO treeId in the body', async () => {
    mockApiFetch.mockImplementation((_url: string, opts?: { method?: string }) =>
      opts?.method === 'PATCH'
        ? Promise.resolve(patchResponse())
        : Promise.resolve(previewResponse()),
    );
    render(
      <PublishFlowContainer workspaceId="ws-1" familyName="فرع بني تميم" onClose={vi.fn()} />,
    );
    await walkToPublish('فرع بني تميم');

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
    });
    const patchCall = mockApiFetch.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    const body = JSON.parse(patchCall[1].body);
    expect(body.treeId).toBeUndefined();
  });

  // Regression: the editor top bar always passes the WORKSPACE name as
  // `familyName`, but the server validates the typed phrase against the ACTIVE
  // tree's `tree.nameAr || workspace.nameAr`. For an extra tree opened in the
  // editor those differ, so driving the confirm phrase from the prop made
  // publishing impossible (400 «عبارة التأكيد غير صحيحة»). The container must
  // drive the type-to-confirm + the sent phrase from `preview.confirmationPhrase`
  // (the server's source of truth), never the prop.
  test('uses the server confirmation phrase (preview), not the familyName prop', async () => {
    const SERVER_PHRASE = 'شجرة الفرع'; // = tree.nameAr || workspace.nameAr
    const PROP_NAME = 'اسم المساحة'; // workspace name the editor passes
    mockApiFetch.mockImplementation((_url: string, opts?: { method?: string }) =>
      opts?.method === 'PATCH'
        ? Promise.resolve(patchResponse())
        : Promise.resolve({
            ok: true,
            json: async () => ({ ...PREVIEW, confirmationPhrase: SERVER_PHRASE }),
          }),
    );
    render(
      <PublishFlowContainer
        workspaceId="ws-1"
        treeId="extra-9"
        familyName={PROP_NAME}
        onClose={vi.fn()}
      />,
    );
    // The type-to-confirm field is keyed off the SERVER phrase, not the prop.
    await walkToPublish(SERVER_PHRASE);

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
    });
    const patchCall = mockApiFetch.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(JSON.parse(patchCall[1].body).confirmationPhrase).toBe(SERVER_PHRASE);
  });
});
