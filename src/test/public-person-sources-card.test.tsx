/**
 * Sources («المصادر») step 7 — the read-only public card (public person page
 * and the public tree viewer's person panel). Anonymous: plain fetch, no
 * Bearer token, and thumbnails point straight at the public file routes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

import { PublicPersonSourcesCard } from '@/components/sources/PublicPersonSourcesCard';

const P = 'cccccccc-0000-4000-8000-000000000001';
const img = (id: string) => ({ id, mimeType: 'image/jpeg', sizeBytes: 10, fileName: `${id}.jpg` });
const pdf = (id: string) => ({ id, mimeType: 'application/pdf', sizeBytes: 10, fileName: `${id}.pdf` });

const fetchMock = vi.fn();

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  fetchMock.mockReset();
  mockApiFetch.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('PublicPersonSourcesCard', () => {
  it('fetches the anonymous public route (never the member API) with no credentials', async () => {
    respond(200, { data: { entries: [{ id: 'e1', text: 'طبقات', files: [] }], inherited: null } });
    render(<PublicPersonSourcesCard slug="abc" individualId={P} />);
    await screen.findByText('طبقات');
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/family/abc/person/${P}/sources`,
      expect.objectContaining({ credentials: 'omit', cache: 'no-store' }),
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('numbers entries and lists the inherited tree-wide entry last', async () => {
    respond(200, {
      data: {
        entries: [{ id: 'e1', text: 'طبقات ابن سعد', files: [] }, { id: 'e2', text: 'سجل', files: [] }],
        inherited: { id: 't', text: 'كتاب العائلة', files: [] },
      },
    });
    render(<PublicPersonSourcesCard slug="abc" individualId={P} />);
    const items = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('١');
    expect(items[2]).toHaveTextContent('كتاب العائلة');
    expect(items[2]).toHaveTextContent('من مصدر الشجرة');
  });

  it('image thumbnails load straight from the public file routes (person + tree-wide)', async () => {
    respond(200, {
      data: {
        entries: [{ id: 'e1', text: null, files: [img('f1'), pdf('f2')] }],
        inherited: null,
      },
    });
    const { unmount } = render(<PublicPersonSourcesCard slug="abc" individualId={P} />);
    const image = await screen.findByAltText('f1.jpg');
    expect(image).toHaveAttribute('src', `/api/family/abc/person/${P}/sources/e1/files/f1`);
    unmount();

    respond(200, { data: { entries: [], inherited: { id: 't', text: 'x', files: [img('tf')] } } });
    render(<PublicPersonSourcesCard slug="abc" individualId={P} />);
    expect(await screen.findByAltText('tf.jpg')).toHaveAttribute(
      'src',
      '/api/family/abc/sources/tree-entry/files/tf',
    );
  });

  it('tapping a thumbnail opens the viewer on that image', async () => {
    respond(200, { data: { entries: [{ id: 'e1', text: null, files: [img('f1')] }], inherited: null } });
    render(<PublicPersonSourcesCard slug="abc" individualId={P} />);
    fireEvent.click((await screen.findByAltText('f1.jpg')).closest('button')!);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('renders nothing when there are no public entries', async () => {
    respond(200, { data: { entries: [], inherited: null } });
    const { container } = render(<PublicPersonSourcesCard slug="abc" individualId={P} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on the 404 (hidden person) and on a network error', async () => {
    respond(404, { error: 'Not found' });
    const first = render(<PublicPersonSourcesCard slug="abc" individualId={P} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();

    fetchMock.mockRejectedValue(new Error('offline'));
    const second = render(<PublicPersonSourcesCard slug="abc" individualId={P} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });
});
