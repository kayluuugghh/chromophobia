import { useEffect } from 'react'
import {useNavigate} from 'react-router-dom';
import { loginWithSpotify } from './utils/spotifyAuth.js'
import NavBar from './assets/Navbar.jsx';
import './Login.css'

function Login() {
    const navigate = useNavigate();

    useEffect(() => {
        // if already logged in, skip to home
        if (localStorage.getItem('access_token')) {
            navigate('/home');
        }
    }, [navigate]);

    return (
        <>
            <h1>Chromophobia</h1>
            <button onClick={loginWithSpotify} className="login-button">
                Login with Spotify
            </button>
        </>
    );
}
export default Login;