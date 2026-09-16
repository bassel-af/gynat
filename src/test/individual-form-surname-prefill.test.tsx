import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IndividualForm } from '@/components/tree/IndividualForm/IndividualForm';

const baseProps = {
  mode: 'create' as const,
  onSubmit: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
};

function surnameInput() {
  return screen.getByLabelText('اسم العائلة') as HTMLInputElement;
}

describe('IndividualForm surname prefill', () => {
  it('seeds the surname field from initialData and keeps it editable', () => {
    render(<IndividualForm {...baseProps} initialData={{ surname: 'شربك' }} />);

    const input = surnameInput();
    expect(input.value).toBe('شربك');

    fireEvent.change(input, { target: { value: '' } });
    expect(surnameInput().value).toBe('');
  });

  it('clears the untouched prefill when أنثى is chosen and restores it on ذكر', () => {
    render(
      <IndividualForm
        {...baseProps}
        relationshipType="parent"
        initialData={{ surname: 'شربك' }}
      />,
    );

    expect(surnameInput().value).toBe('شربك');

    fireEvent.click(screen.getByLabelText('أنثى'));
    expect(surnameInput().value).toBe('');

    fireEvent.click(screen.getByLabelText('ذكر'));
    expect(surnameInput().value).toBe('شربك');
  });

  it('leaves a hand-typed surname untouched across the sex toggle', () => {
    render(
      <IndividualForm
        {...baseProps}
        relationshipType="parent"
        initialData={{ surname: 'شربك' }}
      />,
    );

    fireEvent.change(surnameInput(), { target: { value: 'الدلاتي' } });

    fireEvent.click(screen.getByLabelText('أنثى'));
    expect(surnameInput().value).toBe('الدلاتي');

    fireEvent.click(screen.getByLabelText('ذكر'));
    expect(surnameInput().value).toBe('الدلاتي');
  });
});
