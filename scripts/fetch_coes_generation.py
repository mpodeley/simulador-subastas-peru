#!/usr/bin/env python3
"""Rebuild the generation mix (public/data/generation_mix.json) from REAL COES
generation by technology.

COES `portalinformacion/Generacion` returns power (MW) per fuel type at 15-min
resolution (indicador=1, metered) for a date range. We pull the last N closed
months, integrate each fuel to monthly energy (GWh), and map COES's 9 fuel labels
onto the app's technology buckets. Output is a monthly series.

Best-effort: months that fail are skipped; if none succeed, exit 1 so the
pipeline keeps the curated mix. Requires: requests.
"""

import calendar
import os
import sys
from collections import defaultdict
from datetime import date

from _meta import wrap
from coes_common import ddmmyyyy, post_json
import json

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'data')
OUT = os.path.join(DATA, 'generation_mix.json')

MONTHS_BACK = int(os.environ.get('COES_GEN_MONTHS_BACK', '6'))
STEP_HOURS = 0.25  # indicador=1 is 15-min data

# COES fuel label -> app technology bucket.
FUEL_MAP = {
    'HÍDRICO': 'hydro',
    'GAS NATURAL': 'gas',
    'EÓLICA': 'wind',
    'SOLAR': 'solar',
    'BAGAZO': 'biomass',
    'BIOGÁS': 'biomass',
    'DIÉSEL': 'other',
    'NAFTA & GAS REFINERÍA': 'other',
    'RESIDUAL': 'other',
}


def month_mix_gwh(year, month):
    last = calendar.monthrange(year, month)[1]
    j = post_json('Generacion', {
        'fechaInicial': ddmmyyyy(date(year, month, 1)),
        'fechaFinal': ddmmyyyy(date(year, month, last)),
        'indicador': '1',
    })
    buckets = defaultdict(float)
    for s in j['GraficoTipoCombustible']['Series']:
        tech = FUEL_MAP.get(s['Name'].strip())
        if not tech:
            continue
        mwh = sum(p['Valor'] for p in s['Data'] if isinstance(p['Valor'], (int, float))) * STEP_HOURS
        buckets[tech] += mwh / 1000.0
    if not buckets:
        return None
    return {k: round(v, 1) for k, v in buckets.items()}


def target_months(n):
    today = date.today()
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        m -= 1
        if m == 0:
            m, y = 12, y - 1
        out.append((y, m))
    return list(reversed(out))


def main():
    rows = []
    for y, m in target_months(MONTHS_BACK):
        key = f'{y}-{m:02d}'
        try:
            mix = month_mix_gwh(y, m)
        except Exception as e:  # noqa: BLE001
            print(f'skip gen {key}: {e}', file=sys.stderr)
            continue
        if mix:
            row = {'month': key, 'hydro': mix.get('hydro', 0), 'gas': mix.get('gas', 0),
                   'wind': mix.get('wind', 0), 'solar': mix.get('solar', 0),
                   'biomass': mix.get('biomass', 0), 'other': mix.get('other', 0)}
            rows.append(row)
            tot = sum(v for k, v in row.items() if k != 'month')
            print(f'COES gen {key}: {tot:.0f} GWh (hydro {row["hydro"]:.0f}, gas {row["gas"]:.0f})')

    if not rows:
        print('COES generation: nothing fetched — keeping curated mix', file=sys.stderr)
        sys.exit(1)

    envelope = wrap(rows, source=f'COES Generación (medidores, últimos {len(rows)} meses)',
                    source_date=rows[-1]['month'], reliability='verified',
                    note='Energía mensual por tecnología, integrada de la potencia 15-min.')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(envelope, f, ensure_ascii=False, indent=2)
    print(f'\nwrote {len(rows)} real monthly mix rows')


if __name__ == '__main__':
    main()
