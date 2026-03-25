import { useEffect, useState, useRef } from 'react';
import SpotifyPlayer, { loginWithSpotify, getCodeFromUrl, exchangeCodeForToken } from './SpotifyPlayer';

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
          localStorage.setItem('spotify_token', accessToken);
          setToken(accessToken);
        })
        .catch(err => {
          setError(err.message);
          exchanging.current = false;
        })
        .finally(() => setLoading(false));
    }
  }, []);

  const handleLogout = () => {
    localStorage.clear();
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
      <h2>Spotify Player</h2>
      <button onClick={loginWithSpotify}>Login with Spotify</button>
    </div>
  );

  return (
    <div>
      <SpotifyPlayer token={token} />
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}