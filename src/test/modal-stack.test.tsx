/**
 * ui/Modal — the single-modal behaviour every screen relies on (regression),
 * plus the modal STACK used when a form opens a second form on top of it
 * (sources inside the person edit form): only the top modal answers Esc and
 * backdrop clicks, the body stays scroll-locked until the last one closes,
 * and a stacked modal traps Tab and gives focus back to its opener.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';

afterEach(() => {
  document.body.style.overflow = '';
});

const overlayOf = (dialog: HTMLElement) => dialog.parentElement as HTMLElement;

describe('Modal — single modal (regression)', () => {
  it('Esc calls onClose', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="أ">محتوى</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a backdrop click calls onClose; a click inside does not', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="أ">محتوى</Modal>);
    fireEvent.click(screen.getByText('محتوى'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(overlayOf(screen.getByRole('dialog')));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed and ignores Esc', () => {
    const onClose = vi.fn();
    render(<Modal isOpen={false} onClose={onClose} title="أ">محتوى</Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks body scroll while open and restores the previous value on close', () => {
    document.body.style.overflow = 'auto';
    const { rerender } = render(<Modal isOpen onClose={() => {}} title="أ">x</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Modal isOpen={false} onClose={() => {}} title="أ">x</Modal>);
    expect(document.body.style.overflow).toBe('auto');
  });
});

function Stack({ onCloseBottom, onCloseTop }: { onCloseBottom: () => void; onCloseTop: () => void }) {
  const [topOpen, setTopOpen] = useState(false);
  return (
    <Modal isOpen onClose={onCloseBottom} title="الأسفل">
      <button type="button" onClick={() => setTopOpen(true)}>
        افتح
      </button>
      {topOpen && (
        <Modal
          isOpen
          stacked
          onClose={() => {
            onCloseTop();
            setTopOpen(false);
          }}
          title="الأعلى"
        >
          <textarea aria-label="النص" />
          <button type="button">زر</button>
        </Modal>
      )}
    </Modal>
  );
}

describe('Modal — stacked', () => {
  it('Esc closes only the top modal', () => {
    const onCloseBottom = vi.fn();
    const onCloseTop = vi.fn();
    render(<Stack onCloseBottom={onCloseBottom} onCloseTop={onCloseTop} />);
    fireEvent.click(screen.getByRole('button', { name: 'افتح' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseTop).toHaveBeenCalledTimes(1);
    expect(onCloseBottom).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'الأعلى' })).toBeNull();
    // With the top gone, Esc reaches the bottom one again.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseBottom).toHaveBeenCalledTimes(1);
  });

  it('a click on the lower backdrop does nothing while a modal sits on top', () => {
    const onCloseBottom = vi.fn();
    render(<Stack onCloseBottom={onCloseBottom} onCloseTop={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'افتح' }));
    fireEvent.click(overlayOf(screen.getByRole('dialog', { name: 'الأسفل' })));
    expect(onCloseBottom).not.toHaveBeenCalled();
  });

  it('the top backdrop closes only the top modal', () => {
    const onCloseBottom = vi.fn();
    const onCloseTop = vi.fn();
    render(<Stack onCloseBottom={onCloseBottom} onCloseTop={onCloseTop} />);
    fireEvent.click(screen.getByRole('button', { name: 'افتح' }));
    fireEvent.click(overlayOf(screen.getByRole('dialog', { name: 'الأعلى' })));
    expect(onCloseTop).toHaveBeenCalledTimes(1);
    expect(onCloseBottom).not.toHaveBeenCalled();
  });

  it('keeps the body scroll-locked until the last modal closes', () => {
    document.body.style.overflow = '';
    const { unmount } = render(<Stack onCloseBottom={() => {}} onCloseTop={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'افتح' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('sits above the lower modal', () => {
    render(<Stack onCloseBottom={() => {}} onCloseTop={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'افتح' }));
    const top = overlayOf(screen.getByRole('dialog', { name: 'الأعلى' }));
    expect(top.getAttribute('data-stacked')).toBe('true');
  });

  it('returns focus to the button that opened it', () => {
    render(<Stack onCloseBottom={() => {}} onCloseTop={() => {}} />);
    const opener = screen.getByRole('button', { name: 'افتح' });
    opener.focus();
    fireEvent.click(opener);
    act(() => screen.getByLabelText('النص').focus());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
  });

  it('traps Tab inside the top modal', () => {
    render(<Stack onCloseBottom={() => {}} onCloseTop={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'افتح' }));
    const last = screen.getByRole('button', { name: 'زر' });
    const first = screen.getByLabelText('النص');
    act(() => last.focus());
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
