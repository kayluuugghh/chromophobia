# Spotify Token Management & Auto-Refresh Implementation

## Overview
This implementation enables multiple users to log into the website simultaneously, with each user's Spotify tokens automatically refreshed every 60 minutes on the backend.

## Architecture

### Backend Components

#### 1. **token_refresh.py**
- Handles Spotify API token refresh requests
- Uses the `refresh_token` to obtain a new `access_token`
- Returns new token with updated expiry time

**Key Function:**
```python
refresh_spotify_token(refresh_token: str) -> dict
```

#### 2. **scheduler.py**
- Background daemon thread that runs alongside your Flask app
- Refreshes tokens every 60 minutes
- Automatically triggers refresh for tokens expiring within 5 minutes
- Per-user, concurrent safe token refresh

**Key Components:**
- `TokenRefreshScheduler` class - manages background refresh tasks
- `start_scheduler()` - starts the daemon
- `stop_scheduler()` - gracefully stops the daemon

#### 3. **app.py (Updated)**
- Starts scheduler on app initialization
- New `/validate-token/<spotify_user_id>` endpoint to check token validity
- Existing endpoints remain for token CRUD operations

### Frontend Components

#### 1. **spotifyAuth.js (Updated)**
New functions for backend token management:
- `setCurrentUser(spotifyUserId)` - store logged-in user ID
- `getCurrentUser()` - retrieve currently logged-in user
- `storeTokenOnBackend(spotifyUserId, accessToken, refreshToken, expiresIn)` - save tokens to backend
- `getTokenFromBackend(spotifyUserId)` - retrieve token from backend
- `validateTokenOnBackend(spotifyUserId)` - check if token is valid
- `logout()` - clean logout including backend token deletion

#### 2. **SpotifyPlayer.jsx (Updated)**
- Updated `useSpotifyPlayer()` hook to fetch tokens from backend
- Validates token on component mount
- Handles token expiry gracefully

#### 3. **Callback.jsx (Updated)**
- Stores tokens on backend after OAuth callback
- Validates existing tokens on page load
- Sets current user context

## Token Lifecycle

### Initial Login
1. User clicks "Login with Spotify"
2. PKCE flow with Spotify
3. Exchange auth code for tokens (frontend)
4. Fetch user profile to get Spotify user ID
5. **Store tokens on backend** (new!)
6. Set current user in localStorage

### Token Usage
1. SpotifyPlayer component loads
2. Gets current user from localStorage
3. Validates token on backend
4. Retrieves access token from backend
5. Uses token for Spotify API calls

### Automatic Refresh (Background)
1. Scheduler runs every 60 seconds
2. Fetches all tokens from database
3. Checks expiry time for each token
4. Refreshes tokens expiring within 5 minutes
5. Updates database with new tokens
6. Next API call uses refreshed token automatically

### Logout
1. Delete token from backend
2. Clear current user from localStorage
3. Frontend returns to login screen

## Setup Instructions

### 1. Environment Variables

Add to your `.env` file:
```env
# Existing Spotify variables
VITE_CLIENT_ID=your_spotify_client_id
VITE_REDIRECT_URI=http://localhost:5173/callback
VITE_BACKEND_URL=http://localhost:5000

# New: Spotify Client Secret (MUST be kept secret, backend only!)
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# MongoDB
MONGODB_URI=your_mongodb_connection_string
```

### 2. Install Dependencies

Backend:
```bash
cd backend
pip install -r requirments.txt  # Note: includes 'requests' library now
```

### 3. Start Backend

```bash
cd backend
python app.py
```

The scheduler will automatically start and begin monitoring tokens!

## Database Schema

The `spotify_tokens` collection stores documents like:
```json
{
  "_id": "ObjectId",
  "spotify_user_id": "user123",
  "access_token": "BQA...",
  "refresh_token": "AQD...",
  "expires_at": "2026-04-14T15:30:00Z",
  "scope": "streaming user-read-email...",
  "created_at": "2026-04-14T14:30:00Z",
  "updated_at": "2026-04-14T14:31:00Z"
}
```

