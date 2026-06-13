import json
import math
import os
import sqlite3
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from backend.seed_data import EDGES, NODES, TRIP


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent


def load_local_env():
    env_file = PROJECT_DIR / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


load_local_env()

DIST_DIR = PROJECT_DIR / "dist"
DATABASE = Path(os.environ.get("DATABASE_PATH", BASE_DIR / "voyageplanner.db"))
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", DATABASE.parent / "uploads"))
AMAP_WEB_SERVICE_KEY = os.environ.get("AMAP_WEB_SERVICE_KEY", "")
OVERSEAS_GEOCODE_PROVIDER = os.environ.get("OVERSEAS_GEOCODE_PROVIDER", "nominatim").lower()
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024
GEOCODE_CACHE_TTL = 24 * 60 * 60
REVERSE_CACHE_TTL = 7 * 24 * 60 * 60
GEOCODE_CACHE = {}
AIRPORT_COORDINATES = {
    "北京首都机场": (40.0801, 116.5847),
    "首都机场": (40.0801, 116.5847),
    "阿什哈巴德机场": (37.9868, 58.3610),
    "伊斯坦布尔机场": (41.2753, 28.7519),
    "凯斯楚普机场": (55.6180, 12.6561),
    "凯夫拉维克机场": (63.9850, -22.6056),
    "里加机场": (56.9236, 23.9711),
    "新乌兰巴托国际机场": (47.6469, 106.8198),
}

