import { describe, expect, it } from 'vitest'
import { makeDefaultGroup, type ItemGroup } from '@/lib/store/booking.store'
import { looseGroup, palletizedGroup } from './summary'
import { formatSize, fromCm, toCm } from './units'

describe('toCm', () => {
  it('converts metres and inches, and reads a missing unit as cm', () => {
    expect(toCm(120, 'cm')).toBe(120)
    expect(toCm(0.3, 'm')).toBe(30)
    expect(toCm(48, 'in')).toBe(121.92)
    expect(toCm(55, undefined)).toBe(55)
  })

  it('a stored cm size reads back exactly as typed', () => {
    for (const typed of [47.24, 10.125, 18, 0.3333]) expect(fromCm(toCm(typed, 'in'), 'in')).toBe(typed)
    expect(fromCm(toCm(1.2, 'm'), 'm')).toBe(1.2)
    expect(formatSize(45.72, 30.48, 25.4, 'in', { upper: true })).toBe('18 × 12 × 10 IN')
    expect(formatSize(50, 40, 30, null)).toBe('50 × 40 × 30 cm')
    expect(formatSize(50, null, 30, 'cm')).toBeNull()
  })
})

describe('sizes typed in another unit are sent in cm', () => {
  it('loose cargo in inches', () => {
    const g: ItemGroup = { ...makeDefaultGroup(), pieces: '2', looseLength: '10', looseWidth: '10', looseHeight: '10', dimUnit: 'in', weight: '1' }
    const r = looseGroup(g)!
    expect([r.lengthCm, r.widthCm, r.heightCm]).toEqual([25.4, 25.4, 25.4])
    expect(r.volumeCbm).toBeCloseTo(2 * 0.254 ** 3, 6)
  })

  it('pallets in metres', () => {
    const g: ItemGroup = { ...makeDefaultGroup(), numPallets: '1', palletLength: '1.2', palletWidth: '1', palletHeight: '1.5', palletDimUnit: 'm' }
    const r = palletizedGroup(g)!
    expect([r.lengthCm, r.widthCm, r.heightCm]).toEqual([120, 100, 150])
    expect(r.volumeCbm).toBeCloseTo(1.8, 6)
  })

  it('a draft saved before the unit picker existed stays in cm', () => {
    const g = { ...makeDefaultGroup(), pieces: '1', looseLength: '50', looseWidth: '40', looseHeight: '30' } as ItemGroup
    delete g.dimUnit
    expect(looseGroup(g)!.lengthCm).toBe(50)
  })
})
