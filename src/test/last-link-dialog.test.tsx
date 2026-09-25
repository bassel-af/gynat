/**
 * Sources («المصادر») — removing a source's LAST person: `LastLinkDialog`
 * and the `useSourceUnlink` hook that asks it when the server answers
 * «هذا آخر شخص لهذا المصدر» (409 last_link).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';

const api = { patchSource: vi.fn() };
vi.mock('@/lib/tree/source-entries-api', async () => {
  class LastLinkError extends Error {
    constructor() {
      super('last_link');
    }
  }
  return { LastLinkError, patchSource: (...a: unknown[]) => api.patchSource(...a) };
});
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

import { LastLinkError } from '@/lib/tree/source-entries-api';
import { LastLinkDialog } from '@/components/sources/LastLinkDialog';
import { useSourceUnlink, type UnlinkResult } from '@/hooks/useSourceUnlink';

const TITLE = 'هذا آخر شخص لهذا المصدر';

describe('LastLinkDialog', () => {
  function renderDialog() {
    const handlers = { onDelete: vi.fn(), onKeep: vi.fn(), onCancel: vi.fn() };
    render(<LastLinkDialog {...handlers} />);
    return handlers;
  }

  it('asks what to do with the source and its files', () => {
    const h = renderDialog();
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
    expect(screen.getByText('ماذا تريد أن تفعل بالمصدر وملفاته؟')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'حذف المصدر وملفاته' }));
    expect(h.onDelete).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'إبقاؤه في صفحة المصادر' }));
    expect(h.onKeep).toHaveBeenCalled();
  });

  it('✕ and Escape cancel', () => {
    const h = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(h.onCancel).toHaveBeenCalledTimes(2);
    expect(h.onDelete).not.toHaveBeenCalled();
    expect(h.onKeep).not.toHaveBeenCalled();
  });
});

function Harness({ onResult }: { onResult: (r: UnlinkResult) => void }) {
  const { unlink, dialog } = useSourceUnlink({ workspaceId: 'ws', treeId: 'T' });
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void unlink('S1', ['P1']).then(onResult).finally(() => setBusy(false));
        }}
      >
        إزالة
      </button>
      {dialog}
    </>
  );
}

describe('useSourceUnlink', () => {
  beforeEach(() => api.patchSource.mockReset());

  it('removes a person who is not the last one without asking', async () => {
    api.patchSource.mockResolvedValue({ id: 'S1', peopleCount: 2 });
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: 'إزالة' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ outcome: 'unlinked', source: { id: 'S1', peopleCount: 2 } }));
    expect(api.patchSource).toHaveBeenCalledWith('ws', 'S1', { removePersonIds: ['P1'] }, 'T');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks on the last person; «إبقاؤه» keeps the source with nobody', async () => {
    api.patchSource.mockRejectedValueOnce(new LastLinkError()).mockResolvedValueOnce({ id: 'S1', peopleCount: 0 });
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: 'إزالة' }));
    fireEvent.click(await screen.findByRole('button', { name: 'إبقاؤه في صفحة المصادر' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ outcome: 'kept', source: { id: 'S1', peopleCount: 0 } }));
    expect(api.patchSource).toHaveBeenLastCalledWith('ws', 'S1', { removePersonIds: ['P1'], onLastLink: 'keep' }, 'T');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('«حذف المصدر وملفاته» deletes it', async () => {
    api.patchSource.mockRejectedValueOnce(new LastLinkError()).mockResolvedValueOnce(null);
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: 'إزالة' }));
    fireEvent.click(await screen.findByRole('button', { name: 'حذف المصدر وملفاته' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ outcome: 'deleted' }));
    expect(api.patchSource).toHaveBeenLastCalledWith('ws', 'S1', { removePersonIds: ['P1'], onLastLink: 'delete' }, 'T');
  });

  it('cancelling changes nothing', async () => {
    api.patchSource.mockRejectedValueOnce(new LastLinkError());
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: 'إزالة' }));
    await screen.findByRole('dialog', { name: TITLE });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ outcome: 'cancelled' }));
    expect(api.patchSource).toHaveBeenCalledTimes(1);
  });
});
