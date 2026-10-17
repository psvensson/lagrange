# Native events to held creation reconciliation: local source review

Verdict: ACCEPT the bounded implementation and local native/component proof for
continued WIP work. Publication and required home-lab measurement remain HELD.
This is the implementing ChatGPT session's author review, as requested by the
operator, not independent verification, terminal Quest landing, serving or merge
approval. No GitHub branch, PR, lab request or Solver receipt was created.

## Exact base and work boundary

Published base: PR133, work/rs-raft-genesis-observation-20261016,
6ba84863490bff9a43874a03f69ad2afff4b5898.
Base source subtree: 5e193fa018a7b29fc2943f13d8d562c1e7b9f98d.
Base test subtree: c1b896fa1c1a70b5c52555522bd699c75107f555.
Both baseline subtrees were reconstructed from the retained source/dependency
archive and published patches and checked against these actual Git identities.
The reconstruction has incomplete intervening documentation-only ancestry. It
must NOT be pushed as a Git history. Apply the delivered patch to a clean real
checkout of the published base. The package manifest identifies every changed
preimage/postimage and the final source/test subtree identities.

## Implemented owner interaction

WasmServiceLifecycle attaches one volatile WasmCreationReconciliation adapter to
an exact bound replica. It delegates scheduling, key coalescing, completion
waiters and in-flight exclusion to the existing OwnerKeyReconcileQueue. The
shared queue implementation is unchanged. There is one key per adapter and at
most one pending wake during an in-flight run; no timer or retry policy is added.

The native replica lifecycle subscribes the adapter to LEADER, FOLLOWER,
CANDIDATE, LEADER_CHANGE, TERM_CHANGE and APPLIED_PROGRESS after its ordinary
role subscribers are installed. Callbacks capture the exact port and creation
context and only enqueue. They do not perform a native read, submit INIT, await
completion or retain event payloads. Explicit START and event wakes use this
same keyed continuation and the existing genesis/writer-completion owners.

Before and after each asynchronous continuation, the adapter checks the exact
registered replica, port, creation context, initialization and closing state.
An old callback cannot retarget a new replica or port. Event data is not authority:
current applied state and committed membership are still read by the existing
genesis owner. GENESIS_OBSERVED remains evidence; the outer state remains
BOOTSTRAPPED_HELD. No endpoint, ACTIVE state, user read/write grant, completed
creation journal or leader publication is added.

Shutdown closes admission synchronously, aborts pending writer interest through
the replica's existing stop path, retires exact event subscriptions, joins actual
queue work, and only then clears queue bookkeeping before native closure.
OwnerKeyReconcileQueue.shutdown() itself is not a join and is not used as one.
Every unsubscribe is attempted. Failure retains its callback and remains visible;
a later explicit cleanup call may retry it. There is no automatic cleanup retry.

## Review corrections and first results

1. The initial one-case native baseline formed its real three-voter group but
   left INIT absent without a second lifecycle call. It failed at
   NATIVE_EVENTS_DID_NOT_RECONCILE_ORIGINAL_CREATION. This baseline precedes the
   expanded final witnesses and is not falsely identified as their full run.
2. The first connection passed that native witness. Broader historical tests
   then failed because automatic INIT preempted their manual/pre-INIT fault
   schedules. Their assertion files remain byte-identical. Their shared fixture
   now explicitly delays event enqueues for those schedules. The new main native
   positive opts into ordinary automatic delivery with no interception. Three
   fault cases delay only setup, install a real native-response fault, then resume
   actual event delivery. This is test scheduling, not a production opt-out flag.
3. Expanded review reproduced a cleanup defect: a permanently latched rejected
   shutdown promise prevented a later explicit unsubscribe retry. Six controls
   passed and the new seventh case failed. The adapter now returns the original
   failure to its caller and clears only that failed settlement for later explicit
   cleanup. The retained callback and closed-admission fence are unchanged.
4. Scoped static review found two new empty/null cleanup-outcome violations.
   Cleanup now returns an explicit RETIRED or FAILED result and its retained
   errors. No allowance or baseline was raised. A formatting-only lint correction
   and a failed author-side comparison helper are retained separately.

## Final local measurement

Execution environment: cloud container, Node 22.16.0, actual locked
better-sqlite3 11.10.0 and actual raft-rs WASM. The standard classified repository
runner reported sensors unavailable; no thermal policy was changed. This was
not the user's controller and not a home-lab job. No test timeout or retry policy
was overridden. Source/test bytes were hashed before and verified after execution.

