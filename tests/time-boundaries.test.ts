import { describe, expect, it } from 'vitest'
import { daysLeftOf } from '../src/domain/goals.js'

describe('剩余天数的日期边界', () => {
  it('同一天是 0，前一天是 -1', () => {
    expect(daysLeftOf('2026-11-01', '2026-11-01')).toBe(0)
    expect(daysLeftOf('2026-10-31', '2026-11-01')).toBe(-1)
  })

  it('跨年：12-31 → 次年 01-01 是 1 天', () => {
    expect(daysLeftOf('2027-01-01', '2026-12-31')).toBe(1)
  })

  it('闰年：2028-02-28 → 02-29 是 1 天，到 03-01 是 2 天', () => {
    expect(daysLeftOf('2028-02-29', '2028-02-28')).toBe(1)
    expect(daysLeftOf('2028-03-01', '2028-02-28')).toBe(2)
  })

  it('平年：2027-02-28 → 03-01 是 1 天', () => {
    expect(daysLeftOf('2027-03-01', '2027-02-28')).toBe(1)
  })

  it('跨月：10-31 → 11-30 是 30 天', () => {
    expect(daysLeftOf('2026-11-30', '2026-10-31')).toBe(30)
  })
})
