
function getMlRiskScore(principal, tenure, collateral, ethPriceUsd, ethPriceInr) {
    return new Promise((resolve, reject) => {
        // Pass all arguments to the Python script
        // Note: Python script currently assumes Collateral is ETH value. 
        // If USDC, we should pass the USD value directly or convert.
        // For simplicity, if USDC, we treat 'collateral' as USD value directly.
        // But the Python script expects 'collateral' in ETH units if it multiplies by price?
        // Let's check ai_risk_model.py logic.
        // It does: collateral_value_usd = collateral_amount * eth_price_usd
        // If collateral is USDC, collateral_value_usd = collateral_amount * 1

        // So we need to adjust what we pass to Python.
        // Option A: Update Python to accept collateral type.
        // Option B: Pre-calculate USD value and pass it? No, Python does logic.
        // Option C: Hack - if USDC, pass (collateral / ethPriceUsd) as "ETH equivalent" so Python math works?
        // Better: Update Python script. But for now, let's just pass "ETH Equivalent" if USDC.

        let effectiveCollateralEth = collateral;
        if (TEST_COLLATERAL_TYPE === 'USDC') {
            effectiveCollateralEth = collateral / ethPriceUsd;
        }

        const command = `python ./ai_risk_model.py ${BORROWER_ADDRESS} ${principal} ${tenure} ${effectiveCollateralEth} ${ethPriceUsd} ${ethPriceInr}`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing Python script: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                // Allows UserWarnings (like Scikit-learn's) to pass but logs them
                console.warn(`Python stderr (Warning): ${stderr}`);
            }

            try {
                // Parse the JSON output from Python
                const result = JSON.parse(stdout.trim());

                if (result.error) {
                    return reject(new Error(`AI Model Error: ${result.error}`));
                }

                // Log the detailed AI decision for audit purposes
                console.log("\n--- AI Risk Assessment ---");
                console.log(`Score: ${result.score}/100`);
                console.log(`Decision: ${result.decision}`);
                console.log("Top Contributing Factors:");
                result.explanation.forEach(factor => {
                    console.log(`  - ${factor.feature}: ${factor.impact > 0 ? '+' : ''}${factor.impact}`);
                });
                console.log("--------------------------\n");

                resolve(result.score);
            } catch (e) {
                console.error("Failed to parse AI model output:", stdout);
                return reject(new Error("Invalid JSON response from AI model"));
            }
        });
    });
}

async function getEthPrice() {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,inr');
        return {
            usd: response.data.ethereum.usd,
            inr: response.data.ethereum.inr
        };
    } catch (error) {
        console.error("Error fetching ETH price from CoinGecko, using fallback:", error.message);
        return { usd: 3000, inr: 250000 }; // Fallback values
    }
}

async function setRiskScore() {
    try {
        // 0. Fetch ETH Price (Oracle Step)
        console.log("--- Oracle: Fetching Real-Time ETH Price ---");
        const prices = await getEthPrice();
        console.log(`ETH Price: $${prices.usd} USD / ₹${prices.inr} INR`);

        // 1. Prediction: Run the ML model with loan parameters AND fiat prices
        console.log("\n--- Application Backend Requesting Dynamic Risk Score ---");
        const dynamicScore = await getMlRiskScore(TEST_PRINCIPAL, TEST_TENURE, TEST_COLLATERAL, prices.usd, prices.inr);

        console.log(`Dynamic Score retrieved from ML Model: ${dynamicScore}`);

        // --- 2. Submit Score to Blockchain ---

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const signer = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);

        const artifactPath = './artifacts/contracts/LendingPlatform.sol/LendingPlatform.json';
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        const contract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, signer);

        const tx = await contract.setRiskScore(BORROWER_ADDRESS, dynamicScore);

        console.log("Transaction Hash:", tx.hash);
        console.log("Waiting for transaction confirmation...");

        await tx.wait();
        console.log("Transaction Confirmed. Dynamic Risk Score successfully recorded.");

        // Verification step
        const recordedScore = await contract.borrowerRiskScore(BORROWER_ADDRESS);
        console.log(`Verification: Score retrieved from contract is ${recordedScore.toString()}`);

    } catch (error) {
        console.error("\n--- TRANSACTION FAILED ---");
        console.error("ERROR: Check if Hardhat Node is running, or Python dependencies are missing.");
        console.error(error.message);
    }
}

setRiskScore();