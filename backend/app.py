import datetime
import json
import math
import os
import re
import sqlite3
import time
import uuid
from pathlib import Path
from urllib.parse import unquote, urlencode, urlparse
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from backend.seed_data import EDGES, NODES, TRIP


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent


load_dotenv(PROJECT_DIR / ".env", override=False)


def project_path(value, default):
    path = Path(value) if value else Path(default)
    return path if path.is_absolute() else PROJECT_DIR / path


DIST_DIR = PROJECT_DIR / "dist"
DATABASE = project_path(os.environ.get("DATABASE_PATH"), BASE_DIR / "voyageplanner.db")
UPLOAD_DIR = project_path(os.environ.get("UPLOAD_DIR"), DATABASE.parent / "uploads")
AMAP_WEB_SERVICE_KEY = os.environ.get("AMAP_WEB_SERVICE_KEY", "")
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("GOOGLE_PLACES_API_KEY", "")
OVERSEAS_GEOCODE_PROVIDER = os.environ.get("OVERSEAS_GEOCODE_PROVIDER", "nominatim").lower()
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024
GEOCODE_CACHE_TTL = 24 * 60 * 60
REVERSE_CACHE_TTL = 7 * 24 * 60 * 60
ROUTE_CACHE_TTL = 29 * 24 * 60 * 60
GEOCODE_CACHE = {}
EDGE_TRANSPORT_TYPES = {"walk", "car", "taxi", "transit", "bus", "subway", "train", "high_speed_rail", "ferry", "other"}
EDGE_ROUTE_PREFERENCES = {"recommended", "fastest", "shortest", "avoid_tolls", "avoid_highways"}
EDGE_DISPLAY_STATUSES = {"visible", "hidden"}
EDGE_ANCHORS = {"place", "departure", "arrival"}
EDGE_LINK_KINDS = {"connection", "transport_leg"}
ACTIVITY_SUBTYPES = {"sightseeing", "meal", "shopping", "leisure", "tour", "ticketed_event", "layover", "errand", "buffer", "other"}
LEGACY_ACTIVITY_SUBTYPES = {
    "sightseeing": "sightseeing",
    "restaurant": "meal",
    "shopping": "shopping",
    "leisure": "leisure",
    "transfer": "layover",
}
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


def table_columns(db, table):
    return {row[1] for row in db.execute(f"PRAGMA table_info({table})")}


def add_column_if_missing(db, table, column, definition):
    if column in table_columns(db, table):
        return False
    try:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        return True
    except sqlite3.OperationalError as error:
        if "duplicate column name" in str(error).lower():
            return False
        raise


def point_in_mainland_china(lat, lng):
    return 72.004 <= lng <= 137.8347 and 0.8293 <= lat <= 55.8271


