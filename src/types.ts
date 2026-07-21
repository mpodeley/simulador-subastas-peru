// Shared types: the pipeline envelope + the payload shape of every curated
// dataset under public/data/. UI text is Spanish; identifiers are English.

export interface Envelope<T> {
  generated_at: string | null
  source: string | null
  source_date: string | null
  data: T
  reliability?: string
  note?: string
}

export interface Meta {
  generated_at: string | null
  source: string | null
  source_date: string | null
}

export interface FetchState<T> {
  data: T | null
  loading: boolean
  error: Error | null
  meta: Meta
}

export type Tech =
  | 'hydro'
  | 'gas_ccgt'
  | 'gas_ocgt'
  | 'coal'
  | 'diesel'
  | 'solar'
  | 'wind'
  | 'biomass'

/** A generation block in the merit-order stack (aggregated per representative unit). */
export interface FleetUnit {
  id: string
  name: string
  tech: Tech
  capacityMW: number
  /** Short-run marginal / variable cost, USD/MWh. Renewables ~0. */
  varCostUSDMWh: number
  /** Fraction of capacity that must run (0..1), e.g. run-of-river hydro. */
  mustRunFraction?: number
  /** For gas units: heat rate (MMBtu/MWh) so var cost tracks the gas-price slider. */
  heatRateMMBtuMWh?: number
}

/** 12 months × 24 hours matrix (rows = month 0..11, cols = hour 0..23). */
export type MonthHourMatrix = number[][]

export interface DemandProfile {
  peakMW: number
  annualGWh: number
  /** Fraction of peak (0..1) for each month/hour. */
  shape: MonthHourMatrix
}

export interface ResourceProfile {
  /** Capacity factor (0..1) for each month/hour. */
  shape: MonthHourMatrix
}

export interface HydrologyScenarios {
  /** Annual capacity factor of hydro (energy limit): avail = cap × CF × monthly × factor. */
  hydroBaseCF: number
  /** Named annual scaling of hydro energy availability. */
  scenarios: { name: string; label: string; factor: number }[]
  /** Monthly seasonal shape (avg ~1.0) per named scenario. */
  monthly: Record<string, number[]>
}

export interface CmgHistoryRow {
  month: string // YYYY-MM
  cmg_usd_mwh: number
}

/** Monthly generation by technology, GWh. Real from COES `Generacion`. */
export interface GenerationMixRow {
  month: string // YYYY-MM
  hydro: number
  gas: number
  wind: number
  solar: number
  biomass: number
  other: number
}

export interface BarraPriceRow {
  period: string // e.g. "2025-05 / 2026-04"
  energia_usd_mwh: number
  potencia_usd_kwmes?: number
}

export interface RerAuctionRow {
  round: number
  year: number
  tech: string
  awardedMW: number | null
  energyGWhYr: number | null
  priceUSDMWh: number | null
  reliability: 'verified' | 'approx' | 'unreliable'
  note?: string
}

export interface LicitacionRow {
  name: string
  year: number
  awardedMW: number | null
  periodo: string
  priceUSDMWh: number | null
  note?: string
}

export interface SourceRow {
  id: string
  name: string
  url: string
  note: string
  reliability: 'verified' | 'approx' | 'unreliable'
  cors: 'live' | 'preprocess'
}
