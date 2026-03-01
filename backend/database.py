import os
from dotenv import load_dotenv
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
        
        # Create MongoDB client with timeout settings
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000, connectTimeoutMS=10000)
        
        # Verify the connection by pinging the server
        client.admin.command('ping')
        logger.info("Successfully connected to MongoDB Atlas")
        
        # Get the chromophobia database
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

def init_users_collection():
    """
    Initialize the users collection with JSON schema validation and unique index.
    
    Creates the "users" collection if it doesn't exist, applies JSON schema validation
    to enforce required fields (username, email, created_at, settings), and creates
    a unique index on the email field to prevent duplicate user registrations.
    
    Returns:
        pymongo.collection.Collection: The users collection
        
    Raises:
        RuntimeError: If unable to initialize the collection, schema, or index
    """
    global db
    
    try:
        if db is None:
            raise RuntimeError("Database connection not established. Call connect_to_database() first.")
        
        # Get or create the users collection
        users_collection = db['users']
        logger.info("Accessed 'users' collection")
        
        # Define JSON schema for validation
        json_schema = {
            'bsonType': 'object',
            'required': ['username', 'email', 'created_at', 'settings'],
            'properties': {
                '_id': {
                    'bsonType': 'objectId',
                    'description': 'Unique document identifier'
                },
                'username': {
                    'bsonType': 'string',
                    'description': 'User\'s username (required, string)',
                    'minLength': 1
                },
                'email': {
                    'bsonType': 'string',
                    'description': 'User\'s email address (required, string)',
                    'pattern': '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
                },
                'created_at': {
                    'bsonType': 'date',
                    'description': 'Document creation timestamp (required, date)'
                },
                'settings': {
                    'bsonType': 'object',
                    'description': 'User settings object (required)',
                    'properties': {
                        'theme': {'bsonType': 'string'},
                        'notifications_enabled': {'bsonType': 'bool'},
                        'language': {'bsonType': 'string'}
                    }
                }
            },
            'additionalProperties': True
        }
        
        # Apply JSON schema validation to the collection
        validator = {'$jsonSchema': json_schema}
        
        try:
            db.command('collMod', 'users', validator=validator)
            logger.info("Applied JSON schema validation to users collection")
        except OperationFailure as e:
            # If collMod fails (collection might not exist), create with validation
            if 'ns does not exist' in str(e):
                db.create_collection('users', validator=validator)
                logger.info("Created users collection with JSON schema validation")
            else:
                raise
        
        # Create a unique index on the email field
        # sparse=True allows documents without email field to exist (though schema requires it)
        users_collection.create_index('email', unique=True, sparse=False)
        logger.info("Created unique index on 'email' field in users collection")
        
        return users_collection
        
    except OperationFailure as e:
        logger.error(f"MongoDB operation failed during collection initialization: {e}")
        raise RuntimeError(f"Collection initialization failed: {e}")
    except Exception as e:
        logger.error(f"Unexpected error during users collection initialization: {e}")
        raise RuntimeError(f"Users collection initialization failed: {e}")

# Export the database instance and functions
__all__ = ['db', 'connect_to_database', 'init_users_collection']