def infer_trip_map_defaults(db):
    trips = db.execute("SELECT slug FROM trips").fetchall()
    for trip in trips:
        nodes = db.execute(
            "SELECT lat, lng FROM nodes WHERE trip_slug = ? AND lat IS NOT NULL AND lng IS NOT NULL",
            (trip["slug"],),
        ).fetchall()
        domestic_count = sum(1 for node in nodes if point_in_mainland_china(node["lat"], node["lng"]))
        is_domestic = bool(nodes) and domestic_count / len(nodes) >= 0.6
        db.execute(
            """UPDATE trips SET
            trip_region = ?,
            map_provider = ?,
            coord_system = ?
            WHERE slug = ?""",
            (
                "domestic" if is_domestic else "overseas",
                "amap" if is_domestic else "google",
                "gcj02" if is_domestic else "wgs84",
                trip["slug"],
            ),
        )


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
                trip_region TEXT NOT NULL DEFAULT 'overseas',
                map_provider TEXT NOT NULL DEFAULT 'google',
                coord_system TEXT NOT NULL DEFAULT 'wgs84',
                accommodations TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY,
                trip_slug TEXT NOT NULL REFERENCES trips(slug) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                type TEXT NOT NULL,
                activity_subtype TEXT NOT NULL DEFAULT 'sightseeing',
                time TEXT NOT NULL,
                day INTEGER NOT NULL,
                date TEXT NOT NULL,
                end_time TEXT NOT NULL DEFAULT '',
                end_day INTEGER NOT NULL DEFAULT 0,
                end_date TEXT NOT NULL DEFAULT '',
                timezone TEXT NOT NULL DEFAULT '',
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
                ,departure_timezone TEXT NOT NULL DEFAULT ''
                ,arrival_timezone TEXT NOT NULL DEFAULT ''
                ,arrival_time TEXT NOT NULL DEFAULT ''
                ,arrival_date TEXT NOT NULL DEFAULT ''
                ,service_number TEXT NOT NULL DEFAULT ''
                ,duration TEXT NOT NULL DEFAULT ''
                ,departure_lat REAL
                ,departure_lng REAL
                ,arrival_lat REAL
                ,arrival_lng REAL
                ,place_provider TEXT NOT NULL DEFAULT 'manual'
                ,provider_place_id TEXT NOT NULL DEFAULT ''
                ,coord_system TEXT NOT NULL DEFAULT 'wgs84'
                ,departure_place_provider TEXT NOT NULL DEFAULT 'manual'
                ,departure_provider_place_id TEXT NOT NULL DEFAULT ''
                ,arrival_place_provider TEXT NOT NULL DEFAULT 'manual'
                ,arrival_provider_place_id TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS edges (
                id TEXT PRIMARY KEY,
                trip_slug TEXT NOT NULL REFERENCES trips(slug) ON DELETE CASCADE,
                source TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                target TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                source_anchor TEXT NOT NULL DEFAULT 'place',
                target_anchor TEXT NOT NULL DEFAULT 'place',
                link_kind TEXT NOT NULL DEFAULT 'connection',
                transport_type TEXT NOT NULL DEFAULT 'car',
                route_preference TEXT NOT NULL DEFAULT 'recommended',
                is_manual INTEGER NOT NULL DEFAULT 0,
                is_locked INTEGER NOT NULL DEFAULT 0,
                display_status TEXT NOT NULL DEFAULT 'visible',
                duration TEXT,
                distance TEXT
            );
            CREATE TABLE IF NOT EXISTS geocode_cache (
                cache_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS route_segments (
                id TEXT PRIMARY KEY,
                trip_slug TEXT NOT NULL REFERENCES trips(slug) ON DELETE CASCADE,
                link_type TEXT NOT NULL,
                link_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                travel_mode TEXT NOT NULL,
                origin_lat REAL NOT NULL,
                origin_lng REAL NOT NULL,
                destination_lat REAL NOT NULL,
                destination_lng REAL NOT NULL,
                request_fingerprint TEXT NOT NULL,
                geometry_format TEXT NOT NULL DEFAULT 'latlng_json',
                geometry_json TEXT NOT NULL DEFAULT '[]',
                coord_system TEXT NOT NULL DEFAULT 'wgs84',
                distance_meters INTEGER,
                duration_seconds INTEGER,
                distance_text TEXT NOT NULL DEFAULT '',
                duration_text TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'fresh',
                expires_at REAL NOT NULL DEFAULT 0,
                error_message TEXT NOT NULL DEFAULT '',
                requested_at REAL NOT NULL DEFAULT 0,
                UNIQUE(trip_slug, link_type, link_id)
            );
            CREATE TABLE IF NOT EXISTS lodgings (
                id TEXT PRIMARY KEY,
                trip_slug TEXT NOT NULL REFERENCES trips(slug) ON DELETE CASCADE,
                name TEXT NOT NULL,
                address TEXT NOT NULL DEFAULT '',
                city TEXT NOT NULL DEFAULT '',
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                timezone TEXT NOT NULL DEFAULT '',
                image_url TEXT NOT NULL DEFAULT '',
                image_urls TEXT NOT NULL DEFAULT '[]',
                booking_site TEXT NOT NULL DEFAULT '',
                reservation_no TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                place_provider TEXT NOT NULL DEFAULT 'manual',
                provider_place_id TEXT NOT NULL DEFAULT '',
                coord_system TEXT NOT NULL DEFAULT 'wgs84'
            );
            CREATE TABLE IF NOT EXISTS stays (
                id TEXT PRIMARY KEY,
                trip_slug TEXT NOT NULL REFERENCES trips(slug) ON DELETE CASCADE,
                lodging_id TEXT NOT NULL REFERENCES lodgings(id) ON DELETE CASCADE,
                check_in_day INTEGER NOT NULL,
                check_in_date TEXT NOT NULL,
                check_in_time TEXT NOT NULL,
                check_out_day INTEGER NOT NULL,
                check_out_date TEXT NOT NULL,
                check_out_time TEXT NOT NULL,
                guests INTEGER NOT NULL DEFAULT 0,
                room_type TEXT NOT NULL DEFAULT '',
                price TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'planned',
                notes TEXT NOT NULL DEFAULT ''
            );
            """
        )
        count = db.execute("SELECT COUNT(*) FROM trips").fetchone()[0]
        add_column_if_missing(db, "trips", "car_image_url", "TEXT NOT NULL DEFAULT ''")
        trip_map_columns_added = False
        for column, definition in (
            ("trip_region", "TEXT NOT NULL DEFAULT 'overseas'"),
            ("map_provider", "TEXT NOT NULL DEFAULT 'google'"),
            ("coord_system", "TEXT NOT NULL DEFAULT 'wgs84'"),
        ):
            trip_map_columns_added = add_column_if_missing(db, "trips", column, definition) or trip_map_columns_added
        add_column_if_missing(db, "nodes", "image_url", "TEXT NOT NULL DEFAULT ''")
        add_column_if_missing(db, "nodes", "activity_subtype", "TEXT NOT NULL DEFAULT 'sightseeing'")
        if add_column_if_missing(db, "nodes", "image_urls", "TEXT NOT NULL DEFAULT '[]'"):
            db.execute(
                "UPDATE nodes SET image_urls = json_array(image_url) WHERE image_url != ''"
            )
        add_column_if_missing(db, "nodes", "address", "TEXT NOT NULL DEFAULT ''")
        for column in (
            "transport_mode",
            "departure_place",
            "arrival_place",
            "arrival_time",
            "arrival_date",
            "service_number",
            "duration",
        ):
            add_column_if_missing(db, "nodes", column, "TEXT NOT NULL DEFAULT ''")
        for column in ("end_time", "end_date"):
            add_column_if_missing(db, "nodes", column, "TEXT NOT NULL DEFAULT ''")
        add_column_if_missing(db, "nodes", "end_day", "INTEGER NOT NULL DEFAULT 0")
        for column in ("timezone", "departure_timezone", "arrival_timezone"):
            add_column_if_missing(db, "nodes", column, "TEXT NOT NULL DEFAULT ''")
        for column in ("departure_lat", "departure_lng", "arrival_lat", "arrival_lng"):
            add_column_if_missing(db, "nodes", column, "REAL")
        for column, definition in (
            ("place_provider", "TEXT NOT NULL DEFAULT 'manual'"),
            ("provider_place_id", "TEXT NOT NULL DEFAULT ''"),
            ("coord_system", "TEXT NOT NULL DEFAULT 'wgs84'"),
            ("departure_place_provider", "TEXT NOT NULL DEFAULT 'manual'"),
            ("departure_provider_place_id", "TEXT NOT NULL DEFAULT ''"),
            ("arrival_place_provider", "TEXT NOT NULL DEFAULT 'manual'"),
            ("arrival_provider_place_id", "TEXT NOT NULL DEFAULT ''"),
        ):
            add_column_if_missing(db, "nodes", column, definition)
        for column, definition in (
            ("source_anchor", "TEXT NOT NULL DEFAULT 'place'"),
            ("target_anchor", "TEXT NOT NULL DEFAULT 'place'"),
            ("link_kind", "TEXT NOT NULL DEFAULT 'connection'"),
            ("route_preference", "TEXT NOT NULL DEFAULT 'recommended'"),
            ("is_manual", "INTEGER NOT NULL DEFAULT 0"),
            ("is_locked", "INTEGER NOT NULL DEFAULT 0"),
            ("display_status", "TEXT NOT NULL DEFAULT 'visible'"),
        ):
            add_column_if_missing(db, "edges", column, definition)
        if trip_map_columns_added:
            infer_trip_map_defaults(db)
        migrate_journey_routes(db)
        migrate_accommodations_to_stays(db)
        migrate_activity_nodes(db)
        if count == 0:
            reset_trip(db)
            migrate_journey_routes(db)
            migrate_accommodations_to_stays(db)
            migrate_activity_nodes(db)


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


def normalize_activity_subtype(node_type, activity_subtype):
    subtype = str(activity_subtype or "").strip()
    if subtype in ACTIVITY_SUBTYPES:
        return subtype
    legacy = LEGACY_ACTIVITY_SUBTYPES.get(str(node_type or "").strip())
    return legacy or "sightseeing"


def normalize_node_type(node_type):
    value = str(node_type or "").strip()
    if value == "transport":
        return "transport"
    if value == "hotel":
        return "hotel"
    return "activity"


def migrate_activity_nodes(db):
    db.execute("UPDATE nodes SET activity_subtype = '' WHERE type = 'transport'")
    db.execute("UPDATE nodes SET activity_subtype = 'other' WHERE type = 'hotel'")
    for legacy_type, subtype in LEGACY_ACTIVITY_SUBTYPES.items():
        db.execute(
            """UPDATE nodes SET type = 'activity', activity_subtype = ?
            WHERE type = ?""",
            (subtype, legacy_type),
        )
    db.execute(
        """UPDATE nodes SET activity_subtype = 'sightseeing'
        WHERE type = 'activity' AND activity_subtype NOT IN
        ('sightseeing', 'meal', 'shopping', 'leisure', 'tour', 'ticketed_event', 'layover', 'errand', 'buffer', 'other')"""
    )


def trip_day_for_date(trip_start_date, value):
    try:
        start = datetime.date.fromisoformat(str(trip_start_date))
        current = datetime.date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return 0
    return max(1, (current - start).days + 1)


def parse_accommodation_range(dates_text, trip_start_date):
    year = int(str(trip_start_date or datetime.date.today().year)[:4])
    matches = re.findall(r"(\d{1,2})\s*月\s*(\d{1,2})\s*日", str(dates_text or ""))
    if len(matches) < 2:
        return None
    start_month, start_day = [int(value) for value in matches[0]]
    end_month, end_day = [int(value) for value in matches[1]]
    try:
        check_in = datetime.date(year, start_month, start_day).isoformat()
        check_out = datetime.date(year, end_month, end_day).isoformat()
    except ValueError:
        return None
    return {
        "check_in_date": check_in,
        "check_out_date": check_out,
        "check_in_day": trip_day_for_date(trip_start_date, check_in),
        "check_out_day": trip_day_for_date(trip_start_date, check_out),
    }


def best_lodging_coordinates(db, trip_slug, stay):
    text = " ".join(
        str(stay.get(key, ""))
        for key in ("name", "address", "details")
    ).lower()
    rows = db.execute(
        """SELECT title, description, city, address, lat, lng, timezone, place_provider, provider_place_id, coord_system
        FROM nodes WHERE trip_slug = ? AND type = 'hotel'""",
        (trip_slug,),
    ).fetchall()
    if not rows:
        return None
    scored = []
    for row in rows:
        row_text = " ".join(str(row[key] or "") for key in ("title", "description", "city", "address")).lower()
        score = 0
        for token in re.findall(r"[\w\u4e00-\u9fff]+", text):
            if len(token) >= 2 and token in row_text:
                score += len(token)
        scored.append((score, row))
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1] if scored and scored[0][0] > 0 else rows[0]


def migrate_accommodations_to_stays(db):
    trips = db.execute("SELECT slug, start_date, accommodations FROM trips").fetchall()
    for trip in trips:
        existing_count = db.execute("SELECT COUNT(*) FROM lodgings WHERE trip_slug = ?", (trip["slug"],)).fetchone()[0]
        if existing_count:
            continue
        try:
            stays = json.loads(trip["accommodations"] or "[]")
        except json.JSONDecodeError:
            stays = []
        for index, stay in enumerate(stays):
            if not isinstance(stay, dict) or not stay.get("name"):
                continue
            matched_node = best_lodging_coordinates(db, trip["slug"], stay)
            lodging_id = f"lodging-{uuid.uuid4().hex[:12]}"
            image_urls = [stay.get("image_url")] if stay.get("image_url") else []
            db.execute(
                """INSERT INTO lodgings
                (id, trip_slug, name, address, city, lat, lng, timezone, image_url, image_urls,
                booking_site, reservation_no, notes, place_provider, provider_place_id, coord_system)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    lodging_id,
                    trip["slug"],
                    str(stay.get("name", "")).strip(),
                    str(stay.get("address", "")).strip(),
                    str(matched_node["city"] if matched_node else "").strip(),
                    float(matched_node["lat"] if matched_node else 0),
                    float(matched_node["lng"] if matched_node else 0),
                    str(matched_node["timezone"] if matched_node else "").strip(),
                    image_urls[0] if image_urls else "",
                    json.dumps(image_urls, ensure_ascii=False),
                    "爱彼迎",
                    "",
                    str(stay.get("details", "")).strip(),
                    str(matched_node["place_provider"] if matched_node else "manual").strip() or "manual",
                    str(matched_node["provider_place_id"] if matched_node else "").strip(),
                    str(matched_node["coord_system"] if matched_node else "wgs84").strip() or "wgs84",
                ),
            )
            date_range = parse_accommodation_range(stay.get("dates", ""), trip["start_date"])
            if not date_range:
                continue
            db.execute(
                """INSERT INTO stays
                (id, trip_slug, lodging_id, check_in_day, check_in_date, check_in_time,
                check_out_day, check_out_date, check_out_time, guests, room_type, price, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)""",
                (
                    f"stay-{uuid.uuid4().hex[:12]}",
                    trip["slug"],
                    lodging_id,
                    date_range["check_in_day"],
                    date_range["check_in_date"],
                    "18:00" if index == 0 else "15:00",
                    date_range["check_out_day"],
                    date_range["check_out_date"],
                    "09:00" if index == 0 else "11:00",
                    0,
                    "",
                    "",
                    str(stay.get("details", "")).strip(),
                ),
            )


