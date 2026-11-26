// Writes to the AIRcoin chain. A transaction is {type, body, sig}: the node returns the
// exact text to sign (JCS of {chain_id, type, body}), the wallet signs it with EIP-191
// personal_sign, and any node relays it into a block. No gas, no contracts.
import { ethers } from "ethers";
import type { DemoWallet } from "../types";
import { CHAIN_URL, fetchAccount, fetchObligations } from "./api";

/** Signs with the demo key if the wallet has one, otherwise asks MetaMask (personal_sign). */
async function signerFor(wallet: DemoWallet): Promise<{ address: string; signMessage(m: string): Promise<string> }> {
  if (wallet.privateKey) return new ethers.Wallet(wallet.privateKey);
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("MetaMask is not available in this browser");
  return new ethers.BrowserProvider(eth).getSigner(wallet.address);
}

export interface ChainTxResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

async function sendTx(w: DemoWallet, type: string, fields: Record<string, unknown>): Promise<ChainTxResult> {
  try {
    const wallet = await signerFor(w);
    const from = w.address.toLowerCase();
    const acct = await fetchAccount(from);
    if (!acct) return { success: false, error: "AIRcoin node is not reachable" };
    const body = { ...fields, from, nonce: acct.nonce };

    const prep = await fetch(`${CHAIN_URL}/v1/tx/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, body }),
    });
    if (!prep.ok) return { success: false, error: `prepare failed (${prep.status})` };
    const { message } = await prep.json();
    const sig = await wallet.signMessage(message);

    const res = await fetch(`${CHAIN_URL}/v1/tx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, body, sig }),
    });
    const out = await res.json();
    if (res.ok && out.status === "committed") return { success: true, txHash: out.tx_hash };
    if (res.status === 202) return { success: true, txHash: out.tx_hash }; // still being included
    return { success: false, txHash: out.tx_hash, error: out.log || out.reason_code || out.error?.message || "rejected" };
  } catch (err: any) {
    if (err?.code === "ACTION_REJECTED" || err?.code === 4001) return { success: false, error: "Signature request was declined" };
    return { success: false, error: err?.shortMessage ?? err?.message ?? String(err) };
  }
}

const units = (v: string) => ethers.parseEther(v).toString();

/** Up to 1,000 test rupees to yourself. */
export const claimFaucet = (w: DemoWallet) => sendTx(w, "faucet", { to: w.address.toLowerCase(), amount: units("1000") });

/** Escrow AIR in a market listing. */
export const listAirOnMarket = (w: DemoWallet, amountAir: string, priceTinr: string) =>
  sendTx(w, "list", { amount_air: units(amountAir), price_tinr: units(priceTinr) });

export const buyListing = (w: DemoWallet, listingId: number) => sendTx(w, "buy", { listing_id: listingId });

export const cancelListing = (w: DemoWallet, listingId: number) =>
  sendTx(w, "cancel", { listing_id: listingId });

/** Burn AIR against a compliance period (counts toward the company's obligation). */
export const burnForCompliance = (w: DemoWallet, period: string, amountAir: string) =>
  sendTx(w, "burn", { amount: units(amountAir), period, memo: "compliance retirement" });

/** Retire AIR permanently, for anyone who holds it. */
export const burnAir = (w: DemoWallet, amountAir: string) =>
  sendTx(w, "burn", { amount: units(amountAir), memo: "voluntary retirement" });

export const transferToken = (w: DemoWallet, to: string, token: "AIR" | "TINR", amount: string) =>
  sendTx(w, "transfer", { to: to.toLowerCase(), token, amount: units(amount) });

/** A citizen asks the regulator for a miner. */
export const applyForMiner = (
  w: DemoWallet,
  a: { name: string; lat: number; lon: number; label: string; plants: number; note?: string },
) =>
  sendTx(w, "apply_miner", {
    name: a.name,
    location: { lat: a.lat, lon: a.lon, geofence_m: 50, label: a.label },
    plants_planned: a.plants,
    ...(a.note ? { note: a.note } : {}),
  });

/** A company's compliance obligation for a period (AIR, as numbers). */
export async function readObligation(address: string, period: string) {
  const o = (await fetchObligations()).find(
    (x) => x.company === address.toLowerCase() && x.period === period,
  );
  return o ? { amount: Number(ethers.formatEther(o.amount)), burned: Number(ethers.formatEther(o.burned)) } : null;
}

// ---------------------------------------------------------------- regulator (admin key)

export const approveMiner = (
  w: DemoWallet,
  b: {
    application_id: number;
    miner_id: string;
    label: string;
    device_address: string;
    owner_wallet: string;
    sticker_ids: number[];
    location: { lat: number; lon: number; geofence_m: number; label?: string };
  },
) => sendTx(w, "approve_miner", b);

export const rejectApplication = (
  w: DemoWallet, applicationId: number, reason: string) =>
  sendTx(w, "reject_application", { application_id: applicationId, reason });

export const setMinerStatus = (
  w: DemoWallet, minerId: string, status: "active" | "suspended") =>
  sendTx(w, "set_miner_status", { miner_id: minerId, status });
