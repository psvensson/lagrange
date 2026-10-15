"""Offline fixture verification. No PostgreSQL-wire or OCI claims."""

import os
import unittest
from unittest.mock import patch

from client import (
    CREATE_SQL,
    DROP_SQL,
    INSERT_SQL,
    SEED_ROWS,
    SELECT_SQL,
    execute_portable_rankings,
    expected_rankings,
    require_scratch_database,
)


class RecordingCursor:
    def __init__(self, rows=None, fail_on=None):
        self.calls = []
        self.rows = rows if rows is not None else (
            (2, "Grace", 97), (1, "Ada", 91), (4, "Margaret", 91)
        )
        self.fail_on = fail_on

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement, arguments=None):
        self.calls.append((statement, arguments))
        if self.fail_on == statement:
            raise RuntimeError("deliberate query failure")

    def fetchall(self):
        return self.rows


class RecordingConnection:
    def __init__(self, cursor):
        self.instance = cursor
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return self.instance

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class PortabilityFixtureTests(unittest.TestCase):
    def test_ordered_query_and_transaction_commit(self):
        cursor = RecordingCursor()
        connection = RecordingConnection(cursor)
        result = execute_portable_rankings(connection)
        self.assertEqual(result, {"rankings": expected_rankings(70)})
        self.assertEqual(connection.commits, 1)
        self.assertEqual(connection.rollbacks, 0)
        self.assertEqual(cursor.calls, [
            (DROP_SQL, None), (CREATE_SQL, None),
            *((INSERT_SQL, row) for row in SEED_ROWS),
            (SELECT_SQL, (70,)),
        ])

    def test_query_error_rolls_back_without_commit(self):
        cursor = RecordingCursor(fail_on=SELECT_SQL)
        connection = RecordingConnection(cursor)
        with self.assertRaisesRegex(RuntimeError, "deliberate query failure"):
            execute_portable_rankings(connection)
        self.assertEqual(connection.commits, 0)
        self.assertEqual(connection.rollbacks, 1)

    def test_parity_mismatch_rolls_back(self):
        cursor = RecordingCursor(rows=[(1, "Ada", 3)])
        connection = RecordingConnection(cursor)
        with self.assertRaisesRegex(AssertionError, "fixture oracle"):
            execute_portable_rankings(connection)
        self.assertEqual(connection.commits, 0)
        self.assertEqual(connection.rollbacks, 1)

    def test_invalid_threshold_cannot_begin_transaction(self):
        cursor = RecordingCursor()
        connection = RecordingConnection(cursor)
        with self.assertRaises(ValueError):
            execute_portable_rankings(connection, True)
        self.assertEqual(cursor.calls, [])
        self.assertEqual(connection.commits, 0)

    def test_schema_reset_requires_exact_database_confirmation(self):
        with patch.dict(os.environ, {
            "PGDATABASE": "client_portability_fixture",
            "PORTABILITY_RESET_CONFIRM": "reset:production",
        }):
            with self.assertRaisesRegex(ValueError, "disposable PGDATABASE"):
                require_scratch_database()
        with patch.dict(os.environ, {
            "PGDATABASE": "client_portability_fixture",
            "PORTABILITY_RESET_CONFIRM": "reset:client_portability_fixture",
        }):
            require_scratch_database()


if __name__ == "__main__":
    unittest.main()
