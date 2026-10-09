# Recovered learner -> operation recording: bounded author review

Date: 2026-10-09. Existing Quest: message-group-fresh-identity-membership.
Base: 16bcff35bc44d2c6c6151cfb29d35fa7a4b4325a (PR111 continuous install proof).
Measured source/test/metadata: a6e240a9e4d09618fc8635548eaba5b6b36263b3.
Evidence-bearing pushed head: 5422ff8d9788122b59719890e49b39f7da18923a.
Action: 37933629481. This document changes no measured runtime bytes.
Author implementation/self-review, not independent approval, Solver landing,
main integration, complete driver activation or final cutover certification.

## Implemented owner interaction

The existing repository authorization module now exports
recordMessageGroupLearnerCommit(repository, request, readMembership).
It is an explicit-context repository function, not a new coordinator or an
additional method on the already oversized repository facade. The existing
observation module exports aliases for its original request capture and issued-
intent predicates so this recording path does not copy those rules.

The host supplies a bound native READ_COMMITTED_MEMBERSHIP method separately
from the request. The original group, operation, transition, sequence, stage,
permanent target and issued-attempt term must match the recovered origin.
Its applied anchor must be beyond the original configuration basis. A second
canonical bootstrap observation must show the source voter and target learner
with the correct permanent identities and sufficient applied/generation progress.
These reads do not propose membership.

One existing-row SQL conditional update changes only membership phase,
committed permit and learner stamp. It reuses membershipRowWhere, including
exact holder, original identity/permit/stamps and ordinary terminal fields.
Only the permit outcome and actual proposal index advance: its execution term,
configuration, destination, generation and original issuer are not refreshed.
Ordinary workflow/status/completion, membership obligation/lane, reservation
and cleanup state remain unchanged. An ordinary failure after issue may record
its retained debt. Previously successful settlement cannot newly record that
in-flight learner path.

Exact replay returns the recorded fact with no SQL write and no refreshed
native stamp. Lost write answers resolve only through exact authoritative
readback. Unavailable evidence/readback remains explicit UNKNOWN or UNAVAILABLE,
not permission to reissue, clean up or discharge the membership obligation.

## Proof and exact limits

Normal locked better-sqlite3, actual repository policies and native operation
ports, existing in-process native transport. GitHub-hosted Ubuntu/Node22,
existing LAGRANGE_LANE_JOBS_CAP=1. This was not a GCP or physical lab cluster.

| Group | Reported assertions | Whole-file milliseconds |
| --- | ---: | --- |
| Consumer and recording integration | 47 | 5761 (limit 30000) |
| Branch authorization | 90 | 996 (limit 2000) |
| Membership operation lane | 8 | 1103 (limit 2000) |
| Workflow persistence | 24 | 1327 (limit 2000) |
| Reservation restart | 39 | 1218 (limit 2000) |
| Committed membership read | 5 | 707 (limit 2000) |
| Replica-image checkpoint transfer | 64 | 792 (limit 2000) |

Seven files, 277 reported assertions; all unchanged budgets pass. The original
runtime with the new tests is RED because recording does not exist. Its worker
also refuses the missing export; that is missing-capability evidence, not an
independent corruption or process-recovery failure. No cancelled/skipped tests
are credited. Four preparation/static attempts remain nested with their failures.

New controls cover exact recording and SQL no-op replay, missing/wrong origin,
historical ADD after actual REMOVE, real holder renewal during native reads,
ordinary terminal settlement racing the SQL write, successful-terminal refusal,
lost write response, and temporarily unavailable authoritative readback.

The actual process-loss witness starts an operation worker with its own normal
SQLite connection and repository. Native reads cross test IPC to the parent's
real native ports. It verifies TWO completed native reads, the in-flight phase,
and no open SQL transaction before holding the update. SIGKILL terminates that
worker; the row remains byte-identical. The existing owner-claim CAS then admits
a successor after virtual expiry. A newly forked worker opens the same durable
operation file and records the exact original result, preserving the new holder
and UNKNOWN membership debt, with no new membership proposal or target CREATE.

