/*****************************************
 * 
 * Contribution to code made by: 
 * Drishya Regmi
 * Kayla Vo
 * 
 *****************************************/
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './assets/css/index.css'

import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Team from './pages/Team.jsx';
import Callback from './pages/Callback.jsx';
import SpotifyPlayer from './pages/SpotifyPlayer.jsx';
import Canvas from './pages/Canvas.jsx';

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
