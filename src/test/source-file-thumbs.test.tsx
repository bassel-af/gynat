import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockFetchBlob = vi.fn();
vi.mock('@/lib/tree/source-entries-api', () => ({
  fetchSourceFileBlob: (...a: unknown[]) => mockFetchBlob(...a),
}));

import { SourceFileThumbs } from '@/components/sources/SourceFileThumbs';

const IMG = { id: 'f-img', mimeType: 'image/jpeg' as const, sizeBytes: 10, fileName: 'scan.jpg' };
const PDF = { id: 'f-pdf', mimeType: 'application/pdf' as const, sizeBytes: 10, fileName: 'deed.pdf' };

let created: string[];
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

beforeEach(() => {
  created = [];
  mockFetchBlob.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
  createObjectURL.mockReset().mockImplementation(() => {
    const url = `blob:mock/${created.length}`;
    created.push(url);
    return url;
  });
  revokeObjectURL.mockReset();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SourceFileThumbs', () => {
  it('shows images through authenticated object URLs and PDFs as a tile', async () => {
    render(<SourceFileThumbs workspaceId="ws" treeId="t" entryId="e1" files={[IMG, PDF]} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'scan.jpg' })).toHaveAttribute('src', 'blob:mock/0'));
    expect(mockFetchBlob).toHaveBeenCalledTimes(1);
    expect(mockFetchBlob).toHaveBeenCalledWith('ws', 'e1', 'f-img', 't');
    expect(screen.getByRole('button', { name: /deed\.pdf/ })).toBeInTheDocument();
  });

  it('revokes its object URLs on unmount', async () => {
    const { unmount } = render(
      <SourceFileThumbs workspaceId="ws" entryId="e1" files={[IMG]} onOpen={vi.fn()} />,
    );
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/0');
  });

  it('opens the viewer at the tapped file', async () => {
    const onOpen = vi.fn();
    render(<SourceFileThumbs workspaceId="ws" entryId="e1" files={[IMG, PDF]} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /deed\.pdf/ }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });
});
