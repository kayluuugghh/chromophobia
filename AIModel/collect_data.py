"""
Contribution to code made by: Carlos Mendoza
collect_data.py
----------------
Collects labeled mood data from real Meyda audio features.

New features vs original:
  - mfcc_4 through mfcc_8  (finer timbral texture)
  - spectral_flux           (rate of change — Angry = spiky, Happy = smooth)
  - rms_variance            (loudness consistency — computed over the recording window)
  - tempo_estimate          (BPM approximated from ZCR autocorrelation over window)

How to use:
  1. Update your React app's Meyda extractor (see REACT_CHANGES.md in outputs)
  2. Run:  python collect_data.py
  3. Open your React app, click Share screen audio
  4. Play a song that clearly fits ONE mood
  5. Type the mood label and press Enter:
       angry / energetic / happy / sad
  6. It records for 5 seconds then saves a row
  7. Repeat — aim for 50+ rows per mood for boundary cases
  8. Type 'quit' to save and exit

Output: real_mood_data.csv

Dependencies:
    pip install websockets numpy pandas
"""

import asyncio
import json
import os
import threading
import numpy as np
import pandas as pd
import websockets
from collections import deque
from datetime import datetime

HOST        = "localhost"
PORT        = 8765
OUTPUT      = "real_mood_data.csv"
BUFFER_SIZE = 15   # frames to average into one saved row

# Full frame buffer for variance/flux/tempo calculations (keep raw frames)
frame_buffer  = deque(maxlen=BUFFER_SIZE)
rows          = []
is_recording  = False
record_lock   = threading.Lock()

VALID_MOODS = {"angry": "Angry", "energetic": "Energetic",
               "happy": "Happy", "sad": "Sad"}


# ── Safe helpers ──────────────────────────────────────────────────────────────
def safe_float(v, default=0.0):
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def safe_list(v, length, default=0.0):
    if not v:
        return [default] * length
    result = []
    for i in range(length):
        try:
            result.append(float(v[i]) if i < len(v) and v[i] is not None else default)
        except (TypeError, ValueError):
            result.append(default)
    return result


# ── Feature extraction (per frame) ───────────────────────────────────────────
def extract_features(payload: dict):
    rms      = safe_float(payload.get("rms"))
    zcr      = safe_float(payload.get("zcr"))
    centroid = safe_float(payload.get("spectralCentroid"))
    flux     = safe_float(payload.get("spectralFlux"))
    chroma   = safe_list(payload.get("chroma"), 12)
    mfcc     = safe_list(payload.get("mfcc"), 13)

    # Skip silent frames
    if rms < 0.0001:
        return None

    chroma_sum = sum(chroma) + 1e-6
    major = (chroma[0] + chroma[4] + chroma[7]) / chroma_sum
    minor = (chroma[0] + chroma[3] + chroma[7]) / chroma_sum

    return {
        # Original features
        "chroma_major_strength": round(major, 5),
        "chroma_minor_strength": round(minor, 5),
        "mfcc_1":                round(mfcc[1],  5) if len(mfcc) > 1 else 0.0,
        "mfcc_2":                round(mfcc[2],  5) if len(mfcc) > 2 else 0.0,
        "mfcc_3":                round(mfcc[3],  5) if len(mfcc) > 3 else 0.0,
        "spectral_centroid":     round(centroid, 5),
        "rms":                   round(abs(rms), 6),   # abs: guard against negative
        "zcr":                   round(zcr,      6),
        # New features
        "mfcc_4":                round(mfcc[4],  5) if len(mfcc) > 4 else 0.0,
        "mfcc_5":                round(mfcc[5],  5) if len(mfcc) > 5 else 0.0,
        "mfcc_6":                round(mfcc[6],  5) if len(mfcc) > 6 else 0.0,
        "mfcc_7":                round(mfcc[7],  5) if len(mfcc) > 7 else 0.0,
        "mfcc_8":                round(mfcc[8],  5) if len(mfcc) > 8 else 0.0,
        "spectral_flux":         round(flux,     6),
    }


