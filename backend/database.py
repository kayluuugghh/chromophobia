'''
Contribution to code made by: Annabelle Marie Lozano
database.py
----------------
'''
import os
from datetime import datetime
from dotenv import load_dotenv
from bson.objectid import ObjectId
from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure, OperationFailure
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

# Get MongoDB connection string from environment
MONGODB_URI = os.getenv('MONGODB_URI')

# Initialize database connection
db = None

TOKEN_COLLECTION_NAME = 'spotify_tokens'


def connect_to_database():
    """
    Connect to MongoDB Atlas cluster and return the database instance.

    Returns:
        pymongo.database.Database: The chromophobia database instance

    Raises:
        ConnectionFailure: If connection to MongoDB fails
        ValueError: If MONGODB_URI environment variable is not set
    """
    global db

    try:
        if not MONGODB_URI:
            raise ValueError("MONGODB_URI environment variable is not set. Please check your .env file.")

        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000, connectTimeoutMS=10000)
        client.admin.command('ping')
        logger.info("Successfully connected to MongoDB Atlas")

        db = client['chromophobia']
        logger.info("Connected to 'chromophobia' database")

        return db

    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        raise
    except ServerSelectionTimeoutError as e:
        logger.error(f"Unable to connect to MongoDB Atlas within timeout period: {e}")
        raise ConnectionFailure("MongoDB connection timeout. Please check your connection string and network connectivity.")
    except ConnectionFailure as e:
        logger.error(f"Failed to connect to MongoDB Atlas: {e}")
        raise ConnectionFailure(f"MongoDB connection failed: {e}")
    except Exception as e:
        logger.error(f"Unexpected error during database connection: {e}")
        raise


# Attempt to connect on module load
if MONGODB_URI:
    try:
        db = connect_to_database()
    except Exception as e:
        logger.warning(f"Database connection could not be established at startup: {e}")
else:
    logger.warning("MONGODB_URI not found in environment variables. Database not connected.")


def init_spotify_tokens_collection():
    """
    Initialize the Spotify tokens collection with JSON schema validation and a unique user index.

    Returns:
        pymongo.collection.Collection: The spotify_tokens collection

    Raises:
        RuntimeError: If unable to initialize the collection, schema, or index
    """
    global db

    try:
        if db is None:
            connect_to_database()
            if db is None:
                raise RuntimeError("Database connection not established. Call connect_to_database() first.")

        tokens_collection = db[TOKEN_COLLECTION_NAME]
        logger.info(f"Accessed '{TOKEN_COLLECTION_NAME}' collection")

        json_schema = {
            'bsonType': 'object',
            'required': ['access_token', 'created_at'],
            'properties': {
                '_id': {
                    'bsonType': 'objectId',
                    'description': 'Unique document identifier'
                },
                'spotify_user_id': {
                    'bsonType': 'string',
                    'description': 'Spotify account id for the stored token',
                    'minLength': 1
                },
                'access_token': {
                    'bsonType': 'string',
                    'description': 'Spotify access token',
                    'minLength': 1
                },
                'refresh_token': {
                    'bsonType': 'string',
                    'description': 'Spotify refresh token',
                    'minLength': 1
                },
                'expires_at': {
                    'bsonType': ['date', 'string'],
                    'description': 'Expiry timestamp or string representation of the access token'
                },
                'scope': {
                    'bsonType': 'string',
                    'description': 'Spotify scopes granted for this token'
                },
                'created_at': {
                    'bsonType': 'date',
                    'description': 'Document creation timestamp'
                },
                'updated_at': {
                    'bsonType': 'date',
                    'description': 'Last update timestamp'
                }
            },
            'additionalProperties': True
        }

        validator = {'$jsonSchema': json_schema}

        try:
            db.command('collMod', TOKEN_COLLECTION_NAME, validator=validator)
            logger.info(f"Applied JSON schema validation to {TOKEN_COLLECTION_NAME} collection")
        except OperationFailure as e:
            if 'ns does not exist' in str(e):
                db.create_collection(TOKEN_COLLECTION_NAME, validator=validator)
                logger.info(f"Created {TOKEN_COLLECTION_NAME} collection with JSON schema validation")
            else:
                raise

        tokens_collection.create_index('spotify_user_id', unique=True, sparse=True)
        logger.info("Created unique sparse index on 'spotify_user_id' in spotify_tokens collection")

        return tokens_collection

    except OperationFailure as e:
        logger.error(f"MongoDB operation failed during collection initialization: {e}")
        raise RuntimeError(f"Collection initialization failed: {e}")
    except Exception as e:
        logger.error(f"Unexpected error during spotify_tokens collection initialization: {e}")
        raise RuntimeError(f"spotify_tokens collection initialization failed: {e}")


def upsert_spotify_token(access_token, spotify_user_id=None, refresh_token=None, expires_at=None, scope=None):
    """
    Insert or update a Spotify token document.

    If spotify_user_id is provided, this will upsert by that identifier.
    Otherwise a new token document is created.
    """
    if not access_token:
        raise ValueError('access_token is required to store a Spotify token.')

    tokens_collection = init_spotify_tokens_collection()
    timestamp = datetime.utcnow()
    token_data = {
        'access_token': access_token,
        'updated_at': timestamp
    }

    if spotify_user_id:
        token_data['spotify_user_id'] = spotify_user_id
    if refresh_token:
        token_data['refresh_token'] = refresh_token
    if expires_at:
        token_data['expires_at'] = expires_at
    if scope:
        token_data['scope'] = scope

    if spotify_user_id:
        result = tokens_collection.update_one(
            {'spotify_user_id': spotify_user_id},
            {
                '$set': token_data,
                '$setOnInsert': {'created_at': timestamp}
            },
            upsert=True
        )

        if result.upserted_id:
            return tokens_collection.find_one({'_id': result.upserted_id})

        return tokens_collection.find_one({'spotify_user_id': spotify_user_id})

    token_data['created_at'] = timestamp
    inserted_id = tokens_collection.insert_one(token_data).inserted_id
    return tokens_collection.find_one({'_id': inserted_id})


def get_spotify_token(spotify_user_id=None, token_id=None):
    """
    Retrieve a Spotify token document by Spotify user id or document id.
    """
    tokens_collection = init_spotify_tokens_collection()

    if spotify_user_id:
        return tokens_collection.find_one({'spotify_user_id': spotify_user_id})

    if token_id:
        try:
            return tokens_collection.find_one({'_id': ObjectId(token_id)})
        except Exception:
            return None

    return None


def list_spotify_tokens(limit=50):
    """
    List Spotify token documents up to the specified limit.
    """
    tokens_collection = init_spotify_tokens_collection()
    return list(tokens_collection.find().sort('created_at', -1).limit(limit))


def delete_spotify_token(spotify_user_id=None, token_id=None):
    """
    Delete a Spotify token document by Spotify user id or document id.
    """
    tokens_collection = init_spotify_tokens_collection()

    if spotify_user_id:
        result = tokens_collection.delete_one({'spotify_user_id': spotify_user_id})
        return result.deleted_count

    if token_id:
        try:
            result = tokens_collection.delete_one({'_id': ObjectId(token_id)})
            return result.deleted_count
        except Exception:
            return 0

    raise ValueError('spotify_user_id or token_id is required to delete a token.')


# Export the database instance and helper functions
__all__ = [
    'db',
    'connect_to_database',
    'init_spotify_tokens_collection',
    'upsert_spotify_token',
    'get_spotify_token',
    'list_spotify_tokens',
    'delete_spotify_token'
]
