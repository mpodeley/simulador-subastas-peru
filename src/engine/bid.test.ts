import { describe, expect, it } from 'vitest'
import { simulateYear } from './dispatch'
import { DEFAULT_SCENARIO } from './scenarios'
import { DEFAULT_CONTRACT, evaluateBid, type Contract } from './bid'
import { loadMarketData } from './fixtures'

const data = loadMarketData()
const year = simulateYear(data, DEFAULT_SCENARIO)

describe('evaluateBid', () => {
  it('NPV is linear in K and crosses zero at the break-even price', () => {
    const c: Contract = { ...DEFAULT_CONTRACT, settlement: 'firme_28832', capexUSD: 0 }
    const r = evaluateBid(data, DEFAULT_SCENARIO, year, c)
    expect(r.breakEvenK).not.toBeNull()
    // Evaluate exactly at K* → NPV ≈ 0.
    const atBreakeven = evaluateBid(data, DEFAULT_SCENARIO, year, { ...c, priceK: r.breakEvenK! })
    expect(Math.abs(atBreakeven.npv)).toBeLessThan(1) // dollars
  })

  it('a higher offered price never lowers NPV for a seller', () => {
    const lo = evaluateBid(data, DEFAULT_SCENARIO, year, { ...DEFAULT_CONTRACT, priceK: 30 })
    const hi = evaluateBid(data, DEFAULT_SCENARIO, year, { ...DEFAULT_CONTRACT, priceK: 60 })
    expect(hi.npv).toBeGreaterThan(lo.npv)
  })

  it('prima RER removes spot risk: annual P&L ≈ gen·(K − varCost)', () => {
    const c: Contract = {
      ...DEFAULT_CONTRACT,
      settlement: 'prima_rer',
      genTech: 'solar',
      genCapacityMW: 200,
      genVarCostUSDMWh: 0,
      priceK: 50,
      capexUSD: 0,
    }
    const r = evaluateBid(data, DEFAULT_SCENARIO, year, c)
    // gen·(K − varCost) with varCost 0 → K · energy.
    const expected = r.ownGenGWh * 1000 * c.priceK
    expect(Math.abs(r.annualPnL - expected) / expected).toBeLessThan(0.02)
  })

  it('merchant has no contract term, so NPV is flat in K', () => {
    const a = evaluateBid(data, DEFAULT_SCENARIO, year, { ...DEFAULT_CONTRACT, settlement: 'merchant', priceK: 20 })
    const b = evaluateBid(data, DEFAULT_SCENARIO, year, { ...DEFAULT_CONTRACT, settlement: 'merchant', priceK: 90 })
    expect(a.npv).toBeCloseTo(b.npv, 6)
    expect(a.breakEvenK).toBeNull()
  })

  it('solar capture price falls as solar penetration rises (cannibalization)', () => {
    // At low penetration solar can capture ~average; the model must show the
    // capture price dropping (and below average) once a lot of solar is added.
    const lowPen = simulateYear(data, DEFAULT_SCENARIO)
    const highPen = simulateYear(data, { ...DEFAULT_SCENARIO, extraSolarMW: 5000 })
    const c: Contract = { ...DEFAULT_CONTRACT, settlement: 'merchant', genTech: 'solar', genCapacityMW: 300 }
    const capLow = evaluateBid(data, DEFAULT_SCENARIO, lowPen, c).captureUSDMWh
    const capHigh = evaluateBid(data, { ...DEFAULT_SCENARIO, extraSolarMW: 5000 }, highPen, c).captureUSDMWh
    expect(capHigh).toBeLessThan(capLow)
    expect(capHigh).toBeLessThan(highPen.avgCmg)
  })
})
