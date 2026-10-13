# Seed participant release system finding

## Status and boundary

This is a bounded read-only finding discovered while measuring the C2 orphan
removal candidate. It does not change the C2 implementation, shared fixture,
participant-release policy, retry counts, or any timeout. It does not claim a
root cause from source inspection alone.

The same failures occur with the four C2 source paths restored to their parent
bytes while tests and metadata remain identical. The evidence therefore does
not support attributing the failure to the C2 subtraction. It does establish a
current seed-release system red that must remain visible.

## Measured evidence

The candidate V1 run on `adam-laptop` retained in
`test-output/c2-orphan-removal-20261013/candidate-v1-adam-laptop.log`
(`61b1ee8c139ec64ce727ea09a498dad7de0ed4d772fd36377a88a18a2fce9bee`)
created 138 services. Its partitions phase spent 9,697 ms and stopped at
`call_activation_leases-p1` with `release_drain_pending`, phase `release`, and
`retryAfterMs: 100`. The test stopped at 10,438 ms of its 30,000 ms outer
bound. This is not an outer test timeout.

The candidate V2 run on `adams-gamla` retained in
`test-output/c2-orphan-removal-20261013/candidate-v2-adams-gamla.log`
(`130ce6b6e650b0aecada8791555ad14775f8675d892125523fb65e18c767bad8`)
ran `node-bootstrap-consistency.property.test.js` for about 35.5 seconds and
reported 57 runner assertions. Its three original bootstrap cases all failed
inside the partitions phase:

- `latency_groups-p1`: `release_fact_unavailable`, phase `inspect`,
  `missingFact: release_deadline`, after 15,420 ms;
- `debug_sessions-p1`: `release_drain_pending`, after 7,945 ms;
- `debug_sessions-p1`: `release_fact_unavailable`, phase `inspect`,
  `missingFact: release_deadline`, after 8,311 ms.

The property file's 90,000 ms outer bound was not spent. The release owner
reported its own internal deadline exhaustion. The new fixture/authorization
composition witness passed exactly 23 leaf assertions in 42.943 ms. The
unique-path, joining-path, and non-virgin controls also passed 6, 11, and 2
leaf assertions respectively. The independent seed-migration file passed.

The exact source-only control is described by
`test-output/c2-orphan-removal-20261013/source-revert-pair-v2.json`
(`e7b75079fdbde1397045e423531a234cd9bad93cfd2023539eb68ad5b289c51b`):
candidate `47e9e99ab1c2a8df806054a7d7d1e2efafcfaf23` and control
`80297d6b2d8c283c89b3875c27dbc6b163c3a0d9` differ only in the four C2
production paths; test and metadata bytes are identical.

On the same `adam-laptop`, the source-revert control log
`source-revert-v2-adam-laptop.log`
(`656011ddf8f1bb4b94be2f3e8fbb30e9ad4a9d208590a8d2ff26869dc02ad482`)
failed at the same `call_activation_leases-p1`, with
`release_fact_unavailable`, phase `release`, and
`missingFact: release_deadline`. Its partitions phase spent 11,324 ms and the
test 12,022 ms. The other two files in that cohort passed 4 and 72 assertions.

On the same `adams-gamla`, the source-revert control log
`source-revert-v2-adams-gamla.log`
(`4812aac0ad4c5c61d761621cfa3aa9ed45ba16f307718628abe2a6e6a7d884e2`)
also failed all three original bootstrap cases. The terminal answers were
`release_drain_pending` at `latency_groups-p1`, unavailable
`current_control_owner_fact` at `debug_breakpoints-p1`, and
`release_drain_pending` at `debug_sessions-p1`. The same 23-leaf authority
witness and the other fixture controls passed, and the independent
seed-migration file passed. The outcome variations show that the current
failure surface is wider than one terminal answer; they do not identify one
root cause.

## Source-backed owner flow

`src/bootstrap/bootstrap-service-seed-workflow.js:260-298` sorts the control
partition first and the remaining services by partition ID. It creates one
deadline before the loop at lines 265-266 and releases every service serially
against that deadline. A non-`CUT_OVER` answer is retried only while its typed
delay still fits that same deadline at lines 278-293. The claim-cache fixture
uses a 1,000 ms `leadershipWaitTimeoutMs`; the property fixture uses 5,000 ms.
Those internal owner bounds are distinct from the test runners' 30-second and
90-second bounds.

`src/node/participant-release-client.js:26-38` bounds a request by the smaller
of 5,000 ms and the remaining release deadline. When no time remains it returns
`release_fact_unavailable` with `missingFact: release_deadline`. The measured
deadline answers therefore prove internal deadline exhaustion.

`src/node/replica-handler-participant-cutover.js:224-257` first releases the
SQL transaction control owner for each non-control partition, pauses the exact
cohort, and returns `release_drain_pending` if any census member fails the
canonical drain predicate. The same control-owner release is checked again
before resume at lines 293-299. These nested serial operations consume the seed
workflow's shared deadline.

The drain predicate in
`src/partition/partition-participant-release-facts.js:46-65` covers:

- SQLite transaction open state;
- participant staging and prepared count;
- proposal and pending-outcome counts;
- equality of applied, commit, and last indexes.

The aggregate cutover refusal drops the member census, so the retained answer
does not identify the member or field that remained undrained.

