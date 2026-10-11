import { ethers } from "ethers";
import { DEFAULT_DEPLOYMENTS, CONTRACT_ABIS } from "../constants";

const RPC_URL = "http://127.0.0.1:8545";

export function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
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

export async function claimFaucet(privateKey: string) {
  try {
    const signer = getSigner(privateKey);
    const tinrToken = new ethers.Contract(DEFAULT_DEPLOYMENTS.TestINR, CONTRACT_ABIS.TestINR, signer);
    const tx = await tinrToken.faucet();
    await tx.wait();
    return { success: true, txHash: tx.hash };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function listAirOnMarket(privateKey: string, amountAir: string, priceTinr: string) {
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
    return { success: false, error: err.message };
  }
}

export async function buyListing(privateKey: string, listingId: number, priceTinr: string) {
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
    return { success: false, error: err.message };
  }
}

export async function burnForCompliance(privateKey: string, period: string, amountAir: string) {
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
    return { success: false, error: err.message };
  }
}

export async function registerMinerOnChain(
  adminPrivateKey: string,
  minerIdStr: string,
  deviceAddress: string,
  ownerWallet: string,
  stickerIds: number[],
  geohash: string
) {
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
    return { success: false, error: err.message };
  }
}

export async function setMinerActiveOnChain(
  adminPrivateKey: string, minerIdStr: string, active: boolean
) {
  try {
    const signer = getSigner(adminPrivateKey);
    const registry = new ethers.Contract(DEFAULT_DEPLOYMENTS.MinerRegistry, CONTRACT_ABIS.MinerRegistry, signer);
    const minerId = ethers.keccak256(ethers.toUtf8Bytes(minerIdStr));
    const tx = active ? await registry.reactivateMiner(minerId) : await registry.suspendMiner(minerId);
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function setObligationOnChain(
  adminPrivateKey: string, company: string, period: string, amountAir: string
) {
  try {
    const signer = getSigner(adminPrivateKey);
    const compliance = new ethers.Contract(
      DEFAULT_DEPLOYMENTS.ComplianceRegistry, CONTRACT_ABIS.ComplianceRegistry, signer
    );
    const tx = await compliance.setObligation(company, period, ethers.parseEther(amountAir));
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getObligation(company: string, period: string) {
  try {
    const compliance = new ethers.Contract(
      DEFAULT_DEPLOYMENTS.ComplianceRegistry, CONTRACT_ABIS.ComplianceRegistry, getProvider()
    );
    const [amount, burnedToDate, exists] = await compliance.getObligation(company, period);
    return {
      exists: Boolean(exists),
      amount: ethers.formatEther(amount),
      burnedToDate: ethers.formatEther(burnedToDate),
    };
  } catch {
    return null;
  }
}
