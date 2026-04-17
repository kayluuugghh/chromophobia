import threading
import time
from datetime import datetime, timedelta
from database import get_spotify_token, upsert_spotify_token, list_spotify_tokens
from token_refresh import refresh_spotify_token
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TokenRefreshScheduler:
    """
    Background scheduler that automatically refreshes Spotify tokens.
    Runs as a daemon thread to refresh tokens every 60 minutes.
    """
    
    def __init__(self, refresh_interval_minutes=60):
        """
        Initialize the token refresh scheduler.
        
        Args:
            refresh_interval_minutes: How often to refresh tokens (default: 60 minutes)
        """
        self.refresh_interval = refresh_interval_minutes * 60  # Convert to seconds
        self.is_running = False
        self.thread = None
        
    def start(self):
        """Start the background token refresh scheduler."""
        if self.is_running:
            logger.warning("Scheduler is already running")
            return
        
        self.is_running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        logger.info(f"Token refresh scheduler started (interval: {self.refresh_interval // 60} minutes)")
    
    def stop(self):
        """Stop the background token refresh scheduler."""
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("Token refresh scheduler stopped")
    
    def _run(self):
        """Main scheduler loop."""
        while self.is_running:
            try:
                self._refresh_all_tokens()
            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}")
            
            # Sleep for the interval (check every 60 seconds if should refresh)
            time.sleep(60)
    
    def _refresh_all_tokens(self):
        """Refresh all expired or expiring tokens."""
        try:
            tokens = list_spotify_tokens(limit=1000)  # Get all tokens
            now = datetime.utcnow()
            
            for token_doc in tokens:
                try:
                    # Check if token expires within the next 5 minutes or is already expired
                    expires_at = token_doc.get('expires_at')
                    
                    if isinstance(expires_at, str):
                        # Try to parse ISO format
                        try:
                            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                        except:
                            expires_at = None
                    
                    if not expires_at:
                        # If no expiry time, skip
                        continue
                    
                    time_until_expiry = expires_at - now
                    
                    # Refresh if expires in less than 5 minutes
                    if time_until_expiry.total_seconds() < 300:
                        self._refresh_user_token(token_doc)
                        
                except Exception as e:
                    spotify_user_id = token_doc.get('spotify_user_id', 'unknown')
                    logger.error(f"Error refreshing token for {spotify_user_id}: {e}")
        
        except Exception as e:
            logger.error(f"Error fetching tokens for refresh: {e}")
    
    def _refresh_user_token(self, token_doc):
        """
        Refresh a single user's token.
        
        Args:
            token_doc: The token document from MongoDB
        """
        spotify_user_id = token_doc.get('spotify_user_id')
        refresh_token = token_doc.get('refresh_token')
        
        if not refresh_token:
            logger.warning(f"No refresh token available for user {spotify_user_id}")
            return
        
        try:
            # Call Spotify API to refresh the token
            result = refresh_spotify_token(refresh_token)
            
            # Calculate new expiry time
            expires_in = result.get('expires_in', 3600)
            new_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            
            # Use new refresh token if provided, otherwise keep the old one
            new_refresh_token = result.get('refresh_token') or refresh_token
            
            # Update token in database
            upsert_spotify_token(
                access_token=result['access_token'],
                spotify_user_id=spotify_user_id,
                refresh_token=new_refresh_token,
                expires_at=new_expires_at,
                scope=token_doc.get('scope')
            )
            
            logger.info(f"Successfully refreshed token for user {spotify_user_id}")
            
        except Exception as e:
            logger.error(f"Failed to refresh token for user {spotify_user_id}: {e}")


# Global scheduler instance
_scheduler = None

def start_scheduler(refresh_interval_minutes=60):
    """Start the global token refresh scheduler."""
    global _scheduler
    if _scheduler is None:
        _scheduler = TokenRefreshScheduler(refresh_interval_minutes)
    _scheduler.start()

def stop_scheduler():
    """Stop the global token refresh scheduler."""
    global _scheduler
    if _scheduler:
        _scheduler.stop()
        _scheduler = None

def get_scheduler():
    """Get the global scheduler instance."""
    return _scheduler
