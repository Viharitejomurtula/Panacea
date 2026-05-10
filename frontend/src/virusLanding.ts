import type { VirusId } from "./viruses";

/** Copy + presentation for the landing screen; R₀ / IFR align with `DISEASE_PRESETS` in the simulator. */
export type VirusLandingMeta = {
  category: string;
  heroTitle: string;
  scientificName: string;
  description: string;
  /** Shown in stats row (model uses a single R₀ target per preset). */
  r0Label: string;
  fatalityLabel: string;
  transmission: string;
  /** Primary accent (hex) — sidebar ring, headings, stats highlight. */
  accent: string;
};

export const VIRUS_LANDING: Record<VirusId, VirusLandingMeta> = {
  covid_wuhan: {
    category: "Coronavirus",
    heroTitle: "COVID (Wuhan strain)",
    scientificName: "SARS-CoV-2",
    description:
      "A novel respiratory pathogen whose early Wuhan-line parameters anchor this preset. Transmission is modeled as respiratory spread with substantial asymptomatic contribution; severity spans mild illness to acute respiratory failure.",
    r0Label: "~2.5",
    fatalityLabel: "~0.5%",
    transmission: "Airborne / droplet",
    accent: "#f97316",
  },
  hantavirus_andes: {
    category: "Hantavirus",
    heroTitle: "Hantavirus (Andes)",
    scientificName: "Andes virus (ANDV)",
    description:
      "Rodent-associated zoonosis preset with low R₀ but very high case fatality in the model. Outbreak dynamics here emphasize environmental exposure rather than sustained aerosol superspreading.",
    r0Label: "~1.3",
    fatalityLabel: "~35%",
    transmission: "Rodent-borne / environmental",
    accent: "#a855f7",
  },
  h1n1_swine_flu: {
    category: "Influenza A",
    heroTitle: "H1N1 (swine flu)",
    scientificName: "Influenza A (H1N1)pdm09",
    description:
      "Pandemic influenza preset with short incubation and relatively low infection fatality at the population level. Vaccination effectiveness is nonzero in the model, reflecting seasonal flu immunization.",
    r0Label: "~1.6",
    fatalityLabel: "~0.02%",
    transmission: "Droplet / airborne",
    accent: "#3b82f6",
  },
  human_metapneumovirus: {
    category: "Paramyxovirus",
    heroTitle: "Human metapneumovirus",
    scientificName: "Human metapneumovirus (hMPV)",
    description:
      "Common respiratory virus preset with COVID-like R₀ in the simulator and moderate mortality. Often causes bronchiolitis; this preset emphasizes pediatric-style burden in a generic community.",
    r0Label: "~2.5",
    fatalityLabel: "~0.4%",
    transmission: "Respiratory droplets",
    accent: "#14b8a6",
  },
  influenza_a_h3n2: {
    category: "Influenza A",
    heroTitle: "Influenza A (H3N2)",
    scientificName: "Influenza A virus subtype H3N2",
    description:
      "Seasonal influenza preset with moderate R₀ and low infection fatality. Vaccination effectiveness is partial in the model, matching imperfect seasonal vaccine match.",
    r0Label: "~1.4",
    fatalityLabel: "~0.1%",
    transmission: "Droplet / contact",
    accent: "#ef4444",
  },
  spanish_flu: {
    category: "Influenza A",
    heroTitle: "Spanish flu",
    scientificName: "Influenza A (H1N1) — 1918",
    description:
      "Historical pandemic preset with elevated infection fatality versus typical seasonal flu and no vaccination lever in the model. Transmission routes are represented as droplet and airborne mixing.",
    r0Label: "~2.2",
    fatalityLabel: "~1.3%",
    transmission: "Droplet / airborne",
    accent: "#eab308",
  },
};
