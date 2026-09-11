# TiDB/TiKV reference benchmark scenarios

Status: design contract

This document defines two permanent comparative scenarios for Lagrange against
TiDB/TiKV. They are intended to run through the same GCP-oriented distributed
benchmark machinery as the existing comparative evidence runs.

The scenarios deliberately answer two different questions:

1. **Baseline parity:** is Lagrange a credible distributed database on a workload
   that does not particularly favour its compute-to-data architecture?
2. **Architecture thesis:** is there a realistic workload where integrated
   placement of data and application computation gives Lagrange a measurable
   advantage over TiDB/TiKV, even when TiKV receives a fair storage-side
   implementation?

These are benchmark contracts, not expected marketing results. A result that
contradicts the target hypothesis is valid evidence and must not be discarded.

## Common comparison rules

Both sides must use equivalent infrastructure and durability constraints:

- same GCP machine class per database/storage node;
- same node count unless a scenario explicitly models an external coordinator;
- replication factor 3;
- same dataset and deterministic workload seed;
- same client generator and offered-load schedule;
- same warm-up, measurement, and cool-down windows;
- identical success semantics;
- identical request timeout and SLO classification;
- resource accounting must include all required runtime components;
- network bytes must be observed, not estimated from logical payload size;
- p50, p95, p99, throughput, error rate, CPU, memory, disk IO and network bytes
  are mandatory output fields;
- each result records exact Lagrange commit, TiDB version, TiKV version, image
  identities, GCP machine type and scenario contract version.

TiDB/TiKV must not be intentionally handicapped. For each scenario the reported
TiDB result is the best valid implementation among the comparison modes defined
for that scenario.

The benchmark harness owns comparison semantics. Individual database adapters
must not redefine success, resource accounting, time windows, or statistical
rules.

## Scenario A: `tidb-oltp-baseline`

### Purpose

Establish the cost of Lagrange's more general runtime on an ordinary distributed
OLTP workload where compute-to-data service execution is not expected to give a
material advantage.

This is primarily a credibility and regression baseline. Mature Lagrange is not
required to beat TiDB here.

### Shape

Initial GCP profile:

- 3 database/storage nodes per system;
- RF=3;
- one separate load-generator VM;
- single GCP region and zone class for the first implementation;
- identical CPU and memory limits per database/storage node.

Later profiles may add 5-node and multi-zone variants, but they must preserve the
same workload contract.

### Workload

Use a TPC-C-derived transactional model rather than a synthetic single-table
write loop. The minimum schema contains:

- warehouse;
- district;
- customer;
- orders;
- order_line;
- stock;
- item.

The transaction mix must include at least:

- new-order;
- payment;
- order-status;
- delivery;
- stock-level.

The initial implementation may use a reduced scale factor suitable for routine
GCP runs, provided the same generated dataset is loaded into both systems and the
working set is large enough that the run is not merely an in-memory microtest.

### Comparison modes

TiDB side:

- TiDB + TiKV using normal transactional SQL execution.

Lagrange side:

- PostgreSQL-wire/public SQL path only;
- no Lagrange-specific WASM service may replace a transaction that is expressed
  as SQL on the TiDB side.

### Mandatory measurements

- committed transactions per second;
- p50/p95/p99 transaction latency;
- transaction abort/error rate;
- CPU-seconds per 1,000 committed transactions;
- peak and mean memory;
- disk bytes read/written;
- network bytes sent/received;
- recovery behaviour for one controlled node restart in a later subphase.

### Interpretation

This scenario has no "Lagrange must win" condition. The mature engineering goal
is to keep the ordinary-database tax bounded and visible.

Initial target envelope, to be treated as an engineering objective rather than a
release gate until enough evidence exists:

- sustained throughput at least 70% of TiDB;
- p99 no worse than 1.5x TiDB at an offered load both systems can sustain;
- no semantic or durability relaxation relative to the TiDB run.

## Scenario B: `tidb-distributed-risk-decision`

### Purpose

Test the architectural thesis that a runtime which owns both partition placement
and application execution can outperform a conventional application/coordinator
plus storage-side coprocessors when the request forms a dynamic distributed call
graph.

The benchmark represents fraud/risk correlation, but the same shape corresponds
to SIEM, observability, ad-tech and IoT correlation workloads.

### Data model

At minimum:

- `accounts` and account event history;
- `merchants` and merchant event history;
- `devices` and device event history;
- incoming transactions.

Each entity family is partitioned by its natural entity id. Histories must be
large enough that local reduction is materially cheaper than shipping raw rows.

Suggested initial per-active-entity working-set ranges:

- account history: 5-50 MB;
- merchant history: 1-20 MB;
- device history: 1-10 MB.

