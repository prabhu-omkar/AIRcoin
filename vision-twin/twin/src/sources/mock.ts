// Mock C2 (telemetry + epochs) and C4 (balance, mints, chain events) so the twin runs with
// no miner, broker or chain. Output follows contracts-schema v1 (see mock.test.ts).
import type {
  AnticheatFlag, Balance, ChainEvent, EpochSummary, Mint, PlantStatus, Pollutant, SensorReadings, SpeciesId,
  Telemetry, TelemetryPlant,
} from "../contracts";
import { fromBaseUnits, toBaseUnits } from "../contracts";
import { rigLayout } from "../config";
import { pollutantWeights } from "../species";

export const EPOCH_MS = 60_000;
const MISSING_AFTER_MS = 10_000;
const REMOVED_AFTER_MS = 60_000;
const ACCEPT_DELAY_MS = 3_000;

export type Scenario = "clean_morning" | "rush_hour" | "festival_smog" | "rain_washout";
export type PlantOverride = "removed" | "fake" | "swap";

const SCENARIOS: Record<Scenario, SensorReadings> = {
  clean_morning: { pm25_ugm3: 18, pm10_ugm3: 32, co2_ppm: 430, voc_index: 90, no2_ppb: 14, so2_ppb: 3, co_ppm: 0.4, temp_c: 24, humidity_pct: 68, pressure_hpa: 913 },
  rush_hour: { pm25_ugm3: 95, pm10_ugm3: 160, co2_ppm: 560, voc_index: 210, no2_ppb: 62, so2_ppb: 9, co_ppm: 2.1, temp_c: 29, humidity_pct: 55, pressure_hpa: 912 },
  festival_smog: { pm25_ugm3: 280, pm10_ugm3: 420, co2_ppm: 640, voc_index: 330, no2_ppb: 85, so2_ppb: 18, co_ppm: 3.4, temp_c: 22, humidity_pct: 74, pressure_hpa: 914 },
  rain_washout: { pm25_ugm3: 9, pm10_ugm3: 15, co2_ppm: 415, voc_index: 70, no2_ppb: 9, so2_ppb: 2, co_ppm: 0.3, temp_c: 21, humidity_pct: 92, pressure_hpa: 908 },
};

export const SCENARIO_NAMES = Object.keys(SCENARIOS) as Scenario[];

/** India NAQI sub-index for PM2.5 (24 h breakpoints), good enough for display. */
export function aqiFromPm25(pm: number): number {
  const bp: [number, number, number, number][] = [
    [0, 30, 0, 50], [30, 60, 50, 100], [60, 90, 100, 200], [90, 120, 200, 300], [120, 250, 300, 400], [250, 500, 400, 500],
  ];
  for (const [cl, ch, il, ih] of bp) if (pm <= ch) return Math.round(il + ((pm - cl) * (ih - il)) / (ch - cl));
  return 500;
}

