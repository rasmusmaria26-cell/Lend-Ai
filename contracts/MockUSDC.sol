// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {
        _mint(msg.sender, 1000000 * 10 ** decimals()); // Mint 1M to deployer
    }

    // Allow anyone to mint for testing
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    // Mock USDC usually has 6 decimals, but for simplicity we can use 18 or 6.
    // Let's stick to 18 to match ETH for now to avoid confusion, 
    // OR use 6 to be realistic. Real USDC has 6.
    // Let's use 18 for this MVP to simplify math, but override if needed.
    // Actually, let's stick to default 18 unless specified. 
    // Real USDC is 6. Let's override to 6 to be realistic and test decimal handling?
    // No, let's keep it simple (18) for this MVP unless user asked for 6.
    // User didn't specify. Standard ERC20 is 18.
}