app = Flask(__name__, static_folder=str(DIST_DIR), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = MAX_IMAGE_BYTES


@app.errorhandler(RequestEntityTooLarge)
def image_too_large(_error):
    return jsonify({"error": "图片不能超过 10 MB"}), 413


def connection():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_database():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    with connection() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS trips (
                slug TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                subtitle TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                travelers INTEGER NOT NULL,
                origin TEXT NOT NULL,
                summary TEXT NOT NULL,
                car TEXT NOT NULL,
                car_image_url TEXT NOT NULL DEFAULT '',
                accommodations TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY,
                trip_slug TEXT NOT NULL REFERENCES trips(slug) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                type TEXT NOT NULL,
                time TEXT NOT NULL,
                day INTEGER NOT NULL,
                date TEXT NOT NULL,
                city TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'planned'
                ,image_url TEXT NOT NULL DEFAULT ''
                ,image_urls TEXT NOT NULL DEFAULT '[]'
                ,transport_mode TEXT NOT NULL DEFAULT ''
                ,departure_place TEXT NOT NULL DEFAULT ''
                ,arrival_place TEXT NOT NULL DEFAULT ''
                ,arrival_time TEXT NOT NULL DEFAULT ''
                ,arrival_date TEXT NOT NULL DEFAULT ''
                ,service_number TEXT NOT NULL DEFAULT ''
                ,duration TEXT NOT NULL DEFAULT ''
                ,departure_lat REAL
                ,departure_lng REAL
                ,arrival_lat REAL
                ,arrival_lng REAL
            );
            CREATE TABLE IF NOT EXISTS edges (
                id TEXT PRIMARY KEY,
                trip_slug TEXT NOT NULL REFERENCES trips(slug) ON DELETE CASCADE,
                source TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                target TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                transport_type TEXT NOT NULL DEFAULT 'car',
                duration TEXT,
                distance TEXT
            );
            CREATE TABLE IF NOT EXISTS geocode_cache (
                cache_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                expires_at REAL NOT NULL
            );
            """
        )
        count = db.execute("SELECT COUNT(*) FROM trips").fetchone()[0]
        trip_columns = {row[1] for row in db.execute("PRAGMA table_info(trips)")}
        node_columns = {row[1] for row in db.execute("PRAGMA table_info(nodes)")}
        if "car_image_url" not in trip_columns:
            db.execute("ALTER TABLE trips ADD COLUMN car_image_url TEXT NOT NULL DEFAULT ''")
        if "image_url" not in node_columns:
            db.execute("ALTER TABLE nodes ADD COLUMN image_url TEXT NOT NULL DEFAULT ''")
        if "image_urls" not in node_columns:
            db.execute("ALTER TABLE nodes ADD COLUMN image_urls TEXT NOT NULL DEFAULT '[]'")
            db.execute(
                "UPDATE nodes SET image_urls = json_array(image_url) WHERE image_url != ''"
            )
        if "address" not in node_columns:
            db.execute("ALTER TABLE nodes ADD COLUMN address TEXT NOT NULL DEFAULT ''")
        for column in ("transport_mode", "departure_place", "arrival_place", "arrival_time", "arrival_date", "service_number", "duration"):
            if column not in node_columns:
                db.execute(f"ALTER TABLE nodes ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
        for column in ("departure_lat", "departure_lng", "arrival_lat", "arrival_lng"):
            if column not in node_columns:
                db.execute(f"ALTER TABLE nodes ADD COLUMN {column} REAL")
        migrate_journey_routes(db)
        if count == 0:
            reset_trip(db)
            migrate_journey_routes(db)


def airport_coordinates(place):
    normalized = str(place or "").strip()
    for name, coordinates in AIRPORT_COORDINATES.items():
        if name in normalized:
            return coordinates
    return None


def migrate_journey_routes(db):
    db.execute(
        """UPDATE nodes SET type = 'transfer'
        WHERE type = 'leisure' AND (title LIKE '%转机%' OR title LIKE '%中转%')"""
    )
    db.execute(
        """DELETE FROM edges WHERE source IN (SELECT id FROM nodes WHERE type = 'transfer')
        OR target IN (SELECT id FROM nodes WHERE type = 'transfer')"""
    )
    flights = db.execute(
        """SELECT id, departure_place, arrival_place, departure_lat, departure_lng, arrival_lat, arrival_lng
        FROM nodes WHERE type = 'transport' AND transport_mode = 'flight'"""
    ).fetchall()
    for flight in flights:
        departure = airport_coordinates(flight["departure_place"])
        arrival = airport_coordinates(flight["arrival_place"])
        db.execute(
            """UPDATE nodes SET
            departure_lat = COALESCE(departure_lat, ?), departure_lng = COALESCE(departure_lng, ?),
            arrival_lat = COALESCE(arrival_lat, ?), arrival_lng = COALESCE(arrival_lng, ?)
            WHERE id = ?""",
            (
                departure[0] if departure else None,
                departure[1] if departure else None,
                arrival[0] if arrival else None,
                arrival[1] if arrival else None,
                flight["id"],
            ),
        )


def reset_trip(db):
    db.execute("DELETE FROM trips WHERE slug = ?", (TRIP["slug"],))
    db.execute(
        """INSERT INTO trips
        (slug, title, subtitle, start_date, end_date, travelers, origin, summary, car, car_image_url, accommodations)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            TRIP["slug"], TRIP["title"], TRIP["subtitle"], TRIP["start_date"], TRIP["end_date"],
            TRIP["travelers"], TRIP["origin"], TRIP["summary"], TRIP["car"], TRIP["car_image_url"],
            json.dumps(TRIP["accommodations"], ensure_ascii=False),
        ),
    )
    db.executemany(
        """INSERT INTO nodes
        (id, trip_slug, title, description, type, time, day, date, city, address, lat, lng, status, image_url, image_urls)
        VALUES (:id, :trip_slug, :title, :description, :type, :time, :day, :date, :city, :address, :lat, :lng, :status, :image_url, :image_urls)""",
        [
            {
                **item,
                "trip_slug": TRIP["slug"],
                "address": "",
                "image_urls": json.dumps([item["image_url"]] if item.get("image_url") else []),
            }
            for item in NODES
        ],
    )
    db.executemany(
        """INSERT INTO edges
        (id, trip_slug, source, target, transport_type, duration, distance)
        VALUES (:id, :trip_slug, :source, :target, :transport_type, :duration, :distance)""",
        [{**item, "trip_slug": TRIP["slug"]} for item in EDGES],
    )


def row_to_node(row):
    item = dict(row)
    item["image_urls"] = json.loads(item.get("image_urls") or "[]")
    if not item["image_urls"] and item.get("image_url"):
        item["image_urls"] = [item["image_url"]]
    return item


def row_to_edge(row):
    item = dict(row)
    item["transportType"] = item.pop("transport_type")
    return item


