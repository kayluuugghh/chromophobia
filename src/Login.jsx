import { useEffect } from 'react'
import {useNavigate} from 'react-router-dom';
import { loginWithSpotify } from './utils/spotifyAuth.js'
// import NavBar from './assets/Navbar.jsx';
import './Login.css'
import Follower from './assets/Follower.jsx'

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
            <h1 className='title'>Chromophobia</h1>
            <Follower></Follower>
            <button onClick={loginWithSpotify} className="login-button">
                Log in with Spotify
            </button>
        </>
    );
}
export default Login;