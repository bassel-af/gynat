import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ToastContainer } from '@/components/ui/Toast';

describe('ToastContainer a11y', () => {
  it('sets role="status", aria-live="polite", aria-atomic="true" on the container', () => {
    const { container } = render(
      <ToastContainer toasts={[{ id: 'a', message: 'hello', variant: 'info' }]} />,
    );
    const root = container.querySelector('div');
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute('role', 'status');
    expect(root).toHaveAttribute('aria-live', 'polite');
    expect(root).toHaveAttribute('aria-atomic', 'true');
  });
});
