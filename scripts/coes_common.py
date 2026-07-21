"""Shared helper for COES `portalinformacion/*` endpoints (POST, form-encoded,
JSON response, dates DD/MM/YYYY, no auth). Used by the demand & generation
fetchers. Marginal cost uses a different (xlsx) endpoint in fetch_coes.py.
"""

import time

import requests

PORTAL = 'https://www.coes.org.pe/Portal/portalinformacion/'
TIMEOUT = 120
RETRIES = 2


def post_json(endpoint, params):
    """POST form-encoded params to a portalinformacion endpoint, return JSON."""
    url = PORTAL + endpoint
    last = None
    for attempt in range(RETRIES + 1):
        try:
            r = requests.post(url, data=params, timeout=TIMEOUT)
            r.raise_for_status()
            return r.json()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f'{endpoint} {params} failed: {last}')


def ddmmyyyy(d):
    return d.strftime('%d/%m/%Y')
