# Fix for "Failed to Fetch" Error After Spotify Login

## Problem Summary
After logging in with Spotify, you were seeing a black screen with "Error: Failed to fetch" and a "Try Again" button. This was happening intermittently because:

1. **Backend connectivity issues** - The frontend was failing to reach the backend `/user-profile` endpoint
2. **No retry logic** - Failed requests weren't being retried
3. **No timeout handling** - Requests could hang indefinitely
4. **No fallback** - If the backend failed, there was no way to recover
5. **Poor error messages** - Errors weren't descriptive enough to debug

## What Was Fixed

### 1. **Retry Logic with Exponential Backoff**
All fetch requests now retry up to 3 times with exponential backoff (1s, 2s, 4s delays).

### 2. **Timeout Handling**
All fetch requests now have a 10-second timeout (8 seconds for user profile fetch) to prevent hanging.

### 3. **Fallback to Spotify API**
If the backend `/user-profile` endpoint fails, the app now:
- Falls back to fetching user profile directly from Spotify API
- This works even if your backend server isn't running
- Provides a much better user experience

### 4. **Comprehensive Error Logging**
The browser console now shows detailed logs for every step:
- Token exchange steps
- Retry attempts
- Timeout issues
- Fallback attempts
- Complete error messages

### 5. **Improved Error Display**
Error messages now show:
- What went wrong
- How to check the console for details
- Links to back to login if something fails

## How to Use

### Step 1: Verify Environment Variables
Create a `.env.local` file in the root directory with:

```env
VITE_CLIENT_ID=your_spotify_client_id
VITE_REDIRECT_URI=http://localhost:5173/callback
VITE_BACKEND_URL=http://localhost:5000
```

Replace `your_spotify_client_id` with your actual Spotify app ID.

### Step 2: Make Sure Backend is Running (Optional)
If you want to use the backend for token storage:

```bash
cd backend
python app.py
```

The app will work WITHOUT the backend running - it will just fall back to the Spotify API.

### Step 3: Start the Frontend
```bash
npm run dev
```

### Step 4: Test the Fix
1. Go to `http://localhost:5173`
2. Click "Login with Spotify"
3. **IMPORTANT**: Open the browser console (F12 → Console tab)
4. Complete the Spotify login flow
5. Watch the console for detailed logs
6. You should now see the music player instead of an error

## Debugging Guide

### Open Browser Console (F12)
This is crucial for diagnosing issues:

**Windows/Linux**: `F12` or `Ctrl + Shift + I`  
**Mac**: `Cmd + Option + I`

### Look for These Log Patterns

#### ✅ Success Logs (Look for these)
```
[Auth] Exchanging authorization code for access token...
[Auth] Successfully received access token from Spotify
[Auth] Fetching user profile...
[Auth] Attempting to fetch user profile from backend...
[Auth] Successfully fetched user profile from backend
[Auth] Login successful for user: xxx
[SpotifyPlayer] Token loaded successfully for user: xxx
[SpotifyPlayer] Player ready with device ID: xxxx
```

#### ⚠️ Retry Logs (Normal, don't panic)
```
[Fetch Attempt 1/3] POST http://localhost:5000/user-profile
[Fetch Error] ... Connection refused
[Retry] Waiting 1000ms before attempt 2
[Fetch Attempt 2/3] POST http://localhost:5000/user-profile
```

#### 🔄 Fallback Logs (Backend not running, using Spotify API)
```
[Auth] Backend user profile fetch failed, falling back to Spotify API: ...
[Auth] Attempting to fetch user profile from Spotify API directly...
[Auth] Successfully fetched user profile from Spotify API
```

#### ❌ Error Logs (Actual problems)
```
[Auth] Both backend and Spotify API failed: ...
[SpotifyPlayer] Spotify authentication failed: ...
```

### Common Issues and Solutions

#### Issue 1: "Backend error: 404 - Not found"
**Problem**: Backend is running but endpoint is missing  
**Solution**: 
- Make sure backend `app.py` has the `/user-profile` endpoint
- Check the TOKEN_REFRESH_IMPLEMENTATION.md for backend setup

#### Issue 2: "Cannot fetch user profile: Backend unavailable and Spotify API failed"
**Problem**: Both backend AND Spotify API failed (very rare)  
**Solution**:
- Check your internet connection
- Check your Spotify token isn't expired
- Try logging out and logging in again

#### Issue 3: "Spotify authentication failed"
**Problem**: The Spotify WebPlayback SDK is having authentication issues  
**Solution**:
- Your token might be expired - try logging in again
- Check your Spotify account is active (not suspended)
- Your device might not support Web Playback (try on desktop/Chrome)

#### Issue 4: Logs show retries but never succeeds
**Problem**: Backend is crashing or network is unstable  
**Solution**:
- Check backend logs: `python backend/app.py`
- Make sure MongoDB connection is working
- Restart the backend server

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ User Logs In with Spotify                               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │ Exchange Code for Token     │
         │ (From Spotify API)          │
         └──────────────┬──────────────┘
                        │
                        ▼
         ┌──────────────────────────────┐
         │ Fetch User Profile (3 retries)
         │ With 10s timeout             │
         └──────────────┬───────────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
         ▼                             ▼
    Try Backend              Falls back to
    /user-profile ────────►  Spotify API
         │                        │
         ▼                        ▼
    ┌────────────┐         ┌────────────┐
    │ Success ✓  │ OR      │ Success ✓  │
    └────────────┘         └────────────┘
         │                        │
         └────────────┬───────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │ Store Token Locally     │
         │ Set Current User        │
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │ Show Music Player ✓     │
         └─────────────────────────┘
```

## What Gets Logged

The new logging system records:
1. **Auth flow**: Code exchange → User profile fetch → Token storage
2. **Network issues**: Timeouts, connection errors, retries
3. **Fallbacks**: When backend is down, switching to Spotify API
4. **Player events**: SDK ready, device connected, errors
5. **Fetch attempts**: Each retry attempt with timing

All logs start with a category in brackets:
- `[Auth]` - Authentication flow
- `[Backend]` - Backend operations
- `[SpotifyPlayer]` - Music player events
- `[Fetch ...]` - Network operations

## If It Still Doesn't Work

1. **Open browser console** (F12) and scroll to see all logs
2. **Copy the error message** from the console
3. **Check these things**:
   - Environment variables are set correctly (`.env.local`)
   - Spotify app ID is valid
   - Redirect URI matches your Spotify app settings exactly
   - Backend server is running (if using it)
   - Internet connection is stable
4. **Look at the logs** - they tell you exactly where things went wrong

## Files Modified

1. **src/utils/spotifyAuth.js**
   - Added `fetchWithRetry()` helper with exponential backoff
   - Updated `exchangeCodeForToken()` with retry logic and fallback
   - Updated all backend functions with retry logic

2. **src/Callback.jsx**
   - Improved error display with helpful messages
   - Added link to backend URL for debugging

3. **src/SpotifyPlayer.jsx**
   - Added comprehensive logging for player events
   - Improved error messages with recovery instructions
   - Better error display UI

## Benefits

✅ Automatic retries for transient failures  
✅ Timeout protection to prevent hanging  
✅ Works even when backend is down (uses Spotify API)  
✅ Detailed logging for debugging  
✅ Better error messages for users  
✅ Exponential backoff prevents server overload  
✅ Fallback strategy ensures app keeps working  

---

**Need help?** Check the browser console logs first - they'll tell you exactly what's happening!
