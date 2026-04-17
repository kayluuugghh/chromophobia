import { useState, useEffect, useRef, useCallback } from 'react';
// import NavBar from './assets/Navbar';
import HelpBtn from './assets/HelpBtn';
import { getCurrentUser, getStoredToken } from './utils/spotifyAuth';

// ─── Helpers ──────────────────────────────────────────────────────
function formatMs(ms) {
  if (!ms || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Central Spotify API fetch with error logging
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
// ─── Hook: usePlayer ─────────────────────────────────────────────
function usePlayer(token) {
  const sdkReady   = useSDK();
  const playerRef  = useRef(null);
  const tokenRef   = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);
  return { sdkReady, playerRef, tokenRef };
}

// ─── Hook: useSpotifyPlayer ───────────────────────────────────────
function useSpotifyPlayer() {
  const [token,    setToken]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [player,   setPlayer]   = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [psState,  setPsState]  = useState(null);
  const [error,    setError]    = useState(null);
  const [ready,    setReady]    = useState(false);
  const [sdkReady, setSdkReady] = useState(!!window.Spotify);
  
  const playerRef  = useRef(null);
  const tokenRef   = useRef(token);

  // Fetch token from localStorage
  useEffect(() => {
    const loadToken = async () => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) {
          setError('No user logged in');
          setLoading(false);
          return;
        }

        // Get token from localStorage
        const accessToken = getStoredToken();
        if (!accessToken) {
          setError('Token not found. Please log in again.');
          setLoading(false);
          return;
        }

        setToken(accessToken);
      } catch (err) {
        setError(`Failed to load token: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadToken();
  }, []);

  // Load Spotify SDK
  useEffect(() => {
    if (window.Spotify) { setSdkReady(true); return; }
    window.onSpotifyWebPlaybackSDKReady = () => setSdkReady(true);
    const script = document.createElement('script');
    script.src   = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  // Update token ref
  useEffect(() => { tokenRef.current = token; }, [token]);

  // Create and connect player
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
    setPlayer(p);
    return () => { p.disconnect(); playerRef.current = null; };
  }, [sdkReady, token]);

  // Transfer playback to our device
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
  return { player, deviceId, psState, sdkReady, error, loading, token, ready };
}


// ─── Hook: usePlaybackControls ────────────────────────────────────
function usePlaybackControls(player, token, deviceId) {
  const togglePlay = useCallback(() => player?.togglePlay(), [player]);
  const nextTrack  = useCallback(() => player?.nextTrack(), [player]);
  const prevTrack  = useCallback(() => player?.previousTrack(), [player]);
  const seek       = useCallback((ms) => player?.seek(ms), [player]);
  const setVolume  = useCallback((v) => player?.setVolume(v), [player]);

  const playTrack = useCallback(async (uri) => {
    if (!token || !deviceId) return false;

    try {
      await spotifyFetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        token,
        { method: 'PUT', body: JSON.stringify({ uris: [uri] }) }
      );
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [token, deviceId]);

  return { togglePlay, nextTrack, prevTrack, seek, setVolume, playTrack };
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

// ─── Hook: useSearch ─────────────────────────────────────────────
function useSearch(token) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await spotifyFetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
          token
        );
        setResults(data.tracks?.items ?? []);
      } catch { setResults([]); }
      finally  { setLoading(false); }
    }, 400);
    return () => clearTimeout(timer.current);
  }, [query, token]);

  return { query, setQuery, results, loading };
}

// ─── TrackRow ─────────────────────────────────────────────────────
function TrackRow({ track, onPlay }) {
  const art = track.album?.images?.[2]?.url ?? track.album?.images?.[0]?.url;
  return (
    <li className="track-row" onClick={onPlay}>
      {art
        ? <img src={art} alt="" className="track-thumb" />
        : <div className="track-thumb placeholder" />
      }
      <div className="track-info">
        <span className="track-name">{track.name}</span>
        <span className="track-artist">{track.artists?.map(a => a.name).join(', ')}</span>
      </div>
      <span className="track-duration">{formatMs(track.duration_ms)}</span>
    </li>
  );
}

// ─── SearchPanel ──────────────────────────────────────────────────
function SearchPanel({ token, onPlay }) {
  const { query, setQuery, results, loading } = useSearch(token);
  return (
    <div className="panel">
      <h3>Search</h3>
      <input
        className="text-input" type="text" placeholder="Search for a song…"
        value={query} onChange={e => setQuery(e.target.value)}
      />
      {loading && <p className="hint">Searching…</p>}
      {results.length > 0 && (
        <ul className="track-list">
          {results.map(t => <TrackRow key={t.id} track={t} onPlay={() => onPlay(t.uri)} />)}
        </ul>
      )}
      {!loading && query.trim() && results.length === 0 && <p className="hint">No results.</p>}
    </div>
  );
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// ─── Component ────────────────────────────────────────────────────
export default function SpotifyPlayer() {
  const { player, deviceId, psState, sdkReady, error, loading, token, ready } = useSpotifyPlayer();
  const { togglePlay, nextTrack, prevTrack, seek, setVolume, playTrack } =
  usePlaybackControls(player, token, deviceId);

  const interpolated = useInterpolatedPosition(psState);

  const [volume,      setVolumeState] = useState(50);
  const [activePanel, setActivePanel] = useState(null);
  const [scrubbing,   setScrubbing]   = useState(false);
  const [scrubMs,     setScrubMs]     = useState(0);

  const track    = psState?.track_window?.current_track;
  const paused   = psState?.paused ?? true;
  const duration = psState?.duration ?? 1;
  const position = scrubbing ? scrubMs : Math.min(interpolated, duration);

  const handleVolume = e => {
    const v = Number(e.target.value);
    setVolumeState(v);
    setVolume(v / 100);
  };



  const togglePanel = name => setActivePanel(p => p === name ? null : name);

  if (error)     return <p className="status-msg">Error: {error}</p>;
  if (loading)   return <p className="status-msg">Loading your tokens...</p>;
  if (!sdkReady) return <p className="status-msg">Loading Spotify SDK…</p>;
  if (!deviceId) return <p className="status-msg">Connecting player…</p>;
  if (!ready)    return <p className="status-msg">Transferring playback…</p>;

  return (
    <div>
      <HelpBtn />

      {/* ── Now playing ── */}
      <div className="now-playing">
        {track?.album?.images?.[0]?.url
          ? <img src={track.album.images[0].url} alt="album art" width={500} height={500} />
          : <div className="album-placeholder" />
        }
        <p><strong>{track?.name ?? 'Nothing playing'}</strong></p>
        <p>{track?.artists?.map(a => a.name).join(', ') ?? '—'}</p>
        <p>{track?.album?.name ?? ''}</p>
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
        />
        <span>{formatMs(duration)}</span>
      </div>

      {/* ── Transport ── */}
      <div className="transport">
        <button onClick={prevTrack}>Previous</button>
        <button onClick={togglePlay}>{paused ? 'Play' : 'Pause'}</button>
        <button onClick={nextTrack}>Next</button>
      </div>

      {/* ── Volume ── */}
      <div className="volume-row">
        <label>Volume: {volume}%</label>
        <input type="range" min={0} max={100} value={volume} onChange={handleVolume} />
      </div>

      <hr />

      {/* ── Panel toggles ── */}
      <div className="panel-toggles">
        <button onClick={() => togglePanel('search')}>
          {activePanel === 'search' ? 'Close Search' : '🔍 Search'}
        </button>
      </div>

      {activePanel === 'search' && (
        <SearchPanel token={token} onPlay={uri => { playTrack(uri); }} />
      )}

    </div>
  );
}
