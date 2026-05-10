"""Single source of truth for the surrogate's input/output columns.

The Mesa simulator should write a CSV whose columns match INPUT_COLS + OUTPUT_COLS
(in any order). The surrogate reads from this contract — change here, not in
train.py / predict.py.
"""

INPUT_COLS = [
    # Disease params (set by virus preset)
    "r0",
    "incubation_period",
    "infectious_period",
    "mortality_rate",
    "asymptomatic_fraction",
    "vaccination_effectiveness",
    # Community context (fixed for the demo, but learned-over)
    "population",
    "initial_infected",
    "hospital_capacity",
    # Response (the user's sliders)
    "intervention_day",
    "mask_compliance",
    "vaccination_rate",
    "contact_reduction",
    "symptomatic_contact_multiplier",
]

OUTPUT_COLS = [
    "peak_cases",
    "peak_day",
    "total_cases",
    "total_deaths",
    "days_over_hospital_capacity",
    "attack_rate",
]

# Per-day active-infected count. The simulator runs at most N_TRAJECTORY_DAYS
# steps; if the outbreak ends earlier the trailing entries are zero.
N_TRAJECTORY_DAYS = 365
TRAJECTORY_COLS = [f"infected_d{i}" for i in range(N_TRAJECTORY_DAYS)]

# Full output vector the surrogate predicts: 6 summaries + 365 daily counts.
ALL_OUTPUT_COLS = OUTPUT_COLS + TRAJECTORY_COLS

# Plausible ranges for synthetic data + sanity-checking real CSVs.
# (lower, upper) inclusive. Used only by make_synthetic.py and validation.
INPUT_RANGES = {
    "r0": (0.8, 6.0),
    "incubation_period": (1.0, 21.0),
    "infectious_period": (3.0, 14.0),
    "mortality_rate": (0.0, 0.40),
    "asymptomatic_fraction": (0.0, 0.6),
    "vaccination_effectiveness": (0.0, 0.95),
    "population": (30_000, 30_000),
    "initial_infected": (1, 50),
    "hospital_capacity": (10, 50),
    "intervention_day": (0, 60),
    "mask_compliance": (0.0, 1.0),
    "vaccination_rate": (0.0, 1.0),
    "contact_reduction": (0.0, 0.9),
    "symptomatic_contact_multiplier": (0.0, 1.0),
}

assert set(INPUT_RANGES.keys()) == set(INPUT_COLS)

N_INPUTS = len(INPUT_COLS)
N_OUTPUTS = len(OUTPUT_COLS)
