/**
 * Response knobs — ranges aligned with `surrogate/schema.py` INPUT_RANGES.
 * `symptomatic_contact_multiplier` is fixed at the ABM default (not user-controlled).
 */

/** User-adjustable sliders only */
export type SliderKey =
  | "intervention_day"
  | "mask_compliance"
  | "vaccination_rate"
  | "contact_reduction";

/** Full intervention slice matching surrogate inputs (sliders + fixed constant). */
export type InterventionValues = {
  intervention_day: number;
  mask_compliance: number;
  vaccination_rate: number;
  contact_reduction: number;
  symptomatic_contact_multiplier: number;
};

/** Matches `abm_simulator/simulator.py` DiseaseModel — held constant in the UI. */
export const FIXED_SYMPTOMATIC_CONTACT_MULTIPLIER = 0.3;

/** Defaults for slider-backed fields (same as Mesa defaults). */
export const DEFAULT_USER_INTERVENTION: Record<SliderKey, number> = {
  intervention_day: 30,
  mask_compliance: 0.6,
  vaccination_rate: 0.004,
  contact_reduction: 0.5,
};

/** Merge slider state with the fixed symptomatic multiplier for API / simulator payloads. */
export function fullIntervention(
  user: Record<SliderKey, number>,
): InterventionValues {
  return {
    ...user,
    symptomatic_contact_multiplier: FIXED_SYMPTOMATIC_CONTACT_MULTIPLIER,
  };
}

export const INTERVENTION_SLIDERS: {
  key: SliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}[] = [
  {
    key: "intervention_day",
    label: "Intervention day",
    min: 0,
    max: 60,
    step: 1,
    format: (v) => String(Math.round(v)),
  },
  {
    key: "mask_compliance",
    label: "Mask compliance",
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: "vaccination_rate",
    label: "Vaccination rate",
    min: 0,
    max: 1,
    step: 0.001,
    format: (v) => v.toFixed(4),
  },
  {
    key: "contact_reduction",
    label: "Contact reduction",
    min: 0,
    max: 0.9,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
];
