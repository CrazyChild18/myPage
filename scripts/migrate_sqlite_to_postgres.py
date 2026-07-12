import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

import psycopg
from psycopg import sql


PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))


TABLES = (
    "trips",
    "nodes",
    "edges",
    "geocode_cache",
    "route_segments",
    "lodgings",
    "stays",
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Replace PostgreSQL data with a verified VoyagePlanner SQLite snapshot."
    )
    parser.add_argument("--sqlite", default="backend/voyageplanner.db")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Required because the destination tables are truncated before import.",
    )
    return parser.parse_args()


def source_columns(source, table):
    return [row[1] for row in source.execute(f'PRAGMA table_info("{table}")')]


def destination_columns(destination, table):
    rows = destination.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
        """,
        (table,),
    ).fetchall()
    return [row[0] for row in rows]


def rows_for_table(source, table, columns):
    selections = [f'"{column}"' for column in columns]
    if table == "edges" and "sort_order" in columns:
        selections[columns.index("sort_order")] = "rowid AS sort_order"
    query = f'SELECT {", ".join(selections)} FROM "{table}"'
    return source.execute(query).fetchall()


def migrate(sqlite_path, database_url):
    os.environ["DATABASE_URL"] = database_url
    from backend.database import migrate_database

    migrate_database(retries=10, retry_delay=2)

    source = sqlite3.connect(sqlite_path)
    try:
        integrity = source.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"SQLite integrity check failed: {integrity}")

        with psycopg.connect(database_url) as destination:
            destination.execute(
                "TRUNCATE TABLE stays, lodgings, route_segments, geocode_cache, edges, nodes, trips CASCADE"
            )
            imported = {}
            for table in TABLES:
                source_names = source_columns(source, table)
                destination_names = destination_columns(destination, table)
                columns = [name for name in destination_names if name in source_names]
                if table == "edges" and "sort_order" in destination_names:
                    columns.append("sort_order")
                rows = rows_for_table(source, table, columns)
                if rows:
                    statement = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                        sql.Identifier(table),
                        sql.SQL(", ").join(map(sql.Identifier, columns)),
                        sql.SQL(", ").join(sql.Placeholder() for _ in columns),
                    )
                    destination.cursor().executemany(statement, rows)
                imported[table] = len(rows)

            verified = {
                table: destination.execute(
                    sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table))
                ).fetchone()[0]
                for table in TABLES
            }
            if imported != verified:
                raise RuntimeError(
                    f"PostgreSQL row counts do not match source: {imported} != {verified}"
                )
        return imported
    finally:
        source.close()


def main():
    args = parse_args()
    if not args.replace:
        raise SystemExit("Refusing to replace PostgreSQL data without --replace")
    if not args.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required")
    sqlite_path = Path(args.sqlite).resolve()
    if not sqlite_path.is_file():
        raise SystemExit(f"SQLite source not found: {sqlite_path}")
    counts = migrate(sqlite_path, args.database_url)
    print(json.dumps({"status": "ok", "tables": counts}, sort_keys=True))


if __name__ == "__main__":
    main()
