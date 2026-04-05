import { useState, useEffect, useCallback, useRef } from 'react';
import NavBar from './assets/Navbar';

// ─── Config ───────────────────────────────────────────────────────
const CLIENT_ID   = import.meta.env.VITE_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;
const SCOPES       = 'streaming user-read-email user-read-private user-modify-playback-state';

// ─── PKCE Helpers ─────────────────────────────────────────────────
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier) {
  const data   = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ─── Auth Exports ─────────────────────────────────────────────────
export async function loginWithSpotify() {
  localStorage.removeItem('spotify_verifier');
  localStorage.removeItem('spotify_token');

  const verifier  = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem('spotify_verifier', verifier);

  const params = new URLSearchParams({
    client_id:             CLIENT_ID,
    response_type:         'code',
    redirect_uri:          REDIRECT_URI,
    scope:                 SCOPES,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem('spotify_verifier');
  if (!verifier) throw new Error('No code_verifier found. Please log in again.');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`${data.error}: ${data.error_description}`);
  localStorage.removeItem('spotify_verifier');
  return data.access_token;
}

export function getCodeFromUrl() {
  return new URLSearchParams(window.location.search).get('code');
}

// ─── Hook: useSpotifyPlayer ───────────────────────────────────────
function useSpotifyPlayer(token) {
  const [player,   setPlayer]   = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [state,    setState]    = useState(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    if (window.Spotify) { setSdkReady(true); return; }
    window.onSpotifyWebPlaybackSDKReady = () => setSdkReady(true);
    const script = document.createElement('script');
    script.src   = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  useEffect(() => {
    if (!sdkReady || !token) return;

    const p = new window.Spotify.Player({
      name: 'Chromophobia Spotify Player',
      getOAuthToken: cb => cb(token),
      volume: 0.5,
    });

    p.addListener('ready',                ({ device_id }) => setDeviceId(device_id));
    p.addListener('not_ready',            ()              => setDeviceId(null));
    p.addListener('player_state_changed', s               => setState(s));
    p.addListener('initialization_error', ({ message })   => setError(message));
    p.addListener('authentication_error', ({ message })   => setError(message));
    p.addListener('account_error',        ({ message })   => setError(message));

    p.connect();
    setPlayer(p);
    return () => p.disconnect();
  }, [sdkReady, token]);

  useEffect(() => {
    if (!deviceId || !token) return;
    fetch('https://api.spotify.com/v1/me/player', {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ device_ids: [deviceId], play: false }),
    });
  }, [deviceId, token]);

  return { player, deviceId, state, sdkReady, error };
}

// ─── Hook: usePlaybackControls ────────────────────────────────────
function usePlaybackControls(player, token, deviceId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const togglePlay = useCallback(() => player?.togglePlay(),    [player]);
  const nextTrack  = useCallback(() => player?.nextTrack(),     [player]);
  const prevTrack  = useCallback(() => player?.previousTrack(), [player]);
  const seek       = useCallback((ms) => player?.seek(ms),      [player]);
  const setVolume  = useCallback((v)  => player?.setVolume(v),  [player]);

  const playUri = useCallback(async (uri) => {
    await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      { method: 'PUT', headers, body: JSON.stringify({ uris: [uri] }) }
    );
  }, [token, deviceId]);

  return { togglePlay, nextTrack, prevTrack, seek, setVolume, playUri };
}

