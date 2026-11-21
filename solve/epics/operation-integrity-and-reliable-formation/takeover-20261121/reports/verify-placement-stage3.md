# Verification: placement stage 3a, corrective round 2 (items 1-2), stage 3b

Verifier: independent subagent, 2026-11-21/22, read-only. Subject `work/placement-owner-repair-20261121`,
`8e84e2801..376592b8b` (`500a98513`, `a5aacf97e`, `3b182f42f`, `5a1f66105`, `c9ff75c7f`, `536d024ac`, `376592b8b`).
Nothing was executed here; executed evidence is the retained lab output (tv-dator, sha-bound by `selection.json`).
VERIFIED = read at the path and line named (file at `376592b8b` unless a sha is given) or seen in a retained
result file. INFERRED = reasoned from what was read, not executed.

## Verdicts (merge into the integration candidate)

| Part | Verdict |
|---|---|
| (i) Stage 3a, construction invariant (`5a1f66105`) | APPROVE-WITH-CONDITIONS |
| (ii) Corrective items 1-2 (`3b182f42f`, `536d024ac`) | APPROVE-WITH-CONDITIONS (minor) |
| (iii) Stage 3b, source deletion (`376592b8b`) | APPROVE-WITH-CONDITIONS |

No finding is a production regression introduced by these commits. The formation question has a clear answer:
3b changes nothing on a production node (section 4). The conditions are: one re-entrancy hazard that 3a turned
from a silent no-op into a throw (F1), unrecorded supersessions of sealed results whose witnesses 3b turns red
(F5), a rebalancer read that is not dead (F6), and evidence that is narrower than the record says (F7, F8).

Conditions:
1. (3a) F1: a witness for an event that re-enters the attach while the factory call is still on the stack, or a
   guard set before the coordinator is called. Until then "no order attaches twice" holds only after the factory
   has returned.
2. (3a) F2: name who handles the typed refusal. Today nobody does; it surfaces in `initialize`, the binder
   sweep, a leadership edge, the readiness fan-out or `ControlPlaneSetup.create`.
3. (3b) F5: before the test migration rewrites or deletes any of the 42 (in fact 49) files, append the
   supersession records the open quest `replica-placement-admission-owner` itself requires
   (`supersessions-recorded-first`), with a superseded or retained verdict per sealed quest. None exists at head.
4. (3b) F6: `partition-service-leader-activation-methods.js:39-46` must not be removed as a dead read without a
   ruling: it is the retention state the two remaining non-ledger sinks inherit.
5. (3b) F7: run and list the files outside the 144-file selection that depend on the partition-side
   construction (at least `test/partition/partition-rebalancer-leadership-readiness-hysteresis.test.js`).
6. (3b) Merging the source deletion before the migration puts 49 files red on the candidate (F8). That is the
   lead's ruling; it should be stated on the candidate, not discovered there.
7. (ii) F9, F10: record the two accounting gaps; no source change required for the merge.

## 1. Seal check (attack 1)

