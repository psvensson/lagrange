# Lagrange

**Run the data-heavy parts of a service where its data already lives.**

Lagrange combines a distributed SQL database and a WebAssembly (WASI) service
runtime. Every Lagrange node can hold database partitions **and** run service
code near data.

```text
                 Lagrange cluster

        node A          node B          node C
      +--------+      +--------+      +--------+
      | data   |      | data   |      | data   |
      | P1*    |      | P1     |      | P1     |
      | P2     |      | P2*    |      | P2     |  <- replicas
      | P3     |      | P3     |      | P3*    |
      |        |      |        |      |        |
      | WASM   |      | WASM   |      | WASM   |
      +--------+      +--------+      +--------+

        * = that partition's leader replica
```

Instead of pulling large volumes of database rows across the network into
application servers, Lagrange runs partition-local functions (`run()`) on the
nodes holding the data, emits small numeric intermediate partials, and combines
them in a global reducer (`reduce()`).

---

## Audience and Workload Fit

Lagrange is designed for **backend engineers, distributed systems teams, and data platform architects** building services where network transfer between database and application tiers is the primary bottleneck.

### Workload Fit

Lagrange is a strong fit when an application:
- Reads large volumes of data to return a compact result (`data examined >> result returned`).
- Applies scoring, Bayesian ranking, feature extraction, filtering, or validation across partitions.
- Manually shards database queries in application code and manages fan-out and merging.
- Needs to deploy and test business logic in versioned application code (with `npm test` and CI/CD) without installing database extensions or stored procedures.

### Non-Fit and When Plain SQL Is Better

Lagrange is **not** a good fit for:
- Pure API orchestration with negligible database queries.
- **Queries where standard SQL is already optimal:** When a query can be cleanly expressed as an indexed SQL query or a standard `SELECT ... GROUP BY ... ORDER BY ... LIMIT K`, the database engine already computes the result and top-N heap locally and returns only the final rows. Moving such queries into WASM functions adds complexity without benefit. Measure against plain SQL first.
- Complex multi-table transactions requiring distributed cross-partition locking snapshots.

---

## Bounded Evaluation Commitment and Version Truth

Lagrange is experimental alpha software under active development:

- **Version Status:** Version `0.3.3` is the latest tagged GitHub release. Version `0.4.0` is the active development source on the `main` branch.
- **Comparison Integrity:** Comparative claims (against PostgreSQL, TiDB/TiKV, or Citus) are based on real physical execution on lab or GCP environments. Modeled comparisons and synthetic latency estimates are excluded.
- **Integrated Storage:** Lagrange provides its own partitioned SQLite and Raft consensus storage layer; it is not a compute proxy installed on top of existing external databases.

---

## Immediate Capabilities and Limits

The current public interface is intentionally focused and fails closed:

- **Supported Language:** JavaScript is the supported code-first language today (compiled to WASI via ComponentizeJS). Future execution provider policies (including OCI containers) are detailed in [Minimal Deployment Surface](architecture/minimal-deployment-surface.md).
- **SQL Selectors:** Distributed operations require a literal single-table `SELECT` statement fixed at deployment. No dynamic string interpolation is permitted.
- **Shard Input Bounds:** Each partition shard evaluates up to a default limit of 4,096 rows per batch.
- **Partials:** Emitted partial values must be finite numbers (`Number.isFinite(value)`). At most 64 emits per shard and 1,024 coordinated partials per invocation are permitted under shard-disjoint keys.
- **PostgreSQL Compatibility:** Lagrange speaks a subset of the PostgreSQL wire protocol for client connectivity, not drop-in PostgreSQL. Secondary indexes, multi-statement scripts, and user-table CDC event streaming (`CDC_EVENT_STREAM_DISABLED`) are unsupported.
- **Network and Resilience:** Inter-node transport assumes a trusted private network. Supported rolling upgrades and automated backup/PITR are not yet supported product contracts.

See [Current Capabilities and Limitations](docs/current-capabilities-and-limitations.md) for full details.

---

## Try it

Run the end-to-end account-summary demonstration (requires Node.js 22.12 or newer):

```bash
git clone https://github.com/psvensson/lagrange
cd lagrange
npm install
npm run demo:account-summary
```

The demo:
1. Compiles [`examples/call-binding-account-summary/lagrange.service.js`](examples/call-binding-account-summary/lagrange.service.js) into a genuine WASI component;
2. Starts an ephemeral node, creates a table, and splits it into two partitions;
3. Deploys the service over PostgreSQL-wire lifecycle SQL;
4. Invokes the HTTP endpoint `POST /amounts/summary`;
5. Executes `run()` locally across partition leaders (emitting 8 numeric partials with 0 raw rows transferred across the network); and
6. Reduces the partials into a single JSON summary report.