// ─── Hook: useAudioCapture ────────────────────────────────────────
function useAudioCapture() {
  const [capturing,  setCapturing]  = useState(false);
  const [features,   setFeatures]   = useState(null);
  const [captureErr, setCaptureErr] = useState(null);
  const analyzerRef  = useRef(null);
  const streamRef    = useRef(null);

  // Load Meyda script once
  useEffect(() => {
    if (window.Meyda) return;
    const script = document.createElement('script');
    script.src   = 'https://unpkg.com/meyda/dist/web/meyda.min.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const startCapture = useCallback(async () => {
    setCaptureErr(null);
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach(t => t.stop());
        throw new Error('No audio track found. Make sure to check "Share tab audio" in the dialog.');
      }

      // Stop video — we only need audio
      displayStream.getVideoTracks().forEach(t => t.stop());

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(
        new MediaStream(audioTracks)
      );

      // Wait for Meyda to be available
      if (!window.Meyda) {
        await new Promise(resolve => {
          const interval = setInterval(() => {
            if (window.Meyda) { clearInterval(interval); resolve(); }
          }, 100);
        });
      }

      const analyzer = window.Meyda.createMeydaAnalyzer({
        audioContext,
        source,
        bufferSize: 512,
        featureExtractors: ['rms', 'zcr', 'spectralCentroid', 'spectralFlatness', 'mfcc', 'chroma'],
        callback: (f) => {
          if (!f) return;
          setFeatures({
            rms:              f.rms?.toFixed(4)         ?? '—',
            zcr:              f.zcr                     ?? '—',
            spectralCentroid: Math.round(f.spectralCentroid ?? 0) + ' Hz',
            spectralFlatness: f.spectralFlatness?.toFixed(4) ?? '—',
            mfcc:             f.mfcc?.map(v => v.toFixed(1)) ?? [],
            chroma:           f.chroma?.map(v => v.toFixed(2)) ?? [],
          });
        },
      });

      analyzer.start();
      analyzerRef.current = analyzer;
      streamRef.current   = audioTracks;
      setCapturing(true);

      // Handle user stopping share from browser UI
      audioTracks[0].addEventListener('ended', stopCapture);

    } catch (err) {
      setCaptureErr(err.message);
    }
  }, []);

  const stopCapture = useCallback(() => {
    analyzerRef.current?.stop();
    streamRef.current?.forEach(t => t.stop());
    analyzerRef.current = null;
    streamRef.current   = null;
    setCapturing(false);
    setFeatures(null);
  }, []);

  return { capturing, features, captureErr, startCapture, stopCapture };
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatMs(ms) {
  const total = Math.floor(ms / 1000);
  const m     = Math.floor(total / 60);
  const s     = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// ─── Component ────────────────────────────────────────────────────
export default function SpotifyPlayer({ token: propToken}) {
  const token = propToken || localStorage.getItem('spotify_token');
  const { player, deviceId, state, sdkReady, error } = useSpotifyPlayer(token);
  const { togglePlay, nextTrack, prevTrack, seek, setVolume, playUri } =
    usePlaybackControls(player, token, deviceId);
  const { capturing, features, captureErr, startCapture, stopCapture } =
    useAudioCapture();

  const [volume,   setVolumeState] = useState(50);
  const [uriInput, setUriInput]    = useState('');

  const track    = state?.track_window?.current_track;
  const paused   = state?.paused ?? true;
  const position = state?.position ?? 0;
  const duration = state?.duration ?? 1;

  const handleVolumeChange = (e) => {
    const v = Number(e.target.value);
    setVolumeState(v);
    setVolume(v / 100);
  };

  if (error)     return <p>Error: {error}</p>;
  if (!sdkReady) return <p>Loading Spotify SDK...</p>;
  if (!deviceId) return <p>Connecting to Spotify...</p>;

  return (
    <div>
      <NavBar/>

      {/* Track info */}
      <div>
        {track?.album?.images?.[0]?.url && (
          <img src={track.album.images[0].url} alt="album" width={64} height={64} />
        )}
        <p><strong>{track?.name ?? 'No track playing'}</strong></p>
        <p>{track?.artists?.map(a => a.name).join(', ') ?? '—'}</p>
        <p>{track?.album?.name ?? ''}</p>
      </div>

      {/* Progress */}
      <div>
        <span>{formatMs(position)}</span>
        <input
          type="range"
          min={0}
          max={duration}
          value={position}
          step={1000}
          onChange={e => seek(Number(e.target.value))}
        />
        <span>{formatMs(duration)}</span>
      </div>

      <div>
        <button onClick={prevTrack}>Previous</button>
        <button onClick={togglePlay}>{paused ? 'Play' : 'Pause'}</button>
        <button onClick={nextTrack}>Next</button>
      </div>

      {/* Volume */}
      <div>
        <label>Volume: {volume}%</label>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={handleVolumeChange}
        />
      </div>

      <div>
        <input
          placeholder="spotify:track:..."
          value={uriInput}
          onChange={e => setUriInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && playUri(uriInput)}
        />
        <button onClick={() => playUri(uriInput)}>Play URI</button>
      </div>

      <hr />


      <div>
        <button onClick={capturing ? stopCapture : startCapture}>
          {capturing ? 'Stop Audio Capture' : 'Capture Tab Audio'}
        </button>
        <p><small>Click, select this tab, and check "Share tab audio"</small></p>

        {captureErr && <p>Capture error: {captureErr}</p>}

        {capturing && features && (
          <div>
            <p>Status: Live</p>

            <table>
              <tbody>
                <tr><td>RMS Energy</td>        <td>{features.rms}</td></tr>
                <tr><td>Zero Crossing Rate</td><td>{features.zcr}</td></tr>
                <tr><td>Spectral Centroid</td> <td>{features.spectralCentroid}</td></tr>
                <tr><td>Spectral Flatness</td> <td>{features.spectralFlatness}</td></tr>
              </tbody>
            </table>

            {features.mfcc.length > 0 && (
              <div>
                <p>MFCC:</p>
                <p>{features.mfcc.join(' | ')}</p>
              </div>
            )}

            {features.chroma.length > 0 && (
              <div>
                <p>Chroma:</p>
                <p>
                  {features.chroma.map((v, i) => (
                    <span key={i}>{NOTE_NAMES[i]}: {v}{'  '}</span>
                  ))}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
