import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IndexerDb } from "./db";

test("persists, deduplicates and aggregates C4 records", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aircoin-indexer-"));
  const file = path.join(dir, "store.json");
  const db = new IndexerDb(file);
  const event = {
    type: "mint", tx_hash: "0x" + "11".repeat(32), log_index: 0,
    block_number: 10, ts: 1000, data_json: "{}",
  };
  db.insertEvent(event);
  db.insertEvent(event);
  db.insertMint({
    miner_id: "miner-001", epoch: 1, amount: "100", to_address: "0x1",
    evidence_hash: "0x" + "22".repeat(32), tx_hash: event.tx_hash,
    block_number: 10, ts: 1000,
  });
  db.insertMint({
    miner_id: "miner-001", epoch: 1, amount: "100", to_address: "0x1",
    evidence_hash: "0x" + "22".repeat(32), tx_hash: event.tx_hash,
    block_number: 10, ts: 1000,
  });
  db.insertTrade({ listing_id: 1, seller: "0x1", buyer: "0x2", amount_air: "30",
    price_tinr: "90", tx_hash: "0xtrade", block_number: 11, ts: 1100 });
  db.insertBurn({ company: "0x2", period: "2026", amount: "20", obligation: "20",
    burned_to_date: "20", tx_hash: "0xburn", block_number: 12, ts: 1200 });

  const reloaded = new IndexerDb(file);
  assert.equal(reloaded.getRecentEvents().length, 1);
  assert.equal(reloaded.getMints("miner-001").length, 1);
  assert.deepEqual(reloaded.getTotals(), {
    mints: { count: 1, total: "100" }, trades: { count: 1 }, burns: { count: 1, total: "20" },
  });
  fs.rmSync(dir, { recursive: true, force: true });
});
