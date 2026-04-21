import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FamilyEventForm } from '@/components/tree/FamilyEventForm/FamilyEventForm'

describe('FamilyEventForm', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onClose: vi.fn(),
  }

  it('renders marriage contract section header', () => {
    render(<FamilyEventForm {...defaultProps} />)
    expect(screen.getByText('عقد القران')).toBeInTheDocument()
  })

  it('renders wedding section header', () => {
    render(<FamilyEventForm {...defaultProps} />)
    expect(screen.getByText('الزفاف')).toBeInTheDocument()
  })

  it('renders divorce section header', () => {
    render(<FamilyEventForm {...defaultProps} />)
    expect(screen.getByText('الانفصال')).toBeInTheDocument()
  })

  it('expands section when header is clicked', () => {
    render(<FamilyEventForm {...defaultProps} />)
    // Marriage contract section should be collapsed initially
    expect(screen.queryByLabelText('تاريخ عقد القران')).not.toBeInTheDocument()
    // Click to expand
    fireEvent.click(screen.getByText('عقد القران'))
    expect(screen.getByLabelText('تاريخ عقد القران')).toBeInTheDocument()
  })

  it('auto-expands sections with existing data', () => {
    render(
      <FamilyEventForm
        {...defaultProps}
        initialData={{ marriageContractDate: '2020' }}
      />,
    )
    // Should be auto-expanded because it has data
    expect(screen.getByLabelText('تاريخ عقد القران')).toBeInTheDocument()
  })

  it('submits form data with all fields', async () => {
    const onSubmit = vi.fn()
    render(
      <FamilyEventForm
        {...defaultProps}
        onSubmit={onSubmit}
        initialData={{
          marriageContractDate: '2020',
          marriageDate: '2021',
          isDivorced: true,
          divorceDate: '2023',
        }}
      />,
    )
    fireEvent.submit(document.getElementById('family-event-form')!)
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          marriageContractDate: '2020',
          marriageDate: '2021',
          isDivorced: true,
          divorceDate: '2023',
        }),
      )
    })
  })

  it('hides divorce detail fields when isDivorced is unchecked', () => {
    render(<FamilyEventForm {...defaultProps} />)
    // Expand divorce section
    fireEvent.click(screen.getByText('الانفصال'))
    // isDivorced checkbox should be visible but date should not
    expect(screen.getByLabelText('مطلقان')).toBeInTheDocument()
    expect(screen.queryByLabelText('تاريخ الانفصال')).not.toBeInTheDocument()
  })

  it('shows divorce detail fields when isDivorced is checked', () => {
    render(<FamilyEventForm {...defaultProps} />)
    // Expand divorce section
    fireEvent.click(screen.getByText('الانفصال'))
    // Check isDivorced
    fireEvent.click(screen.getByLabelText('مطلقان'))
    expect(screen.getByLabelText('تاريخ الانفصال')).toBeInTheDocument()
  })

  it('auto-expands divorce section when isDivorced is true in initial data', () => {
    render(
      <FamilyEventForm
        {...defaultProps}
        initialData={{ isDivorced: true, divorceDate: '2023' }}
      />,
    )
    expect(screen.getByLabelText('تاريخ الانفصال')).toBeInTheDocument()
  })
})
