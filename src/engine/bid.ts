// Bid evaluation — "modelo genérico vendedor".
//
// The seller commits to deliver energy at a fixed price K and is exposed to the
// spot. Unified per-hour P&L:
//     pnl_h = gen_h·(SMP_h − varCost) + vol_h·(K − SMP_h)
//             └─ merchant margin on own generation ─┘  └─ contract-for-difference ─┘
// Settlement presets just choose how gen_h / vol_h are assigned:
//   merchant     → vol = 0 (no contract; pure spot)
//   cfd          → vol = contracted block, gen = own generation (may be 0)
//   firme_28832  → same as cfd (long firm block; differs by horizon/indexation)
//   prima_rer    → vol = gen (all generation settled at K; priority dispatch)
//
// P&L is linear in K, so NPV(K) and the break-even K* are closed-form.

import type { Tech } from '../types'
import type { Scenario } from './scenarios'
import type { YearResult } from './dispatch'
import { DAYS_IN_MONTH, HOURS, MONTHS, cellIndex, type MarketData } from './types'

export type Settlement = 'merchant' | 'cfd' | 'prima_rer' | 'firme_28832'
export type VolumeShape = 'flat' | 'solar' | 'wind'
export type GenTech = Tech | 'none'
export type Indexation = 'none' | 'gas' | 'cpi'

export interface Contract {
  priceK: number // offered price, USD/MWh
  settlement: Settlement
  contractedMW: number
  volumeShape: VolumeShape
  horizonYears: number
  indexation: Indexation
  indexRatePct: number // annual %, applied to K when indexation != 'none'
  priorityDispatch: boolean
  genTech: GenTech
  genCapacityMW: number
  genVarCostUSDMWh: number
  waccPct: number
  capexUSD: number
}

export const DEFAULT_CONTRACT: Contract = {
  priceK: 45,
  settlement: 'firme_28832',
  contractedMW: 100,
  volumeShape: 'flat',
  horizonYears: 15,
  indexation: 'cpi',
  indexRatePct: 2,
  priorityDispatch: false,
  genTech: 'solar',
  genCapacityMW: 200,
  genVarCostUSDMWh: 0,
  waccPct: 8,
  capexUSD: 160_000_000,
}

export interface BidResult {
  /** NPV over the horizon at the offered price K, USD. */
  npv: number
  /** Year-1 P&L at K, USD. */
  annualPnL: number
  /** Break-even offer price K* (NPV = 0), USD/MWh. null if no contract term. */
  breakEvenK: number | null
  ownGenGWh: number
  contractedGWh: number
  /** Renewable capture price: mean spot captured by own generation, USD/MWh. */
  captureUSDMWh: number
  avgCmg: number
  // Year-1 cashflow breakdown (USD):
  contractRevenue: number
  spotSettlement: number // −Σ vol·SMP (paid back to the pool under a CfD)
  genSpotRevenue: number
  genCost: number
  // NPV(K) = npvIntercept + npvSlope·K  (linear) — for the margin-vs-price chart.
  npvIntercept: number
  npvSlope: number
}

function volShapeFactor(shape: VolumeShape, data: MarketData, m: number, h: number): number {
  if (shape === 'solar') return data.solar.shape[m]?.[h] ?? 0
  if (shape === 'wind') return data.wind.shape[m]?.[h] ?? 0
  return 1 // flat block
}

function ownGenMW(c: Contract, data: MarketData, scenario: Scenario, year: YearResult, m: number, h: number): number {
  if (c.genTech === 'none' || c.genCapacityMW <= 0) return 0
  if (c.genTech === 'solar') return c.genCapacityMW * (data.solar.shape[m]?.[h] ?? 0)
  if (c.genTech === 'wind') return c.genCapacityMW * (data.wind.shape[m]?.[h] ?? 0)
  if (c.genTech === 'hydro') {
    const seasonal = data.hydrology.monthly.median?.[m] ?? 1
    return c.genCapacityMW * data.hydrology.hydroBaseCF * seasonal * scenario.hydrologyFactor
  }
  // Thermal: dispatched only when in-merit (SMP ≥ its variable cost), unless
  // the contract grants priority dispatch.
  const smp = year.cells[cellIndex(m, h)].smp
  return c.priorityDispatch || smp >= c.genVarCostUSDMWh ? c.genCapacityMW : 0
}

export function evaluateBid(data: MarketData, scenario: Scenario, year: YearResult, c: Contract): BidResult {
  const g = c.indexation === 'none' ? 0 : c.indexRatePct / 100
  const wacc = c.waccPct / 100
  const prima = c.settlement === 'prima_rer'
  const merchant = c.settlement === 'merchant'

  // Accumulate the year-1 constants. A' is K-independent; B is the coefficient of K.
  let aPrime = 0 // Σ [gen·(SMP−varCost) − vol·SMP] · w
  let bCoef = 0 // Σ vol · w
  let ownGenMWh = 0
  let contractedMWh = 0
  let genSpotRev = 0
  let genCost = 0
  let spotOnContract = 0
  let captureNum = 0

  for (let m = 0; m < MONTHS; m++) {
    for (let h = 0; h < HOURS; h++) {
      const i = cellIndex(m, h)
      const w = DAYS_IN_MONTH[m]
      const smp = year.cells[i].smp
      const gen = merchant || c.genTech !== 'none' ? ownGenMW(c, data, scenario, year, m, h) : 0

      let vol: number
      if (merchant) vol = 0
      else if (prima) vol = gen // all generation settled at K
      else vol = c.contractedMW * volShapeFactor(c.volumeShape, data, m, h)

      const genMargin = gen * (smp - c.genVarCostUSDMWh)
      aPrime += (genMargin - vol * smp) * w
      bCoef += vol * w

      ownGenMWh += gen * w
      contractedMWh += vol * w
      genSpotRev += gen * smp * w
      genCost += gen * c.genVarCostUSDMWh * w
      spotOnContract += vol * smp * w
      captureNum += gen * smp * w
    }
  }

  // Discount sums over the horizon.
  let s1 = 0 // Σ df_y
  let s2 = 0 // Σ (1+g)^y · df_y
  for (let y = 0; y < c.horizonYears; y++) {
    const df = 1 / Math.pow(1 + wacc, y)
    s1 += df
    s2 += Math.pow(1 + g, y) * df
  }

  const npvIntercept = aPrime * s1 - c.capexUSD
  const npvSlope = bCoef * s2
  const npv = npvIntercept + c.priceK * npvSlope
  const annualPnL = aPrime + c.priceK * bCoef
  const breakEvenK = Math.abs(npvSlope) > 1e-6 ? -npvIntercept / npvSlope : null

  return {
    npv,
    annualPnL,
    breakEvenK,
    ownGenGWh: ownGenMWh / 1000,
    contractedGWh: contractedMWh / 1000,
    captureUSDMWh: ownGenMWh ? captureNum / ownGenMWh : 0,
    avgCmg: year.avgCmg,
    contractRevenue: c.priceK * bCoef,
    spotSettlement: -spotOnContract,
    genSpotRevenue: genSpotRev,
    genCost,
    npvIntercept,
    npvSlope,
  }
}