def serialize_trip(db, slug):
    trip = db.execute("SELECT * FROM trips WHERE slug = ?", (slug,)).fetchone()
    if not trip:
        return None
    result = dict(trip)
    result["accommodations"] = json.loads(result["accommodations"])
    result["nodes"] = [
        row_to_node(row)
        for row in db.execute(
            """SELECT id, title, description, type, time, day, date, city, address, lat, lng, status,
            image_url, image_urls, transport_mode, departure_place, arrival_place, arrival_time,
            arrival_date, service_number, duration, departure_lat, departure_lng, arrival_lat, arrival_lng
            FROM nodes WHERE trip_slug = ? ORDER BY day, time""",
            (slug,),
        )
    ]
    result["edges"] = [
        row_to_edge(row)
        for row in db.execute(
            "SELECT id, source, target, transport_type, duration, distance FROM edges WHERE trip_slug = ? ORDER BY rowid",
            (slug,),
        )
    ]
    return result


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/trips")
def list_trips():
    with connection() as db:
        trips = []
        for row in db.execute("SELECT * FROM trips ORDER BY start_date DESC"):
            trip = dict(row)
            trip["accommodations"] = json.loads(trip["accommodations"])
            nodes = list(
                db.execute(
                    """SELECT title, city, day, lat, lng, image_url, type
                    FROM nodes WHERE trip_slug = ? ORDER BY day, time""",
                    (trip["slug"],),
                )
            )
            map_nodes = [node for node in nodes if node["type"] != "transport"] or nodes
            cover_node = next((node for node in map_nodes if node["image_url"]), None)
            trip.update(
                {
                    "node_count": len(nodes),
                    "day_count": max((node["day"] for node in nodes), default=0),
                    "center_lat": sum(node["lat"] for node in map_nodes) / len(map_nodes) if map_nodes else 0,
                    "center_lng": sum(node["lng"] for node in map_nodes) / len(map_nodes) if map_nodes else 0,
                    "cover_image_url": cover_node["image_url"] if cover_node else trip["car_image_url"],
                    "cities": list(dict.fromkeys(node["city"] for node in nodes if node["city"]))[:5],
                }
            )
            trips.append(trip)
    return jsonify(trips)


@app.post("/api/trips")
def create_trip():
    payload = request.get_json(force=True)
    title = str(payload.get("title", "")).strip()
    start_date = str(payload.get("start_date", "")).strip()
    end_date = str(payload.get("end_date", "")).strip()
    if not title or not start_date or not end_date:
        return jsonify({"error": "请填写旅行名称、开始日期和结束日期"}), 400
    slug_base = "".join(char.lower() if char.isalnum() else "-" for char in title).strip("-") or "trip"
    slug = f"{slug_base}-{uuid.uuid4().hex[:6]}"
    with connection() as db:
        db.execute(
            """INSERT INTO trips
            (slug, title, subtitle, start_date, end_date, travelers, origin, summary, car, car_image_url, accommodations)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '[]')""",
            (
                slug,
                title,
                str(payload.get("subtitle", "")).strip() or "新的旅行计划",
                start_date,
                end_date,
                max(1, int(payload.get("travelers", 1))),
                str(payload.get("origin", "")).strip(),
                str(payload.get("summary", "")).strip() or "这段旅行正在规划中。",
                str(payload.get("car", "")).strip() or "待补充",
            ),
        )
        trip = serialize_trip(db, slug)
    return jsonify(trip), 201


@app.get("/api/trips/<slug>")
def get_trip(slug):
    with connection() as db:
        trip = serialize_trip(db, slug)
    return jsonify(trip) if trip else (jsonify({"error": "Trip not found"}), 404)


def nominatim_request(path, params):
    url = f"https://nominatim.openstreetmap.org/{path}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "VoyagePlanner/1.0 (personal travel planner)"})
    with urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


@app.get("/api/geocode/search-legacy")
def geocode_search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])
    try:
        results = nominatim_request(
            "search",
            {"q": query, "format": "jsonv2", "addressdetails": 1, "limit": 6, "accept-language": "zh-CN,en"},
        )
    except Exception:
        return jsonify({"error": "地点搜索服务暂时不可用"}), 502
    return jsonify(
        [
            {
                "name": item.get("name") or item["display_name"].split(",")[0],
                "display_name": item["display_name"],
                "lat": float(item["lat"]),
                "lng": float(item["lon"]),
                "city": next(
                    (
                        item.get("address", {}).get(key)
                        for key in ("city", "town", "village", "municipality", "county", "state")
                        if item.get("address", {}).get(key)
                    ),
                    "",
                ),
            }
            for item in results
        ]
    )


