/** Population scale used in the UI (map + scaled Monte Carlo table). */
export const COST_MODEL_POPULATION = 3000;

export const VACCINE_USD_PER_DOSE = 6.5544;

/** Uninsured ballpark cost per inpatient stay (user-provided order of magnitude). */
export const HOSPITAL_USD_PER_ADMISSION = 1000;

/**
 * Fraction of cumulative cases assumed to need inpatient care for costing only.
 * (Surrogate does not emit hospitalizations; this is an illustrative default.)
 */
export const CASE_TO_HOSPITALIZATION_FRACTION = 0.06;

export type CostEstimate = {
  dosesPlanned: number;
  vaccineCostUsd: number;
  hospitalizedMedian: number;
  hospitalCostMedianUsd: number;
  hospitalCostLowUsd: number;
  hospitalCostHighUsd: number;
  totalMedianUsd: number;
};

export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * @param vaccinationRate — For this estimate, treated as target one-dose coverage
 *   among `COST_MODEL_POPULATION` (0–1). The ABM/surrogate still interprets the
 *   same slider as a daily vaccination probability; this split keeps procurement
 *   math intuitive in the UI.
 */
export function estimateOutbreakCosts(
  vaccinationRate: number,
  totalCases: { p5: number; p50: number; p95: number },
): CostEstimate {
  const rate = Math.min(1, Math.max(0, vaccinationRate));
  const dosesPlanned = Math.round(rate * COST_MODEL_POPULATION);
  const vaccineCostUsd = dosesPlanned * VACCINE_USD_PER_DOSE;

  const admissions = (cases: number) =>
    Math.round(Math.max(0, cases) * CASE_TO_HOSPITALIZATION_FRACTION);
  const hospitalCost = (cases: number) =>
    admissions(cases) * HOSPITAL_USD_PER_ADMISSION;

  const hospitalCostMedianUsd = hospitalCost(totalCases.p50);
  const hospitalCostLowUsd = hospitalCost(totalCases.p5);
  const hospitalCostHighUsd = hospitalCost(totalCases.p95);

  return {
    dosesPlanned,
    vaccineCostUsd,
    hospitalizedMedian: admissions(totalCases.p50),
    hospitalCostMedianUsd,
    hospitalCostLowUsd,
    hospitalCostHighUsd,
    totalMedianUsd: vaccineCostUsd + hospitalCostMedianUsd,
  };
}
