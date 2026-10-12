import { DemoWallet } from "./types";

export const DEFAULT_DEPLOYMENTS = {
  chainId: 80002,
  deployer: "0xAf2031624A4423F55a0b50d74042DcE4C8136e5E",
  AIRToken: "0x7388415fBf7C817CC15b09f03BAaFc05044FB911",
  TestINR: "0x30Bc6d7f428416bAeC6E00B110cF866AD04Fc2Ab",
  MinerRegistry: "0x5190eBE58f9061A739c2E53F021cA935B7aac1ec",
  MintController: "0xaE768B5A97b782C6cb171acd9f24d4d45b5a6557",
  Marketplace: "0x43FC1D02B74772f47f7645be819eD7b96A889d79",
  ComplianceRegistry: "0x04b55e1dD7aF920d016e9aDb5c01Ee457E9E3831",
};

export const DEMO_WALLETS: DemoWallet[] = [
  {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    name: "Alice (Miner Owner)",
    role: "citizen",
    minerId: "miner-001",
    description: "Bangalore Urban Garden · 20 Tagged Plants · Active Miner",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
  {
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    name: "Apex Steel Works (Obligated Entity)",
    role: "company",
    companyName: "Apex Steel Works Ltd",
    description: "Industrial Polluter · Mandatory 2026 Offset Obligation: 5.0 AIR",
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  },
  {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    name: "CPCB Environmental Regulator",
    role: "admin",
    description: "Central Pollution Control Board · Fleet Oversight & Compliance Auditing",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  {
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    name: "Rohan (Miner Owner 2)",
    role: "citizen",
    minerId: "miner-002",
    description: "Electronic City Rooftop · 20 Virtual Plants",
    privateKey: "0x47e179ec340f649b83565e01608dd339feb1abae4e1b64963a409658a976ae21",
  },
];

export const CONTRACT_ABIS = {
  AIRToken: [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function burn(uint256 amount)",
  ],
  TestINR: [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function faucet()",
    "function mintTo(address to, uint256 amount)",
  ],
  MinerRegistry: [
    "function registerMiner(bytes32 minerId, address deviceAddress, address ownerWallet, bytes32 stickerSetHash, string geohash)",
    "function suspendMiner(bytes32 minerId)",
    "function reactivateMiner(bytes32 minerId)",
    "function revokeMiner(bytes32 minerId)",
    "function isActive(bytes32 minerId) view returns (bool)",
    "function getDeviceAddress(bytes32 minerId) view returns (address)",
    "function getOwnerWallet(bytes32 minerId) view returns (address)",
    "function miners(bytes32) view returns (bytes32 minerId, address deviceAddress, address ownerWallet, bytes32 stickerSetHash, string geohash, uint8 status, uint256 registeredAt)",
  ],
  Marketplace: [
    "function list(uint256 amountAir, uint256 priceTinr) returns (uint256)",
    "function buy(uint256 id)",
    "function cancel(uint256 id)",
    "function activeListingCount() view returns (uint256)",
    "function listings(uint256) view returns (uint256 id, address seller, uint256 amountAir, uint256 priceTinr, uint8 status, uint256 createdAt)",
  ],
  ComplianceRegistry: [
    "function setObligation(address company, string period, uint256 amount)",
    "function burnForCompliance(string period, uint256 amount)",
    "function getObligation(address company, string period) view returns (uint256 amount, uint256 burnedToDate, bool exists)",
    "function isCompliant(address company, string period) view returns (bool)",
  ],
};

export const SPECIES_CATALOGUE = [
  { id: "neem", name: "Neem (Azadirachta indica)", pm25Rate: 14.8, co2Rate: 22.0, leafAreaCm2: 450 },
  { id: "peepal", name: "Peepal (Ficus religiosa)", pm25Rate: 18.2, co2Rate: 28.5, leafAreaCm2: 680 },
  { id: "banyan", name: "Banyan (Ficus benghalensis)", pm25Rate: 21.0, co2Rate: 31.0, leafAreaCm2: 890 },
  { id: "tulsi", name: "Holy Basil (Ocimum tenuiflorum)", pm25Rate: 6.4, co2Rate: 12.0, leafAreaCm2: 120 },
  { id: "snake_plant", name: "Snake Plant (Sansevieria)", pm25Rate: 11.2, co2Rate: 16.4, leafAreaCm2: 320 },
  { id: "areca_palm", name: "Areca Palm (Dypsis lutescens)", pm25Rate: 15.6, co2Rate: 24.1, leafAreaCm2: 540 },
];
