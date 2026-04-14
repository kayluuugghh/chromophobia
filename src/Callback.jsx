import { useEffect, useState, useRef } from 'react';
import SpotifyPlayer from './SpotifyPlayer';
import { 
  loginWithSpotify, 
  getCodeFromUrl, 
  exchangeCodeForToken,
  getCurrentUser,
  getTokenFromBackend,
  logout as spotifyLogout,
  validateTokenOnBackend
} from './utils/spotifyAuth';

export default function Callback() {
  const [token, setToken]          = useState(() => {
    const user = getCurrentUser();
    return user ? true : false; // Just track if user is logged in
  });
  const [loading, setLoading]      = useState(false);
  const [error, setError]          = useState(null);
  const [tokenValid, setTokenValid] = useState(false);
  const exchanging                 = useRef(false);

  // Validate token on load if user exists
  useEffect(() => {
    const validateExistingToken = async () => {
      const currentUser = getCurrentUser();
      if (currentUser && !loading) {
        try {
          const validation = await validateTokenOnBackend(currentUser);
          if (validation.valid) {
            setToken(true);
            setTokenValid(true);
          } else {
            // Token expired or invalid, clear user session
            await spotifyLogout();
            setToken(false);
            setTokenValid(false);
          }
        } catch (err) {
          console.error('Token validation error:', err);
          setToken(false);
          setTokenValid(false);
        }
      }
    };
    
    validateExistingToken();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const isCallback = window.location.pathname === '/callback';
    const code       = getCodeFromUrl();

    if (isCallback && code && !token && !exchanging.current) {
      exchanging.current = true;
      setLoading(true);
      window.history.replaceState({}, '', '/');

      exchangeCodeForToken(code)
        .then(result => {
          setToken(true);
          setTokenValid(true);
        })
        .catch(err => {
          setError(err.message);
          exchanging.current = false;
        })
        .finally(() => setLoading(false));
    }
  }, []);

  const handleLogout = async () => {
    await spotifyLogout();
    setToken(false);
    setTokenValid(false);
    setError(null);
  };

  if (loading) return <p>Logging in...</p>;

  if (error) return (
    <div>
      <p>Error: {error}</p>
      <button onClick={handleLogout}>Try again</button>
    </div>
  );

  if (!token) return (
    <div>
      <h2>Spotify Player</h2>
      <button onClick={loginWithSpotify}>Login with Spotify</button>
    </div>
  );

  return (
    <div>
      <SpotifyPlayer />
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}