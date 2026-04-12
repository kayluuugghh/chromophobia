"""
server.py
----------
Uses the trained ML model (mood_model.pt) if available.
Falls back to rule-based classification if no model file is found.

Dependencies:
    pip install websockets numpy torch

Usage:
    python server.py
"""

import asyncio
import json
import os
import numpy as np
import websockets
from collections import deque

HOST     = "localhost"
PORT     = 8765
MOODS    = ["Angry", "Energetic", "Happy", "Sad"]
SMOOTH_N = 5
history  = deque(maxlen=SMOOTH_N)

# ── Load scaler ───────────────────────────────────────────────────────────────
with open("scaler_params.json") as f:
    sp = json.load(f)
MEAN = np.array(sp["mean"],  dtype=np.float32)
STD  = np.array(sp["std"],   dtype=np.float32)

# ── Load model ────────────────────────────────────────────────────────────────
USE_MODEL = False
pt_model  = None

if os.path.exists("mood_model.pt"):
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
        USE_MODEL = True
        print("✓ Loaded mood_model.pt — using ML classifier")
    except Exception as e:
        print(f"Could not load model ({e}) — using rule-based fallback")
else:
    print("mood_model.pt not found — using rule-based fallback")
    print("Run collect_data.py then train_mood_model.py to enable ML classification")


# ── Feature extraction ────────────────────────────────────────────────────────
def extract_features(payload: dict) -> np.ndarray:
    chroma   = [float(c) for c in (payload.get("chroma") or [0.0] * 12)]
    mfcc     = [float(v) for v in (payload.get("mfcc")   or [0.0] * 13)]
    chroma_sum = sum(chroma) + 1e-6
    major    = (chroma[0] + chroma[4] + chroma[7]) / chroma_sum
    minor    = (chroma[0] + chroma[3] + chroma[7]) / chroma_sum
    return np.array([
        major,
        minor,
        mfcc[1] if len(mfcc) > 1 else 0.0,
        mfcc[2] if len(mfcc) > 2 else 0.0,
        mfcc[3] if len(mfcc) > 3 else 0.0,
        float(payload.get("spectralCentroid", 0.0)),
        float(payload.get("rms",  0.0)),
        float(payload.get("zcr",  0.0)),
    ], dtype=np.float32)


def softmax(x, temperature=1.0):
    e = np.exp((x - x.max()) / temperature)
    return e / e.sum()


# ── ML prediction ─────────────────────────────────────────────────────────────
def predict_ml(features: np.ndarray) -> dict:
    import torch
    normed = ((features - MEAN) / (STD + 1e-8)).reshape(1, -1)
    with torch.no_grad():
        logits = pt_model(torch.tensor(normed)).numpy()[0]
    probs = softmax(logits, temperature=0.7)
    return dict(zip(MOODS, probs.tolist()))


# ── Rule-based fallback ───────────────────────────────────────────────────────
def predict_rules(payload: dict) -> dict:
    rms      = float(payload.get("rms", 0.0))
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
    mood = max(scores, key=scores.get)
    return {
        "mood":       mood,
        "confidence": round(scores[mood], 4),
        "scores":     {m: round(v, 4) for m, v in scores.items()},
    }


# ── WebSocket handler ─────────────────────────────────────────────────────────
async def handler(websocket):
    history.clear()
    print(f"Client connected: {websocket.remote_address}")
    try:
        async for raw in websocket:
            try:
                payload = json.loads(raw)
                if USE_MODEL:
                    features   = extract_features(payload)
                    raw_scores = predict_ml(features)
                else:
                    raw_scores = predict_rules(payload)
                result = build_response(smooth(raw_scores))
                await websocket.send(json.dumps(result))
            except Exception as e:
                await websocket.send(json.dumps({"error": str(e)}))
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        print(f"Client disconnected: {websocket.remote_address}")


async def main():
    mode = "ML model" if USE_MODEL else "rule-based"
    print(f"Mood classifier [{mode}] → ws://{HOST}:{PORT}")
    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())