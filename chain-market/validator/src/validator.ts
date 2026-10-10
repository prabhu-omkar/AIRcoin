import { ethers } from "ethers";
import path from "path";
import fs from "fs";
import { ValidatorDb, AttestationRecord } from "./db";

// ── Types ──

export interface Attestation {
  v: number;
  miner_id: string;
  epoch: number;
  start: number;
  end: number;
  gps: {
    lat: number;
    lon: number;
    alt_m?: number;
    fix: string;
    hdop?: number;
    satellites?: number;
    ts?: number;
  };
  sensor_summary: Record<string, any>;
  plants: Array<{
    tag_id: number;
    species: string;
    status: string;
    leaf_area_cm2: number;
    health: number;
    removed_mg: Record<string, number>;
    air: number;
  }>;
  frame_hashes?: string[];
  flags?: Array<{
    code: string;
    severity: string;
    ts: number;
    tag_id?: number;
    message?: string;
  }>;
  amount: string;
  calibration_hash: string;
  evidence_hash: string;
  signature: string;
}

export interface AttestationResponse {
  v: 1;
  miner_id: string;
  epoch: number;
  status: "accepted" | "pending" | "rejected";
  tx_hash?: string;
  amount?: string;
  reason_code?: string;
  reason?: string;
}

export type RejectionCode =
  | "malformed"
  | "bad_signature"
  | "unknown_miner"
  | "miner_inactive"
  | "sticker_not_registered"
  | "sticker_claimed_by_other_miner"
  | "gps_outside_geofence"
  | "amount_over_cap"
  | "epoch_already_minted"
  | "epoch_not_closed"
  | "evidence_hash_mismatch"
  | "calibration_mismatch"
  | "chain_error";

// ── Registry data ──

interface MinerInfo {
  miner_id: string;
  minerId_bytes32: string;
  device_address: string;
  owner_wallet: string;
  sticker_ids: number[];
  sticker_set_hash: string;
  geohash: string;
  geofence_m: number;
  lat: number;
  lon: number;
  status: string;
}

// ── Validator class ──

export class Validator {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private mintController: ethers.Contract;
  private minerRegistry: ethers.Contract;
  private db: ValidatorDb;
  private miners: Map<string, MinerInfo> = new Map();
  private perEpochCap: bigint = ethers.parseEther("1"); // 1 AIR default

  constructor(
    rpcUrl: string,
    privateKey: string,
    deployments: Record<string, string>,
    registryData: any
  ) {
    this.provider = new ethers.JsonRpcProvider(
      rpcUrl,
      ethers.Network.from(Number(deployments.chainId || 31337)),
      { staticNetwork: true }
    );
    this.signer = new ethers.Wallet(privateKey, this.provider);

    // MintController ABI
    const mintControllerABI = [
      "function mintForEpoch(bytes32 minerId, uint64 epoch, uint256 amount, bytes32 evidenceHash, bytes memory sig) external returns (bytes32)",
      "function minted(bytes32, uint64) external view returns (bool)",
      "function perEpochCap() external view returns (uint256)",
      "event EpochMinted(bytes32 indexed minerId, uint64 indexed epoch, address indexed to, uint256 amount, bytes32 evidenceHash, bytes32 txId)",
    ];

    const minerRegistryABI = [
      "function isActive(bytes32 minerId) external view returns (bool)",
      "function getDeviceAddress(bytes32 minerId) external view returns (address)",
      "function getOwnerWallet(bytes32 minerId) external view returns (address)",
    ];

    this.mintController = new ethers.Contract(
      deployments.MintController,
      mintControllerABI,
      this.signer
    );

    this.minerRegistry = new ethers.Contract(
      deployments.MinerRegistry,
      minerRegistryABI,
      this.provider
    );

    // Initialize Database
    this.db = new ValidatorDb();

    // Load miner registry
    this.loadRegistry(registryData);
  }

  private loadRegistry(registryData: any) {
    if (!registryData?.miners) return;
    for (const m of registryData.miners) {
      const info: MinerInfo = {
        miner_id: m.miner_id,
        minerId_bytes32: ethers.keccak256(ethers.toUtf8Bytes(m.miner_id)),
        device_address: m.device_address,
        owner_wallet: m.owner_wallet,
        sticker_ids: m.sticker_ids,
        sticker_set_hash: m.sticker_set_hash,
        geohash: m.location?.geohash || "",
        geofence_m: m.location?.geofence_m || 50,
        lat: m.location?.lat || 0,
        lon: m.location?.lon || 0,
        status: m.status,
      };
      this.miners.set(m.miner_id, info);
    }
    console.log(`[Validator] Loaded ${this.miners.size} miners from registry`);
  }

