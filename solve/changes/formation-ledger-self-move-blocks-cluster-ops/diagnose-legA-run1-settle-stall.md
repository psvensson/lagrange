# Diagnose Leg-A run-1 settle stall (self-move CDC non-termination)

Artifact: fresh `data/examples/service-data-affinity-demo/node-{0..4}.log` at HEAD `44419fcd`
(Shape B `9061a28a` + Leg A `06496039` both live). Archived at
`data/examples/service-data-affinity-demo-archive/run-legA-1-2026-07-07T06-34-29Z.tar.gz`;
runner stdout `run-legA-1-2026-07-07T06-34-29Z-runner-stdout.log`.

Node logs run `06:34:52Z -> 06:47:27Z`. Result: `converged:false, stalled:true`.
node-0 = seed `2e9cfde5`. Other node ids seen: `0e793a28`, `355aec4c`, `de0fae64`,
plus `81536f20` (an early replica id).

## Verdict (binding root of the settle stall)

The demo's `[1/4]`/`[2/4]` settle STALLED because specific `replica_operations` rows
never reach a terminal (`completed_at` set) state, so the runner's drain loop
(`examples/service-data-affinity/run-affinity-demo.js:226`-`:229`) never sees
`inFlight === 0`. Those rows cannot terminalize because the CDC local-system-table
**UPDATE** that would mark them terminal routes to a `replica_operations` replica whose
local SQLite lacks the row and logs **`No row found for CDC update`**
(`src/partition/partition-cdc-parameterized-sql.js:337`), which surfaces as
`Failed to persist operation` -> `Deferred retryable replica operation transition
failure` re-armed on a ~30s cadence until shutdown. This is the **self-move CDC
non-termination** the frontier memory named as the one binding blocker. It is NOT
ledger-quorum concentration (the ledger spread completed early, see §3) and NOT the
ledger row-write failures Leg A fixed (0 this run, see §0). Leg A repaired the
persistence **confirmation READ** path; the still-open leak is the CDC system-table
**write/update routing** path one layer below it.

## 0. What Leg A + Shape B fixed (confirmed against this artifact)

- `Failed to insert/update system table row`: **0** across all 5 logs (was 63 pre-Leg-A).
  Confirmed: the prior run's dominant ledger row-write failure class is gone.
- Durability-unfit fallback (`demoted WITHOUT` / `Durability-unfit`): **0**.
- No admin-response timeout in `[3/4]` this run (an improvement).

So Leg A/Shape B genuinely closed the write-failure and immortal-ACTIVE classes. The
residual stall is a different, still-open path.

## 1. The residual stuck operations (grounded, per distinct op id)

26 distinct ops `Creating operation`; 23 distinct `Operation completed`. The 3 that never
completed, plus one that "completed" locally but never persisted, are exactly the
in-flight residuals:

| op id | type / partition | target | created | last state | why stuck |
|---|---|---|---|---|---|
| `812932a2` | REPLACE `sql_write_operations-p1` | `0e793a28` | 06:36:24.895 | replica physically created 06:36:37.844, then 32× `Deferred retryable replica operation transition failure` 06:36:38 -> 06:47:16 | UPDATE to its `replica_operations` row hits `No row found for CDC update` (06:36:31.938) -> `Failed to persist operation` (06:36:31.959); never terminalizes |
| `26c60ea9` | ADD ratings `tbl-b8558e64…-p1` | `2e9cfde5` (seed) | 06:39:39.282 | logged `Operation completed` 06:39:41.607 then spins `Deferred replica operation dispatch while control-plane path recovers` to 06:47:35 | `No row found for CDC update` at 06:39:41.604 (immediately BEFORE the completion log) — `completed_at` never persisted to the ledger, so the row stays NULL / in-flight |
| `fb9aedc3` | ADD ratings `tbl-b8558e64…-p1` | `0e793a28` | 06:39:39.525 | `dispatch_already_exists` -> `No row found for CDC update` -> `Released orphan storage reservation during reconciliation` 06:40:11.762; then no further lines | orphan-released and abandoned; row left non-terminal |
| `3d863303` | ADD ratings `tbl-b8558e64…-p1` | `355aec4c` | 06:39:40.711 | same shape, orphan-released 06:40:13.636 | same |

Mapping to the runner's counts:
- `[1/4]` formation plateau **"1 in flight (21 completed)"** = **`812932a2`** (the only
  formation-created op that never terminalized; created 06:36:24, before ratings).
- `[2/4]` post-load plateau **"4 in flight (21 completed)"** = **`812932a2` +
  `26c60ea9` + `fb9aedc3` + `3d863303`**. `completedCount` stays at 21 (not 22) precisely
  because `26c60ea9`'s completion never persisted — corroborating that its `completed_at`
  write was swallowed by the same `No row found` path.

