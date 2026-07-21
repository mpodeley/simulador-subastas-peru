#!/usr/bin/env python3
"""Build the curated seed datasets under public/data/.

v1 data is *curated*, not scraped — plausible, source-anchored figures for the
Peruvian SEIN. Numbers come from the research brief (COES / OSINERGMIN / MINEM /
Climatescope / BCRP). Reliability is flagged per dataset; anything not directly
verifiable is marked 'approx'. The automated COES/SENAMHI pipeline is Fase 4.

Representative year = 12 months x 24 hours (288 cells). A cell (m, h) stands for
`days_in_month[m]` occurrences of hour h in month m, so annual energy for a cell
is `MW * days_in_month[m]` MWh. Keep that convention in sync with the TS engine.

Run: python scripts/build_seed_data.py   (or npm run seed)
"""

import math
import os

from _meta import write_json

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'data')

DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
MONTHS = 12
HOURS = 24


# --------------------------------------------------------------------------
# Procedural profiles (12 x 24 matrices). Formulas chosen to reproduce the
# qualitative shapes that drive Peruvian spot prices: solar midday glut,
# evening demand peak, wet/dry hydrology seasonality.
# --------------------------------------------------------------------------

def solar_shape():
    """Capacity factor 0..1. Zero at night, bell peaking ~0.82 at solar noon.
    Peru's southern deserts have world-class irradiance -> slightly higher in
    the dry, cloud-free months (May-Oct)."""
    # 1.0 in dry/sunny months, a touch lower in cloudier summer coast months.
    month_factor = [0.92, 0.90, 0.92, 0.95, 1.00, 1.00, 1.02, 1.03, 1.02, 1.00, 0.96, 0.93]
    out = []
    for m in range(MONTHS):
        row = []
        for h in range(HOURS):
            if 6 <= h <= 18:
                base = math.sin(math.pi * (h - 6) / 12) ** 1.1
            else:
                base = 0.0
            row.append(round(0.82 * base * month_factor[m], 4))
        out.append(row)
    return out


def wind_shape():
    """Capacity factor 0..1. Peru's best sites (Ica, Marcona) run high CF (~0.45)
    with a late-afternoon/evening maximum and a windy mid-year season."""
    month_factor = [0.85, 0.82, 0.85, 0.90, 1.00, 1.12, 1.18, 1.15, 1.05, 0.95, 0.88, 0.85]
    out = []
    for m in range(MONTHS):
        row = []
        for h in range(HOURS):
            # Diurnal: min ~09h, max ~18-20h.
            diurnal = 0.45 + 0.28 * math.sin(math.pi * (h - 9) / 12)
            cf = max(0.05, diurnal) * month_factor[m]
            row.append(round(min(0.95, cf), 4))
        out.append(row)
    return out


def demand_shape():
    """Fraction of system peak (0..1). Double-peaked day (midday + evening),
    night trough. SEIN has mild seasonality (slightly higher in cool months)."""
    month_factor = [0.97, 0.96, 0.97, 0.98, 1.00, 1.01, 1.01, 1.00, 0.99, 0.99, 0.98, 0.98]
    out = []
    for m in range(MONTHS):
        row = []
        for h in range(HOURS):
            night = 0.62 + 0.06 * math.sin(math.pi * (h - 3) / 24)
            midday = 0.28 * math.exp(-((h - 13) ** 2) / 18)
            evening = 0.38 * math.exp(-((h - 20) ** 2) / 6)
            frac = min(1.0, (night + midday + evening)) * month_factor[m]
            row.append(round(frac, 4))
        out.append(row)
    return out


def annual_gwh(shape, peak_mw):
    """Integrate a fraction-of-peak matrix into annual GWh using month weights."""
    total_mwh = 0.0
    for m in range(MONTHS):
        for h in range(HOURS):
            total_mwh += peak_mw * shape[m][h] * DAYS_IN_MONTH[m]
    return round(total_mwh / 1000.0, 1)


def hydro_seasonal():
    """Monthly hydro-availability multiplier (avg ~1.0). Wet season Dec-Apr,
    dry May-Nov — drives the wet/dry spread in spot prices."""
    raw = [1.18, 1.22, 1.20, 1.10, 0.95, 0.84, 0.80, 0.80, 0.86, 0.92, 0.98, 1.10]
    avg = sum(raw) / len(raw)
    return [round(x / avg, 4) for x in raw]


# --------------------------------------------------------------------------
# Datasets
# --------------------------------------------------------------------------