  async validate(attestation: Attestation): Promise<AttestationResponse> {
    const minerId = attestation.miner_id;
    const epoch = attestation.epoch;

    // 1. Basic structure
    if (!attestation.v || !minerId || epoch == null || !attestation.amount || !attestation.signature) {
      return this.reject(minerId, epoch, "malformed", "Missing required fields");
    }

    // 2. Check miner exists
    const miner = this.miners.get(minerId);
    if (!miner) {
      return this.reject(minerId, epoch, "unknown_miner", `Miner ${minerId} not in registry`);
    }

    // 3. Check miner active
    if (miner.status !== "active") {
      return this.reject(minerId, epoch, "miner_inactive", `Miner ${minerId} status: ${miner.status}`);
    }

    // 4. Check epoch not already minted (local check first)
    const existing = this.db.getAttestation(minerId, epoch);
    if (existing && existing.status === "accepted") {
      return this.reject(minerId, epoch, "epoch_already_minted", `Epoch ${epoch} already minted`, 409);
    }

    // 5. Check stickers belong to this miner
    if (attestation.plants) {
      for (const plant of attestation.plants) {
        if (!miner.sticker_ids.includes(plant.tag_id)) {
          // Check if another miner owns this sticker
          for (const [otherId, otherMiner] of this.miners.entries()) {
            if (otherId !== minerId && otherMiner.sticker_ids.includes(plant.tag_id)) {
              return this.reject(
                minerId,
                epoch,
                "sticker_claimed_by_other_miner",
                `Sticker ${plant.tag_id} is registered to ${otherId}`
              );
            }
          }
          return this.reject(
            minerId,
            epoch,
            "sticker_not_registered",
            `Sticker ${plant.tag_id} not registered to ${minerId}`
          );
        }
      }
    }

    // 6. GPS geofence check
    if (attestation.gps) {
      const dist = this.haversineDistance(
        miner.lat,
        miner.lon,
        attestation.gps.lat,
        attestation.gps.lon
      );
      if (dist > miner.geofence_m) {
        return this.reject(
          minerId,
          epoch,
          "gps_outside_geofence",
          `GPS ${dist.toFixed(0)}m from registered location (max ${miner.geofence_m}m)`
        );
      }
    }

    // 7. Amount cap
    const amount = BigInt(attestation.amount);
    if (amount > this.perEpochCap) {
      return this.reject(
        minerId,
        epoch,
        "amount_over_cap",
        `Amount ${attestation.amount} exceeds per-epoch cap`
      );
    }

    // 8. Verify signature
    try {
      const digest = ethers.keccak256(
        ethers.solidityPacked(
          ["bytes32", "uint64", "uint256", "bytes32"],
          [miner.minerId_bytes32, epoch, amount, attestation.evidence_hash]
        )
      );
      const recovered = ethers.verifyMessage(
        ethers.getBytes(digest),
        attestation.signature
      );

      if (recovered.toLowerCase() !== miner.device_address.toLowerCase()) {
        return this.reject(
          minerId,
          epoch,
          "bad_signature",
          `Signature recovered ${recovered}, expected ${miner.device_address}`
        );
      }
    } catch (e: any) {
      return this.reject(minerId, epoch, "bad_signature", `Signature verification failed: ${e.message}`);
    }

    // 9. Submit to chain
    try {
      const tx = await this.mintController.mintForEpoch(
        miner.minerId_bytes32,
        epoch,
        amount,
        attestation.evidence_hash,
        attestation.signature
      );
      const receipt = await tx.wait();

      const response: AttestationResponse = {
        v: 1,
        miner_id: minerId,
        epoch,
        status: "accepted",
        tx_hash: receipt.hash,
        amount: attestation.amount,
      };

      this.db.saveAttestation({
        miner_id: minerId,
        epoch,
        status: "accepted",
        amount: attestation.amount,
        tx_hash: receipt.hash,
        raw_json: JSON.stringify(attestation),
      });

      console.log(`[Validator] ✓ Minted ${minerId} epoch ${epoch}: ${receipt.hash}`);
      return response;
    } catch (e: any) {
      // Check for specific revert reasons
      const msg = e.message || "";
      if (msg.includes("epoch already minted")) {
        return this.reject(minerId, epoch, "epoch_already_minted", "Epoch already minted on-chain", 409);
      }
      if (msg.includes("miner not active")) {
        return this.reject(minerId, epoch, "miner_inactive", "Miner not active on-chain");
      }
      if (msg.includes("bad signature")) {
        return this.reject(minerId, epoch, "bad_signature", "Signature rejected on-chain");
      }
      if (msg.includes("amount out of range")) {
        return this.reject(minerId, epoch, "amount_over_cap", "Amount rejected on-chain");
      }
      return this.reject(minerId, epoch, "chain_error", `Chain error: ${msg}`);
    }
  }

  private reject(
    minerId: string,
    epoch: number,
    code: RejectionCode,
    reason: string,
    _httpCode: number = 422
  ): AttestationResponse {
    const response: AttestationResponse = {
      v: 1,
      miner_id: minerId,
      epoch,
      status: "rejected",
      reason_code: code,
      reason,
    };

    try {
      this.db.saveAttestation({
        miner_id: minerId,
        epoch,
        status: "rejected",
        reason_code: code,
        reason,
      });
    } catch {
      // ignore persistence errors on reject
    }

    console.log(`[Validator] ✗ Rejected ${minerId} epoch ${epoch}: ${code} — ${reason}`);
    return response;
  }

  /** Returns all rejections for the admin portal */
  getRejections(limit = 50): AttestationRecord[] {
    return this.db.getRejections(limit);
  }

  /** Returns all accepted attestations */
  getAccepted(limit = 50): AttestationRecord[] {
    return this.db.getAccepted(limit);
  }

  /** Haversine distance in meters */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
