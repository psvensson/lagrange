# Frozen-v3 broad partition/query failure owner taxonomy

Date: 2026-10-13

This is a read-only classification of the partition/query failures in the
frozen-v3 broad lab run. It does not approve a repair, change a source or test
contract, or turn any timeout into acceptable evidence. The inspected log was
`test-output/alpha-single-path-20261013/frozen-v3-change-lab.log`; the final
snapshot read for this note was 31,485 lines / 1,825,050 bytes with SHA-256
`dc58e5e32e914016079009925e9f71b8df5d4f2920232c2d8d75d4eba323303a`.

The candidate worktree still had uncommitted Quest work and `HEAD` remained the
sealed predecessor `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`. Therefore all
"candidate" comparisons below mean the current worktree bytes against the Git
object at that exact predecessor. Root had started same-host predecessor-source
controls when this note was written, but their results were not available here.
No regression is attributed without those controls.

## Classification

### A. Existing full release owner is absent from the fixture

This is the dominant interaction. A naturally constructed current TX1
participant is CLOSED until a canonical origin and release are committed. Raft
formation or election alone is not release authority. Several fixtures create a
real `PartitionService`, sometimes through `formAdmittedGroup`, and then send an
ordinary write without composing the existing release recipient/recovery owner.
The resulting `partition_write_cutover_paused` is the production safety answer;
weakening it or assigning role, pause, origin, or grant fields in the test would
invalidate the witness.

The clearest direct evidence is:

- `test/partition/partition-statement-admission.test.js:341-388` forms a group
  and writes without release. Lab log lines 8789-8930 show all six writes
  returning `partition_write_cutover_paused`; the positive control never
  engages.
- `test/partition/table-partition-structure.property.test.js:237-254` creates a
  bare service, starts it, ignores the insert answers, and then reads an empty
  structure. The property fails after its first case. Its table-structure
  invariant remains current; the fixture precondition is missing.
- `test/partition/cdc-generation.property.test.js:102-131,179-214,259-294,
  343-375` constructs bare services and assigns `role`/`isLeader` directly.
  All four properties fail after the first case. The CDC contracts remain
  current; leadership and release must come from real owners.
- `test/query/unknown-outcome-surface-fixture.js:209-299` creates lone services,
  initializes and starts election, then routes production SQL directly to
  `handleRemoteQuery`. Its group form at `:439-470` uses
  `formAdmittedGroup`, also without a release owner. This shared precondition
  accounts for the setup failures in `unknown-outcome-*`,
  `write-identity-instance`, and the long-running exactly-once property family
  before their intended fault semantics can be judged.

The same owner interaction plausibly groups the failures in direct-write
fixtures for partition Raft proposal/SQLite/stale-topology metrics,
`partition-service`, split backfill pacing, size/split transport, consensus
hold, transport demux, leadership transfer, `partition-write-answer-consumers`,
`settled-replay-preserves-result`, `write-exactly-once-*`, and the unknown
outcome surfaces. This grouping is a refit boundary, not proof that every later
assertion will pass after release. Any semantic mismatch or exhausted bound
after a proven release remains a system red.

#### The four settled-replay SQL timeouts

`test/query/settled-replay-sql-surface.test.js:119-179` creates one bare lone
`PartitionService`, initializes it and calls `startElection` at `:146-147`,
then points a production `SQLQueryEngine` router at `handleRemoteQuery`. It has
no handler/registry/control release owner. Every case first awaits a setup write
at `:185`, `:208-210`, `:260`, or `:294`.

Lab log lines 21262-21308 record four full test-bound expiries:

| Test line | Duration | Result |
| --- | ---: | --- |
| 181 | 30002.018326 ms | `testTimeoutFailure` |
| 204 | 30000.642117 ms | `testTimeoutFailure` |
| 255 | 30000.129719 ms | `testTimeoutFailure` |
| 289 | 30000.830115 ms | `testTimeoutFailure` |

The file consumed about 121.5 seconds and all four cases were cancelled. The
fixture shape plus explicit CLOSED answers in adjacent suites makes executor
redelivery of a retryable pause the leading explanation, but this TAP contains
no phase diagnostics. It does not prove the exact await. Each 30-second expiry
is a system failure and cannot be waived, enlarged, skipped, or reclassified by
a later green rerun.

### B. Durable replay cursor is a current structural owner concern

`test/partition/partition-transaction-replay-cursor-v4.test.js:130-157`
contains current safety properties:

- RC1 requires a deterministic failed statement never to be mirrored. The lab
  result mirrors `dup-a` as well as `insert-b` (log lines 4034-4070).
- RC2 requires an APPLIED outcome to bind to its own log index. The lab result
  mirrors the refused/duplicate occurrence on both orderings (log lines
  4079-4131).

