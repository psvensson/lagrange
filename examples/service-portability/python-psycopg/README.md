# Python / Psycopg PostgreSQL-wire evaluation fixture

This conventional Python client uses [Psycopg 3](https://www.psycopg.org/psycopg3/docs/) without importing Lagrange APIs. It exercises transactional table setup, parameterized inserts and selection, integer/text decoding, commit/rollback and deterministic ordering against a PostgreSQL-wire endpoint.

It is **not** a certified driver compatibility matrix. The existing [Node.js `pg` application proof](../README.md) remains the Docker comparison harness; this independent Python client is not a Lagrange-managed OCI service.

## Safe offline tests

Run from the repository root with Python 3.10 or newer:

~~~sh
python3 -m unittest discover -s examples/service-portability/python-psycopg -p 'test_*.py' -v
~~~

These five standard-library tests exercise only the fixture SQL, parameters, transaction behavior, negative outcomes, and destructive-reset guard. They do **not** contact a database.

## Run against two disposable endpoints

Create or provision a writable scratch database on both PostgreSQL and Lagrange. **This fixture drops and recreates a table named `portability_scores`. Do not run it on a valuable database.**

~~~sh
python3 -m venv /tmp/lagrange-psycopg-fixture-venv
. /tmp/lagrange-psycopg-fixture-venv/bin/activate
python -m pip install -r examples/service-portability/python-psycopg/requirements.txt
python -c 'import psycopg; print("psycopg", psycopg.__version__)'

export PGDATABASE=client_portability_fixture
export PGUSER=YOUR_TEST_USER
export PGPASSWORD=YOUR_TEST_PASSWORD
export PGHOST=YOUR_POSTGRES_HOST
export PGPORT=5432
export PORTABILITY_RESET_CONFIRM="reset:${PGHOST}:${PGPORT}/${PGDATABASE}"
python examples/service-portability/python-psycopg/client.py > /tmp/psycopg-postgres.json

# Change only standard PostgreSQL connection/security environment settings.
export PGHOST=YOUR_LAGRANGE_HOST
export PGPORT=YOUR_LAGRANGE_PG_PORT
export PORTABILITY_RESET_CONFIRM="reset:${PGHOST}:${PGPORT}/${PGDATABASE}"
export PGSSLMODE=verify-full
export PGSSLROOTCERT=/path/to/trusted/lagrange-ca.pem
python examples/service-portability/python-psycopg/client.py > /tmp/psycopg-lagrange.json

cmp /tmp/psycopg-postgres.json /tmp/psycopg-lagrange.json
~~~

For a trusted local PostgreSQL baseline you may need `PGSSLMODE=disable` during only that stage. For Lagrange use verified TLS and a certificate matching `PGHOST`. The script requires one explicit `PGHOST`, `PGPORT` and `PGDATABASE`, confirms their **exact combination** before any SQL, rejects `PGHOSTADDR` and libpq service-file routing, and passes the confirmed target directly to Psycopg. The confirmation must be renewed when changing endpoints. It prints canonical ranking JSON without credentials. This is an intent guard, **not proof that a database contains no important data**.

A fixed-data local oracle catches simple wrong answers. The independent comparison is the actual PostgreSQL run. Record exact driver/Python versions, endpoints, observed errors, TLS mode, and output before making any compatibility claim.

Wrong-password, wrong-CA, prepared-statement, pooling, cancellation, network interruption and failover scenarios still require separate live acceptance through the existing PostgreSQL compatibility work. An untested driver or version remains **unknown**, never silently supported.
