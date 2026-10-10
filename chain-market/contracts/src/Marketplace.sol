// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Marketplace
 * @notice Fixed-price marketplace for AIRcoin. Sellers list AIR at a
 *         tINR price; buyers pay tINR, receive AIR from escrow.
 *
 *         Flow: seller approves AIR → list() escrows AIR →
 *               buyer approves tINR → buy() transfers tINR to seller,
 *               AIR to buyer.
 */
contract Marketplace is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable airToken;
    IERC20 public immutable tinrToken;

    enum ListingStatus { Active, Sold, Cancelled }

    struct Listing {
        uint256 id;
        address seller;
        uint256 amountAir;     // base units
        uint256 priceTinr;     // total tINR price for the full amount
        ListingStatus status;
        uint256 createdAt;
    }

    uint256 public nextListingId;
    mapping(uint256 => Listing) public listings;
    uint256[] public activeListingIds;

    event Listed(
        uint256 indexed id,
        address indexed seller,
        uint256 amountAir,
        uint256 priceTinr
    );

    event Bought(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 amountAir,
        uint256 priceTinr
    );

    event Cancelled(uint256 indexed id, address indexed seller);

    constructor(address _airToken, address _tinrToken) {
        airToken = IERC20(_airToken);
        tinrToken = IERC20(_tinrToken);
    }

    /**
     * @notice List AIR for sale at a fixed tINR price.
     *         Caller must have approved this contract for amountAir.
     * @param amountAir  Amount of AIR to sell (base units).
     * @param priceTinr  Total tINR price for the entire amount.
     */
    function list(uint256 amountAir, uint256 priceTinr) external nonReentrant returns (uint256 id) {
        require(amountAir > 0, "Marketplace: zero amount");
        require(priceTinr > 0, "Marketplace: zero price");

        id = nextListingId++;
        listings[id] = Listing({
            id: id,
            seller: msg.sender,
            amountAir: amountAir,
            priceTinr: priceTinr,
            status: ListingStatus.Active,
            createdAt: block.timestamp
        });
        activeListingIds.push(id);

        // Escrow: transfer AIR from seller to this contract
        airToken.safeTransferFrom(msg.sender, address(this), amountAir);

        emit Listed(id, msg.sender, amountAir, priceTinr);
    }

    /**
     * @notice Buy a listing. Caller must have approved this contract for priceTinr.
     * @param id Listing ID to buy.
     */
    function buy(uint256 id) external nonReentrant {
        Listing storage l = listings[id];
        require(l.status == ListingStatus.Active, "Marketplace: not active");
        require(msg.sender != l.seller, "Marketplace: self-buy");

        l.status = ListingStatus.Sold;
        _removeActiveId(id);

        // Transfer tINR from buyer to seller
        tinrToken.safeTransferFrom(msg.sender, l.seller, l.priceTinr);

        // Transfer escrowed AIR to buyer
        airToken.safeTransfer(msg.sender, l.amountAir);

        emit Bought(id, msg.sender, l.seller, l.amountAir, l.priceTinr);
    }

    /**
     * @notice Cancel a listing and return escrowed AIR to seller.
     * @param id Listing ID to cancel.
     */
    function cancel(uint256 id) external nonReentrant {
        Listing storage l = listings[id];
        require(l.status == ListingStatus.Active, "Marketplace: not active");
        require(msg.sender == l.seller, "Marketplace: not seller");

        l.status = ListingStatus.Cancelled;
        _removeActiveId(id);

        // Return escrowed AIR
        airToken.safeTransfer(l.seller, l.amountAir);

        emit Cancelled(id, l.seller);
    }

    // ── View helpers ──

    function activeListingCount() external view returns (uint256) {
        return activeListingIds.length;
    }

    function getActiveListings(uint256 offset, uint256 limit)
        external view returns (Listing[] memory)
    {
        uint256 total = activeListingIds.length;
        if (offset >= total) return new Listing[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        Listing[] memory result = new Listing[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = listings[activeListingIds[i]];
        }
        return result;
    }

    // ── Internal ──

    function _removeActiveId(uint256 id) internal {
        uint256 len = activeListingIds.length;
        for (uint256 i = 0; i < len; i++) {
            if (activeListingIds[i] == id) {
                activeListingIds[i] = activeListingIds[len - 1];
                activeListingIds.pop();
                return;
            }
        }
    }
}
