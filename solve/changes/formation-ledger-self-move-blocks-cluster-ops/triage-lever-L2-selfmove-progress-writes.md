# Triage lever L2 — self-move progress writes survive/skip the spread window

Verdict: **DROP as a quest-moving lever from the provided live artifact**. The
narrow idea is externally well-precedented, but the live logs currently under
`data/examples/service-data-affinity-demo/` do **not** show the ledger self-move's
own `replica_operations` row writes failing. They show (a) interlock/quorum
admission deferrals while the ledger spreads, then (b) a later storm of
`replica_operations` writes for **other** operations. Revisit only if a new DT or
log bundle shows self-move operation-row progress writes failing during voter
transit.

## T1. Inventory of actual failing writes in the live logs

### Grounding: which operations are the ledger moves?

The provided log bundle contains three operations on `replica_operations-p1`:

| op id | kind | evidence | outcome |
| --- | --- | --- | --- |
| `ba10ff21-7e26-4655-a948-8a37018f1f61` | disruptive `REPLACE` | created at `node-0.log:1517`, inserted at `node-0.log:1518`; PENDING→SENDING at `node-1.log:208`; CREATING/SYNCING at `node-1.log:242-246`; ACTIVE/STOPPING at `node-1.log:278-285` | terminal at `node-1.log:304-311` |
| `7260bd21-d5f5-47b6-9427-18c274cfa6fc` | emergency `ADD` on ledger | created at `node-1.log:335-340`; dispatch cache wait deferred at `node-1.log:344-348`; SYNCING at `node-1.log:369` | settled/completed at `node-1.log:374-383` |
| `70a35257-89bf-4445-819d-6be91d1bd4bc` | disruptive `REPLACE` | created at `node-1.log:397-398`; PENDING→SENDING at `node-2.log:323`; CREATING/SYNCING at `node-2.log:384-387`; ACTIVE/STOPPING at `node-2.log:416-430` | terminal at `node-4.log:415-418` |

For these IDs I found **zero** `Failed to update system table row`, **zero**
`Failed to insert system table row`, and **zero** `Failed to persist operation`.
The only self-move-adjacent warnings are not failed operation-ledger row writes:

- `ba10...`: the target replica's local create-status write is deferred but
  `localProgressCommitted:true` (`node-1.log:210-214`).
- `70a...`: same pattern for the later target replica (`node-2.log:323-329`).
- `7260...`: dispatch re-drive waits for cache visibility (`node-1.log:344-348`).

There are also CDC/cache divergence observations for self-move rows, but those
are post-write visibility mismatches, not the failing SQL-routed mutation class:
`ba10...` sees `No row found for CDC update` and then a cache/authoritative
mismatch at `node-1.log:282-285`; `70a...` sees authoritative terminal state at
`node-4.log:415-416`.

### What actually failed

Across `node-{0..4}.log`, I counted:

- 553 transient CDC SQL retry log entries: 409 `Transient CDC SQL error,
  retrying` and 144 `Transient CDC SQL exception, retrying`.
- 118 `Failed to insert/update system table row` entries: 117 against
  `replica_operations` (94 UPDATE, 23 INSERT) and 1 late shutdown-era `nodes`
  UPDATE.
- 22 distinct `replica_operations` primary IDs with failed writes.
- 68 `Deferred retryable replica operation transition failure` re-arms.

Representative failing row:

```text
node-4.log:490-492  attempt=4 ... tableName=replica_operations id=0232531b-...
  operation=UPDATE writeMode=sql-routed firstFailedParticipant.partitionId=replica_operations-p1
  msg="Failed to update system table row"
node-4.log:529-532  same id -> "Failed to persist operation" ->
  "Deferred retryable replica operation transition failure"
  boundary=executor_outcome/dispatch, workflowStep=ACTIVE/SENDING,
  partitionId=sql_transaction_participants-p1
```

Another representative retry chain:

