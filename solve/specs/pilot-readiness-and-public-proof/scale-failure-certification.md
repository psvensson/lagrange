# Detailed design: Public-path scale and failure certification

Historical Quest: `public-path-scale-and-failure-certification` (Q11).
Requirements contract: [`requirements.md`](requirements.md) "Scale failure
certification". Epic:
[`solve/epics/pilot-readiness-and-public-proof.md`](../../epics/pilot-readiness-and-public-proof.md);
binding decisions cited as D1–D12. The broader public certification metric is
`sealed-bar`; Q11's sealed script predicate remains unchanged. Depends on
Q2–Q7 and Q10; consumes the Q1 report schema unchanged.

## Read execution isolation and cancellation continuation — 0.5

Draft [readonly-execution-cancellation](../../quests/readonly-execution-cancellation/quest.json)
owns this bounded continuation after the 0.4.1
[physical read-custody repair](paged-execution.md#current-physical-custody-correction-041).
The historical Q11 [record](../../quests/public-path-scale-and-failure-certification/quest.json)
and terminal log remain unchanged. Q11 consumes the new evidence for public
certification; this section does not grant that evidence or replace its seal.

At inspected main `ef93af85dcd6add82ff5b5fee21ca12d205c61cd`,
[`PartitionService.executeQuery`](../../../src/partition/partition-service-write-metrics-base.js)
performs synchronous native reads, and
[`collectBoundedSqliteRows`](../../../src/query/query-result-budget.js) checks
deadline/cancellation between yielded rows. Work before the first row can
therefore prevent those JavaScript checks from running. The actual
[guest worker](../../../src/runtime/wasi-component-cell-worker.js) instantiates
JCO-derived modules with V8 `WebAssembly.compile`; the
[runtime](../../../src/runtime/wasi-component-cell-runtime.js) already owns
worker admission, CPU sampling and termination. A proposed Wasmtime fuel or
epoch callback does not describe this engine. These source observations do
not measure starvation or cancellation latency.

Extend the existing read/query execution seam so admitted readonly SQLite
connections and their statements are owned by the execution worker and bound
to the storage incarnation from the custody owner. Preserve partition-local
execution, current SQL admission, result budgets and existing admission/queue
ownership. In-process SQLite handles do not become transferable JavaScript
objects; connection creation, use, interrupt and closure need one specified
lifetime protocol. Cancellation requests and replies carry the exact request,
connection and worker generation, including late, duplicate and reused-slot
cases. A worker exit is not evidence that a separately owned main connection
closed or that a committed operation rolled back.

**Feasibility precedes implementation.** Pin the supported better-sqlite3/native
binding version and demonstrate its usable interruption API, callback context,
connection scope and lifetime rules. A shared atomic flag is only a signal:
the busy native computation needs a supported mechanism that observes it. A
normal worker message cannot preempt synchronous native execution. If a scoped
binding extension is necessary, name its owner and maintenance/testing cost
before sealing; if no supported mechanism meets the bound, record that blocker
and narrow admission or refuse the affected work. Do not assume an unexposed
`sqlite3_progress_handler`, `sqlite3_interrupt`, V8 fuel hook or guaranteed
microsecond response. A progress callback's frequency is not a wall-clock bound.

Separate the following guarantees in API outcomes and evidence:

| Question | Required owner and observation |
| --- | --- |
| Has resource work stopped? | Execution/custody owner observes native work ending, buffers/slots released and exact-generation connection closure or continued owned refusal. |
| Did an operation commit? | Existing statement outcome, TX1 decision and invocation owners answer from their durable evidence; timeout/cancel cannot invent rollback, and unavailable evidence may remain unknown. |
| Which data did a read observe? | Query owner supplies the admitted per-shard view and snapshot-local witness; cancellation or worker isolation supplies no global consistency or leader-read barrier. |

The [Raft application transaction](../../../src/raft/raft-rs-application-transaction-owner.js)
continues to atomically apply data and applied state, preserving Ready/persist/
apply ordering and deterministic effect timing. User cancellation SHALL NOT
interrupt committed apply or a shared Raft storage handle. Raft's own WASM and
synchronous storage remain a separately measured pressure source; moving
readonly queries is not proof of an entirely nonblocking control plane. Keep
the existing guest worker and call bridge; do not add a second guest engine,
catalog, scheduler or transaction coordinator to achieve isolation.

Before sealing, preregister quantitative bounds on named lab hardware for queue
wait, cancellation acknowledgement, time to actual resource quiescence, event
loop delay, Raft/control progress, retained WAL/native bytes and completion
latency. Cover a native query producing no first row for a long interval,
guest compute, a synchronous host-call wait, saturated admitted read work,
reader expiry/reopen, worker failure and a cancellation racing completion.
Replace a cancelled worker/connection only after its custody transition is
settled; a late signal must never cancel its replacement. Repeated runs must
plateau in handles, buffers and WAL retention under the declared workload.

Binary acceptance requires the supported native feasibility witness, actual
production-worker read execution, generation-safe cancellation/retirement,
unchanged durable outcome and Raft/apply semantics, and live bounded-pressure
evidence. Each central fence or bound needs a red-on-removal counterexample.
Until all are recorded against the candidate, claim neither implemented native
preemption nor a latency SLO. Cluster CancelRequest integration, broader worker
migration and coherent global snapshots require separate capability decisions;
they cannot enlarge this bounded Quest implicitly.

## Owner boundaries touched

- `test/distributed/harness/scenario-registry.js`,
  `test/distributed/harness/scenario-config.js`, and
  `test/distributed/harness/docker-provider.js` — the scenario substrate;
  the certification is a registered scenario, not new harness machinery
  (D11).
- `scripts/solve/probes/scenario-harness.js` — the probe that reads the
  report and answers the sealed-bar verdict.
- Sealed-evidence precedent to follow, not duplicate:
  `test/distributed/harness/scale-evidence-contract.js` and
  `test/distributed/harness/scale-certification-receipt-freshness.js`
  (evidence contracts, receipt freshness), and
  `test/distributed/harness/comparative-efficiency-claim-projection.js`
  (claim projection). Scale-axis cardinality claims link to the
  `large-scale-data-plane-certification` epic; cost-efficiency comparison
  links to `comparative-workload-efficiency-evidence` (D11).
- The Q1 baseline scenario's report schema (digests, topology, local-read
  proof, latency percentiles, bytes by channel, CPU, peak memory, retries,
  fidelity `live`) is consumed **unchanged**; this Quest adds a
  certification-verdict section, not a second report format.
