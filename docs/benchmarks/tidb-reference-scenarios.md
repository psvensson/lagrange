# TiDB/TiKV reference benchmark scenarios

Status: design contract v2

This document defines two permanent comparative scenarios for Lagrange against
TiDB/TiKV. They are intended to run through the same GCP-oriented distributed
benchmark machinery as the existing comparative evidence runs.

The scenarios deliberately answer two different questions:

1. **Database baseline:** how expensive is Lagrange as an ordinary distributed
   SQL database when none of its unusual execution capabilities help it?
2. **Architecture thesis:** when the application itself is a dynamic distributed
   computation over partitioned data, does integrating that computation into the
   data-placement/runtime layer provide a measurable advantage over a fair
   TiDB/TiKV implementation?

These are benchmark contracts, not expected marketing results. A result that
contradicts the target hypothesis is valid evidence and must not be discarded.
The contract must not be changed after a comparative run has started merely to
improve either system's result.

## Common comparison rules

### Architecture-native topology and matched budget

"Same node count" is not the fairness primitive.

TiDB/TiKV deliberately decomposes SQL, placement/control, storage, analytical
replicas, and application coordination into different roles. Lagrange deliberately
integrates more of those roles into the same distributed runtime. A benchmark
that mechanically forces identical process placement can therefore handicap one
architecture or hide the cost of mandatory components.

Every publishable comparison must report two views where practical:

1. **Architecture-native footprint**
   - each system uses the smallest credible production-like topology required by
     its own architecture for the scenario;
   - RF=3 and the scenario's durability/correctness contract remain mandatory;
   - every mandatory component is counted in cost and resource totals.
2. **Matched total budget**
   - both systems receive the same total database/application-side VM budget,
     vCPU budget, memory budget, persistent-disk class/capacity, and relevant
     provisioned disk performance;
   - each system may distribute that budget according to its architecture;
   - the separate workload generator is outside both system budgets.

A headline result must identify which view it represents. If only one view is
currently implemented, evidence is non-comparative until that limitation is made
explicit and accepted for the run.

### Common infrastructure and durability

Both sides must otherwise use equivalent constraints:

- same GCP machine classes for comparable roles/budget slices;
- replication factor 3;
- same deterministic logical dataset and workload seed;
- same workload generator implementation and offered-load schedule;
- workload generator on a separate VM in the same zone/latency group as the
  initial single-zone database profile;
- the controller/orchestrator must not be on the measured SQL/request data path;
- same warm-up, measurement, and cool-down rules;
- identical request success semantics;
- identical request timeout and SLO classification;
- equivalent durable-commit requirements;
- persistent storage must use explicitly recorded, equivalent GCP disk classes
  rather than Docker writable layers for publishable runs;
- resource accounting must include all mandatory runtime components;
- network bytes must be observed at the relevant interfaces/edges, not estimated
  from logical payload size;
- p50, p95, p99, throughput, error rate, CPU, memory, disk IO and network bytes
  are mandatory output fields;
- each result records exact Lagrange commit, TiDB/TiKV versions, image identities,
  GCP topology, disk configuration, benchmark contract version, dataset identity,
  workload-plan identity, and measurement implementation identity.

TiDB/TiKV must not be intentionally handicapped. For each scenario the reported
TiDB result is the best valid implementation among the comparison modes defined
for that scenario.

The benchmark harness owns comparison semantics. Individual database adapters
must not redefine success, resource accounting, time windows, retry semantics,
statistical rules, or the independent correctness oracle.

### Transaction and retry semantics

Before the first comparative run, each scenario must preregister a database-
independent correctness contract rather than relying on product-specific
isolation-level names.

The contract must state:

- required visibility/isolation properties;
- forbidden anomalies;
- whether deadlock/conflict retries are allowed;
- maximum retry count if retries are allowed;
- that retry time remains inside the original request latency clock;
- timeout semantics;
- what constitutes a committed/successful transaction;
- whether a client disconnect or ambiguous commit is a failure for benchmark
  scoring;
- any known semantic difference that cannot be made equivalent.

