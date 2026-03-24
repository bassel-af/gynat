import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock the apiFetch module
// ---------------------------------------------------------------------------

const mockApiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { PlaceComboBox } from '@/components/ui/PlaceComboBox';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  id: 'birthPlace',
  label: 'مكان الميلاد',
  value: '',
  onChange: vi.fn(),
  workspaceId: 'ws-uuid-1',
  placeholder: 'مثال: مكة المكرمة',
};

function mockSearchResults(data: unknown[]) {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data }),
  });
}

function mockEmptyResults() {
  mockSearchResults([]);
}

describe('PlaceComboBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Rendering basics
  // -------------------------------------------------------------------------

  it('renders a label and input', () => {
    render(<PlaceComboBox {...defaultProps} />);
    expect(screen.getByLabelText('مكان الميلاد')).toBeInTheDocument();
  });

  it('renders with placeholder text', () => {
    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('placeholder', 'مثال: مكة المكرمة');
  });

  it('renders disabled when disabled prop is true', () => {
    render(<PlaceComboBox {...defaultProps} disabled />);
    const input = screen.getByRole('combobox');
    expect(input).toBeDisabled();
  });

  it('displays error message when error prop is set', () => {
    render(<PlaceComboBox {...defaultProps} error="مطلوب" />);
    expect(screen.getByText('مطلوب')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // ARIA attributes
  // -------------------------------------------------------------------------

  it('has combobox role with aria-expanded false by default', () => {
    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  // -------------------------------------------------------------------------
  // Dropdown behavior
  // -------------------------------------------------------------------------

  it('shows dropdown after typing and debounce', async () => {
    mockSearchResults([
      { id: 'p1', nameAr: 'مكة المكرمة', nameEn: 'Makkah', parentNameAr: null, fullPath: 'مكة المكرمة' },
    ]);

    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'مكة' } });
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    expect(screen.getByText('مكة المكرمة')).toBeInTheDocument();
  });

  it('does not show dropdown when input is empty', async () => {
    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: '' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    // Never resolve the fetch
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'مكة' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText('جارٍ البحث...')).toBeInTheDocument();
    });
  });

  it('shows empty state when no results', async () => {
    mockEmptyResults();

    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'xyz' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText('لا توجد نتائج')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Create option
  // -------------------------------------------------------------------------

  it('shows create option when no exact match exists', async () => {
    mockEmptyResults();

    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'الخرج' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText(/إضافة "الخرج"/)).toBeInTheDocument();
    });
  });

  it('hides create option when exact match exists', async () => {
    mockSearchResults([
      { id: 'p1', nameAr: 'الخرج', nameEn: null, parentNameAr: null, fullPath: 'الخرج' },
    ]);

    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'الخرج' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.queryByText(/إضافة "الخرج"/)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  it('calls onChange with nameAr when selecting a result', async () => {
    const onChange = vi.fn();
    mockSearchResults([
      { id: 'p1', nameAr: 'مكة المكرمة', nameEn: 'Makkah', parentNameAr: null, fullPath: 'مكة المكرمة' },
    ]);

    render(<PlaceComboBox {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'مكة' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText('مكة المكرمة'));
    expect(onChange).toHaveBeenCalledWith('مكة المكرمة');
  });

  it('closes dropdown after selection', async () => {
    mockSearchResults([
      { id: 'p1', nameAr: 'مكة المكرمة', nameEn: null, parentNameAr: null, fullPath: 'مكة المكرمة' },
    ]);

    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'مكة' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText('مكة المكرمة'));

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Clear button
  // -------------------------------------------------------------------------

  it('shows clear button when value is set', () => {
    render(<PlaceComboBox {...defaultProps} value="مكة" />);
    expect(screen.getByLabelText('مسح')).toBeInTheDocument();
  });

  it('does not show clear button when value is empty', () => {
    render(<PlaceComboBox {...defaultProps} value="" />);
    expect(screen.queryByLabelText('مسح')).not.toBeInTheDocument();
  });

  it('calls onChange with empty string when clear is clicked', () => {
    const onChange = vi.fn();
    render(<PlaceComboBox {...defaultProps} value="مكة" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('مسح'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  // -------------------------------------------------------------------------
  // Keyboard navigation
  // -------------------------------------------------------------------------

  it('closes dropdown on Escape', async () => {
    mockSearchResults([
      { id: 'p1', nameAr: 'مكة المكرمة', nameEn: null, parentNameAr: null, fullPath: 'مكة المكرمة' },
    ]);

    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'مكة' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it('selects highlighted item on Enter', async () => {
    const onChange = vi.fn();
    mockSearchResults([
      { id: 'p1', nameAr: 'مكة المكرمة', nameEn: null, parentNameAr: null, fullPath: 'مكة المكرمة' },
      { id: 'p2', nameAr: 'المدينة المنورة', nameEn: null, parentNameAr: null, fullPath: 'المدينة المنورة' },
    ]);

    render(<PlaceComboBox {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'م' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    // Arrow down to first item then Enter
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('مكة المكرمة');
  });

  it('navigates items with ArrowDown and ArrowUp', async () => {
    const onChange = vi.fn();
    mockSearchResults([
      { id: 'p1', nameAr: 'مكة المكرمة', nameEn: null, parentNameAr: null, fullPath: 'مكة المكرمة' },
      { id: 'p2', nameAr: 'المدينة المنورة', nameEn: null, parentNameAr: null, fullPath: 'المدينة المنورة' },
    ]);

    render(<PlaceComboBox {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'م' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    // ArrowDown twice to reach second item, then ArrowUp back to first
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('مكة المكرمة');
  });

  // -------------------------------------------------------------------------
  // Debounce
  // -------------------------------------------------------------------------

  it('debounces API calls', async () => {
    mockEmptyResults();

    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');

    // Type multiple characters quickly
    await act(async () => {
      fireEvent.change(input, { target: { value: 'م' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'مك' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'مكة' } });
    });

    // Not yet called because debounce not elapsed
    expect(mockApiFetch).not.toHaveBeenCalled();

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Only one API call for the final value
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('مكة')),
    );
  });

  // -------------------------------------------------------------------------
  // Display secondary info
  // -------------------------------------------------------------------------

  it('displays English name dimmed next to Arabic name', async () => {
    mockSearchResults([
      { id: 'p1', nameAr: 'مكة المكرمة', nameEn: 'Makkah', parentNameAr: null, fullPath: 'مكة المكرمة' },
    ]);

    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'مكة' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText(/Makkah/)).toBeInTheDocument();
    });
  });

  it('displays parent chain as secondary text', async () => {
    mockSearchResults([
      {
        id: 'p1',
        nameAr: 'مكة المكرمة',
        nameEn: null,
        parentNameAr: 'منطقة مكة المكرمة',
        fullPath: 'مكة المكرمة، منطقة مكة المكرمة',
      },
    ]);

    render(<PlaceComboBox {...defaultProps} />);
    const input = screen.getByRole('combobox');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'مكة' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText('منطقة مكة المكرمة')).toBeInTheDocument();
    });
  });
});
