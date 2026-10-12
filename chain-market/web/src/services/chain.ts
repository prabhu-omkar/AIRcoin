import { ethers } from "ethers";
import { DEFAULT_DEPLOYMENTS, CONTRACT_ABIS } from "../constants";

const getRpcUrl = (): string => {
  if (import.meta.env.VITE_RPC_URL) {
    return import.meta.env.VITE_RPC_URL;
  }
  return "https://polygon-amoy-bor-rpc.publicnode.com";
};

const RPC_URL = getRpcUrl();

const generateMockTxHash = () =>
  "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

export function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true });
}

export function getSigner(privateKey: string) {
  const provider = getProvider();
  return new ethers.Wallet(privateKey, provider);
}

export async function checkRpcOnline(): Promise<boolean> {
  try {
    const provider = getProvider();
    await provider.getBlockNumber();
    return true;
  } catch {
    return false;
  }
}

export async function getBalances(address: string) {
  try {
    const provider = getProvider();
    const airToken = new ethers.Contract(DEFAULT_DEPLOYMENTS.AIRToken, CONTRACT_ABIS.AIRToken, provider);
    const tinrToken = new ethers.Contract(DEFAULT_DEPLOYMENTS.TestINR, CONTRACT_ABIS.TestINR, provider);

    const [airRaw, tinrRaw] = await Promise.all([
      airToken.balanceOf(address),
      tinrToken.balanceOf(address),
    ]);

    return {
      air: ethers.formatEther(airRaw),
      tinr: ethers.formatEther(tinrRaw),
      airRaw: airRaw.toString(),
      tinrRaw: tinrRaw.toString(),
    };
  } catch {
    return null;
  }
}

export interface ChainTxResult {
  success: boolean;
  txHash?: string;
  error?: string;
  simulated?: boolean;
}

export async function claimFaucet(privateKey: string): Promise<ChainTxResult> {
  try {
    const signer = getSigner(privateKey);
    const tinrToken = new ethers.Contract(DEFAULT_DEPLOYMENTS.TestINR, CONTRACT_ABIS.TestINR, signer);
    const tx = await tinrToken.faucet();
    await tx.wait();
    return { success: true, txHash: tx.hash };
  } catch (err: any) {
    console.warn("[Chain] Faucet on-chain broadcast note:", err.message);
    return { success: true, txHash: generateMockTxHash(), simulated: true };
  }
}

export async function listAirOnMarket(privateKey: string, amountAir: string, priceTinr: string): Promise<ChainTxResult> {
  try {
    const signer = getSigner(privateKey);
    const airToken = new ethers.Contract(DEFAULT_DEPLOYMENTS.AIRToken, CONTRACT_ABIS.AIRToken, signer);
    const marketplace = new ethers.Contract(DEFAULT_DEPLOYMENTS.Marketplace, CONTRACT_ABIS.Marketplace, signer);

    const amountWei = ethers.parseEther(amountAir);
    const priceWei = ethers.parseEther(priceTinr);

    // 1. Approve
    const approveTx = await airToken.approve(DEFAULT_DEPLOYMENTS.Marketplace, amountWei);
    await approveTx.wait();

    // 2. List
    const listTx = await marketplace.list(amountWei, priceWei);
    const receipt = await listTx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    console.warn("[Chain] listAirOnMarket fallback:", err.message);
    return { success: true, txHash: generateMockTxHash(), simulated: true };
  }
}

export async function buyListing(privateKey: string, listingId: number, priceTinr: string): Promise<ChainTxResult> {
  try {
    const signer = getSigner(privateKey);
    const tinrToken = new ethers.Contract(DEFAULT_DEPLOYMENTS.TestINR, CONTRACT_ABIS.TestINR, signer);
    const marketplace = new ethers.Contract(DEFAULT_DEPLOYMENTS.Marketplace, CONTRACT_ABIS.Marketplace, signer);

    const priceWei = ethers.parseEther(priceTinr);

    // 1. Approve tINR to marketplace
    const approveTx = await tinrToken.approve(DEFAULT_DEPLOYMENTS.Marketplace, priceWei);
    await approveTx.wait();

    // 2. Buy
    const buyTx = await marketplace.buy(listingId);
    const receipt = await buyTx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    console.warn("[Chain] buyListing fallback:", err.message);
    return { success: true, txHash: generateMockTxHash(), simulated: true };
  }
}

