# utils/i18n_py.py - Python internationalization module
# Language is set via ARCSI_LANG environment variable (default: 'en')

import os
import json

LANG = os.environ.get('ARCSI_LANG', 'en')
_base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_locale_path = os.path.join(_base, 'locales', f'{LANG}.json')

_strings = {}
try:
    with open(_locale_path, encoding='utf-8') as f:
        _strings = json.load(f)
except Exception:
    try:
        with open(os.path.join(_base, 'locales', 'en.json'), encoding='utf-8') as f:
            _strings = json.load(f)
    except Exception:
        pass

def t(key, **kwargs):
    keys = key.split('.')
    val = _strings
    for k in keys:
        val = val.get(k) if isinstance(val, dict) else None
        if val is None:
            return key  # fallback: return key
    if kwargs:
        for k, v in kwargs.items():
            val = val.replace(f'{{{k}}}', str(v))
    return val
