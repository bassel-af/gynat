import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FamilyPickerModal } from '@/components/tree/FamilyPickerModal/FamilyPickerModal'

describe('FamilyPickerModal', () => {
  const defaultFamilies = [
    { familyId: 'F1', spouseName: 'فاطمة' },
    { familyId: 'F2', spouseName: 'عائشة' },
    { familyId: 'F3', spouseName: null },
  ]

  it('renders the default title when none provided', () => {
    render(
      <FamilyPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        families={defaultFamilies}
      />
    )
    expect(screen.getByText('اختر العائلة')).toBeInTheDocument()
  })

  it('renders a custom title when provided', () => {
    render(
      <FamilyPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        families={defaultFamilies}
        title="نقل إلى عائلة أخرى"
      />
    )
    expect(screen.getByText('نقل إلى عائلة أخرى')).toBeInTheDocument()
  })

  it('renders spouse names with correct format', () => {
    render(
      <FamilyPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        families={defaultFamilies}
      />
    )
    expect(screen.getByText('أبناء من فاطمة')).toBeInTheDocument()
    expect(screen.getByText('أبناء من عائشة')).toBeInTheDocument()
    expect(screen.getByText('عائلة بدون زوج/زوجة')).toBeInTheDocument()
  })

  it('disables confirm button until a family is selected', () => {
    render(
      <FamilyPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        families={defaultFamilies}
      />
    )
    const confirmButton = screen.getByRole('button', { name: 'التالي' })
    expect(confirmButton).toBeDisabled()
  })

  it('enables confirm button after selecting a family', () => {
    render(
      <FamilyPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        families={defaultFamilies}
      />
    )
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[0])

    const confirmButton = screen.getByRole('button', { name: 'التالي' })
    expect(confirmButton).not.toBeDisabled()
  })

  it('calls onSelect with the selected familyId on confirm', () => {
    const onSelect = vi.fn()
    render(
      <FamilyPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={onSelect}
        families={defaultFamilies}
      />
    )
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[1]) // Select second family (F2)
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }))

    expect(onSelect).toHaveBeenCalledWith('F2')
  })

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn()
    render(
      <FamilyPickerModal
        isOpen={true}
        onClose={onClose}
        onSelect={vi.fn()}
        families={defaultFamilies}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not render when isOpen is false', () => {
    render(
      <FamilyPickerModal
        isOpen={false}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        families={defaultFamilies}
      />
    )
    expect(screen.queryByText('اختر العائلة')).not.toBeInTheDocument()
  })

  it('renders radio buttons for each family', () => {
    render(
      <FamilyPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        families={defaultFamilies}
      />
    )
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
  })
})