def build_fleet():
    """Aggregated SEIN generation fleet (~14 GW installed, 2024). Gas units carry
    a heat rate so their var cost tracks the gas-price slider:
    effective var cost = gasPrice[USD/MMBtu] * heatRate + varCostUSDMWh (VOM).
    A slice of Camisea CCGT is declared near-zero (take-or-pay) — this is what
    produces the near-zero marginal-cost hours Peru saw in 2016-2022."""
    return [
        {'id': 'hydro', 'name': 'Hidroeléctrica (agregado)', 'tech': 'hydro',
         'capacityMW': 5600, 'varCostUSDMWh': 5.0, 'mustRunFraction': 0.35},
        {'id': 'gas_ccgt_torp', 'name': 'Gas CC Camisea (take-or-pay)', 'tech': 'gas_ccgt',
         'capacityMW': 1500, 'varCostUSDMWh': 2.0, 'mustRunFraction': 0.6},
        {'id': 'gas_ccgt', 'name': 'Gas ciclo combinado', 'tech': 'gas_ccgt',
         'capacityMW': 2100, 'varCostUSDMWh': 4.0, 'heatRateMMBtuMWh': 7.0},
        {'id': 'gas_ocgt', 'name': 'Gas ciclo abierto', 'tech': 'gas_ocgt',
         'capacityMW': 1600, 'varCostUSDMWh': 5.0, 'heatRateMMBtuMWh': 10.5},
        {'id': 'coal', 'name': 'Carbón', 'tech': 'coal',
         'capacityMW': 140, 'varCostUSDMWh': 48.0},
        {'id': 'biomass', 'name': 'Biomasa / bagazo', 'tech': 'biomass',
         'capacityMW': 60, 'varCostUSDMWh': 40.0, 'mustRunFraction': 0.4},
        {'id': 'diesel', 'name': 'Diésel / residual (respaldo)', 'tech': 'diesel',
         'capacityMW': 1000, 'varCostUSDMWh': 180.0},
        {'id': 'solar', 'name': 'Solar FV', 'tech': 'solar',
         'capacityMW': 528, 'varCostUSDMWh': 0.0},
        {'id': 'wind', 'name': 'Eólica', 'tech': 'wind',
         'capacityMW': 1151, 'varCostUSDMWh': 0.0},
    ]


def build_cmg_history():
    """Monthly system marginal cost (USD/MWh), 2016-2025. Curated to match the
    known regime: near-zero oversupply era (2016-2022), the Sept-2023 spike to
    ~180, and 2024-25 settling near ~30. Seasonal dip in the wet season."""
    seasonal = hydro_seasonal()  # higher availability -> lower CMg
    anchors = {  # yearly average CMg USD/MWh (approx)
        2016: 14, 2017: 12, 2018: 13, 2019: 15, 2020: 9,
        2021: 16, 2022: 22, 2023: 45, 2024: 31, 2025: 30,
    }
    rows = []
    for year, avg in anchors.items():
        for m in range(MONTHS):
            # Wet months (high hydro availability) pull CMg below the yearly avg.
            factor = 2.0 - seasonal[m]  # ~0.8 (wet) .. ~1.2 (dry)
            val = avg * factor
            # 2023 spike concentrated in Aug-Oct.
            if year == 2023 and m in (7, 8, 9):
                val = [120, 180, 150][m - 7]
            rows.append({'month': f'{year}-{m + 1:02d}', 'cmg_usd_mwh': round(val, 1)})
    return rows


def build_generation_mix():
    """Monthly generation by technology, GWh — fallback for the real COES series
    (fetch_coes_generation.py). Proportions anchored to a real recent month."""
    base = {'hydro': 2850, 'gas': 1880, 'wind': 290, 'solar': 240, 'biomass': 35, 'other': 40}
    # 12 curated months (2025) with mild wet/dry seasonality on hydro vs gas.
    seasonal = hydro_seasonal()
    rows = []
    for m in range(MONTHS):
        f = seasonal[m]
        rows.append({
            'month': f'2025-{m + 1:02d}',
            'hydro': round(base['hydro'] * f, 1),
            'gas': round(base['gas'] * (2.0 - f), 1),  # gas fills when hydro is low
            'wind': base['wind'], 'solar': base['solar'],
            'biomass': base['biomass'], 'other': base['other'],
        })
    return rows


def build_barra_prices():
    """Regulated energy price at busbar (precio en barra), USD/MWh (approx)."""
    return [
        {'period': '2021-05 / 2022-04', 'energia_usd_mwh': 28.0},
        {'period': '2022-05 / 2023-04', 'energia_usd_mwh': 33.0},
        {'period': '2023-05 / 2024-04', 'energia_usd_mwh': 41.0},
        {'period': '2024-05 / 2025-04', 'energia_usd_mwh': 44.0},
        {'period': '2025-05 / 2026-04', 'energia_usd_mwh': 46.0},
    ]


