import { DemoWallet } from "./types";

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
    name: "Apex Steel Works",
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
    privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  },
];
