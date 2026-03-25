// ─── Config ───────────────────────────────────────────────────────
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state';

// ─── PKCE Helpers ─────────────────────────────────────────────────
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ─── Login ────────────────────────────────────────────────────────
export async function loginWithSpotify() {
  localStorage.removeItem('spotify_verifier');
  localStorage.removeItem('spotify_token');

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  localStorage.setItem('spotify_verifier', verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

// ─── Callback Helpers ─────────────────────────────────────────────
export function getCodeFromUrl() {
  return new URLSearchParams(window.location.search).get('code');
}

export async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem('spotify_verifier');

  if (!verifier) {
    throw new Error('Missing code_verifier. Please log in again.');
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error_description || 'Token exchange failed');
  }

  localStorage.removeItem('spotify_verifier');
  return data.access_token;
}

// ─── Token Helpers ────────────────────────────────────────────────
export function getStoredToken() {
  return localStorage.getItem('spotify_token');
}

export function logout() {
  localStorage.removeItem('spotify_token');
  localStorage.removeItem('spotify_verifier');
}