- Baseline comparison precedent:
  `test/distributed/scenarios/postgres-baseline-comparison*.js`.

## Contract shape

### Certification bars (sealed before any run)

The bar document is sealed (digested) before the first counted run and
names, per measured dimension: p95/p99 latency, throughput, transferred
bytes by channel, CPU, peak memory, retry rate, error rate, node-loss
availability behavior, and recovery time. Numeric bar values are **open**
(set at sealing time, below) — the *schema* of the bar document and the
rule that no dimension may be dropped are sealed here. Where variance
matters, the bar predeclares its statistical method (Wilson interval or an
explicitly named alternative) and sample counts.

### Workload axes (representativeness)

The chosen workload — account summary is the standing candidate;
event/observability/fraud/IoT substitutes acceptable — must exercise, in
one certified run:

1. typed selector narrowing (Q2),
2. input above one old batch per selected shard (Q3 paging, >4096 rows),
3. structured partials (Q4),
4. more than one service operation in one component (Q5),
5. data partitions on multiple partition-host nodes,
6. the public authenticated HTTP path end to end (D1, D6),
7. node transport under mTLS (Q7).

### Sealed method

- Dataset and workload-generator digests sealed; named machine, storage,
  network, release commit, and topology (D7).
- Repeated warm steady-state measurement windows; cold-start excluded and
  labeled.
- The baseline is a strong conventional PostgreSQL/application
  implementation of the same workload under comparable durability
  configuration, measured on the same hardware.
- Failure drill inside the measured run: one non-seed data host stopped
  during load; availability behavior and recovery time recorded.
- Acknowledged-result parity verified against an independent oracle — never
  the service under test, never the loader/driver's own counters.

### Report and verdict

One machine-readable report: the Q1 schema per run, plus
`{barDigest, perDimension: {measured, bar, verdict}, overallVerdict,
neutralOrNegativeFindings[]}`. The report records neutral or negative
outcomes as faithfully as wins and cannot omit a measured dimension to
reach a passing verdict (sealed outcome-neutrality constraint). The
`sealed-bar` metric passes only when every dimension has a measured value,
a sealed bar, and a verdict.

## Failure semantics (D12)

The verdict is **non-terminal** (not merely failing — incapable of
terminal-verdict status) when any of these holds:

- missing public-path proof (any internal `native_js` or runtime
  substitution in the measured path — D1, D6),
- missing local-read proof on at least two partition hosts,
- missing or self-referential parity oracle,
- missing failure drill (node stop) or unrecorded recovery,
- synthetic or backfilled metrics; report fidelity not `live`,
- bar document mutated after sealing (digest mismatch),
- any measured dimension absent from the report.

Wrong answers under load, parity divergence, and bar breaches are ordinary
failing verdicts, faithfully recorded.

## Non-goals and edition boundaries

- Not an internal data-plane scale ladder — cardinality/scale-axis claims
  link to `large-scale-data-plane-certification` (D11).
- Not a cost-efficiency study — that is
  `comparative-workload-efficiency-evidence` (D11).
- No benchmark-only fast path, no harness-private runtime configuration
  that a pilot could not reproduce (D1, D6, D7).
- Community/AGPL scope; commercial-edition capabilities are neither
  measured nor implied (D8/D9).

## Open decisions left to the Quest

- Numeric bar values per dimension (set when the bar document is sealed,
  after Q1 baseline data exists; the epic's gate review owns sign-off).
- Final workload selection (account summary vs a substitute meeting all
  seven axes).
- Named hardware: the certification host(s) and topology cardinality
  (minimum: partitions on ≥2 data hosts; exact node count open).
- Baseline implementation details (PostgreSQL version, app-tier shape,
  durability settings) — must be documented in the sealed method.
- Where the sealed bar document lives (`solve/evidence/` receipt vs a
  harness-adjacent sealed artifact) — one location, digested either way.
