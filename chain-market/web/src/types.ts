export type PersonaRole = "citizen" | "company" | "admin";

export interface DemoWallet {
  address: string;
  name: string;
  role: PersonaRole;
  description: string;
  privateKey?: string;
  companyName?: string;
  minerId?: string;
}

export interface C4MinerData {
  v: number;
  miner_id: string;
  device_address: string;
  owner_wallet: string;
  sticker_ids: number[];
  status: "pending" | "active" | "suspended" | "revoked";
  location: {
    lat: number;
    lon: number;
    geohash: string;
    geofence_m: number;
  };
  registered_at: number;
  totals: {
    minted: string;
    epochs_minted: number;
    epochs_rejected: number;
    last_mint_epoch?: number;
  };
}

export interface MintItem {
  miner_id: string;
  epoch: number;
  amount: string;
  to: string;
  evidence_hash: string;
  tx_hash: string;
  block_number: number;
  ts: number;
}

export interface MarketplaceListing {
  id: number;
  seller: string;
  amount_air: string;
  price_tinr: string;
  status: "active" | "sold" | "cancelled";
  created_at: number;
}

export interface TradeItem {
  id?: number;
  listing_id: number;
  seller: string;
  buyer: string;
  amount_air: string;
  price_tinr: string;
  tx_hash: string;
  block_number: number;
  ts: number;
}

export interface BurnItem {
  id?: number;
  company: string;
  company_name?: string;
  period: string;
  amount: string;
  obligation: string;
  burned_to_date: string;
  tx_hash: string;
  block_number: number;
  ts: number;
}

export interface RejectionRecord {
  id: number;
  miner_id: string;
  epoch: number;
  status: "rejected";
  reason_code: string;
  reason: string;
  created_at: string;
}

export interface MinerApplication {
  id: string;
  applicantName: string;
  ownerWallet: string;
  locationLabel: string;
  lat: number;
  lon: number;
  geohash: string;
  plantCount: number;
  status: "submitted" | "approved" | "shipped" | "active";
  submittedAt: number;
}
