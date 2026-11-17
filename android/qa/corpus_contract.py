"""Reject incomplete or invalid native worker output before golden comparison."""
import math


def validate(rows, expected):
    if not expected:
        raise ValueError('No expected corpus cases')
    names=[row.get('case') for row in rows]
    if len(names)!=len(set(names)):
        raise ValueError('Duplicate corpus cases')
    if set(names)!=set(expected):
        raise ValueError('Missing or unknown corpus cases')
    for row in rows:
        if row.get('status')!='measured':
            continue
        for field in ['peak','rms','elapsed_ms']:
            value=row.get(field)
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0:
                raise ValueError('Invalid measured '+field)
