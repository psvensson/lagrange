# Verifier verdict: serving grant, receiver-local publication, RETIRED-before-CLOSED (stage 1)

Subject: `git diff 7696c3d8e 300c360ba` (37 paths, 8 new) in the verify worktree
`/mnt/data/peter/projects/.worktrees/verify-serving-publication-1`, detached at
`300c360baac383cf016be7929788a8cb47860336`. Independent adversarial verification under
verification protocol v2 (property first, owner-scoped proof, category-complete, mutation by
mechanism, evidence path per finding). Read in full (R18): CLAUDE.md, rules.md, router.md,
authority-and-recovery.md, CONTRACT-R2.md, HANDOFF-INTERFACES.md, the lab-acceptance record,
the design with Revisions 2 and 3, vets A, B and the re-vet, the seven sealed verification
templates plus the INDEX, test/guidelines INDEX/fixtures/harness, code-style.md, the
implementer's report, every diffed file in full, and the collaborators the diff reaches
(owner-key-reconcile-queue enqueue/claim/defer, reconcile-completion waiter merge, runtime
start/stop bound branches, inbound dispatch noHandler shape, replica-transport-handler
retirement, port allocator release, committed-command admission, writer-completion submit,
creation-intent LIVE_PHASES/continueIntent). Worktree state at hand-back:
`git status --short` = ` M test/shards/impact-graph-seal.json` only (the lead's expected
import-graph refresh), `git diff --quiet -- src/ test/ ':!test/shards/impact-graph-seal.json'
architecture/` exit 0. Nothing committed, staged, pushed, reset, stashed or run on a lab host.

## Verdict: APPROVE (no blocking finding; eight non-blocking findings and two design-text
## amendments for the lead, listed in one round below)

---

## Phase 0: the frozen claim

Design section 0 (original text), as amended by Revision 2 and Revision 3 (Revision 3 wins):

