import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css'

import Login from './Login.jsx';
import Home from './Home.jsx';
import Team from './Team.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/callback" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/team" element={<Team />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