/** Deterministic pseudo-random 0x-hex of `bytes` bytes. */
export function fakeHex(seed: string, bytes = 32): string {
  let h = 2166136261;
  let out = "";
  for (let i = 0; out.length < bytes * 2; i++) {
    for (const ch of `${seed}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return "0x" + out.slice(0, bytes * 2);
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export type MockOutput =
  | { kind: "telemetry"; payload: Telemetry }
  | { kind: "epoch"; payload: EpochSummary }
  | { kind: "balance"; payload: Balance }
  | { kind: "mints"; payload: Mint[] }
  | { kind: "chain"; payload: ChainEvent };

interface PlantState {
  tag_id: number;
  species: SpeciesId;
  baseArea: number;
  override?: PlantOverride;
  overrideSince?: number;
}

export class MockMiner {
  readonly minerId: string;
  readonly owner = fakeHex("owner-wallet", 20);
  scenario: Scenario = "rush_hour";
  private sensors: SensorReadings;
  private plants: PlantState[];
  private rand = rng(42);
  private epoch: number;
  private runningAir = 0;
  private epochPlantAir = new Map<number, number>();
  private epochSensors: SensorReadings[] = [];
  private balance = 0n;
  private block = 18_000;
  private mints: Mint[] = [];
  private pending: { at: number; epoch: EpochSummary }[] = [];
  private rejectNext = false;
  private startedAt: number;

  constructor(minerId: string, now: number) {
    this.minerId = minerId;
    this.startedAt = now;
    this.epoch = Math.floor(now / EPOCH_MS);
    this.sensors = { ...SCENARIOS[this.scenario] };
    this.plants = rigLayout.plants.map((p) => ({
      tag_id: p.tag_id,
      species: p.species as SpeciesId,
      baseArea: 300 + this.rand() * 350,
    }));
    // a little history so the wallet isn't empty on first load
    for (let k = 5; k >= 1; k--) this.mint(this.epoch - k, 0.018 + this.rand() * 0.006, now - k * EPOCH_MS);
  }

  setScenario(s: Scenario) {
    this.scenario = s;
  }

  setPlant(tag: number, override: PlantOverride | undefined, now: number) {
    const p = this.plants.find((x) => x.tag_id === tag);
    if (!p) return;
    p.override = override;
    p.overrideSince = override ? now : undefined;
  }

  plantOverride(tag: number) {
    return this.plants.find((x) => x.tag_id === tag)?.override;
  }

  rejectNextEpoch() {
    this.rejectNext = true;
  }

  /** Initial C4 state. */
  snapshot(): MockOutput[] {
    return [
      { kind: "balance", payload: this.balancePayload() },
      { kind: "mints", payload: [...this.mints] },
    ];
  }

  /** Advance to `now` (call about once per second). */
  tick(now: number): MockOutput[] {
    const out: MockOutput[] = [];
    const epochNow = Math.floor(now / EPOCH_MS);
    if (epochNow > this.epoch) {
      out.push({ kind: "epoch", payload: this.closeEpoch(now) });
      this.epoch = epochNow;
      this.runningAir = 0;
      this.epochPlantAir.clear();
      this.epochSensors = [];
    }
    for (const p of this.pending.filter((x) => x.at <= now)) out.push(...this.settle(p.epoch, now));
    this.pending = this.pending.filter((x) => x.at > now);

    this.stepSensors();
    this.epochSensors.push({ ...this.sensors });
    const plants = this.plants.map((p) => this.plantNow(p, now));
    for (const p of plants) {
      const air = p.rate_air_per_h / 3600;
      this.runningAir += air;
      this.epochPlantAir.set(p.tag_id, (this.epochPlantAir.get(p.tag_id) ?? 0) + air);
    }
    out.push({ kind: "telemetry", payload: this.telemetry(now, plants) });
    return out;
  }

  private stepSensors() {
    const target = SCENARIOS[this.scenario];
    const s = this.sensors as unknown as Record<string, number>;
    for (const [k, v] of Object.entries(target)) {
      const noise = (this.rand() - 0.5) * 0.04 * v;
      s[k] = Math.max(0, s[k] + (v - s[k]) * 0.08 + noise);
    }
    s.voc_index = Math.min(500, s.voc_index);
    s.humidity_pct = Math.min(100, s.humidity_pct);
  }

  private plantNow(p: PlantState, now: number): TelemetryPlant {
    const jitter = () => (this.rand() - 0.5) * 0.04;
    let status: PlantStatus = "present";
    let alive = 0.87 + jitter();
    let conf = 0.91 + jitter();
    let area = p.baseArea * (1 + jitter() / 4);
    if (p.override === "removed") {
      const gone = now - (p.overrideSince ?? now);
      status = gone >= REMOVED_AFTER_MS ? "removed" : gone >= MISSING_AFTER_MS ? "missing" : "present";
      if (gone >= MISSING_AFTER_MS) area = 0;
    } else if (p.override === "fake") {
      alive = 0.08 + Math.abs(jitter());
      conf = 0.55 + jitter();
      status = now - (p.overrideSince ?? now) >= 3000 ? "suspect" : "present";
    } else if (p.override === "swap") {
      conf = 0.32 + jitter();
      status = now - (p.overrideSince ?? now) >= 3000 ? "suspect" : "present";
    }
    const aqi = aqiFromPm25(this.sensors.pm25_ugm3);
    const rate = status === "present" && p.override !== "removed" ? 0.06 * (area / 450) * Math.min(2.5, 0.5 + aqi / 200) : 0;
    return {
      tag_id: p.tag_id,
      species: p.species,
      status,
      leaf_area_cm2: round(area, 1),
      alive_score: round(clamp01(alive), 3),
      species_conf: round(clamp01(conf), 3),
      rate_air_per_h: round(rate, 4),
    };
  }

  private flags(now: number): AnticheatFlag[] {
    const flags: AnticheatFlag[] = [];
    for (const p of this.plants) {
      if (!p.override || p.overrideSince === undefined) continue;
      const since = now - p.overrideSince;
      if (p.override === "removed" && since >= REMOVED_AFTER_MS) {
        flags.push({ code: "plant_removed", severity: "critical", ts: p.overrideSince + REMOVED_AFTER_MS, tag_id: p.tag_id, message: `tag ${p.tag_id} removed (unseen 60 s)` });
      } else if (p.override === "removed" && since >= MISSING_AFTER_MS) {
        flags.push({ code: "plant_missing", severity: "warn", ts: p.overrideSince + MISSING_AFTER_MS, tag_id: p.tag_id, message: `tag ${p.tag_id} missing (unseen 10 s)` });
      } else if (p.override === "fake" && since >= 3000) {
        flags.push({ code: "low_liveness", severity: "critical", ts: p.overrideSince + 3000, tag_id: p.tag_id, message: `tag ${p.tag_id}: no NDVI signal, possible fake plant` });
      } else if (p.override === "swap" && since >= 3000) {
        flags.push({ code: "species_mismatch", severity: "critical", ts: p.overrideSince + 3000, tag_id: p.tag_id, message: `tag ${p.tag_id}: plant does not match enrolment` });
      }
    }
    return flags;
  }

  private telemetry(now: number, plants: TelemetryPlant[]): Telemetry {
    const s = this.sensors;
    const start = this.epoch * EPOCH_MS;
    const rounded: SensorReadings = {
      pm25_ugm3: round(s.pm25_ugm3, 1), pm10_ugm3: round(s.pm10_ugm3, 1), co2_ppm: round(s.co2_ppm, 0),
      voc_index: round(s.voc_index, 0), no2_ppb: round(s.no2_ppb, 1), so2_ppb: round(s.so2_ppb ?? 0, 1),
      co_ppm: round(s.co_ppm ?? 0, 2), temp_c: round(s.temp_c, 1), humidity_pct: round(s.humidity_pct, 1),
      pressure_hpa: round(s.pressure_hpa ?? 913, 1),
    };
    return {
      v: 1,
      miner_id: this.minerId,
      ts: now,
      scenario: this.scenario,
      sensors_simulated: true,
      aqi: aqiFromPm25(s.pm25_ugm3),
      sensors: rounded,
      gps: { lat: 12.9716 + (this.rand() - 0.5) * 2e-5, lon: 77.5946 + (this.rand() - 0.5) * 2e-5, alt_m: 920, fix: "3d", hdop: 0.9, satellites: 9, ts: now },
      plants,
      current_epoch: { epoch: this.epoch, start_ms: start, end_ms: start + EPOCH_MS, running_air: round(this.runningAir, 6) },
      flags: this.flags(now),
      uplink: { online: true, queued_attestations: 0 },
      device: { cpu_temp_c: round(58 + this.rand() * 6, 1), cpu_pct: round(35 + this.rand() * 20, 1), mem_pct: round(38 + this.rand() * 4, 1), uptime_s: Math.floor((now - this.startedAt) / 1000) + 3600 },
    };
  }

  private closeEpoch(now: number): EpochSummary {
    // Split each plant's AIR across pollutants (display mix), then convert back to mg with the AIR weights.
    const mix: Partial<Record<Pollutant, number>> = { pm25: 0.3, pm10: 0.2, voc: 0.1, co2: 0.4 };
    const byPollutant: Partial<Record<Pollutant, number>> = {};
    const plants = this.plants.map((p) => {
      const air = this.epochPlantAir.get(p.tag_id) ?? 0;
      const removed: Partial<Record<Pollutant, number>> = {};
      if (air > 0) {
        for (const [k, share] of Object.entries(mix) as [Pollutant, number][]) {
          const mg = round((air * share) / pollutantWeights[k], 6);
          removed[k] = mg;
          byPollutant[k] = round((byPollutant[k] ?? 0) + mg, 6);
        }
      }
      const status = this.plantNow(p, now).status;
      return { tag_id: p.tag_id, species: p.species, status, leaf_area_cm2: round(p.baseArea, 1), health: air > 0 ? 0.87 : 0, removed_mg: removed, air: round(air, 6) };
    });
    const total = round(this.runningAir, 6);
    const start = this.epoch * EPOCH_MS;
    const summary: EpochSummary = {
      v: 1,
      miner_id: this.minerId,
      epoch: this.epoch,
      start_ms: start,
      end_ms: start + EPOCH_MS,
      scenario: this.scenario,
      plants,
      by_pollutant_mg: byPollutant,
      total_air: total,
      attestation: { status: "submitted", evidence_hash: fakeHex(`evidence-${this.epoch}`), amount: toBaseUnits(total) },
      flags: this.flags(now),
    };
    this.pending.push({ at: now + ACCEPT_DELAY_MS, epoch: summary });
    return summary;
  }

  private settle(e: EpochSummary, now: number): MockOutput[] {
    if (this.rejectNext) {
      this.rejectNext = false;
      return [{
        kind: "epoch",
        payload: { ...e, attestation: { ...e.attestation, status: "rejected", reason_code: "sticker_claimed_by_other_miner", reason: "Sticker 3 is registered to another miner" } },
      }];
    }
    const mint = this.mint(e.epoch, e.total_air, now);
    const accepted: EpochSummary = { ...e, attestation: { ...e.attestation, status: "accepted", tx_hash: mint.tx_hash } };
    const event: ChainEvent = {
      v: 1, type: "mint", tx_hash: mint.tx_hash, log_index: 0, block_number: mint.block_number, ts: now,
      data: { miner_id: mint.miner_id, epoch: mint.epoch, to: mint.to, amount: mint.amount, evidence_hash: mint.evidence_hash },
    };
    return [
      { kind: "epoch", payload: accepted },
      { kind: "chain", payload: event },
      { kind: "balance", payload: this.balancePayload() },
    ];
  }

  private mint(epoch: number, air: number, now: number): Mint {
    const amount = toBaseUnits(air);
    this.balance += BigInt(amount);
    this.block += 30;
    const mint: Mint = {
      miner_id: this.minerId, epoch, amount, to: this.owner, evidence_hash: fakeHex(`evidence-${epoch}`),
      tx_hash: fakeHex(`tx-${epoch}`), block_number: this.block, ts: now,
    };
    this.mints = [mint, ...this.mints].slice(0, 50);
    return mint;
  }

  private balancePayload(): Balance {
    return { v: 1, miner_id: this.minerId, address: this.owner, air: this.balance.toString(), tinr: "500000000000000000000", block_number: this.block };
  }

  balanceAir() {
    return fromBaseUnits(this.balance.toString());
  }
}

function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}
