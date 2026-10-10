// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title MinerRegistry
 * @notice On-chain registry of AIRcoin miners. The government admin registers
 *         approved miners, mapping them to their device key, owner wallet,
 *         sticker set, and geolocation. The validator and MintController
 *         read this to verify attestations.
 *
 *         minerId on-chain = keccak256(utf8(miner_id string)).
 */
contract MinerRegistry is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    enum MinerStatus { Pending, Active, Suspended, Revoked }

    struct Miner {
        bytes32 minerId;           // keccak256(utf8(miner_id))
        address deviceAddress;     // ecrecover target for attestation sigs
        address ownerWallet;       // receives minted AIR
        bytes32 stickerSetHash;    // keccak256(abi.encodePacked(sorted uint16[]))
        string  geohash;           // registered location geohash
        MinerStatus status;
        uint256 registeredAt;
    }

    /// @notice minerId (bytes32) → Miner struct
    mapping(bytes32 => Miner) public miners;

    /// @notice deviceAddress → minerId, for reverse lookups
    mapping(address => bytes32) public deviceToMiner;

    /// @notice All registered miner IDs, for enumeration
    bytes32[] public minerIds;

    event MinerRegistered(
        bytes32 indexed minerId,
        address deviceAddress,
        address ownerWallet,
        bytes32 stickerSetHash,
        string  geohash
    );
    event MinerSuspended(bytes32 indexed minerId);
    event MinerReactivated(bytes32 indexed minerId);
    event MinerRevoked(bytes32 indexed minerId);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    /**
     * @notice Register a new miner after the government admin approves the application.
     * @param minerId        keccak256(utf8(miner_id_string))
     * @param deviceAddr     Ethereum address derived from the device's secp256k1 key.
     * @param owner          Wallet that will receive minted AIR.
     * @param stickerSetHash keccak256(abi.encodePacked(uint16[] sorted sticker IDs))
     * @param geohash        Geohash of the registered location.
     */
    function registerMiner(
        bytes32 minerId,
        address deviceAddr,
        address owner,
        bytes32 stickerSetHash,
        string calldata geohash
    ) external onlyRole(ADMIN_ROLE) {
        require(miners[minerId].registeredAt == 0, "MinerRegistry: already registered");
        require(deviceToMiner[deviceAddr] == bytes32(0), "MinerRegistry: device already used");

        miners[minerId] = Miner({
            minerId: minerId,
            deviceAddress: deviceAddr,
            ownerWallet: owner,
            stickerSetHash: stickerSetHash,
            geohash: geohash,
            status: MinerStatus.Active,
            registeredAt: block.timestamp
        });
        deviceToMiner[deviceAddr] = minerId;
        minerIds.push(minerId);

        emit MinerRegistered(minerId, deviceAddr, owner, stickerSetHash, geohash);
    }

    /**
     * @notice Suspend a miner. Suspended miners cannot mint.
     */
    function suspendMiner(bytes32 minerId) external onlyRole(ADMIN_ROLE) {
        require(miners[minerId].status == MinerStatus.Active, "MinerRegistry: not active");
        miners[minerId].status = MinerStatus.Suspended;
        emit MinerSuspended(minerId);
    }

    /**
     * @notice Reactivate a suspended miner.
     */
    function reactivateMiner(bytes32 minerId) external onlyRole(ADMIN_ROLE) {
        require(miners[minerId].status == MinerStatus.Suspended, "MinerRegistry: not suspended");
        miners[minerId].status = MinerStatus.Active;
        emit MinerReactivated(minerId);
    }

    /**
     * @notice Permanently revoke a miner. Cannot be undone.
     */
    function revokeMiner(bytes32 minerId) external onlyRole(ADMIN_ROLE) {
        MinerStatus s = miners[minerId].status;
        require(s == MinerStatus.Active || s == MinerStatus.Suspended, "MinerRegistry: cannot revoke");
        miners[minerId].status = MinerStatus.Revoked;
        emit MinerRevoked(minerId);
    }

    // ── View helpers ──

    function isActive(bytes32 minerId) external view returns (bool) {
        return miners[minerId].status == MinerStatus.Active;
    }

    function getDeviceAddress(bytes32 minerId) external view returns (address) {
        return miners[minerId].deviceAddress;
    }

    function getOwnerWallet(bytes32 minerId) external view returns (address) {
        return miners[minerId].ownerWallet;
    }

    function minerCount() external view returns (uint256) {
        return minerIds.length;
    }
}
