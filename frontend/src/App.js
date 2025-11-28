import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import LendingPlatformABI from "./LendingPlatform.json";
import "./index.css";

// NOTE: Please ensure this matches the address outputted by your deployment script!
const CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const MOCK_USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const EXPECTED_CHAIN_ID = "0x7a69"; // Hardhat Localhost

const MOCK_USDC_ABI = [
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];

// --- DYNAMIC RATE CALCULATION LOGIC ---
function mapScoreToRate(score, principal, tenure, collateral) {
  const minBaseRate = 4;
  const maxBaseRate = 22;
  const baseRate = maxBaseRate - ((score / 100) * (maxBaseRate - minBaseRate));

  const numPrincipal = Number(principal) || 0;
  const numCollateral = Number(collateral) || 0;
  const numTenure = Number(tenure) || 0;

  const collateralRatio = numPrincipal > 0 ? (numCollateral / numPrincipal) : 0;

  // 1. Dynamic Tenure Factor
  const tenureFactor = 1 + (numTenure - 12) * 0.01;

  let finalRate = baseRate * tenureFactor;

  // 2. Dynamic Collateral Discount
  const collateralDiscount = 1 - (collateralRatio * 0.2);
  finalRate *= Math.max(0.5, collateralDiscount); // Cap discount at 50%

  return Math.max(minBaseRate, Math.round(finalRate * 10) / 10);
}


