# Chromophobia

Chromophobia is a web-based, AI-driven music visualizer that bridges the gap between late-90s/early-2000s digital aesthetics and modern machine learning. By leveraging the Spotify Web Playback SDK and WebGL, Chromophobia analyzes musical structures in real-time to generate dynamic, reactive environments.

## Core Features
AI-Powered Audio Analysis: Utilizes machine learning for pattern recognition to identify musical shifts and structural changes.

Real-time Synchronization: Seamlessly integrates with Spotify via the Web Playback SDK for low-latency visual response.

Retro-Futuristic Graphics: High-performance 3D visuals built with WebGL that pay homage to classic media player visualizers.

Dynamic Visual Generation: Elements evolve based on the mood, tempo, and frequency spectrum of the track being played

## Tech Stack
Frontend: React, Vite

Graphics: Three.js / WebGL / CSS3

Audio Analysis: Meyda (Feature Extraction)

APIs: Spotify Web Playback SDK

Backend: Node.js

Intelligence: Python (AI/ML Logic)

Deployment: Vercel

## Repository Structure
/src: React components and visualizer logic.

/backend: Node.js server handling authentication and data flow.

/AIModel: Python-based logic for advanced audio pattern recognition.

/public: Static assets and environment configurations.

## Getting Started
### Prerequisites
Node.js (v18+)

Spotify Premium account (required for SDK playback)

Spotify Developer Credentials (Client ID & Client Secret)

### Installation
Clone the repository:

git clone https://github.com/kayluuugghh/chromophobia.git
cd chromophobia


Install dependencies:

npm install


Configure Environment Variables (Create a .env file in the root directory):

VITE_SPOTIFY_CLIENT_ID=your_id_here
VITE_SPOTIFY_CLIENT_SECRET=your_secret_id_here
VITE_REDIRECT_URI=http://localhost:5173/callback


Run Development Server:

npm run dev


## Contributors
Developed by a 7-member team as a Senior Project at the University of Houston - Clear Lake.