**Index:** Unique index on `spotify_user_id` ensures one token per user

## API Endpoints

### POST /tokens
Store a user's token
```bash
curl -X POST http://localhost:5000/tokens \
  -H "Content-Type: application/json" \
  -d '{
    "spotify_user_id": "user123",
    "access_token": "BQA...",
    "refresh_token": "AQD...",
    "expires_at": "2026-04-14T15:30:00Z",
    "scope": "streaming user-read-email..."
  }'
```

### GET /tokens/<spotify_user_id>
Retrieve a user's token
```bash
curl http://localhost:5000/tokens/user123
```

### GET /validate-token/<spotify_user_id>
Check if token is valid (not expired)
```bash
curl http://localhost:5000/validate-token/user123
```

### DELETE /tokens/<spotify_user_id>
Delete a user's token (logout)
```bash
curl -X DELETE http://localhost:5000/tokens/user123
```

## Multi-User Scenario

**Example:** Alice and Bob both logged in

1. **Alice logs in**
   - OAuth → exchanges code
   - Stores token: `spotify_tokens { spotify_user_id: "alice", access_token: "...", expires_at: "..." }`
   - Uses Player with her token

2. **Bob logs in** (same browser/device)
   - OAuth → exchanges code
   - Stores token: `spotify_tokens { spotify_user_id: "bob", access_token: "...", expires_at: "..." }`
   - Uses Player with his token
   - **Alice's token remains in database untouched**

3. **Scheduler runs** (different timeline)
   - Checks Alice's token → still valid, no refresh needed
   - Checks Bob's token → expiring soon → refreshes
   - Both users continue working with fresh tokens

4. **One hour later**
   - Scheduler refreshes Alice's token
   - Hours later refreshes this Bob's refreshed token

**Each user has independent, isolated token management!**

## Error Handling

### Token Expired
- `GET /validate-token/user123` returns 401 with `"valid": false`
- Frontend should redirect to login
- On next login, fresh token is stored

### Invalid User
- `GET /tokens/invalid_user` returns 404
- Indicates user never logged in or token was deleted

### Backend Unavailable
- Token validation fails -> frontend uses last cached token
- Graceful degradation

## Security Considerations

1. **Refresh Token Storage**
   - Stored securely in MongoDB (secured network)
   - Never sent to frontend except on initial setup
   - Only backend uses refresh token

2. **Access Token Handling**
   - Frontend receives access token after login
   - Backend stores access token in database
   - Both frontend and backend use access token for Spotify API
   - Access token is short-lived (typically 1 hour)

3. **Client Secret**
   - Keep `SPOTIFY_CLIENT_SECRET` in backend `.env` only
   - Never expose to frontend
   - Used only for token refresh on backend

4. **Logout**
   - Deletes token from database
   - User's session ends
   - Token cannot be reused

## Troubleshooting

### Tokens Not Refreshing
- Check scheduler is running: should see log `"Token refresh scheduler started (interval: 60 minutes)"`
- Check MongoDB connection is active
- Verify `SPOTIFY_CLIENT_SECRET` is in `.env`

### "Token not found" Error
- User not yet logged in
- Token was deleted during logout
- Different backend instance (check database connection)

### "Invalid code_verifier" Error
- PKCE verifier was cleared
- User closed browser during login
- Try logging in again

### Multiple Users Seeing Same Token
- Check `spotify_user_id` is unique in database
- Each user should have different `spotify_user_id`
- Verify Spotify API is returning correct user IDs

## Performance Notes

- Scheduler runs every 60 seconds (configurable)
- Only refreshes tokens within 5 minutes of expiry
- Minimal database load
- Supports hundreds of concurrent users
- Refresh operations are non-blocking

## Future Enhancements

1. **Redis Caching** - cache tokens in Redis for faster retrieval
2. **Webhook Notifications** - notify frontend when token is refreshed
3. **Advanced Scheduling** - use APScheduler for more sophisticated scheduling
4. **Token Analytics** - track token usage, refresh frequency
5. **User Cleanup** - auto-delete old unused tokens after X days
6. **Rate Limiting** - prevent token refresh abuse
