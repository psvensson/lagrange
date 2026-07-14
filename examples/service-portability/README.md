# PostgreSQL application portability

This example builds one ordinary Node HTTP application image and runs that exact
image against two database endpoints:

1. a stock PostgreSQL container; and
2. Lagrange's production PostgreSQL wire listener.

The application source, Dockerfile, entrypoint, command, and inspected image ID
stay identical. Only connection, credential, and TLS environment variables
change. The Lagrange stage runs in a separate application container, uses
password authentication, validates the server certificate, and keeps the demo
private key outside the application image.

## Run it

Prerequisites are Node.js 20+ and a running Docker daemon. From the repository
root:

```sh
node examples/service-portability/run-database-portability.js
```

The command builds the application image once, starts an isolated PostgreSQL
baseline, starts the Lagrange listener through `createRuntimeStartupWiring` and
`ServiceRuntimeLifecycle`, invokes the same `/rankings` handler in both stages,
checks exact result parity, attacks the Lagrange stage with a wrong password and
wrong CA, writes a versioned live report under `test-output/reports/`, and tears
everything down.

## What this proves

The measured PostgreSQL slice is intentionally explicit:

- the real `pg` Pool from an external application container;
- password authentication and verified TLS on the Lagrange connection;
- parameterized extended queries;
- `BEGIN`/`COMMIT` transaction handling;
- portable `DROP TABLE`, `CREATE TABLE`, and multi-row `INSERT` operations; and
- a filtered multi-row `SELECT` with deterministic ordering.

It is not a claim of arbitrary ORM compatibility or complete PostgreSQL
behavior. This database-portability milestone also does not claim that Lagrange
installs or manages the application container. Managed OCI execution and genuine
WASM components are later stages of the service-portability ladder.

The certificates and private key in `certs/` are local example fixtures only.
Never use them outside this disposable proof.