# ── Window-level features (computed across the full recording buffer) ─────────
def compute_window_features(frames: list) -> dict:
    """
    Features that only make sense across multiple frames, not per-frame averages.
    Called once after the 5-second recording window completes.
    """
    rms_values = [f["rms"] for f in frames]
    zcr_values = [f["zcr"] for f in frames]

    # RMS variance: how much does loudness fluctuate?
    # Angry = high variance (hard hits), Energetic = moderate, Sad = low
    rms_variance = round(float(np.var(rms_values)), 8)

    # Tempo estimate from ZCR autocorrelation
    # ZCR tracks zero crossings which loosely correlate with rhythmic events.
    # A proper BPM estimator needs raw audio, but this gives a useful proxy.
    zcr_arr = np.array(zcr_values)
    tempo_proxy = 0.0
    if len(zcr_arr) >= 6:
        # Autocorrelation peak lag → approximate period → BPM proxy
        zcr_centered = zcr_arr - zcr_arr.mean()
        autocorr = np.correlate(zcr_centered, zcr_centered, mode='full')
        autocorr = autocorr[len(autocorr) // 2:]
        # Find first peak after lag 1 (skip the trivial lag-0 peak)
        if len(autocorr) > 3:
            # Simple peak: first local max in lags 1..N//2
            half = max(2, len(autocorr) // 2)
            diffs = np.diff(autocorr[1:half])
            peaks = np.where((diffs[:-1] > 0) & (diffs[1:] <= 0))[0]
            if len(peaks) > 0:
                lag = peaks[0] + 1          # lag in frames
                # Each frame ≈ 1/3 s at typical Meyda 512 hop / 44100 Hz
                # Rough BPM: 60 / (lag * frame_duration)
                # We store the lag directly — server normalises it
                tempo_proxy = round(float(lag), 4)

    return {
        "rms_variance": rms_variance,
        "tempo_proxy":  tempo_proxy,
    }


# ── Save CSV ──────────────────────────────────────────────────────────────────
def save_csv():
    if not rows:
        print("\nNo data collected yet.")
        return
    df = pd.DataFrame(rows)
    if os.path.exists(OUTPUT):
        existing = pd.read_csv(OUTPUT)
        # Align columns — fill missing with 0 for backward compat
        df = pd.concat([existing, df], ignore_index=True).fillna(0)
    df.to_csv(OUTPUT, index=False)
    counts = df["mood"].value_counts().to_dict()
    print(f"\n✓ Saved {len(df)} total rows to {OUTPUT}")
    print(f"  Counts: {counts}")


# ── Record one labeled snapshot ───────────────────────────────────────────────
def record_snapshot(label: str):
    global is_recording

    with record_lock:
        if is_recording:
            print("  Already recording, please wait...")
            return
        is_recording = True

    print(f"  ● Recording [{label}] for 5 seconds — keep music playing...")

    import time
    time.sleep(5)

    with record_lock:
        frames = list(frame_buffer)

        if len(frames) < 3:
            print("  ✗ Not enough audio data received — is the browser connected?")
            is_recording = False
            return

        # Per-frame average for stable features
        keys = list(frames[0].keys())
        averaged = {k: round(float(np.mean([f[k] for f in frames])), 6) for k in keys}

        # Window-level features (not averages)
        window_feats = compute_window_features(frames)
        averaged.update(window_feats)

        averaged["mood"]      = label
        averaged["timestamp"] = datetime.now().isoformat()
        averaged["source"]    = "real"
        rows.append(averaged)

        mood_counts = pd.Series([r["mood"] for r in rows]).value_counts().to_dict()
        print(f"  ✓ Row saved [{label}]  |  Total: {len(rows)}  |  {mood_counts}")
        is_recording = False


# ── Keyboard input loop ───────────────────────────────────────────────────────
def keyboard_loop():
    print("\n" + "="*60)
    print("  MOOD DATA COLLECTOR  (extended features)")
    print("="*60)
    print("  Moods: angry | energetic | happy | sad | quit")
    print("="*60)
    print("\n  Steps:")
    print("  1. Update your React app Meyda config (see REACT_CHANGES.md)")
    print("  2. Open the React app and share screen audio")
    print("  3. Play a song that CLEARLY fits ONE mood")
    print("  4. Type the mood name here and press Enter")
    print("  5. Hold for 5 sec then the row saves automatically")
    print("  6. Aim for 50+ rows per mood, especially Angry/Energetic/Happy\n")
    print("  TIP: For boundary cases (songs that could be Angry OR Energetic),")
    print("  label them as whichever mood is stronger — these are the most")
    print("  valuable training examples.\n")

    while True:
        try:
            raw = input("  Mood (angry/energetic/happy/sad/quit): ").strip().lower()
        except EOFError:
            break

        if raw in ("quit", "q"):
            save_csv()
            print("Goodbye!")
            os._exit(0)

        if raw in VALID_MOODS:
            label = VALID_MOODS[raw]
            t = threading.Thread(target=record_snapshot, args=(label,), daemon=True)
            t.start()
        else:
            print(f"  Unknown: '{raw}'. Use angry / energetic / happy / sad / quit")


# ── WebSocket handler ─────────────────────────────────────────────────────────
async def handler(websocket):
    print(f"\n  ✓ Browser connected — start playing music!")
    try:
        async for raw in websocket:
            try:
                payload  = json.loads(raw)
                features = extract_features(payload)
                if features is not None:
                    frame_buffer.append(features)

                await websocket.send(json.dumps({
                    "mood":       "recording",
                    "confidence": 1.0,
                    "scores":     {"Angry": 0.25, "Energetic": 0.25,
                                   "Happy": 0.25, "Sad": 0.25},
                }))
            except Exception:
                pass
    except websockets.exceptions.ConnectionClosed:
        print("  Browser disconnected")


# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    t = threading.Thread(target=keyboard_loop, daemon=True)
    t.start()

    print(f"\n  WebSocket listening on ws://{HOST}:{PORT}")
    print("  Waiting for browser connection...\n")

    try:
        async with websockets.serve(handler, HOST, PORT):
            await asyncio.Future()
    except asyncio.CancelledError:
        save_csv()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        save_csv()
        print("Interrupted — data saved.")