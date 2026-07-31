"""Root conftest — ensures the repo root is importable (backend.app,
abm_simulator, surrogate, param_sampling) regardless of where pytest is
invoked from.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
