# ai_risk_model.py - Final Dynamic Model with Integrated Parameters
# UPDATED: Persistence, Calibration, Explainability, and JSON Output

import sys
import os
import pandas as pd
import numpy as np
import logging
import json
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV
import warnings

# --- Configuration ---
warnings.filterwarnings('ignore')
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

MODEL_PATH = 'risk_model.joblib'
SCALER_PATH = 'scaler.joblib'

# --- 1. Model Training & Persistence ---
def train_and_save_model():
    logger.info("Training new model...")
    # Generate 1000 synthetic loan records
    np.random.seed(42)
    n_samples = 1000

    # Features
    income_scores = np.random.randint(1, 11, n_samples)
    credit_history = np.random.randint(1, 11, n_samples)
    principal_eth = np.random.uniform(0.1, 5.0, n_samples)
    tenure_months = np.random.randint(3, 37, n_samples)
    collateral_ratio = np.random.uniform(0.1, 2.0, n_samples)

    df = pd.DataFrame({
        'Income_Score': income_scores,
        'Credit_History': credit_history,
        'Principal_Eth': principal_eth,
        'Tenure_Months': tenure_months,
        'Collateral_Ratio': collateral_ratio
    })

    # Target Logic
    base_score = (df['Income_Score'] * 0.8) + (df['Credit_History'] * 0.8) + (df['Collateral_Ratio'] * 3.5) - (df['Principal_Eth'] * 0.5) - (df['Tenure_Months'] * 0.05)
    base_score += np.random.normal(0, 2.5, n_samples)
    df['Loan_Repaid'] = (base_score > 6.0).astype(int)

    X = df[['Income_Score', 'Credit_History', 'Principal_Eth', 'Tenure_Months', 'Collateral_Ratio']]
    y = df['Loan_Repaid']

    # Scaling
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Model with Calibration
    base_lr = LogisticRegression()
    calibrated_model = CalibratedClassifierCV(base_lr, method='sigmoid', cv=5)
    calibrated_model.fit(X_scaled, y)

    # Save artifacts
    joblib.dump(calibrated_model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    logger.info("Model and scaler saved to disk.")
    
    return calibrated_model, scaler

def load_model():
    if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
        try:
            model = joblib.load(MODEL_PATH)
            scaler = joblib.load(SCALER_PATH)
            logger.info("Loaded existing model and scaler.")
            return model, scaler
        except Exception as e:
            logger.error(f"Error loading model: {e}. Retraining...")
            return train_and_save_model()
    else:
        return train_and_save_model()

# Load (or train) model on startup
model, scaler = load_model()

# --- 2. Helper Functions ---

def validate_inputs(principal, tenure, collateral, income_score, credit_score):
    """Validates and clamps inputs to safe ranges."""
    principal = max(0.01, min(principal, 100.0))
    tenure = max(1, min(int(tenure), 60))
    collateral = max(0.0, min(collateral, 200.0))
    income_score = max(1, min(int(income_score), 10))
    credit_score = max(1, min(int(credit_score), 10))
    return principal, tenure, collateral, income_score, credit_score

def get_decision_band(score):
    if score >= 70:
        return "APPROVE"
    elif score >= 45:
        return "MANUAL_REVIEW"
    else:
        return "REJECT"

def explain_prediction(model, scaled_features, feature_names):
    """
    Returns top 3 contributing features.
    Note: For CalibratedClassifierCV, we access the base estimator's coefs if possible,
    or average them. Here we assume the first calibrated classifier's base estimator 
    is representative for explanation purposes.
    """
    try:
        # Access the first base estimator from the calibrated ensemble
        base_estimator = model.calibrated_classifiers_[0].base_estimator
        coefs = base_estimator.coef_[0]
        
        # Calculate contribution: coef * scaled_value
        contributions = coefs * scaled_features[0]
        
        # Create list of (feature, contribution)
        feature_contribs = list(zip(feature_names, contributions))
        
        # Sort by absolute contribution (magnitude of impact)
        feature_contribs.sort(key=lambda x: abs(x[1]), reverse=True)
        
        # Format top 3
        top_3 = [{"feature": f, "impact": round(c, 2)} for f, c in feature_contribs[:3]]
        return top_3
    except Exception as e:
        logger.warning(f"Could not generate explanation: {e}")
        return []

def predict_score(borrower_address, principal, tenure, collateral, eth_price_usd, eth_price_inr, income_score=5, credit_score=5):
    # 1. Validation
    principal, tenure, collateral, income_score, credit_score = validate_inputs(
        principal, tenure, collateral, income_score, credit_score
    )
    
    # 2. Features
    collateral_ratio = collateral / principal if principal > 0 else 0 
    feature_names = ['Income_Score', 'Credit_History', 'Principal_Eth', 'Tenure_Months', 'Collateral_Ratio']
    raw_features = np.array([[income_score, credit_score, principal, tenure, collateral_ratio]])
    
    # 3. Scaling
    scaled_features = scaler.transform(raw_features)

    # 4. Prediction
    prediction_proba = model.predict_proba(scaled_features)[0][1]
    risk_score = int(prediction_proba * 100)
    
    # 5. Post-Processing
    decision = get_decision_band(risk_score)
    explanation = explain_prediction(model, scaled_features, feature_names)
    
    result = {
        "score": risk_score,
        "decision": decision,
        "explanation": explanation,
        "inputs": {
            "principal": principal,
            "tenure": tenure,
            "collateral": collateral,
            "collateral_ratio": round(collateral_ratio, 2)
        }
    }
    
    return result

if __name__ == "__main__":
    if len(sys.argv) >= 7:
        try:
            borrower_addr = sys.argv[1]
            principal_val = float(sys.argv[2])
            tenure_val = int(sys.argv[3])
            collateral_val = float(sys.argv[4])
            eth_price_usd_val = float(sys.argv[5])
            eth_price_inr_val = float(sys.argv[6])
            
            inc_val = int(sys.argv[7]) if len(sys.argv) > 7 else 5
            cred_val = int(sys.argv[8]) if len(sys.argv) > 8 else 5
            
            result = predict_score(borrower_addr, principal_val, tenure_val, collateral_val, eth_price_usd_val, eth_price_inr_val, inc_val, cred_val)
            
            # Output JSON to stdout
            print(json.dumps(result))
            
        except ValueError as e:
            logger.error(f"Input error: {e}")
            print(json.dumps({"error": str(e), "score": 0}))
    else:
        logger.error("Missing arguments.")
        print(json.dumps({"error": "Missing arguments", "score": 0}))