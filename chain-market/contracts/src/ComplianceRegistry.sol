// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AIRToken.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ComplianceRegistry
 * @notice Manages pollution compliance obligations for companies.
 *         The regulator sets an obligation (AIR to burn) per company per period.
 *         Companies burn AIR against their obligation. Burns are recorded and
 *         cannot be undone.
 */
contract ComplianceRegistry is AccessControl {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    AIRToken public immutable airToken;

    struct Obligation {
        uint256 amount;        // total AIR required (base units)
        uint256 burnedToDate;  // AIR burned so far
        bool    exists;
    }

    /// @notice company address → period string hash → Obligation
    mapping(address => mapping(bytes32 => Obligation)) public obligations;

    /// @notice All (company, period) pairs for enumeration
    struct CompanyPeriod {
        address company;
        string  period;
    }
    CompanyPeriod[] public allObligations;

    event ObligationSet(
        address indexed company,
        string  period,
        uint256 amount
    );

    event BurnedForCompliance(
        address indexed company,
        string  period,
        uint256 amount,
        uint256 obligation,
        uint256 burnedToDate
    );

    constructor(address admin, address _airToken) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, admin);
        airToken = AIRToken(_airToken);
    }

    /**
     * @notice Set a compliance obligation for a company for a period.
     * @param company Company wallet address.
     * @param period  Period label, e.g. "2026" or "2026-Q4".
     * @param amount  Total AIR that must be burned (base units).
     */
    function setObligation(
        address company,
        string calldata period,
        uint256 amount
    ) external onlyRole(REGULATOR_ROLE) {
        bytes32 periodHash = keccak256(bytes(period));
        Obligation storage ob = obligations[company][periodHash];

        if (!ob.exists) {
            ob.exists = true;
            allObligations.push(CompanyPeriod(company, period));
        }

        ob.amount = amount;
        emit ObligationSet(company, period, amount);
    }

    /**
     * @notice Burn AIR against a compliance obligation.
     *         Caller must have approved this contract for `amount` AIR.
     * @param period Period label matching the obligation.
     * @param amount AIR to burn (base units).
     */
    function burnForCompliance(
        string calldata period,
        uint256 amount
    ) external {
        bytes32 periodHash = keccak256(bytes(period));
        Obligation storage ob = obligations[msg.sender][periodHash];
        require(ob.exists, "ComplianceRegistry: no obligation");
        require(amount > 0, "ComplianceRegistry: zero amount");

        // Burn the tokens (requires approval)
        airToken.burnFrom(msg.sender, amount);

        ob.burnedToDate += amount;

        emit BurnedForCompliance(
            msg.sender,
            period,
            amount,
            ob.amount,
            ob.burnedToDate
        );
    }

    // ── View helpers ──

    function getObligation(address company, string calldata period)
        external view returns (uint256 amount, uint256 burnedToDate, bool exists)
    {
        bytes32 periodHash = keccak256(bytes(period));
        Obligation storage ob = obligations[company][periodHash];
        return (ob.amount, ob.burnedToDate, ob.exists);
    }

    function obligationCount() external view returns (uint256) {
        return allObligations.length;
    }

    function isCompliant(address company, string calldata period)
        external view returns (bool)
    {
        bytes32 periodHash = keccak256(bytes(period));
        Obligation storage ob = obligations[company][periodHash];
        return ob.exists && ob.burnedToDate >= ob.amount;
    }
}
