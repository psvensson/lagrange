# Documentation

Use the shortest path that answers the question in front of you.

## Decide whether to evaluate it

- [Related systems](related-systems.md) - familiar architectural ideas,
  external references, and where each analogy stops
- [Evaluating Lagrange](evaluate.md) - what it is, what changes in an existing
  system, current evidence, hard limits, and the pilot decision gate
- [Current capabilities and limitations](current-capabilities-and-limitations.md)
  - generated status authority for the checked-in implementation
- [Migration and adoption](migration.md) - SQL portability, WASM deployment,
  hot-path extraction, data loading, cutover, rollback, and exit planning
- [Security](security.md) - current controls and trusted-network assumptions
- [Operations readiness](operations-readiness.md) - topology, recovery,
  upgrades, backups, observability, and pilot drills

## Run the current service path

- [First hour](tutorials/first-hour.md) - run the code-first account-summary
  proof and scaffold a service
- [Deploy on Kubernetes and run cloud benchmarks](kubernetes-and-cloud-benchmarks.md) -
  deploy via Helm to an existing k8s cluster, configure credentials, and run cloud comparison suites
- [Account-summary example](../examples/call-binding-account-summary/README.md)
  - one HTTP endpoint, one distributed operation, two partitions, authorization,
  and replay
- [Examples](../examples/README.md) - public service examples, compatibility
  examples, comparison studies, and legacy internals

## Build a service

- [Programming model](native-programming-model.md) - `defineService`, handlers,
  distributed operations, reducers, generated deployment records, and current
  limits
- [Execution semantics](execution-semantics.md) - retries, idempotency,
  consistency, partial failure, movement, and budgets
- [Building and deploying a service](service-deployment-guide.md) - scaffold,
  generate, build, deploy, and the advanced runtime contract
- [Vocabulary](vocabulary.md) - source-level terms, WASM/WASI/WIT, and the
  relationships between Artifacts, Bindings, Cells, partitions, and replicas

## Measure a workload

- [Cloud comparison benchmarks](kubernetes-and-cloud-benchmarks.md#part-2-running-all-comparison-scenarios-in-your-own-cloud-or-lab) -
  execute Scenario A (OLTP), B (locality), C (freshness), and MovieLens on your cloud infrastructure
- [Performance and network-cost measurement](performance-and-cost-estimation.md)
  - formulas and a measurement worksheet without product-wide speedup claims
- [Infrastructure capacity measurement](infrastructure-cost-estimation.md) -
  compare separate and combined fleets without equating VM count with savings
- [Rewrite a hot path](tutorials/rewrite-a-hot-path.md) - a strong grouped-SQL
  baseline and the partition-function shape
- [MovieLens comparison](../examples/service-data-affinity/README.md) -
  correctness, transfer shape, and placement evidence; runs a code-first WASI
  `call` Binding across a local 3-node cluster (not a multi-machine production
  benchmark)
- [Comparative benchmark statistics](benchmarks/README.md) - multi-system graphical summaries and detail links across PostgreSQL (single-primary and Patroni sync-HA), TiDB/TiKV, and Lagrange ([interactive HTML landing page](benchmarks/index.html))
- [TiDB/TiKV and Lagrange comparison progress](benchmarks/tidb-comparison-progress.md) - persisted results across framework, Lagrange, and TiDB/TiKV versions and commits ([interactive HTML dashboard](benchmarks/tidb-comparison-progress.html))

## Operate a cluster

- [Kubernetes deployment with Helm](kubernetes-and-cloud-benchmarks.md#part-1-deploying-lagrange-on-an-existing-kubernetes-cluster-chartslagrange-node) -
  StatefulSet topology, secret management, port-forwarding, and service lifecycle
- [Bootstrap and readiness probes](bootstrap-readiness-probes.md)
- [Listener port model](listener-port-model.md)
- [Storage capacity operations](storage-capacity-operations.md)
- [Runtime resource diagnostics](runtime-resource-diagnostics.md)
- [Latency and topology operations](latency-topology-operations.md)
- [Admin API reference](admin-api-reference.md)

The operational references describe mechanisms. Use
[Operations readiness](operations-readiness.md) for the product-level gaps and
pilot gates.

## Understand the architecture

- [Architecture index](../architecture/INDEX.md) - question-based map
- [System model](../architecture/system-model.md) - durable objects, node
  anatomy, request paths, and placement
- [Partitioning](../architecture/process-partitioning.md)
- [Replication and recovery](../architecture/process-replication.md)
- [Request routing](../architecture/process-request-routing.md)
- [Data affinity](../architecture/process-data-affinity.md)
- [Rebalancing](../architecture/process-rebalancing.md)

## Repository orientation

If you are browsing the source checkout for the first time, focus on the
application and evaluation surfaces first:

| Directory | Audience | What is inside |
| --- | --- | --- |
| [`examples/`](../examples/README.md) | Application & platform evaluators | Runnable services (`call-binding-account-summary`, `service-data-affinity`) and cluster examples |
| `src/authoring/` | Service authors | The four guest-safe authoring helpers (`defineService`, `distributed`, `http`, `sql`) |
| `src/service/` & `src/cli/` | Service toolchain | Compiler, IR normalizer, deployment-record generator, and `lagrange service` CLI |
| `src/runtime/`, `src/query/`, `src/raft/` | Runtime engineers | Partition SQL engine, parallel `run`/`reduce` coordinator, and Rust/WASM Raft replication |
| [`architecture/`](../architecture/INDEX.md) & `test/` | Contributors & auditors | Formal system model, TLA+/Alloy specifications, and unit/integration/distributed test suites |

Repository-development material lives behind
[CONTRIBUTING.md](../CONTRIBUTING.md). It is not part of the product
evaluation path.
