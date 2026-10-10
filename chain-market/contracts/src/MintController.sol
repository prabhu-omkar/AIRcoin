// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AIRToken.sol";
import "./MinerRegistry.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MintController
 * @notice Verifies a miner's signed attestation and mints AIR for one epoch.
 *
 *         Digest = keccak256(abi.encodePacked(
 *             bytes32 minerId,
 *             uint64  epoch,
 *             uint256 amount,
 *             bytes32 evidenceHash
 *         ))
 *
 *         Signature is EIP-191 personal_sign(digest) with the device key.
 *         The contract checks ecrecover against the registry's device address.
 *
 *         Guards: one mint per miner per epoch; per-epoch cap; miner must be active.
 */
contract MintController is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    AIRToken public immutable airToken;
    MinerRegistry public immutable registry;

    /// @notice Maximum AIR mintable per miner per epoch (safety cap).
    ///         Default: 1 AIR = 1e18 base units per epoch.
    uint256 public perEpochCap = 1e18;

    /// @notice (minerId, epoch) → true if already minted
    mapping(bytes32 => mapping(uint64 => bool)) public minted;

    event EpochMinted(
        bytes32 indexed minerId,
        uint64  indexed epoch,
        address indexed to,
        uint256 amount,
        bytes32 evidenceHash,
        bytes32 txId
    );

    event PerEpochCapUpdated(uint256 oldCap, uint256 newCap);

    constructor(
        address _airToken,
        address _registry,
        address admin
    ) Ownable(admin) {
        airToken = AIRToken(_airToken);
        registry = MinerRegistry(_registry);
    }

    /**
     * @notice Mint AIR for a verified epoch attestation.
     * @param minerId      keccak256(utf8(miner_id_string))
     * @param epoch        Epoch index
     * @param amount       Claimed AIR in base units (18 decimals)
     * @param evidenceHash keccak256 of the attestation evidence
     * @param sig          65-byte secp256k1 signature (r || s || v)
     */
    function mintForEpoch(
        bytes32 minerId,
        uint64 epoch,
        uint256 amount,
        bytes32 evidenceHash,
        bytes memory sig
    ) external returns (bytes32 txId) {
        // 1. Miner must be active
        require(registry.isActive(minerId), "MintController: miner not active");

        // 2. One mint per epoch
        require(!minted[minerId][epoch], "MintController: epoch already minted");

        // 3. Amount within cap
        require(amount > 0 && amount <= perEpochCap, "MintController: amount out of range");

        // 4. Verify signature: digest = keccak256(abi.encodePacked(minerId, epoch, amount, evidenceHash))
        bytes32 digest = keccak256(abi.encodePacked(minerId, epoch, amount, evidenceHash));
        bytes32 ethSignedHash = digest.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(sig);

        address deviceAddr = registry.getDeviceAddress(minerId);
        require(recovered == deviceAddr, "MintController: bad signature");

        // 5. Mark minted and mint
        minted[minerId][epoch] = true;
        address owner = registry.getOwnerWallet(minerId);
        airToken.mint(owner, amount);

        txId = keccak256(abi.encodePacked(minerId, epoch, block.number));
        emit EpochMinted(minerId, epoch, owner, amount, evidenceHash, txId);
    }

    /**
     * @notice Update the per-epoch mint cap. Only owner (admin).
     */
    function setPerEpochCap(uint256 newCap) external onlyOwner {
        uint256 old = perEpochCap;
        perEpochCap = newCap;
        emit PerEpochCapUpdated(old, newCap);
    }
}
