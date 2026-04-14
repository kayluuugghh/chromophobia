import requests
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

CLIENT_ID = os.getenv('VITE_CLIENT_ID')
CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'


def refresh_spotify_token(refresh_token: str) -> dict:
    """
    Refresh a Spotify access token using the refresh token.
    
    Args:
        refresh_token: The refresh token from Spotify
        
    Returns:
        dict: Contains 'access_token', 'expires_in', and optionally 'refresh_token'
        
    Raises:
        ValueError: If refresh fails
    """
    if not CLIENT_ID or not CLIENT_SECRET:
        raise ValueError("VITE_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables are required")
    
    try:
        response = requests.post(
            SPOTIFY_TOKEN_URL,
            data={
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET,
            },
            timeout=10
        )
        
        if not response.ok:
            logger.error(f"Spotify token refresh failed: {response.status_code} - {response.text}")
            raise ValueError(f"Spotify token refresh failed: {response.text}")
        
        data = response.json()
        logger.info(f"Successfully refreshed token")
        
        return {
            'access_token': data.get('access_token'),
            'expires_in': data.get('expires_in', 3600),
            'refresh_token': data.get('refresh_token'),  # Optional, Spotify may return a new one
        }
        
    except requests.RequestException as e:
        logger.error(f"Error refreshing Spotify token: {e}")
        raise ValueError(f"Failed to refresh token: {e}")