Final frozen run, after canonical metadata refresh:
- 21 distinct files, 733 runner-reported assertions, all files PASS.
- New mechanism witness: 8 cases, 646 ms whole file.
- New native RF3 event witness: 4 cases, 2226 ms whole file.
- Nineteen existing lifecycle, genesis, journal, schema, metadata, native-completion
  and shared-queue files: 721 reported assertions.

The native cases establish progress from one initial pre-election START, retained
wake during real no-quorum INIT, resumption after the unchanged writer-interest
deadline when the withheld APPEND_RESPONSE messages return, and joined shutdown
while an event-owned writer interest is pending. No second START or manual INIT
supplies the successful genesis. The existing fixed transport delivery schedule
and zero-delay native wakes are used; no extra tick or status-as-progress helper
is inserted after formation.

Mechanism cases establish enqueue-only callbacks, 1000-event burst coalescing,
retained wake during an await, stale registry/port rejection, listener rebind and
retirement, actual queue joining, failure propagation and explicit cleanup retry,
untrusted event-payload refusal, and ownership recheck after a pending result.
They use a synthetic notification source and the actual shared queue, not fake
successful genesis or membership answers.

A preceding 21-file run also passed, but its import-graph seal was subsequently
regenerated. That first run is preserved separately and is not the final frozen
candidate receipt. The later run is not a retry of a failing behavioral result.

## Unchanged-test source mutations

Each source mutation was isolated locally, measured once, then restored in a
finally block. Both new witness files remained byte-identical throughout.

- Disconnect all native event enqueues: native file 0 pass / 4 fail. The first
  failure is the named missing INIT after native formation. The remaining cases
  stop at their required fault-engagement prerequisites; they are not three extra
  established safety defects.
- Remove only APPLIED_PROGRESS subscription: native file 1 pass / 3 fail. INIT
  occurs, but its covering membership observation and no-quorum/deadline reentry
  fail at APPLIED_EVENT_DID_NOT_RECONCILE_COVERING_MEMBERSHIP,
  IN_FLIGHT_APPLIED_WAKE_WAS_LOST, and APPLIED_PROGRESS_DID_NOT_RESUME_UNKNOWN.
  The shutdown control passes. These are causal liveness falsifiers of the same
  omitted event connection, not import or timeout failures.
- Remove only the post-await registry guard: mechanism file 7 pass / 1 fail at
  STALE_RECONCILE_RESULT_ESCAPED_AFTER_AWAIT. An UNKNOWN/deadline result escapes
  after replacement instead of the required held/shutdown classification.
  This is a stale-result classification defect, not a demonstrated serving grant.

## Static checks and remaining gates

PASS: scoped ESLint; strict new-module/new-test cyclomatic and cognitive checks;
changed-source literals, runtime grammar and silent-catch checks; source whitespace;
canonical classification/import-graph refresh and shard validation; existing
impact contract/pair update. Canonical census: 2403 tests, 66 contracts, 37 pairs.

The changed-source decision-boundary check still exits 1 on four pre-existing
replica-lifecycle findings. Direct baseline/current source comparison verifies
identical findings apart from line positions. The new adapter has zero findings.
The complete precommit, global inventory/duplication/analyzer-memory gate, full
change-impact cone and whole corpus were not completed in this stage and remain
open. No success of these scoped checks substitutes for them.

## Evidence ceiling and publication hold

Actual native groups and durable files are exercised, but metadata/journal reads
still use the disclosed one-database component adapter; transport is queued
loopback, setup timing virtual, and guest execution a fixture collaborator.
This is not physical multi-host consensus, replicated metadata, native SIGKILL
recovery, power-loss or real guest/artifact verification.

The connected GitHub reads verified the actual published base, but this turn's
available methods contain no issue/file/ref writes. Repeated discovery and the
installed-plugin search did not expose an executable write action. Direct Git
network access was also unavailable. Therefore no branch was published and no
home-lab job was submitted. Existing standing lab authority was not revoked or
changed; this is a session tool limitation. The patch, all available first-result
logs, negative patches, review and exact-byte manifest are retained in the
conversation checkpoint for application to real remote ancestry.

The next activation boundaries remain current metadata permission, durable local
serving/publication and RETIRED-before-CLOSED through joined lifecycle owners.
The first-opening/file gap, upstream durable selection intent, artifacts,
replicated-metadata/process-loss/multi-host proof and wider rs-raft gates remain
open. Main, shared local staging, lab controller policy, F1/W07, TX1 and FreshMG
were not modified. Existing Quest receipts remain unchanged.