This is real operation-worker process loss. Native nodes remain alive in the
parent; the fixture SQL is NOT replicated control-plane SQL/CDC. It is not full
node loss, power-loss safety or automatic production-driver reconstruction.
The native callback binding is supplied by the test/host, not a registered
wire membership handler. Those stronger interactions remain to be proven.

## Adversarial controls and source discipline

Three source weakenings each fail the named test's actual ERR_ASSERTION:
- removing original action equality permits a wrong operation's evidence;
- removing the holder from the existing SQL basis lets an old holder install
  the stamp after real claim renewal;
- removing terminal fields lets an earlier basis write after settlement.

The terminal test measures the actual row invariant before the outcome assertion,
so that mutation is attributed to the intended invariant rather than a different
earlier assertion. Full structured failure details are retained. The process
executor is the already-reviewed private-group helper from PR110, copied only
into the proof directory; it is not merged as runtime code. Its worker groups
are drained/terminated before mutation source restoration. Restored positives
pass. This is a bounded mutation suite, not an exhaustive proof.

The source keeps one inherited cyclomatic finding: selectMessageGroupMembershipBranch
at 39, unchanged from the base. No new cyclomatic or cognitive violation. Strict
test/worker metrics pass. Scoped lint and file-size checks pass. Explicit JSON
counts for decision, literal and runtime-grammar checks are zero. Two inherited
settlement-SQL literals were named in their existing owner without changing
predicates. Generated metadata and shard checks pass. Full change-cone/static
and the inherited global baseline/timing debt are not claimed solved.

## Integrity and synchronization

The original supplemental install package was not blindly applied: its main
continuous scenario already had a newer canonical proof on PR111, discovered
at the start of this turn. This increment builds on that actual published head.
The older supplemental archive remains available in the conversation; this note
does not claim every historical binary package was re-uploaded.

All new source/test/contract bytes are published on the recording branch, plus
canonical Solver evidence and append-only Quest records. Initial patch-format,
line-length and semantic-static failures are nested and hash-bound, not erased.
No gate/timeout/assertion budget or sealed acceptance was weakened.

Downloaded Actions ZIP SHA256:
54cce08244d58777831e4fe2bbd3e85a60f10a211deffe5882b80f00d66a6342.
All 160 named manifest members independently rehashed and matched.
Canonical Solver archive SHA256:
9fa9caf0f39f16b2873b3de86585c075b5e3b7ca750379f30e5239d43ab2649a.
Canonical upload is recorded in learner-recording-37933629481.json; no separate
canonical-release download is claimed. Expected-head normal non-force push
and final remote head were verified; measured tracked/untracked status is empty.

## Remaining review and next implementation

This records a historical fact and observed membership stamp, NOT a current
CREATE permit, live lease grant or globally atomic nodes/operation/native read.
Same-group callback composition must remain owned by the actual driver. Native
configuration or boot changes after observation are not excluded by another
metadata-read loop; current execution/CREATE must use their own owned fences.
Exact replay must not be mistaken for renewed permission. Missing evidence does
not cancel an issued action. Currentness and ordered successor semantics remain.

Review action/attempt binding, source-target subject, terminal-debt preservation,
SQL predicate completeness and lost-answer behavior, native/operation ownership,
malformed input/readback and test/process-lifetime fidelity. Independent review
must precede source integration. No independent approval is self-issued.

Next: connect the existing membership reconciliation/recipient path to this
recording function, then acquire current CREATE authorization through the
existing descriptor/admission/sole-worker owners. Do not simply remove planner
or handler parks because this component passed. Ordered successor attempts still
require an affirmative ordering against predecessor execution and noncommitment;
UNKNOWN, missing origin or socket closure is insufficient. J1 remains binding.
Full changed-path/static proof, inherited timing debt, original 941-file lab FAIL,
physical serial replacements/restart/off-seed seed-loss and exact-main/A1-v13
compatibility gates all remain open. Main, prior preservation refs and other
implementation branches were not modified by this increment.
