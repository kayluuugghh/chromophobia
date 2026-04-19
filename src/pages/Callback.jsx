import { useEffect, useState, useRef } from 'react';
import SpotifyPlayer from './SpotifyPlayer';
import { loginWithSpotify, getCodeFromUrl, exchangeCodeForToken, getValidToken, logout } from '../utils/spotifyAuth.js';
import Login from './Login';

export default function Callback() {
  const [token, setToken]     = useState(() => localStorage.getItem('spotify_token'));
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const exchanging            = useRef(false);

  useEffect(() => {
    const isCallback = window.location.pathname === '/callback';
    const code       = getCodeFromUrl();

    if (isCallback && code && !token && !exchanging.current) {
      exchanging.current = true;
      setLoading(true);
      window.history.replaceState({}, '', '/');

      exchangeCodeForToken(code)
        .then(accessToken => {
          // spotifyAuth.js already saves token, refresh token, and expiry to localStorage
          setToken(accessToken);
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
    if (token) {
      getValidToken()
        .then(validToken => {
          if (validToken !== token) setToken(validToken);
        })
        .catch(() => {
          // Refresh failed — force re-login
          handleLogout();
        });
    }
  }, []);

  const handleLogout = () => {
    logout();
    setToken(null);
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
      <Login/>
    </div>
  );

  return (
    <div>
      <SpotifyPlayer token={token} />
      {/* <button onClick={handleLogout}>Logout</button> */}
    </div>
  );
}