import { describe, expect, it } from 'vitest'
import { bookingProgress } from './booking-progress'

describe('bookingProgress', () => {
  it('pending: approval is next', () => {
    const p = bookingProgress({ status: 'pending' })
    expect(p.current).toBe('approval')
    expect(p.states.submitted).toBe('done')
    expect(p.states.assignment).toBe('upcoming')
    expect(p.doneCount).toBe(1)
  })

  it('approved: assignment is next', () => {
    expect(bookingProgress({ status: 'approved' }).current).toBe('assignment')
  })

  it('assigned without a call time: the call time is the required next step', () => {
    const p = bookingProgress({ status: 'assigned' })
    expect(p.current).toBe('call_time')
    expect(p.states.assignment).toBe('done')
  })

  it('assigned with a call time: waiting for the driver to start', () => {
    const p = bookingProgress({ status: 'assigned', driver_call_time: '06:30' })
    expect(p.states.call_time).toBe('done')
    expect(p.current).toBe('on_the_road')
  })

  it('in transit without a driver call time (older booking): call step counts as done', () => {
    const p = bookingProgress({ status: 'in_transit' })
    expect(p.states.call_time).toBe('done')
    expect(p.current).toBe('on_the_road')
  })

  it('delivered: waiting for the client', () => {
    const p = bookingProgress({ status: 'delivered' })
    expect(p.states.delivered).toBe('done')
    expect(p.current).toBe('completed')
  })

  it('completed: nothing left', () => {
    const p = bookingProgress({ status: 'completed' })
    expect(p.current).toBeNull()
    expect(p.doneCount).toBe(7)
    expect(Object.values(p.states).every((s) => s === 'done')).toBe(true)
  })

  it('rejected stops at approval', () => {
    const p = bookingProgress({ status: 'cancelled', gm_status: 'rejected' })
    expect(p.stop).toEqual({ at: 'approval', kind: 'rejected' })
    expect(p.states.approval).toBe('stopped')
    expect(p.states.assignment).toBe('skipped')
    expect(p.current).toBeNull()
  })

  it('cancelled after approval stops at assignment', () => {
    const p = bookingProgress({ status: 'cancelled', gm_status: 'approved' })
    expect(p.stop).toEqual({ at: 'assignment', kind: 'cancelled' })
    expect(p.states.approval).toBe('done')
  })

  it('cancelled once crewed, without a call time, stops at the call time', () => {
    const p = bookingProgress({ status: 'cancelled', gm_status: 'approved', hasCrew: true })
    expect(p.stop?.at).toBe('call_time')
  })

  it('cancelled while pending stops at approval', () => {
    expect(bookingProgress({ status: 'cancelled' }).stop).toEqual({ at: 'approval', kind: 'cancelled' })
  })

  it('failed stops on the road', () => {
    const p = bookingProgress({ status: 'failed' })
    expect(p.stop).toEqual({ at: 'on_the_road', kind: 'failed' })
    expect(p.states.delivered).toBe('skipped')
  })
})
