import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const isLive = net.chainId !== 31337n;

  console.log("=== AIRcoin Smart Contract Deployment ===");
  console.log("Network:", net.name, `(Chain ID: ${net.chainId})`);
  console.log("Deployer:", deployer.address);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "POL/ETH");

  const deployFile = path.join(__dirname, "../deployments.json");
  let addresses: any = {
    chainId: Number(net.chainId),
    network: net.name,
    deployer: deployer.address,
  };

  if (fs.existsSync(deployFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(deployFile, "utf-8"));
      if (existing.chainId === Number(net.chainId)) {
        addresses = { ...existing };
      }
    } catch {}
  }

  const save = () => {
    addresses.deployedAt = new Date().toISOString();
    fs.writeFileSync(deployFile, JSON.stringify(addresses, null, 2));
  };

  async function getOrDeploy(
    name: string,
    deployFn: () => Promise<any>
  ): Promise<{ contract: any; address: string }> {
    const existingAddr = addresses[name];
    if (existingAddr) {
      const code = await ethers.provider.getCode(existingAddr);
      if (code && code !== "0x") {
        console.log(`[Reusing] ${name} already deployed at: ${existingAddr}`);
        const factory = await ethers.getContractFactory(name);
        return { contract: factory.attach(existingAddr), address: existingAddr };
      }
    }

    console.log(`[Deploying] ${name}...`);
    const contract = await deployFn();
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    console.log(`[Deployed] ${name} at: ${addr}`);
    addresses[name] = addr;
    save();
    return { contract, address: addr };
  }

  // 1. AIRToken
  const AIRToken = await ethers.getContractFactory("AIRToken");
  const { contract: airToken, address: airAddr } = await getOrDeploy("AIRToken", () =>
    AIRToken.deploy(deployer.address)
  );

  // 2. TestINR
  const TestINR = await ethers.getContractFactory("TestINR");
  const { contract: testINR, address: tinrAddr } = await getOrDeploy("TestINR", () =>
    TestINR.deploy()
  );

  // 3. MinerRegistry
  const MinerRegistry = await ethers.getContractFactory("MinerRegistry");
  const { contract: minerRegistry, address: registryAddr } = await getOrDeploy("MinerRegistry", () =>
    MinerRegistry.deploy(deployer.address)
  );

  const deployOpts = isLive ? { gasLimit: 1100000 } : {};

  // 4. MintController
  const MintController = await ethers.getContractFactory("MintController");
  const { contract: mintController, address: controllerAddr } = await getOrDeploy("MintController", () =>
    MintController.deploy(airAddr, registryAddr, deployer.address, deployOpts)
  );

  // Grant MINTER_ROLE to MintController on AIRToken
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const hasRole = await airToken.hasRole(MINTER_ROLE, controllerAddr);
  if (!hasRole) {
    console.log("Granting MINTER_ROLE to MintController...");
    const tx = await airToken.grantRole(MINTER_ROLE, controllerAddr, deployOpts);
    await tx.wait();
    console.log("[OK] Granted MINTER_ROLE to MintController");
  } else {
    console.log("[OK] MintController already has MINTER_ROLE");
  }

  // 5. Marketplace
  const Marketplace = await ethers.getContractFactory("Marketplace");
  const { address: marketAddr } = await getOrDeploy("Marketplace", () =>
    Marketplace.deploy(airAddr, tinrAddr, deployOpts)
  );

  // 6. ComplianceRegistry
  const ComplianceRegistry = await ethers.getContractFactory("ComplianceRegistry");
  const { address: complianceAddr } = await getOrDeploy("ComplianceRegistry", () =>
    ComplianceRegistry.deploy(deployer.address, airAddr, deployOpts)
  );

  save();
  console.log("\n[OK] All contracts deployed successfully!");
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
