import { useEffect, useState } from 'react'
import type {
  BarraPriceRow,
  CmgHistoryRow,
  DemandProfile,
  Envelope,
  FetchState,
  FleetUnit,
  GenerationMixRow,
  HydrologyScenarios,
  LicitacionRow,
  RerAuctionRow,
  ResourceProfile,
  SourceRow,
} from '../types'

/**
 * Loads a JSON file from ./data/ and unwraps the {generated_at, source,
 * source_date, data} envelope produced by the Python seed script. Payloads
 * without an envelope are returned as-is. Ported from estado-del-sistema.
 */
export function useJson<T>(path: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
    meta: { generated_at: null, source: null, source_date: null },
  })

  useEffect(() => {
    let cancelled = false
    fetch(path, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${path}`)
        return r.json()
      })
      .then((raw: unknown) => {
        if (cancelled) return
        if (raw && typeof raw === 'object' && 'data' in raw && 'generated_at' in raw) {
          const env = raw as Envelope<T>
          setState({
            data: env.data,
            loading: false,
            error: null,
            meta: {
              generated_at: env.generated_at ?? null,
              source: env.source ?? null,
              source_date: env.source_date ?? null,
            },
          })
        } else {
          setState({
            data: raw as T,
            loading: false,
            error: null,
            meta: { generated_at: null, source: null, source_date: null },
          })
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err }))
      })
    return () => {
      cancelled = true
    }
  }, [path])

  return state
}

// One typed wrapper per dataset (paths are relative to base "./").
export const useFleet = () => useJson<FleetUnit[]>('./data/fleet.json')
export const useDemandProfile = () => useJson<DemandProfile>('./data/demand_profile.json')
export const useSolarProfile = () => useJson<ResourceProfile>('./data/solar_profile.json')
export const useWindProfile = () => useJson<ResourceProfile>('./data/wind_profile.json')
export const useHydrology = () => useJson<HydrologyScenarios>('./data/hydrology_scenarios.json')
export const useCmgHistory = () => useJson<CmgHistoryRow[]>('./data/marginal_cost_history.json')
export const useGenerationMix = () => useJson<GenerationMixRow[]>('./data/generation_mix.json')
export const useBarraPrices = () => useJson<BarraPriceRow[]>('./data/barra_prices.json')
export const useRerAuctions = () => useJson<RerAuctionRow[]>('./data/rer_auctions.json')
export const useLicitaciones = () => useJson<LicitacionRow[]>('./data/licitaciones.json')
export const useSources = () => useJson<SourceRow[]>('./data/sources.json')