def build_rer_auctions():
    """The four RER auctions (DL 1002). ONLY verified rounds — the mechanism has
    been suspended since 2016. Post-2016 'clearing prices' circulating online are
    unreliable and deliberately excluded."""
    v = 'verified'
    a = 'approx'  # round-average monomic prices
    return [
        {'round': 1, 'year': 2010, 'tech': 'solar', 'awardedMW': 80, 'energyGWhYr': 181, 'priceUSDMWh': 221.0, 'reliability': v},
        {'round': 1, 'year': 2010, 'tech': 'wind', 'awardedMW': 142, 'energyGWhYr': 571, 'priceUSDMWh': 80.0, 'reliability': v},
        {'round': 2, 'year': 2011, 'tech': 'wind', 'awardedMW': None, 'energyGWhYr': None, 'priceUSDMWh': 69.0, 'reliability': v},
        {'round': 2, 'year': 2011, 'tech': 'solar', 'awardedMW': None, 'energyGWhYr': None, 'priceUSDMWh': 119.9, 'reliability': v},
        {'round': 2, 'year': 2011, 'tech': 'biomass', 'awardedMW': None, 'energyGWhYr': None, 'priceUSDMWh': 100.0, 'reliability': v},
        {'round': 3, 'year': 2013, 'tech': 'hydro', 'awardedMW': None, 'energyGWhYr': None, 'priceUSDMWh': 56.5, 'reliability': a,
         'note': 'Monómico promedio 50,5-64,8; bloque biomasa sin ofertas'},
        {'round': 4, 'year': 2016, 'tech': 'wind', 'awardedMW': None, 'energyGWhYr': None, 'priceUSDMWh': 37.79, 'reliability': v},
        {'round': 4, 'year': 2016, 'tech': 'solar', 'awardedMW': None, 'energyGWhYr': None, 'priceUSDMWh': 48.09, 'reliability': v},
        {'round': 4, 'year': 2016, 'tech': 'hydro', 'awardedMW': None, 'energyGWhYr': None, 'priceUSDMWh': 43.86, 'reliability': v},
        {'round': 4, 'year': 2016, 'tech': 'biomass', 'awardedMW': None, 'energyGWhYr': None, 'priceUSDMWh': 77.0, 'reliability': v},
    ]


def build_licitaciones():
    """Long-term supply auctions (Ley 28832). Awarded prices are not always
    public; left null with a note where so."""
    return [
        {'name': 'Licitación Lima 2021', 'year': 2021, 'awardedMW': 300, 'periodo': '2022-2031',
         'priceUSDMWh': None, 'note': '2.472 MW ofertados (8,2x); 100% adjudicado (Edelnor 240, LDS 60)'},
        {'name': 'LDS-01-2024-LP (Luz del Sur)', 'year': 2024, 'awardedMW': None, 'periodo': '2028-2042',
         'priceUSDMWh': None, 'note': 'Primer contrato a 15 años (Ley 32249)'},
    ]


def build_sources():
    return [
        {'id': 'coes_cmg', 'name': 'COES — Costos marginales', 'url': 'https://www.coes.org.pe/Portal/mercadomayorista/costosmarginales/index',
         'note': 'Costo marginal en tiempo real por barra. Sin API/CORS -> pipeline Fase 4.', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'coes_ieod', 'name': 'COES — IEOD (post-operación)', 'url': 'https://www.coes.org.pe/Portal/PostOperacion/Reportes/Ieod',
         'note': 'Generación por central, demanda, embalses (Excel). Pipeline Fase 4.', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'coes_gen', 'name': 'COES — Generación por tecnología', 'url': 'https://www.coes.org.pe/Portal/portalinformacion/Generacion',
         'note': 'Potencia por combustible 15-min (medidores). Cableado real vía pipeline (Fase 4).', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'coes_demanda', 'name': 'COES — Demanda ejecutada', 'url': 'https://www.coes.org.pe/Portal/portalinformacion/Demanda',
         'note': 'Demanda ejecutada 30-min, historia desde 2010. Cableado real vía pipeline (Fase 4).', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'osin_barra', 'name': 'OSINERGMIN — Tarifas en barra', 'url': 'https://www.osinergmin.gob.pe/seccion/institucional/regulacion-tarifaria/procesos-regulatorios/electricidad/tarifas-en-barra',
         'note': 'Precios en barra (PDF/Excel).', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'osin_rer', 'name': 'OSINERGMIN — Subastas RER', 'url': 'https://www.osinergmin.gob.pe/empresas/energias-renovables/subastas/primera-subasta-1',
         'note': 'Resultados de las 4 subastas RER. Solo estas son confiables.', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'minem_anuario', 'name': 'MINEM — Anuario Estadístico de Electricidad', 'url': 'https://www.minem.gob.pe/_estadisticaSector.php?idSector=6',
         'note': 'Capacidad instalada, generación por tecnología, demanda.', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'senamhi', 'name': 'SENAMHI — Datos hidrometeorológicos', 'url': 'https://www.senamhi.gob.pe/?p=descarga-datos-hidrometeorologicos',
         'note': 'Caudales y precipitación por estación (TXT, requiere registro). Pipeline Fase 4.', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'nasa_power', 'name': 'NASA POWER API', 'url': 'https://power.larc.nasa.gov/docs/services/api/',
         'note': 'Irradiancia/viento por punto. CORS abierto -> fetch en vivo desde el browser.', 'reliability': 'verified', 'cors': 'live'},
        {'id': 'gsa', 'name': 'Global Solar Atlas (point API)', 'url': 'https://globalsolaratlas.info/',
         'note': 'Potencial solar de largo plazo por ubicación. CORS abierto.', 'reliability': 'verified', 'cors': 'live'},
        {'id': 'climatescope', 'name': 'BNEF Climatescope — Perú', 'url': 'https://www.global-climatescope.org/markets/peru',
         'note': 'Mix de generación, capacidad, contexto de subastas.', 'reliability': 'verified', 'cors': 'preprocess'},
    ]


