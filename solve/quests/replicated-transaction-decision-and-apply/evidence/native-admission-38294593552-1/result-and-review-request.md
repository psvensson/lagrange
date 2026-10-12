# Real partition/TX1 admission and recovery — result and review request

Status: focused proof PASSED; wider regression and global static gates remain
RED. This is a test/fixture correction, not a production transaction repair.
No independent approving Solver verification, Quest landing, main integration
or release is claimed. The existing eight-receipt TX1 seal and receipt file are
unchanged, and the existing work branch is retained.

## Exact candidate and evidence

Published input: `64b85decf37d58d9c52cabbd95b207ae027bd050`.
Local retained parent: `7d91de9ff1cf8d4a8c24558603b97d75e75db0e3`, an ancestor
already preserved in that remote branch, not a substitute remote HEAD.
Local measured candidate: `bcb299c777258ac680b2fa686d06b503a6647387`.
Hosted measured candidate: `5d7a0981eabbe8a9745c6e0e7bd3eadb62e46bd1`.
Source/test/evidence publication: `5479e597a6a106773bbc322a22d93ad5e0dc1385`.
Production tree before and after: `34af50ee2245c8bd99b0f87e484beb6871d11c3c`.
Test tree after: `759638a94e5ed9a0dcac89eba03ae9c68403361d`.

Run: `38294593552`; artifact: `11768215948`.
Downloaded ZIP SHA256:
`eb0cb8001a4af828f8576fd22a61f26ea1b4adcd3b4653051c07b91acce006db`.
The downloaded archive and all 96 listed files match their hashes. Local and
hosted final source/witness identity manifests are equal. Local Node 22.16.0
and hosted Node 22.23.3 measured the same content. Final hosted tracked status
is clean. The Git bundle and all three chunks were checked byte-for-byte before
import; the two local WIP commits are preserved on the existing work branch.

`summary.json` is searchable here; `raw-evidence.tar.gz` preserves the executed
measurement, commands, TAP, source identities, bundle and preparation evidence.
The downloadable Actions archive additionally contains the final publication
and clean-worktree records. Local first-red and intermediate fixture attempts
are retained separately; they are not substituted for this final measurement.

## Why the original tests stopped before their claimed work

The six partition-unreadable-durable-record cases initialized native consensus
but never obtained application-write release. Their first setup write was
refused while application admission was CLOSED, before their storage fault.

The native TX1 A1-A5 and coordinator-restart fixture created a name-prefixed
control partition, while the production release recipient requires the canonical
`INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS]`. They therefore stopped at
`current_control_owner_fact` rather than reaching a transaction.

The original twelve tests and their original coordinator fixture were measured
against the unchanged production tree: 0 pass / 12 assertion failures. Repairing
these preconditions changes the fixtures and some assertions; this is NOT an
identical-test demonstration of a production-code fix.

## One shared real release composition

`test/partition/partition-release-fixture.js` composes the actual canonical
control PartitionService, ReplicaHandler recipient/recovery owners and existing
operator-release request. Both native fixture families consume it. It derives
membership, leader and build facts through the existing production owners and
uses one original request deadline and the returned retry delay. It does not
assign an origin, OPEN flag, private participant session, false release census
or bypass a production fence.

Caches, loopback transport and explicit operator release are declared fixture
inputs. This is not automatic seed-release or complete cluster-formation proof.
The real participant group has three replicas with independent SQLite files and
actual raft-rs WASM, and facts are read independently from those files.

The settle helper now requires the captured committed prefix on every LIVE
replica and asserts the bounded wait result. Intentionally stopped replica files
are inspected separately and must catch up on actual reopening. The old helper
waited on stopped replicas and ignored the expired wait; no deadline was raised
or expired wait relabeled as success.

Recovery of native consensus does not itself reopen application admission. The
storage tests await the existing release owner's revalidation before new writes.
The port retains its exact durable-record-read failure and no-native-entry
assertions. Two old application-level error expectations are explicitly aligned
to the already-current release-first CUTOVER_PAUSED result; storage faults,
identity, bounded recovery, committed data and sibling-isolation checks remain.

## Final focused proof: 13 passing cases

1. Six storage-fault cases now reach their intended faults after real write
   admission: lost applied-state table, IO/corruption-style read refusal,
   initialization/restart refusal, scheduled-tick containment, follower/leader
   separation and shared-runtime reconstruction. They preserve old committed
   data, exact identities, typed refusal and later admitted writes.
2. Native A1-A5 now exercise actual BEGIN/staging, replicated PREPARE, matching
   participant identities/digests/positions, leader change, real participant
   shutdown/reopen, COMMIT/ROLLBACK, duplicate delivery and opposite-decision
   refusal. Exactly-once effects and durable CDC obligations are inspected on
   the participant databases.
3. A new native L6 case reaches a real replicated PREPARED row before holding
   the coordinator's decision write. Legacy BEGIN, session-only PREPARE/COMMIT/
   ROLLBACK and QUERY cannot acquire its connection or settle its reservation.
   Session-only absence answers UNKNOWN. Legacy expiry, including beyond its
   hold interval and after a real replica restart, preserves the exact PREPARED
   row, generation and absence of effects. Only the subsequently recorded bound
   decision produces the one committed effect and operation outcome per replica.
