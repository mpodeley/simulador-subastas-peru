import { describe, expect, it } from 'vitest'
import { buildStack, dispatchHour, simulateYear } from './dispatch'
import { DEFAULT_SCENARIO, type Scenario } from './scenarios'
import { loadMarketData } from './fixtures'
import type { Tech } from '../types'

const data = loadMarketData()

describe('dispatchHour (merit order)', () => {
  const stack = [
    { mw: 100, cost: 0, tech: 'solar' as Tech },
    { mw: 200, cost: 20, tech: 'gas_ccgt' as Tech },
    { mw: 150, cost: 50, tech: 'gas_ocgt' as Tech },
  ]

  it('the marginal block sets the price', () => {
    expect(dispatchHour(stack, 250, 250).smp).toBe(20) // 100 solar + 150 of gas_ccgt
    expect(dispatchHour(stack, 350, 250).smp).toBe(50) // into gas_ocgt
  })

  it('zero-cost supply above demand → price 0 + curtailment', () => {
    const r = dispatchHour(stack, 80, 250)
    expect(r.smp).toBe(0)
    expect(r.curtailedMW).toBeGreaterThan(0)
  })

  it('demand above total supply → scarcity price cap', () => {
    expect(dispatchHour(stack, 900, 250).smp).toBe(250)
  })
})

describe('simulateYear calibration (curated data)', () => {
  it('median 2025-ish scenario lands in a realistic CMg band', () => {
    const y = simulateYear(data, DEFAULT_SCENARIO)
    // COES 2025 weighted-average CMg ≈ 30 USD/MWh; allow a broad band.
    expect(y.avgCmg).toBeGreaterThan(15)
    expect(y.avgCmg).toBeLessThan(45)
  })

  it('hydro is the largest slice of the generation mix', () => {
    const y = simulateYear(data, DEFAULT_SCENARIO)
    const mix = y.genMixGWh
    const max = (Object.entries(mix) as [Tech, number][]).sort((a, b) => b[1] - a[1])[0]
    expect(max[0]).toBe('hydro')
  })

  it('a wet, over-supplied year drives many near-zero hours and a lower CMg', () => {
    const wet: Scenario = { ...DEFAULT_SCENARIO, hydrologyFactor: 1.35, gasPriceUSDMMBtu: 2 }
    const dry: Scenario = { ...DEFAULT_SCENARIO, hydrologyFactor: 0.7, gasPriceUSDMMBtu: 5 }
    const yWet = simulateYear(data, wet)
    const yDry = simulateYear(data, dry)
    expect(yWet.avgCmg).toBeLessThan(yDry.avgCmg)
    expect(yWet.nearZeroSharePct).toBeGreaterThan(yDry.nearZeroSharePct)
    expect(yWet.nearZeroSharePct).toBeGreaterThan(5)
  })

  it('higher demand raises the average CMg', () => {
    const base = simulateYear(data, DEFAULT_SCENARIO).avgCmg
    const high = simulateYear(data, { ...DEFAULT_SCENARIO, demandGrowth: 1.25 }).avgCmg
    expect(high).toBeGreaterThan(base)
  })
})

describe('buildStack', () => {
  it('is sorted ascending by cost and drops empty blocks', () => {
    const stack = buildStack(data, DEFAULT_SCENARIO, 5, 20) // June, evening
    for (let i = 1; i < stack.length; i++) {
      expect(stack[i].cost).toBeGreaterThanOrEqual(stack[i - 1].cost)
    }
    expect(stack.every((b) => b.mw > 0)).toBe(true)
  })
})
