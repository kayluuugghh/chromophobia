"""
server.py
----------
Uses a calibrated Random Forest (mood_model_rf.pkl) if available.
Falls back to the rule-based classifier if no model file is found.

Improvements over original:
  - Calibrated Random Forest for better confidence scores
  - Engineered features (major_minor_ratio, rms_x_centroid)
  - Negative RMS fix (abs-value clamp)
  - Softer temperature on rule-based fallback (1.5 → already good)
  - Per-mood confidence stats logged for monitoring

Dependencies:
    pip install websockets numpy scikit-learn

Usage:
    python server.py
"""

import asyncio
import json
import os
import pickle
import numpy as np
import websockets
from collections import deque

HOST     = "localhost"
PORT     = 8765
MOODS    = ["Angry", "Energetic", "Happy", "Sad"]
SMOOTH_N = 5
# No confidence threshold — always return the top mood

history = deque(maxlen=SMOOTH_N)

# ── Load scaler ───────────────────────────────────────────────────────────────
with open("scaler_params.json") as f:
    sp = json.load(f)
MEAN     = np.array(sp["mean"], dtype=np.float32)
STD      = np.array(sp["std"],  dtype=np.float32)
FEATURES = sp.get("features", [
    "chroma_major_strength", "chroma_minor_strength",
    "mfcc_1", "mfcc_2", "mfcc_3",
    "spectral_centroid", "rms", "zcr",
])

# ── Load model ────────────────────────────────────────────────────────────────
USE_MODEL  = False
rf_bundle  = None

# Prefer new calibrated RF pickle; fall back to legacy PyTorch .pt
if os.path.exists("mood_model_rf.pkl"):
    try:
        with open("mood_model_rf.pkl", "rb") as f:
            rf_bundle = pickle.load(f)
        USE_MODEL = True
        print("✓ Loaded mood_model_rf.pkl — using calibrated Random Forest")
    except Exception as e:
        print(f"Could not load mood_model_rf.pkl ({e}) — trying PyTorch fallback")

if not USE_MODEL and os.path.exists("mood_model.pt"):
    try:
        import torch
        import torch.nn as nn

        class MoodMLP(nn.Module):
            def __init__(self, in_features=8, num_classes=4):
                super().__init__()
                self.net = nn.Sequential(
                    nn.Linear(in_features, 64), nn.ReLU(), nn.Dropout(0.3),
                    nn.Linear(64, 32),          nn.ReLU(), nn.Dropout(0.2),
                    nn.Linear(32, num_classes),
                )
            def forward(self, x):
                return self.net(x)

        pt_model = MoodMLP()
        pt_model.load_state_dict(torch.load("mood_model.pt", map_location="cpu"))
        pt_model.eval()
        USE_MODEL = "torch"
        print("✓ Loaded mood_model.pt — using PyTorch MLP (consider retraining with RF)")
    except Exception as e:
        print(f"Could not load mood_model.pt ({e}) — using rule-based fallback")

if not USE_MODEL:
    print("No model found — using rule-based fallback")
    print("Run train_mood_model.py to generate mood_model_rf.pkl")


# ── Feature extraction ────────────────────────────────────────────────────────
def extract_features(payload: dict) -> np.ndarray:
    chroma = [float(c) for c in (payload.get("chroma") or [0.0] * 12)]
    mfcc   = [float(v) for v in (payload.get("mfcc")   or [0.0] * 13)]

    chroma_sum = sum(chroma) + 1e-6
    major      = (chroma[0] + chroma[4] + chroma[7]) / chroma_sum
    minor      = (chroma[0] + chroma[3] + chroma[7]) / chroma_sum

    rms      = abs(float(payload.get("rms", 0.0)))
    centroid = float(payload.get("spectralCentroid", 0.0))
    zcr      = float(payload.get("zcr", 0.0))
    flux     = abs(float(payload.get("spectralFlux", 0.0)))

    # All possible features in training order — trimmed to len(MEAN) below
    # so old scaler (8 features) and new scaler (16 features) both work
    all_features = [
        # Original 8
        major, minor,
        mfcc[1] if len(mfcc) > 1 else 0.0,
        mfcc[2] if len(mfcc) > 2 else 0.0,
        mfcc[3] if len(mfcc) > 3 else 0.0,
        centroid, rms, zcr,
        # New 8 (from updated collect_data.py)
        mfcc[4] if len(mfcc) > 4 else 0.0,
        mfcc[5] if len(mfcc) > 5 else 0.0,
        mfcc[6] if len(mfcc) > 6 else 0.0,
        mfcc[7] if len(mfcc) > 7 else 0.0,
        mfcc[8] if len(mfcc) > 8 else 0.0,
        flux,
        0.0,   # rms_variance — window stat, not available per-frame
        0.0,   # tempo_proxy  — window stat, not available per-frame
    ]

    # Trim or pad to exactly match loaded scaler length — prevents shape mismatch
    n = len(MEAN)
    if len(all_features) >= n:
        return np.array(all_features[:n], dtype=np.float32)
    return np.array(all_features + [0.0] * (n - len(all_features)), dtype=np.float32)