def reset_trip(db):
    db.execute("DELETE FROM trips WHERE slug = ?", (TRIP["slug"],))
    db.execute(
        """INSERT INTO trips
        (slug, title, subtitle, start_date, end_date, travelers, origin, summary, car, car_image_url, trip_region, map_provider, coord_system, accommodations)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            TRIP["slug"], TRIP["title"], TRIP["subtitle"], TRIP["start_date"], TRIP["end_date"],
            TRIP["travelers"], TRIP["origin"], TRIP["summary"], TRIP["car"], TRIP["car_image_url"],
            TRIP.get("trip_region", "overseas"), TRIP.get("map_provider", "google"), TRIP.get("coord_system", "wgs84"),
            json.dumps(TRIP["accommodations"], ensure_ascii=False),
        ),
    )
    db.executemany(
        """INSERT INTO nodes
        (id, trip_slug, title, description, type, activity_subtype, time, day, date, city, address, lat, lng, status, image_url, image_urls)
        VALUES (:id, :trip_slug, :title, :description, :type, :activity_subtype, :time, :day, :date, :city, :address, :lat, :lng, :status, :image_url, :image_urls)""",
        [
            {
                **item,
                "trip_slug": TRIP["slug"],
                "type": normalize_node_type(item.get("type")),
                "activity_subtype": normalize_activity_subtype(item.get("type"), item.get("activity_subtype")),
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


def image_urls_from_source(source):
    item = dict(source)
    image_urls = item.get("image_urls")
    if isinstance(image_urls, str):
        try:
            image_urls = json.loads(image_urls)
        except json.JSONDecodeError:
            image_urls = [image_urls]
    elif image_urls and not isinstance(image_urls, list):
        image_urls = [image_urls]

    urls = [str(url).strip() for url in (image_urls or []) if str(url).strip()]
    legacy_image = str(item.get("image_url", "")).strip()
    if legacy_image and legacy_image not in urls:
        urls.insert(0, legacy_image)
    return urls


def row_to_node(row):
    item = dict(row)
    item["image_urls"] = image_urls_from_source(item)
    return item


def row_to_lodging(row):
    item = dict(row)
    item["image_urls"] = image_urls_from_source(item)
    return item


def row_to_stay(row):
    return dict(row)


def row_to_edge(row):
    item = dict(row)
    item["transportType"] = item.pop("transport_type")
    item["sourceAnchor"] = item.pop("source_anchor", "place")
    item["targetAnchor"] = item.pop("target_anchor", "place")
    item["linkKind"] = item.pop("link_kind", "connection")
    item["routePreference"] = item.pop("route_preference", "recommended")
    item["isManual"] = bool(item.pop("is_manual", 0))
    item["isLocked"] = bool(item.pop("is_locked", 0))
    item["displayStatus"] = item.pop("display_status", "visible")
    return item


def row_to_route_segment(row):
    item = dict(row)
    try:
        geometry = json.loads(item.pop("geometry_json") or "[]")
    except json.JSONDecodeError:
        geometry = []
    item["geometry"] = geometry if isinstance(geometry, list) else []
    item["linkType"] = item.pop("link_type")
    item["linkId"] = item.pop("link_id")
    item["travelMode"] = item.pop("travel_mode")
    item["geometryFormat"] = item.pop("geometry_format")
    item["coordSystem"] = item.pop("coord_system")
    item["distanceMeters"] = item.pop("distance_meters")
    item["durationSeconds"] = item.pop("duration_seconds")
    item["distanceText"] = item.pop("distance_text")
    item["durationText"] = item.pop("duration_text")
    item["expiresAt"] = item.pop("expires_at")
    item["errorMessage"] = item.pop("error_message")
    item["requestedAt"] = item.pop("requested_at")
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
            """SELECT id, title, description, type, activity_subtype, time, day, date, city, address, lat, lng, status,
            end_time, end_day, end_date, timezone, image_url, image_urls, transport_mode, departure_place, arrival_place,
            departure_timezone, arrival_timezone, arrival_time,
            arrival_date, service_number, duration, departure_lat, departure_lng, arrival_lat, arrival_lng,
            place_provider, provider_place_id, coord_system, departure_place_provider, departure_provider_place_id,
            arrival_place_provider, arrival_provider_place_id
            FROM nodes WHERE trip_slug = ?
            ORDER BY CASE WHEN status = 'unscheduled' THEN 1 ELSE 0 END, day, time, title""",
            (slug,),
        )
    ]
    result["edges"] = [
        row_to_edge(row)
        for row in db.execute(
            """SELECT id, source, target, source_anchor, target_anchor, link_kind,
            transport_type, route_preference, is_manual,
            is_locked, display_status, duration, distance
            FROM edges WHERE trip_slug = ? ORDER BY rowid""",
            (slug,),
        )
    ]
    result["routeSegments"] = [
        row_to_route_segment(row)
        for row in db.execute(
            """SELECT id, link_type, link_id, provider, travel_mode, origin_lat, origin_lng,
            destination_lat, destination_lng, geometry_format, geometry_json, coord_system,
            distance_meters, duration_seconds, distance_text, duration_text, status,
            expires_at, error_message, requested_at
            FROM route_segments WHERE trip_slug = ? ORDER BY link_type, link_id""",
            (slug,),
        )
    ]
    result["lodgings"] = [
        row_to_lodging(row)
        for row in db.execute(
            """SELECT id, name, address, city, lat, lng, timezone, image_url, image_urls,
            booking_site, reservation_no, notes, place_provider, provider_place_id, coord_system
            FROM lodgings WHERE trip_slug = ? ORDER BY name""",
            (slug,),
        )
    ]
    result["stays"] = [
        row_to_stay(row)
        for row in db.execute(
            """SELECT id, lodging_id, check_in_day, check_in_date, check_in_time,
            check_out_day, check_out_date, check_out_time, guests, room_type, price, status, notes
            FROM stays WHERE trip_slug = ? ORDER BY check_in_date, check_in_time""",
            (slug,),
        )
    ]
    if result["stays"]:
        lodging_lookup = {item["id"]: item for item in result["lodgings"]}
        result["accommodations"] = [
            {
                "name": lodging_lookup.get(stay["lodging_id"], {}).get("name", "住宿待补充"),
                "dates": f"{stay['check_in_date']} 入住，{stay['check_out_date']} 退房",
                "address": lodging_lookup.get(stay["lodging_id"], {}).get("address", ""),
                "details": lodging_lookup.get(stay["lodging_id"], {}).get("notes", "") or stay.get("notes", ""),
                "image_url": lodging_lookup.get(stay["lodging_id"], {}).get("image_url", ""),
            }
            for stay in result["stays"]
            if stay.get("status") != "cancelled"
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
                    """SELECT title, city, day, lat, lng, image_url, type, status
                    FROM nodes WHERE trip_slug = ?
                    ORDER BY CASE WHEN status = 'unscheduled' THEN 1 ELSE 0 END, day, time, title""",
                    (trip["slug"],),
                )
            )
            scheduled_nodes = [node for node in nodes if node["status"] != "unscheduled" and node["day"] > 0]
            map_nodes = [node for node in scheduled_nodes if node["type"] != "transport"] or [node for node in nodes if node["type"] != "transport"] or nodes
            cover_node = next((node for node in map_nodes if node["image_url"]), None)
            trip.update(
                {
                    "node_count": len(nodes),
                    "day_count": max((node["day"] for node in scheduled_nodes), default=0),
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
    trip_region = str(payload.get("trip_region", "overseas")).strip()
    if trip_region not in ("domestic", "overseas"):
        trip_region = "overseas"
    map_provider = "amap" if trip_region == "domestic" else "google"
    coord_system = "gcj02" if map_provider == "amap" else "wgs84"
    with connection() as db:
        db.execute(
            """INSERT INTO trips
            (slug, title, subtitle, start_date, end_date, travelers, origin, summary, car, car_image_url, trip_region, map_provider, coord_system, accommodations)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, '[]')""",
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
                trip_region,
                map_provider,
                coord_system,
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


def should_bypass_cache():
    value = request.args.get("cache", "").strip().lower()
    return value in {"0", "false", "no", "off"}


def json_request(url, params, headers=None):
    req = Request(
        f"{url}?{urlencode(params)}",
        headers=headers or {"User-Agent": "VoyagePlanner/1.0 (personal travel planner)"},
    )
    with urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def json_post_request(url, payload, headers=None):
    req = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            **(headers or {}),
        },
        method="POST",
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


def google_text_search(query, lat=None, lng=None, region_code=""):
    if not GOOGLE_MAPS_API_KEY:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is not configured")
    payload = {
        "textQuery": query,
        "languageCode": "zh-CN",
        "maxResultCount": 8,
    }
    if region_code:
        payload["regionCode"] = region_code.upper()
    if lat is not None and lng is not None:
        payload["locationBias"] = {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": 50000.0,
            }
        }
    result = json_post_request(
        "https://places.googleapis.com/v1/places:searchText",
        payload,
        {
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": ",".join(
                [
                    "places.id",
                    "places.displayName",
                    "places.formattedAddress",
                    "places.location",
                    "places.addressComponents",
                ]
            ),
        },
    )
    payload = []
    for item in result.get("places", []):
        location = item.get("location") or {}
        lat_value = location.get("latitude")
        lng_value = location.get("longitude")
        if lat_value is None or lng_value is None:
            continue
        components = item.get("addressComponents") or []
        city = next(
            (
                component.get("longText", "")
                for component in components
                if any(kind in component.get("types", []) for kind in ("locality", "administrative_area_level_1", "country"))
            ),
            "",
        )
        payload.append(
            {
                "name": (item.get("displayName") or {}).get("text") or query,
                "display_name": item.get("formattedAddress") or "",
                "lat": float(lat_value),
                "lng": float(lng_value),
                "city": city,
                "provider": "google",
                "provider_place_id": item.get("id", ""),
                "coord_system": "wgs84",
            }
        )
    return payload


def google_reverse(lat, lng):
    if not GOOGLE_MAPS_API_KEY:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is not configured")
    result = json_request(
        "https://maps.googleapis.com/maps/api/geocode/json",
        {"latlng": f"{lat},{lng}", "language": "zh-CN", "key": GOOGLE_MAPS_API_KEY},
    )
    if result.get("status") not in ("OK", "ZERO_RESULTS"):
        raise RuntimeError(result.get("error_message") or result.get("status") or "Google geocode failed")
    item = next(iter(result.get("results", [])), {})
    components = item.get("address_components") or []
    city = next(
        (
            component.get("long_name", "")
            for component in components
            if any(kind in component.get("types", []) for kind in ("locality", "administrative_area_level_1", "country"))
        ),
        "",
    )
    return {
        "display_name": item.get("formatted_address", ""),
        "city": city,
        "provider": "google",
        "provider_place_id": item.get("place_id", ""),
        "coord_system": "wgs84",
    }


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


def haversine_meters(origin_lat, origin_lng, destination_lat, destination_lng):
    radius_meters = 6371000
    lat1 = math.radians(origin_lat)
    lat2 = math.radians(destination_lat)
    delta_lat = math.radians(destination_lat - origin_lat)
    delta_lng = math.radians(destination_lng - origin_lng)
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    return int(2 * radius_meters * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def format_distance(meters):
    if meters is None:
        return ""
    if meters >= 1000:
        return f"{meters / 1000:.1f} km"
    return f"{int(meters)} m"


def format_duration(seconds):
    if seconds is None:
        return ""
    minutes = max(1, round(seconds / 60))
    if minutes >= 60:
        hours = minutes // 60
        remainder = minutes % 60
        return f"{hours}小时{remainder}分" if remainder else f"{hours}小时"
    return f"{minutes}分钟"


def parse_google_duration(value):
    text = str(value or "")
    if text.endswith("s"):
        try:
            return int(float(text[:-1]))
        except ValueError:
            return None
    return None


def decode_google_polyline(value):
    coordinates = []
    index = 0
    lat = 0
    lng = 0
    while index < len(value):
        result = 0
        shift = 0
        while True:
            byte = ord(value[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        lat += ~(result >> 1) if result & 1 else result >> 1

        result = 0
        shift = 0
        while True:
            byte = ord(value[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        lng += ~(result >> 1) if result & 1 else result >> 1
        coordinates.append([lat / 1e5, lng / 1e5])
    return coordinates


def great_circle_geometry(origin_lat, origin_lng, destination_lat, destination_lng):
    start_phi = math.radians(origin_lat)
    start_lambda = math.radians(origin_lng)
    end_phi = math.radians(destination_lat)
    end_lambda = math.radians(destination_lng)
    start = [
        math.cos(start_phi) * math.cos(start_lambda),
        math.cos(start_phi) * math.sin(start_lambda),
        math.sin(start_phi),
    ]
    end = [
        math.cos(end_phi) * math.cos(end_lambda),
        math.cos(end_phi) * math.sin(end_lambda),
        math.sin(end_phi),
    ]
    omega = math.acos(max(-1, min(1, sum(start[index] * end[index] for index in range(3)))))
    if not math.isfinite(omega) or omega < 1e-6:
        return [[origin_lat, origin_lng], [destination_lat, destination_lng]]
    previous_lng = origin_lng
    path = []
    for index in range(33):
        t = index / 32
        a = math.sin((1 - t) * omega) / math.sin(omega)
        b = math.sin(t * omega) / math.sin(omega)
        x = a * start[0] + b * end[0]
        y = a * start[1] + b * end[1]
        z = a * start[2] + b * end[2]
        lat = math.degrees(math.atan2(z, math.sqrt(x * x + y * y)))
        lng = math.degrees(math.atan2(y, x))
        while lng - previous_lng > 180:
            lng -= 360
        while lng - previous_lng < -180:
            lng += 360
        previous_lng = lng
        path.append([lat, lng])
    return path


def route_mode(value):
    mode = str(value or "").strip()
    if mode in ("walk",):
        return "walk"
    if mode in ("flight",):
        return "flight"
    if mode in ("train", "high_speed_rail", "subway", "bus", "transit"):
        return "transit"
    if mode in ("ferry",):
        return "other"
    return "drive"


def edge_anchor_point(row, prefix, anchor):
    anchor = anchor if anchor in EDGE_ANCHORS else "place"
    if anchor == "departure":
        lat = row[f"{prefix}_departure_lat"]
        lng = row[f"{prefix}_departure_lng"]
        if lat is not None and lng is not None:
            return float(lat), float(lng)
    if anchor == "arrival":
        lat = row[f"{prefix}_arrival_lat"]
        lng = row[f"{prefix}_arrival_lng"]
        if lat is not None and lng is not None:
            return float(lat), float(lng)
    return float(row[f"{prefix}_lat"]), float(row[f"{prefix}_lng"])


def node_anchor_point(node, anchor):
    anchor = anchor if anchor in EDGE_ANCHORS else "place"
    if anchor == "departure" and node["departure_lat"] is not None and node["departure_lng"] is not None:
        return float(node["departure_lat"]), float(node["departure_lng"])
    if anchor == "arrival" and node["arrival_lat"] is not None and node["arrival_lng"] is not None:
        return float(node["arrival_lat"]), float(node["arrival_lng"])
    return float(node["lat"]), float(node["lng"])


def parse_minutes(value):
    try:
        hour, minute = str(value or "00:00").split(":", 1)
        return max(0, min(23 * 60 + 59, int(hour) * 60 + int(minute)))
    except (ValueError, TypeError):
        return 0


def date_delta_days(start, end):
    if not start or not end:
        return None
    try:
        start_year, start_month, start_day = [int(item) for item in str(start).split("-")]
        end_year, end_month, end_day = [int(item) for item in str(end).split("-")]
    except ValueError:
        return None
    try:
        return (datetime.date(end_year, end_month, end_day) - datetime.date(start_year, start_month, start_day)).days
    except ValueError:
        return None


def event_entry_day(node):
    return int(node["day"] or 0)


def event_exit_day(node):
    if node["type"] == "transport":
        if node["arrival_date"]:
            delta = date_delta_days(node["date"], node["arrival_date"])
            if delta is not None:
                return max(int(node["day"] or 0), int(node["day"] or 0) + max(0, delta))
        if node["arrival_time"] and parse_minutes(node["arrival_time"]) < parse_minutes(node["time"]):
            return int(node["day"] or 0) + 1
    if node["end_day"] and int(node["end_day"]) >= int(node["day"] or 0):
        return int(node["end_day"])
    if node["end_date"]:
        delta = date_delta_days(node["date"], node["end_date"])
        if delta is not None:
            return max(int(node["day"] or 0), int(node["day"] or 0) + max(0, delta))
    return int(node["day"] or 0)


def event_entry_anchor(node):
    return "departure" if node["type"] == "transport" else "place"


def event_exit_anchor(node):
    return "arrival" if node["type"] == "transport" else "place"


def event_entry_absolute(node):
    return (event_entry_day(node) - 1) * 24 * 60 + parse_minutes(node["time"])


def event_exit_absolute(node):
    if node["type"] == "transport":
        return (event_exit_day(node) - 1) * 24 * 60 + parse_minutes(node["arrival_time"] or node["end_time"] or node["time"])
    return (event_exit_day(node) - 1) * 24 * 60 + parse_minutes(node["end_time"] or node["time"])


def default_connection_transport_type(source_point, target_point):
    distance = haversine_meters(source_point[0], source_point[1], target_point[0], target_point[1])
    return "walk" if distance < 2000 else "car"


def route_fingerprint(provider, travel_mode, origin_lat, origin_lng, destination_lat, destination_lng):
    return json.dumps(
        {
            "provider": provider,
            "travel_mode": travel_mode,
            "origin": [round(origin_lat, 6), round(origin_lng, 6)],
            "destination": [round(destination_lat, 6), round(destination_lng, 6)],
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def google_route(origin_lat, origin_lng, destination_lat, destination_lng, travel_mode):
    if not GOOGLE_MAPS_API_KEY:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is not configured")
    google_mode = {
        "walk": "WALK",
        "drive": "DRIVE",
        "transit": "TRANSIT",
    }.get(travel_mode)
    if not google_mode:
        raise RuntimeError(f"Google route mode not supported: {travel_mode}")
    result = json_post_request(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
            "origin": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lng}}},
            "destination": {"location": {"latLng": {"latitude": destination_lat, "longitude": destination_lng}}},
            "travelMode": google_mode,
            "languageCode": "zh-CN",
            "units": "METRIC",
        },
        {
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        },
    )
    route = next(iter(result.get("routes", [])), None)
    if not route:
        raise RuntimeError("Google route returned no route")
    encoded = (route.get("polyline") or {}).get("encodedPolyline", "")
    geometry = decode_google_polyline(encoded) if encoded else []
    if len(geometry) < 2:
        raise RuntimeError("Google route returned no geometry")
    distance_meters = int(route.get("distanceMeters") or 0) or None
    duration_seconds = parse_google_duration(route.get("duration"))
    return {
        "provider": "google",
        "geometry": geometry,
        "coord_system": "wgs84",
        "geometry_format": "latlng_json",
        "distance_meters": distance_meters,
        "duration_seconds": duration_seconds,
        "distance_text": format_distance(distance_meters),
        "duration_text": format_duration(duration_seconds),
        "status": "fresh",
        "error_message": "",
    }


def dedupe_geometry(points):
    geometry = []
    for point in points:
        if not geometry or geometry[-1] != point:
            geometry.append(point)
    return geometry


def amap_route(origin_lat, origin_lng, destination_lat, destination_lng, travel_mode):
    if travel_mode not in ("walk", "drive"):
        raise RuntimeError(f"Amap route mode not supported: {travel_mode}")
    origin_gcj_lat, origin_gcj_lng = wgs84_to_gcj02(origin_lat, origin_lng)
    destination_gcj_lat, destination_gcj_lng = wgs84_to_gcj02(destination_lat, destination_lng)
    result = amap_request(
        "direction/walking" if travel_mode == "walk" else "direction/driving",
        {
            "origin": f"{origin_gcj_lng},{origin_gcj_lat}",
            "destination": f"{destination_gcj_lng},{destination_gcj_lat}",
            "extensions": "base",
        },
    )
    route = result.get("route") or {}
    path = next(iter(route.get("paths", [])), None)
    if not path:
        raise RuntimeError("Amap route returned no route")
    points = []
    for step in path.get("steps", []):
        for item in str(step.get("polyline", "")).split(";"):
            if not item or "," not in item:
                continue
            lng_text, lat_text = item.split(",", 1)
            points.append([float(lat_text), float(lng_text)])
    geometry = dedupe_geometry(points)
    if len(geometry) < 2:
        raise RuntimeError("Amap route returned no geometry")
    distance_meters = int(float(path.get("distance") or 0)) or None
    duration_seconds = int(float(path.get("duration") or 0)) or None
    return {
        "provider": "amap",
        "geometry": geometry,
        "coord_system": "gcj02",
        "geometry_format": "latlng_json",
        "distance_meters": distance_meters,
        "duration_seconds": duration_seconds,
        "distance_text": format_distance(distance_meters),
        "duration_text": format_duration(duration_seconds),
        "status": "fresh",
        "error_message": "",
    }


def fallback_route(origin_lat, origin_lng, destination_lat, destination_lng, travel_mode, error_message="", duration_text=""):
    distance_meters = haversine_meters(origin_lat, origin_lng, destination_lat, destination_lng)
    if travel_mode == "flight":
        geometry = great_circle_geometry(origin_lat, origin_lng, destination_lat, destination_lng)
        geometry_format = "great_circle"
        status = "fresh"
    else:
        geometry = [[origin_lat, origin_lng], [destination_lat, destination_lng]]
        geometry_format = "latlng_json"
        status = "failed" if error_message else "fallback"
    return {
        "provider": "manual",
        "geometry": geometry,
        "coord_system": "wgs84",
        "geometry_format": geometry_format,
        "distance_meters": distance_meters,
        "duration_seconds": None,
        "distance_text": format_distance(distance_meters),
        "duration_text": duration_text,
        "status": status,
        "error_message": str(error_message)[:500],
    }


def route_payload(provider, origin_lat, origin_lng, destination_lat, destination_lng, travel_mode, duration_text=""):
    if travel_mode == "flight":
        return fallback_route(origin_lat, origin_lng, destination_lat, destination_lng, travel_mode, duration_text=duration_text)
    if provider == "google":
        return google_route(origin_lat, origin_lng, destination_lat, destination_lng, travel_mode)
    if provider == "amap":
        return amap_route(origin_lat, origin_lng, destination_lat, destination_lng, travel_mode)
    raise RuntimeError(f"Route provider not supported: {provider}")


def upsert_route_segment(db, slug, link_type, link_id, provider, travel_mode, origin_lat, origin_lng, destination_lat, destination_lng, duration_text=""):
    fingerprint = route_fingerprint(provider, travel_mode, origin_lat, origin_lng, destination_lat, destination_lng)
    now = time.time()
    existing = db.execute(
        """SELECT * FROM route_segments
        WHERE trip_slug = ? AND link_type = ? AND link_id = ?""",
        (slug, link_type, link_id),
    ).fetchone()
    if existing and existing["request_fingerprint"] == fingerprint and existing["expires_at"] > now and existing["status"] == "fresh":
        return dict(existing)
    try:
        payload = route_payload(provider, origin_lat, origin_lng, destination_lat, destination_lng, travel_mode, duration_text)
    except Exception as error:
        payload = fallback_route(origin_lat, origin_lng, destination_lat, destination_lng, travel_mode, str(error), duration_text)
    segment_id = existing["id"] if existing else f"route-{uuid.uuid4().hex[:12]}"
    db.execute(
        """INSERT INTO route_segments
        (id, trip_slug, link_type, link_id, provider, travel_mode, origin_lat, origin_lng, destination_lat, destination_lng,
        request_fingerprint, geometry_format, geometry_json, coord_system, distance_meters, duration_seconds,
        distance_text, duration_text, status, expires_at, error_message, requested_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(trip_slug, link_type, link_id) DO UPDATE SET
        id=excluded.id,
        provider=excluded.provider,
        travel_mode=excluded.travel_mode,
        origin_lat=excluded.origin_lat,
        origin_lng=excluded.origin_lng,
        destination_lat=excluded.destination_lat,
        destination_lng=excluded.destination_lng,
        request_fingerprint=excluded.request_fingerprint,
        geometry_format=excluded.geometry_format,
        geometry_json=excluded.geometry_json,
        coord_system=excluded.coord_system,
        distance_meters=excluded.distance_meters,
        duration_seconds=excluded.duration_seconds,
        distance_text=excluded.distance_text,
        duration_text=excluded.duration_text,
        status=excluded.status,
        expires_at=excluded.expires_at,
        error_message=excluded.error_message,
        requested_at=excluded.requested_at""",
        (
            segment_id,
            slug,
            link_type,
            link_id,
            payload["provider"],
            travel_mode,
            origin_lat,
            origin_lng,
            destination_lat,
            destination_lng,
            fingerprint,
            payload["geometry_format"],
            json.dumps(payload["geometry"], ensure_ascii=False, separators=(",", ":")),
            payload["coord_system"],
            payload["distance_meters"],
            payload["duration_seconds"],
            payload["distance_text"],
            payload["duration_text"],
            payload["status"],
            now + ROUTE_CACHE_TTL,
            payload["error_message"],
            now,
        ),
    )
    return db.execute(
        "SELECT * FROM route_segments WHERE trip_slug = ? AND link_type = ? AND link_id = ?",
        (slug, link_type, link_id),
    ).fetchone()


def refresh_route_segments(db, slug):
    trip = db.execute("SELECT map_provider FROM trips WHERE slug = ?", (slug,)).fetchone()
    provider = (trip["map_provider"] if trip else "google") or "google"
    edges = db.execute(
        """SELECT e.id, e.transport_type, e.duration, e.source_anchor, e.target_anchor,
        source.lat AS source_lat, source.lng AS source_lng,
        source.departure_lat AS source_departure_lat, source.departure_lng AS source_departure_lng,
        source.arrival_lat AS source_arrival_lat, source.arrival_lng AS source_arrival_lng,
        target.lat AS target_lat, target.lng AS target_lng,
        target.departure_lat AS target_departure_lat, target.departure_lng AS target_departure_lng,
        target.arrival_lat AS target_arrival_lat, target.arrival_lng AS target_arrival_lng
        FROM edges e
        JOIN nodes source ON source.id = e.source
        JOIN nodes target ON target.id = e.target
        WHERE e.trip_slug = ? AND e.display_status != 'hidden'""",
        (slug,),
    ).fetchall()
    for edge in edges:
        source_lat, source_lng = edge_anchor_point(edge, "source", edge["source_anchor"])
        target_lat, target_lng = edge_anchor_point(edge, "target", edge["target_anchor"])
        segment = upsert_route_segment(
            db,
            slug,
            "edge",
            edge["id"],
            provider,
            route_mode(edge["transport_type"]),
            source_lat,
            source_lng,
            target_lat,
            target_lng,
            edge["duration"] or "",
        )
        if segment:
            db.execute(
                "UPDATE edges SET distance = ?, duration = ? WHERE id = ? AND trip_slug = ?",
                (segment["distance_text"] or None, segment["duration_text"] or None, edge["id"], slug),
            )

    transports = db.execute(
        """SELECT id, transport_mode, departure_lat, departure_lng, arrival_lat, arrival_lng, duration
        FROM nodes
        WHERE trip_slug = ? AND type = 'transport'
        AND departure_lat IS NOT NULL AND departure_lng IS NOT NULL
        AND arrival_lat IS NOT NULL AND arrival_lng IS NOT NULL""",
        (slug,),
    ).fetchall()
    for node in transports:
        upsert_route_segment(
            db,
            slug,
            "transport_node",
            node["id"],
            provider,
            route_mode(node["transport_mode"]),
            node["departure_lat"],
            node["departure_lng"],
            node["arrival_lat"],
            node["arrival_lng"],
            node["duration"] or "",
        )

    db.execute(
        """DELETE FROM route_segments
        WHERE trip_slug = ? AND link_type = 'edge'
        AND link_id NOT IN (SELECT id FROM edges WHERE trip_slug = ?)""",
        (slug, slug),
    )
    db.execute(
        """DELETE FROM route_segments
        WHERE trip_slug = ? AND link_type = 'edge'
        AND link_id IN (SELECT id FROM edges WHERE trip_slug = ? AND display_status = 'hidden')""",
        (slug, slug),
    )
    db.execute(
        """DELETE FROM route_segments
        WHERE trip_slug = ? AND link_type = 'transport_node'
        AND link_id NOT IN (SELECT id FROM nodes WHERE trip_slug = ? AND type = 'transport')""",
        (slug, slug),
    )


def refresh_edge_route(db, slug, edge_id):
    trip = db.execute("SELECT map_provider FROM trips WHERE slug = ?", (slug,)).fetchone()
    provider = (trip["map_provider"] if trip else "google") or "google"
    edge = db.execute(
        """SELECT e.id, e.transport_type, e.duration, e.display_status, e.source_anchor, e.target_anchor,
        source.lat AS source_lat, source.lng AS source_lng,
        source.departure_lat AS source_departure_lat, source.departure_lng AS source_departure_lng,
        source.arrival_lat AS source_arrival_lat, source.arrival_lng AS source_arrival_lng,
        target.lat AS target_lat, target.lng AS target_lng,
        target.departure_lat AS target_departure_lat, target.departure_lng AS target_departure_lng,
        target.arrival_lat AS target_arrival_lat, target.arrival_lng AS target_arrival_lng
        FROM edges e
        JOIN nodes source ON source.id = e.source
        JOIN nodes target ON target.id = e.target
        WHERE e.trip_slug = ? AND e.id = ?""",
        (slug, edge_id),
    ).fetchone()
    if not edge:
        return None
    if edge["display_status"] == "hidden":
        db.execute(
            "DELETE FROM route_segments WHERE trip_slug = ? AND link_type = 'edge' AND link_id = ?",
            (slug, edge_id),
        )
        db.execute(
            "UPDATE edges SET distance = NULL, duration = NULL WHERE id = ? AND trip_slug = ?",
            (edge_id, slug),
        )
        return None
    source_lat, source_lng = edge_anchor_point(edge, "source", edge["source_anchor"])
    target_lat, target_lng = edge_anchor_point(edge, "target", edge["target_anchor"])
    segment = upsert_route_segment(
        db,
        slug,
        "edge",
        edge["id"],
        provider,
        route_mode(edge["transport_type"]),
        source_lat,
        source_lng,
        target_lat,
        target_lng,
        edge["duration"] or "",
    )
    if segment:
        db.execute(
            "UPDATE edges SET distance = ?, duration = ? WHERE id = ? AND trip_slug = ?",
            (segment["distance_text"] or None, segment["duration_text"] or None, edge_id, slug),
        )
    return segment


def invalidate_node_routes(db, slug, node_id):
    db.execute(
        """DELETE FROM route_segments
        WHERE trip_slug = ? AND (
            (link_type = 'transport_node' AND link_id = ?)
            OR (link_type = 'edge' AND link_id IN (
                SELECT id FROM edges WHERE trip_slug = ? AND (source = ? OR target = ?)
            ))
        )""",
        (slug, node_id, slug, node_id, node_id),
    )


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
            "coord_system": "wgs84",
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
                "coord_system": "wgs84",
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
            return {"display_name": item.get("display_name", ""), "city": city, "provider": "osm", "coord_system": "wgs84"}
        except Exception:
            pass
    result = json_request("https://photon.komoot.io/reverse", {"lat": lat, "lon": lng, "lang": "en"})
    feature = next(iter(result.get("features", [])), {})
    properties = feature.get("properties", {})
    return {
        "display_name": photon_display_name(properties),
        "city": properties.get("city") or properties.get("county") or properties.get("state") or "",
        "provider": "osm",
        "coord_system": "wgs84",
    }


@app.get("/api/geocode/search")
def hybrid_geocode_search():
    query = request.args.get("q", "").strip()
    provider = request.args.get("provider", "google").strip().lower()
    region_code = request.args.get("region", "").strip()
    bias_lat = request.args.get("lat", "").strip()
    bias_lng = request.args.get("lng", "").strip()
    try:
        bias_lat_value = float(bias_lat) if bias_lat else None
        bias_lng_value = float(bias_lng) if bias_lng else None
    except ValueError:
        bias_lat_value = None
        bias_lng_value = None
    if len(query) < 2:
        return jsonify([])
    try:
        bypass_cache = should_bypass_cache()
        if provider == "amap":
            def load_amap_results():
                return amap_request(
                    "place/text",
                    {"keywords": query, "offset": 6, "page": 1, "extensions": "base"},
                ).get("pois", [])

            results = load_amap_results() if bypass_cache else cached_geocode(
                ("search", "amap", query.casefold()),
                GEOCODE_CACHE_TTL,
                load_amap_results,
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
                        "provider_place_id": amap_text(item.get("id")),
                        "coord_system": "wgs84",
                    }
                )
            return jsonify(payload)

        if provider == "google":
            cache_key = (
                "search",
                "google",
                query.casefold(),
                region_code.upper(),
                round(bias_lat_value, 1) if bias_lat_value is not None else None,
                round(bias_lng_value, 1) if bias_lng_value is not None else None,
            )
            loader = lambda: google_text_search(query, bias_lat_value, bias_lng_value, region_code)
            return jsonify(loader() if bypass_cache else cached_geocode(
                cache_key,
                GEOCODE_CACHE_TTL,
                loader,
            ))

        cache_key = ("search", "osm", OVERSEAS_GEOCODE_PROVIDER, query.casefold())
        loader = lambda: overseas_search(query)
        return jsonify(loader() if bypass_cache else cached_geocode(
            cache_key,
            GEOCODE_CACHE_TTL,
            loader,
        ))
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 502
    except Exception:
        return jsonify({"error": "地点搜索服务暂时不可用"}), 502


@app.get("/api/geocode/reverse")
def hybrid_geocode_reverse():
    try:
        lat = float(request.args["lat"])
        lng = float(request.args["lng"])
        provider = request.args.get("provider", "google").strip().lower()
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
                    "coord_system": "wgs84",
                }
            )

        if provider == "google":
            return jsonify(cached_geocode(
                cache_key,
                REVERSE_CACHE_TTL,
                lambda: google_reverse(lat, lng),
            ))

        return jsonify(cached_geocode(
            ("reverse", provider, OVERSEAS_GEOCODE_PROVIDER, round(lat, 4), round(lng, 4)),
            REVERSE_CACHE_TTL,
            lambda: overseas_reverse(lat, lng),
        ))
    except (KeyError, ValueError):
        return jsonify({"error": "无效坐标"}), 400
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 502
    except Exception:
        return jsonify({"error": "地址查询服务暂时不可用"}), 502


def local_upload_filename(url):
    parsed = urlparse(str(url).strip())
    if parsed.scheme or parsed.netloc:
        return None
    path = unquote(parsed.path)
    if not path.startswith("/uploads/"):
        return None
    filename = path.removeprefix("/uploads/")
    if not filename or "/" in filename or "\\" in filename:
        return None
    if Path(filename).suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
        return None
    return filename


def local_upload_referenced(db, url):
    for row in db.execute("SELECT image_url, image_urls FROM nodes"):
        if url in image_urls_from_source(row):
            return True
    for row in db.execute("SELECT image_url, image_urls FROM lodgings"):
        if url in image_urls_from_source(row):
            return True
    return False


def delete_local_upload(url):
    filename = local_upload_filename(url)
    if not filename:
        return False
    upload_root = UPLOAD_DIR.resolve()
    target = (upload_root / filename).resolve()
    try:
        target.relative_to(upload_root)
    except ValueError:
        return False
    if not target.is_file():
        return False
    try:
        target.unlink()
    except OSError as error:
        app.logger.warning("Failed to delete upload %s: %s", filename, error)
        return False
    return True


def delete_unreferenced_uploads(urls):
    deleted = []
    with connection() as db:
        for url in sorted(set(urls)):
            if local_upload_filename(url) and not local_upload_referenced(db, url):
                if delete_local_upload(url):
                    deleted.append(url)
    return deleted


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


@app.delete("/api/trips/<slug>/images")
def delete_trip_image(slug):
    payload = request.get_json(silent=True) or {}
    url = str(payload.get("url", "")).strip()
    if not local_upload_filename(url):
        return jsonify({"error": "只能删除本项目上传的图片"}), 400

    with connection() as db:
        if not db.execute("SELECT 1 FROM trips WHERE slug = ?", (slug,)).fetchone():
            return jsonify({"error": "Trip not found"}), 404
        if local_upload_referenced(db, url):
            return jsonify({"deleted": False})

    return jsonify({"deleted": delete_local_upload(url)})


@app.get("/uploads/<path:filename>")
def uploaded_image(filename):
    return send_from_directory(UPLOAD_DIR, filename)


def node_payload(payload, existing=None):
    source = {**(dict(existing) if existing else {}), **payload}
    required = ("title", "type", "lat", "lng", "status")
    if any(source.get(key) in (None, "") for key in required):
        raise ValueError("Missing required node fields")
    raw_node_type = str(source["type"]).strip()
    node_type = normalize_node_type(raw_node_type)
    activity_subtype = "" if node_type == "transport" else normalize_activity_subtype(raw_node_type, source.get("activity_subtype"))
    status = str(source["status"]).strip()
    is_unscheduled_point = node_type != "transport" and status == "unscheduled"
    if node_type == "transport" and status == "unscheduled":
        status = "planned"
    if not is_unscheduled_point and any(source.get(key) in (None, "") for key in ("time", "day", "date")):
        raise ValueError("Missing required schedule fields")
    image_urls = image_urls_from_source(source)

    return {
        "title": str(source["title"]).strip(),
        "description": str(source.get("description", "")).strip(),
        "type": node_type,
        "activity_subtype": activity_subtype,
        "time": "" if is_unscheduled_point else str(source["time"]).strip(),
        "day": 0 if is_unscheduled_point else int(source["day"]),
        "date": "" if is_unscheduled_point else str(source["date"]).strip(),
        "end_time": "" if is_unscheduled_point else str(source.get("end_time") or source.get("arrival_time") or source["time"]).strip(),
        "end_day": 0 if is_unscheduled_point else int(source.get("end_day") or source["day"]),
        "end_date": "" if is_unscheduled_point else str(source.get("end_date") or source.get("arrival_date") or source["date"]).strip(),
        "timezone": str(source.get("timezone", "")).strip(),
        "city": str(source.get("city", "")).strip(),
        "address": str(source.get("address", "")).strip(),
        "lat": float(source["lat"]),
        "lng": float(source["lng"]),
        "status": status,
        "image_url": image_urls[0] if image_urls else "",
        "image_urls": json.dumps(image_urls, ensure_ascii=False),
        "transport_mode": str(source.get("transport_mode", "")).strip(),
        "departure_place": str(source.get("departure_place", "")).strip(),
        "arrival_place": str(source.get("arrival_place", "")).strip(),
        "departure_timezone": str(source.get("departure_timezone", "")).strip(),
        "arrival_timezone": str(source.get("arrival_timezone", "")).strip(),
        "arrival_time": str(source.get("arrival_time", "")).strip(),
        "arrival_date": str(source.get("arrival_date", "")).strip(),
        "service_number": str(source.get("service_number", "")).strip(),
        "duration": str(source.get("duration", "")).strip(),
        "departure_lat": float(source["departure_lat"]) if source.get("departure_lat") not in (None, "") else None,
        "departure_lng": float(source["departure_lng"]) if source.get("departure_lng") not in (None, "") else None,
        "arrival_lat": float(source["arrival_lat"]) if source.get("arrival_lat") not in (None, "") else None,
        "arrival_lng": float(source["arrival_lng"]) if source.get("arrival_lng") not in (None, "") else None,
        "place_provider": str(source.get("place_provider", "manual")).strip() or "manual",
        "provider_place_id": str(source.get("provider_place_id", "")).strip(),
        "coord_system": str(source.get("coord_system", "wgs84")).strip() or "wgs84",
        "departure_place_provider": str(source.get("departure_place_provider", source.get("place_provider", "manual"))).strip() or "manual",
        "departure_provider_place_id": str(source.get("departure_provider_place_id", "")).strip(),
        "arrival_place_provider": str(source.get("arrival_place_provider", source.get("place_provider", "manual"))).strip() or "manual",
        "arrival_provider_place_id": str(source.get("arrival_provider_place_id", "")).strip(),
    }


def lodging_payload(payload, existing=None):
    source = {**(dict(existing) if existing else {}), **payload}
    if not str(source.get("name", "")).strip():
        raise ValueError("Missing lodging name")
    if source.get("lat") in (None, "") or source.get("lng") in (None, ""):
        raise ValueError("Missing lodging coordinates")
    image_urls = image_urls_from_source({
        "image_url": source.get("image_url", ""),
        "image_urls": source.get("image_urls", []),
    })
    return {
        "name": str(source.get("name", "")).strip(),
        "address": str(source.get("address", "")).strip(),
        "city": str(source.get("city", "")).strip(),
        "lat": float(source["lat"]),
        "lng": float(source["lng"]),
        "timezone": str(source.get("timezone", "")).strip(),
        "image_url": image_urls[0] if image_urls else "",
        "image_urls": json.dumps(image_urls, ensure_ascii=False),
        "booking_site": str(source.get("booking_site", "")).strip(),
        "reservation_no": str(source.get("reservation_no", "")).strip(),
        "notes": str(source.get("notes", "")).strip(),
        "place_provider": str(source.get("place_provider", "manual")).strip() or "manual",
        "provider_place_id": str(source.get("provider_place_id", "")).strip(),
        "coord_system": str(source.get("coord_system", "wgs84")).strip() or "wgs84",
    }


def validate_iso_date(value):
    try:
        datetime.date.fromisoformat(str(value))
    except (TypeError, ValueError):
        raise ValueError("Invalid stay date")
    return str(value)


def stay_payload(db, slug, payload, existing=None):
    source = {**(dict(existing) if existing else {}), **payload}
    lodging_id = str(source.get("lodging_id", "")).strip()
    if not lodging_id:
        raise ValueError("Missing lodging")
    if not db.execute("SELECT 1 FROM lodgings WHERE id = ? AND trip_slug = ?", (lodging_id, slug)).fetchone():
        raise ValueError("Lodging not found")

    trip = db.execute("SELECT start_date FROM trips WHERE slug = ?", (slug,)).fetchone()
    check_in_date = validate_iso_date(source.get("check_in_date"))
    check_out_date = validate_iso_date(source.get("check_out_date"))
    check_in_time = str(source.get("check_in_time", "")).strip()
    check_out_time = str(source.get("check_out_time", "")).strip()
    if not re.match(r"^\d{1,2}:\d{2}$", check_in_time) or not re.match(r"^\d{1,2}:\d{2}$", check_out_time):
        raise ValueError("Invalid stay time")
    try:
        start_at = datetime.datetime.fromisoformat(f"{check_in_date}T{check_in_time}")
        end_at = datetime.datetime.fromisoformat(f"{check_out_date}T{check_out_time}")
    except ValueError:
        raise ValueError("Invalid stay date time")
    if end_at <= start_at:
        raise ValueError("Check-out must be after check-in")
    status = str(source.get("status", "planned")).strip() or "planned"
    if status not in {"planned", "cancelled"}:
        status = "planned"
    return {
        "lodging_id": lodging_id,
        "check_in_day": int(source.get("check_in_day") or trip_day_for_date(trip["start_date"], check_in_date)),
        "check_in_date": check_in_date,
        "check_in_time": check_in_time,
        "check_out_day": int(source.get("check_out_day") or trip_day_for_date(trip["start_date"], check_out_date)),
        "check_out_date": check_out_date,
        "check_out_time": check_out_time,
        "guests": int(source.get("guests") or 0),
        "room_type": str(source.get("room_type", "")).strip(),
        "price": str(source.get("price", "")).strip(),
        "status": status,
        "notes": str(source.get("notes", "")).strip(),
    }


def edge_payload(payload, existing):
    source = {**dict(existing), **payload}
    transport_type = str(source.get("transportType") or source.get("transport_type") or "car").strip()
    route_preference = str(source.get("routePreference") or source.get("route_preference") or "recommended").strip()
    display_status = str(source.get("displayStatus") or source.get("display_status") or "visible").strip()
    if transport_type not in EDGE_TRANSPORT_TYPES:
        raise ValueError("Unsupported route transport type")
    if route_preference not in EDGE_ROUTE_PREFERENCES:
        raise ValueError("Unsupported route preference")
    if display_status not in EDGE_DISPLAY_STATUSES:
        raise ValueError("Unsupported route display status")
    return {
        "transport_type": transport_type,
        "route_preference": route_preference,
        "is_manual": 1 if source.get("isManual", source.get("is_manual", True)) else 0,
        "is_locked": 1 if source.get("isLocked", source.get("is_locked", True)) else 0,
        "display_status": display_status,
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
            (id, trip_slug, title, description, type, activity_subtype, time, day, date, end_time, end_day, end_date, timezone, city, address, lat, lng, status, image_url, image_urls,
            transport_mode, departure_place, arrival_place, departure_timezone, arrival_timezone, arrival_time, arrival_date, service_number, duration,
            departure_lat, departure_lng, arrival_lat, arrival_lng, place_provider, provider_place_id, coord_system,
            departure_place_provider, departure_provider_place_id, arrival_place_provider, arrival_provider_place_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (node_id, slug, *item.values()),
        )
    return jsonify(row_to_node({"id": node_id, **item})), 201


@app.put("/api/trips/<slug>/nodes/<node_id>")
def update_node(slug, node_id):
    payload = request.get_json(force=True)
    removed_image_urls = []
    with connection() as db:
        existing = db.execute("SELECT * FROM nodes WHERE id = ? AND trip_slug = ?", (node_id, slug)).fetchone()
        if not existing:
            return jsonify({"error": "Node not found"}), 404
        existing_image_urls = set(image_urls_from_source(existing))
        try:
            item = node_payload(payload, existing)
        except (ValueError, TypeError) as error:
            return jsonify({"error": str(error)}), 400
        next_image_urls = set(image_urls_from_source(item))
        removed_image_urls = list(existing_image_urls - next_image_urls)
        db.execute(
            """UPDATE nodes SET title=?, description=?, type=?, activity_subtype=?, time=?, day=?, date=?, end_time=?, end_day=?, end_date=?, timezone=?, city=?, address=?, lat=?, lng=?, status=?, image_url=?, image_urls=?,
            transport_mode=?, departure_place=?, arrival_place=?, departure_timezone=?, arrival_timezone=?, arrival_time=?, arrival_date=?, service_number=?, duration=?,
            departure_lat=?, departure_lng=?, arrival_lat=?, arrival_lng=?, place_provider=?, provider_place_id=?, coord_system=?,
            departure_place_provider=?, departure_provider_place_id=?, arrival_place_provider=?, arrival_provider_place_id=?
            WHERE id=? AND trip_slug=?""",
            (*item.values(), node_id, slug),
        )
        invalidate_node_routes(db, slug, node_id)
    if removed_image_urls:
        delete_unreferenced_uploads(removed_image_urls)
    return jsonify(row_to_node({"id": node_id, **item}))


@app.delete("/api/trips/<slug>/nodes/<node_id>")
def delete_node(slug, node_id):
    removed_image_urls = []
    with connection() as db:
        existing = db.execute("SELECT image_url, image_urls FROM nodes WHERE id = ? AND trip_slug = ?", (node_id, slug)).fetchone()
        if not existing:
            return jsonify({"error": "Node not found"}), 404
        removed_image_urls = image_urls_from_source(existing)
        invalidate_node_routes(db, slug, node_id)
        db.execute("DELETE FROM nodes WHERE id = ? AND trip_slug = ?", (node_id, slug))
    if removed_image_urls:
        delete_unreferenced_uploads(removed_image_urls)
    return "", 204


@app.post("/api/trips/<slug>/lodgings")
def create_lodging(slug):
    payload = request.get_json(force=True)
    with connection() as db:
        if not db.execute("SELECT 1 FROM trips WHERE slug = ?", (slug,)).fetchone():
            return jsonify({"error": "Trip not found"}), 404
        try:
            item = lodging_payload(payload)
        except (ValueError, TypeError) as error:
            return jsonify({"error": str(error)}), 400
        lodging_id = payload.get("id") or f"lodging-{os.urandom(6).hex()}"
        db.execute(
            """INSERT INTO lodgings
            (id, trip_slug, name, address, city, lat, lng, timezone, image_url, image_urls,
            booking_site, reservation_no, notes, place_provider, provider_place_id, coord_system)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (lodging_id, slug, *item.values()),
        )
        trip = serialize_trip(db, slug)
    return jsonify(trip), 201


