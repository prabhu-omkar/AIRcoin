import type { Epoch, Telemetry } from "./types";

const species = ["snake_plant","peace_lily","bamboo_palm","red_edged_dracaena","janet_craig_dracaena","english_ivy","chinese_evergreen","florists_chrysanthemum","weeping_fig","money_plant","spider_plant","aloe_vera","areca_palm","boston_fern","tulsi","hibiscus","neem","shisham","bougainvillea","yellow_oleander"];
const now = Date.now();
export const demoTelemetry: Telemetry = {
  miner_id: "miner-001", ts: now, scenario: "rush_hour", sensors_simulated: true, aqi: 194,
  sensors: { pm25_ugm3: 88.2, pm10_ugm3: 151, co2_ppm: 525, voc_index: 178, no2_ppb: 55.4, so2_ppb: 9.3, co_ppm: 1.84, temp_c: 30, humidity_pct: 47.5, pressure_hpa: 912.2 },
  gps: { lat: 12.9716, lon: 77.5946, fix: "fallback", ts: now },
  plants: species.map((name, tag_id) => ({ tag_id, species: name, status: tag_id === 7 ? "missing" : tag_id === 12 ? "suspect" : "present", leaf_area_cm2: tag_id === 7 ? 0 : 310 + tag_id * 7, alive_score: tag_id === 12 ? .12 : .86, species_conf: .91, rate_air_per_h: [7, 12].includes(tag_id) ? 0 : .072 })),
  current_epoch: { epoch: 29863320, start_ms: now - 42000, end_ms: now + 18000, running_air: .0205 },
  flags: [
    { code: "plant_missing", severity: "warn", ts: now - 5000, tag_id: 7, message: "Tag 7 unseen for 15 s" },
    { code: "low_liveness", severity: "critical", ts: now - 28000, tag_id: 12, message: "Possible fake plant" },
  ],
  uplink: { online: true, queued_attestations: 0 }, device: { cpu_temp_c: 61.2, cpu_pct: 48, mem_pct: 37.5, uptime_s: 5400 },
};
export const demoEpoch: Epoch = { epoch: 29863319, total_air: .027684, attestation: { status: "accepted", amount: "27684000000000000", tx_hash: "0x0a797b3c574efa1b50a3ac271bf9a621b3fa8b7a416038902e034af50d5d8e8c" }, flags: demoTelemetry.flags, by_pollutant_mg: { pm25: .00936, pm10: .01278, voc: .0378, co2: 5.58 } };

