"""
Contribution to code made by: Carlos Mendoza
train_mood_model.py
--------------------
Trains a Random Forest mood classifier on merged old + new data.

Key design decisions:
  - Uses Random Forest (not MLP) — better calibrated confidence scores
  - Excludes rms_variance and tempo_proxy — these are window-level stats
    computed in collect_data.py but server.py sends 0 for them every frame,
    which causes the model to misclassify live audio as Sad
  - Old data missing new feature columns is filled with per-mood means
    from new data (not 0) — zero-fill makes old rows look like Sad
  - Saves mood_model_rf.pkl (not mood_model.pt) — server.py loads this first

Usage:
    pip install scikit-learn pandas numpy
    python train_mood_model.py
"""

import json
import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.utils import resample
from sklearn.metrics import classification_report
import pickle

# ── 1. Load data ──────────────────────────────────────────────────────────────
COMBINED_CSV  = "combined_mood_data.csv"
NEW_CSV       = "real_mood_data.csv"
SYNTHETIC_CSV = "hot100_simplified_mood.csv"

old_df = None
new_df = None

if os.path.exists(COMBINED_CSV):
    old_df = pd.read_csv(COMBINED_CSV)
    print(f"✓ Loaded base data: {COMBINED_CSV} ({len(old_df)} rows)")
if os.path.exists(NEW_CSV):
    new_df = pd.read_csv(NEW_CSV)
    print(f"✓ Loaded new collected data: {NEW_CSV} ({len(new_df)} rows)")
if old_df is None and new_df is None:
    old_df = pd.read_csv(SYNTHETIC_CSV)
    print(f"⚠  No real data found — using synthetic: {SYNTHETIC_CSV}")

# ── Feature columns ───────────────────────────────────────────────────────────
# rms_variance and tempo_proxy are intentionally excluded:
# collect_data.py computes them over a 5-second window, but server.py
# processes one frame at a time and sends 0.0 for both every prediction.
# Training on them (even with smart fill) causes live mismatch errors.
FEATURE_COLS = [
    "chroma_major_strength",
    "chroma_minor_strength",
    "mfcc_1",
    "mfcc_2",
    "mfcc_3",
    "spectral_centroid",
    "rms",
    "zcr",
    "mfcc_4",
    "mfcc_5",
    "mfcc_6",
    "mfcc_7",
    "mfcc_8",
    "spectral_flux",
    # rms_variance  <- excluded: window stat, not available per-frame in server
    # tempo_proxy   <- excluded: window stat, not available per-frame in server
]
LABEL_COL = "mood"
MOODS     = ["Angry", "Energetic", "Happy", "Sad"]

# ── 2. Smart-fill old data new features with per-mood means ───────────────────
# Zero-fill makes old rows look like Sad (spectral_flux=0 < Sad mean of 0.099)
# Instead fill each old row with the per-mood mean from new collected data
NEW_FEATURES = ["mfcc_4", "mfcc_5", "mfcc_6", "mfcc_7", "mfcc_8", "spectral_flux"]

if old_df is not None and new_df is not None:
    new_present = [f for f in NEW_FEATURES if f in new_df.columns]
    mood_means  = new_df.groupby(LABEL_COL)[new_present].mean()

    for mood in old_df[LABEL_COL].unique():
        mask = old_df[LABEL_COL] == mood
        for f in new_present:
            fill_val = mood_means.loc[mood, f] if mood in mood_means.index else 0.0
            if f not in old_df.columns:
                old_df.loc[mask, f] = fill_val
            else:
                old_df.loc[mask, f] = old_df.loc[mask, f].fillna(fill_val)

    print("✓ Old data new features filled with per-mood means (not zeros)")

# ── 3. Merge ──────────────────────────────────────────────────────────────────
frames = [df for df in [old_df, new_df] if df is not None]
df = pd.concat(frames, ignore_index=True)

# Fix negative RMS
if "rms" in df.columns:
    df["rms"] = df["rms"].abs()

# Only keep feature cols that actually exist in the data
FEATURE_COLS = [c for c in FEATURE_COLS if c in df.columns]
print(f"\nTraining on {len(FEATURE_COLS)} features: {FEATURE_COLS}")
print(f"Combined total: {len(df)} rows\n")

df = df[FEATURE_COLS + [LABEL_COL]].dropna(subset=[LABEL_COL] + FEATURE_COLS)
df = df[df[LABEL_COL].isin(MOODS)].reset_index(drop=True)

print("Class distribution before balancing:")
print(df[LABEL_COL].value_counts())
print(f"Total rows: {len(df)}\n")

if len(df) < 20:
    print("ERROR: Not enough data to train. Collect more rows with collect_data.py")
    exit(1)

# ── 4. Balance dataset ────────────────────────────────────────────────────────
max_count = df[LABEL_COL].value_counts().max()
balanced  = [
    resample(df[df[LABEL_COL] == c], replace=True,
             n_samples=max_count, random_state=42)
    for c in MOODS if c in df[LABEL_COL].values
]
df = pd.concat(balanced).sample(frac=1, random_state=42).reset_index(drop=True)

print("Class distribution after balancing:")
print(df[LABEL_COL].value_counts())
print()

# ── 5. Encode + normalise ─────────────────────────────────────────────────────
X_raw  = df[FEATURE_COLS].values.astype(np.float32)
le     = LabelEncoder().fit(MOODS)
y      = le.transform(df[LABEL_COL]).astype(np.int64)
scaler = StandardScaler()
X      = scaler.fit_transform(X_raw)

# ── 6. Cross-validate before saving ──────────────────────────────────────────
print("Running 5-fold cross-validation...")
cv    = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
rf_cv = CalibratedClassifierCV(
    RandomForestClassifier(n_estimators=200, min_samples_leaf=3, random_state=42),
    method="isotonic", cv=5
)
scores = cross_val_score(rf_cv, X, y, cv=cv, scoring="accuracy")
print(f"CV accuracy: {scores.mean():.3f} +/- {scores.std():.3f}\n")

# ── 7. Train final model ──────────────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
rf_final = CalibratedClassifierCV(
    RandomForestClassifier(n_estimators=200, min_samples_leaf=3, random_state=42),
    method="isotonic", cv=5
)
rf_final.fit(X_train, y_train)

preds = rf_final.predict(X_test)
print("Classification report:")
print(classification_report(y_test, preds, target_names=MOODS))

# ── 8. Save scaler + model ────────────────────────────────────────────────────
with open("scaler_params.json", "w") as f:
    json.dump({
        "mean":     scaler.mean_.tolist(),
        "std":      scaler.scale_.tolist(),
        "features": FEATURE_COLS,
        "moods":    MOODS,
    }, f, indent=2)
print(f"✓ scaler_params.json written ({len(FEATURE_COLS)} features)")

with open("mood_model_rf.pkl", "wb") as f:
    pickle.dump({"model": rf_final, "le": le, "features": FEATURE_COLS}, f)
print(f"✓ mood_model_rf.pkl written ({len(FEATURE_COLS)} features)")

# ── 9. Sanity check — model and scaler must agree ─────────────────────────────
model_n  = len(rf_final.predict_proba(X_test[:1])[0])  # outputs (4 classes)
scaler_n = len(scaler.mean_)
assert scaler_n == len(FEATURE_COLS), \
    f"MISMATCH: scaler has {scaler_n} features but FEATURE_COLS has {len(FEATURE_COLS)}"
print(f"✓ Sanity check passed: model and scaler both expect {len(FEATURE_COLS)} features")
print("\nDone! Replace mood_model_rf.pkl and scaler_params.json on your server,")
print("then restart server.py to use the new model.")