@app.put("/api/trips/<slug>/lodgings/<lodging_id>")
def update_lodging(slug, lodging_id):
    payload = request.get_json(force=True)
    removed_image_urls = []
    with connection() as db:
        existing = db.execute("SELECT * FROM lodgings WHERE id = ? AND trip_slug = ?", (lodging_id, slug)).fetchone()
        if not existing:
            return jsonify({"error": "Lodging not found"}), 404
        existing_image_urls = set(image_urls_from_source(existing))
        try:
            item = lodging_payload(payload, existing)
        except (ValueError, TypeError) as error:
            return jsonify({"error": str(error)}), 400
        next_image_urls = set(image_urls_from_source(item))
        removed_image_urls = list(existing_image_urls - next_image_urls)
        db.execute(
            """UPDATE lodgings SET name=?, address=?, city=?, lat=?, lng=?, timezone=?,
            image_url=?, image_urls=?, booking_site=?, reservation_no=?, notes=?,
            place_provider=?, provider_place_id=?, coord_system=?
            WHERE id=? AND trip_slug=?""",
            (*item.values(), lodging_id, slug),
        )
        trip = serialize_trip(db, slug)
    if removed_image_urls:
        delete_unreferenced_uploads(removed_image_urls)
    return jsonify(trip)


@app.delete("/api/trips/<slug>/lodgings/<lodging_id>")
def delete_lodging(slug, lodging_id):
    removed_image_urls = []
    with connection() as db:
        existing = db.execute("SELECT image_url, image_urls FROM lodgings WHERE id = ? AND trip_slug = ?", (lodging_id, slug)).fetchone()
        if not existing:
            return jsonify({"error": "Lodging not found"}), 404
        removed_image_urls = image_urls_from_source(existing)
        db.execute("DELETE FROM lodgings WHERE id = ? AND trip_slug = ?", (lodging_id, slug))
        trip = serialize_trip(db, slug)
    if removed_image_urls:
        delete_unreferenced_uploads(removed_image_urls)
    return jsonify(trip)


