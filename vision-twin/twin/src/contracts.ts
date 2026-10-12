// TypeScript mirror of the v1 contracts the twin consumes (C2, C4).
// Source of truth: contracts-schema/schemas/*.schema.json — keep in sync, never the other way round.
// src/sources/mock.test.ts validates the mock output against those schemas.

export type SpeciesId =
  | "snake_plant" | "peace_lily" | "bamboo_palm" | "red_edged_dracaena" | "janet_craig_dracaena"
  | "english_ivy" | "chinese_evergreen" | "florists_chrysanthemum" | "weeping_fig" | "money_plant"
  | "spider_plant" | "aloe_vera" | "areca_palm" | "boston_fern" | "tulsi" | "hibiscus" | "neem"
  | "shisham" | "bougainvillea" | "yellow_oleander";

export type Pollutant = "pm25" | "pm10" | "no2" | "so2" | "voc" | "co2" | "co";
export type PlantStatus = "present" | "missing" | "removed" | "suspect";
export type TokenAmount = string; // base units, 18 decimals

export interface Gps {
  lat: number;
  lon: number;
  alt_m?: number;
  fix: "none" | "2d" | "3d" | "fallback";
  hdop?: number;
  satellites?: number;
  ts?: number;
}

export interface SensorReadings {
  pm25_ugm3: number;
  pm10_ugm3: number;
  co2_ppm: number;
  voc_index: number;
  no2_ppb: number;
  so2_ppb?: number;
  co_ppm?: number;
  temp_c: number;
  humidity_pct: number;
  pressure_hpa?: number;
}

export type FlagCode =
  | "unknown_sticker" | "species_mismatch" | "low_liveness" | "plant_missing" | "plant_removed"
  | "gps_out_of_geofence" | "frozen_camera" | "too_many_new_plants" | "clock_drift";

export interface AnticheatFlag {
  code: FlagCode;
  severity: "info" | "warn" | "critical";
  ts: number;
  tag_id?: number;
  message?: string;
}

export interface TelemetryPlant {
  tag_id: number;
  species: SpeciesId | "unknown";
  status: PlantStatus;
  leaf_area_cm2: number;
  alive_score: number;
  species_conf?: number;
  rate_air_per_h: number;
}

/** C2 · miner/{id}/telemetry */
export interface Telemetry {
  v: 1;
  miner_id: string;
  ts: number;
  scenario?: string;
  sensors_simulated?: boolean;
  aqi?: number;
  sensors: SensorReadings;
  gps: Gps;
  plants: TelemetryPlant[];
  current_epoch: { epoch: number; start_ms: number; end_ms: number; running_air: number };
  flags: AnticheatFlag[];
  uplink?: { online?: boolean; queued_attestations?: number };
  device?: { cpu_temp_c?: number; cpu_pct?: number; mem_pct?: number; uptime_s?: number };
}

export type AttestationStatus = "pending" | "queued" | "submitted" | "accepted" | "rejected";

/** C2 · miner/{id}/epoch */
export interface EpochSummary {
  v: 1;
  miner_id: string;
  epoch: number;
  start_ms: number;
  end_ms: number;
  scenario?: string;
  plants: {
    tag_id: number;
    species: SpeciesId | "unknown";
    status: PlantStatus;
    leaf_area_cm2?: number;
    health?: number;
    removed_mg: Partial<Record<Pollutant, number>>;
    air: number;
  }[];
  by_pollutant_mg: Partial<Record<Pollutant, number>>;
  total_air: number;
  attestation: {
    status: AttestationStatus;
    evidence_hash?: string;
    amount?: TokenAmount;
    tx_hash?: string;
    reason_code?: string;
    reason?: string;
  };
  flags: AnticheatFlag[];
}

/** C4 · GET /v1/miners/{id}/balance */
export interface Balance {
  v: 1;
  miner_id: string;
  address: string;
  air: TokenAmount;
  tinr: TokenAmount;
  block_number: number;
}

export interface Mint {
  miner_id: string;
  epoch: number;
  amount: TokenAmount;
  to: string;
  evidence_hash: string;
  tx_hash: string;
  block_number: number;
  ts: number;
}

/** C4 · GET /v1/miners/{id}/mints */
export interface MintList {
  v: 1;
  miner_id: string;
  items: Mint[];
  next_before_epoch?: number;
}

/** C4 · WebSocket /v1/events */
export interface ChainEvent {
  v: 1;
  type: "mint" | "transfer" | "trade" | "burn";
  tx_hash: string;
  log_index: number;
  block_number: number;
  ts: number;
  explorer_url?: string;
  data: Record<string, unknown>;
}

export const AIR_DECIMALS = 18n;

/** Base-unit string -> decimal number (display only). */
export function fromBaseUnits(amount: TokenAmount): number {
  const v = BigInt(amount);
  const unit = 10n ** AIR_DECIMALS;
  return Number(v / unit) + Number(v % unit) / Number(unit);
}

/** Decimal AIR -> base-unit string (6 decimal places of precision). */
export function toBaseUnits(air: number): TokenAmount {
  return (BigInt(Math.round(air * 1e6)) * 10n ** (AIR_DECIMALS - 6n)).toString();
}
