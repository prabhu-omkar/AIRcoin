import fs from "fs";
import path from "path";

export interface EventRecord {
  id: number;
  type: string;
  tx_hash: string;
  log_index: number;
  block_number: number;
  ts: number;
  data_json: string;
}

export interface MintRecord {
  id: number;
  miner_id: string;
  epoch: number;
  amount: string;
  to_address: string;
  evidence_hash: string;
  tx_hash: string;
  block_number: number;
  ts: number;
}

export interface TradeRecord {
  id: number;
  listing_id: number;
  seller: string;
  buyer: string;
  amount_air: string;
  price_tinr: string;
  tx_hash: string;
  block_number: number;
  ts: number;
}

export interface BurnRecord {
  id: number;
  company: string;
  period: string;
  amount: string;
  obligation: string;
  burned_to_date: string;
  tx_hash: string;
  block_number: number;
  ts: number;
}

export class IndexerDb {
  private events: EventRecord[] = [];
  private mints: MintRecord[] = [];
  private trades: TradeRecord[] = [];
  private burns: BurnRecord[] = [];
  private dbPath: string;

  constructor(filePath?: string) {
    this.dbPath = filePath || path.join(__dirname, "..", "indexer-store.json");
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, "utf-8");
        const parsed = JSON.parse(raw);
        this.events = parsed.events || [];
        this.mints = parsed.mints || [];
        this.trades = parsed.trades || [];
        this.burns = parsed.burns || [];
      }
    } catch {
      this.events = [];
      this.mints = [];
      this.trades = [];
      this.burns = [];
    }
  }

  private save() {
    try {
      fs.writeFileSync(
        this.dbPath,
        JSON.stringify(
          {
            events: this.events,
            mints: this.mints,
            trades: this.trades,
            burns: this.burns,
          },
          null,
          2
        ),
        "utf-8"
      );
    } catch {
      // ignore
    }
  }

  insertEvent(record: Omit<EventRecord, "id">) {
    // Unique by tx_hash + log_index
    const exists = this.events.some(
      (e) => e.tx_hash === record.tx_hash && e.log_index === record.log_index
    );
    if (exists) return;

    this.events.push({
      id: this.events.length + 1,
      ...record,
    });
    this.save();
  }

  insertMint(record: Omit<MintRecord, "id">) {
    // Unique by miner_id + epoch
    const exists = this.mints.some(
      (m) => m.miner_id === record.miner_id && m.epoch === record.epoch
    );
    if (exists) return;

    this.mints.push({
      id: this.mints.length + 1,
      ...record,
    });
    this.save();
  }

  insertTrade(record: Omit<TradeRecord, "id">) {
    this.trades.push({
      id: this.trades.length + 1,
      ...record,
    });
    this.save();
  }

  insertBurn(record: Omit<BurnRecord, "id">) {
    this.burns.push({
      id: this.burns.length + 1,
      ...record,
    });
    this.save();
  }

  getMintStats(minerId: string) {
    const list = this.mints.filter((m) => m.miner_id === minerId);
    let total = 0n;
    for (const m of list) {
      try {
        total += BigInt(m.amount);
      } catch {}
    }
    const last = list.sort((a, b) => b.epoch - a.epoch)[0];
    return {
      cnt: list.length,
      total: total.toString(),
      lastMint: last
        ? {
            epoch: last.epoch,
            amount: last.amount,
            ts: last.ts,
          }
        : undefined,
    };
  }

  getMints(minerId: string, limit = 50, beforeEpoch?: number): MintRecord[] {
    let list = this.mints.filter((m) => m.miner_id === minerId);
    if (beforeEpoch != null) {
      list = list.filter((m) => m.epoch < beforeEpoch);
    }
    return list.sort((a, b) => b.epoch - a.epoch).slice(0, limit);
  }

  getRecentTrades(limit = 50): TradeRecord[] {
    return [...this.trades].sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  getRecentBurns(limit = 50): BurnRecord[] {
    return [...this.burns].sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  getRecentEvents(limit = 50): EventRecord[] {
    return [...this.events]
      .sort((a, b) => b.block_number - a.block_number || b.log_index - a.log_index)
      .slice(0, limit);
  }

  getTotals() {
    let mintTotal = 0n;
    for (const m of this.mints) {
      try {
        mintTotal += BigInt(m.amount);
      } catch {}
    }

    let burnTotal = 0n;
    for (const b of this.burns) {
      try {
        burnTotal += BigInt(b.amount);
      } catch {}
    }

    return {
      mints: { count: this.mints.length, total: mintTotal.toString() },
      trades: { count: this.trades.length },
      burns: { count: this.burns.length, total: burnTotal.toString() },
    };
  }
}
