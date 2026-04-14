import os
from flask import Flask, request, jsonify
from database import connect_to_database, init_spotify_tokens_collection, upsert_spotify_token, get_spotify_token, list_spotify_tokens, delete_spotify_token
from scheduler import start_scheduler, stop_scheduler
from datetime import datetime, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

_db_initialized = False

def initialize_database():
    global _db_initialized
    if not _db_initialized:
        connect_to_database()
        init_spotify_tokens_collection()
        _db_initialized = True
        # Start the token refresh scheduler
        start_scheduler(refresh_interval_minutes=60)


@app.teardown_appcontext
def shutdown_scheduler(exception=None):
    """Stop scheduler when app shuts down."""
    stop_scheduler()


def serialize_token(token_doc):
    if not token_doc:
        return None

    return {
        'id': str(token_doc.get('_id')),
        'spotify_user_id': token_doc.get('spotify_user_id'),
        'access_token': token_doc.get('access_token'),
        'refresh_token': token_doc.get('refresh_token'),
        'expires_at': token_doc.get('expires_at'),
        'scope': token_doc.get('scope'),
        'created_at': token_doc.get('created_at').isoformat() if token_doc.get('created_at') else None,
        'updated_at': token_doc.get('updated_at').isoformat() if token_doc.get('updated_at') else None,
    }


@app.route('/health', methods=['GET'])
def health_check():
    initialize_database()
    return jsonify({'status': 'ok'})


@app.route('/tokens', methods=['POST'])
def save_token():
    payload = request.get_json(silent=True) or {}
    access_token = payload.get('access_token')
    spotify_user_id = payload.get('spotify_user_id')
    refresh_token = payload.get('refresh_token')
    expires_at = payload.get('expires_at')
    scope = payload.get('scope')

    if not access_token:
        return jsonify({'error': 'access_token is required'}), 400

    token_doc = upsert_spotify_token(
        access_token=access_token,
        spotify_user_id=spotify_user_id,
        refresh_token=refresh_token,
        expires_at=expires_at,
        scope=scope,
    )

    return jsonify({'status': 'ok', 'token': serialize_token(token_doc)}), 200


@app.route('/tokens', methods=['GET'])
def list_tokens():
    tokens = list_spotify_tokens()
    return jsonify({'tokens': [serialize_token(token) for token in tokens]}), 200


@app.route('/tokens/<string:spotify_user_id>', methods=['GET'])
def get_token(spotify_user_id):
    token_doc = get_spotify_token(spotify_user_id=spotify_user_id)
    if token_doc is None:
        return jsonify({'error': 'token not found'}), 404
    return jsonify({'token': serialize_token(token_doc)}), 200


@app.route('/tokens/<string:spotify_user_id>', methods=['DELETE'])
def delete_token(spotify_user_id):
    deleted_count = delete_spotify_token(spotify_user_id=spotify_user_id)
    if deleted_count == 0:
        return jsonify({'error': 'token not found'}), 404
    return jsonify({'status': 'deleted'}), 200


@app.route('/validate-token/<string:spotify_user_id>', methods=['GET'])
def validate_token(spotify_user_id):
    """
    Check if a stored token is still valid and not expired.
    Returns the token if valid, or error if expired/not found.
    """
    initialize_database()
    token_doc = get_spotify_token(spotify_user_id=spotify_user_id)
    
    if token_doc is None:
        return jsonify({'error': 'token not found', 'valid': False}), 404
    
    expires_at = token_doc.get('expires_at')
    
    # Parse expires_at if it's a string
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        except:
            return jsonify({
                'error': 'Could not parse token expiry',
                'valid': False
            }), 400
    
    # Check if token is expired
    if expires_at and expires_at < datetime.utcnow():
        return jsonify({
            'error': 'token expired',
            'valid': False,
            'expired_at': expires_at.isoformat() if hasattr(expires_at, 'isoformat') else str(expires_at)
        }), 401
    
    return jsonify({
        'valid': True,
        'token': serialize_token(token_doc),
        'expires_at': expires_at.isoformat() if hasattr(expires_at, 'isoformat') else str(expires_at)
    }), 200


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
