/** Keys align with `abm_simulator/simulator.py` → `DISEASE_PRESETS`. */

export type VirusId =
  | "covid_wuhan"
  | "hantavirus_andes"
  | "h1n1_swine_flu"
  | "human_metapneumovirus"
  | "influenza_a_h3n2"
  | "spanish_flu";

export const VIRUS_OPTIONS: { id: VirusId; label: string }[] = [
  { id: "covid_wuhan", label: "COVID (Wuhan Strain)" },
  { id: "hantavirus_andes", label: "Hantavirus (Andes)" },
  { id: "h1n1_swine_flu", label: "H1N1 (swine flu)" },
  { id: "human_metapneumovirus", label: "Human Metapneumovirus" },
  { id: "influenza_a_h3n2", label: "Influenza A (H3N2)" },
  { id: "spanish_flu", label: "Spanish Flu" },
];
