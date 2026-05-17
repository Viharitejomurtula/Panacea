import type { VirusId } from "./viruses";
import type { InterventionValues } from "./interventionSliders";

export type SummaryPercentiles = Record<
  string,
  { p5: number; p50: number; p95: number; mean: number }
>;

export type MonteCarloResponse = {
  n_runs: number;
  virus_id: string;
  summary_percentiles: SummaryPercentiles;
  trajectory_percentiles: {
    p5: number[];
    p50: number[];
    p95: number[];
  };
  trajectory_days: number;
};

export type SensitivityParameterRow = {
  name: string;
  S1: number;
  ST: number;
  S1_conf: number;
  ST_conf: number;
};

export type SensitivityResult = {
  output_metric: string;
  saltelli_base_n: number;
  n_model_evals: number;
  parameters: SensitivityParameterRow[];
};

export type PredictMcResponse = {
  distribution: "mc";
  virus_id: string;
  monte_carlo: MonteCarloResponse;
  sensitivity: SensitivityResult;
};

export type PredictPointResponse = {
  distribution: "point";
  virus_id: string;
  summary: Record<string, number>;
  trajectory: number[];
};

export type PredictResponse = PredictMcResponse | PredictPointResponse;

type SliderOnly = Pick<
  InterventionValues,
  | "intervention_day"
  | "mask_compliance"
  | "vaccination_rate"
  | "contact_reduction"
>;

export type FetchPredictOptions = {
  distribution?: "point" | "mc";
  nRuns?: number;
  sobolBaseN?: number;
  sensitivityOutput?: string;
  seed?: number;
};

export async function fetchPredict(
  virusId: VirusId,
  intervention: SliderOnly,
  options?: FetchPredictOptions,
): Promise<PredictResponse> {
  const {
    distribution = "mc",
    nRuns = 10_000,
    sobolBaseN = 512,
    sensitivityOutput = "total_deaths",
    seed,
  } = options ?? {};

  const body = {
    virus_id: virusId,
    intervention: {
      intervention_day: intervention.intervention_day,
      mask_compliance: intervention.mask_compliance,
      vaccination_rate: intervention.vaccination_rate,
      contact_reduction: intervention.contact_reduction,
    },
    distribution,
    n_runs: nRuns,
    sobol_base_n: sobolBaseN,
    sensitivity_output: sensitivityOutput,
    ...(seed !== undefined ? { seed } : {}),
  };

  const base = import.meta.env.VITE_API_URL ?? "";
  const res = await fetch(`${base}/api/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Predict failed (${res.status})`);
  }

  return res.json() as Promise<PredictResponse>;
}
