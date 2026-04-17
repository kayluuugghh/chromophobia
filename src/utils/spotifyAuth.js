// ─── Config ───────────────────────────────────────────────────────
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state';

// ─── Retry & Timeout Helpers ──────────────────────────────────────
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      console.log(`[Fetch Attempt ${attempt}/${retries}] ${options.method || 'GET'} ${url}`);
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(undefined);
      
      if (error.name === 'AbortError') {
        console.warn(`[Fetch Timeout] ${url} (${timeout}ms)`);
      } else {
        console.warn(`[Fetch Error] ${url}: ${error.message}`);
      }
      
      if (attempt < retries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`[Retry] Waiting ${delay}ms before attempt ${attempt + 1}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`[Fetch Failed] ${url} after ${retries} attempts: ${error.message}`);
        throw error;
      }
    }
  }
}

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

  // Step 1: Exchange code for token with Spotify
  console.log('[Auth] Exchanging authorization code for access token...');
  const tokenRes = await fetchWithRetry('https://accounts.spotify.com/api/token', {
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

  const data = await tokenRes.json();

  if (!tokenRes.ok || data.error) {
    const errorMsg = data.error_description || 'Token exchange failed';
    console.error('[Auth] Spotify token exchange failed:', errorMsg);
    throw new Error(errorMsg);
  }

  console.log('[Auth] Successfully received access token from Spotify');
  localStorage.removeItem('spotify_verifier');
  
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  const expiresIn = data.expires_in;
  
  // Step 2: Fetch user profile - try backend first, fallback to Spotify API
  console.log('[Auth] Fetching user profile...');
  let userProfile;
  
  try {
    // Try backend first (better for multi-user setups)
    console.log('[Auth] Attempting to fetch user profile from backend...');
    const userRes = await fetchWithRetry(`${BACKEND_URL}/user-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: accessToken }),
      timeout: 8000,
    });
    
    if (!userRes.ok) {
      const errorData = await userRes.json().catch(() => ({}));
      throw new Error(`Backend error: ${userRes.status} - ${errorData.error || 'Unknown error'}`);
    }
    
    userProfile = await userRes.json();
    console.log('[Auth] Successfully fetched user profile from backend');
  } catch (backendError) {
    console.warn('[Auth] Backend user profile fetch failed, falling back to Spotify API:', backendError.message);
    
    // Fallback: fetch directly from Spotify API
    try {
      console.log('[Auth] Attempting to fetch user profile from Spotify API directly...');
      const spotifyRes = await fetchWithRetry('https://api.spotify.com/v1/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      });
      
      if (!spotifyRes.ok) {
        const errorData = await spotifyRes.json().catch(() => ({}));
        throw new Error(`Spotify API error: ${spotifyRes.status} - ${errorData.error?.message || 'Unknown error'}`);
      }
      
      userProfile = await spotifyRes.json();
      console.log('[Auth] Successfully fetched user profile from Spotify API');
    } catch (spotifyError) {
      console.error('[Auth] Both backend and Spotify API failed:', spotifyError.message);
      throw new Error(`Cannot fetch user profile: Backend unavailable and Spotify API failed. Please try again.`);
    }
  }
  
  const spotifyUserId = userProfile.id;
  if (!spotifyUserId) {
    throw new Error('User profile missing Spotify ID');
  }
  
  // Step 3: Store token locally
  console.log('[Auth] Storing token in localStorage for user:', spotifyUserId);
  localStorage.setItem('spotify_access_token', accessToken);
  localStorage.setItem('spotify_refresh_token', refreshToken);
  localStorage.setItem('spotify_token_expires_at', new Date(Date.now() + expiresIn * 1000).toISOString());
  
  // Step 4: Set current user
  setCurrentUser(spotifyUserId);
  console.log('[Auth] Login successful for user:', spotifyUserId);
  
  return {
    accessToken,
    spotifyUserId,
    expiresIn,
  };
}

// ─── Backend Token Storage ────────────────────────────────────────
export async function storeTokenOnBackend(spotifyUserId, accessToken, refreshToken, expiresIn) {
  /*
  Store tokens on the backend so they persist and can be refreshed server-side.
  */
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
  
  console.log('[Backend] Storing token for user:', spotifyUserId);
  
  try {
    const res = await fetchWithRetry(`${BACKEND_URL}/tokens`, {
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
      const error = await res.json().catch(() => ({}));
      throw new Error(`Failed to store token on backend: ${error.error || 'Unknown error'}`);
    }
    
    console.log('[Backend] Token stored successfully for user:', spotifyUserId);
    return res.json();
  } catch (error) {
    console.error('[Backend] Failed to store token:', error.message);
    throw error;
  }
}

export async function getTokenFromBackend(spotifyUserId) {
  /*
  Retrieve the current token for a user from the backend.
  */
  console.log('[Backend] Retrieving token for user:', spotifyUserId);
  
  try {
    const res = await fetchWithRetry(`${BACKEND_URL}/tokens/${spotifyUserId}`);
    
    if (!res.ok) {
      throw new Error(`Token not found on backend (${res.status})`);
    }
    
    const data = await res.json();
    console.log('[Backend] Token retrieved successfully for user:', spotifyUserId);
    return data.token.access_token;
  } catch (error) {
    console.error('[Backend] Failed to retrieve token:', error.message);
    throw error;
  }
}

export async function validateTokenOnBackend(spotifyUserId) {
  /*
  Check if the token is still valid and not expired.
  */
  console.log('[Backend] Validating token for user:', spotifyUserId);
  
  try {
    const res = await fetchWithRetry(`${BACKEND_URL}/validate-token/${spotifyUserId}`, {
      timeout: 5000,
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.warn('[Backend] Token validation failed:', error.error || 'Unknown error');
      return { valid: false, error: error.error || 'Token validation failed' };
    }
    
    const result = await res.json();
    console.log('[Backend] Token is valid for user:', spotifyUserId);
    return result;
  } catch (error) {
    console.warn('[Backend] Token validation error:', error.message);
    return { valid: false, error: error.message };
  }
}

// ─── Token Helpers ────────────────────────────────────────────────
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