These are **control-plane system-partition ops (`sql_write_operations`) and ratings
data-partition ADDs** — not the ledger's own spread ops (those completed, §3).

## 2. Why they don't terminalize

The `No row found for CDC update` is emitted by the CDC parameterized-SQL update path
after it re-reads the row it just tried to UPDATE and finds nothing
(`src/partition/partition-cdc-parameterized-sql.js:316`-`:345`). Distribution of the 136
occurrences (window 06:35:24 -> 06:42:38, all before the ratings phase ends):

| tableName / cdcReplicaId (the divergence witness) | count |
|---|---:|
| `replica_operations` / `replica_operations-p1-r4` | 62 |
| `services` / `services-p1-r1` | 38 |
| `storage_reservations` / `storage_reservations-p1-r1` | 22 |
| `partitions` / `partitions-p1-r1` | 10 |
| `replica_operations` / `replica_operations-p1-r1` | 4 |

The dominant witness is **`replica_operations-p1-r4`** — writes route there but that
replica's SQLite lacks the row. This is the exact CL-017 post-churn divergence documented
in the routing code: `resolveLeaderRole` can pick a replica "whose database may have
diverged from the group (the witnessed post-churn 'No row found for CDC update' on rows the
real group committed)" (`src/cdc/cdc-integration-service-local-system-table-routing.js:70`-`:76`).
Corroborating: `Cache/authoritative divergence detected during reconciliation` fires 26×
on `replica_operations` (06:35:25 -> 06:37:29). r4 leadership churned onto `355aec4c` at
06:35:30.777 right after the ledger spread, so the INSERT and the later UPDATE do not agree
on which r4 replica holds the row.

The retry never changes the route: at 06:41:25 `812932a2` logs
`Coordinator-created remote handoff retry stopped at its operation budget; the operation
remains for planner rearm / ready-node replay` — the budget is spent but the op is left for
the planner, which re-arms the SAME misrouted transition and defers again. There is no
level-triggered reap and no route escalation on repeated `No row found`, so the row is
immortal-in-flight for the rest of the run.

## 3. Does the ledger (replica_operations-p1) quorum spread complete? YES

The ledger's OWN spread ops all reach `Operation completed` early:

- `a3ce0975` REPLACE `replica_operations-p1` -> `355aec4c`: created 06:35:17.595,
  completed by 06:35:34-42.
- `d0ba3149` ADD `replica_operations-p1` -> `0e793a28`: completed 06:35:43.414.
- `60fd7922` REPLACE `replica_operations-p1` -> `81536f20`: completed 06:36:03.613.

After 06:36:03 there are no further `replica_operations-p1` spread ops created — the ledger
physically de-concentrated. So the quest's original theory (the ledger self-move keeps its
quorum concentrated on the seed and the interlock therefore rejects everything forever) is
**not** what binds this run. The interlock still logs
`Operation-ledger quorum concentrated … deferring dependent operation admission` at a steady
~2/min from 06:35:34 to 06:46:48, but that is the KNOWN double-counted `MOVE_SKIPPED`
re-evaluation of the same candidate, not distinct blocked ops — the ledger already spread,
so this counter is cosmetic here, not the binding mechanism.

## 4. The active-gate coverage fence

The fence trace persists the whole run (145 lines across all nodes, 06:35:19 -> 06:47:25,
every one `contractState:degraded`, `contractReason:published_active_coverage_incomplete`,
`fenceState:promotion_denied`, `fenceSnapshotCoverageState:"unavailable"`,
`fenceSnapshotCoverageMissingCount:5`, `fenceMissingProofReasons:["snapshot_coverage_unavailable"]`).
node-0 stops emitting after 06:36:06 only because it hands off the reconcile write-leader
role (`Membership reconcile deferred: not the control_plane_publications write-leader`, 407×
after 06:37); the trace continues on whichever node holds that role. The gap is a
`snapshotCoverage.available !== true` denial
(`src/control-plane/publication-active-gate-handoff-contract-fence.js:361`) for all 5 nodes —
the coverage snapshot is never *produced* ("unavailable", not "stale").

Relationship to the settle stall:
- The coverage fence does **not** gate the `replica_operations` UPDATE path, so it is
  **not** the cause of the `inFlight != 0` settle stall — that is purely the CDC
  non-termination in §1/§2. The demo's STALLED verdict for `[1/4]`/`[2/4]` is the drain loop,
  not an active-gate check.