`src/partition/partition-mirror-replay-cursor.js:110-127` iterates committed
commands after the watermark and adds every mirrorable operation. It does not
consult the durable statement outcome or bind that outcome to the command's log
index. This directly explains the failed safety assertions. The source and test
have identical blobs at candidate and e6, so the observation is not evidence of
a V2 deletion regression. It is also not a fixture-release repair: retain the
test and repair the replay cursor owner in a separately reviewed unit.

### C. Write-kernel expectation names retired volatile CDC ownership

`test/partition/partition-write-kernel.test.js:166-209` expects an ordinary
applied write's side-effect plan to contain `emitCdcEntry`. The lab actual at
lines 3550-3624 is `emitCdcEntry: null`.

`src/partition/partition-write-kernel.js:531-570` explicitly gives durable
committed application ownership of CDC and sets `emitCdcEntry: null`; its
comment explains that volatile emission would create a second retry owner.
Both source and test are byte-identical to e6. The CDC expectation is stale,
while the same test's split/size side-effect assertions remain current. A later
test correction must remove or replace only the retired volatile CDC assertion;
production must not regain a duplicate emitter.

### D. Query doubles do not satisfy current typed participant/recovery contracts

`test/query/distributed-transaction-coordinator.property.test.js:391-423`
returns a generic `{success: true}` from its fake participant. Lab line 4758
rejects it because the participant did not provide the typed outcome required
by the current wire contract. Repeated `TRANSACTION_RECOVERY_INCOMPLETE`
failures elsewhere arise from hand-built recovery rows that omit canonical
frozen-decision fields such as transaction/commit mode, participant-set state,
frozen count, or the exact participant set.

These should be corrected once in an existing canonical participant-wire or
recovery-row fixture. Per-test answer patches and relaxed production validation
would hide the owner contract. There are no candidate changes under `src/query`;
the only changed path under `src/query test/query` is
`test/query/transaction-coordinator-participant-protocol.test.js`. That fact
limits attribution: it does not exclude an interaction with changed partition
dependencies, but it supplies no direct evidence that V2 modified the query
owner.

### E. Static-path and response-shape checks follow moved or retired owners

- `test/query/transaction-owned-commit-mode-guard.test.js:56-59` searches
  `distributed-transaction-coordinator.js` for
  `buildFrozenTransactionDecision` and same-file ordering. The current owner is
  `src/query/distributed/distributed-transaction-commit-mode.js:49`, consumed by
  `distributed-transaction-participant-set.js:7,56` and dispatched through
  `distributed-transaction-decision-protocol.js:184`. Update the guard to the
  actual owner interaction; do not copy the methods back to satisfy a path
  assertion.
- `test/query/query-executor-session-binding-and-build-sql.test.js:44-149`
  constructs a sessionId-only response double. It must express current typed
  participant identity before its routing/pinning invariant can count; it must
  not resurrect the deleted partition session engine.
- `test/query/deferred-hash.test.js:199+` ignores the BEGIN answer and spies an
  older direct-method sequence. Preserve the hash-before-record invariant while
  using a current coordinator/participant fixture.

### F. Statement-admission has two different causes

A2 at `test/partition/partition-statement-admission.test.js:181-221` preserves
a current deterministic-refusal/outcome-row assertion, but it creates the
disturbance by mutating the partition database directly. Current
`src/partition/partition-local-mutation-admission.js:26-31` fences that path
once an origin exists. The e6 implementation at
`partition-participant-transaction-legacy-fence.js:177-185` had the same
origin-then-pause rule, so extraction did not introduce the semantic fence.
The missing `rowid_ceiling` is evidence that the disturbance did not engage,
not permission to drop the outcome assertion.

A4 at `:341-388` is the missing-release composition described in category A.
The two failures therefore must not receive one blanket test patch.

## Exact candidate/e6 byte comparisons

`SAME` means `git hash-object <working-file>` equals
`git rev-parse e6d43bc1:<path>` at the time of inspection.

| Path | Blob at candidate and e6 | Result |
| --- | --- | --- |
| `test/partition/partition-write-kernel.test.js` | `4bdacd78562dcaad624cd180b0b51baafb03dcd0` | SAME |
| `src/partition/partition-write-kernel.js` | `e3e44d7e83f6eca0b35e4cd47b001b4e6b278add` | SAME |
| `test/partition/partition-transaction-replay-cursor-v4.test.js` | `70f1bb95955f30072985d0b44d811f93d9247535` | SAME |
| `src/partition/partition-mirror-replay-cursor.js` | `14b9fb863699efd566bc26416c4da2f5abeffc8d` | SAME |
| `test/partition/partition-statement-admission.test.js` | `ad488c5052dd490479594c28c60e5841c285b0f5` | SAME |
| `src/partition/partition-participant-transaction-pause.js` | `17a66098ef40f6cd6536e0d251aa60e747ea1d98` | SAME |
| `test/partition/table-partition-structure.property.test.js` | `b731f86f4d63c996c107662771de39486f2309bb` | SAME |
| `test/partition/cdc-generation.property.test.js` | `fd20c4d61655737131f041380845ab521f63e696` | SAME |
| `test/query/settled-replay-sql-surface.test.js` | `e0790d1acf58abb96f72b6e9ff51780d0464435b` | SAME |
| `test/query/transaction-owned-commit-mode-guard.test.js` | `71ddf37ca840d8ea7267176f27d91632c734a357` | SAME |
| `test/query/deferred-hash.test.js` | `8503c478d55f0f16b38725b93fb5fa37a5d79100` | SAME |
| `test/query/unknown-outcome-surface-fixture.js` | `c3808b22a4fe44aaf8dfa98c05dcde7266b0ee7d` | SAME |
| `test/query/write-identity-instance.test.js` | `961a285cd9747a24d29821564039c9b07d1a2151` | SAME |
| `test/query/write-exactly-once-property.test.js` | `4cee4e5d197ba972b4ae60b84ef30ac2b9eeb4a2` | SAME |