`runParticipantCutover` uses a per-handler, per-partition single-flight map at
`replica-handler-participant-cutover.js:302-320`. A same-build request joins
the existing promise. The record holds the build and promise, but not the
original trigger or start time. Release recovery can run up to four partitions
concurrently and uses the same cutover owner. Bootstrap, client, and handler
are intended to consume the NodeService time source. That makes clock mismatch
less likely in this fixture, but there is no retained measurement proving
clock identity or agreement.

Existing focused tests prove real route/control-first behavior, origin
installation, lifecycle recovery, refusal without origin, remote control facts,
build mismatch, query-drain typing, pause refusal, admitted-work preservation,
and connection generations. They do not measure serial release of 138 fresh
seed cohorts under one 1-second or 5-second deadline.

## What a repair could affect

The following boundaries must be investigated before selecting a repair:

- **Owner boundary.** Seed bootstrap owns service ordering and the shared
  release deadline. Participant cutover owns cohort pause, drain, reopen,
  enable, resume, and its single-flight work. The control partition owner is a
  required dependency for every non-control release. A repair must be placed
  at the owner interaction that is actually wrong; a caller-side fallback or
  copied drain predicate would create a second policy.
- **Caller surface.** Failure occurs in the registration-ready seed checkpoint
  before the remaining startup pipeline runs. Production fresh-seed startup
  therefore remains failed, while test callers observe false bootstrap results
  or `BOOTSTRAP_NOT_READY`. The shared test fixture has 43 live named-export
  consumers: 41 ordinary `.test.js` files plus the CDC debug file and one
  storage-load helper. The exact list is in
  `seed-release-helper-consumers.json`. This test census does not bound the
  production BootstrapService caller surface.
- **Concurrency.** The seed loop itself is serial, but consensus/service events
  can enqueue recovery work, recovery admits four partitions concurrently, and
  same-partition same-build calls can join a pre-existing single-flight task.
  Any repair must determine whether a fresh-seed call starts its own attempt or
  waits on work started by another trigger, without changing mutual exclusion
  or adding parallel release policy by accident.
- **Publication and admission.** Cutover raises pause before awaited cohort
  observations. A failure intentionally keeps admission closed and prevents
  successful bootstrap publication. Changing deadline or task ownership can
  alter when a partition becomes writable and when node readiness becomes
  externally visible. Current refusal behavior must remain explicit until the
  canonical owner proves release.
- **Shutdown and recovery.** Bootstrap cleanup unregisters and shuts down the
  ReplicaHandler. Handler shutdown stops participant recovery and joins its
  running tasks before shutting down hosted services. A diagnostic or repair
  must not leave a single-flight promise, recovery retry, paused service, timer,
  router handler, or caller-owned directory outside its existing shutdown
  owner and bound.

## Minimal next diagnostic design

The next attempt should add failure-only, bounded diagnostics to existing
answers and existing bootstrap phase-failure logging. It should not add a new
telemetry subsystem or change control flow.

The smallest useful design has two owner-local additions:

1. When the existing aggregate cutover owner returns a non-`CUT_OVER` answer,
   include a bounded diagnostic object from facts it already read. For drain
   pending, retain only the first blocked cohort member's node/replica identity,
   canonical work vector, and generation tuple, plus release term,
   configuration key, membership generation, and release ID. For the
   single-flight path, retain whether this request started or joined the task,
   the task's original trigger, start time, partition, and build digest.
2. In the existing seed workflow failure payload, add same-time-source values
   already owned by that loop: deadline creation time, service ordinal and
   total, count already cut over, attempt count/outcome sequence, service
   start/end and remaining time before/after, and the nested control-owner
   outcome/elapsed value returned by the cutover owner. At request entry,
   sample caller and handler time-source values and record whether they are the
   same time-source object.

The existing phase-failure logger already serializes the thrown answer, and
the participant release answer already carries optional diagnostic fields.
Those are the proposed hooks. Emit the bounded detail only for the terminal
failure; do not log every healthy partition or every retry.

This evidence distinguishes the candidate causes without choosing a repair:

- a non-positive remaining budget before a new service isolates cumulative
  serial deadline expenditure;
- a stable generation plus one persistent work field isolates the drain owner
  or its acknowledged task;
- changing term, configuration, membership, or generation isolates lifecycle
  churn;
- divergent caller/handler timestamps or non-identical time-source ownership
  isolates a clock interaction;
- joining an older task or a task with another trigger isolates a shared-task
  interaction.

No diagnostic result may be converted into a timeout increase, caller
fallback, extra release policy, or retry-only green. The recovery repair should
complete before another coupled semantic change is considered.

## Consumer census provenance and limits

The existing generated import graph
`test-output/analysis/global-owner-debt-import-graph.json`
(`4b1a78bc8f446d2411e01d945a60ca553f5e6d71796aec9982ad5d4015c8d5fe`)
has schema `global-owner-debt-import-graph-v2`, source digest
`1fb138c21ea21d5e42f48b441e8eb020990a3cfcb171dfbb39d0bc98eadeed9d`,
and exactly 50 direct importers of
`test/integration/helpers/cluster-test-helpers.js`. Its seal is
`test/shards/impact-graph-seal.json`
(`a80f6f31423fc46b2340ad8cc79fe687d330800328eef7296be3175e04ca8300`).

Of those 50 direct module importers, 43 use
`createVirginSeedBootstrapService`; seven import only other exports. Of the 43
live named-export consumers, 41 end in `.test.js`. The two remaining consumers
are `test/integration/cdc-debug-test.js`, which is not an ordinary `.test.js`
file, and `test/storage-load/in-process-three-node-cluster.js`, which is a
shared helper. These counts describe different sets and must not be
interchanged.