| Deleted | Introduced by | Sealed record found | Result |
|---|---|---|---|
| `initializeRebalancer`, partition-side `new UnifiedRebalancer`, `applyRebalancerDependencies` | `04e765a51` (2026-05-24, "Refactor sixth oversized sprint batch": a move into this file) | none naming them in `solve/quests`, `architecture/contracts/invariants.json`, `docs/specs/decision-tables` | not sealed as such |
| existing-rebalancer branch with the `readinessTransitionOnly` edge gate | `1a9da79b4` (2026-06-27, leadership-flap freeze fix) | `solve/quests/rolling-restart-core-stability/log.ndjson:1150` (an attempt entry, "NOT yet gate-validated for efficacy"); witness `test/partition/partition-rebalancer-readiness-edge-gate.test.js` | property kept trivially: `maybeInitializeRebalancer` (`partition-service-rebalancer-methods.js:69-72`) now does no dependency re-wiring at all. Its witness is red since 3a (author's category D). Not a sealed terminal. |
| R1 guard, `bindReplicaPlacementOwnerFactory` optional call, fallback constructor in `attachLedgerReplicaPlacementOwner` | `ab901b40f` (2026-11-19) | none | not sealed |
| R2 (`rebalance-coordinator-operation-creation.js:495` at `8e84e2801`) | `58e420741` (2026-11-19, WP-F) | the flag appears in no quest, invariant or decision table | the flag is not sealed; what its false arm REACHED is (below) |

`invariants.json` and the decision tables: no hit for any deleted symbol, the flag, or any newly red file name
(VERIFIED by grep, empty result).

What the owner's decision of 2026-11-21 covers (`lead-rulings.md:204-209`, brief stage 3): the placement owner
as end state, never reactivating the per-partition scheduler, removal of its construction path, the
optional-factory branch, the existing-rebalancer branch and "the 13 flag read sites". R2 is one of those sites,
so its deletion is inside the decision's letter.

What goes beyond the scheduler itself: R2's false arm was the last source path on which a coordinator created
PARTITION and RUNTIME_SERVICE operations through the record path (`createOperationRecordInternal`, the
concurrent-create budget turn, creation-time dedupe and reservation insert). Sealed quests proved their results
on that path: `priority-recovery-add-dispatch-cadence` names
`test/convergence/dt6-priority-recovery-add-dispatch-cadence.test.js` as its cure proof (quest.json, constraint
text) and binds the budget turn's release after claim; that file is newly red at 3b. The same holds for
`formation-ledger-quorum-spread-first`, `movielens-operation-ledger-terminal-hold`,
`rebalancer-own-create-memory-duplicate-replace` and the others in section 7's list (file names match quest
ids; only the first was read in full).

