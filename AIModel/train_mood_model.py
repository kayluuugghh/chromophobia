"""
train_mood_model.py
--------------------
Trains a MLP mood classifier.
Uses real_mood_data.csv (collected via collect_data.py) if it exists,
otherwise falls back to hot100_simplified_mood.csv.

Usage:
    pip install torch scikit-learn pandas numpy
    python train_mood_model.py
"""

import json
import os
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.utils import resample
from sklearn.metrics import classification_report

# ── 1. Load data — prefer real collected data ─────────────────────────────────
REAL_CSV      = "real_mood_data_extended.csv"
SYNTHETIC_CSV = "hot100_simplified_mood.csv"

if os.path.exists(REAL_CSV):
    CSV_PATH = REAL_CSV
    print(f"✓ Using real collected data: {REAL_CSV}")
else:
    CSV_PATH = SYNTHETIC_CSV
    print(f"⚠  real_mood_data.csv not found — using synthetic data: {SYNTHETIC_CSV}")
    print("   Run collect_data.py to gather real audio data for better results.\n")

FEATURE_COLS = [
    "chroma_major_strength",
    "chroma_minor_strength",
    "mfcc_1",
    "mfcc_2",
    "mfcc_3",
    "spectral_centroid",
    "rms",
    "zcr",
]
LABEL_COL = "mood"
MOODS     = ["Angry", "Energetic", "Happy", "Sad"]

df = pd.read_csv(CSV_PATH)

# Drop any extra columns (e.g. timestamp from collect_data.py)
df = df[[c for c in FEATURE_COLS + [LABEL_COL] if c in df.columns]]

# Drop rows with missing mood or features
df = df.dropna(subset=[LABEL_COL] + FEATURE_COLS)

# Only keep known moods
df = df[df[LABEL_COL].isin(MOODS)].reset_index(drop=True)

print("\nClass distribution before balancing:")
print(df[LABEL_COL].value_counts())
print(f"Total rows: {len(df)}\n")

if len(df) < 20:
    print("ERROR: Not enough data to train. Collect more rows with collect_data.py")
    exit(1)

# ── 2. Balance dataset ────────────────────────────────────────────────────────
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

# ── 3. Encode ─────────────────────────────────────────────────────────────────
X_raw = df[FEATURE_COLS].values.astype(np.float32)
le    = LabelEncoder().fit(MOODS)
y     = le.transform(df[LABEL_COL]).astype(np.int64)

# ── 4. Normalise ──────────────────────────────────────────────────────────────
scaler = StandardScaler()
X      = scaler.fit_transform(X_raw).astype(np.float32)

with open("scaler_params.json", "w") as f:
    json.dump({
        "mean":         scaler.mean_.tolist(),
        "std":          scaler.scale_.tolist(),
        "feature_cols": FEATURE_COLS,
        "moods":        MOODS,
    }, f, indent=2)
print("✓ scaler_params.json written")

# ── 5. Split ──────────────────────────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
train_loader = DataLoader(TensorDataset(torch.tensor(X_train), torch.tensor(y_train)),
                          batch_size=16, shuffle=True)
test_loader  = DataLoader(TensorDataset(torch.tensor(X_test),  torch.tensor(y_test)),
                          batch_size=16)

# ── 6. Model ──────────────────────────────────────────────────────────────────
class MoodMLP(nn.Module):
    def __init__(self, in_features=8, num_classes=4):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_features, 64),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, num_classes),
        )
    def forward(self, x):
        return self.net(x)

model = MoodMLP()

# ── 7. Weighted loss ──────────────────────────────────────────────────────────
orig_counts   = pd.read_csv(CSV_PATH)[LABEL_COL].value_counts()
total         = orig_counts.sum()
class_weights = torch.tensor(
    [total / orig_counts.get(m, 1) for m in MOODS], dtype=torch.float32
)
class_weights = class_weights / class_weights.sum() * len(MOODS)
print("Class weights:", {m: round(w.item(), 3) for m, w in zip(MOODS, class_weights)})

criterion = nn.CrossEntropyLoss(weight=class_weights)
optimiser  = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
scheduler  = torch.optim.lr_scheduler.StepLR(optimiser, step_size=30, gamma=0.5)

# ── 8. Train ──────────────────────────────────────────────────────────────────
EPOCHS = 150

print()
for epoch in range(1, EPOCHS + 1):
    model.train()
    total_loss = 0.0
    for xb, yb in train_loader:
        optimiser.zero_grad()
        loss = criterion(model(xb), yb)
        loss.backward()
        optimiser.step()
        total_loss += loss.item() * len(xb)
    scheduler.step()

    if epoch % 25 == 0:
        model.eval()
        correct = 0
        with torch.no_grad():
            for xb, yb in test_loader:
                correct += (model(xb).argmax(1) == yb).sum().item()
        print(f"Epoch {epoch:3d} | loss {total_loss/len(X_train):.4f} "
              f"| val acc {correct/len(X_test):.2%}")

# ── 9. Evaluate ───────────────────────────────────────────────────────────────
model.eval()
preds, trues = [], []
with torch.no_grad():
    for xb, yb in test_loader:
        preds.extend(model(xb).argmax(1).tolist())
        trues.extend(yb.tolist())

print("\nClassification report:")
print(classification_report(trues, preds, target_names=MOODS))

# ── 10. Save weights (.pt) ────────────────────────────────────────────────────
torch.save(model.state_dict(), "mood_model.pt")
print("✓ mood_model.pt written")

# Try ONNX export (optional — server.py works with .pt too)
try:
    dummy = torch.zeros(1, 8)
    model.eval()
    with torch.no_grad():
        torch.onnx.export(
            model, (dummy,), "mood_model.onnx",
            export_params=True, opset_version=11,
            do_constant_folding=True,
            input_names=["features"], output_names=["logits"],
            dynamic_axes={"features": {0: "batch"}, "logits": {0: "batch"}},
        )
    print("✓ mood_model.onnx written")
except Exception:
    print("  (ONNX export skipped — server.py will use mood_model.pt)")

print("\nDone! Restart server.py to use the new model.")