After a bound replica's genesis is observed, exactly one owner grants it the right to serve: the
metadata PUBLISHED compare-and-set on its exact admitted resource slot, copied durably into the
replica's own receiver-local record before any user read, write, timer, role or leader
publication is enabled. Retiring that replica closes new user admission synchronously, joins its
owned continuations, records the local RETIRED tombstone durably while the replica database is
still open, and only then acknowledges the metadata CLOSED compare-and-set; an unknown CLOSED
answer keeps the tombstone and the stop operation's custody. Orderly node shutdown never retires
a resource. A successor instance J cannot be granted while any resource of I is outstanding, and
the last CLOSED of I wakes J's continuation through the same wake surface that genesis
observation uses (in-process in this stage; cross-node delivery deferred, B-R6/7').

Revision 2 claims kept: D1' the keyed `OwnerKeyReconcileQueue` continuation owns genesis AND
publication (grant steps after OBSERVED, exact recheck after every await, shutdown join via
`awaitCurrentWorkIdle`, `publishReplica(serviceId, token)` public and token-validated,
`WASM_CREATION_GENESIS.PUBLISHED`); D2' identity = seven non-phase fields with `exactFields` +
canonical re-encode, open-time SERVING only when local PUBLISHED AND metadata PUBLISHED, one
tombstone function by connection or by path; D3' `serving = (OPEN|SERVING) && READY` for bound
and unbound, `publishesServicesRow` keeps bound role/leader publication disabled; D4' retirement
intent captured at the STOPPING fence, orderly stops never tombstone, RELEASING attempted,
tombstone before CLOSED, `RETIREMENT_BLOCKED_CLEANUP_REQUIRED`, CLOSE_UNRESOLVED keeps custody,
successor fence; D5' RELEASING written non-blocking; D6' typed enqueue-only wake with
`RECONCILE_REASON` members and `wake.outcome` in results; D7' PUBLISHED accepted only against the
re-resolved metadata authority, no endpoint/state/journal projection, creation row IN_PROGRESS.

Revision 3 claims kept: N1 retained witnesses superseded by appending with a citation, never by
a fixture seam withholding the grant; N2 process-local HELD->SERVING latch, wake predicate = this
run flipped AND no PROGRESS_RECONCILE waiter; N3 allowed-from table, CLOSED monotonic; N4
retirement keyed by the retained creation (digest match, by-path fall-through), never by
serviceId or `_prepared`; N5 unit witnesses set READY; N6 C1 fixture superseded with the
discriminator kept; N7 one typed `CREATION_GRANT_HELD` wake per held run, consumer owns the
re-drive; N8 BLOCKED decided on `replica.db?.open`; N9 PUBLISHED requires `started === true`,
binding/token equality and the re-resolved PUBLISHED phase; N10 total continuation; N11 P4
drives READ + ASYNC in the fence turn; N12 P12 non-vacuous; N14 vocabulary owners; N15 tombstone
on the open connection before the handles close (recorded supersession of CONTRACT-R2's order);
N16 no event binding when a replica opens SERVING.

Authoritative oracle: metadata slot phase through the owner's own CAS (`service_instances` row
read by a second connection), the local record phase (second SQLite connection on the replica
file), and the typed results (continuation run, START, retirement). Externally relevant outputs:
slot phase, local phase, whether `handleMessage`/`proposeEntry` admit user work, the typed
outcome each caller receives, the manager's creation row state (IN_PROGRESS), no endpoint /
services / ACTIVE / nested-journal row for bound replicas. Allowed nondeterminism: which founder
leads, loopback interleaving, publication order, and (F0) which sibling founders lose the shared
single-row grant CAS (STATE_CHANGED) and are re-driven. Excluded (brief): endpoint/services-row
projection and role/leader publication for bound replicas, COMPLETED-row re-entry, restart-scan
retirement custody, intact restart, tombstoned-path slot reuse, `reconstructTimers` idempotence,
null-port ACK, request Cells/OCI/catalog, production wiring into `RuntimeServiceHandler`,
physical multi-host metadata, process loss.

---

## Phase 2/8: coverage model (vet B's 45 cells + re-vet's uncovered list + Revision 3 cells)

Legend: file:P-n = `test/wasm-service/wasm-creation-publication.integration.test.js` case; LR =
`wasm-creation-local-record.test.js`; CAS = `test/control-plane/service-instance-creation-cas.test.js`;
GEN = genesis integration; REC = reconciliation integration; RET = retained-bootstrap
integration; C1 = bound-native. PARTIAL = the state is reached but the named output is not
asserted. UNCOVERED = no witness in the diff.

| # | Decision / event / relation | Coverage and the assertion |
|---|---|---|
| 1 | GRANT, second explicit START queued | GEN "concurrent genesis reentries join one native proposal" (request coalescing) + P1 (consumer's deferred re-entry, `host.result.status === PUBLISHED`, `reentries === 1`) |
| 2 | GRANT, wake-driven START mid-grant | P1 (`_deferInFlightItem` defers the waiter; result PUBLISHED, one wake) |
| 3-6 | GRANT, LEADER / FOLLOWER / LEADER_CHANGE / TERM_CHANGE mid-grant | P14 (`transferLeadership` twice across `holdNext`; `reconstructs === 1`, followers 0) |
| 7 | GRANT, APPLIED_PROGRESS mid-grant | P1 wake count (`A_SECOND_GENESIS_WAKE_FOR_ONE_REPLICA`) catches a duplicate; the deferred idempotent run itself is not individually asserted: PARTIAL |
| 8 | GRANT, user read/write while held | RET "held admission applies to direct read and write owners", P12 (`HELD_REFUSAL`, `observed === []`) |
| 9 | GRANT, orderly shutdown mid-grant | GEN "shutdown joins existing writer interest" + appended `SHUTDOWN_RETURNED_PUBLISHED` negative; RET :107 `notEqual PUBLISHED` |
| 10 | GRANT, retire mid-grant | P9 (`A_GRANT_LANDED_LOCALLY_AFTER_THE_STOP_FENCE`, `LEAKED_SAFETY_BROADCAST_INTERVAL`, slot CLOSED, run `GENESIS_HELD/WRITER_SHUTDOWN`) |
| 11 | GRANT, successor takes the entry | P10 (`A_SECOND_INSTANCE_OPENED_THE_RETIRING_FILE`) |
| 12 | GRANT, selection of J before | P3a (`STALE_GRANT_WROTE_LOCAL`) |
| 13 | GRANT, selection of J inside the CAS window | P3b (`holdNext('owner-a')`, `GRANT_CAS_NEVER_ATTEMPTED` guard) |
| 14 | GRANT, lost reply | P15 (`appliedLostReplies.length === 1`, three mutations, `A_LOST_GRANT_WAS_MUTATED_TWICE`) |
| 15 | GRANT, metadata unavailable | P13 (`UNAVAILABLE` held runs, one wake per held run, `THE_LIFECYCLE_RETRIED_A_HELD_GRANT_BY_ITSELF`) |
| 16 | GRANT, INIT not recorded | GEN "corrupt rejected INIT receipt", "recorded initialization does not replace a refused native membership read" |
| 17, 19 | ENABLE, follower at enable; L->F->L before enable | P14 |
| 18 | ENABLE, LEADER mid-enable | n/a (synchronous, argued in vet B 1) |
| 20 | ENABLE, shutdown just before | P9 (`_safetyBroadcastTimer === null`, `activeTimers.size === 0`) |
| 21 | ENABLE, KV timer fires after enable | UNCOVERED (no timer is created in P1-P18; only `reconstructs === 1` is asserted) |
| 22 | ENABLE, safety broadcast tick after enable | PARTIAL (P1/P14 assert the interval exists on the leader only; no tick is observed) |
| 23 | ENABLE, role flush retry | n/a by D3' (bound publication disabled); GEN/REC assert `pendingLeaderNodeUpdate === null` |
| 24 | ENABLE, reopen with local PUBLISHED | P6a (metadata PUBLISHED: SERVING, no metadata mutation, no bind) and P6b (metadata CLOSED: `RESOURCE_CLOSED`, next retire tombstones) |
| 25 | RETIRE-LOCAL, strong write after the fence | PARTIAL: P4 drives READ + ASYNC `proposeEntry` (N11); the strong write shares the `heldCreationRefusal()` gate at `_handleWrite` but is not driven; REC "shutdown aborts event-owned INIT" asserts `WRITER_SHUTDOWN` |
| 26 | RETIRE-LOCAL, read after the fence | P4 (`READ_ADMITTED_AFTER_THE_STOP_FENCE`) |
| 27 | RETIRE-LOCAL, ASYNC proposal after the fence | P4 (`ASYNC_PROPOSAL_ADMITTED_AFTER_THE_STOP_FENCE`) |
| 28 | RETIRE-LOCAL, role events mid-retire | REC "shutdown aborts event-owned INIT, joins the queue" |
| 29 | RETIRE-LOCAL, late apply between tombstone and port.close | UNCOVERED, recorded by the design (benign: apply never touches the local record) |
| 30 | RETIRE-LOCAL, in-flight publish | P9 |
| 31 | RETIRE-LOCAL, writer interest deadline | GEN "shutdown joins existing writer interest" |
| 32 | RETIRE-LOCAL, successor opens the same file | P10 |
| 33 | RETIRE-LOCAL, RETIRED write fails | P16 (`CLOSED_ATTEMPTED_WITHOUT_A_DURABLE_TOMBSTONE`, `cleanup-required`, `db.open === true`, re-entry blocked then succeeds) |
| 34 | CLOSE-CAS, lost reply | P5a |
| 35 | CLOSE-CAS, metadata unavailable | P5b (`loseReply` + `setGatewayReadFault` -> `close.outcome === UNKNOWN`, `CLOSE_UNRESOLVED`, no generic STOP row) |
| 36 | CLOSE-CAS, re-stop after CLOSE_UNRESOLVED | P5b (`RE_STOP_MUTATED_A_CLOSED_SLOT`), P5c (successor untouched) |
| 37 | late raft envelope to a retired address | P4/P7 under the fixture's `{acknowledged: true, noHandler: true}` wrapper (shape matches `message-router-inbound-dispatch.js:435-457`) |
| 38 | CLOSE-CAS, selection of J before | P2/P8, P5c |
| 39 | WAKE, OBSERVED from a waited START | P17 (`A_WAITED_START_ALSO_WOKE_ITS_OWNER`) |
| 40 | WAKE, OBSERVED from an event run | P1 (`PUBLICATION_DID_NOT_HAPPEN_INSIDE_AN_EVENT_RUN`, `NO_REPLICA_PUBLISHED_FROM_NATIVE_EVENTS`) |
| 41 | WAKE, repeated OBSERVED per APPLIED_PROGRESS after serving | P1 (`COMMITTED_USER_WRITE_RAN_THE_GENESIS_CONTINUATION`, `A_SERVING_REPLICA_ENQUEUED_NATIVE_WAKES`, `subscriptions.length === 0`) |
| 42 | WAKE, CLOSED per retired replica | P4 (one), P2/P8 (`LAST_CLOSED_DID_NOT_WAKE_THE_SUCCESSOR_OWNER`, autonomous J publication on the waking node), P5b (one total) |
| 43 | WAKE, consumer re-enters START while retire in flight | P10 |
| 44 | WAKE, consumer absent | P18 (`CONSUMER_ABSENT` on every decisive event run and on the retirement) |
| 45 | stale callback after retirement | P4 P7-section (`STALE_CALLBACK_ENQUEUED_AFTER_RETIREMENT`, `queue.stopped`) |
| N3 | RELEASING allowed-from; CLOSED monotonic; RELEASING outstanding for J; PUBLISHED rule order | CAS "resource phase table" (`RELEASING_REGRESSED_A_CLOSED_SLOT`, no SQL for a CLOSED slot, STALE_BINDING order) |
| N4 | re-stop of I after J holds the serviceId | P5c (`PREDECESSOR_RETIREMENT_TOUCHED_THE_SUCCESSOR`) |
| N8 | CLEANUP_REQUIRED re-entered shutdown | P16 |
| N9 | forged PUBLISHED / RUNNING claims | P11 (`FORGED_PUBLISHED_BECAME_RUNNING`, slot CLOSED), P11b (`A_RUNNING_CLAIM_WAS_ACCEPTED_AS_PUBLISHED`, `resolves === 0`) |
| N10 | continuation total | no direct witness; traced by reading (every grant step is caught and mapped); see UNCOVERED edges below |
| N16 | reopen SERVING binds no events | P6a (`A_REPLICA_OPENED_SERVING_BOUND_NATIVE_EVENTS`) |
| D2' | identity projection, RETIRED terminal, by-path tombstone, missing file, byte bound, `commitDurably` | LR (9 cases) |
| 3' row 2 | local PUBLISHED write throws after the CAS -> `LOCAL_GRANT_NOT_RECORDED`; re-entry retries the write | UNCOVERED (traced: `grantInstanceResource` on the PUBLISHED slot answers SAME -> PUBLISHED; `recordWasmCreationLocalPhase` ADMITTED->PUBLISHED RECORDED; `enableServing` flips; no new mechanism) |
| 3' row 3 | `enableServing` throws after local PUBLISHED -> `SERVING_ENABLE_FAILED`; re-entry replays effects once | UNCOVERED (traced: state stays HELD, `GRANT_HELD` wake fires, re-grant SAME, local ALREADY, `enableServing` replays) |
| D6' | held replica keeps its native subscriptions until local PUBLISHED | UNCOVERED by assertion (see mutation V1b) |

Assertion-weakening check (brief, F0). P1/P15/P18 assert "one owner wake per replica: OBSERVED
or a `GRANT_HELD` with `grant.outcome === STATE_CHANGED`", not "OBSERVED on every replica".
Judgment: a faithful consequence of the owner. All sibling slots live in one canonical
`service_instances` row; `commitState` is one conditional UPDATE with one authoritative reread
and no semantic CAS loop (`service-instance-metadata.js:45-72`, header comment "no semantic CAS
loop"); concurrent founder grants therefore lose with `STATE_CHANGED` (zero rows, reread shows the
sibling's state, `decide` would still APPLY so `resolve` returns null). The typed hold + re-drive
is itself witnessed: P1 requires `host.reentries === 1` and `servingState === SERVING`, slot
PUBLISHED and local PUBLISHED on EVERY host, and `NO_REPLICA_PUBLISHED_FROM_NATIVE_EVENTS` on at
least one; P18 (no consumer) shows the raced hosts stay typed-held with `grant.outcome ===
STATE_CHANGED` and `CONSUMER_ABSENT`. Not a silently tolerated defect. Production cost is one
desired-state reconcile (or the next native event: a held replica keeps its subscriptions, and
any later APPLIED_PROGRESS re-enters the run) per raced founder: latency, not correctness. Owner
decision on row granularity stands recorded (F0).

---

## Findings (category-complete; each NEW MECHANISM or NEW SHAPE, scenario -> wrong output,
## required change, evidence path). None blocking.

### Owner interaction / admission gating

F-A1 (NEW SHAPE, design-text tension, non-blocking). The in-path tombstone awaits the metadata
RELEASING attempt: `wasm-service-replica-lifecycle.js:239` `await retirement.metadataRelease`,
resolved by `wasm-creation-retirement.js:115-116` after `settleOwner(releaseInstanceResource)`.
Scenario: `retireReplica` on a live replica while the metadata gateway is slow -> the STOPPING
fence, admission close, activity stop and handler retirement happen at call (unchanged), but the
tombstone, `releaseWasmServiceReplicaConsensus` (port + db close) and the shutdown settlement wait
until the RELEASING attempt terminates (any answer, including UNAVAILABLE). Design D4' step 3
says RELEASING "never blocks the local stop"; the same design's P4 demands "RELEASING observed
on the slot before the tombstone", which is satisfiable only by waiting (implementer F3g). Wrong
output: none on the externally relevant surfaces (fail-closed, RETIRED before CLOSED preserved,
P4 asserts the designed order); the deviation is that handle release now depends on the metadata
attempt TERMINATING (bounded by the owner's own CDC routed-mutation budget, per the vets'
`cdc-constants.js` reading), which `authority-and-recovery.md` ("recovery must not depend on the
condition it restores") was invoked to forbid. Required change: the lead records a supersession
of the D4' "never blocks" wording (either "the RELEASING attempt is never a precondition of the
fence; the handle release waits for it to settle, bounded by the owner") or moves RELEASING
before `fenceTarget` without the tombstone waiting (then P4's `order[1].slot === 'RELEASING'`
must be relaxed). Evidence: `wasm-service-replica-lifecycle.js:234-249`,
`wasm-creation-retirement.js:109-126`, P4 :415-419, mutation V10 (below) shows the ordering is
witnessed.

F-A2 (NEW SHAPE, minor). `resolveGrant` (`wasm-creation-publication.js:32-40`) issues a second
authoritative read on UNKNOWN although `commitState` (`service-instance-metadata.js:62-71`)
already performed one; the design says "UNKNOWN -> one resolveInstanceResource". Two reads, no
second CAS; harmless. Required change: none (record), or drop the lifecycle-side resolve and
consume the owner's `{outcome: UNKNOWN, reason}` directly. Evidence: P13 passes with exactly one
`grantInstanceResource` call per held run (`THE_LIFECYCLE_RETRIED_A_HELD_GRANT_BY_ITSELF`).

F-A3 (recorded deviation F3a, acceptable with reason). A PUBLISHED target on a CLOSED/RELEASING
slot answers the sealed `RESOURCE_CLOSED` (after `STALE_BINDING` for a retiring instance), not
N3's literal "any target on a CLOSED slot answers CLOSED". N3 conflicts with the design's own
3' table rows; the grant consumers (`resolveWasmCreationAdmission`, `publishWasmCreation` HELD
reasons) rely on the sealed refusal vocabulary. The CAS table asserts both the RELEASING/CLOSED
monotonicity and the STALE_BINDING order. Evidence: `service-instance-state.js:262-281`, CAS
test :310-341; base diff shows the PUBLISHED rule order unchanged.

### Transport / delivery / wake

F-W1 (NEW SHAPE, non-blocking, R11 observability). Production wires no `creationWake`
(`grep creationWake src/` -> only `wasm-service-lifecycle.js:185-187` and the wake module). For an
event run (no waiter) the typed `wake.outcome: CONSUMER_ABSENT` sits in a run result that nothing
reads in production, and the only operator-visible trace is `logger.debug`
(`wasm-creation-wake.js:23`). The manager therefore never learns of an autonomous publication
until an explicit START re-entry (its `_replicaStateById` stays STARTING; the creation row stays
IN_PROGRESS by design). Required change: log `CONSUMER_ABSENT` on event runs at `warn` (or
record it in the queue's diagnostics), and keep the production consumer deferral in 7' as the
owner of the real fix. Evidence: `wasm-creation-wake.js:21-26`, P18 (typed in results),
`owner-key-reconcile-queue.js:530-550` (event-run results are only resolved to waiters).

F-W2 (harness, potential over-constraint; not a source defect). `assertOneOwnerWake` (P1 :191-198,
P15) and REC :203 (`reentries === 1`) require exactly one wake per host. A legal interleaving
exists: a native event enqueued during a `GRANT_HELD` run (the replica is still HELD, so
`admitsNativeWake` admits it) runs before the consumer's START re-entry reaches `enqueueAndWait`,
publishes without a waiter and fires the OBSERVED wake -> two wakes (`GRANT_HELD` +
`OBSERVED`), which N7 (once per held run) and D6' (once per flip) both permit. Observed: green on
lenovo-laptop (#126) and in the implementer's local runs, so the fixed delivery schedule did not
realise it; the risk is a flake, not a wrong output. Required change: relax to "at most one
OBSERVED; every wake is OBSERVED or GRANT_HELD(STATE_CHANGED); at least one", or drive the
re-entry synchronously inside the wake. Evidence: `owner-key-reconcile-queue.js:220-262`
(pending merge), `:489-500` (`_deferInFlightItem`), `wasm-creation-reconciliation.js:60-66`.

### Recovery / replay

F-R1 (NEW SHAPE, acceptable with reason; implementer F3f). The by-path tombstone identity carries
the five fields derivable from the retained creation (`wasm-creation-retirement.js:81-83`) and
omits `storage` (derivable through `dataDirectoryManager.getWasmServiceFileIdentity`, as the
live path does at `wasm-creation-opening.js:200`) and `opening` (the creation row's
`opening_json`, not carried by the handle). A copy of the SAME creation's file at the canonical
path would be tombstoned by path; that is the fail-closed direction and `identityMatches` still
refuses a different token/replica/node (LR `A_FOREIGN_TOKEN_RETIRED_THE_FILE`, partial-identity
case :247-250). Required change: none now; carry `storage` by path when the recovery stage
defines restart-scan retirement.

F-R2 (coverage note, resolved by mutation V9). I expected the in-path tombstone (N15) to be
redundant in-process with the by-path verification (`retireLocally` always runs `tombstoneByPath`
once the connection is closed, `wasm-creation-retirement.js:120-125`). Mutation V9 (in-path
tombstone disabled, by-path kept) engages: P16's injected fault lives on the replica's own
connection and never fires for a by-path connection, so the first retire answers `CLOSED` instead
of `RETIREMENT_BLOCKED_CLEANUP_REQUIRED`. N15's placement is therefore pinned by P16, and
RETIRED-before-CLOSED by P4 (`CLOSED_REQUESTED_BEFORE_LOCAL_RETIRED`) and P4's RELEASING-time
read (`TOMBSTONE_PRECEDED_RELEASING`). No change required.

### Concurrency / serialization

No defect. Verified by reading: two racing retires (second joins the STOPPING settlement at
`shutdownWasmServiceReplica:321-322`; its RELEASING is idempotent SAME or, after the first's
CLOSED, answers CLOSED without SQL by N3; both tombstone-by-path answer ALREADY; both CLOSE
idempotently; two wakes, F3d, idempotent); retire during the grant await (P9: the run's
post-grant recheck returns STOPPED, nothing local written, metadata PUBLISHED -> RELEASING ->
CLOSED); grant landing after the fence (P9 `record.grant === null`); waited START + native event
in one run (reasons union includes `PROGRESS_RECONCILE`, no wake; a START arriving while the key
is in flight is deferred into a NEW item with its own reasons, `_claimPendingItem:489-491`, never
merged into the in-flight run, so the waiter term is sound); latch exactly once (P1/P14
`reconstructs === 1`; `enableServing` leaves HELD if an effect throws). `stopOwnedReplica` sets
STOPPING synchronously: `replica.shutdown()` -> `shutdownWasmServiceReplica:331` assigns
STOPPING before the first await and `fenceTarget` is invoked synchronously inside `retireLocally`
before its first await, so "fence at call" holds (P4 `fenceProbe` issues the READ and the ASYNC
proposal in the turn after `shutdown()` returns).

### Harness fidelity

F-H1 (record). Substitutions and what they can hide: (i) `gateway.readAuthoritativeRows` and the
mutation engine are a single component SQLite (`service-instance-creation-sqlite-fixture.js:74-123`);
`affectedRows` comes straight from `better-sqlite3`, whereas production reads
`partitionResult.affectedRows` of a CDC routed mutation, so the STATE_CHANGED-vs-UNKNOWN
classification on a zero-row CAS is a component boundary (HANDOFF "not native metadata proof");
(ii) three "hosts" are one process sharing one owner object, so cross-node wake delivery and
metadata replication lag are not exercised (7'); (iii) the loopback transport with
`tolerateRetiredAddress` answers the production dispatcher shape for a retired address
(`{acknowledged: true, noHandler: true}`; `message-router-inbound-dispatch.js:436-457` sends ACK
then `SERVICE_RESPONSE {noHandler: true, error}`) instead of the shared loopback's throw, and no
production consensus path consumes that answer, so it cannot mask the defect class under test;
(iv) `VirtualTimeSource` supplies `at` for the grant/retirement details and `safetyIntervalMs: 0`
(implementer F6) gives a 1 ms safety interval on a serving leader (pre-existing fixture hazard,
out of scope); (v) P12's order witness reads the local record through a second connection inside
the intercepted `kvStore.get` (sound: WAL readers see committed frames; `commitDurably` has
returned before any user message is admitted).

F-H2 (record, sealed-acceptance). N1 supersessions are recorded in-file with the Revision 3
citation and the former expectation ("was BOOTSTRAPPED_HELD / GENESIS_OBSERVED"), including the
two retained-bootstrap lines N1 did not list (:60-69, :224-227) and the appended `notEqual
PUBLISHED` negatives; the C1 fixture records the measured frozen first failure (`createGroup:237`
at the base, earlier than the re-vet's :308) and the four supersessions, and
`wasm-creation-bound-native.test.js` is byte-unchanged with its discriminator (old INIT refused
`WRITER_INCARNATION_MISMATCH`, old ENROLL/WRITE refused, valid J path completes). The quest-log
`decision` entry naming the superseded lines is still owed by the lead (implementer F7).

### R06 / R07 / R11 / R23

No defect. Every new scalar/state lives in its owner module: `WASM_SERVICE_SERVING_STATE`,
`WASM_CREATION_LOCAL_PHASE/RECORD/RETIREMENT`, the four `WASM_SERVICE_LIFECYCLE_REFUSAL` codes,
`WASM_SERVICE_SHUTDOWN_INTENT`, `WASM_SERVICE_NO_FAILURE`, `CONSENSUS_BOOTSTRAP.PUBLISHED`,
`CREATION_WAKE_OUTCOME`, `RECONCILE_REASON.CREATION_*` (plus `CREATION_NATIVE_PROGRESS`, F3c, a
correct R06 fix the design under-specified), `WASM_CREATION_GENESIS.PUBLISHED`. File-local named
states (`WASM_CREATION_PUBLICATION`, `LOCAL_RETIREMENT`, `BOUND_START`, `AUTHORITY`,
`OPEN_SETTLEMENT`) are allowed by code-style. No new timer, poll, retry, flag, env check,
test-only production path or second publication path (role/leader publication stays behind
`publishesServicesRow`; `creationWake` is dependency injection named by D6'). No baseline,
threshold or timeout was raised (decision-boundaries baseline 806 unchanged; complexity 1755 and
duplication 697 unchanged and red at both base and snapshot). Nits: a stale
`publishReplica(S, I-token)` after J took the entry records a CONTENT_CONFLICT start diagnostic
on J's entry (`wasm-service-lifecycle.js:421-423`, `refuseStart` ownsEntry); `publishReplica` on a
never-started replica answers `STOPPED_DURING_START` (typed but misleading); the
`impact-contracts.json` diff re-serialised three unrelated `§` escapes to `§` (CL-040/041/042).

### Implementer deviations F3 (a)-(h), F1, F8, rename, opt-in, N5

(a) acceptable with reason (F-A3). (b) GRANT_HELD wake also suppressed on waited runs:
acceptable, the waited START collects `grant.outcome` in its HELD result (P2 :321-324, P3a/b,
P13 :747). (c) `CREATION_NATIVE_PROGRESS`: acceptable, owner module, R06. (d) every retire wakes
on CLOSED/already-CLOSED: acceptable, D4' step 6 governs over the 3' "one wake" row; idempotent
(P5b: zero then one). (e) by-path verification after a live retirement (ALREADY): acceptable,
fail-closed, see F-R2. (f) five-field by-path identity: acceptable, see F-R1. (g) tombstone waits
for the RELEASING attempt: acceptable with the design-text amendment F-A1. (h) retire-by-token
only on a definitive contradiction, UNKNOWN on an unreachable owner: correct (recovery-replay #5,
absence proves nothing); better than the design's wording. F1 confirmed: `openReplica` has no
await on the unbound path before `openReplicaResources` and `settleOpening`, so READY is set
synchronously inside `initialize()`; unbound behaviour changed only by the READY term of `serving`
(a stopping or not-yet-ready unbound replica now refuses reads/ASYNC proposals and skips
`onBecameLeader`'s effects, closing the pre-existing leaked-interval window). F8 confirmed (above).
`setGatewayReadFault`: P5b/P5c/P13 fault `gateway.readAuthoritativeRows` of `owner-a`; the
UNKNOWN close in P5b is only reachable that way (`readState` -> UNAVAILABLE -> `commitState`
fallback UNKNOWN), so the former collision with the journal reader is gone and the cases are
non-vacuous. `reenterOnWake` opt-in: `creationWake = null` default, historical files that do not
pass it run without a consumer as production does; P18 records `CONSUMER_ABSENT` typed on every
decisive run and on the retirement. N5: the unit helper sets READY, :694-702 asserts
`serving === false` and the exact `SERVICE_NOT_READY` shape after shutdown.

---

## Independent census (grep over `src/` at the snapshot) and diff against the implementer's

Seven former `consensusCreation` guards in `wasm-service-replica.js`: `heldCreationRefusal`
(consumed at `:369 handleMessage`, `:393 _handleRead`, `:433 _handleWrite`) -> `servingRefusal`;
`proposeEntry :474-478` -> `serving` for unbound, `boundProposalAdmission` for bound (reached by
`wasm-writer-completion.js:62`, `_handleWrite :447`, `timer-manager.js:87/107/168`, and
`administerWriter` -> `writerCompletion.submit`); `queueRoleUpdate :504`,
`queueLeaderNodeUpdate :526`, `flushRoleUpdate :606`, `flushLeaderNodeUpdate :616` ->
`publishesServicesRow` (callers `replica-leadership-state.js:70-78, 99-100`); `onBecameLeader :559`
-> `serving` (caller `wasm-service-replica-lifecycle.js:124`). Remaining `consensusCreation`
branches (`wasm-service-consensus-port.js:121,150`) choose identity, not serving: correct.
Shutdown callers: `replica.shutdown` only from `stopOwnedReplica :586`; `stopReplica` from
`wasm-component-driver.js:549` (unbound) and `shutdownAll :693`; `shutdownAll` from
`wasm-component-driver-shutdown-methods.js:35` (node teardown, ORDERLY_STOP by default);
`driver.stop` from runtime ops `:427` (unbound start catch) and `:519` (unbound stop flow); bound
stop `:486 retireConsensusBootstrap -> driver.stop -> retireBoundReplica -> lifecycle.retireReplica`;
manager-level `stopReplica` callers `runtime-service-handler.js:655` (generic handle),
`service-reconciler.js:583`, `service-lifecycle-recovery.js:208/227` (restart scan, generic rows;
recovery stage). `startupFailure`/`activityFailure` readers: only `wasm-service-replica-lifecycle.js`
and the replica constructor; the four D8 sites are the NO_FAILURE-aware `:207-208`, `:270`,
`:292-297`. `changeResourceState` callers: `transitionInstanceResource` only; owner methods
called from publication (grant, resolve), retirement (release, close), opening (resolve),
`service-consensus-bootstrap.js:111` (re-resolve), `service-consensus-creation-intent.js:151`.
`creationWake` readers: lifecycle getter and the wake module only. Diff against the implementer's
census: identical sets; no reader or caller missed on either side.

---

## Mutations

Implementer's M1-M11 logs (`scratchpad/mutations/`) were read: all eleven engage with the
reported first assertions. My re-runs and additions below were each applied once in the verify
worktree, run through `npm run test:file -- <one file>` after `wait-for-thermal-headroom.js`,
restored with `git restore --worktree` and proven byte-identical with `git diff --quiet`
(runner `scratchpad/verify/mutate.mjs`, plan `plan.json`, logs `scratchpad/verify/mutations/`).

Clean baseline (M0, no edit): publication file green locally, 1/1 files, 4.1 s.

| Id | Mutation (mechanism) | File | Engaged | First failing assertion |
|---|---|---|---|---|
| M1 re-run | skip the local PUBLISHED write before `enableServing` | publication | yes | P1 `LOCAL_GRANT_NOT_DURABLE`; then P4 (`token` of null), P6a `ORDERLY_STOP_TOMBSTONED_THE_RESOURCE`, P6b, P12 `USER_WORK_ADMITTED_BEFORE_THE_LOCAL_GRANT` (matches implementer) |
| M3 re-run | CLOSED requested without a tombstone (in-path skipped, by-path forged RETIRED) | publication | yes | P4 `CLOSED_REQUESTED_BEFORE_LOCAL_RETIRED`; P2/P5b/P6b/P9 (matches) |
| M4 re-run | remove the READY term from `isServing` | publication | yes | P4 `READ_ADMITTED_AFTER_THE_STOP_FENCE` (matches) |
| M7 re-run | drop the waiter term (`waited = false`) | publication | yes | P1 (two wakes), P2 (`2 !== 1`), P15, P17 `A_WAITED_START_ALSO_WOKE_ITS_OWNER` (matches) |
| M8 re-run | remove the post-grant recheck | publication | yes | P9 `A_GRANT_LANDED_LOCALLY_AFTER_THE_STOP_FENCE` (matches) |
| M10 re-run | remove the CLOSED-monotonic and allowed-from rows | CAS | yes | `RELEASING_REGRESSED_A_CLOSED_SLOT` (matches) |
| M11 re-run | match the retire target by serviceId | publication | yes | P2 (successor stopped: `UNKNOWN/CONSENSUS_SERVING_NOT_IMPLEMENTED`), P5c `PREDECESSOR_RETIREMENT_TOUCHED_THE_SUCCESSOR` (matches) |
| V1 | pending event not processed: `admitsNativeWake` always false | publication | yes | P1 `host-1 did not publish`; P2 (no GRANT_HELD wakes, `'[]'`); every `publishedGroup` case |
| V1b | subscriptions retired at the start of `publish()` (before the grant) | publication | NO | green (see finding F-M1 below) |
| V2 | open-time SERVING from the local record alone (metadata phase ignored) | publication | NO | green: unreachable by construction, `resolveWasmCreationAdmission` refuses every non-ADMITTED/PUBLISHED metadata phase before the open (P6b `RESOURCE_CLOSED`), and metadata cannot be ADMITTED while local is PUBLISHED; the term is defence in depth, not the enforcing gate |
| V3 | membership coverage ignored (APPLICATION_NOT_COVERED check removed) | publication | yes | P3a/P3b/P9/P14/P17: first START answers PUBLISHED instead of `GENESIS_APPLICATION_NOT_COVERED` (also GEN "genesis requires the applied native participation gate") |
| V4 | local phase CAS answers RECORDED without the UPDATE | publication | yes | P1 `LOCAL_GRANT_NOT_DURABLE`, P4 `CLOSED_REQUESTED_BEFORE_LOCAL_RETIRED`, P6a, P6b, P9, P5b |
| V4b | local phase CAS commits in a plain transaction (no `commitDurably`) | local-record | yes | `DURABLE_COMMIT_DID_NOT_RAISE_SYNCHRONOUS` |
| V5 | recheck after the genesis await removed (post-grant recheck kept) | publication | NO | green: the only consequence is one grant CAS issued for a stopping replica, whose landed PUBLISHED "stays counted" and is then RELEASING/CLOSED by the retire; the design permits that output, so no witness can distinguish it. The recheck is present in the source (`wasm-creation-reconciliation.js:80`) |
| V6 | tombstone identity check dropped | local-record | yes | `IDENTITY_FIELD_CHANGE_REOPENED` (reopen) and `A_FOREIGN_TOKEN_RETIRED_THE_FILE` (by path) |
| V7 | successor fence removed (`creation !== null ||`) | publication | yes | P10 (successor PUBLISHED on the retiring file); later cases hang on the orphaned instance (first failure preserved) |
| V8 | latch replays twice (`enableServing` applies effects on every call) | publication | yes | P1 `LEADER_EFFECTS_NOT_REPLAYED_ONCE` |
| V9 | ONLY the in-path tombstone disabled (by-path verification kept) | publication | yes | P16 `first.closed === false` (result `{outcome: CLOSED, retired: true, closed: true}`): the connection-level fault fires only for the in-path write, so N15's placement is pinned |
| V10 | RELEASING attempted only after the local stop settled | publication | yes | P4 `TOMBSTONE_PRECEDED_RELEASING`; P9 then hangs on `RELEASING_NEVER_ATTEMPTED` (first failure preserved) |
| V11 | stopping bound replica refuses `WRITER_NOT_READY` instead of `WRITER_SHUTDOWN` | publication | yes | P4 `READ_ADMITTED_AFTER_THE_STOP_FENCE` (reason-shape deepEqual) |

Every touched file restored byte-identical (`git diff --quiet` per file after each mutation;
`git status --short` = the seal only after each). Logs: `scratchpad/verify/mutations/<id>.log`,
`mutations2/V9-in-path-tombstone-disabled.log`, summaries `summary.json`.

F-M1 (coverage gap, non-blocking; from V1b). The design's D6' statement "after local PUBLISHED
the adapter retires its native event subscriptions" has only its second half witnessed (P1
`subscriptions.length === 0` after publication). That a HELD replica KEEPS its subscriptions
(native events remain a re-drive of a held grant until the local grant lands) is not asserted
anywhere; retiring them before the grant stays green because the fixture consumer and explicit
STARTs re-drive every held case. The source is correct (`retireNativeWakes()` runs only on the
GRANTED branch, `wasm-creation-reconciliation.js:96`). Required change: one assertion in P13
(after the held runs, `host.replica.creationReconciliation.subscriptions.length > 0` on every
host) or in P2 (held successors keep their subscriptions). Classification: missing witness of a
designed property (NEW SHAPE in the proof, not in the source).

---

## Static (verbatim summaries, verify worktree)

- `node scripts/check-fast-static.js --base 7696c3d8e`: `fast-static: ok in 12381ms`, EXIT 0.
- `check-guideline-decision-boundaries.js --json <22 touched src files>`: `scannedFileCount 22,
  totalViolationCount 0, rawViolationCount 5, inheritedViolationCount 5, baselineViolationCount
  806`; `wasm-service-replica-lifecycle.js` and every new module 0; no baseline change in the diff.
- `npx eslint <all 36 touched .js files>`: EXIT 0, no output.
- `check-complexity.js --scoped <22 src>`: `3 violation(s) in 22 target(s)`: runtime ops
  `prepare` 16, `start` 26, `stop` 14 (inherited; the diff changes two lines in that file). Whole
  tree at the snapshot: `Complexity ratchet FAILED: 1793 violations exceeds baseline of 1755`.
  VERIFIED AT THE BASE: with only the diffed paths restored to 7696c3d8e (worktree-only
  `git restore --source`, added files removed, then restored from the index and proven
  byte-identical) the whole tree reports the identical `1793 violations exceeds baseline of
  1755`. Inherited, unchanged by this stage (implementer F4 confirmed).
- `check-cognitive-complexity.js --scoped <22 src>`: `0 violation(s) in 22 target(s)`; whole
  tree `152/152 OK`.
- `check-guideline-literals.js`: `Matched 1264 inherited literal-guideline baseline violations`,
  0 new. `check-guideline-silent-catch.js`: `Matched 90 inherited`, 0 new.
  `check-runtime-grammar-contracts.js`: `0 violations`.
- `npm run audit:shards`: `curated test shards: current`; primary 2405 (unit 2090, integration
  103, bootstrap 205, probe 3, packaging 4) OK; resource OK `fnv1a32-cde2f51e`; subsystem OK
  `fnv1a32-a8783cea`; the two new files are classified (unit / integration, ordinary, wasm-toolchain).
- `npm run audit:file-size`: EXIT 0 (oversized list unchanged; the driver is 734 lines).
- `npm run -s test:duplication`: `[src+scripts] OK 47/47 groups, 1462/1462 lines`; `[test]
  FAILED: 698 clone group(s) and 26458 duplicated line(s) exceed the current baseline of 697 /
  26369`; the five named files are all `test/distributed/harness/__tests__/postgres-baseline-*`.
  VERIFIED AT THE BASE by the same restore: identical `698 / 26458`. Inherited (F5 confirmed).
- Expected worktree modification: `test/shards/impact-graph-seal.json` digests only
  (`sourceDigest 9fd0f79b.. -> 0d97cb46..`, `producerInputDigest`, `resolverStateDigest`,
  `snapshotDigest`); the seal lists digests, not modules. The modules that entered the graph are
  the six new src files (`wasm-component-driver-consensus.js`, `wasm-component-driver-vocabulary.js`,
  `wasm-creation-publication.js`, `wasm-creation-retirement.js`, `wasm-creation-wake.js`,
  `wasm-service-serving-state.js`), as the subsystem-classes observation diff shows for the two
  new test files. `solve land` refreshes it.

---

## Lab evidence (raw records read; nothing re-run)

Placement heads: `~/.local/state/lagrange-lab/runs/14074bde25014e829313b4071634acb0/executor.log`
(lenovo-laptop, #126), `4cece57dc6f543318247965f648b4c56` (adam-laptop, #127),
`2f4a688838f14221aff69dc5a503ba09` (tv-dator, #128) each carry exactly one
`placement-head=300c360baac383cf016be7929788a8cb47860336`; the base control
`31c3b5355c2e448b9727028204f24794` (#130, tv-dator) carries
`placement-head=7696c3d8e9fa5b978bd9a2adac0d157c7693cad6`. `sha256sum executor.log` matches
`result.json.log_sha256` for all four (6607a78d.., 39428125.., 63d218a7.., d57eda7d..).

Snapshot results (30 files, 890 reported assertions): lenovo 10/10 PASS, 245 assertions
(publication 23 = 2 describes + 21 cases, local-record 9, CAS 10, selection-admission 23,
retained-bootstrap 16, writer-state 11, reconciliation unit 8, teardown 23, timer-manager 27,
meta-table-schemas 95); adam 9/10, 345 assertions (C1 3, genesis 14, reconciliation-integration
4, recovery 2, runtime-opening-refusal 27, creation-intent 24, writer-completion 7, queue 179 +
current-work 32; red: `wasm-service-replica.test.js` 53 assertions, 5 failing subtests);
tv-dator 8/10, 300 assertions (strong-write 2, idempotency 33, driver 61, runtime-lifecycle 82,
journal 34, wasm-service-lifecycle 60, failure-atomicity 11, retry-wait-bound 10; red:
`durable-commit-replica-kinds` 0/3, `wasm-service-group-on-raft-rs` 2/4).

Classification of the three reds, judged independently: (1) `wasm-service-replica.test.js`: the
failing-subtest set is byte-for-byte the same eight `not ok` lines on the snapshot (adam) and the
base control (tv-dator): `applyCommittedEntry` 1/2/3/5 (TypeError reading 'push': the cases pass
no `effects`) and "lifecycle interleavings / every interleaving of up to three calls" with the
same 112-deviation model list (224 "registered handler is not the model's" lines in both logs);
the new :694 assertion and the N5 READY helper are among the 35 passing. Pre-existing, identical,
not larger. (2) `durable-commit-replica-kinds.test.js` and (3) `wasm-service-group-on-raft-rs.test.js`
are untouched by the diff (`git diff --stat 7696c3d8e 300c360ba -- test/raft/raft-rs-backend/`
empty) and fail at the base control with the same subtests and the same messages. Could the
serving fence (now applied to unbound replicas) change them? No: both open their unbound replicas
through `replica.initialize()` (durable-commit :242, wasm-service-group :131) so they are READY
when `handleMessage` runs, and the observed refusals are the writer codec's
(`{status: REFUSED, reason: INVALID_WRITER_COMMAND}` at durable-commit :247; `written.accepted
undefined` at wasm-service-group :238, with the preceding follower-forward assertion at :231
passing, which requires the fence to have admitted the message), not the fence's
`{error: SERVICE_NOT_READY}` shape. The partition and message-group subtests of durable-commit
(`partition_write_cutover_paused`; application transactions `[1,2]`) do not touch WASM code at
all. "Pre-existing at base" is the right classification for all three; they are lane/main debt
for their owners (R17), not this stage's.

First failures preserved: the executor logs keep the full TAP failure detail for each red
subtest; no retry was attempted (`retry:0` in placement-env).

---

## What I did not read or run (bounded, counted)

Not read in full: `src/workflow/owner-key-reconcile-queue.js` beyond lines 200-340 and 480-640
(enqueue/merge/claim/defer/run), `owner-key-reconcile-completion.js` beyond :58-85,
`service-runtime-lifecycle-operation-methods.js` beyond :290-330 and :440-540,
`message-router-inbound-dispatch.js` beyond :430-460, `replica-transport-handler-identity.js`
beyond :25-130, `timer-manager.js`, `wasm-writer-completion.js` beyond :20-40,
`service-consensus-creation-intent.js` (grep only), `test/wasm-service/wasm-creation-reconciliation.test.js`
(unit; green on lenovo, 8 assertions), the three generated `test/shards/*-classes.json` beyond
their diffs, and the 44-line `authorization/execution/placement.json` lab side files. Not run:
the multi-file selection (lab's; read), `npm run audit:impact-contracts`, whole-repo gates, the
corpus, the seal refresh (`solve land`), and no run on any lab host. Mutations the plan omits:
a mutation disabling ONLY the in-path tombstone (predicted non-engaging per F-R2) and one
removing the `storage` identity term (the live path is covered by LR `FILE_IDENTITY_CHANGE_REOPENED`).
