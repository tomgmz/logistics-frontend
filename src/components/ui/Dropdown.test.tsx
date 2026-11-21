import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import Dropdown, { readOptions } from './Dropdown'
import Combobox from './Combobox'

// jsdom has no layout APIs that Radix / cmdk call.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.releasePointerCapture = vi.fn()
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})

function setWidth(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: desktop, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

afterEach(cleanup)

function Harness({ initial = '', allChoice = false, combobox = false }: { initial?: string; allChoice?: boolean; combobox?: boolean }) {
  const [value, setValue] = useState(initial)
  const Picker = combobox ? Combobox : Dropdown
  return (
    <>
      <Picker aria-label="Vehicle type" value={value} onChange={(e) => setValue(e.target.value)} className="box">
        {allChoice ? <option value="">All types</option> : <option value="" disabled>Select type</option>}
        {['Closed Van', 'Wing Van'].map((t) => <option key={t} value={t}>{t}</option>)}
        <option value="Tanker" disabled>Tanker — in maintenance</option>
      </Picker>
      <output data-testid="value">{value}</output>
    </>
  )
}

describe('readOptions', () => {
  it('reads mapped, fragment and disabled options as text', () => {
    const opts = readOptions(
      <>
        <option value="" disabled>Pick</option>
        {[1, 2].map((n) => <option key={n} value={n}>Item {n}</option>)}
        {null}
        <option value="x" disabled>{'A'} {'B'}</option>
      </>,
    )
    expect(opts.map((o) => [o.value, o.text, o.disabled])).toEqual([
      ['', 'Pick', true], ['1', 'Item 1', false], ['2', 'Item 2', false], ['x', 'A B', true],
    ])
  })
})

describe('Dropdown on a phone (below 768 px)', () => {
  it('is the native select and reports the picked value', () => {
    setWidth(false)
    render(<Harness />)
    const select = screen.getByRole('combobox', { name: 'Vehicle type' }) as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    fireEvent.change(select, { target: { value: 'Wing Van' } })
    expect(screen.getByTestId('value').textContent).toBe('Wing Van')
  })
})

describe('Dropdown on a tablet / desktop (768 px and up)', () => {
  it('is the shadcn Select: placeholder, pick, disabled option', async () => {
    setWidth(true)
    render(<Harness />)
    const trigger = screen.getByRole('combobox', { name: 'Vehicle type' })
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.textContent).toContain('Select type')

    await act(async () => { fireEvent.keyDown(trigger, { key: 'Enter' }) })
    const options = screen.getAllByRole('option')
    // The disabled '' placeholder is not offered; the disabled Tanker is, but greyed.
    expect(options.map((o) => o.textContent)).toEqual(['Closed Van', 'Wing Van', 'Tanker — in maintenance'])
    expect(options[2].getAttribute('aria-disabled')).toBe('true')

    await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'Wing Van' })) })
    expect(screen.getByTestId('value').textContent).toBe('Wing Van')
  })

  it('offers an enabled "" option as a real choice that clears the value', async () => {
    setWidth(true)
    render(<Harness initial="Closed Van" allChoice />)
    const trigger = screen.getByRole('combobox', { name: 'Vehicle type' })
    await act(async () => { fireEvent.keyDown(trigger, { key: 'Enter' }) })
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'All types' })) })
    expect(screen.getByTestId('value').textContent).toBe('')
    expect(trigger.textContent).toContain('All types')
  })

  it('Escape closes the menu without reaching a modal listening on window', async () => {
    setWidth(true)
    const modalClose = vi.fn()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') modalClose() }
    window.addEventListener('keydown', onKey)
    try {
      render(<Harness />)
      const trigger = screen.getByRole('combobox', { name: 'Vehicle type' })
      await act(async () => { fireEvent.keyDown(trigger, { key: 'Enter' }) })
      expect(screen.getAllByRole('option').length).toBe(3)
      await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }) })
      expect(screen.queryAllByRole('option').length).toBe(0)
      expect(modalClose).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', onKey)
    }
  })
})

describe('Combobox', () => {
  it('is native on a phone', () => {
    setWidth(false)
    render(<Harness combobox />)
    expect(screen.getByRole('combobox', { name: 'Vehicle type' }).tagName).toBe('SELECT')
  })

  it('searches by the words shown and picks', async () => {
    setWidth(true)
    render(<Harness combobox />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Vehicle type' })) })
    const search = screen.getByPlaceholderText('Search')
    await act(async () => { fireEvent.change(search, { target: { value: 'wing' } }) })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Wing Van'])
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'Wing Van' })) })
    expect(screen.getByTestId('value').textContent).toBe('Wing Van')
  })
})

describe('option hints (data-hint)', () => {
  const units = (
    <>
      <option value="cm" data-hint="centimetres">CM</option>
      <option value="in" data-hint="inches">IN</option>
    </>
  )

  it('reads the hint', () => {
    expect(readOptions(units).map((o) => o.hint)).toEqual(['centimetres', 'inches'])
  })

  it('phones: the list spells each choice out, the closed box keeps the short label', () => {
    setWidth(false)
    const { container } = render(<Dropdown aria-label="Dimension unit" value="in" className="box">{units}</Dropdown>)
    const select = screen.getByRole('combobox', { name: 'Dimension unit' }) as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['CM – centimetres', 'IN – inches'])
    expect(select.value).toBe('in')
    expect(container.querySelector('span[aria-hidden]')?.textContent).toBe('IN')
  })

  it('desktop: items carry the full name and still pick', async () => {
    setWidth(true)
    function Units() {
      const [v, setV] = useState('cm')
      return (
        <>
          <Dropdown aria-label="Dimension unit" value={v} onChange={(e) => setV(e.target.value)}>{units}</Dropdown>
          <output data-testid="unit">{v}</output>
        </>
      )
    }
    render(<Units />)
    const trigger = screen.getByRole('combobox', { name: 'Dimension unit' })
    expect(trigger.textContent).toContain('CM')
    await act(async () => { fireEvent.keyDown(trigger, { key: 'Enter' }) })
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'IN' })) })
    expect(screen.getByTestId('unit').textContent).toBe('in')
  })

  it('phones: a dropdown without hints renders as before', () => {
    setWidth(false)
    const { container } = render(<Dropdown aria-label="Plain" value="a"><option value="a">A</option></Dropdown>)
    expect(container.firstElementChild?.tagName).toBe('SELECT')
  })
})