Neither side may silently weaken correctness or durability to improve throughput.

### Benchmark optimization policy

Both systems may use ordinary, documented, production-reasonable optimizations
that preserve the benchmark semantics.

Examples include:

- appropriate secondary/compound indexes;
- ordinary statistics collection / `ANALYZE`;
- connection pooling and prepared statements;
- documented partition/split/preallocation guidance;
- documented memory/cache configuration;
- topology-aware read modes where semantics permit them.

Benchmark-only shortcuts, hidden semantic relaxations, or implementations that a
competent operator would not deploy are invalid.

### Offered load and coordinated omission

Correctness smoke runs may use a fixed closed-loop worker count. Publishable
performance comparisons must not use a single closed-loop concurrency number as
the headline result.

The comparison owner must drive a deterministic open-loop offered-load schedule.
Each request records its intended issue time; latency begins at that intended
issue time so queueing delay is visible rather than omitted.

An initial schedule may use fixed steps, for example:

```text
100 requests/s
150 requests/s
200 requests/s
...
```

until the scenario SLO or error threshold is violated.

The published evidence must contain the complete offered-load/throughput/latency
curve, not only the best point.

### Repeated paired evidence

A publishable comparison requires repeated paired runs on controlled
infrastructure. The paired comparison owner must reuse the repository's existing
comparative-evidence practices where applicable:

- preregistered configuration;
- randomized or counter-balanced system order;
- exact semantic/dataset/workload digests;
- exact resource evidence;
- confidence/statistical summaries;
- invalid-run classification rather than silent deletion.

No single successful GCP run is a publishable comparative result.

## Scenario A: `tidb-oltp-baseline`

### Purpose

Establish the cost of Lagrange's more general runtime on an ordinary distributed
OLTP workload where compute-to-data service execution is not expected to give a
material advantage.

This scenario is intentionally unfriendly to Lagrange's special execution model.
It is primarily a credibility, engineering-target, and regression baseline.
Mature Lagrange is not required to beat TiDB here.

A large TiDB advantage is a valid and useful result.

### Comparison restrictions

TiDB side:

- TiDB + TiKV using normal transactional SQL execution;
- ordinary production-reasonable schema/index/statistics tuning is permitted.

Lagrange side:

- PostgreSQL-wire/public SQL path only;
- no WASM service, `ctx.call`, custom service endpoint, or benchmark-only compute
  path may replace a transaction that is expressed as SQL on the TiDB side;
- ordinary production-reasonable indexing/partition/planner configuration is
  permitted.

The purpose is to compare the systems as distributed SQL databases, not to find a
way for Lagrange's service runtime to escape an ordinary database workload.

### Topology views

#### Architecture-native footprint

Use the smallest credible RF=3 topology for each system and account every
mandatory component.

For TiDB this may include separate or colocated TiDB, PD, and TiKV roles according
to a documented reasonable deployment. For Lagrange it uses the corresponding
credible Lagrange cluster.

#### Matched-budget profile

The first target matched-budget profile is:

- equal total database-side VM count and machine type for both systems;
- RF=3;
- one separate load-generator VM outside the system budget;
- one GCP zone;
- equivalent persistent-disk class/capacity/performance budget.

A likely first profile is four system VMs plus one workload-generator VM, but the
exact role placement must be preregistered before a comparative run and may not be
changed after seeing results.

### Dataset profiles

The existing small deterministic dataset remains a permanent **smoke** profile for
correctness and harness validation. It must not be presented as the database
baseline.

Publishable comparison should eventually contain at least two profiles:

1. **hot-OLTP**
   - active working set comfortably fits the aggregate useful cache;
   - primarily exposes transactional/runtime/planner overhead.
2. **storage-OLTP**
   - logical dataset is large enough to create material cache and disk pressure;
   - target scale should be large relative to per-node memory (initial planning
     target roughly 24-32 GB logical data for n2-standard-4-class nodes, subject
     to preregistration after measuring actual generated-row size).

The same generated logical dataset is loaded into both systems for each profile.

