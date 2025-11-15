from flask import Flask, jsonify, request, abort
from flask_cors import CORS
from pathlib import Path
from datetime import datetime
import sys
import os

# Ensure backend directory is on sys.path so we can import models when running
# from the repo root (e.g. `python backend/app.py`).
sys.path.insert(0, str(Path(__file__).resolve().parent))
import models

# Optional: LLM integration (will gracefully degrade if no API key)
try:
    import openai
    LLM_AVAILABLE = True
except ImportError:
    LLM_AVAILABLE = False

try:
    from geopy.geocoders import Nominatim
    GEOCODER = Nominatim(user_agent="linkedout_resource_app")
    GEOCODING_AVAILABLE = True
except ImportError:
    GEOCODER = None
    GEOCODING_AVAILABLE = False

app = Flask(__name__)
CORS(app)


@app.route('/')
def hello():
    return "Hello, World!"


@app.route('/posts', methods=['GET'])
def posts_list():
    """Return list of posts (most recent last)."""
    return jsonify(models.get_posts())


@app.route('/posts', methods=['POST'])
def posts_create():
    data = request.get_json() or {}
    content = data.get('content', '').strip()
    username = data.get('username', 'Anonymous').strip()  # Get username from request
    
    if not content:
        return jsonify({'error': 'content is required'}), 400

    post = {
        'content': content,
        'username': username,  # Store username with post
        'created_at': datetime.utcnow().isoformat() + 'Z'
    }
    models.add_post(post)
    return jsonify(post), 201


@app.route('/resources')
def resources_list():
    return jsonify(models.get_resources())

@app.route('/resources/<resource_id>/click', methods=['POST'])
def resource_click(resource_id):
    """Record a click on a resource, potentially removing it if clicks exhausted."""
    exists = models.click_resource(resource_id)
    return jsonify({'exists': exists})


@app.route('/search', methods=['POST'])
def search_resources():
    """
    LLM-powered natural language search.
    User asks in natural language (e.g., "I need water near me")
    Returns the nearest matching resource with an address.
    """
    data = request.get_json() or {}
    query = (data.get('query') or '').strip()
    user_lat = data.get('lat')
    user_lon = data.get('lon')

    if not query or user_lat is None or user_lon is None:
        return jsonify({'error': 'query, lat, and lon are required'}), 400

    try:
        user_lat = float(user_lat)
        user_lon = float(user_lon)
    except (TypeError, ValueError):
        return jsonify({'error': 'lat and lon must be numbers'}), 400

    # Parse the query using simple heuristics (no LLM required for MVP)
    query_lower = query.lower()
    resource_type = None
    
    # Simple keyword matching
    if any(word in query_lower for word in ['water', 'drink', 'thirst', 'fountain']):
        resource_type = 'water'
    elif any(word in query_lower for word in ['food', 'eat', 'meal', 'hungry', 'lunch', 'dinner']):
        resource_type = 'food'
    elif any(word in query_lower for word in ['shelter', 'sleep', 'bed', 'warm', 'roof', 'place to stay']):
        resource_type = 'shelter'
    elif any(word in query_lower for word in ['job', 'work', 'employment', 'hiring', 'career']):
        resource_type = 'job'
    elif any(word in query_lower for word in ['medical', 'doctor', 'health', 'clinic', 'hospital', 'care']):
        resource_type = 'medical'
    
    # Find nearest resource
    nearest = models.find_nearest_resource(user_lat, user_lon, resource_type)
    
    if not nearest:
        if resource_type:
            return jsonify({'message': f'No {resource_type} resources found nearby. Try searching for water, food, shelter, jobs, or medical services.'}), 404
        else:
            return jsonify({'message': 'I didn\'t understand what you\'re looking for. Try asking for: water, food, shelter, jobs, or medical services.'}), 400
    
    # Try to get address via reverse geocoding
    address = "Address unavailable"
    if GEOCODING_AVAILABLE:
        try:
            location = GEOCODER.reverse(f"{nearest['lat']}, {nearest['lon']}")
            address = location.address
        except Exception as e:
            print(f"Geocoding error: {e}")
    
    response = {
        'resource': nearest,
        'address': address,
        'distance_miles': nearest.get('distance_miles', 'unknown'),
        'directions_url': f"https://www.google.com/maps/dir/?api=1&destination={nearest['lat']},{nearest['lon']}"
    }
    
    return jsonify(response)



@app.route('/resources', methods=['POST'])
def resources_create():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    rtype = (data.get('type') or '').strip()
    notes = (data.get('notes') or '').strip()
    lat = data.get('lat')
    lon = data.get('lon')

    if not name or lat is None or lon is None:
        return jsonify({'error': 'name, lat and lon are required'}), 400

    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return jsonify({'error': 'lat and lon must be numbers'}), 400

    resource = {
        'name': name,
        'type': rtype or 'unknown',
        'notes': notes,
        'lat': lat,
        'lon': lon,
        'created_at': datetime.utcnow().isoformat() + 'Z'
    }
    models.add_resource(resource)
    return jsonify(resource), 201


if __name__ == '__main__':
    # Bind to 127.0.0.1 for local dev
    app.run(debug=True, host='127.0.0.1', port=3000)