### Scaffold Your Own Service

Create a new service project using the CLI:

```bash
npx lagrange service init my-service
cd my-service
npm test
npm run build
```

The build script compiles your source into `.lagrange/component.wasm` and generates deterministic deployment records under `.lagrange/deployment/`.

To deploy to a running cluster:

```bash
# 1. Publish into the replicated ArtifactPayloadStore (returns <package-id>)
npx lagrange service publish .

# 2. Deploy by registered immutable identity (no local files needed)
npx lagrange service deploy --package-id <package-id> --idempotency-key deploy-key-v1
```

See [First Hour With Lagrange](docs/tutorials/first-hour.md) for the complete walkthrough.

### Deploy on Kubernetes and Run Cloud Benchmarks

If you have an existing Kubernetes cluster or cloud VMs:
- **Kubernetes (Helm)**: Deploy via `helm install lagrange charts/lagrange-node --set image.tag=0.3.3 --set joiners.replicas=2` and deploy WASI services over SQL without pod volume mounts.
- **Cloud Benchmarks**: Run Scenario A (contended OLTP), Scenario B (locality/RTT), Scenario C (freshness), and MovieLens against your own GCP project or lab servers via `npm run distributed:gcp` or `--gcp-template`.

See [Kubernetes Deployment and Cloud Benchmarks](docs/kubernetes-and-cloud-benchmarks.md).

---

## Troubleshooting and Diagnostics

Lagrange exposes health probes and diagnostic streams on dedicated ports:

- **HTTP REST / Ingress (`REST_API_PORT=8080`):**
  - `curl -fsS http://127.0.0.1:8080/livez` - Node process liveness.
  - `curl -fsS http://127.0.0.1:8080/startupz` - Core service startup and schema initialization.
  - `curl -fsS http://127.0.0.1:8080/readyz` - Cluster quorum readiness and request acceptance.
- **Admin WebSocket (`ADMIN_WS_PORT=8081`):**
  - Diagnostic stream at `ws://127.0.0.1:8081/api/admin/stream` for real-time events, cluster status, and CDC logs.
- **Transport WebSocket (`TRANSPORT_WS_PORT=8082`):**
  - Inter-node Raft consensus and replica synchronization.
- **PostgreSQL Wire Protocol (`PGPORT=5432`):**
  - Standard SQL ingress and lifecycle management (`SHOW SERVICE '<name>'`).

For detailed authoring rules, see [JavaScript Service Reference](docs/reference/javascript-service-reference.md).

---

## Read Next

- [First Hour With Lagrange](docs/tutorials/first-hour.md) - Complete step-by-step developer walkthrough
- [Kubernetes and Cloud Benchmarks](docs/kubernetes-and-cloud-benchmarks.md) - Helm chart guide, credential config, and cloud benchmark matrix
- [JavaScript Service Reference](docs/reference/javascript-service-reference.md) - Authoring API, typings, and limits
- [Rewrite A Hot Path For Lagrange](docs/tutorials/rewrite-a-hot-path.md) - MovieLens top-N three-baseline tutorial
- [The Lagrange Native Programming Model](docs/native-programming-model.md) - Handlers, `run()`, and `reduce()`
- [Execution Semantics](docs/execution-semantics.md) - Placement, retries, and visibility guarantees
- [Evaluating Lagrange](docs/evaluate.md) - Workload evaluation checklist
- [Migration and Adoption](docs/migration.md) - Introducing Lagrange into an architecture
- [Security](docs/security.md) - Trust model and capability boundaries
- [Architecture Index](architecture/INDEX.md) - Cluster internals and system model

---

## Repository Layout

- [`examples/call-binding-account-summary/`](examples/call-binding-account-summary/README.md) - Flagship code-first service and demonstration
- [`examples/service-data-affinity/`](examples/service-data-affinity/README.md) - 5-node MovieLens Top-N affinity study
- [`docs/`](docs/README.md) - Tutorials, guides, and reference manuals
- `src/authoring/` and `src/service/` - Guest-safe authoring API and WASI compiler
- `src/runtime/`, `src/query/`, and `src/raft/` - Storage engine, distributed query planner, and consensus
- [`architecture/`](architecture/INDEX.md) - System model, contract definitions, and invariants

---

## License and Contributions

Lagrange is licensed under AGPL-3.0-only. See [LICENSE](LICENSE).

The repository source is public; external pull requests are currently closed. Bug reports and feedback are welcome at [CONTRIBUTING.md](CONTRIBUTING.md). Agents working on the repository begin at [AGENTS.md](AGENTS.md).
