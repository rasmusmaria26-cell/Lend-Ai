const hre = require("hardhat");
const fs = require("fs");

async function main() {
  // 1. Get the accounts (signers) provided by Hardhat
  const [deployer, oracle] = await hre.ethers.getSigners();

  // We are defining Account #1 (oracle address) as our secure backend/API
  const trustedOracleAddress = oracle.address;

  console.log("Deployer Address (Account #0):", deployer.address);
  console.log("Trusted Oracle Address (Account #1):", trustedOracleAddress);

  // 2. Deploy MockUSDC
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const mockUsdc = await MockUSDC.deploy();
  await mockUsdc.waitForDeployment();
  console.log("MockUSDC deployed to:", mockUsdc.target);

  // 3. Deploy the contract, passing the Oracle address to the constructor
  // The contract will now ONLY accept calls to setRiskScore from this address.
  const LendingPlatform = await hre.ethers.getContractFactory("LendingPlatform");
  const lendingPlatform = await LendingPlatform.deploy(trustedOracleAddress);

  await lendingPlatform.waitForDeployment();

  console.log("LendingPlatform deployed to:", lendingPlatform.target);

  // 4. Whitelist MockUSDC as collateral (Must be done by Oracle/Admin)
  const lendingPlatformOracle = lendingPlatform.connect(oracle);
  const tx = await lendingPlatformOracle.addCollateralToken(mockUsdc.target);
  await tx.wait();
  console.log("MockUSDC whitelisted as collateral");

  // 5. Save addresses to file
  const addresses = {
    MockUSDC: mockUsdc.target,
    LendingPlatform: lendingPlatform.target
  };
  fs.writeFileSync("deploy_addresses.json", JSON.stringify(addresses, null, 2));
  console.log("Addresses saved to deploy_addresses.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});