@app.get("/api/geocode/reverse-legacy")
def geocode_reverse():
    try:
        lat = float(request.args["lat"])
        lng = float(request.args["lng"])
        item = nominatim_request(
            "reverse",
            {"lat": lat, "lon": lng, "format": "jsonv2", "addressdetails": 1, "accept-language": "zh-CN,en"},
        )
    except (KeyError, ValueError):
        return jsonify({"error": "无效坐标"}), 400
    except Exception:
        return jsonify({"error": "地址查询服务暂时不可用"}), 502
    address = item.get("address", {})
    city = next((address.get(key) for key in ("city", "town", "village", "municipality", "county", "state") if address.get(key)), "")
    return jsonify({"display_name": item.get("display_name", ""), "city": city})


def cached_geocode(key, ttl, loader):
    serialized_key = json.dumps(key, ensure_ascii=False, separators=(",", ":"))
    cached = GEOCODE_CACHE.get(key)
    if cached and time.monotonic() - cached[0] < ttl:
        return cached[1]

    with connection() as db:
        stored = db.execute(
            "SELECT payload FROM geocode_cache WHERE cache_key = ? AND expires_at > ?",
            (serialized_key, time.time()),
        ).fetchone()
    if stored:
        value = json.loads(stored["payload"])
        GEOCODE_CACHE[key] = (time.monotonic(), value)
        return value

    value = loader()
    if len(GEOCODE_CACHE) >= 500:
        GEOCODE_CACHE.pop(next(iter(GEOCODE_CACHE)))
    GEOCODE_CACHE[key] = (time.monotonic(), value)
    with connection() as db:
        db.execute(
            """INSERT INTO geocode_cache (cache_key, payload, expires_at)
            VALUES (?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, expires_at=excluded.expires_at""",
            (serialized_key, json.dumps(value, ensure_ascii=False), time.time() + ttl),
        )
    return value


def json_request(url, params, headers=None):
    req = Request(
        f"{url}?{urlencode(params)}",
        headers=headers or {"User-Agent": "VoyagePlanner/1.0 (personal travel planner)"},
    )
    with urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def amap_request(path, params):
    if not AMAP_WEB_SERVICE_KEY:
        raise RuntimeError("AMAP_WEB_SERVICE_KEY is not configured")
    result = json_request(
        f"https://restapi.amap.com/v3/{path}",
        {**params, "key": AMAP_WEB_SERVICE_KEY},
    )
    if result.get("status") != "1":
        raise RuntimeError(result.get("info") or "Amap request failed")
    return result


def outside_china(lat, lng):
    return not (72.004 <= lng <= 137.8347 and 0.8293 <= lat <= 55.8271)


def coordinate_delta(lat, lng):
    x = lng - 105.0
    y = lat - 35.0
    lat_delta = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    lat_delta += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    lat_delta += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    lat_delta += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    lng_delta = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    lng_delta += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    lng_delta += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    lng_delta += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    rad_lat = lat / 180.0 * math.pi
    magic = 1 - 0.00669342162296594323 * math.sin(rad_lat) ** 2
    sqrt_magic = math.sqrt(magic)
    lat_delta = (lat_delta * 180.0) / ((6335552.717000426 / (magic * sqrt_magic)) * math.pi)
    lng_delta = (lng_delta * 180.0) / ((6378245.0 / sqrt_magic) * math.cos(rad_lat) * math.pi)
    return lat_delta, lng_delta


def wgs84_to_gcj02(lat, lng):
    if outside_china(lat, lng):
        return lat, lng
    lat_delta, lng_delta = coordinate_delta(lat, lng)
    return lat + lat_delta, lng + lng_delta


def gcj02_to_wgs84(lat, lng):
    if outside_china(lat, lng):
        return lat, lng
    converted_lat, converted_lng = wgs84_to_gcj02(lat, lng)
    return lat * 2 - converted_lat, lng * 2 - converted_lng


def amap_text(value):
    return value if isinstance(value, str) else ""