function App() {
  const [currentAccount, setCurrentAccount] = useState(null);
  const [riskScore, setRiskScore] = useState(null);
  const [loadingScore, setLoadingScore] = useState(false);
  const [isWrongNetwork, setIsWrongNetwork] = useState(false);
  const [ethPrices, setEthPrices] = useState({ usd: null, inr: null });
  const [isTxPending, setIsTxPending] = useState(false);

  // State for Loan Application Form
  const [principal, setPrincipal] = useState(1000);
  const [tenure, setTenure] = useState(12);
  const [collateral, setCollateral] = useState(500);
  const [selectedToken, setSelectedToken] = useState('ETH'); // 'ETH' or 'USDC'
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [usdcAllowance, setUsdcAllowance] = useState(0);

  const getLendingContract = useCallback(async () => {
    try {
      const { ethereum } = window;
      if (ethereum) {
        const provider = new ethers.BrowserProvider(ethereum);
        const signer = await provider.getSigner();
        const lendingContract = new ethers.Contract(
          CONTRACT_ADDRESS,
          LendingPlatformABI.abi,
          signer
        );
        return lendingContract;
      }
    } catch (error) {
      console.error("Error getting contract:", error);
    }
  }, []);

  const getUsdcContract = useCallback(async () => {
    try {
      const { ethereum } = window;
      if (ethereum) {
        const provider = new ethers.BrowserProvider(ethereum);
        const signer = await provider.getSigner();
        return new ethers.Contract(MOCK_USDC_ADDRESS, MOCK_USDC_ABI, signer);
      }
    } catch (error) {
      console.error("Error getting USDC contract:", error);
    }
  }, []);

  const fetchRiskScore = useCallback(async (account) => {
    setLoadingScore(true);
    try {
      const contract = await getLendingContract();
      if (contract) {
        const score = await contract.borrowerRiskScore(account);
        setRiskScore(Number(score)); // Safe parsing
      }
    } catch (error) {
      console.error("Failed to fetch risk score:", error);
      setRiskScore(null); // Reset on error
    } finally {
      setLoadingScore(false);
    }
  }, [getLendingContract]);

  const fetchUsdcData = useCallback(async (account) => {
    try {
      const usdc = await getUsdcContract();
      if (usdc) {
        const balance = await usdc.balanceOf(account);
        const allowance = await usdc.allowance(account, CONTRACT_ADDRESS);
        setUsdcBalance(ethers.formatUnits(balance, 18)); // Assuming 18 decimals for MockUSDC
        setUsdcAllowance(ethers.formatUnits(allowance, 18));
      }
    } catch (error) {
      console.error("Failed to fetch USDC data:", error);
    }
  }, [getUsdcContract]);

  const checkIfWalletIsConnected = useCallback(async () => {
    const { ethereum } = window;
    if (!ethereum) return;
    const accounts = await ethereum.request({ method: "eth_accounts" });
    if (accounts.length !== 0) {
      setCurrentAccount(accounts[0]);
      fetchRiskScore(accounts[0]);
      fetchUsdcData(accounts[0]);
    }
  }, [fetchRiskScore, fetchUsdcData]);

  const checkNetwork = async () => {
    const { ethereum } = window;
    if (ethereum) {
      const chainId = await ethereum.request({ method: "eth_chainId" });
      console.log("Connected to Chain ID:", chainId);
      if (chainId !== EXPECTED_CHAIN_ID) {
        setIsWrongNetwork(true);
      } else {
        setIsWrongNetwork(false);
      }
    }
  };

  const fetchEthPrice = useCallback(async (retries = 3) => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,inr');
      if (!response.ok) throw new Error("API Error");
      const data = await response.json();
      if (data.ethereum) {
        setEthPrices({
          usd: data.ethereum.usd,
          inr: data.ethereum.inr
        });
      }
    } catch (error) {
      console.error("Failed to fetch ETH prices:", error);
      if (retries > 0) {
        setTimeout(() => fetchEthPrice(retries - 1), 2000); // Retry after 2s
      }
    }
  }, []);

  useEffect(() => {
    checkIfWalletIsConnected();
    checkNetwork();
    fetchEthPrice();

    // Listen for chain changes with cleanup
    if (window.ethereum) {
      const handleChainChanged = () => window.location.reload();
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, [checkIfWalletIsConnected, fetchEthPrice]);

  const connectWallet = async () => {
    try {
      const { ethereum } = window;
      if (!ethereum) { alert("Get MetaMask!"); return; }
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      setCurrentAccount(accounts[0]);
      fetchRiskScore(accounts[0]);
      fetchUsdcData(accounts[0]);
    } catch (error) {
      console.error(error);
    }
  };

  const handleMintUSDC = async () => {
    try {
      const usdc = await getUsdcContract();
      if (usdc && currentAccount) {
        setIsTxPending(true);
        const tx = await usdc.mint(currentAccount, ethers.parseUnits("10000", 18));
        await tx.wait();
        alert("Minted 10,000 MockUSDC!");
        fetchUsdcData(currentAccount);
      }
    } catch (error) {
      console.error("Mint failed:", error);
    } finally {
      setIsTxPending(false);
    }
  };

  const handleApproveUSDC = async () => {
    try {
      const usdc = await getUsdcContract();
      if (usdc) {
        setIsTxPending(true);
        const tx = await usdc.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
        await tx.wait();
        alert("USDC Approved!");
        fetchUsdcData(currentAccount);
      }
    } catch (error) {
      console.error("Approval failed:", error);
    } finally {
      setIsTxPending(false);
    }
  };

  const handleApplyLoan = async (event) => {
    event.preventDefault();

    // Validation: Use parseFloat for ETH values
    const principalValue = parseFloat(principal);
    const tenureValue = parseInt(tenure);
    const collateralValue = parseFloat(collateral);

    if (isNaN(principalValue) || principalValue <= 0) {
      alert("Principal must be a valid positive number.");
      return;
    }
    if (isNaN(tenureValue) || tenureValue <= 0) {
      alert("Tenure must be a valid positive number.");
      return;
    }
    if (isNaN(collateralValue) || collateralValue < 0) {
      alert("Collateral must be a valid non-negative number.");
      return;
    }

    // Convert collateral to Wei (assuming 18 decimals for both ETH and MockUSDC)
    const finalCollateralWei = ethers.parseUnits(collateralValue.toString(), 'ether');

    try {
      const contract = await getLendingContract();
      if (contract) {
        setIsTxPending(true); // Start loading
        console.log("Submitting Loan Application...");

        let tx;
        if (selectedToken === 'ETH') {
          tx = await contract.applyForLoan(
            parseInt(principalValue),
            tenureValue,
            parseInt(collateralValue), // Note: Contract logic for logging might need update, but this is fine for now
            ethers.ZeroAddress, // address(0) for ETH
            { value: finalCollateralWei }
          );
        } else {
          // USDC
          // Check allowance first
          if (parseFloat(usdcAllowance) < collateralValue) {
            alert("Insufficient USDC Allowance. Please Approve first.");
            setIsTxPending(false);
            return;
          }
          tx = await contract.applyForLoan(
            parseInt(principalValue),
            tenureValue,
            finalCollateralWei, // Pass amount as uint256
            MOCK_USDC_ADDRESS
          );
        }

        alert("Application submitted! Waiting for confirmation...");
        await tx.wait();

        console.log("Loan Application Confirmed!", tx.hash);
        alert(`Loan Applied! Interest Rate calculated based on your score of ${riskScore}.`);
        fetchUsdcData(currentAccount); // Refresh balance
      }
    } catch (error) {
      console.error("Loan application failed:", error);
      alert("Loan application failed! Check console for details.");
    } finally {
      setIsTxPending(false); // Stop loading
    }
  };


  // --- UI Structure ---
  return (
    <div style={{ fontFamily: "'Outfit', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial" }} className="min-h-screen bg-[#0f172a] text-slate-100 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-blue-600/20 blur-[120px]"></div>
        <div className="absolute top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-cyan-500/10 blur-[100px]"></div>
        <div className="absolute -bottom-[10%] left-[20%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[100px]"></div>
      </div>

      <style>{"@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');"}</style>

      <div className="relative max-w-7xl mx-auto px-6 py-8">

        {/* Network Warning Banner */}
        {isWrongNetwork && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-4 text-red-200 backdrop-blur-md animate-fade-in-up">
            <div className="p-2 bg-red-500/20 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-lg">Wrong Network Detected</div>
              <div className="text-sm opacity-80">Please switch your wallet to <strong>Localhost 8545</strong> (Chain ID: 31337) to use this app.</div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6 animate-fade-in-up">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <span className="text-2xl">⚡</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Lend<span className="text-cyan-400">AI</span>
              </h1>
              <p className="text-sm text-slate-400 font-medium tracking-wide">INTELLIGENT CREDIT PROTOCOL</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4">
            {/* Price Ticker */}
            <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-4 text-sm font-medium border-slate-700/50">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-slate-300">ETH/USD</span>
                <span className="text-white font-mono">{ethPrices.usd ? `$${ethPrices.usd.toLocaleString()}` : '...'}</span>
              </div>
              <div className="w-px h-4 bg-slate-700"></div>
              <div className="flex items-center gap-2">
                <span className="text-slate-300">ETH/INR</span>
                <span className="text-white font-mono">{ethPrices.inr ? `₹${ethPrices.inr.toLocaleString()}` : '...'}</span>
              </div>
            </div>

            {currentAccount ? (
              <div className="glass-panel pl-2 pr-4 py-2 rounded-full flex items-center gap-3 border-slate-700/50 hover:border-cyan-500/30 transition-colors cursor-pointer group">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center text-xs font-bold shadow-lg group-hover:shadow-cyan-500/20 transition-all">
                  {currentAccount.substring(2, 4)}
                </div>
                <div className="text-sm font-medium text-slate-200">
                  {/* Safe Address Slicing */}
                  {currentAccount.length === 42
                    ? `${currentAccount.substring(0, 6)}...${currentAccount.substring(38)}`
                    : currentAccount}
                </div>
              </div>
            ) : (
              <button onClick={connectWallet} className="px-6 py-3 rounded-full bg-white text-slate-900 font-bold text-sm hover:bg-cyan-50 transition-all shadow-lg hover:shadow-cyan-500/20 active:scale-95">
                Connect Wallet
              </button>
            )}
          </div>
        </header>

        <main className="grid lg:grid-cols-12 gap-8 items-start">

          {/* Left Column: Risk Score & Stats (5 cols) */}
          <section className="lg:col-span-5 space-y-6 animate-fade-in-up delay-100">

            {/* Risk Score Card */}
            <div className="glass-panel rounded-3xl p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-cyan-500/20 duration-700"></div>

              <div className="relative z-10">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-lg font-semibold text-white">AI Credit Score</h2>
                    <p className="text-slate-400 text-sm mt-1">Real-time on-chain assessment</p>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 text-xs font-medium text-cyan-400">
                    BETA v1.0
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center py-4">
                  <div className="relative w-48 h-48 flex items-center justify-center">
                    {/* Circular Progress Background */}
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-800" />
                      <circle
                        cx="96" cy="96" r="88"
                        stroke="currentColor" strokeWidth="12"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 88}
                        strokeDashoffset={2 * Math.PI * 88 * (1 - ((riskScore || 0) / 100))}
                        strokeLinecap="round"
                        className={`transition-all duration-1000 ease-out ${riskScore > 70 ? 'text-emerald-400' : riskScore > 45 ? 'text-amber-400' : 'text-rose-400'}`}
                      />
                    </svg>

                    {/* Center Content */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-6xl font-bold text-white tracking-tighter text-glow">
                        {loadingScore ? '...' : (riskScore ?? 0)}
                      </span>
                      <span className="text-sm font-medium text-slate-400 mt-1">OUT OF 100</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">Interest Rate</div>
                    <div className="text-xl font-bold text-white">
                      {riskScore == null ? '—' : `${mapScoreToRate(riskScore, principal, tenure, collateral)}%`}
                      <span className="text-xs font-normal text-slate-500 ml-1">APR</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">Max LTV</div>
                    <div className="text-xl font-bold text-white">
                      {riskScore > 70 ? '85%' : '60%'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Facts */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: "⚡", label: "Instant Approval", desc: "AI-driven decision" },
                { icon: "🔒", label: "Non-Custodial", desc: "Smart contract held" },
                { icon: "🌍", label: "Global Access", desc: "No borders" },
                { icon: "📊", label: "Transparent", desc: "100% On-chain" }
              ].map((item, i) => (
                <div key={i} className="glass-panel p-4 rounded-2xl hover:bg-slate-800/60 transition-colors">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <div className="font-semibold text-sm text-slate-200">{item.label}</div>
                  <div className="text-xs text-slate-500">{item.desc}</div>
                </div>
              ))}
            </div>

          </section>

          {/* Right Column: Application Form (7 cols) */}
          <section className="lg:col-span-7 animate-fade-in-up delay-200">
            <form onSubmit={handleApplyLoan} className="glass-panel rounded-3xl p-8 md:p-10 relative">

              {/* Loading Overlay */}
              {isTxPending && (
                <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-3xl">
                  <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-white font-bold">Processing Transaction...</p>
                  <p className="text-slate-400 text-sm mt-2">Please confirm in your wallet</p>
                </div>
              )}

              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-white">Loan Application</h2>
                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${riskScore ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                  {riskScore ? 'Qualified' : 'Connect Wallet'}
                </div>
              </div>

              <div className="space-y-6">

                {/* Principal Input */}
                <div className="space-y-2">
                  <label htmlFor="principal" className="text-sm font-medium text-slate-300 ml-1">Loan Amount (ETH)</label>
                  <div className="relative">
                    <input
                      id="principal"
                      name="principal"
                      value={principal}
                      onChange={(e) => setPrincipal(e.target.value)}
                      type="number" min="0" step="0.01"
                      aria-label="Loan Principal Amount in ETH"
                      className="glass-input w-full rounded-xl px-5 py-4 text-lg font-medium text-white placeholder-slate-600"
                      placeholder="0.00"
                    />
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 font-medium pointer-events-none">ETH</div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Tenure Input */}
                  <div className="space-y-2">
                    <label htmlFor="tenure" className="text-sm font-medium text-slate-300 ml-1">Duration (Months)</label>
                    <div className="relative">
                      <input
                        id="tenure"
                        name="tenure"
                        value={tenure}
                        onChange={(e) => setTenure(e.target.value)}
                        type="number" min="1" step="1"
                        aria-label="Loan Duration in Months"
                        className="glass-input w-full rounded-xl px-5 py-4 text-lg font-medium text-white placeholder-slate-600"
                        placeholder="12"
                      />
                    </div>
                  </div>

                  {/* Collateral Input */}
                  <div className="space-y-2">
                    <label htmlFor="collateral" className="text-sm font-medium text-slate-300 ml-1">Collateral</label>

                    {/* Token Selector */}
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setSelectedToken('ETH')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${selectedToken === 'ETH' ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400'}`}
                      >
                        ETH
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedToken('USDC')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${selectedToken === 'USDC' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'}`}
                      >
                        USDC
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        id="collateral"
                        name="collateral"
                        value={collateral}
                        onChange={(e) => setCollateral(e.target.value)}
                        type="number" min="0" step="0.01"
                        aria-label={`Collateral Amount in ${selectedToken}`}
                        className="glass-input w-full rounded-xl px-5 py-4 text-lg font-medium text-white placeholder-slate-600"
                        placeholder="0.00"
                      />
                      <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 font-medium pointer-events-none">{selectedToken}</div>
                    </div>

                    {/* USDC Helper Buttons */}
                    {selectedToken === 'USDC' && (
                      <div className="flex justify-between items-center mt-2 text-xs">
                        <span className="text-slate-400">Balance: {parseFloat(usdcBalance).toFixed(2)} USDC</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={handleMintUSDC} className="text-cyan-400 hover:text-cyan-300 underline">Mint Test USDC</button>
                          {parseFloat(usdcAllowance) < parseFloat(collateral || 0) && (
                            <button type="button" onClick={handleApproveUSDC} className="text-amber-400 hover:text-amber-300 underline font-bold">Approve USDC</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary Box */}
                <div className="mt-6 p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Monthly Payment (Est.)</span>
                    <span className="text-slate-200 font-medium">
                      {riskScore ? `${(principal * (1 + mapScoreToRate(riskScore, principal, tenure, collateral) / 100) / tenure).toFixed(4)} ETH` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Total Repayment</span>
                    <span className="text-slate-200 font-medium">
                      {riskScore ? `${(principal * (1 + mapScoreToRate(riskScore, principal, tenure, collateral) / 100)).toFixed(4)} ETH` : '—'}
                    </span>
                  </div>
                  <div className="h-px bg-slate-800 my-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Estimated APR</span>
                    <span className="text-xl font-bold text-cyan-400 text-glow">
                      {riskScore == null ? '—' : `${mapScoreToRate(riskScore, principal, tenure, collateral)}%`}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-4 flex gap-4">
                  <button
                    type="submit"
                    disabled={riskScore == null || riskScore === 0 || isTxPending}
                    className={`flex-1 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform active:scale-[0.98] ${riskScore == null || riskScore === 0 || isTxPending
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500'
                      }`}
                  >
                    {isTxPending ? 'Processing...' : (riskScore == null ? 'Waiting for Score...' : (riskScore === 0 ? 'Loan Rejected' : 'Submit Application'))}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setPrincipal(0); setTenure(12); setCollateral(0); }}
                    disabled={isTxPending}
                    className="px-6 py-4 rounded-xl font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    Reset
                  </button>
                </div>

                <p className="text-center text-xs text-slate-500 mt-4">
                  By submitting, you agree to the smart contract terms. <br />
                  Gas fees apply for on-chain transactions.
                </p>

              </div>
            </form>
          </section>

        </main>

        <footer className="mt-20 border-t border-slate-800 pt-8 text-center">
          <p className="text-slate-500 text-sm">© {new Date().getFullYear()} LendAI Protocol. Built for the Future of Finance.</p>
        </footer>

      </div>
    </div>
  );
}

export default App;