import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css'

import Login from './Login.jsx';
import Home from './Home.jsx';
import Team from './Team.jsx';
import Callback from './Callback'
;
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/team" element={<Team />} />
        <Route path="/callback" element={<Callback />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
