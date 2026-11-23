import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CalendarPanel from './CalendarPanel'

afterEach(cleanup)

const day = (label: string) => screen.getByRole('button', { name: label })

describe('CalendarPanel: month and year choosers', () => {
  it('clicking the year opens a grid of 12 years; a year then its month then a day picks the date', () => {
    const onPick = vi.fn()
    render(<CalendarPanel value="2026-11-23" today="2026-11-23" onPick={onPick} />)

    // Days view header: month name and year are separate buttons.
    expect(screen.getByRole('button', { name: 'Choose month' }).textContent).toContain('November')
    fireEvent.click(screen.getByRole('button', { name: 'Choose year' }))

    // Years view: 2022–2033, the chevrons move a page.
    expect(screen.getByRole('button', { name: 'Back to days' }).textContent).toContain('2022 – 2033')
    expect(screen.getByRole('button', { name: '2033' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next 12 years' }))
    expect(screen.getByRole('button', { name: 'Back to days' }).textContent).toContain('2034 – 2045')
    fireEvent.click(screen.getByRole('button', { name: '2040' }))

    // Months of 2040, then March, then the 5th.
    fireEvent.click(screen.getByRole('button', { name: 'March 2040' }))
    expect(screen.getByRole('button', { name: 'Choose month' }).textContent).toContain('March')
    expect(screen.getByRole('button', { name: 'Choose year' }).textContent).toContain('2040')
    fireEvent.click(day('Mar 5, 2040'))
    expect(onPick).toHaveBeenCalledWith('2040-03-05')
  })

  it('clicking the month name opens the months of the shown year', () => {
    render(<CalendarPanel value="" today="2026-11-23" onPick={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose month' }))
    expect(screen.getByRole('button', { name: 'January 2026' })).toBeTruthy()
    // From the months view the year is still clickable.
    fireEvent.click(screen.getByRole('button', { name: 'Choose year' }))
    expect(screen.getByRole('button', { name: 'Back to days' })).toBeTruthy()
  })

  it('years, months and chevrons outside min/max are disabled', () => {
    // The booking form's window: today to one month ahead.
    render(<CalendarPanel value="" today="2026-12-10" min="2026-12-10" max="2027-01-10" onPick={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose year' }))
    expect((screen.getByRole('button', { name: '2025' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '2026' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '2027' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '2028' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Previous 12 years' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Next 12 years' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '2027' }))
    expect((screen.getByRole('button', { name: 'January 2027' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'February 2027' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'January 2027' }))
    expect((day('Jan 10, 2027') as HTMLButtonElement).disabled).toBe(false)
    expect((day('Jan 11, 2027') as HTMLButtonElement).disabled).toBe(true)
  })

  it('picking a year where the shown month is out of range jumps to the nearest allowed month', () => {
    render(<CalendarPanel value="" today="2026-12-10" min="2026-12-10" max="2027-01-10" onPick={() => {}} />)
    // Shows December 2026; picking 2027 must not land on (disabled) December 2027.
    fireEvent.click(screen.getByRole('button', { name: 'Choose year' }))
    fireEvent.click(screen.getByRole('button', { name: '2027' }))
    // January (the last allowed month) is the highlighted one, not December.
    const jan = screen.getByRole('button', { name: 'January 2027' }) as HTMLButtonElement
    expect(jan.style.background).toContain('rgba(77, 249, 237, 0.12)')
    expect((screen.getByRole('button', { name: 'December 2027' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
