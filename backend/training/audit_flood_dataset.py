"""
Audits flood_risk_dataset_india.xlsx for real predictive signal before
trusting it for training. Run this before you retrain the flood model on
any new dataset — it's the check that caught the original dataset being
synthetic/unusable.

Usage: python3 audit_flood_dataset.py /path/to/dataset.xlsx
"""
import sys
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score

path = sys.argv[1] if len(sys.argv) > 1 else "../../flood_risk_dataset_india.xlsx"
df = pd.read_excel(path)

TARGET = "Flood Occurred"
FEATURES = [c for c in df.select_dtypes(include="number").columns if c != TARGET]

print(f"Loaded {len(df)} rows, {len(FEATURES)} numeric features")
print("\n--- Correlation with target (should show at least a few features > 0.15 for real signal) ---")
print(df[FEATURES + [TARGET]].corr()[TARGET].sort_values())

X, y = df[FEATURES].values, df[TARGET].values
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
rf = RandomForestClassifier(n_estimators=300, random_state=42).fit(Xtr, ytr)
auc = roc_auc_score(yte, rf.predict_proba(Xte)[:, 1])
print(f"\n--- Random forest AUC: {auc:.4f} ---")
print("AUC ~0.50 = no learnable signal (this is what the original dataset produced).")
print("AUC > 0.70 = worth training a real model on this data.")

print("\n--- Uniformity check (real sensor data is rarely perfectly uniform) ---")
for f in FEATURES[:6]:
    print(f"  {f}: min={df[f].min():.1f} max={df[f].max():.1f} mean={df[f].mean():.1f} "
          f"(uniform would have mean ≈ (min+max)/2 = {(df[f].min()+df[f].max())/2:.1f})")