import { ethers } from "ethers";
import path from "path";
import fs from "fs";
import { IndexerDb, EventRecord, MintRecord, TradeRecord, BurnRecord } from "./db";

// ── ABI fragments we need ──

const AIR_TOKEN_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event TokensMinted(address indexed to, uint256 amount)",
  "event TokensBurned(address indexed from, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
];

const TINR_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address) view returns (uint256)",
];

const MINT_CONTROLLER_ABI = [
  "event EpochMinted(bytes32 indexed minerId, uint64 indexed epoch, address indexed to, uint256 amount, bytes32 evidenceHash, bytes32 txId)",
];

const MARKETPLACE_ABI = [
  "event Listed(uint256 indexed id, address indexed seller, uint256 amountAir, uint256 priceTinr)",
  "event Bought(uint256 indexed id, address indexed buyer, address indexed seller, uint256 amountAir, uint256 priceTinr)",
  "event Cancelled(uint256 indexed id, address indexed seller)",
  "function listings(uint256) view returns (uint256 id, address seller, uint256 amountAir, uint256 priceTinr, uint8 status, uint256 createdAt)",
  "function activeListingCount() view returns (uint256)",
  "function getActiveListings(uint256 offset, uint256 limit) view returns (tuple(uint256 id, address seller, uint256 amountAir, uint256 priceTinr, uint8 status, uint256 createdAt)[])",
];

const COMPLIANCE_ABI = [
  "event ObligationSet(address indexed company, string period, uint256 amount)",
  "event BurnedForCompliance(address indexed company, string period, uint256 amount, uint256 obligation, uint256 burnedToDate)",
  "function getObligation(address, string) view returns (uint256 amount, uint256 burnedToDate, bool exists)",
  "function isCompliant(address, string) view returns (bool)",
];

const MINER_REGISTRY_ABI = [
  "event MinerRegistered(bytes32 indexed minerId, address deviceAddress, address ownerWallet, bytes32 stickerSetHash, string geohash)",
  "event MinerSuspended(bytes32 indexed minerId)",
  "event MinerReactivated(bytes32 indexed minerId)",
  "event MinerRevoked(bytes32 indexed minerId)",
  "function miners(bytes32) view returns (bytes32 minerId, address deviceAddress, address ownerWallet, bytes32 stickerSetHash, string geohash, uint8 status, uint256 registeredAt)",
  "function isActive(bytes32) view returns (bool)",
  "function minerCount() view returns (uint256)",
  "function minerIds(uint256) view returns (bytes32)",
];

// ── C4 Event types ──

export interface C4Event {
  v: 1;
  type: "mint" | "transfer" | "trade" | "burn";
  tx_hash: string;
  log_index: number;
  block_number: number;
  ts: number;
  data: any;
}

// ── Indexer ──

export class Indexer {
  private provider: ethers.JsonRpcProvider;
  private db: IndexerDb;
  private airToken: ethers.Contract;
  private tinrToken: ethers.Contract;
  private mintController: ethers.Contract;
  private marketplace: ethers.Contract;
  private complianceRegistry: ethers.Contract;
  private minerRegistry: ethers.Contract;
  private wsClients: Set<{
    send: (data: string) => void;
    filter?: { miner_id?: string; address?: string };
  }> = new Set();
  private minerIdMap: Map<string, string> = new Map(); // bytes32 → string miner_id
  private deployments: Record<string, string>;

