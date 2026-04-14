import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css'

import Login from './Login.jsx';
import Home from './Home.jsx';
import Team from './Team.jsx';
import Callback from './Callback';
import SpotifyPlayer from './SpotifyPlayer.jsx';
import Canvas from './Canvas.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/home" element={<SpotifyPlayer />} />
        <Route path="/team" element={<Team />} />
        <Route path="/callback" element={<Callback />} />
        <Route path='/canvas' element={<Canvas/>}/>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
