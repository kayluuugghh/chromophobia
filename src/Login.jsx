import { useState } from 'react'
import { requestAuthorization } from './utils/spotifyAuth.js'
import './Login.css'
console.log("Vite Test:", import.meta.env.VITE_CLIENT_ID);
function Login() {
  return (
    <>
      <h1>Chromophobia</h1>
      <div>
        <button onClick={requestAuthorization}>Login</button>
      </div>
    </>
  )
}

export default Login
