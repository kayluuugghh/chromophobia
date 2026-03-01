"""
Test script to verify MongoDB connection and basic CRUD operations.
Inserts a test user document into the users collection.
"""

from datetime import datetime
from database import db, init_users_collection
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_insert_user():
    """
    Insert a test user document into the users collection and print the result.
    """
    try:
        # Initialize the users collection (creates it if it doesn't exist)
        users_collection = init_users_collection()
        logger.info("Users collection initialized successfully")
        
        # Create a test user document with nested settings
        test_user = {
            'username': 'testuser',
            'email': 'testuser@example.com',
            'created_at': datetime.utcnow(),
            'settings': {
                'theme': 'dark',
                'notifications_enabled': True,
                'language': 'en'
            }
        }
        
        logger.info(f"Inserting test user: {test_user}")
        
        # Insert the test user document
        result = users_collection.insert_one(test_user)
        
        # Print the inserted document ID
        inserted_id = result.inserted_id
        print(f"\n✓ Successfully inserted test user!")
        print(f"  Document ID: {inserted_id}")
        print(f"  Username: {test_user['username']}")
        print(f"  Email: {test_user['email']}")
        print(f"  Created at: {test_user['created_at']}")
        print(f"  Settings: {test_user['settings']}\n")
        
        logger.info(f"Test user inserted with ID: {inserted_id}")
        
        # Retrieve and display the inserted document
        retrieved_user = users_collection.find_one({'_id': inserted_id})
        logger.info(f"Retrieved user from database: {retrieved_user}")
        
        return inserted_id
        
    except Exception as e:
        logger.error(f"Error during test insertion: {e}")
        print(f"\n✗ Error: {e}\n")
        raise

if __name__ == '__main__':
    logger.info("Starting database test...")
    try:
        doc_id = test_insert_user()
        print(f"Test completed successfully! Document ID: {doc_id}")
    except Exception as e:
        print(f"Test failed: {e}")
        exit(1)
