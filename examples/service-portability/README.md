# PostgreSQL application portability

This example shows how one ordinary Node HTTP application image runs,
unchanged, against two database endpoints:

1. a stock PostgreSQL container; and
2. Lagrange's production PostgreSQL wire listener.

The application source, Dockerfile, entrypoint, command, and inspected image ID
stay identical. Only connection, credential, and TLS environment variables
change. The Lagrange stage runs in a separate application container, uses
password authentication, validates the server certificate, and keeps the demo
private key outside the application image.

## Run it

Prerequisites: Node.js 20+ and a running Docker daemon. From the repository
root:

```sh
node examples/service-portability/run-database-portability.js
```

The command builds the application image once, starts an isolated PostgreSQL
baseline, starts the Lagrange listener through `createRuntimeStartupWiring` and
`ServiceRuntimeLifecycle`, invokes the same `/rankings` handler in both stages,
and checks exact result parity. It then tries a wrong password and a wrong CA
against the Lagrange stage (both must fail), writes a versioned report under
`test-output/reports/`, and tears everything down.

## What's covered

The PostgreSQL slice exercised here is intentionally explicit:

- the real `pg` Pool from an external application container;
- password authentication and verified TLS on the Lagrange connection;
- parameterized extended queries;
- `BEGIN`/`COMMIT` transaction handling;
- portable `DROP TABLE`, `CREATE TABLE`, and multi-row `INSERT` operations; and
- a filtered multi-row `SELECT` with deterministic ordering.

This is not a claim of arbitrary ORM compatibility or complete PostgreSQL
behavior, and Lagrange does not install or manage the application container
here. Managed OCI execution is a later stage of the service-portability ladder.

Note that this example starts the built-in `sys-postgres-wire` runtime service
directly — one of the axiomatic bootstrap services that exists before any
Binding. It exercises the runtime substrate, not the user deployment surface;
services are deployed through INSTALL SERVICE and CREATE BINDING
([`architecture/minimal-deployment-surface.md`](../../architecture/minimal-deployment-surface.md)).

The certificates and private key in `certs/` are local example fixtures only.
Never use them anywhere else.
