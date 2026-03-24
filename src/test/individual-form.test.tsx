import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IndividualForm } from '@/components/tree/IndividualForm/IndividualForm'

describe('IndividualForm', () => {
  const defaultProps = {
    mode: 'create' as const,
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  }

  describe('isDeceased checkbox', () => {
    it('renders an isDeceased checkbox labeled correctly', () => {
      render(<IndividualForm {...defaultProps} />)
      expect(screen.getByLabelText(/متوفى\/متوفية/)).toBeInTheDocument()
    })

    it('defaults isDeceased to false', () => {
      render(<IndividualForm {...defaultProps} />)
      const checkbox = screen.getByLabelText(/متوفى\/متوفية/) as HTMLInputElement
      expect(checkbox.checked).toBe(false)
    })

    it('auto-checks isDeceased when a death date is entered', () => {
      render(<IndividualForm {...defaultProps} />)
      const deathDateInput = screen.getByLabelText('تاريخ الوفاة')
      fireEvent.change(deathDateInput, { target: { value: '2020' } })
      const checkbox = screen.getByLabelText(/متوفى\/متوفية/) as HTMLInputElement
      expect(checkbox.checked).toBe(true)
    })

    it('allows manually toggling isDeceased', () => {
      render(<IndividualForm {...defaultProps} />)
      const checkbox = screen.getByLabelText(/متوفى\/متوفية/) as HTMLInputElement
      fireEvent.click(checkbox)
      expect(checkbox.checked).toBe(true)
      fireEvent.click(checkbox)
      expect(checkbox.checked).toBe(false)
    })

    it('includes isDeceased in submitted data', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(<IndividualForm {...defaultProps} onSubmit={onSubmit} initialData={{ givenName: 'أحمد' }} />)
      const checkbox = screen.getByLabelText(/متوفى\/متوفية/) as HTMLInputElement
      fireEvent.click(checkbox)
      fireEvent.submit(document.getElementById('individual-form')!)
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ isDeceased: true })
        )
      })
    })

    it('pre-fills isDeceased from initialData', () => {
      render(<IndividualForm {...defaultProps} initialData={{ isDeceased: true }} />)
      const checkbox = screen.getByLabelText(/متوفى\/متوفية/) as HTMLInputElement
      expect(checkbox.checked).toBe(true)
    })
  })

  describe('notes textarea', () => {
    it('renders a notes textarea', () => {
      render(<IndividualForm {...defaultProps} />)
      expect(screen.getByLabelText('ملاحظات')).toBeInTheDocument()
    })

    it('shows placeholder text', () => {
      render(<IndividualForm {...defaultProps} />)
      const textarea = screen.getByLabelText('ملاحظات')
      expect(textarea).toHaveAttribute('placeholder', 'أضف ملاحظات عن هذا الشخص...')
    })

    it('enforces max 5000 character limit', () => {
      render(<IndividualForm {...defaultProps} />)
      const textarea = screen.getByLabelText('ملاحظات')
      expect(textarea).toHaveAttribute('maxLength', '5000')
    })

    it('includes notes in submitted data', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(<IndividualForm {...defaultProps} onSubmit={onSubmit} initialData={{ givenName: 'أحمد' }} />)
      const textarea = screen.getByLabelText('ملاحظات')
      fireEvent.change(textarea, { target: { value: 'ملاحظة اختبار' } })
      fireEvent.submit(document.getElementById('individual-form')!)
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ notes: 'ملاحظة اختبار' })
        )
      })
    })

    it('pre-fills notes from initialData', () => {
      render(<IndividualForm {...defaultProps} initialData={{ notes: 'ملاحظة سابقة' }} />)
      const textarea = screen.getByLabelText('ملاحظات') as HTMLTextAreaElement
      expect(textarea.value).toBe('ملاحظة سابقة')
    })
  })

  describe('lockedSex prop', () => {
    it('pre-selects male when lockedSex is M', () => {
      render(<IndividualForm {...defaultProps} lockedSex="M" />)
      const maleRadio = screen.getByLabelText('ذكر') as HTMLInputElement
      expect(maleRadio.checked).toBe(true)
    })

    it('pre-selects female when lockedSex is F', () => {
      render(<IndividualForm {...defaultProps} lockedSex="F" />)
      const femaleRadio = screen.getByLabelText('أنثى') as HTMLInputElement
      expect(femaleRadio.checked).toBe(true)
    })

    it('disables both radio buttons when lockedSex is provided', () => {
      render(<IndividualForm {...defaultProps} lockedSex="M" />)
      const maleRadio = screen.getByLabelText('ذكر') as HTMLInputElement
      const femaleRadio = screen.getByLabelText('أنثى') as HTMLInputElement
      expect(maleRadio.disabled).toBe(true)
      expect(femaleRadio.disabled).toBe(true)
    })

    it('does not disable radio buttons when lockedSex is not provided', () => {
      render(<IndividualForm {...defaultProps} />)
      const maleRadio = screen.getByLabelText('ذكر') as HTMLInputElement
      const femaleRadio = screen.getByLabelText('أنثى') as HTMLInputElement
      expect(maleRadio.disabled).toBe(false)
      expect(femaleRadio.disabled).toBe(false)
    })
  })

  describe('birthPlace in form', () => {
    it('renders birthPlace input', () => {
      render(<IndividualForm {...defaultProps} />)
      expect(screen.getByLabelText('مكان الميلاد')).toBeInTheDocument()
    })

    it('pre-fills birthPlace from initialData', () => {
      render(<IndividualForm {...defaultProps} initialData={{ birthPlace: 'مكة المكرمة' }} />)
      const input = screen.getByLabelText('مكان الميلاد') as HTMLInputElement
      expect(input.value).toBe('مكة المكرمة')
    })

    it('includes birthPlace in submitted data', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(<IndividualForm {...defaultProps} onSubmit={onSubmit} initialData={{ givenName: 'أحمد' }} />)
      const input = screen.getByLabelText('مكان الميلاد')
      fireEvent.change(input, { target: { value: 'جدة' } })
      fireEvent.submit(document.getElementById('individual-form')!)
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ birthPlace: 'جدة' })
        )
      })
    })
  })
})
