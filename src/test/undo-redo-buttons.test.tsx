import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UndoRedoButtons } from '@/components/tree/UndoRedoButtons/UndoRedoButtons';

describe('UndoRedoButtons', () => {
  it('renders two buttons with Arabic aria-labels', () => {
    render(
      <UndoRedoButtons
        canUndo={true}
        canRedo={true}
        isInFlight={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'تراجع' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة' })).toBeInTheDocument();
  });

  it('disables the undo button when canUndo is false', () => {
    render(
      <UndoRedoButtons
        canUndo={false}
        canRedo={true}
        isInFlight={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'تراجع' })).toBeDisabled();
  });

  it('disables the redo button when canRedo is false', () => {
    render(
      <UndoRedoButtons
        canUndo={true}
        canRedo={false}
        isInFlight={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'إعادة' })).toBeDisabled();
  });

  it('disables BOTH buttons when isInFlight is true', () => {
    render(
      <UndoRedoButtons
        canUndo={true}
        canRedo={true}
        isInFlight={true}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'تراجع' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'إعادة' })).toBeDisabled();
  });

  it('sets aria-busy when in flight', () => {
    render(
      <UndoRedoButtons
        canUndo={true}
        canRedo={true}
        isInFlight={true}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'تراجع' })).toHaveAttribute('aria-busy', 'true');
  });

  it('fires onUndo when undo button clicked', () => {
    const onUndo = vi.fn();
    render(
      <UndoRedoButtons
        canUndo={true}
        canRedo={false}
        isInFlight={false}
        onUndo={onUndo}
        onRedo={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'تراجع' }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('fires onRedo when redo button clicked', () => {
    const onRedo = vi.fn();
    render(
      <UndoRedoButtons
        canUndo={false}
        canRedo={true}
        isInFlight={false}
        onUndo={vi.fn()}
        onRedo={onRedo}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'إعادة' }));
    expect(onRedo).toHaveBeenCalledOnce();
  });

  it('sets aria-keyshortcuts for both buttons', () => {
    render(
      <UndoRedoButtons
        canUndo={true}
        canRedo={true}
        isInFlight={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'تراجع' }))
      .toHaveAttribute('aria-keyshortcuts', 'Control+Z');
    expect(screen.getByRole('button', { name: 'إعادة' }))
      .toHaveAttribute('aria-keyshortcuts', 'Control+Shift+Z');
  });
});