- The coverage fence **is** the binding blocker for `[4/4]`: `promotion_denied` keeps the
  active gate shut, so the `svc-movielens-topn` runtime service is never placed
  (`replicas=0, attributionRows=0` for the full 300s watch).
- Likely-shared substrate, not fully proven here: producing/reading the coverage snapshot
  crosses the same CDC local-system-table routing that is misdelivering on
  `services-p1-r1`/`partitions-p1-r1` (§2). If the coverage snapshot read/write lands on a
  diverged replica the same way, both symptoms have one root. I did not trace the coverage
  producer end-to-end, so I flag this as probable-common-cause, not confirmed. (Absence of a
  coverage-producer log is not proof either way — the producer path was not located.)

## 5. Causal chain + binding root

1. Ledger `replica_operations-p1` spreads and leadership churns off the seed (r4 -> `355aec4c`)
   by 06:35:30 — spread COMPLETES (§3).
2. Post-churn, `resolveLeaderRole` routes system-table mutations to a `replica_operations`
   (and `services`/`storage_reservations`/`partitions`) replica whose local DB diverged from
   the committed group (§2).
3. The terminal/progress UPDATE for each dependent op finds `No row found for CDC update`,
   fails to persist, and is re-armed as a retryable deferral forever (or the reservation is
   orphan-released and the op abandoned) (§1/§2).
4. Those rows stay `completed_at IS NULL` -> the runner's drain loop never reaches
   `inFlight === 0` -> `[1/4]`/`[2/4]` STALLED.
5. Separately/parallel, `snapshot_coverage_unavailable` keeps the active gate denied for the
   whole run -> `[4/4]` never places the service.

**Upstream, binding for the settle stall: (b′) the CDC system-table write/update routing to
a diverged replica (`No row found for CDC update`) — the self-move CDC non-termination.**
Not (a) interlock rejection of non-conflicting ops (cosmetic double-count here) and not the
ledger's own spread never completing (it does).

## 6. Forward levers

Lever that WOULD move this binding root — fix the CDC system-table mutation path so a
committed row is not lost when the local replica diverged:

- **`src/cdc/cdc-integration-service-local-system-table-routing.js:66`-`108`
  (`resolveLeaderRole`) / `resolvePartitionServicesForTable`** — the write is routed to a
  replica by live-role, but a freshly-elected r4 leader whose SQLite has not yet hydrated the
  INSERT is still chosen. Route the UPDATE to the replica/owner that authoritatively holds the
  row (owner-RPC), or gate on hydration completeness before treating a role-holder as the write
  target.
- **`src/partition/partition-cdc-parameterized-sql.js:335`-`345`** — where `No row found for
  CDC update` is declared a silent no-op. Extend to **CL-017(b) create-on-missing** (or escalate
  to the ledger-authority read that Leg A already added,
  `queryReplicaOperationPersistenceAuthorityObservation` in
  `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js`) before failing:
  if the authoritative group committed the row, materialize/repair it on the local replica
  instead of dropping the mutation. This is the frontier-memory reuse map (EXTEND CL-017(b)
  create-on-missing + reuse `c7a3bf19` owner-RPC read).
- **Reap/route-escalation** for the retry loop that emits `Deferred retryable replica operation
  transition failure` (`src/rebalancer/...`) — it re-arms the same misrouted transition on a
  fixed cadence and never escalates the route or reaps on repeated `No row found`. A
  level-triggered reap-or-reroute after N same-route no-rows would break the immortality.

Levers that would NOT move this root (evidence-backed):
- Narrowing the ledger interlock to genuinely-conflicting ops — `quorum_concentrated` is a
  cosmetic double-count here; the ledger already spread by 06:36:03 (§3).
- Making the ledger quorum spread "complete faster" — it already completes; the stall is
  downstream of a healthy spread.

Separately, `[4/4]` needs the coverage fence to clear (`snapshotCoverage.available`); if the
shared-substrate hypothesis in §4 holds, the CDC-routing fix above may also clear it, but that
should be verified, not assumed.

## Evidence index (paths are line-cited above)
- Drain loop semantics: `examples/service-data-affinity/run-affinity-demo.js:215`-`:278`.
- No-row emission: `src/partition/partition-cdc-parameterized-sql.js:316`-`:345`.
- Divergence-routing note: `src/cdc/cdc-integration-service-local-system-table-routing.js:66`-`108`.
- Leg A confirmation-read change (what it did / didn't cover): commit `06496039`,
  `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js`,
  `src/rebalancer/operation-workflow-terminal-transition-repair.js`.
- Fence denial: `src/control-plane/publication-active-gate-handoff-contract-fence.js:361`;
  trace fields `src/control-plane/membership-publication-coordinator-reconcile.js:482`-`:523`.
