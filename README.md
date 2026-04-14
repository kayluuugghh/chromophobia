# Chromophobia 🎨🎵

A multi-user Spotify player application with real-time audio analysis and collaborative team features. Multiple users can log in simultaneously, manage their own Spotify tokens with automatic refresh, and collaborate together.

## Features

- 🎵 **Spotify Integration** - Full player controls via Spotify Web API
- 🎧 **Audio Analysis** - Real-time audio capture and feature extraction using Meyda.js
  - RMS Energy
  - Zero Crossing Rate
  - Spectral Centroid & Flatness
  - MFCC (Mel Frequency Cepstral Coefficients)
  - Chroma features
- 👥 **Multi-User Support** - Multiple users can log in and use the app simultaneously
- 🔄 **Automatic Token Refresh** - Spotify tokens automatically refreshed every 60 minutes
- 👫 **Team Features** - Follow other users and see their activity
- 🎨 **Responsive UI** - Clean, modern interface built with React

## Tech Stack

**Frontend:**
- React 18+
- Vite (build tool)
- CSS3 for styling
- Spotify Web API
- Meyda.js for audio analysis

**Backend:**
- Flask (Python web framework)
- MongoDB (token & user data storage)
- PyMongo (MongoDB driver)
- APScheduler-like background tasks for token refresh

## Project Structure

```
chromophobia/
├── src/                          # Frontend React code
│   ├── Callback.jsx             # OAuth callback handler
│   ├── Home.jsx                 # Home page
│   ├── Login.jsx                # Login page
│   ├── SpotifyPlayer.jsx        # Main Spotify player component
│   ├── Team.jsx                 # Team/follow features
│   ├── main.jsx                 # React entry point
│   ├── assets/                  # Components
│   │   ├── Navbar.jsx
│   │   ├── Follower.jsx
│   │   └── *.css
│   ├── utils/
│   │   └── spotifyAuth.js       # Spotify authentication utilities
│   └── *.css                    # Component stylesheets
├── backend/                      # Flask API
│   ├── app.py                   # Flask app & routes
│   ├── database.py              # MongoDB connection & token management
│   ├── token_refresh.py         # Spotify token refresh logic
│   ├── scheduler.py             # Background token refresh daemon
│   ├── test_db.py               # Database tests
│   └── requirments.txt          # Python dependencies
├── public/                       # Static assets
├── vite.config.js               # Vite configuration
├── eslint.config.js             # ESLint rules
├── package.json                 # Frontend dependencies
├── .env.example                 # Environment variables template
└── README.md                    # This file
```

## Prerequisites

- Node.js (v16+)
- Python (v3.8+)
- MongoDB Atlas account (or local MongoDB)
- Spotify Developer account

## Setup

### 1. Clone & Install

```bash
# Clone the repository
git clone <repo-url>
cd chromophobia

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
pip install -r requirments.txt
cd ..
```

### 2. Environment Setup

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with:

```env
#dont inclide this in read me file lmao
```

### 3. Run the Application

**Terminal 1 - Frontend (Vite dev server):**
```bash
npm run dev
```
Frontend runs on `http://localhost:5173`

**Terminal 2 - Backend (Flask API):**
```bash
cd backend
python app.py
```
Backend runs on `http://localhost:5000`

The token refresh scheduler will start automatically when the backend initializes.

## Usage

1. Open `http://localhost:5173` in your browser
2. Click "Login with Spotify"
3. Authorize the app with your Spotify account
4. Use the player controls to:
   - Play/pause/skip tracks
   - View current track info
   - Adjust volume
   - Enter Spotify URI to play specific tracks
   - Capture and analyze audio in real-time

### Multi-User Scenario

1. **User A** logs in from Device A → token stored for user A
2. **User B** logs in from Device B (different browser/session) → token stored for user B
3. Both can use the player simultaneously
4. Scheduler refreshes each user's token independently
5. Logout deletes that user's token

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tokens` | Store a user's Spotify token |
| GET | `/tokens/<spotify_user_id>` | Retrieve user's token |
| GET | `/validate-token/<spotify_user_id>` | Check if token is valid |
| DELETE | `/tokens/<spotify_user_id>` | Delete user's token (logout) |
| GET | `/tokens` | List all tokens (for testing) |
| GET | `/health` | Health check |

See [TOKEN_REFRESH_IMPLEMENTATION.md](TOKEN_REFRESH_IMPLEMENTATION.md) for detailed token management documentation.

## Development

### Available Scripts

```bash
# Frontend
npm run dev              # Start dev server with HMR
npm run build           # Build for production
npm run preview         # Preview production build
npm run lint            # Run ESLint

# Backend
python app.py           # Run Flask dev server
python backend/test_db.py # Test database connection
```

### Database

Tokens are stored in MongoDB with the following structure:

```json
{
  "_id": "ObjectId",
  "spotify_user_id": "user123",
  "access_token": "BQA...",
  "refresh_token": "AQD...",
  "expires_at": "2026-04-14T15:30:00Z",
  "scope": "streaming user-read-email user-read-private...",
  "created_at": "2026-04-14T14:30:00Z",
  "updated_at": "2026-04-14T14:31:00Z"
}
```

## Authentication Flow

1. **PKCE OAuth** - Secure authorization code flow with Spotify
2. **Token Storage** - Tokens stored in MongoDB (backend)
3. **Token Refresh** - Automatic background refresh every 60 minutes
4. **Session Management** - Current user tracked via localStorage

## Features in Detail

### Spotify Player
- Real-time playback control
- Track info display with album art
- Seek/progress bar
- Volume control
- Play by URI

### Audio Analysis
- Capture tab audio (requires browser permission)
- Extract audio features in real-time:
  - Energy (RMS)
  - Zero-crossing rate
  - Spectral analysis
  - MFCC coefficients
  - Chroma features

### Team Features
- Follow other users
- View follower list
- See who's currently using the app

## Troubleshooting

**"Token not found" error**
- User not logged in
- Token was deleted
- Check MongoDB connection

**"Failed to refresh token"**
- `SPOTIFY_CLIENT_SECRET` not in backend `.env`
- Spotify API credentials invalid
- Check backend logs

**Audio capture not working**
- Browser may not support Web Audio API
- Make sure to check "Share tab audio" in permission dialog
- Try different browser (Chrome/Edge recommended)

**Multiple users seeing same token**
- Each user must log in with their own Spotify account
- Tokens are unique per `spotify_user_id`
- Check browser localStorage for `current_user_id`

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly (especially multi-user scenarios)
4. Submit a pull request

## License

MIT

## Support

For issues or questions:
- Check [TOKEN_REFRESH_IMPLEMENTATION.md](TOKEN_REFRESH_IMPLEMENTATION.md) for token management details
- Review backend logs: `python app.py`
- Check browser console for frontend errors
