#!/usr/bin/env python3
"""Rebuild the demand profile (public/data/demand_profile.json) from REAL COES
executed demand.

COES `portalinformacion/Demanda` returns the actual executed system demand
(`Ejecutado` series) in MW at 30-min resolution, full period, one call per year
(history back to 2010). We average it into a 12x24 (month, hour) matrix of mean
MW, set peakMW = the peak cell average, and store the shape as a fraction of that
peak — exactly what the dispatch engine consumes.

Best-effort: if no year is fetched, exit 1 so the pipeline keeps the seed shape.
Requires: requests.
"""

import os
import sys
from collections import defaultdict
from datetime import date

from _meta import write_json
from coes_common import ddmmyyyy, post_json

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'data')
OUT = os.path.join(DATA, 'demand_profile.json')

DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
# Recent complete years to average into the representative shape.
YEARS = [int(y) for y in os.environ.get('COES_DEMAND_YEARS', '2024,2025').split(',')]


def fetch_year(year):
    j = post_json('Demanda', {
        'fechaInicial': ddmmyyyy(date(year, 1, 1)),
        'fechaFinal': ddmmyyyy(date(year, 12, 31)),
    })
    series = {s['Name']: s for s in j['Chart']['Series']}
    return series['Ejecutado']['Data']


def main():
    acc = defaultdict(float)
    cnt = defaultdict(int)
    got = []
    for y in YEARS:
        try:
            data = fetch_year(y)
        except Exception as e:  # noqa: BLE001
            print(f'skip demand {y}: {e}', file=sys.stderr)
            continue
        for p in data:
            v = p.get('Valor')
            if not isinstance(v, (int, float)):
                continue
            ts = p['Nombre']  # 'YYYY/MM/DD HH:MM:SS'
            m = int(ts[5:7]) - 1
            h = int(ts[11:13])
            acc[(m, h)] += v
            cnt[(m, h)] += 1
        got.append(y)

    if not got:
        print('COES demand: nothing fetched — keeping seed shape', file=sys.stderr)
        sys.exit(1)

    mean = [[(acc[(m, h)] / cnt[(m, h)]) if cnt[(m, h)] else 0.0 for h in range(24)] for m in range(12)]
    peak = max(max(row) for row in mean) or 1.0
    shape = [[round(mean[m][h] / peak, 4) for h in range(24)] for m in range(12)]
    annual_gwh = round(sum(mean[m][h] * DAYS_IN_MONTH[m] for m in range(12) for h in range(24)) / 1000, 1)

    write_json(OUT, {'peakMW': round(peak), 'annualGWh': annual_gwh, 'shape': shape},
               source=f'COES Demanda (Ejecutado, años {"-".join(map(str, got))})',
               source_date=str(max(got)), reliability='verified',
               note='Demanda ejecutada real, promediada a 12x24 (mes×hora).')
    print(f'demand profile: peak {round(peak)} MW, {annual_gwh} GWh/año (años {got})')


if __name__ == '__main__':
    main()
