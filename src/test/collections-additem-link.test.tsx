import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// AddItemFlow "via link" tab (Slice B). The login-only add-item modal's second
// origin tab — paste a public link / share token, pick linked vs copied, give
// it a title — POSTs the by-link body the server (Slice A) resolves. These
// tests pin the POST shape + the error surfacing so a regression (a dropped
// linkInput, a wrong linkMode, a swallowed INVALID_TOKEN_ERROR) fails loudly.
//
// Partial-mock @/lib/collections/api so the real helpers/constants stay intact
// while the network calls are stubbed.
// ---------------------------------------------------------------------------

const mockAddItem = vi.fn();
const mockListExtraTrees = vi.fn();
const mockListCollections = vi.fn();

vi.mock('@/lib/collections/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/collections/api')>(
    '@/lib/collections/api',
  );
  return {
    ...actual,
    addItem: (...a: unknown[]) => mockAddItem(...a),
    listExtraTrees: (...a: unknown[]) => mockListExtraTrees(...a),
    listCollections: (...a: unknown[]) => mockListCollections(...a),
  };
});

import { AddItemFlow } from '@/components/collections/AddItemFlow/AddItemFlow';

const onAdded = vi.fn();
const onClose = vi.fn();

function renderFlow() {
  return render(
    <AddItemFlow
      workspaceId="ws-1"
      workspaceName="آل السعيد"
      collectionId="col-1"
      currentCollectionId="col-1"
      existingItems={[]}
      onClose={onClose}
      onAdded={onAdded}
    />,
  );
}

// Drive the link path: switch to the link tab, paste, continue, pick a mode,
// continue, fill the title, submit.
async function driveLinkFlow(opts: { link: string; mode: 'linked' | 'copied'; title: string }) {
  fireEvent.click(await screen.findByRole('tab', { name: /عبر رابط/ }));
  fireEvent.change(screen.getByLabelText('الرابط أو رمز المشاركة'), {
    target: { value: opts.link },
  });
  // First متابعة → mode step.
  fireEvent.click(screen.getByRole('button', { name: 'متابعة' }));
  if (opts.mode === 'copied') {
    fireEvent.click(await screen.findByRole('radio', { name: /نسخة مثبّتة/ }));
  }
  // Second متابعة → details step.
  fireEvent.click(screen.getByRole('button', { name: 'متابعة' }));
  fireEvent.change(await screen.findByPlaceholderText('عنوان يظهر داخل المجموعة'), {
    target: { value: opts.title },
  });
  fireEvent.click(screen.getByRole('button', { name: 'إضافة' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListExtraTrees.mockResolvedValue([]);
  mockListCollections.mockResolvedValue([]);
  mockAddItem.mockResolvedValue({ id: 'item-9' });
});

describe('AddItemFlow — via link tab', () => {
  test('POSTs a by-link body with linkInput + chosen linkMode + title', async () => {
    renderFlow();
    await driveLinkFlow({ link: 'https://example.test/family/abc', mode: 'linked', title: 'فرع مستعار' });

    await waitFor(() => expect(mockAddItem).toHaveBeenCalledTimes(1));
    const [, , body] = mockAddItem.mock.calls[0];
    expect(body).toMatchObject({
      kind: 'tree',
      linkInput: 'https://example.test/family/abc',
      linkMode: 'linked',
      titleAr: 'فرع مستعار',
    });
    // It must NOT send a local treeId for a by-link source.
    expect(body.treeId).toBeUndefined();
  });

  test('carries the chosen "copied" linkMode through to the POST', async () => {
    renderFlow();
    await driveLinkFlow({ link: 'TOKEN-XYZ', mode: 'copied', title: 'نسخة مثبتة' });

    await waitFor(() => expect(mockAddItem).toHaveBeenCalledTimes(1));
    expect(mockAddItem.mock.calls[0][2]).toMatchObject({
      linkInput: 'TOKEN-XYZ',
      linkMode: 'copied',
    });
  });

  test('surfaces the server INVALID_TOKEN_ERROR instead of closing', async () => {
    mockAddItem.mockRejectedValue(new Error('رابط غير صالح'));
    renderFlow();
    await driveLinkFlow({ link: 'bad-link', mode: 'linked', title: 'محاولة' });

    expect(await screen.findByText('رابط غير صالح')).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();
  });
});
