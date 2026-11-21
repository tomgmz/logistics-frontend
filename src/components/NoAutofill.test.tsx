import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useState } from 'react'

import NoAutofill from './NoAutofill'

afterEach(cleanup)

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

describe('NoAutofill', () => {
  it('turns autofill off on fields without their own value, now and later', async () => {
    function Page() {
      const [more, setMore] = useState(false)
      return (
        <>
          <NoAutofill />
          <input data-testid="plain" />
          <textarea data-testid="notes" />
          <input data-testid="login" type="email" autoComplete="username" />
          <input data-testid="pw" type="password" />
          <input data-testid="tick" type="checkbox" />
          <button onClick={() => setMore(true)}>more</button>
          {more && <input data-testid="later" />}
        </>
      )
    }
    const { getByTestId, getByText } = render(<Page />)
    await flush()
    expect(getByTestId('plain').getAttribute('autocomplete')).toBe('off')
    expect(getByTestId('notes').getAttribute('autocomplete')).toBe('off')
    expect(getByTestId('login').getAttribute('autocomplete')).toBe('username')
    expect(getByTestId('pw').hasAttribute('autocomplete')).toBe(false)
    expect(getByTestId('tick').hasAttribute('autocomplete')).toBe(false)

    await act(async () => { getByText('more').click() })
    await flush()
    expect(getByTestId('later').getAttribute('autocomplete')).toBe('off')
  })
})
