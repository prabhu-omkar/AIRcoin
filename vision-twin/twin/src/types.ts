export type PlantStatus = "present" | "missing" | "removed" | "suspect";
export interface Plant { tag_id: number; species: string; status: PlantStatus; leaf_area_cm2: number; alive_score: number; species_conf?: number; rate_air_per_h: number }
export interface Flag { code: string; severity: "warn" | "critical"; ts: number; tag_id?: number; message: string }
export interface Telemetry {
  miner_id: string; ts: number; scenario?: string; sensors_simulated?: boolean; aqi?: number;
  sensors: Record<string, number>; gps: { lat: number; lon: number; fix: string; ts: number };
  plants: Plant[]; current_epoch: { epoch: number; start_ms: number; end_ms: number; running_air: number };
  flags: Flag[]; uplink?: { online: boolean; queued_attestations: number };
  device?: { cpu_temp_c?: number; cpu_pct?: number; mem_pct?: number; uptime_s?: number };
}
export interface Epoch { epoch: number; total_air: number; attestation: { status: string; amount?: string; tx_hash?: string }; flags: Flag[]; by_pollutant_mg: Record<string, number> }
export interface Balance { air: string; tinr: string }

