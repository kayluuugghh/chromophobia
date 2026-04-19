import { useState, useEffect, useRef, useCallback } from 'react';
import HelpBtn from '../features/HelpBtn';
import '../assets/css/SpotifyPlayer.css';
import { FaStepBackward, FaPlayCircle, FaPauseCircle, FaStepForward, FaVolumeDown} from 'react-icons/fa';

// ─── Config ───────────────────────────────────────────────────────
const CLIENT_ID    = import.meta.env.VITE_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

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
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── Auth Exports ─────────────────────────────────────────────────
export async function loginWithSpotify() {
  localStorage.removeItem('spotify_verifier');
  localStorage.removeItem('spotify_token');
  const verifier  = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem('spotify_verifier', verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'code',
    redirect_uri: REDIRECT_URI, scope: SCOPES,
    code_challenge_method: 'S256', code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem('spotify_verifier');
  if (!verifier) throw new Error('No code_verifier. Please log in again.');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, grant_type: 'authorization_code',
      code, redirect_uri: REDIRECT_URI, code_verifier: verifier,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${data.error}: ${data.error_description}`);
  localStorage.removeItem('spotify_verifier');
  localStorage.setItem('spotify_token', data.access_token);
  if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
  if (data.expires_in)    localStorage.setItem('spotify_token_expiry', Date.now() + data.expires_in * 1000);
  return data.access_token;
}

export function getCodeFromUrl() {
  return new URLSearchParams(window.location.search).get('code');
}

export async function refreshAccessToken() {
  const rt = localStorage.getItem('spotify_refresh_token');
  if (!rt) throw new Error('No refresh token. Please log in again.');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: rt }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${data.error}: ${data.error_description}`);
  localStorage.setItem('spotify_token', data.access_token);
  localStorage.setItem('spotify_token_expiry', Date.now() + data.expires_in * 1000);
  if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
  return data.access_token;
}

export async function getValidToken() {
  const expiry = Number(localStorage.getItem('spotify_token_expiry') ?? 0);
  return Date.now() > expiry - 60_000
    ? await refreshAccessToken()
    : localStorage.getItem('spotify_token');
}

