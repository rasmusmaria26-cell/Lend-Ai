// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LendingPlatform {
    
    // 1. DATA STRUCTURE: Defines a single Loan
    struct Loan {
        uint256 loanId;
        address borrower;
        uint256 principal;
        uint256 interestRate; // Set based on AI Risk Score
        uint256 tenure;
        uint256 collateralAmount;
        address collateralToken; // address(0) for ETH, otherwise ERC20 token address
        bool isRepaid;
    }

    // 2. STATE VARIABLES
    Loan[] public loans;
    address public trustedOracle; // Address of the secure backend/API
    mapping(address => uint256) public borrowerRiskScore; // Stores AI score (0-100)
    mapping(address => bool) public supportedCollateral; // Whitelist of allowed collateral tokens
    uint256 public nextLoanId = 1;

    // 3. EVENTS (for transparent tracking)
    event ScoreUpdated(address indexed borrower, uint256 score);
    event LoanDisbursed(uint256 loanId, address borrower, uint256 principal, uint256 rate, address collateralToken, uint256 collateralAmount);
    event LoanRepaid(uint256 loanId, address borrower, uint256 amount);
    event CollateralAdded(address token);

    // 4. MODIFIER: Restricts access to the trusted backend
    modifier onlyOracle() {
        require(msg.sender == trustedOracle, "Caller is not the trusted Oracle/Backend.");
        _;
    }

    // 5. CONSTRUCTOR: Sets the trusted backend address upon deployment
    // In a real system, the initial deployer would provide their API address here.
    constructor(address _oracle) {
        trustedOracle = _oracle;
    }

    // 6. FUNCTION: Receives the AI Risk Score from the backend
    // This is the bridge where off-chain AI data enters the blockchain.
    function setRiskScore(address _borrower, uint256 _score) external onlyOracle {
        // Simple validation, score should be reasonable (e.g., max 100)
        require(_score <= 100, "Score must be between 0 and 100.");
        borrowerRiskScore[_borrower] = _score;
        emit ScoreUpdated(_borrower, _score);
    }

    // Admin function to whitelist collateral tokens
    function addCollateralToken(address _token) external onlyOracle {
        supportedCollateral[_token] = true;
        emit CollateralAdded(_token);
    }

    // 7. FUNCTION: Initiates a Loan (The core business logic)
    // The interest rate is now conditional on the AI score.
    // Now supports both ETH (address(0)) and ERC20 tokens
    function applyForLoan(uint256 _principal, uint256 _tenure, uint256 _collateralAmount, address _collateralToken) external payable {
        uint256 riskScore = borrowerRiskScore[msg.sender];
        
        // Ensure the borrower has been scored and is not high risk
        require(riskScore > 0, "Risk score is missing or invalid.");
        
        // Collateral Handling
        if (_collateralToken == address(0)) {
            // ETH Collateral
            require(msg.value == _collateralAmount, "Incorrect ETH collateral sent.");
        } else {
            // ERC20 Collateral
            require(supportedCollateral[_collateralToken], "Token not supported.");
            require(msg.value == 0, "Do not send ETH with ERC20 collateral.");
            
            // Transfer tokens from borrower to this contract
            // Borrower must have called approve() first
            bool success = IERC20(_collateralToken).transferFrom(msg.sender, address(this), _collateralAmount);
            require(success, "Token transfer failed. Check allowance.");
        }

        // Define interest rate based on risk score (Simple example logic)
        uint256 finalRate = 100 / riskScore; // Higher score = lower rate
        
        // Final loan validation/disbursement logic would go here
        
        // Log the loan application
        loans.push(Loan(
            nextLoanId,
            msg.sender,
            _principal,
            finalRate,
            _tenure,
            _collateralAmount,
            _collateralToken,
            false
        ));
        
        nextLoanId++;
        
        // This function would normally contain logic to transfer 'principal' to the borrower.
        // For now, we emit an event instead.
        emit LoanDisbursed(nextLoanId - 1, msg.sender, _principal, finalRate, _collateralToken, _collateralAmount);
    }
}