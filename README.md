# LendAI Protocol

**Intelligent Credit Protocol**

LendAI is a decentralized lending platform that leverages AI to provide dynamic interest rates and risk assessment. Users can borrow assets against their crypto collateral with terms tailored to their on-chain risk profile.

## Features

- **AI-Driven Risk Scoring**: Real-time analysis of borrower risk to determine interest rates and LTV ratios.
- **Multi-Asset Collateral**: Support for ETH and USDC collateral.
- **Dynamic Interest Rates**: Rates adjust based on credit score, tenure, and collateral ratio.
- **Instant Approval**: Smart contract-based lending with no manual intervention.
- **Non-Custodial**: You retain control of your assets until liquidation conditions are met.

## Technology Stack

- **Smart Contracts**: Solidity, Hardhat
- **Frontend**: React.js, Ethers.js, TailwindCSS
- **Backend**: Node.js (Oracle), Python (AI Risk Model)
- **Blockchain**: Ethereum (Localhost/Testnet)

## Prerequisites

- [Node.js](https://nodejs.org/) (v14+)
- [Python](https://www.python.org/) (3.8+)
- [MetaMask](https://metamask.io/)

## Installation

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd lend-ai-protocol
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    cd frontend
    npm install
    cd ..
    ```

## Usage

1.  **Start Local Node**
    ```bash
    npx hardhat node
    ```

2.  **Deploy Contracts**
    ```bash
    npx hardhat run scripts/deploy.js --network localhost
    ```

3.  **Start Oracle & Frontend**
    ```bash
    # Terminal 1: Oracle
    node backend_oracle.js

    # Terminal 2: Frontend
    cd frontend
    npm start
    ```

## License

MIT
