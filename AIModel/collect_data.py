"""
collect_data.py
----------------
Collects labeled mood data from real Meyda audio features.

How to use:
  1. Run:  python collect_data.py
  2. Open your React app, click Share screen audio
  3. Play a song that clearly fits ONE mood
  4. Press Enter in this terminal, then type the mood label:
       angry / energetic / happy / sad
  5. It records for 5 seconds then saves a row
  6. Repeat with different songs
  7. Type 'quit' to save and exit

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

buffer        = deque(maxlen=BUFFER_SIZE)
rows          = []
is_recording  = False
record_lock   = threading.Lock()

VALID_MOODS = {"angry": "Angry", "energetic": "Energetic",
               "happy": "Happy", "sad": "Sad"}


# ── Safe feature extraction — never crashes on None ───────────────────────────
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


def extract_features(payload: dict):
    rms      = safe_float(payload.get("rms"))
    zcr      = safe_float(payload.get("zcr"))
    centroid = safe_float(payload.get("spectralCentroid"))
    chroma   = safe_list(payload.get("chroma"), 12)
    mfcc     = safe_list(payload.get("mfcc"), 13)

    # Skip silent frames
    if rms < 0.0001:
        return None

    chroma_sum = sum(chroma) + 1e-6
    major = (chroma[0] + chroma[4] + chroma[7]) / chroma_sum
    minor = (chroma[0] + chroma[3] + chroma[7]) / chroma_sum

    return {
        "chroma_major_strength": round(major, 5),
        "chroma_minor_strength": round(minor, 5),
        "mfcc_1":                round(mfcc[1], 5),
        "mfcc_2":                round(mfcc[2], 5),
        "mfcc_3":                round(mfcc[3], 5),
        "spectral_centroid":     round(centroid, 2),
        "rms":                   round(rms, 6),
        "zcr":                   round(zcr, 6),
    }


# ── Save CSV ──────────────────────────────────────────────────────────────────
def save_csv():
    if not rows:
        print("\nNo data collected yet.")
        return
    df = pd.DataFrame(rows)
    if os.path.exists(OUTPUT):
        existing = pd.read_csv(OUTPUT)
        df = pd.concat([existing, df], ignore_index=True)
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

    # Wait 5 seconds while the WebSocket handler fills the buffer
    import time
    time.sleep(5)

    with record_lock:
        if len(buffer) < 3:
            print("  ✗ Not enough audio data received — is the browser connected?")
            is_recording = False
            return

        # Average all buffered frames into one training row
        keys = list(next(iter(buffer)).keys())
        averaged = {k: round(float(np.mean([f[k] for f in buffer])), 6) for k in keys}
        averaged["mood"]      = label
        averaged["timestamp"] = datetime.now().isoformat()
        rows.append(averaged)

        mood_counts = pd.Series([r["mood"] for r in rows]).value_counts().to_dict()
        print(f"  ✓ Row saved [{label}]  |  Total: {len(rows)}  |  {mood_counts}")
        is_recording = False


# ── Keyboard input loop (runs in its own thread) ──────────────────────────────
def keyboard_loop():
    print("\n" + "="*55)
    print("  MOOD DATA COLLECTOR")
    print("="*55)
    print("  Moods: angry | energetic | happy | sad | quit")
    print("="*55)
    print("\n  Steps:")
    print("  1. Open the React app and share screen audio")
    print("  2. Play a song that clearly fits ONE mood")
    print("  3. Type the mood name here and press Enter")
    print("  4. It records 5 sec then saves a row")
    print("  5. Repeat — aim for 30+ rows per mood\n")

    while True:
        try:
            raw = input("  Mood (angry/energetic/happy/sad/quit): ").strip().lower()
        except EOFError:
            break

        if raw == "quit" or raw == "q":
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
                    buffer.append(features)

                # Send a neutral response so the browser doesn't error
                await websocket.send(json.dumps({
                    "mood":       "recording",
                    "confidence": 1.0,
                    "scores":     {"Angry": 0.25, "Energetic": 0.25,
                                   "Happy": 0.25, "Sad": 0.25},
                }))
            except Exception:
                pass   # swallow silently to avoid spam
    except websockets.exceptions.ConnectionClosed:
        print("  Browser disconnected")


# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    # Start keyboard thread
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