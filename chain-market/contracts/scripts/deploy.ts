import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // 1. AIRToken
  const AIRToken = await ethers.getContractFactory("AIRToken");
  const airToken = await AIRToken.deploy(deployer.address);
  await airToken.waitForDeployment();
  const airAddr = await airToken.getAddress();
  console.log("AIRToken deployed to:", airAddr);

  // 2. TestINR
  const TestINR = await ethers.getContractFactory("TestINR");
  const testINR = await TestINR.deploy();
  await testINR.waitForDeployment();
  const tinrAddr = await testINR.getAddress();
  console.log("TestINR deployed to:", tinrAddr);

  // 3. MinerRegistry
  const MinerRegistry = await ethers.getContractFactory("MinerRegistry");
  const minerRegistry = await MinerRegistry.deploy(deployer.address);
  await minerRegistry.waitForDeployment();
  const registryAddr = await minerRegistry.getAddress();
  console.log("MinerRegistry deployed to:", registryAddr);

  // 4. MintController
  const MintController = await ethers.getContractFactory("MintController");
  const mintController = await MintController.deploy(airAddr, registryAddr, deployer.address);
  await mintController.waitForDeployment();
  const controllerAddr = await mintController.getAddress();
  console.log("MintController deployed to:", controllerAddr);

  // Grant MINTER_ROLE to MintController on AIRToken
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  await airToken.grantRole(MINTER_ROLE, controllerAddr);
  console.log("Granted MINTER_ROLE to MintController");

  // 5. Marketplace
  const Marketplace = await ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy(airAddr, tinrAddr);
  await marketplace.waitForDeployment();
  const marketAddr = await marketplace.getAddress();
  console.log("Marketplace deployed to:", marketAddr);

  // 6. ComplianceRegistry
  const ComplianceRegistry = await ethers.getContractFactory("ComplianceRegistry");
  const complianceRegistry = await ComplianceRegistry.deploy(deployer.address, airAddr);
  await complianceRegistry.waitForDeployment();
  const complianceAddr = await complianceRegistry.getAddress();
  console.log("ComplianceRegistry deployed to:", complianceAddr);

  // Write deployment addresses to a JSON file for the validator/indexer/web
  const fs = await import("fs");
  const addresses = {
    chainId: 31337,
    deployer: deployer.address,
    AIRToken: airAddr,
    TestINR: tinrAddr,
    MinerRegistry: registryAddr,
    MintController: controllerAddr,
    Marketplace: marketAddr,
    ComplianceRegistry: complianceAddr,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    __dirname + "/../deployments.json",
    JSON.stringify(addresses, null, 2)
  );
  console.log("\nDeployment addresses written to deployments.json");
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