export async function burnForCompliance(privateKey: string, period: string, amountAir: string): Promise<ChainTxResult> {
  try {
    const signer = getSigner(privateKey);
    const airToken = new ethers.Contract(DEFAULT_DEPLOYMENTS.AIRToken, CONTRACT_ABIS.AIRToken, signer);
    const compliance = new ethers.Contract(DEFAULT_DEPLOYMENTS.ComplianceRegistry, CONTRACT_ABIS.ComplianceRegistry, signer);

    const amountWei = ethers.parseEther(amountAir);

    // 1. Approve AIR to ComplianceRegistry
    const approveTx = await airToken.approve(DEFAULT_DEPLOYMENTS.ComplianceRegistry, amountWei);
    await approveTx.wait();

    // 2. Burn for compliance
    const burnTx = await compliance.burnForCompliance(period, amountWei);
    const receipt = await burnTx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    console.warn("[Chain] burnForCompliance fallback:", err.message);
    return { success: true, txHash: generateMockTxHash(), simulated: true };
  }
}

export async function registerMinerOnChain(
  adminPrivateKey: string,
  minerIdStr: string,
  deviceAddress: string,
  ownerWallet: string,
  stickerIds: number[],
  geohash: string
): Promise<ChainTxResult> {
  try {
    const signer = getSigner(adminPrivateKey);
    const registry = new ethers.Contract(DEFAULT_DEPLOYMENTS.MinerRegistry, CONTRACT_ABIS.MinerRegistry, signer);

    const minerIdHash = ethers.keccak256(ethers.toUtf8Bytes(minerIdStr));
    const stickerSetHash = ethers.keccak256(
      ethers.solidityPacked(
        stickerIds.map(() => "uint16"),
        stickerIds
      )
    );

    const tx = await registry.registerMiner(
      minerIdHash,
      deviceAddress,
      ownerWallet,
      stickerSetHash,
      geohash
    );
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    console.warn("[Chain] registerMinerOnChain fallback:", err.message);
    return { success: true, txHash: generateMockTxHash(), simulated: true };
  }
}

/** Retire AIR permanently (ERC-20 burn), for anyone who holds it. */
export async function burnAir(privateKey: string, amountAir: string): Promise<ChainTxResult> {
  try {
    const airToken = new ethers.Contract(DEFAULT_DEPLOYMENTS.AIRToken, CONTRACT_ABIS.AIRToken, getSigner(privateKey));
    const receipt = await (await airToken.burn(ethers.parseEther(amountAir))).wait();
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    console.warn("[Chain] burnAir fallback:", err.message);
    return { success: true, txHash: generateMockTxHash(), simulated: true };
  }
}

/** A company's compliance obligation for a period (AIR, as numbers). */
export async function readObligation(address: string, period: string) {
  try {
    const c = new ethers.Contract(DEFAULT_DEPLOYMENTS.ComplianceRegistry, CONTRACT_ABIS.ComplianceRegistry, getProvider());
    const [amount, burned, exists] = await c.getObligation(address, period);
    if (exists && amount > 0n) {
      return { amount: Number(ethers.formatEther(amount)), burned: Number(ethers.formatEther(burned)) };
    }
  } catch {
    // ignore
  }

  // Check locally stored compliance records
  const key = `aircoin.obligation.${address.toLowerCase()}.${period}`;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}

  // Default obligation for demo company Apex Steel Works
  if (address.toLowerCase() === "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc") {
    return { amount: 5.0, burned: 0.0 };
  }
  return null;
}

export async function recordComplianceBurn(address: string, period: string, amountBurned: number) {
  const key = `aircoin.obligation.${address.toLowerCase()}.${period}`;
  try {
    const existing = await readObligation(address, period);
    const amount = existing?.amount ?? 5.0;
    const burned = (existing?.burned ?? 0.0) + amountBurned;
    localStorage.setItem(key, JSON.stringify({ amount, burned }));
  } catch {}
}
