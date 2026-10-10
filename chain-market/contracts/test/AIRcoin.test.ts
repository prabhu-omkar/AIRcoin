import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("AIRcoin Contracts", function () {
  // ── Shared fixture ──
  async function deployFixture() {
    const [admin, minerOwner, company, buyer, deviceSigner] = await ethers.getSigners();

    // Deploy AIRToken
    const AIRToken = await ethers.getContractFactory("AIRToken");
    const airToken = await AIRToken.deploy(admin.address);

    // Deploy TestINR
    const TestINR = await ethers.getContractFactory("TestINR");
    const testINR = await TestINR.deploy();

    // Deploy MinerRegistry
    const MinerRegistry = await ethers.getContractFactory("MinerRegistry");
    const minerRegistry = await MinerRegistry.deploy(admin.address);

    // Deploy MintController
    const MintController = await ethers.getContractFactory("MintController");
    const mintController = await MintController.deploy(
      await airToken.getAddress(),
      await minerRegistry.getAddress(),
      admin.address
    );

    // Grant MINTER_ROLE
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    await airToken.grantRole(MINTER_ROLE, await mintController.getAddress());

    // Deploy Marketplace
    const Marketplace = await ethers.getContractFactory("Marketplace");
    const marketplace = await Marketplace.deploy(
      await airToken.getAddress(),
      await testINR.getAddress()
    );

    // Deploy ComplianceRegistry
    const ComplianceRegistry = await ethers.getContractFactory("ComplianceRegistry");
    const complianceRegistry = await ComplianceRegistry.deploy(
      admin.address,
      await airToken.getAddress()
    );

    // Register a demo miner
    const minerId = ethers.keccak256(ethers.toUtf8Bytes("miner-001"));
    const stickerIds = Array.from({ length: 20 }, (_, i) => i);
    const stickerSetHash = ethers.keccak256(
      ethers.solidityPacked(
        stickerIds.map(() => "uint16"),
        stickerIds
      )
    );

    await minerRegistry.registerMiner(
      minerId,
      deviceSigner.address,
      minerOwner.address,
      stickerSetHash,
      "tdr1v9qtj"
    );

    return {
      admin, minerOwner, company, buyer, deviceSigner,
      airToken, testINR, minerRegistry, mintController,
      marketplace, complianceRegistry,
      minerId, stickerSetHash, MINTER_ROLE,
    };
  }

  // ── Helper: sign an epoch attestation ──
  async function signAttestation(
    deviceSigner: any,
    minerId: string,
    epoch: number,
    amount: bigint,
    evidenceHash: string
  ) {
    const digest = ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "uint64", "uint256", "bytes32"],
        [minerId, epoch, amount, evidenceHash]
      )
    );
    return deviceSigner.signMessage(ethers.getBytes(digest));
  }

  // ════════════════════════════════════════
  // AIRToken
  // ════════════════════════════════════════
  describe("AIRToken", function () {
    it("has correct name and symbol", async function () {
      const { airToken } = await loadFixture(deployFixture);
      expect(await airToken.name()).to.equal("AIRcoin");
      expect(await airToken.symbol()).to.equal("AIR");
    });

    it("only MINTER_ROLE can mint", async function () {
      const { airToken, minerOwner } = await loadFixture(deployFixture);
      await expect(
        airToken.connect(minerOwner).mint(minerOwner.address, 1000n)
      ).to.be.reverted;
    });

    it("anyone can burn their own tokens", async function () {
      const { airToken, mintController, minerOwner, deviceSigner, minerId } =
        await loadFixture(deployFixture);

      const amount = ethers.parseEther("0.5");
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("test-evidence"));
      const sig = await signAttestation(deviceSigner, minerId, 100, amount, evidenceHash);

      await mintController.mintForEpoch(minerId, 100, amount, evidenceHash, sig);
      expect(await airToken.balanceOf(minerOwner.address)).to.equal(amount);

      await airToken.connect(minerOwner).burn(amount);
      expect(await airToken.balanceOf(minerOwner.address)).to.equal(0n);
    });
  });

  // ════════════════════════════════════════
  // TestINR
  // ════════════════════════════════════════
  describe("TestINR", function () {
    it("faucet gives 10,000 tINR", async function () {
      const { testINR, buyer } = await loadFixture(deployFixture);
      await testINR.connect(buyer).faucet();
      expect(await testINR.balanceOf(buyer.address)).to.equal(
        ethers.parseEther("10000")
      );
    });

    it("faucet has cooldown", async function () {
      const { testINR, buyer } = await loadFixture(deployFixture);
      await testINR.connect(buyer).faucet();
      await expect(testINR.connect(buyer).faucet()).to.be.revertedWith(
        "tINR: faucet cooldown"
      );
    });
  });

  // ════════════════════════════════════════
  // MinerRegistry
  // ════════════════════════════════════════
  describe("MinerRegistry", function () {
    it("registers a miner", async function () {
      const { minerRegistry, minerId, deviceSigner, minerOwner } =
        await loadFixture(deployFixture);
      expect(await minerRegistry.isActive(minerId)).to.be.true;
      expect(await minerRegistry.getDeviceAddress(minerId)).to.equal(
        deviceSigner.address
      );
      expect(await minerRegistry.getOwnerWallet(minerId)).to.equal(
        minerOwner.address
      );
    });

    it("prevents duplicate registration", async function () {
      const { minerRegistry, minerId, admin, deviceSigner, minerOwner, stickerSetHash } =
        await loadFixture(deployFixture);
      await expect(
        minerRegistry.registerMiner(
          minerId,
          deviceSigner.address,
          minerOwner.address,
          stickerSetHash,
          "tdr1v9qtj"
        )
      ).to.be.revertedWith("MinerRegistry: already registered");
    });

    it("admin can suspend and reactivate", async function () {
      const { minerRegistry, minerId } = await loadFixture(deployFixture);
      await minerRegistry.suspendMiner(minerId);
      expect(await minerRegistry.isActive(minerId)).to.be.false;
      await minerRegistry.reactivateMiner(minerId);
      expect(await minerRegistry.isActive(minerId)).to.be.true;
    });

    it("admin can revoke permanently", async function () {
      const { minerRegistry, minerId } = await loadFixture(deployFixture);
      await minerRegistry.revokeMiner(minerId);
      expect(await minerRegistry.isActive(minerId)).to.be.false;
      await expect(
        minerRegistry.reactivateMiner(minerId)
      ).to.be.revertedWith("MinerRegistry: not suspended");
    });

    it("non-admin cannot register", async function () {
      const { minerRegistry, minerOwner } = await loadFixture(deployFixture);
      const id = ethers.keccak256(ethers.toUtf8Bytes("miner-rogue"));
      await expect(
        minerRegistry.connect(minerOwner).registerMiner(
          id,
          minerOwner.address,
          minerOwner.address,
          ethers.ZeroHash,
          "abc"
        )
      ).to.be.reverted;
    });
  });

  // ════════════════════════════════════════
  // MintController
  // ════════════════════════════════════════
  describe("MintController", function () {
    it("mints AIR for a valid attestation", async function () {
      const { mintController, airToken, minerOwner, deviceSigner, minerId } =
        await loadFixture(deployFixture);

      const amount = ethers.parseEther("0.027684");
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence-1"));
      const sig = await signAttestation(deviceSigner, minerId, 29863320, amount, evidenceHash);

      await expect(mintController.mintForEpoch(minerId, 29863320, amount, evidenceHash, sig))
        .to.emit(mintController, "EpochMinted");

      expect(await airToken.balanceOf(minerOwner.address)).to.equal(amount);
    });

    it("rejects duplicate epoch", async function () {
      const { mintController, deviceSigner, minerId } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("0.01");
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence-dup"));
      const sig = await signAttestation(deviceSigner, minerId, 500, amount, evidenceHash);

      await mintController.mintForEpoch(minerId, 500, amount, evidenceHash, sig);

      const sig2 = await signAttestation(deviceSigner, minerId, 500, amount, evidenceHash);
      await expect(
        mintController.mintForEpoch(minerId, 500, amount, evidenceHash, sig2)
      ).to.be.revertedWith("MintController: epoch already minted");
    });

    it("rejects bad signature", async function () {
      const { mintController, buyer, minerId } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("0.01");
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence-bad"));
      // Sign with wrong key
      const sig = await signAttestation(buyer, minerId, 600, amount, evidenceHash);

      await expect(
        mintController.mintForEpoch(minerId, 600, amount, evidenceHash, sig)
      ).to.be.revertedWith("MintController: bad signature");
    });

    it("rejects amount over cap", async function () {
      const { mintController, deviceSigner, minerId } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("2"); // cap is 1 AIR
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence-cap"));
      const sig = await signAttestation(deviceSigner, minerId, 700, amount, evidenceHash);

      await expect(
        mintController.mintForEpoch(minerId, 700, amount, evidenceHash, sig)
      ).to.be.revertedWith("MintController: amount out of range");
    });

    it("rejects inactive miner", async function () {
      const { mintController, minerRegistry, deviceSigner, minerId } =
        await loadFixture(deployFixture);

      await minerRegistry.suspendMiner(minerId);

      const amount = ethers.parseEther("0.01");
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence-sus"));
      const sig = await signAttestation(deviceSigner, minerId, 800, amount, evidenceHash);

      await expect(
        mintController.mintForEpoch(minerId, 800, amount, evidenceHash, sig)
      ).to.be.revertedWith("MintController: miner not active");
    });
  });

  // ════════════════════════════════════════
  // Marketplace
  // ════════════════════════════════════════
  describe("Marketplace", function () {
    async function marketFixture() {
      const base = await loadFixture(deployFixture);
      const { mintController, airToken, testINR, marketplace, deviceSigner, minerOwner, buyer, minerId } = base;

      // Mint some AIR to minerOwner
      const amount = ethers.parseEther("0.5");
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("market-evidence"));
      const sig = await signAttestation(deviceSigner, minerId, 900, amount, evidenceHash);
      await mintController.mintForEpoch(minerId, 900, amount, evidenceHash, sig);

      // Give buyer some tINR
      await testINR.mintTo(buyer.address, ethers.parseEther("50000"));

      return base;
    }

    it("seller can list AIR", async function () {
      const { marketplace, airToken, minerOwner } = await loadFixture(marketFixture);

      const listAmount = ethers.parseEther("0.1");
      const price = ethers.parseEther("25");

      await airToken.connect(minerOwner).approve(await marketplace.getAddress(), listAmount);
      await expect(marketplace.connect(minerOwner).list(listAmount, price))
        .to.emit(marketplace, "Listed")
        .withArgs(0, minerOwner.address, listAmount, price);

      expect(await marketplace.activeListingCount()).to.equal(1);
    });

    it("buyer can buy a listing", async function () {
      const { marketplace, airToken, testINR, minerOwner, buyer } = await loadFixture(marketFixture);

      const listAmount = ethers.parseEther("0.1");
      const price = ethers.parseEther("25");
      const marketAddr = await marketplace.getAddress();

      await airToken.connect(minerOwner).approve(marketAddr, listAmount);
      await marketplace.connect(minerOwner).list(listAmount, price);

      await testINR.connect(buyer).approve(marketAddr, price);
      await expect(marketplace.connect(buyer).buy(0))
        .to.emit(marketplace, "Bought");

      expect(await airToken.balanceOf(buyer.address)).to.equal(listAmount);
      expect(await marketplace.activeListingCount()).to.equal(0);
    });

    it("seller can cancel listing", async function () {
      const { marketplace, airToken, minerOwner } = await loadFixture(marketFixture);

      const listAmount = ethers.parseEther("0.1");
      const price = ethers.parseEther("25");
      const marketAddr = await marketplace.getAddress();

      await airToken.connect(minerOwner).approve(marketAddr, listAmount);
      await marketplace.connect(minerOwner).list(listAmount, price);

      const balBefore = await airToken.balanceOf(minerOwner.address);
      await marketplace.connect(minerOwner).cancel(0);
      expect(await airToken.balanceOf(minerOwner.address)).to.equal(balBefore + listAmount);
      expect(await marketplace.activeListingCount()).to.equal(0);
    });

    it("buyer cannot self-buy", async function () {
      const { marketplace, airToken, testINR, minerOwner } = await loadFixture(marketFixture);

      const listAmount = ethers.parseEther("0.1");
      const price = ethers.parseEther("25");
      const marketAddr = await marketplace.getAddress();

      await airToken.connect(minerOwner).approve(marketAddr, listAmount);
      await marketplace.connect(minerOwner).list(listAmount, price);
      await testINR.connect(minerOwner).approve(marketAddr, price);

      await expect(
        marketplace.connect(minerOwner).buy(0)
      ).to.be.revertedWith("Marketplace: self-buy");
    });
  });

  // ════════════════════════════════════════
  // ComplianceRegistry
  // ════════════════════════════════════════
  describe("ComplianceRegistry", function () {
    async function complianceFixture() {
      const base = await loadFixture(deployFixture);
      const { complianceRegistry, airToken, mintController, deviceSigner, company, minerId } = base;

      // Mint AIR to company (via miner owner, then transfer)
      const amount = ethers.parseEther("0.5");
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("compliance-ev"));
      const sig = await signAttestation(deviceSigner, minerId, 1000, amount, evidenceHash);
      await mintController.mintForEpoch(minerId, 1000, amount, evidenceHash, sig);

      // Transfer AIR from minerOwner to company
      await airToken.connect(base.minerOwner).transfer(company.address, amount);

      // Set obligation
      await complianceRegistry.setObligation(company.address, "2026", ethers.parseEther("0.3"));

      return base;
    }

    it("regulator sets obligation", async function () {
      const { complianceRegistry, company } = await loadFixture(complianceFixture);
      const [amount, burned, exists] = await complianceRegistry.getObligation(
        company.address,
        "2026"
      );
      expect(exists).to.be.true;
      expect(amount).to.equal(ethers.parseEther("0.3"));
      expect(burned).to.equal(0n);
    });

    it("company burns for compliance", async function () {
      const { complianceRegistry, airToken, company } = await loadFixture(complianceFixture);

      const burnAmount = ethers.parseEther("0.1");
      const crAddr = await complianceRegistry.getAddress();

      await airToken.connect(company).approve(crAddr, burnAmount);
      await expect(complianceRegistry.connect(company).burnForCompliance("2026", burnAmount))
        .to.emit(complianceRegistry, "BurnedForCompliance");

      const [, burned] = await complianceRegistry.getObligation(company.address, "2026");
      expect(burned).to.equal(burnAmount);
    });

    it("tracks compliance status", async function () {
      const { complianceRegistry, airToken, company } = await loadFixture(complianceFixture);

      const crAddr = await complianceRegistry.getAddress();

      expect(await complianceRegistry.isCompliant(company.address, "2026")).to.be.false;

      await airToken.connect(company).approve(crAddr, ethers.parseEther("0.3"));
      await complianceRegistry.connect(company).burnForCompliance("2026", ethers.parseEther("0.3"));

      expect(await complianceRegistry.isCompliant(company.address, "2026")).to.be.true;
    });

    it("rejects burn without obligation", async function () {
      const { complianceRegistry, buyer } = await loadFixture(complianceFixture);
      await expect(
        complianceRegistry.connect(buyer).burnForCompliance("2026", 100n)
      ).to.be.revertedWith("ComplianceRegistry: no obligation");
    });
  });
});