@app.post("/api/trips/<slug>/stays")
def create_stay(slug):
    payload = request.get_json(force=True)
    with connection() as db:
        if not db.execute("SELECT 1 FROM trips WHERE slug = ?", (slug,)).fetchone():
            return jsonify({"error": "Trip not found"}), 404
        try:
            item = stay_payload(db, slug, payload)
        except (ValueError, TypeError) as error:
            return jsonify({"error": str(error)}), 400
        stay_id = payload.get("id") or f"stay-{os.urandom(6).hex()}"
        db.execute(
            """INSERT INTO stays
            (id, trip_slug, lodging_id, check_in_day, check_in_date, check_in_time,
            check_out_day, check_out_date, check_out_time, guests, room_type, price, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (stay_id, slug, *item.values()),
        )
        trip = serialize_trip(db, slug)
    return jsonify(trip), 201


@app.put("/api/trips/<slug>/stays/<stay_id>")
def update_stay(slug, stay_id):
    payload = request.get_json(force=True)
    with connection() as db:
        existing = db.execute("SELECT * FROM stays WHERE id = ? AND trip_slug = ?", (stay_id, slug)).fetchone()
        if not existing:
            return jsonify({"error": "Stay not found"}), 404
        try:
            item = stay_payload(db, slug, payload, existing)
        except (ValueError, TypeError) as error:
            return jsonify({"error": str(error)}), 400
        db.execute(
            """UPDATE stays SET lodging_id=?, check_in_day=?, check_in_date=?, check_in_time=?,
            check_out_day=?, check_out_date=?, check_out_time=?, guests=?, room_type=?,
            price=?, status=?, notes=?
            WHERE id=? AND trip_slug=?""",
            (*item.values(), stay_id, slug),
        )
        trip = serialize_trip(db, slug)
    return jsonify(trip)


@app.delete("/api/trips/<slug>/stays/<stay_id>")
def delete_stay(slug, stay_id):
    with connection() as db:
        if not db.execute("SELECT 1 FROM stays WHERE id = ? AND trip_slug = ?", (stay_id, slug)).fetchone():
            return jsonify({"error": "Stay not found"}), 404
        db.execute("DELETE FROM stays WHERE id = ? AND trip_slug = ?", (stay_id, slug))
        trip = serialize_trip(db, slug)
    return jsonify(trip)


@app.put("/api/trips/<slug>/edges/<edge_id>")
def update_edge(slug, edge_id):
    payload = request.get_json(force=True)
    with connection() as db:
        existing = db.execute("SELECT * FROM edges WHERE id = ? AND trip_slug = ?", (edge_id, slug)).fetchone()
        if not existing:
            return jsonify({"error": "Route segment not found"}), 404
        try:
            item = edge_payload(payload, existing)
        except (ValueError, TypeError) as error:
            return jsonify({"error": str(error)}), 400
        db.execute(
            """UPDATE edges SET transport_type = ?, route_preference = ?, is_manual = ?,
            is_locked = ?, display_status = ?
            WHERE id = ? AND trip_slug = ?""",
            (
                item["transport_type"],
                item["route_preference"],
                item["is_manual"],
                item["is_locked"],
                item["display_status"],
                edge_id,
                slug,
            ),
        )
        refresh_edge_route(db, slug, edge_id)
        trip = serialize_trip(db, slug)
    return jsonify(trip)


@app.post("/api/trips/<slug>/auto-connect")
def auto_connect(slug):
    with connection() as db:
        nodes = list(db.execute(
            """SELECT id, title, type, day, date, time, end_day, end_date, end_time,
            lat, lng, transport_mode, departure_lat, departure_lng, arrival_lat, arrival_lng,
            arrival_time, arrival_date
            FROM nodes
            WHERE trip_slug = ?
            AND status != 'unscheduled' AND day > 0 AND time != ''
            ORDER BY day, time, title""",
            (slug,),
        ))
        nodes.sort(key=lambda node: (event_entry_absolute(node), event_exit_absolute(node), node["title"]))
        existing_edges = {
            row["id"]: dict(row)
            for row in db.execute(
                """SELECT id, transport_type, route_preference, is_manual, is_locked, display_status
                FROM edges WHERE trip_slug = ?""",
                (slug,),
            )
        }
        generated = []
        for index, current in enumerate(nodes[:-1]):
            following = nodes[index + 1]
            source_anchor = event_exit_anchor(current)
            target_anchor = event_entry_anchor(following)
            if event_exit_day(current) != event_entry_day(following):
                continue
            source_point = node_anchor_point(current, source_anchor)
            target_point = node_anchor_point(following, target_anchor)
            distance_meters = haversine_meters(source_point[0], source_point[1], target_point[0], target_point[1])
            if distance_meters < 80:
                continue
            edge_id = f"auto-{current['id']}-{following['id']}"
            existing = existing_edges.get(edge_id)
            transport_type = default_connection_transport_type(source_point, target_point)
            km = distance_meters / 1000
            duration = f"{max(5, round(km * (15 if transport_type == 'walk' else 1.3)))} min"
            if existing and existing["is_locked"]:
                transport_type = existing["transport_type"]
            generated.append(
                {
                    "id": edge_id,
                    "trip_slug": slug,
                    "source": current["id"],
                    "target": following["id"],
                    "source_anchor": source_anchor,
                    "target_anchor": target_anchor,
                    "link_kind": "connection",
                    "transport_type": transport_type,
                    "route_preference": existing["route_preference"] if existing and existing["is_locked"] else "recommended",
                    "is_manual": existing["is_manual"] if existing and existing["is_locked"] else 0,
                    "is_locked": existing["is_locked"] if existing and existing["is_locked"] else 0,
                    "display_status": existing["display_status"] if existing and existing["is_locked"] else "visible",
                    "duration": duration,
                    "distance": f"{km:.1f} km",
                }
            )
        generated_ids = [edge["id"] for edge in generated]
        if generated_ids:
            placeholders = ",".join("?" for _ in generated_ids)
            db.execute(
                f"DELETE FROM edges WHERE trip_slug = ? AND id NOT IN ({placeholders})",
                (slug, *generated_ids),
            )
        else:
            db.execute("DELETE FROM edges WHERE trip_slug = ?", (slug,))
        db.executemany(
            """INSERT INTO edges
            (id, trip_slug, source, target, source_anchor, target_anchor, link_kind, transport_type,
            route_preference, is_manual, is_locked, display_status, duration, distance)
            VALUES (:id, :trip_slug, :source, :target, :source_anchor, :target_anchor, :link_kind,
            :transport_type, :route_preference, :is_manual, :is_locked, :display_status, :duration, :distance)
            ON CONFLICT(id) DO UPDATE SET
            source=excluded.source,
            target=excluded.target,
            source_anchor=excluded.source_anchor,
            target_anchor=excluded.target_anchor,
            link_kind=excluded.link_kind,
            transport_type=excluded.transport_type,
            route_preference=excluded.route_preference,
            is_manual=excluded.is_manual,
            is_locked=excluded.is_locked,
            display_status=excluded.display_status,
            duration=excluded.duration,
            distance=excluded.distance""",
            generated,
        )
        refresh_route_segments(db, slug)
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
