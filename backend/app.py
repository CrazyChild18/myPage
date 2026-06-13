import json
import math
import os
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from backend.seed_data import EDGES, NODES, TRIP


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DIST_DIR = PROJECT_DIR / "dist"
DATABASE = Path(os.environ.get("DATABASE_PATH", BASE_DIR / "voyageplanner.db"))

app = Flask(__name__, static_folder=str(DIST_DIR), static_url_path="")


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
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'planned'
                ,image_url TEXT NOT NULL DEFAULT ''
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
            """
        )
        count = db.execute("SELECT COUNT(*) FROM trips").fetchone()[0]
        trip_columns = {row[1] for row in db.execute("PRAGMA table_info(trips)")}
        node_columns = {row[1] for row in db.execute("PRAGMA table_info(nodes)")}
        if "car_image_url" not in trip_columns:
            db.execute("ALTER TABLE trips ADD COLUMN car_image_url TEXT NOT NULL DEFAULT ''")
        if "image_url" not in node_columns:
            db.execute("ALTER TABLE nodes ADD COLUMN image_url TEXT NOT NULL DEFAULT ''")
        if count == 0:
            reset_trip(db)


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
        (id, trip_slug, title, description, type, time, day, date, city, lat, lng, status, image_url)
        VALUES (:id, :trip_slug, :title, :description, :type, :time, :day, :date, :city, :lat, :lng, :status, :image_url)""",
        [{**item, "trip_slug": TRIP["slug"]} for item in NODES],
    )
    db.executemany(
        """INSERT INTO edges
        (id, trip_slug, source, target, transport_type, duration, distance)
        VALUES (:id, :trip_slug, :source, :target, :transport_type, :duration, :distance)""",
        [{**item, "trip_slug": TRIP["slug"]} for item in EDGES],
    )


def row_to_node(row):
    return dict(row)


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
            "SELECT id, title, description, type, time, day, date, city, lat, lng, status, image_url FROM nodes WHERE trip_slug = ? ORDER BY day, time",
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
        trips = [dict(row) for row in db.execute("SELECT slug, title, subtitle, start_date, end_date FROM trips")]
    return jsonify(trips)


@app.get("/api/trips/<slug>")
def get_trip(slug):
    with connection() as db:
        trip = serialize_trip(db, slug)
    return jsonify(trip) if trip else (jsonify({"error": "Trip not found"}), 404)


def node_payload(payload, existing=None):
    source = {**(dict(existing) if existing else {}), **payload}
    required = ("title", "type", "time", "day", "date", "lat", "lng", "status")
    if any(source.get(key) in (None, "") for key in required):
        raise ValueError("Missing required node fields")
    return {
        "title": str(source["title"]).strip(),
        "description": str(source.get("description", "")).strip(),
        "type": source["type"],
        "time": source["time"],
        "day": int(source["day"]),
        "date": source["date"],
        "city": str(source.get("city", "")).strip(),
        "lat": float(source["lat"]),
        "lng": float(source["lng"]),
        "status": source["status"],
        "image_url": str(source.get("image_url", "")).strip(),
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
            (id, trip_slug, title, description, type, time, day, date, city, lat, lng, status, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (node_id, slug, *item.values()),
        )
    return jsonify({"id": node_id, **item}), 201


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
            """UPDATE nodes SET title=?, description=?, type=?, time=?, day=?, date=?, city=?, lat=?, lng=?, status=?, image_url=?
            WHERE id=? AND trip_slug=?""",
            (*item.values(), node_id, slug),
        )
    return jsonify({"id": node_id, **item})


@app.delete("/api/trips/<slug>/nodes/<node_id>")
def delete_node(slug, node_id):
    with connection() as db:
        result = db.execute("DELETE FROM nodes WHERE id = ? AND trip_slug = ?", (node_id, slug))
    return ("", 204) if result.rowcount else (jsonify({"error": "Node not found"}), 404)


@app.post("/api/trips/<slug>/auto-connect")
def auto_connect(slug):
    with connection() as db:
        nodes = list(db.execute("SELECT id, day, lat, lng FROM nodes WHERE trip_slug = ? ORDER BY day, time", (slug,)))
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