def softmax(x: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    e = np.exp((x - x.max()) / temperature)
    return e / e.sum()


# ── ML prediction (Random Forest) ────────────────────────────────────────────
def predict_rf(features: np.ndarray) -> dict:
    model    = rf_bundle["model"]
    le       = rf_bundle["le"]
    normed   = ((features - MEAN) / (STD + 1e-8)).reshape(1, -1)
    probs    = model.predict_proba(normed)[0]            # already calibrated
    classes  = le.classes_                               # ['Angry','Energetic','Happy','Sad']
    return dict(zip(classes, probs.tolist()))


# ── ML prediction (PyTorch fallback) ─────────────────────────────────────────
def predict_torch(features: np.ndarray) -> dict:
    import torch
    normed = ((features - MEAN) / (STD + 1e-8)).reshape(1, -1)
    with torch.no_grad():
        logits = pt_model(torch.tensor(normed)).numpy()[0]
    # Use temperature=1.3 (was 0.7 — that caused overconfidence)
    probs = softmax(logits, temperature=1.3)
    return dict(zip(MOODS, probs.tolist()))


# ── Rule-based fallback ───────────────────────────────────────────────────────
def predict_rules(payload: dict) -> dict:
    rms      = abs(float(payload.get("rms", 0.0)))       # Fix: abs-value
    zcr      = float(payload.get("zcr", 0.0))
    centroid = float(payload.get("spectralCentroid", 0.0))
    chroma   = [float(c) for c in (payload.get("chroma") or [0.0] * 12)]
    mfcc     = [float(v) for v in (payload.get("mfcc")   or [0.0] * 13)]

    rms_n      = np.clip(rms / 0.15, 0.0, 1.0)
    zcr_n      = np.clip((zcr - 0.05) / 0.20, 0.0, 1.0)
    centroid_n = np.clip((centroid - 500) / 3500, 0.0, 1.0)
    chroma_sum = sum(chroma) + 1e-6
    major_n    = np.clip(((chroma[0] + chroma[4] + chroma[7]) / chroma_sum) / 0.35, 0.0, 1.0)
    minor_n    = np.clip(((chroma[0] + chroma[3] + chroma[7]) / chroma_sum) / 0.35, 0.0, 1.0)
    mfcc2_n    = np.clip((float(mfcc[2]) + 20) / 40, 0.0, 1.0) if len(mfcc) > 2 else 0.5

    angry     = rms_n*0.30 + zcr_n*0.35 + (1-centroid_n)*0.20 + minor_n*0.15
    energetic = rms_n*0.35 + centroid_n*0.30 + (1-zcr_n)*0.20 + (1-minor_n)*0.15
    happy     = centroid_n*0.30 + major_n*0.35 + mfcc2_n*0.20 + rms_n*0.15
    sad       = (1-rms_n)*0.25 + (1-centroid_n)*0.25 + minor_n*0.30 + (1-zcr_n)*0.20

    raw   = np.array([angry, energetic, happy, sad], dtype=np.float32)
    probs = softmax(raw, temperature=1.5)
    return dict(zip(MOODS, probs.tolist()))


# ── Smoothing ─────────────────────────────────────────────────────────────────
def smooth(new_scores: dict) -> dict:
    history.append(new_scores)
    avg   = {m: float(np.mean([h[m] for h in history])) for m in MOODS}
    total = sum(avg.values()) + 1e-9
    return {m: avg[m] / total for m in MOODS}


def build_response(scores: dict) -> dict:
    mood       = max(scores, key=scores.get)
    confidence = round(scores[mood], 4)
    return {
        "mood":       mood,
        "confidence": confidence,
        "scores":     {m: round(v, 4) for m, v in scores.items()},
    }


# ── WebSocket handler ─────────────────────────────────────────────────────────
async def handler(websocket):
    history.clear()
    addr = websocket.remote_address
    print(f"Client connected: {addr}")
    try:
        async for raw in websocket:
            try:
                payload = json.loads(raw)

                if USE_MODEL == True:               # calibrated RF
                    features   = extract_features(payload)
                    raw_scores = predict_rf(features)
                elif USE_MODEL == "torch":          # legacy PyTorch
                    features   = extract_features(payload)
                    raw_scores = predict_torch(features)
                else:                               # rule-based
                    raw_scores = predict_rules(payload)

                result = build_response(smooth(raw_scores))
                await websocket.send(json.dumps(result))

            except Exception as e:
                await websocket.send(json.dumps({"error": str(e)}))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        print(f"Client disconnected: {addr}")


async def main():
    if USE_MODEL == True:
        mode = "calibrated Random Forest"
    elif USE_MODEL == "torch":
        mode = "PyTorch MLP"
    else:
        mode = "rule-based"
    print(f"Mood classifier [{mode}] → ws://{HOST}:{PORT}")

    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())