```text
node-0.log:5317-5319  id=019f3eed-... tableName=replica_operations operation=UPDATE
  firstFailedParticipant.partitionId=replica_operations-p1
  -> "Failed to persist operation"
  -> "Deferred retryable replica operation transition failure"
     boundary=timeout_reconcile workflowStep=STOPPING partitionId=sql_transactions-p1
```

The failed `replica_operations` writes are distributed across non-ledger or
surrogate operations such as `sql_transaction_participants-p1`,
`control_plane_publications-p1`, `sql_transactions-p1`, `service_endpoints-p1`,
`config-p1`, `node_endpoints-p1`, and the client table partition. They are not
writes for `ba10...`, `70a...`, or `7260...`.

### Distinct write intents vs blind retries

From the failed-row logs, the useful inventory unit is `operation_id` plus the
transition re-arm context. There are 22 distinct failed `replica_operations`
row IDs, but 117 failed row-write log entries. The re-arm logs collapse that to
16 operations that actually re-entered owner transition retry. The repeated
failures are not one self-move retry loop; they are many operations failing their
own ledger row INSERT/UPDATE after the ledger has become the overloaded write
substrate.

Examples of distinct re-armed intents:

| op id | partition | failed/re-armed phases | first evidence |
| --- | --- | --- | --- |
| `0232531b-...` | `sql_transaction_participants-p1` | `STOPPING`, `ACTIVE`, `SENDING` | `node-4.log:490-532` |
| `019f3eed-...` | `sql_transactions-p1` | `STOPPING`, `ACTIVE` | `node-0.log:5317-5319`, `node-1.log:835-841` |
| `f141cd2f-...` | `config-p1` | repeated `PENDING` dispatch | `node-0.log:6362`, later `node-0.log:9623` |
| `47e8cc2c-...` | `node_endpoints-p1` | repeated `ACTIVE` executor outcomes plus dispatch | counted from 13 re-arms |

### E-cheap guardrail: causal link to self-move thrash is weak

The log bundle has exactly 21 `Executing rebalancing move` lines with
`entityId=replica_operations-p1`, but that is **not** 21 self-move dispatches.
Most are the ledger partition's rebalancer attempting other partitions' moves;
only a few have `movePartitionId:null` and `replicaId=replica_operations-p1-*`.
The first two disruptive self-moves terminalize before the row-write failure
storm begins:

- `ba10...` created `15:23:21.157Z`, completed `15:23:38.465Z`
  (`node-0.log:1517`, `node-1.log:304-311`).
- `70a...` created `15:23:42.917Z`, completed `15:23:59.601Z`
  (`node-1.log:397`, `node-4.log:415-418`).
- First failed `replica_operations` row update is later at `15:24:21.109Z`
  (`node-4.log:490-492`).

The repeated ledger-planner attempts in this artifact are better explained by
interlock/quorum admission, not failed self-move progress writes. Examples:

- A dependent `control_plane_publications-p1` move is deferred because the ledger
  self-move is in flight at `node-1.log:300-303`.
- A later self-move attempt is skipped because the ledger is not idle:
  `operation_ledger_self_move_waiting_for_idle_ledger` at `node-1.log:1084-1088`.
- Overall parsed interlock counts: 159
  `operation_ledger_self_move_in_flight`, 34
  `operation_ledger_quorum_concentrated`, 2
  `operation_ledger_self_move_waiting_for_idle_ledger`.

So the causal sentence "self-move thrashes because its own progress writes fail"
is **not supported by these logs**. The logs support: "other operations thrash
because their progress rows write through a stressed `replica_operations-p1`, and
L1-style interlock/quorum deferral is the reliable [2/4] blocker."

## T2. Load-bearing vs telemetry classification