The open quest `replica-placement-admission-owner` anticipates exactly this removal ("the per-entity placement
scheduler, planning gates, wakes, budget gates and ledger interlock are removed ... not disabled"; "no old
placement path behind a flag") and demands, in `supersessions-recorded-first`, an R09 supersession record per
contradicted sealed claim BEFORE any source change, listing `priority-recovery-add-dispatch-cadence`,
`formation-ledger-quorum-spread-first` and fourteen more. Its log at head has two entries (a verification of
2026-11-19, a finding of 2026-11-20), neither a supersession; the word "supersed" occurs 0 times in the logs of
`priority-recovery-add-dispatch-cadence`, `formation-ledger-quorum-spread-first` and
`rebalancer-own-create-memory-duplicate-replace` (VERIFIED). The receipt file still says
`"status": "seal-measurement"` with seven receipts unmeasured.

Answer: no sealed PRODUCTION behaviour is removed by 3b (production left the record path for managed types on
2026-11-19, section 4). The supersession of the sealed results that lived on that path is unrecorded, and the
author's record (31.1) contains a caller-grep necessity proof but no seal check. That debt dates from the
cutover; 3b is where it falls due, because the sealed witnesses turn red and are about to be migrated (F5).

## 2. Stage 3a: construction orders traced at head (attack 2)

Attach: `ensureReplicaPlacementOwnerAttached` (`partition-service-rebalancer-methods.js:50-63`), preconditions
ledger id, not shut down, no attachment, `raft`, cache, coordinator; coordinator side
`attachLedgerReplicaPlacementOwner` (`rebalance-coordinator-operation-creation-support.js:634-641`): register,
then null while the factory is unbound, else the factory.

| Order | Per-partition scheduler built | Owner count | How (VERIFIED unless marked) |
|---|---|---|---|
| Seed bootstrap | never: `new UnifiedRebalancer` in src is message group (`message-group-service-rebalancer-runtime-methods.js:81`) and runtime service (`runtime-service-rebalancer-setup.js:124`) only | 1 | coordinator bound inside `create` (`control-plane-setup.js:356` to `:418`, no await between); handed by the sweep (`startup-runtime-surface-owner.js:46`) to an opened, usually leading ledger |
| Joining node | never | 1 once a ledger replica is open, else 0 | same sweep (`node-joining-publication-activation.js:479`) |
| Ledger replica hosted later | never | 1 | constructed with coordinator and cache (`bootstrap-service-replica-registration-methods.js:157-165`); `initialize` retries after the port opens (`partition-service-raft-init-base.js:305`, `:438`, no return between) |
| `raft` becomes available after all four events | never | 1 | only `initialize` sets `raft` (`:305` is the single writer in `src/partition`); its own call at `:438` follows. Covered. |
| Ledger restart | never | 0 then 1 | shutdown: `isShutdown` (`partition-service-lifecycle-methods.js:174`), tenure ended, quiesce detaches and unregisters (`:213`, `:92-101`); the new instance attaches its own owner |
| Leadership lost and regained | never | 1, the same | the sink is driven on every edge (`partition-service-leader-activation-methods.js:72-78`); the attachment field blocks a second attach |
| Factory bound late | never | 1 | the binding attaches every registered ledger (`...-creation-support.js:613-615`) |
| Second `create` with the existing coordinator | never | 1, the first | the new factory is bound, the loop is a no-op for an attached ledger; readiness and accounting services are reused from the coordinator (`control-plane-setup.js:299-314`), so the owner's collaborators stay current |
| Cache set late | never | 1 | `setSystemTableCache` (`partition-service-split-accessor-base.js:673-678`). No witness; code only. |
| Coordinator replaced by a different one | never | 1, built from the PREVIOUS coordinator | `rebindCoordinator` (`:736-764`) keeps the attachment; the ledger stays registered on the old coordinator and is never registered on the new one. `ownsRebalanceCoordinator` is never true in src; no production composition found in which a partition outlives its coordinator without a quiesce (INFERRED; join cleanup not traced to the end). No witness. Behaviour unchanged by 3a. |
| Teardown | never | 0 | `quiesceRebalancing` is synchronous up to `this.rebalanceCoordinator = null` (`:135`) because `ownsRebalanceCoordinator` is false everywhere in src; leadership edges, readiness fan-out and the cache setter then attach nothing |

Missed attach: none found. Each precondition has one writer and that writer's event re-runs the attach.

Occupied sink: the other two sink users bind `service_definitions-p1` (`runtime-service-rebalancer-setup.js:487-511`)
and `service_installations-p1` (`service-installation-reconciler-setup.js:43-71`), never the ledger (VERIFIED).

### F1. Re-entry during the attach now throws (3a; INFERRED, not executed)
- `this.replicaPlacementOwnerAttachment` is assigned only when the factory returns
  (`partition-service-rebalancer-methods.js:61-62`). Inside the factory the owner is put on the sink
  (`replica-placement-owner.js:781`), which on a leading ledger runs, synchronously, `setLeader(true)`,
  `beginCustody`, `notify`, the drain and the first pass up to its first await, including the barrier's status
  read (`replica-placement-owner-tenure.js:59`), a read the owner's own comment says "may run a consensus turn
  and notify" (`replica-placement-owner.js:296-299`).
- Schedule: seed order, ledger leading when the sweep hands it the coordinator; inside that status read the
  port delivers a role event to the partition; `updateRebalancerLeadership`
  (`partition-service-leader-activation-methods.js:80-84`) calls `maybeInitializeRebalancer`; the attachment
  field is still unset, so the coordinator's factory runs again, constructs a second owner object and refuses
  typed because the sink is occupied (`replica-placement-owner.js:777-780`). The throw lands in the role-event
  listener (or in the first pass's catch).
- Before 3a the same re-entry returned silently on the `rebalancerLeadershipSink` guard that 3a removed.
- Not verified: whether a `read-status` turn dispatches role events to the partition's listener
  (`raft-rs-operation-port.js:456`; the dispatcher was not read). Two owners on one sink are excluded in every
  case; the second owner object is inert (its constructor only validates and sets fields).

### F2. The typed refusal has no handler
A factory refusal propagates through `maybeInitializeRebalancer` into whichever event ran it: `initialize`
(`:438`, the replica fails to open), the binder sweep (aborts mid-loop, leaving later partitions without the
coordinator), a leadership edge, the readiness emitter, or `bindReplicaPlacementOwnerFactory` inside `create`.
The ledger is already registered when the factory throws (`...-creation-support.js:638-640`), and every later
event retries and throws again. Loud, which is the intent; unowned, which is not stated.

### F3. The "required timer pair" check cannot fail in production
`createReplicaPlacementOwnerFactory` passes two arrow functions (`control-plane-setup.js:647-648`), so
`requireResyncTimerCollaborators` always passes; a time source without `setInterval` would fail untyped at the
first custody. Production's time source has it (`src/time/time-source.js:52`). The check has weight only for
direct callers of the static (tests).

### F4. Teardown: one path not excluded by the witness
The only event that can re-attach after a quiesce is the binder sweep, which has no shutting-down check
(`startup-runtime-surface-owner.js:12-51`) and runs right after `await ControlPlaneSetup.create` at both call
sites. Whether `settleInfrastructureAcquisitions` (`seed-cleanup-handler.js:522`) settles an initialization in
flight was not traced. The witness exercises a leadership edge and the readiness fan-out only. INFERRED.

## 3. The required factory (attack 3)
`new RebalanceCoordinator` in src: `control-plane-setup.js:356` only. Coordinators reach the runtime only from
`create` (`bootstrap-service-control-plane-runtime-methods.js:161`, `node-joining-publication-activation.js:462`;
every other writer assigns null). No simulator, tool or second entrypoint under `src` builds one. The workflow
owner exists from the coordinator's constructor (`rebalance-coordinator-lifecycle.js:379`), so the factory never
hands a null one. VERIFIED.

## 4. Stage 3b in production: formation is not affected (attack 4)
- The flag is written false once, in the constructor (`rebalance-coordinator-lifecycle.js:340`), and true in the
  binding and the ledger registration; nothing resets it. `create` binds in the same synchronous run that
  constructs. So on every production coordinator the flag has been true at every `createOperation` since
  `ab901b40f`/`58e420741` (2026-11-19): R2's false arm never ran on a node. VERIFIED.
- Production callers of `createOperation`: the provisioning owner
  (`sql-query-engine-provisioning-admission-methods.js:498`) and `UnifiedRebalancer`
  (`unified-rebalancer-move-execution.js:312`, message groups and runtime services). Nothing else.
- First operations on a fresh seed: the seed's partitions are created by the bootstrap phases, not as
  operations; the first replica operations are the placement owner's own admissions on the ledger leader
  (`requestPlacementAdmission`, `replica-placement-owner.js:107`), which never pass through `createOperation`.
  A coordinator-created partition operation before the ledger leads or before formation is committed gets a
  typed answer ("ledger leader unreachable", "Placement waits for committed formation",
  `...-creation-support.js:245`) exactly as before 3b.
- Spot check of five newly red files: `replace-owner-recovery-equivalence` and `coordinator-dedup-gap` use
  `createTestCoordinator`; `readiness-snapshot-persistence` uses `new RebalanceCoordinator` (`:406`, `:778`) and
  fails at `...-creation-support.js:245` through `createOperationInternal:497` (stack in the lab log,
  line 10926 on); `reservation-fail-closed-dispatch-gate` and `dt6-voter-surplus-promotion-drain-livelock` build
  through test harnesses. All five are unbound test coordinators with no ledger. Fixture debt confirmed for
  these five; the other 37 are classified by first failure line only.

## 5. R3-R14 and the null `rebalancer` field (attack 5)
- No false arm reaches deleted code: `initializeRebalancer` and `applyRebalancerDependencies` have no caller
  left in src. Every read of the field is guarded; none can throw (VERIFIED at
  `partition-service-core-base.js:320, :345`, `-split-accessor-base.js:214, :675, :687, :709, :745`,
  `-lifecycle-methods.js:110`, `-metadata-delivery-methods.js:474`, `-leader-activation-methods.js:39, :80`).
- Meaning of the flag now: constant true on any bound coordinator, so R3 and R11-R14 are dead conditionals, and
  R4-R10 read "this service has a coordinator" through an optional chain: false before the sweep and again after
  a quiesce. One name, one meaning left (the admission world), but it is a probe, not a decision.

### F6. One read is not dead: the retention of non-ledger sinks
`resolveRebalancerLeadership` (`partition-service-leader-activation-methods.js:32-54`) retains leadership across
a readiness dip only while `this.rebalancer.isLeader` is true. `driveRebalancerLeadershipSink` uses it for
every non-ledger sink (`:74-77`). With the field always null, each dip of `isBackgroundWorkReady()` demotes
the runtime-service owner, whose `setLeader(false)` quiesces every runtime-service rebalancer
(`runtime-service-rebalancer-setup.js:162-173`), and the service-installation reconciler, then promotes them
again. In production this has been so since `ab901b40f` (the R1 guard returned before the build): INFERRED.
3b makes it unconditional in source. Its witness
`test/partition/partition-rebalancer-leadership-readiness-hysteresis.test.js` asserts `ps.rebalancer` exists
(`:145`), so it is red since 3a (INFERRED: the file is in no stage-3 selection).

Also dead after 3b, not listed in the record: `PARTITION_SERVICE_SHARED.UnifiedRebalancer`
(`partition-service-shared.js:14, :326`), six `REBALANCER_*_REQUIRED` messages and
`REBALANCER_DEPENDENCIES_APPLIED` (`partition-service-constants.js:526, :640-646`).

## 6. Corrective items 1-2 (attack 6)
- Item 1 (`3b182f42f`): only the drain's catch retains triggers (`replica-placement-owner.js:330-336`). VERIFIED.
- "Handed over" is set synchronously immediately before the submit function is called
  (`:394-396`, `recordProposalHandover`), so it means "the submitter was called", not "the port accepted".
  A submitter that throws before proposing is classified UNCERTAIN: conservative, never lossy.
- An admission recorded as a failed candidate: not found. REFUSED needs an answer that is not unknown and not
  ADMITTED (`replica-placement-owner-proposal-knowledge.js:57-65`); the fence refusal and a committed refusal
  are definite. A4' resets the progress at the second handover (`:47-50`).
- A failed candidate recorded as admitted: not found; ADMITTED requires the applier's outcome.
- Restart after an abort: the retained triggers plus the next wake. For (b) the admitted operation's own row
  wakes the owner (its signature was not recorded because the throw precedes `recordSeenOperationSignatures`,
  `:403-407`), so the restart is prompt (INFERRED). For (c) with an entry that never commits, and for any local
  failure with no later event, it is the 60 s resync.
- Item 3: confirmed for the lines read (`replica-placement-owner.js:496-523`,
  `replica-placement-owner-deficits.js:140-330`): every row field is type-checked before use. Lines 330-480 of
  the deficits module were not read; they work on already typed rows (INFERRED).

### F9. A resync-caused admission that then fails locally is not counted (VERIFIED by reading)
`placementResyncAdmissions` is incremented only on the normal return (`replica-placement-owner.js:671`). In
case (b) inside a resync-only pass the admission is recorded as admitted but the counter stays unchanged, and
the next pass carries retained triggers and is not resync-only either. The sealed acceptance signal
undercounts on this path.

### F10. A submission that throws deterministically is head of line for the tenure (INFERRED)
Since item 2 every throw of the submitter aborts the pass; the same candidate is first again on the next wake.
One aborted pass per wake, visible as `uncertainCandidates` and the warn line. This is the ruling's intent;
the record should say the poisoned-candidate isolation no longer covers the submission.

## 7. Evidence (attack 7), by sha and file
- `por-s3-witnesses-500a9851` (sha `500a9851...`): construction 1-3, 7-9 ok, 4, 5, 6 not ok, per case. VERIFIED.
- `por-cr2-item1-red-a5aacf97`: wakes `not ok 8` (poisoned candidate over several wakes). `por-cr2-item1-3b182f42`:
  wakes ok (8 assertions), construction still red at 4. VERIFIED.
- `por-s3a-5a1f6610` (sha `5a1f6610...`): construction file ok, 10 assertions; file level only (the runner
  prints cases for failing files), so "orders 1-9 and teardown green" rests on 10 assertions = 10 cases.
- `por-cr2-witnesses-c9ff75c7`: wakes `not ok 9` item 2 (b), `not ok 10` item 2 (c), per case; tenure ok (15).
  `por-cr2-item2-536d024a`: wakes ok (10), tenure ok (15), construction ok (10); file level. VERIFIED.
- `por-s3b-before-536d024a`: 144 files, 22 red. `por-s3b-376592b8`: 162 files, 70 red = 22 + 42 newly red in
  the same 144 + 6 of the 18 owner files (the six red there before). Nothing fixed. VERIFIED from both
  `test-results.ndjson`.

The 19 unattributed files red before 3b: `control-plane/membership-publication-first-epoch-members`,
`convergence/dt6-priority-surplus-remove-authoritative-placement-fence`, and in `test/rebalancer`:
`admission-real-size-estimates`, `coordinator-created-operation-progress`,
`duplicate-operation-prevention.property`, `formation-runtime-service-create-lane-budget-starvation`,
`message-group-membership-operation-lane`, `message-group-operation-routing.integration`,
`placement-admission-cross-coordinator-target-census`, `placement-owner-authority-provisioner`,
`quorum-conditioned-remove-safety`, `rebalance-coordinator-topology-guard`,
`rebalancer-entity-interaction-contract`, `rebalancer-own-create-memory-duplicate-replace`,
`replace-in-flight-blocks-planning`, `replace-named-handoff-attempt`,
`replica-operation-membership-epoch-binding`, `storage-reservation-lost-outcome-idempotency`,
`strict-operation-outcomes`. The W-T witness of the open quest (`...cross-coordinator-target-census`) is among
them, red at its first case before and after.

### F7. The 144-file selection misses dependants of the partition-side construction
The selection was a grep for `createOperation(`, `new UnifiedRebalancer(`, `createTestRebalancer(` plus three
partition files. A test that gets a rebalancer through the setters is not matched:
`test/partition/partition-rebalancer-leadership-readiness-hysteresis.test.js` (five cases, all start from
`ps.rebalancer`). Not in any stage-3 selection; red since `5a1f66105` by reading. Three more files read a
partition's `rebalancer` and were not selected (`cl-036-local-leader-row-seed`,
`partition-service-learner-promotion`, `split-rebalance-trigger`); they set or guard the field and probably
stay green (INFERRED).

### F8. 3b changed 49 files, not 42
Seven of the 19 "red before" files fail earlier or differently at 3b, on R2: `coordinator-created-operation-progress`
(case 5 to case 1, "Placement admission refused"), `formation-runtime-service-create-lane-budget-starvation`
(20 to 12), `quorum-conditioned-remove-safety` (9 to 1), `rebalancer-own-create-memory-duplicate-replace`
(2 to 1), `replace-in-flight-blocks-planning` (45 to 1), `replace-named-handoff-attempt` (different message),
`replica-operation-membership-epoch-binding` (8 to 1). "Still red, red before 3b too" hides that their earlier
failures are now masked; the migration list needs them.

## Author claims not confirmed
- 26.1: "`new UnifiedRebalancer` in src: partition and message group only". There is a third,
  `runtime-service-rebalancer-setup.js:124` (the runtime-service owner's default factory).
- 29: "no order attaches twice": true once the factory has returned; see F1.
- 31.1: the reads of a partition's `rebalancer` are "unreachable": the one at leader-activation `:39` decides
  the leadership of two live sinks (F6).
- 31.3: "42 files" (49, F8) and the selection as complete (F7).
- 31.2: that no false branch of R4-R10 runs in production construction: stated as unwitnessed by the author;
  not checked here either.