def nominatim_search(query):
    results = nominatim_request(
        "search",
        {"q": query, "format": "jsonv2", "addressdetails": 1, "limit": 6, "accept-language": "zh-CN,en"},
    )
    return [
        {
            "name": item.get("name") or item["display_name"].split(",")[0],
            "display_name": item["display_name"],
            "lat": float(item["lat"]),
            "lng": float(item["lon"]),
            "city": next(
                (
                    item.get("address", {}).get(key)
                    for key in ("city", "town", "village", "municipality", "county", "state")
                    if item.get("address", {}).get(key)
                ),
                "",
            ),
            "provider": "osm",
        }
        for item in results
    ]


def photon_display_name(properties):
    return ", ".join(
        dict.fromkeys(
            str(properties.get(key, "")).strip()
            for key in ("name", "street", "city", "county", "state", "country")
            if str(properties.get(key, "")).strip()
        )
    )


def photon_search(query):
    result = json_request("https://photon.komoot.io/api/", {"q": query, "limit": 6, "lang": "en"})
    payload = []
    for feature in result.get("features", []):
        properties = feature.get("properties", {})
        coordinates = feature.get("geometry", {}).get("coordinates", [])
        if len(coordinates) < 2:
            continue
        payload.append(
            {
                "name": properties.get("name") or properties.get("city") or query,
                "display_name": photon_display_name(properties),
                "lat": float(coordinates[1]),
                "lng": float(coordinates[0]),
                "city": properties.get("city") or properties.get("county") or properties.get("state") or "",
                "provider": "osm",
            }
        )
    return payload


def overseas_search(query):
    if OVERSEAS_GEOCODE_PROVIDER == "photon":
        return photon_search(query)
    try:
        return nominatim_search(query)
    except Exception:
        return photon_search(query)


def overseas_reverse(lat, lng):
    if OVERSEAS_GEOCODE_PROVIDER != "photon":
        try:
            item = nominatim_request(
                "reverse",
                {"lat": lat, "lon": lng, "format": "jsonv2", "addressdetails": 1, "accept-language": "zh-CN,en"},
            )
            address = item.get("address", {})
            city = next((address.get(key) for key in ("city", "town", "village", "municipality", "county", "state") if address.get(key)), "")
            return {"display_name": item.get("display_name", ""), "city": city, "provider": "osm"}
        except Exception:
            pass
    result = json_request("https://photon.komoot.io/reverse", {"lat": lat, "lon": lng, "lang": "en"})
    feature = next(iter(result.get("features", [])), {})
    properties = feature.get("properties", {})
    return {
        "display_name": photon_display_name(properties),
        "city": properties.get("city") or properties.get("county") or properties.get("state") or "",
        "provider": "osm",
    }


@app.get("/api/geocode/search")
def hybrid_geocode_search():
    query = request.args.get("q", "").strip()
    provider = request.args.get("provider", "osm").strip().lower()
    if len(query) < 2:
        return jsonify([])
    try:
        if provider == "amap":
            results = cached_geocode(
                ("search", "amap", query.casefold()),
                GEOCODE_CACHE_TTL,
                lambda: amap_request(
                    "place/text",
                    {"keywords": query, "offset": 6, "page": 1, "extensions": "base"},
                ).get("pois", []),
            )
            payload = []
            for item in results:
                location = amap_text(item.get("location"))
                if not location or "," not in location:
                    continue
                lng, lat = (float(part) for part in location.split(",", 1))
                lat, lng = gcj02_to_wgs84(lat, lng)
                city = amap_text(item.get("cityname")) or amap_text(item.get("pname"))
                address = amap_text(item.get("address"))
                payload.append(
                    {
                        "name": amap_text(item.get("name")),
                        "display_name": " · ".join(part for part in (city, address) if part),
                        "lat": lat,
                        "lng": lng,
                        "city": city,
                        "provider": "amap",
                    }
                )
            return jsonify(payload)

        return jsonify(cached_geocode(
            ("search", "osm", OVERSEAS_GEOCODE_PROVIDER, query.casefold()),
            GEOCODE_CACHE_TTL,
            lambda: overseas_search(query),
        ))
    except Exception:
        return jsonify({"error": "地点搜索服务暂时不可用"}), 502


