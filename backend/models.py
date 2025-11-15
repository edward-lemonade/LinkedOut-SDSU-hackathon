from pathlib import Path
import json
from threading import Lock
import math

_lock = Lock()


def _data_file(name: str) -> Path:
    
    base = Path(__file__).resolve().parent.parent
    return base / 'data' / name

def _load(filename: str):
    path = _data_file(filename)
    if not path.exists():
        return []
    try:
        with path.open('r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def _save(filename: str, data):
    path = _data_file(filename)
    # write atomically
    temp = path.with_suffix('.tmp')
    with _lock:
        with temp.open('w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        temp.replace(path)


def get_posts():
    return _load('initial_posts.json')


def add_post(post: dict):
    posts = _load('initial_posts.json')
    posts.append(post)
    _save('initial_posts.json', posts)


def get_resources():
    return _load('initial_resources.json')


def add_resource(resource: dict):
    resources = _load('initial_resources.json')
    
    resource['clicks_remaining'] = resource.get('clicks_limit', 10)  # default 10 clicks if not specified
    resource['id'] = str(len(resources)) 
    resources.append(resource)
    _save('initial_resources.json', resources)

def click_resource(resource_id: str) -> bool:
    resources = _load('initial_resources.json')
    for resource in resources:
        if resource.get('id') == resource_id:
            clicks = resource.get('clicks_remaining', 0)
            if clicks <= 1:  
                resources.remove(resource)
                _save('initial_resources.json', resources)
                return False
            resource['clicks_remaining'] = clicks - 1
            _save('initial_resources.json', resources)
            return True
    return False  # resource not there


def haversine_distance(lat1, lon1, lat2, lon2):
    R = 3959  
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    a = math.sin(delta_lat / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def find_nearest_resource(user_lat: float, user_lon: float, resource_type: str = None):
    """
    Find the nearest resource to the user.
    If resource_type is provided, filter by type (e.g., 'water', 'food', 'shelter').
    Returns the resource with its distance in miles.
    """
    resources = _load('initial_resources.json')
    if not resources:
        return None
    
    # filter by type
    if resource_type:
        resources = [r for r in resources if r.get('type', '').lower() == resource_type.lower()]
    
    if not resources:
        return None
    
    #find neare distance
    nearest = None
    min_distance = float('inf')
    
    for r in resources:
        try:
            distance = haversine_distance(user_lat, user_lon, r['lat'], r['lon'])
            if distance < min_distance:
                min_distance = distance
                nearest = r
                nearest['distance_miles'] = round(distance, 2)
        except (ValueError, KeyError):
            continue
    
    return nearest

