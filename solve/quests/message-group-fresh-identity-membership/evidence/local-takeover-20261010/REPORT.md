# Safety-first learner receipt continuation — 2026-10-10

## Status

Implemented locally against the runtime in upstream commit
`60a60b2a6461d6fd9fa0f6f96fd3e25aa94651e4` (PR #114).
The remote head was read through GitHub and its one-commit difference from
`d3d947f2d98ca9ea03f1cae91403ff551ee4d18d` was confirmed to contain only the
published safety-first policy documents. The runtime in those heads is identical.

This is a local implementation and adversarial self-review, not an independent
approval, a GitHub publication, a completed recurring driver, or CREATE activation.
The local Git HEAD is a synthetic reconstruction marker, NOT an upstream commit.
Apply the packaged patch to a new exact-upstream checkout, never push that synthetic
history. The earlier invocation package need not be applied first.

## Implemented owner interaction

The six-module invocation prerequisite correction is preserved and composed:
actual invoked callback/router identity, exact handler retirement, configured
read timeout, retained operation-lane serialization, captured immutable inputs,
and invocation lifetime continuing through observation and submission. An old
callback cannot borrow its replacement's registration or unregister a successor.

The new work does two things in the existing owners:

1. Every NEW historical-receipt submission, including retries, samples canonical
   boot through the repository's existing authority. After that asynchronous
   admission, the existing mutation gateway performs a final synchronous
   invocation/lease check adjacent to its call into the gateway. Its host-only
   `submissionIsCurrent` check is not serialized into query options. No new
   timer, queue, durable store, workflow, or cross-group protocol is introduced.
2. `OperationWorkflowOwner.recoverMessageGroupLearnerOutcomeFromRecipient` accepts
   an operation ID and explicit witness route. Inside the same retained lane it
   asks `ReplicaOperationRepository.recoverMessageGroupLearnerOutcome` to construct
   read/record inputs from the authoritative operation row. It no longer needs the
   original request packet after a lost SQL answer or reconstruction. A COMMITTED
   permit is readback-only and must match a coherent already-recorded phase. It
   is never rewritten to IN_FLIGHT; initial action authorization still rejects it.

The common recorder owns exact action and stamp validation, current claim and
ordinary settlement checks, and its full-row conditional update. Recovery by ID
uses that same algorithm rather than another receipt validator. The explicitly
selected witness is still required; there is no default to the uncreated target.

## Revised late-receipt contract

The published safety-first ruling explicitly supersedes only the old requirement
that expiry/boot change alone must make an already-submitted exact historical
receipt fail to commit. Tests in the existing recipient integration file now
exercise the revised obligations:

- A real, exact receipt can commit late only under the unchanged row-CAS basis.
  Every column outside the three declared receipt columns is compared; the
  original permit fences and sequence, ordinary history, claims and debt remain.
- The obsolete caller returns UNKNOWN and performs no later proposal or physical
  operation. A new invocation with revoked authority cannot report current success.
- When receipt wins first, a successor claim can adopt the row and recognize the
  original result without native reread, new receipt write, or another proposal.
- When the successor claim wins first, the older receipt CAS loses without
  overwriting the claim, and the successor can still record the original result.
- Lease expiry or boot revocation during backoff prevents another submission.
  A local lifetime change while asynchronous admission completes also prevents it.
- Recovery without native application remains UNKNOWN, then records the same
  action once it really commits. Missing/unavailable operation rows cannot be
  replaced by cached data or the previous caller's packet.

These are not cross-group commit-time revocation guarantees. No clock or cache
is consulted nondeterministically during replicated application. A proposal,
role-only membership observation, uncertain result or historical ADD receipt
still grants no CREATE, promotion, cleanup, lane release, or successor action.

The earlier `commit-authority-required.mjs` and all original evidence are retained
unchanged in the prior package. Re-executing that old criterion on this source
still returns **2 pass / 2 fail**, with the two original intended refusal
assertions failing. That result is not relabeled green. Its acceptance criterion
has an explicit successor; the new tests exercise the same schedules with the
new write-set, ordering, uncertainty and no-next-effect obligations.

## Measured results

All measurements below are LOCAL DIAGNOSTICS, using the retained explicit loader.

| File | Node test entries passed |
| --- | ---: |
| Registered recipient, submission, late receipt, and request reconstruction | 37 |
| Existing native/operation recording integration | 54 |
| Actual SIGKILL process-loss integration | 4 |
| Existing ordinary message-group handler | 7 |
| Total | 102 |

These counts include parent entries where Node reports them; they are not counts
of individual assert calls. Each run completed with zero cancelled/skipped/todo
entries. The original eight recipient leaves and prior invocation tests remain.

Twelve isolated source mutations were detected at the named failing leaf and its
actual ERR_ASSERTION message: captured callback, exact unregister, configured
budget, post-delivery invocation lifetime, uncertainty after submission, retained
lane, immutable queued inputs, per-attempt boot, per-attempt lease, post-admission
local lifetime, an extra receipt write effect, and refusal to recognize a coherent
already-committed recording input. Every mutation restored the original source;
the complete 37-entry positive passed again. No arbitrary failing title, setup
failure, timeout or cancellation earned proof credit.

The first new retry test accidentally returned the retryable fixture error on
every attempt without advancing its virtual clock. It was terminated, is retained,
and receives NO negative-proof credit. The corrected test permits an incorrectly
submitted second attempt to finish, so the actual assertion detects resubmission.
The first bounded result also counted a claim UPDATE as a receipt submission
because the claim's WHERE clause contains a learner-stamp predicate. The observation
now requires the specific receipt SET clause as well. That apparatus error and
its output are retained; the two genuine retry-admission failures were then fixed
in source. The final suite passes with exact submission counting.

## Fidelity and gates

The loader uses real `node:sqlite` in place of `better-sqlite3`, plus the previously
disclosed narrow configuration/logging/uuid/in-process-socket adapters. Native
operation ports, repository SQL, handlers, router dispatch and gateway code are
real. The OS process-loss regression runs; the new owner reconstruction tests
close/reopen resources in one process. These are NOT normal locked-dependency,
physical network, replicated-SQL failover, power-loss, or distributed SQL/CDC
acceptance. Diagnostic durations are not performance claims or classified budgets.

Syntax checks, the existing impact-contract registry check (58 contracts / 29
coupled pairs), the three actual classification checks (2,326 files), and scoped
file-size checking pass. The touched owner and repository files already exceeded
800 lines at the upstream runtime; no thresholds were raised or new oversized
module introduced. This scoped check is not the complete global gate.

Normal dependency preparation failed on missing cached zod. The locked optional
native dependency also warned about this container's Node 22.16.0 being too old.
Strict test complexity could not load ESLint. Metadata refresh completed its first
three producers, then stopped on missing dependency-cruiser; no import-graph seal
was fabricated. No normal dependency, lint, strict-complexity, full-change-impact,
or canonical timing success is claimed. The canonical script requires normal
npm dependencies and MUST NOT use the diagnostic loader.

The normal Solver note command was attempted but could not load a dependency;
its command/output/exit are retained. This nonterminal report records the attempt
without claiming that the canonical Quest log was successfully updated.

## Consumer audit and remaining activation boundary

A source search of the learner stamp and phase identified schema/row translation,
ordinary persistence, the initial learner observer, claim/settlement predicates,
and the branch-selection/receipt owner as direct consumers. The initial learner
observer requires the in-flight phase and absent stamps; a committed recording
input is explicitly rejected by the proposal authorizer. The branch-selection
owner still requires its separate next permit, holder and native execution fences.
The handler's CREATE safety refusal remains in place, and every new recovery
case observes zero physical callbacks and no new membership proposal.

This is a source-bound direct-consumer census, NOT a complete transitive or live
CDC-to-effect certification. The dependency graph producer is unavailable here.
The source therefore does NOT activate recurring discovery, automatic REPLACE
progression, current CREATE, promotion, or cleanup. Merely wiring a successful
receipt return into those effects would violate the ruling.

The next integration is to call the ID-based recovery entry from existing owned
reentry/discovery, not to add a second loop. Existing observed-progress retries
already hold the operation lane: their internal continuation must not recursively
call this public retained-lane facade. Route discovery must use existing service
metadata as hints and real native observations as evidence. Prove stale wakeups,
repeated events, missing witnesses, recovery after a recorded permit, and existing
membership debt after ordinary failure before adding current physical effects.

Current CREATE then needs its positive real-owner path and negative old-descriptor,
later REMOVE, terminal/generation replacement and sole-worker proofs. The current
blanket refusal is not a completed positive CREATE proof. Ordered successor work
still requires both authoritative predecessor fencing and noncommitment; missing
history never grants reissue. J1 forward recovery remains unchanged.

## Preservation

The original prerequisite ZIP, its 183 verified manifest members, and its old gate
are preserved. The correction applies to its eight exact original preimages;
the additional operation-workflow-owner preimage was independently matched to
GitHub blob `0b2df9f0842c7c2b0490529460a7ec34ca04b693`, and the registered-read
contract to blob `33d1bf146a62dc83010bcee366f69a8b0e0e0119`. The latter contract now
points explicitly to the ruling and describes current submission/recovery scope.

The supplied patch includes the previous invocation correction plus this increment.
It does not replay older product branches. The original local report is retained
as historical evidence; this report is the current additive continuation.
No GitHub source/ref/workflow write succeeded for this increment. CLI Git failed
DNS and the current discovered connector exposes reads. This does not claim that
the project's previously working write/Actions route never existed.

Main, original full-lab FAIL, numerical timing debt, physical replacement/seed-loss,
independent source review and final exact-main/A1-v13 obligations remain unchanged.
