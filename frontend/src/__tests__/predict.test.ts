import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPredict } from "../predict";
import { fullIntervention, DEFAULT_USER_INTERVENTION } from "../interventionSliders";

const intervention = fullIntervention(DEFAULT_USER_INTERVENTION);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPredict", () => {
  it("posts virus_id + intervention sliders to /api/predict with mc defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ distribution: "mc" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPredict("covid_wuhan", intervention);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/predict");

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      virus_id: "covid_wuhan",
      distribution: "mc",
      n_runs: 10_000,
      sobol_base_n: 512,
      sensitivity_output: "total_deaths",
      intervention: {
        intervention_day: DEFAULT_USER_INTERVENTION.intervention_day,
        mask_compliance: DEFAULT_USER_INTERVENTION.mask_compliance,
        vaccination_rate: DEFAULT_USER_INTERVENTION.vaccination_rate,
        contact_reduction: DEFAULT_USER_INTERVENTION.contact_reduction,
      },
    });
    // symptomatic_contact_multiplier is fixed in the sim, not sent as a slider
    expect(body.intervention).not.toHaveProperty("symptomatic_contact_multiplier");
    expect(body).not.toHaveProperty("seed");
  });

  it("omits seed by default and includes it only when passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ distribution: "point" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPredict("covid_wuhan", intervention, { distribution: "point", seed: 7 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.distribution).toBe("point");
    expect(body.seed).toBe(7);
  });

  it("throws with the response body text when the request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Unknown preset 'nope'",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPredict("covid_wuhan", intervention)).rejects.toThrow(
      "Unknown preset 'nope'",
    );
  });

  it("falls back to a status-based message when the error body is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPredict("covid_wuhan", intervention)).rejects.toThrow(
      "Predict failed (503)",
    );
  });
});
