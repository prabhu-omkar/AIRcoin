import { C4MinerData, MarketplaceListing, TradeItem, BurnItem, RejectionRecord } from "../types";
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const INDEXER_URL = (import.meta.env.VITE_INDEXER_URL || (API_BASE ? API_BASE : "http://localhost:3002")).replace(/\/+$/, "");
const VALIDATOR_URL = (import.meta.env.VITE_VALIDATOR_URL || (API_BASE ? API_BASE : "http://localhost:3001")).replace(/\/+$/, "");

export async function fetchMiner(minerId: string): Promise<C4MinerData | null> {
  try {
    const res = await fetch(`${INDEXER_URL}/v1/miners/${minerId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchMinerBalance(minerId: string) {
  try {
    const res = await fetch(`${INDEXER_URL}/v1/miners/${minerId}/balance`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchAddressBalance(address: string) {
  try {
    const res = await fetch(`${INDEXER_URL}/v1/balance/${address}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchMinerMints(minerId: string, limit = 20) {
  try {
    const res = await fetch(`${INDEXER_URL}/v1/miners/${minerId}/mints?limit=${limit}`);
    if (!res.ok) return { v: 1, miner_id: minerId, items: [] };
    return await res.json();
  } catch {
    return { v: 1, miner_id: minerId, items: [] };
  }
}

export async function fetchListings(): Promise<MarketplaceListing[]> {
  try {
    const res = await fetch(`${INDEXER_URL}/v1/listings`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

export async function fetchTrades(): Promise<TradeItem[]> {
  try {
    const res = await fetch(`${INDEXER_URL}/v1/trades`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

export async function fetchBurns(): Promise<BurnItem[]> {
  try {
    const res = await fetch(`${INDEXER_URL}/v1/burns`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

export async function fetchTotals() {
  try {
    const res = await fetch(`${INDEXER_URL}/v1/totals`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchRejections(): Promise<RejectionRecord[]> {
  try {
    const res = await fetch(`${VALIDATOR_URL}/v1/rejections`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

export async function submitAttestation(attestation: any) {
  const res = await fetch(`${VALIDATOR_URL}/v1/attestations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(attestation),
  });
  return await res.json();
}
