// The mock must speak exactly the v1 contracts, or the twin will break on real data.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { aqiFromPm25, EPOCH_MS, MockMiner, type MockOutput } from "./mock";
import { fromBaseUnits, toBaseUnits } from "../contracts";

const schemaDir = join(__dirname, "../../../../contracts-schema/schemas");
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
for (const f of readdirSync(schemaDir).filter((f) => f.endsWith(".schema.json"))) {
  ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, f), "utf8")));
}
const base = "https://aircoin.example/schemas/v1/";
const validators = {
  telemetry: ajv.getSchema(base + "c2-telemetry.schema.json")!,
  epoch: ajv.getSchema(base + "c2-epoch.schema.json")!,
  chain: ajv.getSchema(base + "c4-chain-event.schema.json")!,
  balance: ajv.compile({ $ref: base + "c4-chain-api.schema.json#/$defs/balance" }),
  mints: ajv.compile({ $ref: base + "c4-chain-api.schema.json#/$defs/mint_list" }),
};

function check(out: MockOutput) {
  const payload = out.kind === "mints" ? { v: 1, miner_id: "miner-001", items: out.payload } : out.payload;
  const validate = validators[out.kind];
  const ok = validate(payload);
  expect(validate.errors ?? [], `${out.kind} ${JSON.stringify(validate.errors)}`).toEqual([]);
  expect(ok).toBe(true);
}

describe("MockMiner", () => {
  it("emits schema-valid C2 and C4 through epochs, anti-cheat events and a rejection", () => {
    const t0 = Math.floor(Date.now() / EPOCH_MS) * EPOCH_MS + 5_000;
    const m = new MockMiner("miner-001", t0);
    const outs: MockOutput[] = [...m.snapshot()];
    for (let s = 0; s < 200; s++) {
      const now = t0 + s * 1000;
      if (s === 10) m.setPlant(7, "removed", now);
      if (s === 20) m.setPlant(12, "fake", now);
      if (s === 25) m.setPlant(3, "swap", now);
      if (s === 30) m.setScenario("festival_smog");
      if (s === 100) m.rejectNextEpoch();
      outs.push(...m.tick(now));
    }
    outs.forEach(check);

    const kinds = outs.map((o) => o.kind);
    expect(kinds.filter((k) => k === "telemetry")).toHaveLength(200);
    const epochs = outs.flatMap((o) => (o.kind === "epoch" ? [o.payload] : []));
    expect(epochs.some((e) => e.attestation.status === "accepted")).toBe(true);
    expect(epochs.some((e) => e.attestation.status === "rejected")).toBe(true);

    const last = outs.filter((o) => o.kind === "telemetry").at(-1)!.payload as import("../contracts").Telemetry;
    const status = Object.fromEntries(last.plants.map((p) => [p.tag_id, p.status]));
    expect(status[7]).toBe("removed");
    expect(status[12]).toBe("suspect");
    expect(status[3]).toBe("suspect");
    expect(last.plants.find((p) => p.tag_id === 7)!.rate_air_per_h).toBe(0);
    expect(new Set(last.flags.map((f) => f.code))).toEqual(new Set(["plant_removed", "low_liveness", "species_mismatch"]));
  });

  it("earns on the order of tens of AIR per day with 20 plants", () => {
    const t0 = Date.now();
    const m = new MockMiner("miner-001", t0);
    let rate = 0;
    for (let s = 0; s < 60; s++) {
      const out = m.tick(t0 + s * 1000).find((o) => o.kind === "telemetry")!;
      if (out.kind === "telemetry") rate = out.payload.plants.reduce((a, p) => a + p.rate_air_per_h, 0);
    }
    expect(rate * 24).toBeGreaterThan(10);
    expect(rate * 24).toBeLessThan(100);
  });
});

describe("helpers", () => {
  it("converts AIR base units", () => {
    expect(toBaseUnits(1)).toBe("1000000000000000000");
    expect(fromBaseUnits("20800000000000000")).toBeCloseTo(0.0208);
  });
  it("maps PM2.5 to AQI", () => {
    expect(aqiFromPm25(15)).toBe(25);
    expect(aqiFromPm25(300)).toBe(420);
  });
});
