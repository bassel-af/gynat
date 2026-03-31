import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Individual, GedcomData } from '@/lib/gedcom/types';
import { IndividualPicker } from '@/components/ui/IndividualPicker';

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
  '@I1@': makeIndividual({ id: '@I1@', name: 'محمد بن أحمد', givenName: 'محمد بن أحمد', sex: 'M', birth: '1950' }),
  '@I2@': makeIndividual({ id: '@I2@', name: 'فاطمة بنت علي', givenName: 'فاطمة بنت علي', sex: 'F', birth: '1960' }),
  '@I3@': makeIndividual({ id: '@I3@', name: 'أحمد بن محمد', givenName: 'أحمد بن محمد', sex: 'M', birth: '1980' }),
  '@I4@': makeIndividual({ id: '@I4@', name: 'خاص', givenName: 'خاص', sex: 'M', isPrivate: true }),
};

const data: GedcomData = { individuals, families: {} };

const defaultProps = {
  value: null,
  onChange: vi.fn(),
  data,
  label: 'اختر شخص',
};

describe('IndividualPicker', () => {
  it('renders label and search input when no value selected', () => {
    render(<IndividualPicker {...defaultProps} />);
    expect(screen.getByLabelText('اختر شخص')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows matching results when user types a query', () => {
    render(<IndividualPicker {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'محمد' } });

    // Should match "محمد بن أحمد" and "أحمد بن محمد"
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(2);
  });

  it('excludes private individuals from results', () => {
    render(<IndividualPicker {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'خاص' } });

    expect(screen.getByText('لا توجد نتائج')).toBeInTheDocument();
  });

  it('excludes IDs in the exclude prop', () => {
    render(
      <IndividualPicker {...defaultProps} exclude={new Set(['@I1@'])} />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'محمد' } });

    // Only "أحمد بن محمد" should show, not "محمد بن أحمد"
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(1);
    expect(screen.getByText('أحمد بن محمد')).toBeInTheDocument();
  });

  it('calls onChange when selecting a person', () => {
    const onChange = vi.fn();
    render(<IndividualPicker {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'فاطمة' } });

    const option = screen.getByRole('option');
    fireEvent.mouseDown(option);

    expect(onChange).toHaveBeenCalledWith('@I2@');
  });

  it('shows selected person chip when value is set', () => {
    render(<IndividualPicker {...defaultProps} value="@I1@" />);

    // Should show chip, not input
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('محمد بن أحمد')).toBeInTheDocument();
    expect(screen.getByText('1950')).toBeInTheDocument();
  });

  it('clears selection when clear button is clicked', () => {
    const onChange = vi.fn();
    render(
      <IndividualPicker {...defaultProps} value="@I1@" onChange={onChange} />,
    );

    const clearButton = screen.getByLabelText('مسح');
    fireEvent.click(clearButton);

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('selects highlighted person on Enter key', () => {
    const onChange = vi.fn();
    render(<IndividualPicker {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'فاطمة' } });

    // Arrow down to highlight first result, then Enter
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('@I2@');
  });

  it('closes dropdown on Escape', () => {
    render(<IndividualPicker {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'أحمد' } });

    // Dropdown should be open
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);

    fireEvent.keyDown(input, { key: 'Escape' });

    // Dropdown should be closed
    expect(screen.queryAllByRole('option').length).toBe(0);
  });

  it('shows no results message for non-matching query', () => {
    render(<IndividualPicker {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzzzz' } });

    expect(screen.getByText('لا توجد نتائج')).toBeInTheDocument();
  });

  it('shows birth year from hijri date when gregorian is empty', () => {
    const individuals2: Record<string, Individual> = {
      '@I5@': makeIndividual({
        id: '@I5@',
        name: 'عبدالله',
        givenName: 'عبدالله',
        birth: '',
        birthHijriDate: '1400',
      }),
    };
    render(
      <IndividualPicker
        {...defaultProps}
        value="@I5@"
        data={{ individuals: individuals2, families: {} }}
      />,
    );
    expect(screen.getByText('1400')).toBeInTheDocument();
  });
});