  constructor(rpcUrl: string, deployments: Record<string, string>, registryData: any) {
    this.provider = new ethers.JsonRpcProvider(
      rpcUrl,
      ethers.Network.from(Number(deployments.chainId || 31337)),
      { staticNetwork: true }
    );
    this.deployments = deployments;

    this.airToken = new ethers.Contract(deployments.AIRToken, AIR_TOKEN_ABI, this.provider);
    this.tinrToken = new ethers.Contract(deployments.TestINR, TINR_ABI, this.provider);
    this.mintController = new ethers.Contract(deployments.MintController, MINT_CONTROLLER_ABI, this.provider);
    this.marketplace = new ethers.Contract(deployments.Marketplace, MARKETPLACE_ABI, this.provider);
    this.complianceRegistry = new ethers.Contract(deployments.ComplianceRegistry, COMPLIANCE_ABI, this.provider);
    this.minerRegistry = new ethers.Contract(deployments.MinerRegistry, MINER_REGISTRY_ABI, this.provider);

    // Build miner_id map
    if (registryData?.miners) {
      for (const m of registryData.miners) {
        const hash = ethers.keccak256(ethers.toUtf8Bytes(m.miner_id));
        this.minerIdMap.set(hash, m.miner_id);
      }
    }

    // Initialize Database
    this.db = new IndexerDb();
  }

  /** Start listening to contract events */
  async startListening() {
    console.log("[Indexer] Checking blockchain node connection...");
    const checkNode = async () => {
      try {
        await this.provider.getBlockNumber();
        return true;
      } catch {
        return false;
      }
    };

    let isConnected = await checkNode();
    if (!isConnected) {
      console.log("[Indexer] Blockchain node not reachable yet at RPC URL. Waiting for node before attaching event listeners...");
      const interval = setInterval(async () => {
        if (await checkNode()) {
          clearInterval(interval);
          this.attachListeners();
        }
      }, 3000);
      return;
    }

    this.attachListeners();
  }

  private attachListeners() {
    console.log("[Indexer] Blockchain node connected. Starting contract event listeners...");

    // Listen to MintController EpochMinted
    this.mintController.on("EpochMinted", async (minerId, epoch, to, amount, evidenceHash, _txId, event: any) => {
      const log = event.log;
      const block = await this.provider.getBlock(log.blockNumber);
      const ts = (block?.timestamp || Math.floor(Date.now() / 1000)) * 1000;
      const minerIdStr = this.minerIdMap.get(minerId) || minerId;

      const c4Event: C4Event = {
        v: 1,
        type: "mint",
        tx_hash: log.transactionHash,
        log_index: log.index,
        block_number: log.blockNumber,
        ts,
        data: {
          miner_id: minerIdStr,
          epoch: Number(epoch),
          amount: amount.toString(),
          to: to.toLowerCase(),
          evidence_hash: evidenceHash,
        },
      };

      this.storeEvent(c4Event);
      this.storeMint(c4Event);
      this.broadcast(c4Event);
      console.log(`[Indexer] Mint: ${minerIdStr} epoch ${epoch} → ${to} (${amount} AIR)`);
    });

    // Listen to Marketplace Bought
    this.marketplace.on("Bought", async (id, buyer, seller, amountAir, priceTinr, event: any) => {
      const log = event.log;
      const block = await this.provider.getBlock(log.blockNumber);
      const ts = (block?.timestamp || Math.floor(Date.now() / 1000)) * 1000;

      const c4Event: C4Event = {
        v: 1,
        type: "trade",
        tx_hash: log.transactionHash,
        log_index: log.index,
        block_number: log.blockNumber,
        ts,
        data: {
          listing_id: Number(id),
          seller: seller.toLowerCase(),
          buyer: buyer.toLowerCase(),
          amount_air: amountAir.toString(),
          price_tinr: priceTinr.toString(),
        },
      };

      this.storeEvent(c4Event);
      this.storeTrade(c4Event);
      this.broadcast(c4Event);
      console.log(`[Indexer] Trade #${id}: ${seller} → ${buyer} (${amountAir} AIR for ${priceTinr} tINR)`);
    });

    // Listen to ComplianceRegistry BurnedForCompliance
    this.complianceRegistry.on(
      "BurnedForCompliance",
      async (company, period, amount, obligation, burnedToDate, event: any) => {
        const log = event.log;
        const block = await this.provider.getBlock(log.blockNumber);
        const ts = (block?.timestamp || Math.floor(Date.now() / 1000)) * 1000;

        const c4Event: C4Event = {
          v: 1,
          type: "burn",
          tx_hash: log.transactionHash,
          log_index: log.index,
          block_number: log.blockNumber,
          ts,
          data: {
            company: company.toLowerCase(),
            period,
            amount: amount.toString(),
            obligation: obligation.toString(),
            burned_to_date: burnedToDate.toString(),
          },
        };

        this.storeEvent(c4Event);
        this.storeBurn(c4Event);
        this.broadcast(c4Event);
        console.log(`[Indexer] Burn: ${company} burned ${amount} AIR for period ${period}`);
      }
    );

    // Listen to AIRToken Transfer
    this.airToken.on("Transfer", async (from, to, value, event: any) => {
      const log = event.log;
      if (from === ethers.ZeroAddress || to === ethers.ZeroAddress) return;

      const block = await this.provider.getBlock(log.blockNumber);
      const ts = (block?.timestamp || Math.floor(Date.now() / 1000)) * 1000;

      const c4Event: C4Event = {
        v: 1,
        type: "transfer",
        tx_hash: log.transactionHash,
        log_index: log.index,
        block_number: log.blockNumber,
        ts,
        data: {
          from: from.toLowerCase(),
          to: to.toLowerCase(),
          amount: value.toString(),
          token: "AIR",
        },
      };

      this.storeEvent(c4Event);
      this.broadcast(c4Event);
      console.log(`[Indexer] Transfer: ${ethers.formatEther(value)} AIR ${from} → ${to}`);
    });

    console.log("[Indexer] Event listeners active");
  }

