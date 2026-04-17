import { useEffect, useState, useRef } from 'react';
import SpotifyPlayer from './SpotifyPlayer';
import { 
  loginWithSpotify, 
  getCodeFromUrl, 
  exchangeCodeForToken,
  getCurrentUser,
  getStoredToken,
  logout as spotifyLogout
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

  // Check if user is already logged in
  useEffect(() => {
    const validateExistingToken = async () => {
      const currentUser = getCurrentUser();
      if (currentUser && !loading) {
        try {
          const storedToken = getStoredToken();
          if (storedToken) {
            setToken(true);
            setTokenValid(true);
          } else {
            // Token not found, clear user session
            await spotifyLogout();
            setToken(false);
            setTokenValid(false);
          }
        } catch (err) {
          console.error('Token check error:', err);
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

  // Refresh the token on mount if it's expired (e.g. user returns after a long time)
  useEffect(() => {
    if (token && tokenValid) {
      const currentUser = getCurrentUser();
      if (currentUser) {
        // Token validation will be handled by SpotifyPlayer component
        // If token is expired, the player will fail to connect and we redirect to login
      }
    }
  }, [tokenValid]);

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