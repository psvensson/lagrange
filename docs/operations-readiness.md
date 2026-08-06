# Operations Readiness

Lagrange has substantial distributed-systems machinery, but it does not yet
have a complete production operations contract. This page separates active
recovery mechanisms from missing product guarantees.

## Deployment shape

A normal cluster runs one Lagrange process or container per node. Every node can
store partition replicas, host service Cells, accept selected ingress, and make
routing decisions from its local metadata view.

Persistent node state lives under `DATA_DIR`. Container deployments must mount
that directory. A node identity is minted on first start and restored from the
same directory; do not set a new `NODE_ID` for an existing volume.

Default listeners:

| Listener | Default | Notes |
| --- | ---: | --- |
| REST | 8080 | Liveness, startup, readiness, request Bindings |
| Admin WebSocket | 8081 | Unauthenticated; loopback by default |
| Node transport WebSocket | 8082 | Trusted private network only |
| PostgreSQL wire | Dynamic service endpoint | Exists where `sys-postgres-wire` is placed |

The REST, admin, and transport ports can be overridden independently but must be
distinct.

## Minimum topology

The default partition replica count is three. Three nodes are the technical
minimum for a normal three-voter shape, but they leave no maintenance headroom
after one node is unavailable.

For a serious pilot, use at least five nodes when resources permit. That is a
pilot recommendation, not a supported topology declaration. Record the actual
failure domains, storage capacity, and quorum assumptions in the pilot report.

A single-node demo proves API behavior only. It does not prove quorum,
replacement, placement, or failure recovery.

## Readiness

Use the dedicated probes:

- `/livez` - process liveness only;
- `/startupz` - bootstrap handoff;
- `/readyz` - traffic readiness; and
- `/health` - compatibility endpoint, not an orchestration oracle.

Do not route traffic because the process opened a port. Wait for readiness and
preserve structured retry or wait outcomes from long-running cluster changes.

## Replica recovery

Each SQLite-backed partition is a Raft group. The active recovery path includes:

- leader-created checkpoints;
- bulk snapshot transfer;
- atomic snapshot installation;
- follower recreation and resumed log application; and
- proof-gated compaction of the committed SQLite log prefix.

This bounds SQLite partition-log growth and allows a follower whose required
prefix was compacted to rebuild from a snapshot.

Important remaining limitations:

- message-group logs remain in memory, grow without the same compaction path,
  and recover by full replay;
- learner promotion is time-based and safety-count-based, not based on measured
  follower progress; and
- no public RTO is stated for a replica of a given size on named hardware and
  network links.

A pilot should wipe and rebuild one non-leader replica under foreground load,
then reconcile every acknowledged write against an independent oracle.

## Node loss and replacement

One lost replica in a healthy three-voter partition leaves a two-voter quorum,
but no further fault headroom. Under-replication receives elevated repair
priority and replacement uses the normal durable operation workflow.

A node-loss drill should verify:

- writes continue or fail in the expected quorum cases;
- under-replication becomes visible;
- replacement is placed on an eligible node;
- the new replica catches up;
- service Cells reactivate where needed;
- no acknowledged write is lost; and
- the cluster returns to its target replica shape.

Do not infer success from an empty local cache or a process remaining alive.
Inspect durable operation state and final data.

## Partition split and merge

Partition split and merge are durable workflows. The source partition remains
authoritative until cutover, and descriptor epochs fence requests that resolved
against an obsolete partition layout.

Current routing limitations make key choice operationally important:

- partition narrowing effectively expects a key column named `id`;
- range comparison is string-based;
- non-usable predicates scatter to all partitions; and
- secondary indexes are not available through the public SQL surface.

Before a pilot load, verify the primary-key shape, expected split points, write
hot spots, and fan-out behavior with `EXPLAIN DISTRIBUTED` and telemetry.

## Service operation

Service code is immutable and Cells are disposable. Installed component bytes
are stored in replicated internal tables; local artifact files are caches.

The service runtime currently needs operators to understand these limits:

- one distributed operation per pre-v2 code-first component;
- one nested distributed call per HTTP request;
- bounded shard input and partial output;
- one active invocation per component instance; and
- no caller cancellation.

Capacity planning must include both storage and service CPU, memory, I/O, and
failure headroom. Colocation does not make application CPU disappear.

## Backups and disaster recovery

Raft snapshots are replica-recovery artifacts. They are not a user-facing
backup product.

There is no supported backup, restore, or point-in-time recovery surface today.
There is no published procedure for rebuilding a whole cluster after losing all
replicas and system metadata.

For an evaluation:

- keep the source system as the system of record;
- keep independent exports of all loaded data;
- rehearse recreating the cluster and reloading the pilot dataset; and
- define the maximum acceptable data-loss and restore window outside Lagrange.

Do not claim an RPO or RTO that has not been measured end to end.

## Upgrades

`0.x` releases carry no backward-compatibility guarantee. There is no published
supported rolling-upgrade, downgrade, or mixed-version contract.

Before changing versions:

1. reproduce the workload on a disposable cluster;
2. read the changelog and capability page for both versions;
3. export or preserve the source data independently;
4. drain or account for non-terminal transactions and operations;
5. test full-stop upgrade and rollback; and
6. run the same correctness and failure drills used for the pilot.

A successful rolling-restart test in the repository is engineering evidence,
not a general mixed-version support promise.

## Observability

Available building blocks include structured logs, readiness probes, admin
views, runtime resource diagnostics, placement evidence, durable operation rows,
and test playback tools.

Missing product-level pieces include a published metrics contract, stable
alerting rules, tracing/export integrations, retention guidance, dashboards,
and named SLOs.

A pilot should produce its own dashboard for:

- request rate and latency;
- call fan-out and selected partitions;
- batch rows and bytes;
- partial counts and bytes;
- component CPU, wall time, and memory refusals;
- retries by classification;
- node and replica state;
- under-replication and operation age;
- storage admission pressure; and
- snapshot transfer duration and failure.

## Kubernetes and containers

The repository ships a distroless Linux/amd64 image and a Helm chart. The chart
uses persistent volumes, publishes REST and transport, and keeps the admin
listener pod-local.

The chart is deployment scaffolding, not a production certification. Verify
pod disruption, storage classes, anti-affinity, network policy, resource
requests and limits, endpoint publication, and recovery behavior in the target
cluster.

Node transport still requires a trusted private network even inside
Kubernetes. Apply a NetworkPolicy or equivalent control.

## Cross-region operation

Latency groups and placement machinery exist, but no supported cross-region
replication, failover, data-sovereignty, or latency contract is published.

Keep early pilots within one low-latency region unless the explicit goal is to
measure and implement the missing cross-region behavior.

## Pilot operations gate

Before making any path authoritative, require:

- a documented topology and failure-domain model;
- persistent storage and node-identity recovery;
- readiness-based traffic admission;
- one-node loss and replica rebuild under load;
- full-cluster recreation from an independent data copy;
- an upgrade and rollback rehearsal;
- listener-level security controls;
- resource and storage headroom measurements;
- operator dashboards and runbooks; and
- explicit acceptance of every unsupported operation.

Continue with [Security](security.md),
[Migration and adoption](migration.md), and
[Current capabilities and limitations](current-capabilities-and-limitations.md).