### Schema and workload

Use a TPC-C-derived transactional model rather than a synthetic single-table
write loop. The minimum schema contains:

- warehouse;
- district;
- customer;
- orders;
- order_line;
- stock;
- item;
- new_order/history or equivalent required by the transaction semantics.

The canonical initial transaction mix is:

- 45% new-order;
- 43% payment;
- 4% order-status;
- 4% delivery;
- 4% stock-level.

The deterministic operation plan and dataset identities must be identical across
systems.

### Correctness oracle

The workload owner must define system-independent semantic checks for each
transaction family. At minimum the comparison must prove equivalent externally
observable state transitions and invariant preservation rather than merely
accepting the same number of successful API calls.

The oracle must not define correctness as "TiDB and Lagrange returned the same
thing"; it is an independent contract consumed by both adapters.

### Primary performance result

The preferred baseline headline is:

> maximum committed transactions/second while p99 remains below the preregistered
> SLO and error rate remains below the preregistered threshold.

The complete offered-load curve remains part of the evidence.

### Mandatory measurements

- committed transactions per second;
- offered requests per second;
- p50/p95/p99 transaction latency including queueing;
- transaction abort/error/retry rate;
- CPU-seconds per 1,000 committed transactions;
- mean and peak memory;
- disk bytes/operations read and written;
- network bytes sent/received;
- total architecture-native resource footprint;
- matched-budget result where available;
- recovery behaviour for one controlled node restart in a later subphase.

### Interpretation

This scenario has no "Lagrange must win" condition. The mature engineering goal
is to keep the ordinary-database tax bounded and visible.

Initial target envelope, to be treated as an engineering objective rather than a
release gate until enough repeated evidence exists:

- sustained throughput at least 70% of TiDB at the same preregistered SLO;
- p99 no worse than 1.5x TiDB at a matched sustainable offered load;
- no semantic or durability relaxation relative to the common contract.

If early Lagrange is materially worse, that is a valid baseline to chase.

## Scenario B: `tidb-distributed-risk-decision`

### Purpose

Test the architectural thesis that a runtime which owns both partition placement
and application execution can outperform a conventional distributed database plus
an external application/coordinator tier when a request forms a dynamic
distributed call graph.

The benchmark represents fraud/risk correlation, but the same shape corresponds
to SIEM, observability, ad-tech and IoT correlation workloads.

The claim under test is deliberately narrower than "compute near data". TiDB/TiKV
already supports substantial storage-side reduction. The question is whether
**integrated application composition plus data placement** provides an advantage
as distributed graph complexity and topology cost increase.

### Data model

At minimum:

- accounts and account event history;
- merchants and merchant event history;
- devices and device event history;
- related-account/reputation data;
- incoming transaction/request input.

Each entity family is partitioned by its natural entity id. Histories must be
large enough that local reduction is materially cheaper than shipping raw rows.

Two initial data profiles are required:

1. **risk**
   - moderate per-entity histories representative of an online risk decision;
   - used to test whether the architecture helps before histories become huge.
2. **heavy-correlation**
   - larger histories representative of SIEM/observability/correlation workloads;
   - planning ranges may use account 5-50 MB, merchant 1-20 MB, device 1-10 MB
     per active entity.

Exact generated sizes are deterministic and recorded in evidence.

### Primary benchmark histories are read-only

For the first architecture-thesis comparison, history tables are preloaded and
immutable during the timed decision request. The incoming transaction is input to
the decision but is not appended to the histories inside the primary timed path.

This isolates the architectural question:

```text
locate data
-> reduce local history
-> decide the next calls dynamically
-> execute distributed calls
-> combine small results
```

A later profile may add continuous ingestion, but it is a separate experiment.

### Independent request oracle

Every generated request has an independent expected result and expected allowed
call-graph shape. Evidence should be able to identify at least:

- request id and deterministic input ids;
- actual graph shape taken;
- account-stage result/digest;
- merchant-stage result/digest when called;
- device-stage result/digest when called;
- related-account-stage result/digest when called;
- final decision/result.