The code confirms why `replica_operations` row writes are structurally risky:
`replica_operations` is one initial partition (`system-table-schemas-constants.js:113-119`) with initial replicas listed at
`system-table-schemas-constants.js:177-179`, and the classification comment says
every in-flight operation persists workflow progress into this ledger
(`system-partition-classification.js:133-139`). The write path is SQL-routed to
that partition leader: operation INSERT/UPDATE are in
`replica-operation-repository-mutation-persistence-methods.js:51-89` and
`:151-225`; gateway submission delegates to CDC insert/update at
`control-plane-system-table-gateway-mutation-submission.js:160-184` and
`:250-285`; CDC comments state insert/update go through SQL to the partition
leader (`cdc-integration-service-mutation-operations.js:211-247`, `:357-413`).

Classification for a **hypothetical** ledger self-move write failure:

| write intent | load-bearing? | why |
| --- | --- | --- |
| Operation row CREATE/INSERT | **Must stay durable** | This is the authoritative in-flight row. Incomplete-operation reads expose PENDING/SENDING/CREATING/SYNCING/STOPPING/ACTIVE-REPLACE rows (`replica-operation-repository-incomplete-read-methods.js:249-313`), and the ledger interlock reads those rows before admitting more work (`rebalance-coordinator-ledger-interlock-admission.js:143-158`). Without the row, recovery/interlock are blind. |
| PENDING→SENDING claim | **Semi-load-bearing** | It is the dispatch claim (`operation-workflow-transition-persistence.js:37-47`, `:137-145`). Existing code already has a narrow fallback: on retryable priority pressure it applies local progress and preserves the previous expected step (`operation-workflow-transition-persistence.js:145-159`; `operation-workflow-transition-orchestration.js:663-688`). It can be deferred locally only if the next durable write remains CAS-safe. |
| SENDING→CREATING | **Recoverable only with existing local-deferred machinery** | Existing code explicitly treats CREATING progress under priority pressure as locally visible + retry-armed (`operation-workflow-transition-orchestration.js:704-769`). Tests pin that the durable row may stay stale at SENDING, a retry timer is armed, and the retry later persists CREATING (`priority-recovery-sql-dispatch-timeout-reentry-test-cases.js:710-935`). This is not free telemetry; it has a retry owner and local visibility witness. |
| CREATING→SYNCING | **Potentially re-derivable, but not proven for recovery-after-leader-change** | Status reconcile can advance pre-SYNC rows to SYNCING when actual replica status is SYNCING (`operation-workflow-recovery-status-reconcile.js:134-141`). Observed target progress reads service/cache status (`operation-workflow-recovery-observation.js:126-159`). But node recovery with cause `RECOVERY` fails pre-sync steps before normal status reconcile (`operation-workflow-recovery-timeout.js:463-480`; `operation-workflow-recovery-status-reconcile.js:277-307`) unless priority drain handles it first. |
| SYNCING→ACTIVE | **Mostly re-derivable** | ACTIVE target status drives completion or replace-specific ACTIVE handling (`operation-workflow-recovery-status-reconcile.js:156-162`; `priority-recovery-superseded-target.js:569-619`). |
| ACTIVE→STOPPING | **Not pure telemetry** | For REPLACE, ACTIVE is the source-removal phase. Recovery can observe source retirement and move to STOPPING/complete (`operation-workflow-recovery-observation.js:668-700`), but suppressing this write changes dispatch replay/readiness classification. |
| Terminal COMPLETE/REMOVED/FAILED | **Must stay durable** | Terminal writes intentionally avoid expected-step CAS so owner terminal truth can overwrite a lagging non-terminal durable step (`replica-operation-repository-mutation-persistence-methods.js:151-158`). Terminal repair reasserts retained terminal projection until confirmed (`operation-workflow-terminal-transition-repair.js:153-194`). If terminal is skipped, incomplete-operation readers keep the operation live and the interlock may block until staleness exclusion (`rebalance-coordinator-ledger-interlock-admission.js:83-97`). |