@app.get("/api/geocode/reverse")
def hybrid_geocode_reverse():
    try:
        lat = float(request.args["lat"])
        lng = float(request.args["lng"])
        provider = request.args.get("provider", "osm").strip().lower()
        cache_key = ("reverse", provider, round(lat, 4), round(lng, 4))
        if provider == "amap":
            gcj_lat, gcj_lng = wgs84_to_gcj02(lat, lng)
            item = cached_geocode(
                cache_key,
                REVERSE_CACHE_TTL,
                lambda: amap_request(
                    "geocode/regeo",
                    {"location": f"{gcj_lng},{gcj_lat}", "extensions": "base"},
                ).get("regeocode", {}),
            )
            component = item.get("addressComponent", {})
            city = amap_text(component.get("city")) or amap_text(component.get("province"))
            return jsonify(
                {
                    "display_name": amap_text(item.get("formatted_address")),
                    "city": city,
                    "provider": "amap",
                }
            )

        return jsonify(cached_geocode(
            ("reverse", provider, OVERSEAS_GEOCODE_PROVIDER, round(lat, 4), round(lng, 4)),
            REVERSE_CACHE_TTL,
            lambda: overseas_reverse(lat, lng),
        ))
    except (KeyError, ValueError):
        return jsonify({"error": "无效坐标"}), 400
    except Exception:
        return jsonify({"error": "地址查询服务暂时不可用"}), 502


@app.post("/api/trips/<slug>/images")
def upload_trip_image(slug):
    with connection() as db:
        if not db.execute("SELECT 1 FROM trips WHERE slug = ?", (slug,)).fetchone():
            return jsonify({"error": "Trip not found"}), 404

    image = request.files.get("image")
    if not image or not image.filename:
        return jsonify({"error": "请选择图片文件"}), 400

    extension = Path(secure_filename(image.filename)).suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({"error": "仅支持 JPG、PNG、WebP 或 GIF 图片"}), 400

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{slug}-{uuid.uuid4().hex}{extension}"
    image.save(UPLOAD_DIR / filename)
    return jsonify({"url": f"/uploads/{filename}"}), 201


@app.get("/uploads/<path:filename>")
def uploaded_image(filename):
    return send_from_directory(UPLOAD_DIR, filename)


def node_payload(payload, existing=None):
    source = {**(dict(existing) if existing else {}), **payload}
    required = ("title", "type", "time", "day", "date", "lat", "lng", "status")
    if any(source.get(key) in (None, "") for key in required):
        raise ValueError("Missing required node fields")
    image_urls = source.get("image_urls")
    if isinstance(image_urls, str):
        try:
            image_urls = json.loads(image_urls)
        except json.JSONDecodeError:
            image_urls = [image_urls]
    image_urls = [str(url).strip() for url in (image_urls or []) if str(url).strip()]
    legacy_image = str(source.get("image_url", "")).strip()
    if legacy_image and legacy_image not in image_urls:
        image_urls.insert(0, legacy_image)

    return {
        "title": str(source["title"]).strip(),
        "description": str(source.get("description", "")).strip(),
        "type": source["type"],
        "time": source["time"],
        "day": int(source["day"]),
        "date": source["date"],
        "city": str(source.get("city", "")).strip(),
        "address": str(source.get("address", "")).strip(),
        "lat": float(source["lat"]),
        "lng": float(source["lng"]),
        "status": source["status"],
        "image_url": image_urls[0] if image_urls else "",
        "image_urls": json.dumps(image_urls, ensure_ascii=False),
        "transport_mode": str(source.get("transport_mode", "")).strip(),
        "departure_place": str(source.get("departure_place", "")).strip(),
        "arrival_place": str(source.get("arrival_place", "")).strip(),
        "arrival_time": str(source.get("arrival_time", "")).strip(),
        "arrival_date": str(source.get("arrival_date", "")).strip(),
        "service_number": str(source.get("service_number", "")).strip(),
        "duration": str(source.get("duration", "")).strip(),
        "departure_lat": float(source["departure_lat"]) if source.get("departure_lat") not in (None, "") else None,
        "departure_lng": float(source["departure_lng"]) if source.get("departure_lng") not in (None, "") else None,
        "arrival_lat": float(source["arrival_lat"]) if source.get("arrival_lat") not in (None, "") else None,
        "arrival_lng": float(source["arrival_lng"]) if source.get("arrival_lng") not in (None, "") else None,
    }


