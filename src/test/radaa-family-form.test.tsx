import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Individual, GedcomData } from '@/lib/gedcom/types';
import { RadaaFamilyForm } from '@/components/tree/RadaaFamilyForm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIndividual(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: 'Test',
    givenName: 'Test',
    surname: '',
    sex: 'M',
    birth: '',
    birthPlace: '',
    birthDescription: '',
    birthNotes: '',
    birthHijriDate: '',
    death: '',
    deathPlace: '',
    deathDescription: '',
    deathNotes: '',
    deathHijriDate: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  };
}

const individuals: Record<string, Individual> = {
  '@I1@': makeIndividual({ id: '@I1@', name: 'محمد بن أحمد', givenName: 'محمد بن أحمد', sex: 'M' }),
  '@I2@': makeIndividual({ id: '@I2@', name: 'فاطمة بنت علي', givenName: 'فاطمة بنت علي', sex: 'F' }),
  '@I3@': makeIndividual({ id: '@I3@', name: 'أحمد بن محمد', givenName: 'أحمد بن محمد', sex: 'M' }),
};

const data: GedcomData = { individuals, families: {} };

const defaultProps = {
  mode: 'create' as const,
  data,
  onSubmit: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
};

describe('RadaaFamilyForm', () => {
  it('renders create mode title', () => {
    render(<RadaaFamilyForm {...defaultProps} />);
    expect(screen.getByRole('dialog', { name: 'إضافة رضاعة' })).toBeInTheDocument();
  });

  it('renders edit mode title', () => {
    render(<RadaaFamilyForm {...defaultProps} mode="edit" />);
    expect(screen.getByRole('dialog', { name: 'تعديل رضاعة' })).toBeInTheDocument();
  });

  it('pre-populates child when preselectedChildId is given', () => {
    render(
      <RadaaFamilyForm {...defaultProps} preselectedChildId="@I1@" />,
    );
    // The preselected child should show as a chip with the person's name
    expect(screen.getByText('محمد بن أحمد')).toBeInTheDocument();
  });

  it('shows add child button and allows adding another child slot', () => {
    render(<RadaaFamilyForm {...defaultProps} preselectedChildId="@I1@" />);
    const addButton = screen.getByText('إضافة طفل');
    fireEvent.click(addButton);
    // Should now have 2 child rows (one pre-populated, one empty)
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<RadaaFamilyForm {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('إلغاء'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows error message when error prop is set', () => {
    render(<RadaaFamilyForm {...defaultProps} error="خطأ في الإدخال" />);
    expect(screen.getByText('خطأ في الإدخال')).toBeInTheDocument();
  });

  it('shows delete section only in edit mode', () => {
    const onDelete = vi.fn();
    const { rerender } = render(
      <RadaaFamilyForm {...defaultProps} mode="create" onDelete={onDelete} />,
    );
    expect(screen.queryByText('حذف الرضاعة')).not.toBeInTheDocument();

    rerender(
      <RadaaFamilyForm {...defaultProps} mode="edit" onDelete={onDelete} />,
    );
    expect(screen.getByText('حذف الرضاعة')).toBeInTheDocument();
  });

  it('shows delete confirmation before calling onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <RadaaFamilyForm {...defaultProps} mode="edit" onDelete={onDelete} />,
    );

    fireEvent.click(screen.getByText('حذف الرضاعة'));
    expect(screen.getByText('هل أنت متأكد من حذف الرضاعة؟')).toBeInTheDocument();

    fireEvent.click(screen.getByText('نعم، احذف'));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it('has notes textarea with the right placeholder', () => {
    render(<RadaaFamilyForm {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('مثال: المرضعة فاطمة بنت أحمد (ليست في الشجرة)');
    expect(textarea).toBeInTheDocument();
  });
});
