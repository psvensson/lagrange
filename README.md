# Lagrange

### Distributed SQL with data-local service execution

Lagrange is an experimental distributed database that runs service logic on the
nodes holding the data it uses.

In a conventional architecture, application services and database partitions
are placed independently. A request may reach an arbitrary service replica,
fetch rows from a remote database partition, do the useful work elsewhere, and
send a write or result back across the network.

Lagrange coordinates those layers. It partitions and replicates tables, deploys
disposable service instances, and continuously places those instances near the
relevant data replicas.

This is designed to provide:

- **lower latency for partition-local operations** by removing an avoidable
  service-to-database network hop
- **less data movement for distributed operations** by filtering and
  aggregating near the partitions
- **less manual topology management** because service placement follows data
  as partitions split, move, and rebalance

Lagrange does not eliminate networking, routing, or consensus. Writes still
commit through Raft, and distributed operations still communicate. The
difference is that data locality becomes something the cluster creates and
maintains rather than something application teams engineer manually.

> **Current status:** Lagrange contains working distributed storage,
> transactions, SQL routing, genuine WASI service execution, placement
> machinery, diagnostics, and distributed failure testing. It remains a
> substantial experimental system, not a production-ready drop-in database.

- [Understand the architecture](architecture/INDEX.md)
- [See current capabilities and limitations](docs/current-capabilities-and-limitations.md)
- [Run the first-hour tutorial](docs/tutorials/first-hour.md)
- [Follow the roadmap](roadmap.md)

---

## What Changes With Lagrange

### Conventional placement

```text
client
  -> independently placed service replica
  -> remote database partition
  -> replicated commit or query result
  -> service replica
  -> client
```

Application placement and data placement are separate concerns. Even when both
systems are individually well tuned, requests can repeatedly cross the boundary
between them.

### Lagrange placement

```text
client
  -> service logic beside the relevant partition
  -> replicated commit or partition-local result
  -> client
```

Once the target partition is known, Lagrange can route execution beside a
suitable replica. For multi-partition work, computation can fan out to the data
and return compact partial results instead of pulling every raw or intermediate
row into an application tier.

The cluster keeps this locality aligned over time. When partitions split,
replicas move, nodes join or leave, or access patterns change, Lagrange
reconciles service placement rather than leaving the original topology to
decay.

### Four important paths

#### Single-partition requests: remove a mandatory hop

![Single-partition request comparison: a conventional service tier makes remote data calls, while Lagrange routes to replica-local execution](docs/images/single-partition-request.png)

Once the target partition is known, work can run beside a suitable replica
instead of requiring a round trip through a separately placed service tier.

#### Multi-partition operations: move work, not raw data

![Multi-partition operation comparison: a conventional service tier pulls raw rows inward, while Lagrange fans work out and returns compact partial results](docs/images/multi-partition-operation.png)

Filters, joins, and partial aggregations can happen near the rows, with compact
results moving across the network instead of every raw or intermediate row.

#### Writes: keep consensus, shorten the application path

![Write-path comparison: both approaches retain Raft replication, while Lagrange removes the remote service-to-leader hop](docs/images/write-path.png)

The leader still commits through a Raft quorum. Validation, application logic,
and response construction can run leader-local without trading away durability.

#### Placement and rebalancing: keep locality aligned

![Placement and rebalancing sequence: execution follows a data replica as policy moves it to another node](docs/images/placement-and-rebalancing.png)

When replicas move because of pressure, failures, or policy, Lagrange
reconciles service placement and routing so execution follows the data without
a manual service redeployment.

---

## A Concrete Example

Consider an IoT service that receives a measurement, reads the device's current
state, validates the new value, updates an aggregate, and records an audit row.

In a conventional architecture:

1. the request reaches an arbitrary service replica
2. that service fetches device state from a remote database partition
3. validation and transformation happen in the application tier
4. writes cross the network back to the database
5. the service scheduler and database placement system are operated separately

With Lagrange:

1. the request is routed to a service Cell near the device's partition
2. validation and application logic run beside that data
3. the write still commits through Raft
4. cross-partition work is explicit when another partition is genuinely needed
5. if the partition moves or splits, the cluster adjusts Cell placement

The durability model remains distributed, but an avoidable
application-to-database boundary can disappear.

---

## How It Works

Three ideas define the cluster:

1. **Tables are partitioned and replicated.** Each partition is a Raft group
   storing its data in SQLite. Hot partitions can split, and replica placement
   balances load, spread, and capacity.
2. **Service execution is placed near observed data access.** A deployed
   service runs as disposable Cells. The placement system pulls those Cells
   toward nodes holding replicas of the partitions they use.
