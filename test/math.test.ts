import { describe, expect, test } from 'bun:test'
import { calcSpentPerScale } from '@/utils/math'

describe('calcSpentPerScale', () => {
    test('calculates correctly with default scale (1m)', () => {
        expect(calcSpentPerScale(1_000_000, 5)).toBe(5)
        expect(calcSpentPerScale(500_000, 5)).toBe(2.5)
        expect(calcSpentPerScale(2_000_000, 5)).toBe(10)
    })

    test('calculates correctly with custom scale (1k)', () => {
        const scale = 1_000
        expect(calcSpentPerScale(1_000, 1, scale)).toBe(1)
        expect(calcSpentPerScale(500, 1, scale)).toBe(0.5)
    })

    test('handles zero values correctly', () => {
        expect(calcSpentPerScale(0, 5)).toBe(0)
        expect(calcSpentPerScale(1_000_000, 0)).toBe(0)
    })

    test('handles small fractional costs', () => {
        expect(calcSpentPerScale(1, 1)).toBe(0.000001)
    })
})
