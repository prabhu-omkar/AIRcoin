// Reads from an AIRcoin node's gateway (aircoind). Every miner node serves the same API.
import type { BurnItem, C4MinerData, MarketplaceListing, RejectionRecord, TradeItem } from "../types";

export const CHAIN_URL = (import.meta.env.VITE_CHAIN_URL || "http://localhost:8700").replace(/\/+$/, "");

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${CHAIN_URL}${path}`);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

const items = async <T>(path: string): Promise<T[]> => (await get<{ items?: T[] }>(path, {})).items ?? [];

export interface AccountInfo {
  address: string;
  air: string;
  tinr: string;
  nonce: number;
  is_admin: boolean;
  miners: string[];
  block_number: number;
}

export interface ChainStatus {
  chain_id: string;
  height: number;
  peers: number;
  catching_up: boolean;
  moniker: string;
  epoch: number;
}

export interface Obligation {
  company: string;
  company_name: string;
  period: string;
  amount: string;
  burned: string;
}

export interface Totals {
  block_number: number;
  minted: string;
  burned: string;
  circulating: string;
  miners: number;
  active_miners: number;
  open_listings: number;
  pending_applications: number;
}

export const fetchStatus = () => get<ChainStatus | null>("/v1/status", null);
export const fetchAccount = (address: string) => get<AccountInfo | null>(`/v1/accounts/${address.toLowerCase()}`, null);
export const fetchMiner = (minerId: string) => get<C4MinerData | null>(`/v1/miners/${minerId}`, null);
export const fetchMinerMints = (minerId: string, limit = 20) =>
  get<{ items: any[] }>(`/v1/miners/${minerId}/mints?limit=${limit}`, { items: [] });
export const fetchListings = () => items<MarketplaceListing>("/v1/listings");
export const fetchTrades = () => items<TradeItem>("/v1/trades");
export const fetchBurns = () => items<BurnItem>("/v1/burns");
export const fetchObligations = () => items<Obligation>("/v1/obligations");
export const fetchRejections = (minerId?: string) =>
  items<RejectionRecord>(`/v1/rejections${minerId ? `?miner_id=${minerId}` : ""}`);
export const fetchTotals = () => get<Totals | null>("/v1/totals", null);

export interface Application {
  id: number;
  applicant: string;
  name: string;
  location: { lat: number; lon: number; geofence_m: number; label?: string };
  plants_planned: number;
  note?: string;
  status: "pending" | "approved" | "rejected";
  miner_id?: string;
  reason?: string;
  submitted_at: number;
  decided_at?: number;
}

export interface MinerRow extends C4MinerData {
  node: { validator_address: string; power: number; blocks_proposed: number; proposer_rewards: string };
}

export const fetchApplications = () => items<Application>("/v1/applications");
export const fetchMinerList = () => items<MinerRow>("/v1/miners");
