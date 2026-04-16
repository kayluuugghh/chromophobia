// ─── Config ───────────────────────────────────────────────────────
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state';

// ─── Session Storage ──────────────────────────────────────────────
export function setCurrentUser(spotifyUserId) {
  localStorage.setItem('current_user_id', spotifyUserId);
}

export function getCurrentUser() {
  return localStorage.getItem('current_user_id');
}

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
  localStorage.removeItem('current_user_id');

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
  
  // Extract user info from token (if JWT)
  const accessToken = data.access_token;
  
  // Fetch user profile from backend to avoid CORS issues
  const userRes = await fetch(`${BACKEND_URL}/user-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      access_token: accessToken
    })
  });
  
  if (!userRes.ok) {
    throw new Error('Failed to fetch user profile');
  }
  
  const userProfile = await userRes.json();
  const spotifyUserId = userProfile.id;
  
  // Store token locally (skip backend storage for now)
  localStorage.setItem('spotify_access_token', accessToken);
  localStorage.setItem('spotify_refresh_token', data.refresh_token);
  localStorage.setItem('spotify_token_expires_at', new Date(Date.now() + data.expires_in * 1000).toISOString());
  
  // Set current user
  setCurrentUser(spotifyUserId);
  
  return {
    accessToken,
    spotifyUserId,
    expiresIn: data.expires_in
  };
}

// ─── Backend Token Storage ────────────────────────────────────────
export async function storeTokenOnBackend(spotifyUserId, accessToken, refreshToken, expiresIn) {
  /*
  Store tokens on the backend so they persist and can be refreshed server-side.
  */
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
  
  const res = await fetch(`${BACKEND_URL}/tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      spotify_user_id: spotifyUserId,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt.toISOString(),
      scope: SCOPES,
    }),
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to store token on backend: ${error.error}`);
  }
  
  return res.json();
}

export async function getTokenFromBackend(spotifyUserId) {
  /*
  Retrieve the current token for a user from the backend.
  */
  const res = await fetch(`${BACKEND_URL}/tokens/${spotifyUserId}`);
  
  if (!res.ok) {
    throw new Error('Token not found on backend');
  }
  
  const data = await res.json();
  return data.token.access_token;
}

export async function validateTokenOnBackend(spotifyUserId) {
  /*
  Check if the token is still valid and not expired.
  */
  const res = await fetch(`${BACKEND_URL}/validate-token/${spotifyUserId}`);
  
  if (!res.ok) {
    const error = await res.json();
    return { valid: false, error: error.error };
  }
  
  return res.json();
}

// ─── Token Helpers ────────────────────────────────────────────────
export function getStoredToken() {
  /*
  Get the stored access token from localStorage.
  */
  return localStorage.getItem('spotify_access_token');
}

export function getStoredToken() {
  /*
  Get the stored access token from localStorage.
  */
  return localStorage.getItem('spotify_access_token');
}

export async function logout() {
  localStorage.removeItem('current_user_id');
  localStorage.removeItem('spotify_verifier');
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_token_expires_at');
}