Prefer deterministic integer/fixed-point reducers where practical so floating-
point variance does not become benchmark noise.

Both systems consume the same oracle. One system's output is never the definition
of the other's correctness.

### Graph-complexity ladder

Graph complexity is an explicit experimental axis, not merely an aggregate request
mix. Required profiles are:

1. **local only**: `account`;
2. **one remote stage**: `account -> merchant`;
3. **sequential**: `account -> merchant -> device`;
4. **fan-out**: `account -> {merchant, device, related-account}`;
5. the same shapes under controlled latency-group/topology cost.

The graph is data-dependent: the complete set of calls is not known until earlier
stage results are available.

The final decision result is small (target <= 1 KiB) relative to the history read
locally by each stage.

The benchmark must publish results per graph shape as well as an aggregate mix.
A particularly useful outcome would be TiDB winning the local-only stage while the
curves cross only as distributed graph complexity increases; that is stronger
evidence for the architecture thesis than one cherry-picked aggregate win.

### Lagrange implementation

Use versioned WASM services placed/executed with their relevant partitions.

Minimum service set:

- `account-risk`;
- `merchant-risk`;
- `device-risk`;
- related-account/reputation service if the mature API requires a distinct
  service boundary.

Remote composition must use the ordinary Lagrange distributed invocation path
(`ctx.call` or its mature equivalent), not benchmark-only shortcuts.

The service identity must remain stable when partitions move.

### TiDB/TiKV implementation

TiDB/TiKV receives the strongest valid implementation for each graph/data profile.
The benchmark must not force raw history through the coordinator when storage-side
or analytical reduction can avoid doing so.

Valid TiDB comparison modes include:

1. normal TiDB SQL and ordinary pushdown where the workload can be expressed
   faithfully;
2. TiKV native/coprocessor-v2 extension for account, merchant, device, and
   related-account local reduction when the benchmark can prove the intended
   local reducer is actually executing;
3. TiFlash/MPP for a stage whose semantics are genuinely analytical and for
   which TiFlash is a valid production implementation;
4. topology-aware/follower-read modes where they preserve the required semantics;
5. an external coordinator/application tier for dynamic call-graph composition.

If multiple modes are valid, the best preregistered valid TiDB result is the
comparator.

The coordinator/application tier's CPU, memory, network, and VM budget are part
of the TiDB system resource total because it is required to execute the
application graph.

### Coordinator fairness in latency profiles

A single centralized TiDB-side coordinator must not be forced on the multi-island
profile if a competent implementation would distribute the application tier.

The TiDB side may run one coordinator/application instance per latency group when
that improves the result. All such instances are included in architecture-native
and matched-budget accounting.

This turns the comparison into the intended architectural question:

```text
TiKV local reducers + distributed external application tier
versus
Lagrange colocated services + ctx.call inside the placement/runtime layer
```

rather than an artificial centralized-coordinator penalty.

### Initial topology profile

First implementation:

- RF=3;
- physical storage replicas on distinct database/storage VMs;
- one separate same-zone load-generator VM;
- TiDB-side coordinator/application VM(s) if required by the selected mode;
- single region/zone profile before any artificial latency impairment;
- architecture-native and matched-budget views as defined above.

Second profile:

- at least five database/storage-capable nodes where appropriate;
- at least three latency groups;
- controlled inter-group delay;
- same logical dataset, oracle, graph-shape profiles and offered-load rules.

A later profile may use separate GCP regions, but the first latency-topology proof
uses controlled impairment so runs remain repeatable.

### Latency-group network owner

The latency/topology owner is authoritative for both impairment and expensive-edge
network accounting.

It must own:

- deterministic `tc`/netem or equivalent impairment;
- per-direction packet/byte counters at each shaped edge;
- the mapping from nodes/processes to latency groups;
- start/end of the measured edge-accounting window.

Logical result size or summed container RX+TX is not a substitute for expensive-
edge byte accounting because it can miss or double-count traffic.

### Movement subphase

After steady state is measured, trigger controlled partition/replica movement
while requests continue.