  // ── Storage ──

  private storeEvent(event: C4Event) {
    this.db.insertEvent({
      type: event.type,
      tx_hash: event.tx_hash,
      log_index: event.log_index,
      block_number: event.block_number,
      ts: event.ts,
      data_json: JSON.stringify(event.data),
    });
  }

  private storeMint(event: C4Event) {
    this.db.insertMint({
      miner_id: event.data.miner_id,
      epoch: event.data.epoch,
      amount: event.data.amount,
      to_address: event.data.to,
      evidence_hash: event.data.evidence_hash,
      tx_hash: event.tx_hash,
      block_number: event.block_number,
      ts: event.ts,
    });
  }

  private storeTrade(event: C4Event) {
    this.db.insertTrade({
      listing_id: event.data.listing_id,
      seller: event.data.seller,
      buyer: event.data.buyer,
      amount_air: event.data.amount_air,
      price_tinr: event.data.price_tinr,
      tx_hash: event.tx_hash,
      block_number: event.block_number,
      ts: event.ts,
    });
  }

  private storeBurn(event: C4Event) {
    this.db.insertBurn({
      company: event.data.company,
      period: event.data.period,
      amount: event.data.amount,
      obligation: event.data.obligation,
      burned_to_date: event.data.burned_to_date,
      tx_hash: event.tx_hash,
      block_number: event.block_number,
      ts: event.ts,
    });
  }

  // ── WebSocket broadcast ──

  addClient(client: { send: (data: string) => void; filter?: { miner_id?: string; address?: string } }) {
    this.wsClients.add(client);
  }

  removeClient(client: any) {
    this.wsClients.delete(client);
  }

  private broadcast(event: C4Event) {
    const msg = JSON.stringify(event);
    for (const client of this.wsClients) {
      if (client.filter?.miner_id && event.data.miner_id !== client.filter.miner_id) continue;
      if (client.filter?.address) {
        const addr = client.filter.address.toLowerCase();
        const d = event.data;
        if (d.to !== addr && d.from !== addr && d.seller !== addr && d.buyer !== addr && d.company !== addr) {
          continue;
        }
      }
      try {
        client.send(msg);
      } catch {
        this.wsClients.delete(client);
      }
    }
  }

  // ── C4 REST API queries ──

