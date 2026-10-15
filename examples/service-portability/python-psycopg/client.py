#!/usr/bin/env python3
"""Conventional Psycopg client for a bounded PostgreSQL-wire evaluation.

Not a managed Lagrange service, nor a claim of driver certification.
This example resets one table only with explicit scratch-db confirmation.
"""

import argparse
import json
import os
import sys

TABLE = "portability_scores"
SEED_ROWS = (
    (1, "Ada", 91),
    (2, "Grace", 97),
    (3, "Linus", 68),
    (4, "Margaret", 91),
)
DROP_SQL = f"DROP TABLE IF EXISTS {TABLE}"
CREATE_SQL = (
    f"CREATE TABLE {TABLE} ("
    "id INTEGER PRIMARY KEY, name TEXT NOT NULL, score INTEGER NOT NULL)"
)
INSERT_SQL = f"INSERT INTO {TABLE} (id, name, score) VALUES (%s, %s, %s)"
SELECT_SQL = (
    f"SELECT id, name, score FROM {TABLE} "
    "WHERE score >= %s ORDER BY score DESC, id ASC"
)


def expected_rankings(minimum_score):
    """Small fixed-data expectation; live PostgreSQL remains the baseline."""
    selected = [row for row in SEED_ROWS if row[2] >= minimum_score]
    return [
        {"id": row[0], "name": row[1], "score": row[2]}
        for row in sorted(selected, key=lambda row: (-row[2], row[0]))
    ]


def execute_portable_rankings(connection, minimum_score=70):
    """Exercise ordinary parameterized SQL and commit/rollback behavior."""
    if isinstance(minimum_score, bool) or not isinstance(minimum_score, int):
        raise ValueError("minimum_score must be an integer")
    try:
        with connection.cursor() as cursor:
            cursor.execute(DROP_SQL)
            cursor.execute(CREATE_SQL)
            for row in SEED_ROWS:
                cursor.execute(INSERT_SQL, row)
            cursor.execute(SELECT_SQL, (minimum_score,))
            result = [
                {"id": int(row[0]), "name": row[1], "score": int(row[2])}
                for row in cursor.fetchall()
            ]
        if result != expected_rankings(minimum_score):
            raise AssertionError("database result disagrees with fixture oracle")
        connection.commit()
        return {"rankings": result}
    except Exception:
        connection.rollback()
        raise


def require_scratch_database():
    """Require explicit permission before resetting the fixture table."""
    database = os.getenv("PGDATABASE", "")
    confirmation = os.getenv("PORTABILITY_RESET_CONFIRM", "")
    if not database or confirmation != f"reset:{database}":
        raise ValueError(
            "choose a disposable PGDATABASE and set "
            "PORTABILITY_RESET_CONFIRM=reset:<exact PGDATABASE>"
        )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--minimum-score", type=int, default=70)
    options = parser.parse_args(argv)
    require_scratch_database()
    try:
        import psycopg  # Lazy import keeps offline tests dependency-free.
    except ImportError as exc:
        raise RuntimeError(
            "install the pinned driver: pip install -r requirements.txt"
        ) from exc
    # Name the confirmed database explicitly; libpq reads other PG* settings.
    connection = psycopg.connect(dbname=os.environ["PGDATABASE"])
    try:
        output = execute_portable_rankings(connection, options.minimum_score)
    finally:
        connection.close()
    print(json.dumps(output, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, AssertionError) as exc:
        print(f"portability fixture refused: {exc}", file=sys.stderr)
        sys.exit(1)
