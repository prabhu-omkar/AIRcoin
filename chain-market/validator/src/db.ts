import fs from "fs";
import path from "path";

export interface AttestationRecord {
  id: number;
  miner_id: string;
  epoch: number;
  status: "accepted" | "rejected";
  amount?: string;
  tx_hash?: string;
  reason_code?: string;
  reason?: string;
  raw_json?: string;
  created_at: string;
}

export class ValidatorDb {
  private records: AttestationRecord[] = [];
  private dbPath: string;
  private nextId = 1;

  constructor(filePath?: string) {
    this.dbPath = filePath || path.join(__dirname, "..", "validator-store.json");
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, "utf-8");
        this.records = JSON.parse(raw);
        if (this.records.length > 0) {
          this.nextId = Math.max(...this.records.map((r) => r.id || 0)) + 1;
        }
      }
    } catch (e) {
      this.records = [];
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.records, null, 2), "utf-8");
    } catch {
      // ignore persistence error
    }
  }

  saveAttestation(record: Omit<AttestationRecord, "id" | "created_at"> & { created_at?: string }) {
    // Unique check by (miner_id, epoch)
    const existingIndex = this.records.findIndex(
      (r) => r.miner_id === record.miner_id && r.epoch === record.epoch
    );

    const fullRecord: AttestationRecord = {
      id: existingIndex >= 0 ? this.records[existingIndex].id : this.nextId++,
      created_at: new Date().toISOString(),
      ...record,
    };

    if (existingIndex >= 0) {
      this.records[existingIndex] = fullRecord;
    } else {
      this.records.push(fullRecord);
    }

    this.save();
    return fullRecord;
  }

  getAttestation(miner_id: string, epoch: number): AttestationRecord | undefined {
    return this.records.find((r) => r.miner_id === miner_id && r.epoch === epoch);
  }

  getRejections(limit = 50): AttestationRecord[] {
    return this.records
      .filter((r) => r.status === "rejected")
      .sort((a, b) => b.epoch - a.epoch)
      .slice(0, limit);
  }

  getAccepted(limit = 50): AttestationRecord[] {
    return this.records
      .filter((r) => r.status === "accepted")
      .sort((a, b) => b.epoch - a.epoch)
      .slice(0, limit);
  }
}