The exact generated sizes must be deterministic and recorded in the evidence.

### Request semantics

A transaction first evaluates account-local history. The result determines
whether additional remote/entity work is required.

Required execution shapes must include all three forms:

1. local only: `account`;
2. sequential: `account -> merchant -> device`;
3. fan-out: `account -> {merchant, device, related-account}`.

The graph is data-dependent: the complete set of calls is not known until earlier
service results are available.

The final decision result is small (target <= 1 KiB) relative to the history read
locally by each stage.

### Lagrange implementation

Use versioned WASM services placed/executed with their relevant partitions.

Minimum service set:

- `account-risk`;
- `merchant-risk`;
- `device-risk`.

Remote composition must use the ordinary Lagrange distributed invocation path
(`ctx.call` or its mature equivalent), not benchmark-only shortcuts.

The service identity must remain stable when partitions move.

### TiDB/TiKV implementation

TiDB/TiKV receives a fair implementation with local reduction at the storage
side. The benchmark must not force raw history through the coordinator when a
TiKV coprocessor implementation can avoid doing so.

Valid TiDB comparison modes are:

1. normal TiDB SQL pushdown where the workload can be expressed faithfully;
2. TiKV coprocessor-v2/native extension for account, merchant and device local
   reduction;
3. an external coordinator/application process for the dynamic call graph.

If multiple modes are valid, the best valid TiDB result is the comparator.

The coordinator's CPU, memory and network usage are part of the TiDB system
resource total because it is required to execute the application graph.

### Initial topology profile

First implementation:

- 3 database/storage nodes;
- RF=3;
- one load-generator;
- one TiDB-side coordinator if required;
- single region, with artificial latency groups introduced only after the local
  correctness/performance scenario is stable.

Second profile:

- 5 database/storage nodes;
- at least three latency groups;
- controlled inter-group delay;
- same logical workload and request mix.

A later profile may use separate GCP regions, but the first latency-topology proof
should use controlled impairment so runs remain repeatable.

### Movement subphase

After steady state is measured, trigger a controlled partition/replica movement
while requests continue.

Measure:

- p99 spike during movement;
- failed requests;
- stale-route/redirect count where observable;
- time until routing converges;
- bytes moved for data placement;
- whether compute/service placement converges with the data without manual
  benchmark-side orchestration.

### Mandatory measurements

In addition to the common measurements:

- decisions per second under a fixed p99 SLO;
- WAN/inter-latency-group bytes per completed decision;
- number of sequential expensive-edge round trips per decision;
- coordinator CPU-seconds per 1,000 decisions;
- percentage of requests by graph shape;
- local bytes scanned/reduced per stage;
- result bytes emitted per stage;
- movement-subphase latency and convergence metrics.

### Primary score

The preferred headline metric is:

> maximum sustained completed decisions/second while p99 remains below the
> scenario SLO and error rate remains below the allowed threshold.

This prevents either side from winning by queueing work while tail latency
explodes.

Initial SLO candidate:

- p99 < 100 ms for the single-region profile;
- error rate < 1%.

The SLO may be amended before the benchmark becomes a release gate, but once a
comparative evidence run starts, it must be preregistered and immutable for that
run.

### Mature Lagrange target

These are explicit architecture targets, not assumed outcomes:

- >= 2x TiDB/TiKV sustained decisions/sec at the same SLO in at least one
  distributed-risk profile; or
- <= 0.5-0.7x TiDB p99 at matched sustainable throughput;
- materially lower coordinator CPU;
- materially fewer bytes and round trips across expensive topology edges;
- no loss of service identity or request correctness during partition movement.

If mature Lagrange cannot demonstrate an advantage on this scenario despite fair
TiKV local reduction, that is evidence against the claim that integrated
compute/data placement provides a meaningful application-level performance
advantage and must be treated as such.

## GCP execution contract

Both scenarios are intended to become normal distributed-run entries using the
existing GCP orchestration and artifact/report conventions.

The implementation should be split into small steps:

1. land this scenario contract;
2. add TiDB/TiKV lifecycle adapter with pinned images and health/readiness proof;
3. add a generic paired-system GCP topology owner rather than scenario-local
   Docker/GCP lifecycle code;
4. implement `tidb-oltp-baseline` workload and semantic parity checks;
5. run and stabilize the baseline on GCP;
6. implement the distributed-risk deterministic dataset and request oracle;
7. implement Lagrange risk services;
8. implement the TiDB/TiKV comparison path, including coprocessor-v2 only when
   the adapter can prove it is actually executing the intended local reduction;
9. add latency-group profile and movement subphase;
10. only after repeated valid runs, consider release-gate thresholds.

Each step must remain independently reviewable and must not change the benchmark
contract merely to improve a measured result.