  /** GET /v1/miners/{miner_id} */
  async getMiner(minerIdStr: string) {
    const minerIdHash = ethers.keccak256(ethers.toUtf8Bytes(minerIdStr));
    try {
      const m = await this.minerRegistry.miners(minerIdHash);
      if (m.registeredAt === 0n) return null;

      const statusMap = ["pending", "active", "suspended", "revoked"];
      const stats = this.db.getMintStats(minerIdStr);

      return {
        v: 1,
        miner_id: minerIdStr,
        device_address: m.deviceAddress.toLowerCase(),
        owner_wallet: m.ownerWallet.toLowerCase(),
        sticker_ids: [],
        status: statusMap[Number(m.status)] || "unknown",
        location: {
          lat: 12.9716,
          lon: 77.5946,
          geohash: m.geohash,
          geofence_m: 50,
        },
        registered_at: Number(m.registeredAt) * 1000,
        totals: {
          minted: stats.total,
          epochs_minted: stats.cnt,
          epochs_rejected: 0,
          ...(stats.lastMint ? { last_mint_epoch: stats.lastMint.epoch } : {}),
        },
      };
    } catch {
      return null;
    }
  }

  /** GET /v1/miners/{miner_id}/balance */
  async getBalance(minerIdStr: string) {
    const minerIdHash = ethers.keccak256(ethers.toUtf8Bytes(minerIdStr));
    try {
      const m = await this.minerRegistry.miners(minerIdHash);
      if (m.registeredAt === 0n) return null;

      const ownerAddr = m.ownerWallet;
      const airBal = await this.airToken.balanceOf(ownerAddr);
      const tinrBal = await this.tinrToken.balanceOf(ownerAddr);
      const blockNumber = await this.provider.getBlockNumber();

      return {
        v: 1,
        miner_id: minerIdStr,
        address: ownerAddr.toLowerCase(),
        air: airBal.toString(),
        tinr: tinrBal.toString(),
        block_number: blockNumber,
      };
    } catch {
      return null;
    }
  }

  /** GET /v1/miners/{miner_id}/mints */
  getMints(minerIdStr: string, limit = 50, beforeEpoch?: number) {
    const rows = this.db.getMints(minerIdStr, limit + 1, beforeEpoch);
    const hasNext = rows.length > limit;
    if (hasNext) rows.pop();

    return {
      v: 1,
      miner_id: minerIdStr,
      items: rows.map((r) => ({
        miner_id: r.miner_id,
        epoch: r.epoch,
        amount: r.amount,
        to: r.to_address,
        evidence_hash: r.evidence_hash,
        tx_hash: r.tx_hash,
        block_number: r.block_number,
        ts: r.ts,
      })),
      ...(hasNext && rows.length > 0 ? { next_before_epoch: rows[rows.length - 1].epoch } : {}),
    };
  }

  /** Get recent trades */
  getRecentTrades(limit = 50) {
    return this.db.getRecentTrades(limit);
  }

  /** Get recent burns */
  getRecentBurns(limit = 50) {
    return this.db.getRecentBurns(limit);
  }

  /** Get all events */
  getRecentEvents(limit = 50) {
    return this.db.getRecentEvents(limit);
  }

  /** Get marketplace listings from chain */
  async getActiveListings() {
    try {
      const count = await this.marketplace.activeListingCount();
      if (count === 0n) return [];
      const listings = await this.marketplace.getActiveListings(0, Number(count));
      return listings.map((l: any) => ({
        id: Number(l.id),
        seller: l.seller.toLowerCase(),
        amount_air: l.amountAir.toString(),
        price_tinr: l.priceTinr.toString(),
        status: ["active", "sold", "cancelled"][Number(l.status)],
        created_at: Number(l.createdAt) * 1000,
      }));
    } catch {
      return [];
    }
  }

  /** Get balance for any address */
  async getAddressBalance(address: string) {
    const blockNumber = await this.provider.getBlockNumber();
    const airBal = await this.airToken.balanceOf(address);
    const tinrBal = await this.tinrToken.balanceOf(address);
    return {
      address: address.toLowerCase(),
      air: airBal.toString(),
      tinr: tinrBal.toString(),
      block_number: blockNumber,
    };
  }

  /** Get totals for admin dashboard */
  getTotals() {
    return this.db.getTotals();
  }
}
