import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FamilyEventForm } from '@/components/tree/FamilyEventForm/FamilyEventForm';
import { IndividualForm } from '@/components/tree/IndividualForm/IndividualForm';

// ============================================================================
// FamilyEventForm — isUmmWalad behavior
// ============================================================================
describe('FamilyEventForm with isUmmWalad', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onClose: vi.fn(),
  };

  it('hides marriage contract and wedding sections when isUmmWalad is true', () => {
    render(
      <FamilyEventForm
        {...defaultProps}
        isUmmWalad
      />,
    );
    // Marriage contract and wedding sections should not be rendered
    expect(screen.queryByText('عقد القران')).not.toBeInTheDocument();
    expect(screen.queryByText('حفل الزفاف')).not.toBeInTheDocument();
    // Divorce section should also be hidden (no marriage to dissolve for umm walad)
    expect(screen.queryByText('الانفصال')).not.toBeInTheDocument();
  });

  it('shows all sections when isUmmWalad is false', () => {
    render(
      <FamilyEventForm
        {...defaultProps}
        isUmmWalad={false}
      />,
    );
    expect(screen.getByText('عقد القران')).toBeInTheDocument();
    expect(screen.getByText('حفل الزفاف')).toBeInTheDocument();
    expect(screen.getByText('الانفصال')).toBeInTheDocument();
  });

  it('shows all sections when isUmmWalad is not provided', () => {
    render(<FamilyEventForm {...defaultProps} />);
    expect(screen.getByText('عقد القران')).toBeInTheDocument();
    expect(screen.getByText('حفل الزفاف')).toBeInTheDocument();
    expect(screen.getByText('الانفصال')).toBeInTheDocument();
  });
});

// ============================================================================
// FamilyEventForm — enableUmmWalad checkbox visibility
// ============================================================================
describe('FamilyEventForm enableUmmWalad checkbox', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onClose: vi.fn(),
  };

  it('shows umm walad checkbox when enableUmmWalad is true', () => {
    render(
      <FamilyEventForm
        {...defaultProps}
        enableUmmWalad
      />,
    );
    expect(screen.getByLabelText('أم ولد')).toBeInTheDocument();
  });

  it('does not show umm walad checkbox when enableUmmWalad is false', () => {
    render(
      <FamilyEventForm
        {...defaultProps}
        enableUmmWalad={false}
      />,
    );
    expect(screen.queryByLabelText('أم ولد')).not.toBeInTheDocument();
  });

  it('does not show umm walad checkbox when enableUmmWalad is not provided', () => {
    render(
      <FamilyEventForm {...defaultProps} />,
    );
    expect(screen.queryByLabelText('أم ولد')).not.toBeInTheDocument();
  });

  it('shows umm walad checkbox checked when initialData has isUmmWalad true', () => {
    render(
      <FamilyEventForm
        {...defaultProps}
        enableUmmWalad
        initialData={{ isUmmWalad: true }}
      />,
    );
    const checkbox = screen.getByLabelText('أم ولد') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('shows umm walad checkbox unchecked when initialData has isUmmWalad false', () => {
    render(
      <FamilyEventForm
        {...defaultProps}
        enableUmmWalad
        initialData={{ isUmmWalad: false }}
      />,
    );
    const checkbox = screen.getByLabelText('أم ولد') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });
});

// ============================================================================
// IndividualForm — isUmmWalad checkbox in addSpouse mode
// ============================================================================
describe('IndividualForm umm walad checkbox in addSpouse mode', () => {
  const defaultProps = {
    mode: 'create' as const,
    onSubmit: vi.fn(),
    onClose: vi.fn(),
  };

  it('shows umm walad checkbox when enableUmmWalad is true and mode is addSpouse', () => {
    render(
      <IndividualForm
        {...defaultProps}
        enableUmmWalad
        isAddSpouse
      />,
    );
    expect(screen.getByLabelText('أم ولد')).toBeInTheDocument();
  });

  it('does not show umm walad checkbox when enableUmmWalad is false', () => {
    render(
      <IndividualForm
        {...defaultProps}
        enableUmmWalad={false}
        isAddSpouse
      />,
    );
    expect(screen.queryByLabelText('أم ولد')).not.toBeInTheDocument();
  });

  it('does not show umm walad checkbox when not addSpouse mode', () => {
    render(
      <IndividualForm
        {...defaultProps}
        enableUmmWalad
      />,
    );
    expect(screen.queryByLabelText('أم ولد')).not.toBeInTheDocument();
  });

  it('does not show umm walad checkbox in edit mode', () => {
    render(
      <IndividualForm
        {...defaultProps}
        mode="edit"
        enableUmmWalad
        isAddSpouse
      />,
    );
    expect(screen.queryByLabelText('أم ولد')).not.toBeInTheDocument();
  });
});
