// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CampusCoin is ERC20 {
    error NotController();
    error TransfersDisabled();

    address public controller;
    address private immutable deployer;

    constructor() ERC20("CampusCoin", "CPC") {
        deployer = msg.sender;
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function setController(address newController) external {
        if (msg.sender != deployer || controller != address(0) || newController == address(0)) {
            revert NotController();
        }
        controller = newController;
    }

    function controllerTransfer(address from, address to, uint256 amount) external onlyController {
        _transfer(from, to, amount);
    }

    function controllerMint(address to, uint256 amount) external onlyController {
        _mint(to, amount);
    }

    function controllerBurn(address from, uint256 amount) external onlyController {
        _burn(from, amount);
    }

    function transfer(address, uint256) public pure override returns (bool) {
        revert TransfersDisabled();
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert TransfersDisabled();
    }

    function approve(address, uint256) public pure override returns (bool) {
        revert TransfersDisabled();
    }

    modifier onlyController() {
        if (msg.sender != controller || controller == address(0)) revert NotController();
        _;
    }
}