3. **Data and service placement are continuously reconciled.** Replica moves,
   node changes, partition splits, and changing access patterns all feed the
   same ongoing placement process.

Durable service state belongs in ordinary partitioned and replicated tables.
Cells do not have a separate per-service Raft log and should be treated as
replaceable compute.

### Three Lagrange concepts

- **Artifact:** immutable, digest-pinned service code
- **Binding:** immutable execution intent connecting an Artifact export to a
  source such as an HTTP request
- **Cell:** a ready running instance derived from a Binding and placed by the
  cluster

Today externally installed services are genuine WASI components. OCI container
execution is planned but not yet supported.

---

## What Exists Today

This repository contains real distributed database machinery, not only design
notes:

- range-partitioned tables backed by SQLite
- Raft replication and partition ownership
- multi-partition transactions with recovery and timeout handling
- one SQL execution engine shared by clients, services, and internal queries
- PostgreSQL wire support for a bounded measured SQL slice
- genuine WASI component execution through Artifact / Binding / Cell
- service placement and observed data-affinity machinery
- diagnostics, health probes, live-query support, and an admin CLI
- distributed failure and stress-testing infrastructure

The authoritative implementation-status document is
[current capabilities and limitations](docs/current-capabilities-and-limitations.md).
It distinguishes implemented, partial, and unsupported behavior and should be
read before evaluating Lagrange for a real workload.

---

## Good Fit

Lagrange may be a good fit when:

- application servers repeatedly retrieve substantial operational data merely
  to filter, aggregate, validate, or transform it
- request latency includes a meaningful service-to-database network round trip
- custom logic needs to follow sharded or partitioned data as ownership changes
- maintaining matching application and database topologies has become costly
- a workload combines transactional storage with partition-aware service logic

### Who should try it today

- distributed-systems researchers
- early design partners
- teams evaluating data-local execution
- developers willing to work with an experimental system

## Not A Good Fit

Lagrange is probably the wrong tool if you need:

- a mature drop-in production database today
- polished one-command deployment and operations workflows
- a general-purpose serverless platform
- unmodified OCI container deployment today
- strict operational separation between database and service tiers
- a small workload where data movement and topology management are not material
  costs

---

## How It Compares

| Compared with | The important difference |
| --- | --- |
| Kubernetes plus a distributed database | Kubernetes primarily places compute from declared resource requirements. Lagrange also derives placement from data ownership and observed access. Lagrange can itself run on Kubernetes. |
| Stored procedures | Stored procedures move logic into a database process. Lagrange places distributed service execution across partitioned data and continuously reconciles that placement. |
| Spark or Flink | Those systems generally start from compute applied to attached or external data. Lagrange starts from operational, partitioned, replicated data and asks how much compute should live there too. |
| Generic serverless | Generic serverless is centered on stateless function execution. Lagrange is anchored in storage ownership, replication, transactions, and routing. |

Lagrange is not attempting to eliminate all network traffic or replace every
queue, cache, stream processor, or application service. Its focus is narrower:
make the placement and movement costs around operational data explicit, then do
useful work locally whenever possible.

---

## Try Lagrange

The recommended introduction is the
[first-hour tutorial](docs/tutorials/first-hour.md). It starts a local node,
performs a SQL round trip, inspects partition routing, and runs a genuine WASI
request Binding.

### Requirements

- Node.js 22.12 or newer
- npm

### Start a local node

```bash
npm install
cp .env.example .env
npm start
```

The default listeners are:

- REST API: `8080`
- admin WebSocket: `8081`
- node transport: `8082`

Open the administration client in another terminal:

```bash
npm run cli -- localhost:8081
```

For Docker, Kubernetes, multi-node setup, readiness behavior, and the genuine
WASI deployment walkthrough, continue with:

- [First hour with Lagrange](docs/tutorials/first-hour.md)
- [Service deployment guide](docs/service-deployment-guide.md)
- [JavaScript request-binding example](examples/js-request-binding-deployment/README.md)
- [Helm chart documentation](charts/lagrange-node/README.md)

---

## Architecture And Development

Start with:

- [Architecture index](architecture/INDEX.md)
- [Illustrated system model](architecture/system-model.md)
- [Current capabilities and limitations](docs/current-capabilities-and-limitations.md)
- [Documentation journeys](docs/start-here.md)
- [Platform doctrine](platform-doctrine.md)
- [Edition matrix](edition-matrix.md)

Working on this codebase with an AI agent, including Codex? Start at
[AGENTS.md](AGENTS.md). Test, debugging, and release workflows begin at
[CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

AGPL-3.0. See [LICENSE](LICENSE).

This project is open source but **closed to outside contributions**
("open-source, not open-contribution", like SQLite). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the rationale. Bug reports are welcome;
pull requests are disabled.
