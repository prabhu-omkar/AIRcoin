import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seed script: registers demo miners, seeds tINR to demo wallets,
 * and sets a compliance obligation for a demo company.
 *
 * Uses the registry example from contracts-schema as reference.
 */
async function main() {
  const seedDataPath = path.join(__dirname, "..", "seed-data.json");
  const existingSeed = fs.existsSync(seedDataPath)
    ? JSON.parse(fs.readFileSync(seedDataPath, "utf-8"))
    : null;
  const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments.json"), "utf-8")
  );

  const signers = await ethers.getSigners();
  const admin = signers[0];
  const minerOwner = signers[1];     // citizen / miner owner
  const companyWallet = signers[2];  // company (polluter)
  const minerOwner2 = signers[3];    // second miner owner

  console.log("=== Demo Accounts ===");
  console.log("Admin (gov):", admin.address);
  console.log("Miner Owner 1:", minerOwner.address);
  console.log("Company:", companyWallet.address);
  console.log("Miner Owner 2:", minerOwner2.address);

  // Get contract instances
  const minerRegistry = await ethers.getContractAt("MinerRegistry", deployments.MinerRegistry);
  const testINR = await ethers.getContractAt("TestINR", deployments.TestINR);
  const complianceRegistry = await ethers.getContractAt("ComplianceRegistry", deployments.ComplianceRegistry);

  // --- Register demo miner-001 ---
  const minerId1 = ethers.keccak256(ethers.toUtf8Bytes("miner-001"));
  // Reuse demo device keys across local-chain resets. This keeps signed epochs in
  // miner-core's offline queue valid after the contracts are redeployed.
  const deviceWallet1 = new ethers.Wallet(
    existingSeed?.miners?.["miner-001"]?.devicePrivateKey || ethers.Wallet.createRandom().privateKey
  );
  const stickerIds1 = Array.from({ length: 20 }, (_, i) => i);  // 0-19
  const stickerSetHash1 = ethers.keccak256(
    ethers.solidityPacked(
      stickerIds1.map(() => "uint16"),
      stickerIds1
    )
  );

  await minerRegistry.registerMiner(
    minerId1,
    deviceWallet1.address,
    minerOwner.address,
    stickerSetHash1,
    "tdr1v9qtj"
  );
  console.log("\n✓ Registered miner-001");
  console.log("  Device address:", deviceWallet1.address);
  console.log("  Device private key:", deviceWallet1.privateKey);
  console.log("  Owner wallet:", minerOwner.address);

  // --- Register demo miner-002 (virtual, for sticker-reuse test) ---
  const minerId2 = ethers.keccak256(ethers.toUtf8Bytes("miner-002"));
  const deviceWallet2 = new ethers.Wallet(
    existingSeed?.miners?.["miner-002"]?.devicePrivateKey || ethers.Wallet.createRandom().privateKey
  );
  const stickerIds2 = Array.from({ length: 20 }, (_, i) => i + 20);  // 20-39
  const stickerSetHash2 = ethers.keccak256(
    ethers.solidityPacked(
      stickerIds2.map(() => "uint16"),
      stickerIds2
    )
  );

  await minerRegistry.registerMiner(
    minerId2,
    deviceWallet2.address,
    minerOwner2.address,
    stickerSetHash2,
    "tdr1w6u3j"
  );
  console.log("\n✓ Registered miner-002 (virtual)");
  console.log("  Device address:", deviceWallet2.address);
  console.log("  Owner wallet:", minerOwner2.address);

  // --- Seed tINR to company ---
  const seedAmount = ethers.parseEther("100000"); // 100,000 tINR
  await testINR.mintTo(companyWallet.address, seedAmount);
  await testINR.mintTo(minerOwner.address, ethers.parseEther("1000"));
  console.log("\n✓ Seeded tINR");
  console.log("  Company:", ethers.formatEther(seedAmount), "tINR");
  console.log("  Miner Owner 1: 1,000 tINR");

  // --- Set compliance obligation for company ---
  await complianceRegistry.setObligation(
    companyWallet.address,
    "2026",
    ethers.parseEther("5")  // 5 AIR obligation
  );
  console.log("\n✓ Set compliance obligation");
  console.log("  Company:", companyWallet.address);
  console.log("  Period: 2026");
  console.log("  Amount: 5 AIR");

  // --- Write seed data ---
  const seedData = {
    accounts: {
      admin: { address: admin.address, role: "government" },
      minerOwner1: { address: minerOwner.address, role: "citizen" },
      company: { address: companyWallet.address, role: "company", name: "Demo Steel Works" },
      minerOwner2: { address: minerOwner2.address, role: "citizen" },
    },
    miners: {
      "miner-001": {
        minerId: minerId1,
        deviceAddress: deviceWallet1.address,
        devicePrivateKey: deviceWallet1.privateKey,
        ownerWallet: minerOwner.address,
        stickerIds: stickerIds1,
        geohash: "tdr1v9qtj",
        label: "Demo rig",
      },
      "miner-002": {
        minerId: minerId2,
        deviceAddress: deviceWallet2.address,
        devicePrivateKey: deviceWallet2.privateKey,
        ownerWallet: minerOwner2.address,
        stickerIds: stickerIds2,
        geohash: "tdr1w6u3j",
        label: "Virtual miner B",
        virtual: true,
      },
    },
  };

  fs.writeFileSync(
    seedDataPath,
    JSON.stringify(seedData, null, 2)
  );
  console.log("\n✓ Seed data written to seed-data.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
