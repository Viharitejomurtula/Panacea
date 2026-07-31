"""Tests for param_sampling.lhs — Latin Hypercube sampling over the surrogate's
input space."""
from __future__ import annotations

import numpy as np

from param_sampling.lhs import sample, to_dicts
from surrogate.schema import INPUT_COLS, INPUT_RANGES

INTEGER_COLS = {"initial_infected", "intervention_day", "population"}


def test_sample_shape_and_columns():
    df = sample(50, seed=0)
    assert len(df) == 50
    assert list(df.columns) == INPUT_COLS


def test_sample_values_within_declared_ranges():
    df = sample(200, seed=0)
    for col in INPUT_COLS:
        lo, hi = INPUT_RANGES[col]
        assert df[col].min() >= lo
        assert df[col].max() <= hi


def test_fixed_range_columns_are_constant():
    # population has range (30_000, 30_000) in schema.INPUT_RANGES.
    df = sample(50, seed=0)
    assert (df["population"] == 30_000).all()


def test_integer_columns_are_whole_numbers():
    df = sample(50, seed=0)
    for col in INTEGER_COLS:
        assert (df[col] == df[col].round()).all()


def test_same_seed_is_reproducible():
    a = sample(30, seed=123)
    b = sample(30, seed=123)
    assert np.allclose(a.to_numpy(dtype=float), b.to_numpy(dtype=float))


def test_no_duplicate_rows_across_varying_columns():
    # LHS stratifies each varying dimension, so with a small n relative to the
    # continuous ranges we shouldn't see exact duplicate rows.
    df = sample(100, seed=0)
    varying_cols = [c for c in INPUT_COLS if INPUT_RANGES[c][0] != INPUT_RANGES[c][1]]
    assert not df[varying_cols].duplicated().any()


def test_to_dicts_round_trips_columns():
    df = sample(5, seed=0)
    records = list(to_dicts(df))
    assert len(records) == 5
    assert set(records[0]) == set(INPUT_COLS)
