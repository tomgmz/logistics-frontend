import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'


// BookingDetailParts imports the API client, which needs an API address (never called here).
process.env.NEXT_PUBLIC_API_URL ??= 'http://localhost'
const { CollapsibleSection } = await import('@/app/admin/booking-management/BookingDetailParts')

afterEach(cleanup)

describe('CollapsibleSection (shadcn Accordion, underline)', () => {
  it('keeps its content mounted but hidden while closed', async () => {
    render(<CollapsibleSection title="Trips"><p>trip plan</p></CollapsibleSection>)
    const trigger = screen.getByRole('button', { name: 'Trips' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('trip plan').closest('[hidden]')).not.toBeNull()
    await act(async () => { fireEvent.click(trigger) })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('trip plan').closest('[hidden]')).toBeNull()
    await act(async () => { fireEvent.click(trigger) })
    expect(screen.getByText('trip plan').closest('[hidden]')).not.toBeNull()
  })

  it('lazy: mounts the content only once first opened, then keeps it', async () => {
    render(<CollapsibleSection title="History" lazy><p>history</p></CollapsibleSection>)
    expect(screen.queryByText('history')).toBeNull()
    const trigger = screen.getByRole('button', { name: 'History' })
    await act(async () => { fireEvent.click(trigger) })
    expect(screen.getByText('history')).toBeTruthy()
    await act(async () => { fireEvent.click(trigger) })
    expect(screen.getByText('history')).toBeTruthy()
  })
})

describe('ToggleBox (outlined shadcn Accordion item)', () => {
  it('opens and closes from the state the page keeps', async () => {
    const { ToggleBox } = await import('./accordion')
    const { useState } = await import('react')
    function Page() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <ToggleBox open={open} onOpenChange={setOpen} title="Earlier pauses (1)"><p>pause row</p></ToggleBox>
          <output data-testid="open">{String(open)}</output>
        </>
      )
    }
    render(<Page />)
    const trigger = screen.getByRole('button', { name: 'Earlier pauses (1)' })
    expect(screen.queryByText('pause row')).toBeNull()
    await act(async () => { fireEvent.click(trigger) })
    expect(screen.getByTestId('open').textContent).toBe('true')
    expect(screen.getByText('pause row')).toBeTruthy()
    await act(async () => { fireEvent.click(trigger) })
    expect(screen.getByTestId('open').textContent).toBe('false')
    expect(screen.queryByText('pause row')).toBeNull()
  })
})