The only safe "skip" class already present is not durable truth elimination; it is
**local projection + durable retry**. The in-memory `operation_progress` store is
a Map (`operation-progress-store.js:85-92`) and observer projection
(`operation-progress-observer.js:132-147`), not an off-partition durable source of
truth.

## T3. Minimal lever shapes evaluated

### Option (i): suppress non-boundary transition writes during the self-move transit window

**Shape.** For `isDisruptiveOperationLedgerSelfMove(op)` during voter transit,
keep operation CREATE and terminal durable, but skip intermediate row writes and
let in-memory workflow state plus recovery re-observe actual raft/replica state.

**Pros.** Matches external practice: TiKV/PD drops in-flight operators and
rebuilds from heartbeats; CockroachDB's replicate queue is a stateless scanner;
FDB writes only phase boundaries (`research-external-systems-selfmove-interlock.md:192-236`,
`:347-353`).

**Breaks/risks.** Current recovery is not yet that shape. A durable row left in
PENDING/SENDING/CREATING may be failed on node recovery (`operation-workflow-recovery-timeout.js:463-480`,
`operation-workflow-recovery-status-reconcile.js:277-307`) before it is
re-derived. Mid-move consumers read `workflow_step`: incomplete-operation reads
(`replica-operation-repository-incomplete-read-methods.js:249-313`), dispatch
replay readiness (`replica-dispatch-replay-readiness.js:125-150`), dispatch rearm
logic (`operation-workflow-dispatch-rearm-evidence.js:134-158`, `:190-230`),
priority-recovery snapshots (`priority-recovery-snapshot-rebalancer.js:55-107`,
`:226-324`), and liveness/staleness classifiers
(`replica-operation-liveness.js:256-360`). Stale mid-move steps are therefore not
just display telemetry.

**Tests pinned today.** Priority SQL dispatch tests explicitly expect SENDING and
CREATING transition writes under normal operation (`priority-recovery-sql-dispatch-timeout-reentry-test-cases.js:89-319`) and the deferred-progress variant expects
local CREATING visibility plus a durable retry, not permanent suppression
(`priority-recovery-sql-dispatch-timeout-reentry-test-cases.js:710-935`).

**Assessment.** **Needs recovery prerequisite**. It cannot be shipped as a
surgical ledger-self-move skip without first proving recovery-by-reobservation for
a durable stale PENDING/SENDING/CREATING self-move across leader handoff.

### Option (ii): phase-boundary-only persistence for ledger self-moves

**Shape.** FDB-like: durable CREATE at dispatch-start and durable terminal only.
All middle steps are in-memory/observed.

**Pros.** Smallest write count; aligns with Principle D in the external research
(`research-external-systems-selfmove-interlock.md:347-353`). Avoids the forbidden
full off-partition store from Lever A.

**Breaks/risks.** Stronger version of option (i)'s recovery risk. With a durable
PENDING row until terminal, all mid-move consumers see "not dispatched" while the
raft group may already be in transit. The current recovery code has no proven
self-move special case that says "PENDING ledger self-move but target voter exists
and leader changed => reconstruct phase instead of fail/re-dispatch." It would
also change interlock behavior: other operations would still see a live REPLACE
row (good), but same-ledger follow-on self-moves may wait on stale rows until the
staleness exclusion (`rebalance-coordinator-ledger-interlock-admission.js:83-97`).

**Assessment.** **Not a minimal implementation lever** unless paired with a new
ledger-self-move recovery state machine. That approaches the same new machinery
that made the full off-partition store unattractive, just without a second
storage backend.

### Option (iii): make failed transition writes non-re-arming/best-effort telemetry

**Shape.** If an intermediate transition write fails, let the workflow continue
and do not re-arm durable persistence.

**Pros.** Lowest code change if narrowly inserted near `persistOperationUpdate`
callers.