def main():
    src_coes = 'COES SINAC'
    write_json(os.path.join(DATA, 'fleet.json'), build_fleet(),
               source='MINEM Anuario / COES / Climatescope (curado)', source_date='2024',
               reliability='approx', note='Parque agregado por tecnología (~14 GW).')

    demand = demand_shape()
    peak = 7900
    write_json(os.path.join(DATA, 'demand_profile.json'),
               {'peakMW': peak, 'annualGWh': annual_gwh(demand, peak), 'shape': demand},
               source='Perfil representativo SEIN (curado)', source_date='2024',
               reliability='approx')

    write_json(os.path.join(DATA, 'solar_profile.json'), {'shape': solar_shape()},
               source='Perfil solar representativo (formulado; calibrar con NASA POWER)',
               source_date='2024', reliability='approx')
    write_json(os.path.join(DATA, 'wind_profile.json'), {'shape': wind_shape()},
               source='Perfil eólico representativo (formulado; calibrar con NASA POWER)',
               source_date='2024', reliability='approx')

    seasonal = hydro_seasonal()
    write_json(os.path.join(DATA, 'hydrology_scenarios.json'), {
        # Hydro is energy-limited by inflows, so its available power averages a
        # fraction of installed capacity (annual CF). Calibrated to the real COES
        # demand + mix (hydro ~53% of ~61 TWh -> CF ~0.64). The engine uses:
        # avail_MW = capacityMW * hydroBaseCF * monthly[m] * hydrologyFactor.
        'hydroBaseCF': 0.64,
        'scenarios': [
            {'name': 'dry', 'label': 'Año seco', 'factor': 0.75},
            {'name': 'median', 'label': 'Año mediano', 'factor': 1.0},
            {'name': 'wet', 'label': 'Año húmedo', 'factor': 1.2},
        ],
        'monthly': {
            'median': seasonal,
            'dry': [round(x * 0.75, 4) for x in seasonal],
            'wet': [round(min(1.4, x * 1.2), 4) for x in seasonal],
        },
    }, source='Estacionalidad hidrológica (curado)', source_date='2024', reliability='approx')

    write_json(os.path.join(DATA, 'marginal_cost_history.json'), build_cmg_history(),
               source=src_coes + ' / BCRP (curado)', source_date='2025',
               reliability='approx', note='Serie mensual curada a los anclajes conocidos.')
    write_json(os.path.join(DATA, 'generation_mix.json'), build_generation_mix(),
               source='MINEM / Climatescope (curado)', source_date='2024', reliability='approx')
    write_json(os.path.join(DATA, 'barra_prices.json'), build_barra_prices(),
               source='OSINERGMIN (curado)', source_date='2025', reliability='approx')
    write_json(os.path.join(DATA, 'rer_auctions.json'), build_rer_auctions(),
               source='OSINERGMIN GART', source_date='2016',
               reliability='verified',
               note='Solo las 4 subastas RER realizadas. Cifras post-2016 online NO son confiables.')
    write_json(os.path.join(DATA, 'licitaciones.json'), build_licitaciones(),
               source='OSINERGMIN / distribuidoras', source_date='2024', reliability='verified')
    write_json(os.path.join(DATA, 'sources.json'), build_sources(),
               source='Inventario de fuentes', source_date='2026', reliability='verified')

    print('Seed datasets written to', os.path.normpath(DATA))


if __name__ == '__main__':
    main()
