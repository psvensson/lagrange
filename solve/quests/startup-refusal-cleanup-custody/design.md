# Startup refusal and cleanup custody — bounded design

Input: published 294e0de4c22cb61d3710e46dc464b99b0ed0a4da. Local complete
production tree reconstructed from retained archive and incremental patches;
exact preimage hashes must be rechecked in the publication checkout.
Status: WIP, not independent approval or landing. PR117 cleanup comments
4247435390, 4247435452, 4247435487 remain historical review inputs.

## Owners and consumed surfaces

- src/partition/partition-consensus-port-opening.js:41-49 builds the service
  refusal but currently does so only after shutdown succeeds.
- src/message-group/message-group-service-raft-lifecycle.js:168-195 catches
  startup failure, then awaits closeMessageGroupConsensus.
- src/message-group/message-group-consensus-port.js:209-220 clears port/db
  references before their close finishes.
- src/wasm-service/wasm-service-replica-lifecycle.js:62-107 owns failed-open
  cleanup and lifecycle transitions; :134-198 owns shutdown, currently sets
  STOPPED even on release failure and removes handler custody prematurely.
- src/wasm-service/wasm-service-consensus-port.js closeWasmServiceConsensus
  has the same early-clear defect; SessionKVStore.close releases a borrowed
  connection, not its own database.
- src/partition/partition-service-lifecycle-methods.js owns ordered release;
  its resource fields already clear only after a successful call. Do not
  bypass that sequence to close a database beneath an unclosed port.
- src/raft/raft-operation-port.js owns the common opening-failure vocabulary.
  Add only pure error composition there, with no lifetime registry or callbacks.

## Facts, lifetimes, and decisions

The immutable consensus outcome is the runtime's fact. Service wrapper metadata
is retained, not recomputed. An AggregateError carries the original wrapper as
cause/errors[0], the actual cleanup error as errors[1], and the original
code/phase/consensus/service identity at the top level. No new retry deadline.

A failed opening's startupFailure is the existing service owner's local
unsettled-opening obligation. Set it before awaiting cleanup; clear only after
that cleanup succeeds. While it exists, initialize refuses without allocating
anything or driving a second cleanup attempt. Retrying shutdown is the explicit
reachable continuation; no poller or timer is added. The error remains a
historical outcome even after a later cleanup succeeds.

Resource fields remain custody, not completion guesses: capture the exact port
and db; clear each only after successful ordered close. If close throws after
effect, keep the handle and let the existing idempotent close/read-open boundary
settle it on retry. Never close a dependent database if port release has failed.
The same service's concurrent consensus-close calls join one in-flight operation;
it is cleared after settlement, including failure, so a later retry can act.

WASM retains its existing lifecycle state machine with one explicit
CLEANUP_REQUIRED state. Failed cleanup cannot return to CREATED or claim STOPPED.
During failed-open cleanup STARTING still makes concurrent initialize join the
opening; after failure CLEANUP_REQUIRED refuses with its retained primary error.
Shutdown can retry CLEANUP_REQUIRED, retains exact handler until retirement is
confirmed, and reaches STOPPED only after activity/handler/port/db/KV obligations
finish. Initialization while shutdown owns cleanup cannot reopen the instance.
A successor at the same address must never be retired by an old instance.

## Failure edges / caches

Canonical refusal + successful cleanup: unchanged typed error, no resource debt.
Canonical refusal + thrown cleanup: aggregate preserves primary and secondary,
local hold remains. Ordinary initial errors remain ordinary (not reclassified).
Port close rejection: keep port+db, stop dependent release; later close retries.
DB close failure before effect: open handle retained. After effect: closed handle
retained until idempotent completion. KV failure: retain KV reference.
Shutdown failure: retain state and handler/dependent fields; no terminal claim.
Dropping an error diagnostic must not grant permission: initialize consumes the
same owner's outstanding startup state, not a cached runtime-health answer.

## Witnesses and limits

First baseline: existing native opening file 12 pass / 8 added failures.
Six actual initializers inject SQLite close before/after effect, preserving
actual runtime backoff; two exercise an earlier partition activity/KV release.
Each requires typed primary, exact secondary, no new native entry, custody,
blocked initialize even after runtime heals, owner shutdown retry, and ordinary
new-instance reopen. Further tests cover joined close, repeated failures and
shutdown state/handler custody. Source-only revert must restore behavioral reds.
All fault patches are test-only wrappers around existing owners, restored in
finally; teardown rescue of old lost handles is not positive evidence.

This is not proof of every full-service shutdown failure, hung host callbacks,
whole-file loss, receiver snapshot replacement, TX1 admission or multi-host
certification. Those remain separate obligations and cannot be closed by this
increment. Use the operator's existing 10x elapsed-test tolerance; runtime and
caller deadlines are unchanged.

## Independent review categories

Review all items in recovery-replay, admission-gating, concurrency-serialization,
owner-interaction and harness-fidelity. Specifically attack error/refusal shape,
exact released handle versus replacement, startup/shutdown overlap, rejection
observability, repeated close outcomes, dropped resources, phase changes and
safe subsequent opening. No self-check is an approving Solver verification.

## Attempt-2 completeness and scope refinement

Construction, initial status and campaign refusals all route through the same
partition opening owner. The earlier-read adapter variants are now explicitly
migrated, not left as a second cleanup algorithm. Exact handler retirement must
be RETIRED or ALREADY_ABSENT to discharge custody; a refused identity API is not
completion merely because it was logged. This assertion remains in the existing
transport identity owner. Typed port-close failures are consumed through the
existing assertRaftOperationSucceeded contract before dependent DB release.

WASM installs its existing lifecycle settlement before invoking callbacks so
reentrant shutdown/init joins cannot observe a predecessor's settled promise.
An activity-stop error still permits resource cleanup, but remains an outstanding
shutdown obligation; actual cleanup failure is retained alongside it. The .live
property includes CLEANUP_REQUIRED to prevent the host from replacing an instance
already known to retain resources. The pre-existing STOPPING-successor policy
and host startReplica diagnostic/port-allocation policy are not redesigned here.

The added direct asynchronous close tests are contract-boundary tests with real
SQLite, not native core faults. The status/campaign adapter tests use a real port
with controlled outcomes, not native trap claims. The pure error helper test
requires the newly introduced API and is candidate-only; it is not part of the
baseline/source-revert behavioral comparison. Earlier test typo .isLive() rather
than the real .live getter is retained as fixture error, not a safety falsifier.
