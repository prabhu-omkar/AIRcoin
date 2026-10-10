// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AIRToken
 * @notice ERC-20 token representing verified pollution removal.
 *         1 AIR = 1 mg PM2.5-equivalent removed.
 *         Only the MINTER_ROLE (MintController) can mint.
 *         Anyone can burn their own tokens.
 */
contract AIRToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);

    constructor(address admin) ERC20("AIRcoin", "AIR") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /**
     * @notice Mint AIR tokens. Only callable by the MintController.
     * @param to    Recipient (miner owner wallet).
     * @param amount Base-unit amount (18 decimals).
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @notice Burn caller's AIR tokens.
     * @param amount Base-unit amount to burn.
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }

    /**
     * @notice Burn AIR tokens from an account (requires allowance).
     * @param from   Account whose tokens are burned.
     * @param amount Base-unit amount to burn.
     */
    function burnFrom(address from, uint256 amount) external {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
        emit TokensBurned(from, amount);
    }
}
