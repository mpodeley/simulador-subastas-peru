"""Shared helper for writing JSON outputs with a consistent metadata envelope.

Ported from estado-del-sistema so every dataset carries the same
{generated_at, source, source_date, data} shape the frontend's useJson() unwraps.
"""

import json
import os
from datetime import datetime, timezone


def wrap(data, source=None, source_date=None, **extra):
    """Wrap a payload with generated_at + source metadata."""
    envelope = {
        'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'source': source,
        'source_date': source_date,
        'data': data,
    }
    envelope.update(extra)
    return envelope


def write_json(path, data, source=None, source_date=None, **extra):
    """Write a JSON file wrapped with metadata."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    envelope = wrap(data, source=source, source_date=source_date, **extra)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(envelope, f, ensure_ascii=False, indent=2)
    return envelope
