import os
import re
import time

import psycopg
from psycopg.rows import dict_row


def database_url():
    return os.environ.get(
        "DATABASE_URL",
        "postgresql://voyageplanner:voyageplanner@127.0.0.1:5432/voyageplanner",
    )

_POSITIONAL_PARAMETER = re.compile(r"\?")
_NAMED_PARAMETER = re.compile(r"(?<!:):([A-Za-z_][A-Za-z0-9_]*)")


def adapt_query(query):
    """Translate the compact SQL parameter style used by the API to psycopg."""
    query = _NAMED_PARAMETER.sub(r"%(\1)s", query)
    return _POSITIONAL_PARAMETER.sub("%s", query)


class DatabaseSession:
    def __init__(self):
        self._connection = None

    def __enter__(self):
        self._connection = psycopg.connect(database_url(), row_factory=dict_row)
        return self

    def __exit__(self, error_type, _error, _traceback):
        try:
            if error_type is None:
                self._connection.commit()
            else:
                self._connection.rollback()
        finally:
            self._connection.close()

    def execute(self, query, parameters=None):
        query = adapt_query(query)
        if parameters is None:
            return self._connection.execute(query)
        return self._connection.execute(query, parameters)

    def executemany(self, query, parameter_sets):
        cursor = self._connection.cursor()
        cursor.executemany(adapt_query(query), parameter_sets)
        return cursor


def connection():
    return DatabaseSession()


SCHEMA_STATEMENTS = (
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
    )
    """,
    """
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
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned',
        image_url TEXT NOT NULL DEFAULT '',
        image_urls TEXT NOT NULL DEFAULT '[]',
        transport_mode TEXT NOT NULL DEFAULT '',
        departure_place TEXT NOT NULL DEFAULT '',
        arrival_place TEXT NOT NULL DEFAULT '',
        departure_timezone TEXT NOT NULL DEFAULT '',
        arrival_timezone TEXT NOT NULL DEFAULT '',
        arrival_time TEXT NOT NULL DEFAULT '',
        arrival_date TEXT NOT NULL DEFAULT '',
        service_number TEXT NOT NULL DEFAULT '',
        duration TEXT NOT NULL DEFAULT '',
        departure_lat DOUBLE PRECISION,
        departure_lng DOUBLE PRECISION,
        arrival_lat DOUBLE PRECISION,
        arrival_lng DOUBLE PRECISION,
        place_provider TEXT NOT NULL DEFAULT 'manual',
        provider_place_id TEXT NOT NULL DEFAULT '',
        coord_system TEXT NOT NULL DEFAULT 'wgs84',
        departure_place_provider TEXT NOT NULL DEFAULT 'manual',
        departure_provider_place_id TEXT NOT NULL DEFAULT '',
        arrival_place_provider TEXT NOT NULL DEFAULT 'manual',
        arrival_provider_place_id TEXT NOT NULL DEFAULT ''
    )
    """,
    """
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
        distance TEXT,
        sort_order BIGINT NOT NULL DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS geocode_cache (
        cache_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at DOUBLE PRECISION NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS route_segments (
        id TEXT PRIMARY KEY,
        trip_slug TEXT NOT NULL REFERENCES trips(slug) ON DELETE CASCADE,
        link_type TEXT NOT NULL,
        link_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        travel_mode TEXT NOT NULL,
        origin_lat DOUBLE PRECISION NOT NULL,
        origin_lng DOUBLE PRECISION NOT NULL,
        destination_lat DOUBLE PRECISION NOT NULL,
        destination_lng DOUBLE PRECISION NOT NULL,
        request_fingerprint TEXT NOT NULL,
        geometry_format TEXT NOT NULL DEFAULT 'latlng_json',
        geometry_json TEXT NOT NULL DEFAULT '[]',
        coord_system TEXT NOT NULL DEFAULT 'wgs84',
        distance_meters INTEGER,
        duration_seconds INTEGER,
        distance_text TEXT NOT NULL DEFAULT '',
        duration_text TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'fresh',
        expires_at DOUBLE PRECISION NOT NULL DEFAULT 0,
        error_message TEXT NOT NULL DEFAULT '',
        requested_at DOUBLE PRECISION NOT NULL DEFAULT 0,
        UNIQUE(trip_slug, link_type, link_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS lodgings (
        id TEXT PRIMARY KEY,
        trip_slug TEXT NOT NULL REFERENCES trips(slug) ON DELETE CASCADE,
        name TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        timezone TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        image_urls TEXT NOT NULL DEFAULT '[]',
        booking_site TEXT NOT NULL DEFAULT '',
        reservation_no TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        place_provider TEXT NOT NULL DEFAULT 'manual',
        provider_place_id TEXT NOT NULL DEFAULT '',
        coord_system TEXT NOT NULL DEFAULT 'wgs84'
    )
    """,
    """
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
    )
    """,
    "CREATE INDEX IF NOT EXISTS nodes_trip_schedule_idx ON nodes (trip_slug, day, time)",
    "CREATE INDEX IF NOT EXISTS edges_trip_order_idx ON edges (trip_slug, sort_order, id)",
    "CREATE INDEX IF NOT EXISTS route_segments_trip_idx ON route_segments (trip_slug, link_type, link_id)",
    "CREATE INDEX IF NOT EXISTS lodgings_trip_idx ON lodgings (trip_slug)",
    "CREATE INDEX IF NOT EXISTS stays_trip_dates_idx ON stays (trip_slug, check_in_date, check_out_date)",
)


def migrate_database(retries=1, retry_delay=2):
    last_error = None
    for attempt in range(retries):
        try:
            with connection() as db:
                db.execute("SELECT pg_advisory_xact_lock(%s)", (8520260712,))
                db.execute(
                    """
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version INTEGER PRIMARY KEY,
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                applied = db.execute(
                    "SELECT 1 FROM schema_migrations WHERE version = %s", (1,)
                ).fetchone()
                if not applied:
                    for statement in SCHEMA_STATEMENTS:
                        db.execute(statement)
                    db.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (1,))
            return
        except psycopg.OperationalError as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(retry_delay)
    raise last_error
