"""
Test script to verify MongoDB connection and basic CRUD operations.
Inserts a test Spotify token document into the spotify_tokens collection.
"""

from database import init_spotify_tokens_collection, upsert_spotify_token
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_insert_token():
    """
    Insert a test Spotify token document into the spotify_tokens collection and print the result.
    """
    try:
        tokens_collection = init_spotify_tokens_collection()
        logger.info("Spotify tokens collection initialized successfully")

        test_token = upsert_spotify_token(
            access_token='test_access_token',
            spotify_user_id='test_spotify_user',
            refresh_token='test_refresh_token',
            expires_at='2099-12-31T23:59:59Z',
            scope='user-read-playback-state user-modify-playback-state'
        )

        inserted_id = test_token.get('_id')
        print(f"\n✓ Successfully inserted test Spotify token!")
        print(f"  Document ID: {inserted_id}")
        print(f"  Spotify user id: {test_token.get('spotify_user_id')}")
        print(f"  Access token: {test_token.get('access_token')}")
        print(f"  Refresh token: {test_token.get('refresh_token')}")
        print(f"  Created at: {test_token.get('created_at')}")
        print(f"  Updated at: {test_token.get('updated_at')}\n")

        logger.info(f"Test token inserted with ID: {inserted_id}")
        return inserted_id

    except Exception as e:
        logger.error(f"Error during test insertion: {e}")
        print(f"\n✗ Error: {e}\n")
        raise

if __name__ == '__main__':
    logger.info("Starting database test...")
    try:
        doc_id = test_insert_token()
        print(f"Test completed successfully! Document ID: {doc_id}")
    except Exception as e:
        print(f"Test failed: {e}")
        exit(1)