The new extraction `src/partition/partition-local-mutation-admission.js` has
blob `bc4d18bb8c3a9ce5a31e205cadc167864533ed6e`; its predecessor rule lived in
the e6 legacy-fence blob `9b6b2dd0e9fa68bedbbe741c52a6b21dc2e58274`.
The line comparison above establishes the same origin/pause ordering, not whole
file equivalence.

## One shared full-owner refit seam

Use the existing
`test/partition/partition-release-fixture.js:28-97`
`attachPartitionReleaseOwners(services, {directory, budgetMs})` for the direct
`PartitionService` and `formAdmittedGroup` family. This is a full production
composition rather than a test grant:

- it creates real `ReplicaHandler` instances and registers them with the real
  transport (`:35-47`);
- it hosts a real SQL-transactions control partition (`:49-69`);
- it measures build provenance (`:74-76`), finds the actual current Raft leader
  (`:79-84`), and calls the production
  `participantReleaseRecovery.releaseOperator` (`:84-86`);
- it spends only the caller's existing bound and requires the exact
  `CUT_OVER` outcome (`:77-95`);
- `host(service)` attaches a legitimately recreated/current service to its
  handler, and `dispose()` shuts down the recovery owners/control service
  without taking ownership of caller databases (`:21-27,58-64`).

The supported refit boundary is:

1. Construct and initialize/elect the exact current service group as today. One
   attachment covers services on the same real transport/cache surface; a
   multi-table fixture that currently creates isolated transports must either
   supply its existing shared loopback transport to those services or reuse the
   same seam once per transport. It must not pretend separately routed services
   are one handler group.
2. Attach this owner once with every exact group member, then call
   `release(partitionId)` once before the first ordinary positive-control
   write. For multiple independent lone partitions on one fixture transport,
   attach on the first, `host()` each later service, and release each partition.
3. Keep the handlers, registry route, and control owner alive through the test.
   If a service is legitimately recreated, call `host(replacement)` so the
   existing production recovery observes it; do not issue a second manual
   post-fault release.
4. Heal injected faults in `finally`, dispose the release owners, then shut down
   caller-owned services and storage. Do not add cleanup-only OPEN assertions
   that the production owner does not promise.

This seam covers most real partition/group fixtures, including the settled
replay and shared unknown-outcome surfaces. It does not repair fake-only query
wire answers, incomplete recovery rows, the replay cursor, or the stale
write-kernel CDC expectation. Those remain their named owner categories. The
narrow controllable participant helper is not a substitute for this full
handler/registry/control composition, and no new release algorithm is needed.

### Required nonvacuity after refit

A refitted test counts only when its intended behavior is reached:

- release returns exact `CUT_OVER` within the unchanged existing bound;
- a first post-release ordinary write succeeds and its durable row/application
  fact is observed before the test injects a fault or begins a property run;
- every fault is shown to engage through its original causal observation and
  exact typed outcome; a CLOSED refusal cannot satisfy an unknown-outcome,
  replay, CDC, topology, or exactly-once assertion;
- lost-answer/replay tests retain the same entry identity, at least two
  deliveries where required, one durable application, and the original result
  or named not-retained classification;
- group tests prove the exact member set and real leader; no assignment to
  `role`, `isLeader`, pause, origin, release, or service state is admissible;
- cleanup runs even after assertion failure, but cleanup acceptance is not used
  to replace a failed body assertion;
- no skip, todo, budget increase, write-retry polling, manual second release, or
  retry-only green changes classification. Any healthy exhausted timeout is
  retained as a system bug.

## Claim limits

This taxonomy does not claim that release composition makes the broad suite
green. It identifies the first missing owner for a large family and preserves
the later contracts as unproved until they run nonvacuously. Identical
candidate/e6 file blobs show that several failures were not created by edits to
those files; they do not rule out changed-dependency interactions. No same-host
predecessor comparison was consumed here. The four settled-replay expiries and
the 300/600-second exactly-once expiry remain failures. The cursor mismatch is a
current structural concern, and the stale/static fixtures require narrow
contract corrections rather than production compatibility code.
