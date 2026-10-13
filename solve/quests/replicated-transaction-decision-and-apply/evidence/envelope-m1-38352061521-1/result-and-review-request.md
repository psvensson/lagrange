# TX1 envelope admission and seed M1 — measured result and review request

Status: bounded source/proof correction measured locally and on GitHub. No
independent approval, eight-receipt seal change, Quest landing, main integration
or release. Four wider legacy-fixture failures remain ordinary failing tests.

## Exact candidate and evidence

Remote input: `4c8f02e8e6d9da3520fa909885b9391ba6a442a0`.
Local input ancestor: `bcb299c777258ac680b2fa686d06b503a6647387`; its source/test
input trees equal the remote input, but the whole commits are not interchangeable.
Local candidate: `f50a66a5e9a0f4937722aa1f39a6ee8c1986f092`.
Hosted measured candidate: `43563146c24e907a993045fa51f180608c795c1c`.
Source/evidence publication: `5c5de9acff0fc3ad5eb8bc800183795746696665`.
Source tree: `9ec2119cb275f5b54bad15a3fadeb4196a3d061e`.
Test tree: `dff9d0d1e574e1f006e44b4260e11378fd851bdd`.
Run: `38352061521`; artifact: `11790189670`.
Downloaded ZIP SHA256: `3306ed9a579efdba4f1f8efc57a28b6ed3b2e1288bcb9f773ca984b20f431805`.
The archive checksum and every file in its SHA256SUMS verify. The Git bundle and
all four chunks matched their prerecorded hashes before import. Hosted final
tracked state is clean and its uncommitted source delta is empty. Local Node
22.16.0 and hosted Node 22.23.3 measured exactly the same source/test trees.

## One real production admission defect corrected

The existing `isExecutionEnvelope` owner predicate was exported and documented
for preproposal admission but not called. PREPARE/DECISION commands missing their
required envelope, or containing malformed fields, passed the command-byte
validator. The original participant-apply test already expected their refusal.

One production file now consumes that existing predicate:
`src/partition/partition-participant-transaction-bytes.js`. No new classifier,
build-compatibility owner, durable state, retry path or deadline is introduced.
Generation-origin admission is unchanged. Complete foreign envelopes remain
shape-valid; release/deployment, not this predicate, owns compatibility.

Already-committed apply still consumes historical/mismatched envelope bytes as
ordered and records diagnostics. It cannot use a preproposal check to reinterpret
committed history or stall recovery. The new two-case witness exercises malformed
field combinations before proposal and real SQLite PREPARE/COMMIT/replay through
the existing controllable committed-delivery fixture. It is not a native quorum
or cross-build deployment proof.

Identical final witness bytes across all three arms:
- original source: 1 pass / 1 intended admission assertion failure;
- corrected source: 2 pass / 0 fail;
- source-only revert: the same 1 pass / 1 admission assertion failure.
The committed diagnostic/replay control passes in every arm. Both negative runs
reach ERR_ASSERTION, not import/setup failure, and the source is restored exactly.

## Controlled fixtures now distinguish origin from serving permission

A committed generation origin is necessary but does not open application admission.
The existing fixture's release helper is exported and reused when origin is
appended after leadership. Tests assert CUTOVER_PAUSED both before and after
origin, then consume the real release-fact/resume functions against their declared
controlled-port observation. No OPEN assignment or private session insertion.
Classifier timing, rowid/nullable-outcome checks, duplicate effects and existing
refusal assertions remain. Controlled delivery is still labelled as such.

Participant apply improves from 25/27 to 27/27; staging from 16/20 to 19/20.
The one remaining staging failure and three legacy-session failures presume a
successful legacy BEGIN that the current production fences refuse. They are not
made green by inventing historical sessions or weakening the new protocol.

## M1 now uses real coordinator persistence, including independent disk readback

The standalone seed fixture previously omitted the disk startup owner's membership
decision and stopped before release. It now supplies the actual
`resolveAutoRejoinStartupDecision` result for its fresh directory. A subsequent
failure exposed its 1-second test-only setting being reused as release budget.
M1 now uses the existing 30-second production BOOTSTRAP_DEFAULT for that budget;
no production deadline was increased. Other accelerated fixture scheduling stays
explicit. The shared virgin-seed helper was not changed.

