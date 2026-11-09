// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CampusCoin} from "./CampusCoin.sol";

contract FingerPay is AccessControl, Pausable, ReentrancyGuard {
    error ZeroAmount();
    error SelfPayment();
    error MerchantNotActive();
    error IntentExpired();
    error IntentAlreadyUsed();
    error InsufficientBalance();
    error UnknownPayment();
    error AlreadyRefunded();

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    struct PaymentRecord {
        address user;
        address merchant;
        uint256 amount;
        bool refunded;
    }

    CampusCoin public immutable token;
    mapping(address merchant => bool active) public merchantActive;
    mapping(address merchant => bool registered) public merchantRegistered;
    mapping(bytes32 intentId => bool used) public intentUsed;
    mapping(bytes32 intentId => PaymentRecord record) public payments;

    event MerchantRegistered(address indexed merchant, bytes32 metaHash);
    event MerchantDeactivated(address indexed merchant);
    event Minted(address indexed to, uint256 amount, bytes32 indexed receiptRef);
    event Payment(bytes32 indexed intentId, address indexed user, address indexed merchant, uint256 amount);
    event Refunded(bytes32 indexed intentId, address indexed user, address indexed merchant, uint256 amount);
    event Settled(address indexed merchant, uint256 amount, bytes32 indexed settlementRef);

    constructor(CampusCoin token_) {
        token = token_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function registerMerchant(address merchant, bytes32 metaHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        merchantRegistered[merchant] = true;
        merchantActive[merchant] = true;
        emit MerchantRegistered(merchant, metaHash);
    }

    function deactivateMerchant(address merchant) external onlyRole(DEFAULT_ADMIN_ROLE) {
        merchantActive[merchant] = false;
        emit MerchantDeactivated(merchant);
    }

    function mint(address to, uint256 amount, bytes32 receiptRef)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        token.controllerMint(to, amount);
        emit Minted(to, amount, receiptRef);
    }

    function pay(address user, address merchant, uint256 amount, bytes32 nonce, uint64 expiry)
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
        nonReentrant
        returns (bytes32 intentId)
    {
        if (amount == 0) revert ZeroAmount();
        if (user == merchant) revert SelfPayment();
        if (!merchantActive[merchant]) revert MerchantNotActive();
        if (block.timestamp > expiry) revert IntentExpired();
        intentId = computeIntentId(merchant, amount, nonce, expiry);
        if (intentUsed[intentId]) revert IntentAlreadyUsed();
        if (token.balanceOf(user) < amount) revert InsufficientBalance();

        intentUsed[intentId] = true;
        payments[intentId] = PaymentRecord({user: user, merchant: merchant, amount: amount, refunded: false});
        token.controllerTransfer(user, merchant, amount);
        emit Payment(intentId, user, merchant, amount);
    }

    function refund(bytes32 intentId) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused nonReentrant {
        PaymentRecord storage payment = payments[intentId];
        if (payment.amount == 0) revert UnknownPayment();
        if (payment.refunded) revert AlreadyRefunded();
        if (token.balanceOf(payment.merchant) < payment.amount) revert InsufficientBalance();

        payment.refunded = true;
        token.controllerTransfer(payment.merchant, payment.user, payment.amount);
        emit Refunded(intentId, payment.user, payment.merchant, payment.amount);
    }

    function settle(address merchant, uint256 amount, bytes32 settlementRef)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        if (!merchantRegistered[merchant]) revert MerchantNotActive();
        if (token.balanceOf(merchant) < amount) revert InsufficientBalance();

        token.controllerBurn(merchant, amount);
        emit Settled(merchant, amount, settlementRef);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function computeIntentId(address merchant, uint256 amount, bytes32 nonce, uint64 expiry)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), merchant, amount, nonce, expiry));
    }
}