export function logout() {
  ['spotify_token','spotify_refresh_token','spotify_token_expiry','spotify_verifier']
    .forEach(k => localStorage.removeItem(k));
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatMs(ms) {
  if (!ms || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function spotifyFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[Spotify ${res.status}]`, url, data);
    throw Object.assign(new Error(data?.error?.message ?? `HTTP ${res.status}`), { status: res.status });
  }
  return data;
}

// ─── Hook: useSDK ─────────────────────────────────────────────────
function useSDK() {
  const [ready, setReady] = useState(!!window.Spotify);
  useEffect(() => {
    if (window.Spotify) { setReady(true); return; }
    window.onSpotifyWebPlaybackSDKReady = () => setReady(true);
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    document.body.appendChild(s);
  }, []);
  return ready;
}

// ─── Hook: usePlayer ──────────────────────────────────────────────
function usePlayer(token) {
  const sdkReady   = useSDK();
  const playerRef  = useRef(null);
  const tokenRef   = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const [deviceId, setDeviceId] = useState(null);
  const [psState,  setPsState]  = useState(null);
  const [error,    setError]    = useState(null);
  const [ready,    setReady]    = useState(false);

  useEffect(() => {
    if (!sdkReady || !token) return;
    const p = new window.Spotify.Player({
      name: 'Chromophobia Player',
      getOAuthToken: cb => cb(tokenRef.current),
      volume: 0.5,
    });
    p.addListener('ready',                ({ device_id }) => setDeviceId(device_id));
    p.addListener('not_ready',            ()              => { setDeviceId(null); setReady(false); });
    p.addListener('player_state_changed', s               => setPsState(s ? { ...s } : null));
    p.addListener('initialization_error', ({ message })   => setError(message));
    p.addListener('authentication_error', ({ message })   => setError(message));
    p.addListener('account_error',        ({ message })   => setError(message));
    p.connect();
    playerRef.current = p;
    return () => { p.disconnect(); playerRef.current = null; };
  }, [sdkReady, token]);

  useEffect(() => {
    if (!deviceId || !token) return;
    setReady(false);
    spotifyFetch('https://api.spotify.com/v1/me/player', token, {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
    })
      .catch(console.error)
      .finally(() => setTimeout(() => setReady(true), 1500));
  }, [deviceId, token]);

  const togglePlay = useCallback(() => playerRef.current?.togglePlay(),    []);
  const nextTrack  = useCallback(() => playerRef.current?.nextTrack(),     []);
  const prevTrack  = useCallback(() => playerRef.current?.previousTrack(), []);
  const seek       = useCallback(ms => playerRef.current?.seek(ms),        []);
  const setVolume  = useCallback(v  => playerRef.current?.setVolume(v),    []);

  return { sdkReady, deviceId, psState, error, ready, togglePlay, nextTrack, prevTrack, seek, setVolume };
}

// ─── Hook: useInterpolatedPosition ───────────────────────────────
function useInterpolatedPosition(psState) {
  const snap      = useRef({ posMs: 0, at: Date.now(), paused: true });
  const [ms, setMs] = useState(0);

  useEffect(() => {
    if (!psState) return;
    snap.current = { posMs: psState.position ?? 0, at: Date.now(), paused: psState.paused ?? true };
    setMs(psState.position ?? 0);
  }, [psState]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!snap.current.paused)
        setMs(snap.current.posMs + (Date.now() - snap.current.at));
    }, 500);
    return () => clearInterval(id);
  }, []);

  return ms;
}

// ─── Main Component ───────────────────────────────────────────────
export default function SpotifyPlayer({ token: propToken }) {
  const token = propToken ?? localStorage.getItem('spotify_token');

  const { sdkReady, deviceId, psState, error, ready, togglePlay, nextTrack, prevTrack, seek, setVolume } =
    usePlayer(token);

  const interpolated = useInterpolatedPosition(psState);

  const [volume,    setVolumeState] = useState(50);
  const [scrubbing, setScrubbing]   = useState(false);
  const [scrubMs,   setScrubMs]     = useState(0);

  const track    = psState?.track_window?.current_track;
  const paused   = psState?.paused ?? true;
  const duration = psState?.duration ?? 1;
  const position = scrubbing ? scrubMs : Math.min(interpolated, duration);

  const handleVolume = e => {
    const v = Number(e.target.value);
    setVolumeState(v);
    setVolume(v / 100);
  };

  if (error)     return <p className="status-msg">Error: {error}</p>;
  if (!sdkReady) return <p className="status-msg">Loading Spotify SDK…</p>;
  if (!deviceId) return <p className="status-msg">Connecting player…</p>;
  if (!ready)    return <p className="status-msg">Transferring playback…</p>;

  return (
    <div>
      <HelpBtn />

      {/* ── Now playing ── */}
      <div className="now-playing">
        {track?.album?.images?.[0]?.url
          ? <img src={track.album.images[0].url} alt="album art" width={400} height={400} />
          : <div className="album-placeholder" />
        }
        <p className="track-name"><strong>{track?.name ?? 'Nothing playing'}</strong></p>
        <p className="album-name">{track?.album?.name ?? ''}</p>
        <p className="artist-name">{track?.artists?.map(a => a.name).join(', ') ?? '—'}</p>
      </div>

      {/* ── Transport ── */}
      <div className="transport">
        <button onClick={prevTrack}><FaStepBackward size="2em" /></button>
        <button onClick={togglePlay}>{paused ? <FaPlayCircle size="2em" /> : <FaPauseCircle size="2em" />}</button>
        <button onClick={nextTrack}><FaStepForward size="2em" /></button>
      </div>

      {/* ── Seek bar ── */}
      <div className="seek-row">
        <span>{formatMs(position)}</span>
        <input
          type="range" min={0} max={duration} value={position} step={1000}
          onMouseDown={e => { setScrubbing(true);  setScrubMs(Number(e.target.value)); }}
          onTouchStart={e => { setScrubbing(true); setScrubMs(Number(e.target.value)); }}
          onChange={e => setScrubMs(Number(e.target.value))}
          onMouseUp={e => { setScrubbing(false); seek(Number(e.target.value)); }}
          onTouchEnd={e => { setScrubbing(false); seek(Number(e.target.value)); }}
          className="seek-slider"
        />
        <span>{formatMs(duration)}</span>
      </div>

      {/* ── Volume ── */}
      <div className="volume-row">
        <i><FaVolumeDown size="1.5em" /></i>
        <input type="range" min={0} max={100} value={volume} onChange={handleVolume} className="volume-slider" />
      </div>

      {/* ── Canvas ── */}
      <div className="canvas-row">
        <button onClick={() => window.open('/canvas', '_blank')}>Launch Visualizer</button>
      </div>
    </div>
  );
}