The actual BootstrapService, seed hydration engine, CDC integration, SQL engine
and production coordinator persistence gateway perform the migration cutover.
The transaction updates `tables-p1` and `schema_migration_partitions-p1`, records
COMMITTED/TWO_PHASE_COMMIT with frozen participant count two, and retains the exact
participant list in the coordinator system tables. This is not the in-memory
SQLite gateway double used by the smaller coordinator-reconstruction fixture.

The strengthened M1 requires all three replicas of each of four relevant system
partitions to agree. After strict orderly shutdown it requires closed database
handles, then launches a separate read-only Node process. That process opens
**twelve distinct real SQLite files** and must reproduce the exact coordinator
row, participant list and both cutover effects. The raw TX1_M1_PERSISTENCE receipt
reports twelve files and explicitly `coordinatorRestarted=false`.

This proves real same-host RF3 system-table persistence and disk readback after
orderly close. It does NOT prove coordinator process-loss recovery, power-loss,
physical host separation, split/merge, downstream CDC delivery or whole-release
readiness. The new process is a disk reader, not a recovered coordinator.

## Current complete selected measurement

Twenty-one files / **254 cases: 250 pass, 4 fail**, no skipped, cancelled or TODO
cases. This includes the envelope cases and M1; they are not additional totals.
The hosted and local counts and failing case names agree.

- participant apply: 27/27;
- participant staging: 19/20;
- legacy-session statement admission: 1/4;
- envelope admission/replay: 2/2;
- real seed M1: 1/1;
- all other selected native storage, participant, coordinator, release, opening,
  and cleanup files pass.

Hosted M1 is 45155.977206 ms, inside the accepted 300000 ms integration ceiling.
Its raw output still contains one provisioning `wait_bound_spent` diagnostic;
the local final M1 contains two. These diagnostics are not deleted, reclassified
as satisfied waits or certified by the migration assertions. The one-host fixture
cannot satisfy a request for two distinct provisioning target nodes. Whole seed
progress/performance and fault-domain certification remain separate.

The already-failed legacy-session case takes 30190.469941 ms on GitHub, beyond
its accepted 20000 ms unit ceiling. It retains both behavioral and elapsed reds.
No protocol, lease, retry, election or caller deadline was relaxed.

Focused lint, changed-production literals, actual operation-boundary audit,
impact registry (62 contracts / 33 coupled pairs), generated shards and changed-
range whitespace pass. Full guidelines still stop at **311 new literal violations
and 1266 inherited matches**. Later chained checks remain unproved. Historical
retained-patch formatting is not resolved by the current delta's whitespace pass.

`focusedProofPassed=true`, `allRunGatesPassed=false`, `independentApproval=false`,
`mergeReady=false`. Actions correctly remains red. The eight-receipt TX1 file was
not changed; a passing M1 test is not an independently accepted sealed receipt.

## Earlier attempts and remaining work

The local package retains original apply/staging/legacy/M1 failures, the M1
missing-authority failure, its too-small fixture-budget failure, intermediate
M1 passes and final exact-source controls. One metadata refresh was interrupted
by the outer tool limit; a separately retained complete refresh produced the
candidate. No interrupted run is substituted for this hosted measurement.

Historical admitted legacy obligations and their complete producer/consumer
retirement map remain open, consistent with findings 1/3 of the supplied ownership
audit. Current fresh legacy admission is forbidden: a refused BEGIN cannot prove
its statements, contamination or migration. The next unit must establish genuine
historical preconditions or explicitly supersede obsolete witnesses with stronger
accepted ones; not private-state fabrication or permanent parallel execution.

Real coordinator crash/restart recovery remains beyond this orderly M1 readback.
PR117 review 5495011230 adds initialization/shutdown serialization findings
4251495789/4251495885; CREATE cleanup/physical-worker claim 4251078406 also remains
with the existing lifecycle/host owners. Neither is repaired by this increment.
The known replica-handler failure is outside this TX1 selection and remains open.

## Independent review requested

Review the exact delta from the remote input, the current bounded proof plan,
one changed production predicate, all fixture changes and raw three-arm/wider
output. Cover admission-gating, recovery-replay, owner-interaction, concurrency
and harness fidelity. Attack malformed versus merely foreign envelopes, every
preproposal consumer, committed replay, origin versus release, real disk-derived
seed authority, original production budget, actual system-table RF3 writes,
strict handle closure and new-process readback. Preserve the distinction between
orderly persistence and coordinator crash recovery and the remaining legacy reds.

The existing review-only PR/branch is used; no new competing implementation lane
or FreshMG branch was modified. A separate automated source review is requested,
not a directly launched subagent or an approving Solver verification.
