import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourceLightbox } from '@/components/sources/SourceLightbox';
import { Modal } from '@/components/ui/Modal';

const A = { id: 'a', mimeType: 'image/jpeg' as const, sizeBytes: 1, fileName: 'a.jpg' };
const B = { id: 'b', mimeType: 'image/png' as const, sizeBytes: 1, fileName: 'b.png' };
const P = { id: 'p', mimeType: 'application/pdf' as const, sizeBytes: 1, fileName: 'deed.pdf' };
const urls = { a: 'blob:a', b: 'blob:b' };

function open(startIndex = 0) {
  const onClose = vi.fn();
  const onDownload = vi.fn();
  render(
    <SourceLightbox files={[A, B, P]} urls={urls} startIndex={startIndex} onClose={onClose} onDownload={onDownload} />,
  );
  return { onClose, onDownload };
}

describe('SourceLightbox', () => {
  it('shows the chosen image with an Arabic counter', () => {
    open(1);
    expect(screen.getByRole('img', { name: 'b.png' })).toHaveAttribute('src', 'blob:b');
    expect(screen.getByText('٢ / ٣')).toBeInTheDocument();
  });

  it('moves with next / previous buttons', () => {
    open(0);
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('٢ / ٣')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(screen.getByText('١ / ٣')).toBeInTheDocument();
  });

  it('follows RTL arrow keys (left = next)', () => {
    open(0);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByText('٢ / ٣')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByText('١ / ٣')).toBeInTheDocument();
  });

  it('closes on Escape and on the close button', () => {
    const { onClose } = open(0);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('never shows a PDF inline — it offers a download', () => {
    const { onDownload } = open(2);
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('iframe, embed, object')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /تنزيل الملف/ }));
    expect(onDownload).toHaveBeenCalledWith(P);
  });

  it('keeps focus inside the dialog', () => {
    open(0);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    const buttons = dialog.querySelectorAll('button');
    (buttons[buttons.length - 1] as HTMLElement).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('opened over a modal, Esc closes only the viewer and the body stays locked', () => {
    const onCloseModal = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal isOpen onClose={onCloseModal} title="نموذج">
        <span />
      </Modal>,
    );
    rerender(
      <Modal isOpen onClose={onCloseModal} title="نموذج">
        <SourceLightbox files={[A]} urls={urls} startIndex={0} onClose={onClose} onDownload={vi.fn()} />
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCloseModal).not.toHaveBeenCalled();
    rerender(
      <Modal isOpen onClose={onCloseModal} title="نموذج">
        <span />
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
  });
});