Measure:

- p99 spike during movement;
- failed requests;
- stale-route/redirect count where observable;
- time until routing converges;
- bytes moved for data placement;
- whether compute/service placement converges with the data without manual
  benchmark-side orchestration;
- coordinator/application reconfiguration work required on the TiDB side.

### Mandatory measurements

In addition to the common measurements:

- decisions per second under a fixed p99 SLO;
- offered decisions per second;
- p50/p95/p99 including queueing;
- WAN/inter-latency-group bytes per completed decision measured at shaped edges;
- sequential expensive-edge round trips per decision;
- coordinator CPU-seconds per 1,000 decisions;
- total coordinator memory/network footprint;
- percentage of requests by graph shape;
- per-shape throughput and latency;
- local bytes scanned/reduced per stage;
- result bytes emitted per stage;
- movement-subphase latency and convergence metrics.

### Primary score

The preferred headline metric is:

> maximum sustained completed decisions/second while p99 remains below the
> preregistered scenario SLO and error rate remains below the allowed threshold.

The complete offered-load curve is part of the result.

Initial SLO candidate:

- p99 < 100 ms for the single-region profile where feasible;
- error rate < 1%.

The SLO may be amended before the benchmark becomes comparative/release evidence,
but once a run is preregistered it is immutable for that run.

### Mature Lagrange target

These are explicit architecture targets, not assumed outcomes:

- >= 2x TiDB/TiKV sustained decisions/sec at the same SLO in at least one
  distributed-risk profile; or
- <= 0.5-0.7x TiDB p99 at matched sustainable throughput;
- materially lower external coordinator/application CPU;
- materially fewer bytes and round trips across expensive topology edges;
- no loss of service identity or request correctness during partition movement.

If mature Lagrange cannot demonstrate an advantage on this scenario despite fair
TiKV/TiFlash local reduction and a competent distributed coordinator tier, that is
evidence against the claim that integrated compute/data placement provides a
meaningful application-level performance advantage and must be treated as such.

## GCP execution contract

Both scenarios become normal comparative evidence only through the common paired
benchmark owner. Scenario-local GCP/Docker scripts may exist as lifecycle and
correctness proofs, but they are non-comparative until routed through that owner.

The current implementation sequence is:

1. **contract**: maintain this immutable comparative methodology;
2. **TiDB lifecycle**: exact pinned TiDB/TiKV/PD images, readiness, RF=3 and
   cleanup proof;
3. **workload owner**: deterministic OLTP dataset/operation plan and independent
   semantics;
4. **TiDB adapter**: persistent native SQL connections and correctness proof;
5. **resource evidence**: measurement-window CPU/memory/network/block-IO
   accounting;
6. **load-generator owner**: separate same-zone workload VM, controller removed
   from the SQL data path;
7. **physical TiDB topology**: one TiKV replica per distinct storage VM with
   equivalent persistent disks;
8. **topology contracts**: architecture-native and matched-total-budget profiles;
9. **Lagrange OLTP adapter**: public SQL only, same dataset/operation/oracle;
10. **open-loop paired owner**: offered-load/SLO sweep, queue-inclusive latency,
    repeated randomized/counter-balanced paired runs and statistical evidence;
11. **first Scenario A baseline**: publish even if Lagrange loses badly;
12. **Scenario B oracle/dataset**: deterministic risk and heavy-correlation
    profiles plus graph-shape ladder;
13. **Lagrange risk services**: ordinary versioned WASM + `ctx.call` path;
14. **strong TiDB comparators**: SQL/pushdown, proven TiKV coprocessor-v2/native
    reducer, TiFlash/MPP where valid, topology-aware reads, and external
    coordinator tier;
15. **latency-group owner**: deterministic impairment plus authoritative edge
    bytes/packets;
16. **movement subphase**;
17. only after repeated valid comparative runs, consider release-gate thresholds.

Each step must remain independently reviewable. Smoke/proof results are useful
engineering evidence but must remain explicitly `comparable: false` until all
required comparative owners and fairness contracts are satisfied.