4. The coordinator-reconstruction case replays a recorded COMMIT after the
   participant group changes leader, under the same transaction identity, with
   no additional effects on repeated recovery.

The family labels above refer to 6 storage + 5 A1-A5 + 1 L6 + 1 reconstruction
cases, not four additional tests. All 13 are also included in the wider set.

## Semantic negative with the final test bytes unchanged

Only the existing L6 outcome conversion is temporarily mutated: session-only
absence is incorrectly reported as NOT_COMMITTED instead of UNKNOWN. The final
six-case native TX1 file then has 5 pass / 1 assertion failure, at the new L6
assertion that absence is not a decided participant. The final native test hash
is unchanged between positive and negative arms. The production fence is
restored in finally and the original whole source tree is verified afterward.
This is a mutation proof of that specific fence, not proof that every invariant
has its own independent mutant.

## Wider results and non-waived failures

Nineteen files / 251 cases: 242 pass / 9 fail, with zero skipped, todo or cancelled
cases and every requested file engaged. The remaining failures are in unchanged
controllable-fixture sources:

| File | Passed / failed | Remaining interpretation |
| --- | --- | --- |
| partition-participant-transaction-apply.test.js | 25 / 2 | Command-owner forwarding and origin-only admission assumptions need current release-aware setup and retained refusal assertions. |
| partition-participant-transaction-staging.test.js | 16 / 4 | Self-check/origin setup, genuinely admitted opposite-direction legacy state, and nullable-outcome contamination prerequisites remain unresolved. |
| partition-legacy-session-statement-admission.test.js | 1 / 3 | Fresh legacy BEGIN is refused by the current fence, so statement/connection-contamination assertions cannot presume it was admitted. |

Do not classify every failure as harmless just because its file is unchanged.
Retain and diagnose it, then explicitly replace obsolete prerequisites with
stronger witnesses through the existing Quest. In particular, no private map
insertion, hand-assigned pause/origin or reopened legacy bypass may make these
fixtures green. Historical accepted work requires genuine historical admission.

All focused cases meet the operator's 10x elapsed tolerance. Hosted focused
maxima: storage 5660.463392 ms, native TX1 2601.62291 ms, coordinator reconstruction
2525.88629 ms. One already-failed wider legacy-session case takes 30285.932253 ms,
above its 20000 ms unit tolerance. It is retained as failed, not reclassified or
hidden as hardware variation. No protocol, caller, seed, election or retry budget
was changed.

Focused ESLint, impact registry (62 contracts / 33 coupled pairs), real operation
boundary, generated-shard checks and both changed-range whitespace checks pass.
The existing impact interactions now include the legacy execution/entry consumers
and native L6 witness; no new impact authority or registry was introduced.
Full guideline execution still stops at 311 above-baseline literal violations
with 1266 inherited matches. Later chained checks are not claimed green.
Earlier retained-patch formatting issues are not resolved by this new-delta pass.
Actions correctly remains red: focusedProofPassed=true, allRunGatesPassed=false,
independentApproval=false, mergeReady=false.

## Evidence ceiling and explicit legacy retirement

The SQLQueryEngine and coordinator code are real, but their persistence gateway
is one in-memory SQLite double using production schemas and mutation SQL. A new
engine reads those retained rows. The retained A5/restart labels describe held
engine continuations; no coordinator OS process is killed. This is not replicated
coordinator-system-table persistence or a production coordinator-store restart.
The participant shutdown/reopen is real and uses its independent database file.
CDC assertions cover durable obligations and replay stability, not downstream
CDC delivery. No full SQL/CDC seed startup, split/merge, physical host failure or
whole-release proof is inferred.

The new L6 witness proves post-cutover legacy/new separation, not migration of
previously admitted legacy work. The plan's retirement map explicitly retains
accepted/uncertain legacy execution, marker/outcome/CDC consumers, reconstruction,
old expiry timers, connection contamination and historical replay obligations
until they are genuinely settled. Then retire the complete old producer/consumer
interaction. Green coexistence is not the permanent architecture. No production
legacy path, accepted-clause seal or historical evidence was deleted or rewritten.

## Independent review and next gate

Review the exact delta from 64b85dec to the hosted candidate, the shared release
fixture, amended native/storage tests, plan and raw output. Cover admission-
gating, recovery-replay, concurrency-serialization, owner-interaction and harness
fidelity. Attack the canonical control identity, actual release commit and caller
budget, stopped-versus-live prefix checks, post-recovery application admission,
L6 coverage and mutation engagement, coordinator-double boundaries and whether
changed expected errors retain the underlying durable-failure assertions.

The current separate review resolved the snapshot receiver finding but identified
CREATE cleanup/physical-worker claim issue 4251078406; that remains OPEN with its
existing host-cleanup interaction. It was not repaired by this fixture work.
The known replica-handler failure is not in this 19-file selection and remains
open. Nine current TX1 fixture failures, real coordinator-store/M1 persistence,
historical admitted legacy obligations and their deletion map, all global static
gates and independent sealed acceptance remain before integrated startup/restart,
complete FreshMG replacements, seed-storage-loss and physical lab certification.
No directly launched subagent or approving Solver verdict is represented here.
