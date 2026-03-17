import { useEffect } from 'react'
import {useNavigate} from 'react-router-dom';
import { requestAuthorization } from './utils/spotifyAuth.js'
// import NavBar from './assets/Navbar.jsx';
import './Login.css'

// console.log("Vite Test:", import.meta.env.VITE_CLIENT_ID);

// function Login() {
//   return (
//     <>
//       <NavBar />
//       <h1>Chromophobia</h1>
//       <div>
//         <button onClick={requestAuthorization}>Login</button>
//       </div>
//     </>
//   )
// }

// export default Login

function Login() {
    const navigate = useNavigate();

    useEffect(() => {
        
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
            console.log("Authorization code:", code);
            // console.log("Vite Test:", import.meta.env.VITE_CLIENT_ID);
            window.history.replaceState({}, document.title, "/home");
            navigate('/home');
        }
    }, [navigate]);

    return (
        <>
          {/* <NavBar /> */}
          <h1>Chromophobia</h1>
          <button onClick={requestAuthorization} className="login-button">Login with Spotify</button>
        </>
    );
}

export default Login;