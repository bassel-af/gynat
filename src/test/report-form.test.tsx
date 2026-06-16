import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportForm } from '@/components/public-tree/ReportForm/ReportForm';

/**
 * The public report form (PRD §1.5, §8.2). It collects the complaint and emits
 * a `{ reason, reporterContact }` payload shaped for the report endpoint —
 * composing the category + affected person + free details into one `reason`.
 */
describe('ReportForm', () => {
  function fill({
    category,
    person,
    contact,
    details,
  }: {
    category?: string;
    person?: string;
    contact?: string;
    details?: string;
  }) {
    if (category !== undefined) {
      fireEvent.change(screen.getByLabelText('ما الذي تُبلِغ عنه؟'), {
        target: { value: category },
      });
    }
    if (person !== undefined) {
      fireEvent.change(screen.getByLabelText('مَن الفرد المتأثّر؟'), {
        target: { value: person },
      });
    }
    if (contact !== undefined) {
      fireEvent.change(screen.getByLabelText('وسيلة تواصلٍ (اختياريّة)'), {
        target: { value: contact },
      });
    }
    if (details !== undefined) {
      fireEvent.change(screen.getByLabelText('تفاصيل إضافيّة'), {
        target: { value: details },
      });
    }
  }

  it('emits the selected category as the reason', () => {
    const onSubmit = vi.fn();
    render(<ReportForm onSubmit={onSubmit} />);
    fill({ category: 'محتوى مسيء' });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال البلاغ' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ reason: 'محتوى مسيء' });
  });

  it('composes the affected person and details into the reason', () => {
    const onSubmit = vi.fn();
    render(<ReportForm onSubmit={onSubmit} />);
    fill({ category: 'معلوماتٌ غير صحيحة', person: 'أحمد', details: 'تفاصيل هنا' });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال البلاغ' }));

    expect(onSubmit).toHaveBeenCalledWith({
      reason: 'معلوماتٌ غير صحيحة\nالفرد المتأثّر: أحمد\nتفاصيل هنا',
    });
  });

  it('passes the optional contact and omits it when blank', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<ReportForm onSubmit={onSubmit} />);
    fill({ category: 'محتوى مسيء', contact: 'me@example.com' });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال البلاغ' }));
    expect(onSubmit).toHaveBeenCalledWith({
      reason: 'محتوى مسيء',
      reporterContact: 'me@example.com',
    });

    onSubmit.mockClear();
    rerender(<ReportForm onSubmit={onSubmit} />);
    fill({ category: 'محتوى مسيء', contact: '   ' });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال البلاغ' }));
    expect(onSubmit).toHaveBeenCalledWith({ reason: 'محتوى مسيء' });
  });

  it('does not submit without a chosen reason', () => {
    const onSubmit = vi.fn();
    render(<ReportForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'إرسال البلاغ' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows a busy label and disables submit while submitting', () => {
    render(<ReportForm onSubmit={vi.fn()} submitting />);
    const btn = screen.getByRole('button', { name: 'جارٍ الإرسال…' });
    expect(btn).toBeDisabled();
  });

  it('surfaces a submission error', () => {
    render(<ReportForm onSubmit={vi.fn()} error="تعذّر إرسال البلاغ" />);
    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر إرسال البلاغ');
  });

  it('replaces the form with a confirmation once submitted', () => {
    render(<ReportForm onSubmit={vi.fn()} submitted />);
    expect(screen.getByText(/تمّ استلام بلاغك/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إرسال البلاغ' })).not.toBeInTheDocument();
  });
});