@app.post("/api/trips/<slug>/nodes")
def create_node(slug):
    payload = request.get_json(force=True)
    try:
        item = node_payload(payload)
    except (ValueError, TypeError) as error:
        return jsonify({"error": str(error)}), 400
    node_id = payload.get("id") or f"node-{os.urandom(6).hex()}"
    with connection() as db:
        db.execute(
            """INSERT INTO nodes
            (id, trip_slug, title, description, type, time, day, date, city, address, lat, lng, status, image_url, image_urls,
            transport_mode, departure_place, arrival_place, arrival_time, arrival_date, service_number, duration,
            departure_lat, departure_lng, arrival_lat, arrival_lng)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (node_id, slug, *item.values()),
        )
    return jsonify(row_to_node({"id": node_id, **item})), 201


@app.put("/api/trips/<slug>/nodes/<node_id>")
def update_node(slug, node_id):
    payload = request.get_json(force=True)
    with connection() as db:
        existing = db.execute("SELECT * FROM nodes WHERE id = ? AND trip_slug = ?", (node_id, slug)).fetchone()
        if not existing:
            return jsonify({"error": "Node not found"}), 404
        try:
            item = node_payload(payload, existing)
        except (ValueError, TypeError) as error:
            return jsonify({"error": str(error)}), 400
        db.execute(
            """UPDATE nodes SET title=?, description=?, type=?, time=?, day=?, date=?, city=?, address=?, lat=?, lng=?, status=?, image_url=?, image_urls=?,
            transport_mode=?, departure_place=?, arrival_place=?, arrival_time=?, arrival_date=?, service_number=?, duration=?,
            departure_lat=?, departure_lng=?, arrival_lat=?, arrival_lng=?
            WHERE id=? AND trip_slug=?""",
            (*item.values(), node_id, slug),
        )
    return jsonify(row_to_node({"id": node_id, **item}))


@app.delete("/api/trips/<slug>/nodes/<node_id>")
def delete_node(slug, node_id):
    with connection() as db:
        result = db.execute("DELETE FROM nodes WHERE id = ? AND trip_slug = ?", (node_id, slug))
    return ("", 204) if result.rowcount else (jsonify({"error": "Node not found"}), 404)


@app.post("/api/trips/<slug>/auto-connect")
def auto_connect(slug):
    with connection() as db:
        nodes = list(db.execute("SELECT id, day, lat, lng FROM nodes WHERE trip_slug = ? AND type NOT IN ('transport', 'transfer') ORDER BY day, time", (slug,)))
        db.execute("DELETE FROM edges WHERE trip_slug = ?", (slug,))
        generated = []
        for index, current in enumerate(nodes[:-1]):
            following = nodes[index + 1]
            if current["day"] != following["day"]:
                continue
            km = math.sqrt((current["lat"] - following["lat"]) ** 2 + (current["lng"] - following["lng"]) ** 2) * 85
            transport_type = "walk" if km < 2 else "car"
            duration = f"{max(5, round(km * (15 if transport_type == 'walk' else 1.3)))} min"
            generated.append(
                {
                    "id": f"auto-{current['id']}-{following['id']}",
                    "trip_slug": slug,
                    "source": current["id"],
                    "target": following["id"],
                    "transport_type": transport_type,
                    "duration": duration,
                    "distance": f"{km:.1f} km",
                }
            )
        db.executemany(
            """INSERT INTO edges (id, trip_slug, source, target, transport_type, duration, distance)
            VALUES (:id, :trip_slug, :source, :target, :transport_type, :duration, :distance)""",
            generated,
        )
        trip = serialize_trip(db, slug)
    return jsonify(trip)


@app.post("/api/trips/<slug>/reset")
def reset(slug):
    if slug != TRIP["slug"]:
        return jsonify({"error": "Trip not found"}), 404
    with connection() as db:
        reset_trip(db)
        trip = serialize_trip(db, slug)
    return jsonify(trip)


@app.get("/")
@app.get("/<path:path>")
def serve_spa(path=""):
    target = DIST_DIR / path
    if path and target.exists() and target.is_file():
        return send_from_directory(DIST_DIR, path)
    if (DIST_DIR / "index.html").exists():
        return send_from_directory(DIST_DIR, "index.html")
    return jsonify({"message": "Frontend has not been built yet. Run npm run build."}), 404


init_database()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")), debug=os.environ.get("FLASK_DEBUG") == "1")
