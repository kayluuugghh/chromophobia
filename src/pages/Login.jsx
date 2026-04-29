<<<<<<< HEAD
// Contributions to code made by: David Gebhart

=======
/*****************************************
 * 
 * Contribution to code made by: 
 * David Gebhart
 * Kayla Vo
 * 
 *****************************************/
>>>>>>> fe6d27a (doc: add contribution)
import { useEffect, useRef } from 'react'
import {useNavigate} from 'react-router-dom';
import { loginWithSpotify } from '../utils/spotifyAuth.js'
import '../assets/css/Login.css'
import Follower from '../features/Follower.jsx'

function Login() {
    const navigate = useNavigate();

    //For mouse-shake audio
    const lastPos = useRef({ x: 0, y: 0, time: 0 });
    const shakeScore = useRef(0);
    const cooldown = useRef(false);
    const audioRef = useRef(null);

    useEffect(() => {
        // if already logged in, skip to home
        if (localStorage.getItem('access_token')) {
            navigate('/home');
        }
    }, [navigate]);

    //Mouse-shake audio effect
    useEffect(() => {
        audioRef.current = new Audio('/cat_meow.mp3');

        const handleMouseMove = (e) => {
            const now = Date.now();
            const dx = e.clientX - lastPos.current.x;
            const dy = e.clientY - lastPos.current.y;
            const dt = now - lastPos.current.time;

            if (dt > 0) {
                const distance = Math.sqrt(dx * dx + dy * dy);
                const speed = distance / dt;

                if (speed > 3.0) {
                    shakeScore.current += 1;
                } else {
                    shakeScore.current = Math.max(0, shakeScore.current - 0.5);
                }

                if (shakeScore.current >= 15 && !cooldown.current) {
                    cooldown.current = true;
                    shakeScore.current = 0;

                    if (audioRef.current) {
                        audioRef.current.currentTime = 0;
                        audioRef.current.play().catch(() => {});
                    }

                    setTimeout(() => {
                        cooldown.current = false;
                    }, 1500);
                }
            }

            lastPos.current = {
                x: e.clientX,
                y: e.clientY,
                time: now,
            };
        };

        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    return (
        <>
            <h1 className="title">Chromophobia</h1>
            <Follower></Follower>
            <button onClick={loginWithSpotify} className="login-button">
                Login with Spotify
            </button>
        </>
    );
}
export default Login;
