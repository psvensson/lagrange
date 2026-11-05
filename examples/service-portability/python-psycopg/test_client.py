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

    def test_schema_reset_requires_exact_endpoint_confirmation(self):
        target = {
            "PGHOST": "127.0.0.1",
            "PGPORT": "5432",
            "PGDATABASE": "client_portability_fixture",
        }
        with patch.dict(os.environ, {
            **target, "PORTABILITY_RESET_CONFIRM": "reset:client_portability_fixture",
        }, clear=True):
            with self.assertRaisesRegex(ValueError, "exact PGHOST"):
                require_scratch_database()
        with patch.dict(os.environ, {
            **target, "PORTABILITY_RESET_CONFIRM":
                "reset:127.0.0.1:5432/client_portability_fixture",
        }, clear=True):
            self.assertEqual(require_scratch_database(), {
                "host": "127.0.0.1", "port": 5432,
                "dbname": "client_portability_fixture",
            })

    def test_changing_host_or_port_invalidates_destructive_confirmation(self):
        target = {
            "PGHOST": "127.0.0.1", "PGPORT": "5432",
            "PGDATABASE": "client_portability_fixture",
            "PORTABILITY_RESET_CONFIRM":
                "reset:127.0.0.1:5432/client_portability_fixture",
        }
        for changed in ({"PGHOST": "production.database.example.com"},
                        {"PGPORT": "6432"},
                        {"PGDATABASE": "another_database"}):
            with self.subTest(changed=changed):
                with patch.dict(os.environ, {**target, **changed}, clear=True):
                    with self.assertRaisesRegex(ValueError, "exact PGHOST"):
                        require_scratch_database()

    def test_alternate_libpq_destinations_fail_closed(self):
        target = {
            "PGHOST": "127.0.0.1", "PGPORT": "5432",
            "PGDATABASE": "client_portability_fixture",
            "PORTABILITY_RESET_CONFIRM":
                "reset:127.0.0.1:5432/client_portability_fixture",
        }
        for name in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"):
            with self.subTest(name=name):
                with patch.dict(os.environ, {**target, name: "override"},
                                clear=True):
                    with self.assertRaisesRegex(ValueError,
                                                 "alternate libpq destination"):
                        require_scratch_database()

    def test_multi_host_or_socket_destination_is_refused(self):
        target = {
            "PGPORT": "5432", "PGDATABASE": "client_portability_fixture",
        }
        for host in ("a.example,b.example", "/var/run/postgresql", " "):
            with self.subTest(host=host):
                with patch.dict(os.environ, {
                    **target, "PGHOST": host,
                    "PORTABILITY_RESET_CONFIRM":
                        f"reset:{host}:5432/client_portability_fixture",
                }, clear=True):
                    with self.assertRaisesRegex(ValueError, "one explicit"):
                        require_scratch_database()


if __name__ == "__main__":
    unittest.main()
