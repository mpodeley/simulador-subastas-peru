# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this repo is

Static **bid-price simulator** for the Peruvian electricity market (SEIN), deployed to GitHub Pages.
No backend: curated JSON in `public/data/`, and a pure-TypeScript engine (merit-order dispatch + Monte
Carlo) runs in the browser. Sibling of `estado-del-sistema` / `gasoductos` — same stack (Vite + React 19 +
TS + Recharts, `base: "./"`) and conventions. UI is Spanish; identifiers/comments English.

Live (once deployed): https://mpodeley.github.io/simulador-subastas-peru/

## Architecture

- `src/engine/` — framework-free, unit-tested core:
  - `fleet.ts` — types + var-cost helper (gas var cost = gasPrice × heatRate).
  - `dispatch.ts` — merit order: build the hourly supply stack, marginal unit sets SMP.
  - `weather.ts` — resolve month/hour resource (solar/wind CF, hydro availability, demand) from profiles.
  - `scenarios.ts` — deterministic scenario → per-(month,hour) SMP over a representative year (12×24, weighted by days-in-month).
  - `bid.ts` — evaluate a contract: unified per-hour P&L `gen·(SMP − varCost) + vol·(K − SMP)`; annualize, discount to NPV, closed-form break-even K*.
  - `montecarlo.ts` — sample hydrology/weather/gas → NPV distribution (P50/P90/VaR/P(loss)). Runs in a Web Worker.
- `src/hooks/useData.ts` — `useJson<T>()` unwraps the `{generated_at, source, source_date, data}` envelope.
- `scripts/_meta.py` + `scripts/build_seed_data.py` — write the curated JSON with that envelope.

## Time granularity

Representative year = **12 months × 24 hours = 288 timesteps**, each weighted by days-in-month. Captures
solar midday cannibalization + seasonal hydrology while keeping compute trivial. Energy for a rep-hour =
`MW × days_in_month` MWh/yr. Do not silently switch to 8760 without updating the weights everywhere.

## Conventions

- UI text Spanish; code English. No inline hex — use `theme.ts` tokens; tech colors in `techColors`.
- Every dataset JSON carries the metadata envelope (`_meta.py` `write_json`). Freshness badges read `generated_at`.
- Data reliability matters: post-2016 renewable-auction prices online are unreliable — only curate verified
  figures and carry a `reliability` flag through to the UI.
- Keep the model as simple as the data justifies (fundamental merit-order, copperplate, no unit commitment).

## Plan

Implementation plan: `~/.claude/plans/serene-shimmying-sundae.md`.
Phases: 0 scaffold · 1 curated data · 2 deterministic engine + pages · 3 Monte Carlo · 4 live pipeline (post-v1) · 5 methodology + tests.
