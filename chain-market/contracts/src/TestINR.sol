// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TestINR (tINR)
 * @notice Mock Indian Rupee stablecoin for the AIRcoin marketplace.
 *         Has a public faucet so demo wallets can get tINR without real money.
 *         1 tINR = 1 mock rupee, 18 decimals.
 */
contract TestINR is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 10_000 * 1e18; // 10,000 tINR per drip
    uint256 public constant FAUCET_COOLDOWN = 60;           // 60 seconds for demo

    mapping(address => uint256) public lastDrip;

    event FaucetDrip(address indexed to, uint256 amount);

    constructor() ERC20("Test INR", "tINR") {}

    /**
     * @notice Get free tINR from the faucet. Rate-limited per address.
     */
    function faucet() external {
        require(
            block.timestamp >= lastDrip[msg.sender] + FAUCET_COOLDOWN,
            "tINR: faucet cooldown"
        );
        lastDrip[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetDrip(msg.sender, FAUCET_AMOUNT);
    }

    /**
     * @notice Admin mint for seeding demo accounts.
     * @param to     Recipient.
     * @param amount Base-unit amount.
     */
    function mintTo(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