**Breaks/risks.** This is the most dangerous framing. Today a failed
`persistOperationUpdate` escalates via `resolveFailedOperationUpdateResult` and
logs `PERSIST_FAILED` (`replica-operation-repository-mutation-persistence-methods.js:254-272`).
`updateStep` only swallows a retryable failure for the specific CREATING priority
case, and even then it records local progress plus a retry timer
(`operation-workflow-transition-orchestration.js:570-586`, `:715-769`). Making
failures broadly non-rearming would create a hidden in-memory truth that CDC,
interlock, remote recovery, and admin/diagnostic readers cannot see.

**Assessment.** **Drop unless narrowed to an existing pattern**: extend the
current deferred-local-progress+retry mechanism for a proven ledger-self-move
step, not "best effort no retry".

## T4. DT-ability

A useful DT must reproduce the binding observable without injected preconditions:
"a ledger self-move whose own operation-row progress write fails during voter
transit, causing excess transition retries / terminalization latency." The
existing closest tests are reusable but not sufficient as-is:

- `dt6-rebalancer-formation-self-move-interlock.test.js` models write failure
  only when a disruptive ledger self-move is in flight **and another live
  operation contends** (`ledgerProgressWriteFails` at lines `93-111`; the tick
  driver writes/fails steps at `145-168`). This proves L1 ordering, not L2
  self-write survivability.
- `dt6-formation-ledger-quorum-spread-first.test.js` adds quorum-concentration,
  but still fails progress writes only when the ledger is concentrated **and
  liveOperationCount > 1** (`lines 275-333`). Again, self-move alone can
  progress.

A faithful L2 RED would extend that substrate:

1. Create only a ledger `REPLACE` self-move, no sibling contender.
2. Model a voter-transit interval keyed to that operation: when the self-move is
   SENDING/CREATING/SYNCING/ACTIVE-before-source-removal and the target voter is
   being added or leadership is moving, `persistOperationUpdate` for **that same
   operation ID** returns `DISTRIBUTED_PARTICIPANT_FAILURE` / no-leader.
3. Assert baseline RED: repeated transition retry re-arms and terminalization
   latency/exec count exceeds a threshold (matching the live signature if a live
   signature is found).
4. GREEN for a candidate must show: terminal row durable, no permanent secondary
   source of truth, bounded retry count, and red-on-revert.
5. Add a second case for leader handoff mid-suppression: new owner must rederive
   from actual target/source raft state rather than fail a durable stale
   PENDING/SENDING/CREATING row.

Until that DT exists, live gate runs would be the wrong iteration loop.

## T5. Verdict

**DROP for the current quest lever.**

- **Reuse level:** a safe version would be **EXTENDED**, not NEW, if it only
  extends existing priority deferred-local-progress + retry
  (`operation-workflow-transition-orchestration.js:704-769`) to a proven
  self-move step. A phase-boundary recovery rewrite would be **NEW** recovery
  semantics.
- **Blast radius:** medium-to-high. Mid-move `workflow_step` is read by
  interlock, incomplete-operation observation, dispatch replay, timeout/liveness,
  priority-recovery snapshots, and tests. Treating it as telemetry is false in
  current code.
- **Interaction with L1:** L2 alone does not move [2/4] in the provided logs.
  The reliable blocker is still interlock/quorum admission (`node-1.log:300-303`,
  `node-1.log:1084-1088`; counts above). L1 and a future L2 could compose: L1
  opens admission safely; L2 would only reduce storms if a separate self-write
  failure remains.
- **Secondary-source constraint:** Lever A already rejected a durable
  off-partition operation store because it creates new durable machinery and a
  CDC-invisible source of truth (`research-lever-a-off-partition-persistence.md:150-156`,
  `:221-228`). L2 must not reintroduce that via an unconfirmed local journal.
- **Falsifier for this verdict:** a deterministic self-move-alone RED, or a live
  log bundle, showing `Failed to update/insert system table row` / `Failed to
  persist operation` for the ledger self-move operation ID itself during voter
  transit, followed by transition re-arms for that same ID. The current artifact
  does not contain that evidence.
