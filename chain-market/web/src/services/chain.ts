// Writes to the AIRcoin chain. A transaction is {type, body, sig}: the node returns the
// exact text to sign (JCS of {chain_id, type, body}), the wallet signs it with EIP-191
// personal_sign, and any node relays it into a block. No gas, no contracts.
import { ethers } from "ethers";
import { CHAIN_URL, fetchAccount, fetchObligations } from "./api";

export interface ChainTxResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

async function sendTx(privateKey: string, type: string, fields: Record<string, unknown>): Promise<ChainTxResult> {
  try {
    const wallet = new ethers.Wallet(privateKey);
    const from = wallet.address.toLowerCase();
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
    return { success: false, error: err?.message ?? String(err) };
  }
}

const units = (v: string) => ethers.parseEther(v).toString();

/** Up to 1,000 test rupees to yourself. */
export const claimFaucet = (privateKey: string) =>
  sendTx(privateKey, "faucet", { to: new ethers.Wallet(privateKey).address.toLowerCase(), amount: units("1000") });

/** Escrow AIR in a market listing. */
export const listAirOnMarket = (privateKey: string, amountAir: string, priceTinr: string) =>
  sendTx(privateKey, "list", { amount_air: units(amountAir), price_tinr: units(priceTinr) });

export const buyListing = (privateKey: string, listingId: number) => sendTx(privateKey, "buy", { listing_id: listingId });

export const cancelListing = (privateKey: string, listingId: number) =>
  sendTx(privateKey, "cancel", { listing_id: listingId });

/** Burn AIR against a compliance period (counts toward the company's obligation). */
export const burnForCompliance = (privateKey: string, period: string, amountAir: string) =>
  sendTx(privateKey, "burn", { amount: units(amountAir), period, memo: "compliance retirement" });

/** Retire AIR permanently, for anyone who holds it. */
export const burnAir = (privateKey: string, amountAir: string) =>
  sendTx(privateKey, "burn", { amount: units(amountAir), memo: "voluntary retirement" });

export const transferToken = (privateKey: string, to: string, token: "AIR" | "TINR", amount: string) =>
  sendTx(privateKey, "transfer", { to: to.toLowerCase(), token, amount: units(amount) });

/** A citizen asks the regulator for a miner. */
export const applyForMiner = (
  privateKey: string,
  a: { name: string; lat: number; lon: number; label: string; plants: number; note?: string },
) =>
  sendTx(privateKey, "apply_miner", {
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
  adminKey: string,
  b: {
    application_id: number;
    miner_id: string;
    label: string;
    device_address: string;
    owner_wallet: string;
    sticker_ids: number[];
    location: { lat: number; lon: number; geofence_m: number; label?: string };
  },
) => sendTx(adminKey, "approve_miner", b);

export const rejectApplication = (adminKey: string, applicationId: number, reason: string) =>
  sendTx(adminKey, "reject_application", { application_id: applicationId, reason });

export const setMinerStatus = (adminKey: string, minerId: string, status: "active" | "suspended") =>
  sendTx(adminKey, "set_miner_status", { miner_id: minerId, status });
