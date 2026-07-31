import { describe, expect, it } from "vitest";
import {
  CASE_TO_HOSPITALIZATION_FRACTION,
  COST_MODEL_POPULATION,
  VACCINE_USD_PER_DOSE,
  estimateOutbreakCosts,
  formatUsd,
} from "../costEstimate";

describe("estimateOutbreakCosts", () => {
  it("computes doses and vaccine cost from the vaccination rate", () => {
    const result = estimateOutbreakCosts(0.5, { p5: 0, p50: 0, p95: 0 });
    const expectedDoses = Math.round(0.5 * COST_MODEL_POPULATION);
    expect(result.dosesPlanned).toBe(expectedDoses);
    expect(result.vaccineCostUsd).toBeCloseTo(expectedDoses * VACCINE_USD_PER_DOSE);
  });

  it("clamps out-of-range vaccination rates into [0, 1]", () => {
    const over = estimateOutbreakCosts(1.5, { p5: 0, p50: 0, p95: 0 });
    const under = estimateOutbreakCosts(-0.5, { p5: 0, p50: 0, p95: 0 });
    expect(over.dosesPlanned).toBe(COST_MODEL_POPULATION);
    expect(under.dosesPlanned).toBe(0);
  });

  it("derives hospitalizations from the hospitalization fraction of cases", () => {
    const result = estimateOutbreakCosts(0, { p5: 0, p50: 1000, p95: 0 });
    expect(result.hospitalizedMedian).toBe(
      Math.round(1000 * CASE_TO_HOSPITALIZATION_FRACTION),
    );
  });

  it("floors negative case counts at zero instead of negative costs", () => {
    const result = estimateOutbreakCosts(0, { p5: -100, p50: 0, p95: 0 });
    expect(result.hospitalCostLowUsd).toBe(0);
  });

  it("totalMedianUsd is vaccine cost plus median hospital cost", () => {
    const result = estimateOutbreakCosts(0.2, { p5: 100, p50: 500, p95: 900 });
    expect(result.totalMedianUsd).toBeCloseTo(
      result.vaccineCostUsd + result.hospitalCostMedianUsd,
    );
  });
});

describe("formatUsd", () => {
  it("formats whole-dollar USD currency strings", () => {
    expect(formatUsd(1234.56)).toBe("$1,235");
    expect(formatUsd(0)).toBe("$0");
  });
});
