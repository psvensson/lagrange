---
audience: evidence
---

# Formation release deadlock: decision packet

**What this is.** A read-only owner reading of the three-node formation deadlock seen in `repeat-551bf264/run-1`. Nothing in the repository was changed, no tests were run and no lab jobs were started.

**Source.** Worktree `/mnt/data/peter/projects/lagrange-cdc-slot-removal-20261114`. Its HEAD is `e40ee79d8`, but `git diff --stat 551bf2643 HEAD -- src` is empty, so `src/` is identical to candidate `551bf2643`.

**File paths.** All paths are relative to that worktree unless they are absolute.

**Evidence markers.** Every statement carries one of these:
- **[V-code]** verified in the code at the cited file and line.
- **[V-log]** verified in a node log. The failed-run logs are in `journey/analysis/repeat-fail/logs/fail/`. The passing-run logs are in `journey/analysis/slot-run/logs/` (f3aa2f08), `journey/analysis/logs/` (9991b450) and `...20261113/tv-diagnostic-retained-ed708dfd/`.
- **[I]** inferred.

**Node names.** The failed run's seed is `621932d0` and its joiners are `a6577360` (j1) and `10f1932b` (j2). The passing run's seed is `70808e06` and its joiners are `84ee7b06` and `96203c04`.

---

## One-page summary

### The cycle in three sentences

1. A joiner publishes its READY lease only after the startup authority reads READY. That needs every priority control-plane partition to be held on `min(3, eligible)` distinct nodes. In a three-node formation the only missing holders are the joiners themselves.
2. The seed can finish that spread only by REPLACE operations that remove a replica from the seed. The remove-safety floor counts only voters on nodes with a valid READY lease (`priority-publication-safety-topology.js:136-140`). So no seed replica can be removed until a joiner is READY. While that REPLACE is parked, the ledger interlock holds back every other priority ADD.
3. The one designed breaker is the formation-release handoff. It lets a joiner publish READY before the spread completes. It can only be *captured* at an instant when the authority is READY and spread-satisfied, which means an instant when the cohort is not yet being counted. Once a generation is revoked, or was never captured, and the cohort is counted, no such instant ever comes again. Release is edge-triggered on a window the cohort's own arrival closes.

### Recommended rule (repair B in section 9)

**A node's READY lease states only that this node can serve. The cluster-level formation fact ("the operation ledger and the priority partitions are spread") is a separate fact owned by the readiness owner. It is consumed by the observables it actually protects: cluster ACTIVE, schema admission and ordinary placement.**

With that rule, READY depends on node-local facts and spread depends on READY. The graph has no cycle.

**What it deletes.**
- The join operation-ledger formation barrier (`node-joining-operation-ledger-formation-readiness.js`, 479 lines).
- The whole formation-release handoff: closure owner, contract, evidence, identity, publication, publication coordinator and the consumer read path. That is about 2,250 lines in `src/control-plane/formation-release-handoff-*.js` plus `control-plane-readiness-formation-release-methods.js`.
- The pre-READY placement carve-outs that exist only because joiners are held: `startup-authority-placement-eligibility.js` cure classification, the cure-target exemption at `unified-rebalancer-critical-topology-methods.js:88`, and the pre-READY branch in `unified-rebalancer-available-nodes.js:321-384`.

**What must be proven.**
1. Every safety property the barrier claims to protect (section 5) is either delivered by the relocated cluster-level gate or is already not delivered today. The passing-run log shows the joiners READY at 12:12:51.3 and 12:12:57.0, while the ledger replica was first placed on a joiner at 12:13:02.8 and the seed's surplus ledger replica was only removed at 12:14:04 [V-log]. So "ACTIVE before ledger spread" already happens in every passing run.
2. Ordinary placement and schema admission are gated on the formation fact by exactly one owner.
3. A deterministic test (section 10) shows every admitted joiner released with no timer expiring, for every arrival order including two joiners in one derivation.

### The smaller bounded repair (C1 in section 9) is a credible alternative

Make the remove-safety floor and the placement predicate use **one** definition of a legitimate holder. The current floor (after `ab55403b6`, 2026-11-06) does not count a placement-eligible pre-READY joiner. The pre-`ab55403b6` floor carried a comment naming this exact deadlock. With one definition, the raw spread can complete before READY and the barrier releases at the level of its own condition. The handoff then becomes deletable.

### What I could not determine

See the list at the end.

---

## 1. The dependency graph, as built

Notation: **X ⇐ Y** means "X requires Y". The guard's code location is given for each edge.

### (a) A joiner publishes its READY lease

- **a1. READY lease publication ⇐ the formation barrier returns.** `signalReadyForReplicas` awaits `awaitOperationLedgerFormationBarrier()` at `src/bootstrap/node-joining-ready-signal-readiness.js:447`. Only after that does it send the heartbeat with `requireDurableVisibility: true` (:487-489). [V-code]
- **a2. The barrier returns ⇐ state ∈ {`ledger_spread_satisfied`, `bypassed_insufficient_formation_cohort`}.** See `node-joining-operation-ledger-formation-readiness.js:34-37, 450-452`. [V-code]
  - **a2.1. Not engaged.** `bypassed` is reached only while the barrier is **not engaged** and `now >= discoveryDeadline` (:238-241). The discovery window defaults to 5 s (`node-joining-constants.js:35`). [V-code]
  - **a2.2. Engagement is latched.** `barrierEngaged = barrierEngaged || hasSufficient...(snapshot)` (:437-438). "Sufficient" means `candidateNodeIds >= replicaTarget (3)` **and** `preReadyCandidateNodeIds >= replicaTarget-1 (2)` (:352-362). So two concurrent pre-READY joiners in a three-node formation always engage, and engagement never un-latches. [V-code]
  - **a2.3. Engaged release ⇐ `snapshot.startupAuthorityReady === true`** (:243-245). [V-code]
- **a3. `startupAuthorityReady` on a joiner ⇐ one of two things.**
  - **(i)** The joiner's **own local derivation** of the authority, from its own planning answer over its CDC-fed cache, is READY. See `node-joining-ready-signal-readiness.js:258-293` -> `control-plane-readiness-startup-authority-health.js:193-246`, using `getPriorityRecoveryPlanningAnswerForOwnerRead` on the joiner. [V-code]
  - **(ii)** A seed-published handoff contract validates as a consumer contract with `releaseAuthorized === true`. The function `attachFormationReleaseHandoffToStartupAuthority` then overwrites `ready = true` and `state = READY` (`formation-release-handoff-contract.js:561-574`; consumer validation :579-597, `control-plane-readiness-formation-release-methods.js:224-251`). [V-code]
- **a4. Other gates before the barrier.** These are the CDC subscription, local query transport and metadata publication readiness (`node-joining-ready-signal-readiness.js:379-444`). In the failed run all of them passed [V-log, analysis table]. None is in the cycle.
- **a5. Barrier timeout.** `priorityPlacementFormationTimeoutMs` is 120 s (`node-joining-constants.js:37`). On timeout the barrier throws a retryable error (:453-459, 363-382). The join phase retries and re-enters the same barrier [V-log, joiner lines at 12:33:06.9 and 12:33:41]. It is not a breaker.
- **a6. A durable rejoin bypasses the barrier entirely** (:398-400). [V-code]

### (b) The seed's startup authority is READY

The function is `buildStartupAuthoritySnapshotFromPlanningAnswerUncached` (`src/control-plane/startup-authority-snapshot-owner.js:253-568`). [V-code]

- **b1.** The admission state must not be `blocked` (:315-347).
- **b2.** The publication must be observed (not `UNPUBLISHED_OBSERVATION`) (:349-383).
- **b3.** `publicationStatus` must be present and the priority partition summary must carry a boolean `satisfied`. Otherwise the result is RECOVERY_PENDING or AUTHORITY_UNAVAILABLE (:395-505).
- **b4.** It must not be `blocked`, where blocked means target-participation reasons with an empty canonical set, or `isStartupProjectionActiveGateBlocked` (:507-512).
- **b5.** `priorityRecoveryReasonCodes` must be empty, and the projection active-gate recovery must not block readiness (:530-538).
  - The reason codes are the publication-recovery-gate reasons plus the target-participation reasons (:311-314).
- **b6. `priority_partitions_not_spread` ⇐ `prioritySpreadPending`** (`publication-recovery-gate.js:382-384`). Spread is satisfied when every priority partition has at least `requiredDistinctNodeCount = min(3, |eligibleNodeIds|)` distinct holder nodes (`membership-publication-priority-partition-summary.js:45, 560-563, 575-578, 621`).
  - The eligible set is the first non-empty of locally eligible, projected serving, or published active nodes (`membership-publication-priority-partition-readiness-data.js:182-217`). [V-code]
  - **[V-log]** At 12:32:17.975 the failed seed's summary was `requiredDistinctNodeCount = 3`, with 5 blocked partitions:
    - `replica_operations`, `schema_operations` and `sql_transactions` had 2 distinct holders out of 3, with 4 replicas.
    - `sql_transaction_participants` and `sql_write_operations` had 1 out of 3, with 3 replicas.
  - Replicas on the pre-READY joiner a6577360 **are counted as holders** by this census.
- **b7. `publication_epoch_pending` ⇐ the publication stream is pending, or acknowledgements are pending** (`publication-recovery-gate.js:233-235, 374-376`). [V-code]

### (c) The planner schedules the priority-partition spread

- **c1. Pre-READY joiners are legitimate placement targets** for priority partitions in the control-plane-recovery dimension. This applies when they are in the startup-authority canonical set, JOINING or ACTIVE, CONNECTED or READY, with live transport (`unified-rebalancer-available-nodes.js:321-363`; `startup-authority-placement-eligibility.js:85-119`). [V-code]
  - **[V-log]** The failed seed created ADDs to a6577360 for:
    - `control_plane_publications` at 12:31:12.25, completed 12:31:23.47;
    - `schema_operations` at 12:31:12.26, completed 12:31:29.78;
    - `sql_transactions` at 12:31:18.36, completed 12:31:33.34.
- **c2. Spread at or above the replica target ⇐ a count-neutral REPLACE (remove from the seed).** The seed logged "Deferring spread-driven count-increasing ADD while already at/over target replica count (no count-neutral REPLACE pairing)" 57 times [V-log]. The REPLACE for `replica_operations-p1` (seed -> a6577360) was created at 12:31:46.68 [V-log].
- **c3. The REPLACE's source removal ⇐ remove-safety floor: projected voter-ready rows >= the minimum replica count (3).**
  - Rows are counted by `isVoterReadyFloorCountableReplica` (`operation-workflow-remove-safety-evaluator.js:550-552, 649-669`).
  - That function requires `committedNodeFloor.nodeSemanticsById[node].readyNow === true` (`priority-publication-safety-topology.js:136-140`).
  - `readyNow` means ACTIVE plus a valid READY lease (`node-liveness-semantic-projection.js:489-490`, cited from a sub-reading). [V-code]
  - **[V-log]** a6577360 coordinated the REPLACE: "Critical partition replica_operations-p1 would drop voter-ready replicas below minimum (2/3)", reason `replace_remove_safety_blocked`, from 12:31:55.012. There were 78 such lines on a6577360.
  - **This edge is c3 ⇐ a1: joiner READY.**
- **c4. Every other priority ADD ⇐ no operation-ledger self-move in flight** (`rebalance-coordinator-ledger-interlock-admission.js:77-78`). [V-code]
  - **[V-log]** From 12:31:46.7 onward, "Rebalancing move skipped" with `admissionReason = operation_ledger_self_move_in_flight` appears for:
    - `schema_operations` x7
    - `sql_transaction_participants` x6
    - `sql_transactions` x5
    - `sql_write_operations` x5
    - `control_plane_publications` x14
- **c5. System partitions ⇐ the critical-topology settling gate** (`unified-rebalancer-critical-topology-methods.js:83-104, 142-171`). JOINING nodes are TRANSITIONAL unless they are formation-cohort cure targets (:88). Recovery-lane partitions pass on quorum (:153-160). [V-code]
  - **[V-log]** On the priority partitions the blocker logged was `topology_operations_in_flight`: on `replica_operations` 12:31:48-52, and on `schema_operations`, `sql_transactions` and `control_plane_publications` 12:31:17-44.
  - `node_ready_lease_incomplete` naming both joiners was the blocker on the non-priority system partitions (`config`, `indices`, `service_*` and others).
  - **Correction to the starting analysis.** `node_ready_lease_incomplete` is downstream of the cycle, not an edge in it. The edge in the cycle is c3 plus c4.
- **c6. Non-system rebalancing ⇐ priority partitions spread.** The log line is "Deferring non-system rebalancing until priority control-plane partitions spread" on `nodes-p1`, with backoff growing to 76 s [V-log]. This is downstream.

### (d) Handoff generation lifecycle

All in `formation-release-handoff-closure-owner.js` unless stated. [V-code]

- **d1. Capture ⇐ all of the following.**
  - **Admission** (`captureAdmitted`, :205-209), which is one of:
    - authority `ready === true` and `isAuthorityReadyRetainable` (state READY and spread satisfied; `formation-release-handoff-evidence.js:371-374`); or
    - `successorCapture.state === COMPLETED_GENERATION`.
  - **A connection to the authority itself** (:229-233).
  - **A non-empty cohort.** Every canonical member present, JOINING with CONNECTED or READY, with a connection whose boot incarnation matches; a member that is already READY is skipped (:46-89, 234-240).
  - **Not the same cohort at an epoch <= the terminal one.** The cohort signature must not equal `terminalGeneration.cohortSignature` at `publicationEpoch <= terminalGeneration.publicationEpoch` (:243-249).
  - **A valid observation:** authority evidence present, rows and connections parse, finite `observedAt` (:114-130; evidence :199-265).
- **d2. Retained ⇐ all of the following.**
  - The authority connection's boot incarnation equals the captured one (:393-406).
  - `isRetainableAuthority(authority, generation)` (:408-413; contract :391-427). That requires:
    - **Identity:** epoch >= the captured epoch, and the fence identity equals the captured one (:382-390).
    - **Cohort:** every captured cohort member is still canonical (:428-440).
    - **Readiness:** one of READY with spread satisfied, BLOCKED with spread false and no reasons, or RECOVERY_PENDING with spread false and reasons ⊆ {`priority_partitions_not_spread`} (:408-426, 441-460; allow-list :43-44).
  - Every cohort member is present, has the same incarnation, is JOINING or ACTIVE, and is CONNECTED or READY (:91-112, 301-305).
- **d3. Release-authorised ⇐ the generation is durably published and read back.** The flow is: publication coordinator `offer` (`formation-release-handoff-publication-coordinator.js:65`) -> `persistAndAcknowledge` (:119) -> `onDurable` (:138) -> `acknowledgePublication` (closure :462-485; wiring `control-plane-readiness-participation-base.js:239-251`).
- **d4. Completed ⇐ every captured cohort member is a current READY member at the captured incarnation** (:306-335). Completion records `terminalGeneration = generation` and `successorCapture = COMPLETED_GENERATION` (:320-324).
- **d5. Revoked ⇐ any of these.**
  - The observation is invalid (:365-370).
  - The authority's boot incarnation has changed (:397-406).
  - The authority is not retainable (:408-413).
  - A cohort member has a problem (:304-305).
  - On a non-authority projection, missing `lastCompatibleAuthority` (:444-453).
  - **Effect of every revoke** (:266-281): `terminalGeneration = generation`, `successorCapture = CLOSED`.
- **d6. Successor capture ⇐ `COMPLETED_GENERATION` admission, still retainable against the completed generation.** `fenceSuccessorCapture` closes it otherwise (:211-219). Otherwise the successor needs d1's READY and spread.

### Cycles

**Cycle C1 (the deadlock)**

- **The loop:** joiner READY (a1) ⇐ barrier SATISFIED (a2.3) ⇐ authority READY (a3.i) ⇐ spread satisfied (b6) ⇐ seed-side REPLACE removal (c2, c3) ⇐ joiner READY.
- **The breaker is a3.ii**, a release-authorised handoff. It is available only while a generation is ACTIVE and acknowledged (d3). Getting one needs either:
  - **(α)** an observation in which the authority is READY with spread satisfied, the cohort is JOINING and connected, and the cohort/epoch is not terminal-fenced (d1); or
  - **(β)** the predecessor generation completed and the authority is still retainable (d6).
- **β needs a predecessor that completed**, which needs its cohort READY, which needs its own handoff. So β is self-sustaining once started but cannot start itself.
- **α needs authority READY with spread satisfied while the cohort exists.** By b6 that holds only while the cohort is **not** counted in the eligible set, or while the eligible set is still below 3. Exactly the event that makes the cohort count (its publication) destroys α.
- **So the breaker is available only in a window bounded by the cohort's own publication.** In passing runs that window is the 0.5-1.4 s between "j1 published at epoch 3" and "j2 published at epoch 4" [V-log; see section 3].

**Cycle C2 (interlock amplification)**

- The loop: other priority ADDs (c4) ⇐ ledger self-move done ⇐ c3 ⇐ joiner READY.
- It has the same breaker as C1. It is not an independent cycle, but it is why the partitions that are not at target, `sql_transaction_participants` and `sql_write_operations`, also never spread.

**Cycle C3 (the barrier contradicts its own comment)**

- `getOperationLedgerFormationBarrierSnapshot` carries this comment: "Observed, never acted on here: making this a release condition would deadlock formation, because a joiner would wait for spread that only its own join can supply" (`node-joining-operation-ledger-formation-readiness.js:284-287`). [V-code]
- Yet the release condition it does use, `startupAuthorityReady`, contains exactly that spread through `priority_partitions_not_spread` (b5, b6). [V-code]
- The handoff is the mechanism that is supposed to make this safe. It is available exactly as described for C1.

**The mechanisms that look like breakers but are not**

- **The barrier timeout (a5)** restarts the same wait. [V-log]
- **`classifyFormationCohortSpreadCureNode`** lets JOINING joiners be placement targets and skips them in the topology gate. It does not bypass the remove-safety floor (c3) or the ledger interlock (c4). [V-code]
- **The raw cure.** In older runs it eventually released joiners: closure-v4 L25 recorded release at +92.4 s by the raw cure. It is now blocked by c3.
  - Commit `ab55403b6` (2026-11-06, "consume committed node authority for removal safety") replaced the old floor predicate. The old predicate counted "evidence-absent" denials and carried this comment: "Without this, cold formation deadlocks: the barrier withholds the joiner's READY lease, the joiner's healthy promoted voters are invisible to the floor, the surplus drain is refused, and the spread the barrier waits for can never happen" (`git show ab55403b6^:src/rebalancer/priority-publication-safety-topology.js:164-172`). [V-code]
  - That old carve-out itself tested `isNodeActiveWithCurrentLease` (:153-162). So whether it actually counted a JOINING joiner with no lease is doubtful [I]. Its stated purpose was exactly the edge that is now closed.

---

## 2. The handoff state machine

### States

From `formation-release-handoff-contract.js:31-33` [V-code]:
- **IDLE** (`no_satisfied_formation_cohort`)
- **ACTIVE** (`retained_until_captured_cohort_ready`), with `releaseAuthorized` false or true
- **COMPLETE** (`captured_cohort_ready`)
- **REVOKED**, with reason `startup_authority_incompatible`, `captured_cohort_member_missing`, `captured_cohort_incarnation_changed` or `captured_cohort_member_ineligible`

### Hidden owner state (all process-local)

These fields are set in the constructor at closure-owner :133-143 [V-code]:
- `generation`
- `publishedGeneration`
- `lastCompatibleAuthority`
- `terminalGeneration`
- `successorCapture` ∈ {CLOSED, COMPLETED_GENERATION(gen)}
- `lastContract`

### Transitions

| From | To | Guard | Code |
|---|---|---|---|
| IDLE / COMPLETE / REVOKED (no generation) | ACTIVE (unauthorised) | d1 | :376-391 |
| ACTIVE unauthorised | ACTIVE authorised | durable write and read-back of the same contract | coordinator :119-138 -> closure :462-485 |
| ACTIVE | ACTIVE | d2 holds, some member pending | :337-348 |
| ACTIVE | COMPLETE | every member READY | :316-335; sets terminal and COMPLETED_GENERATION |
| ACTIVE | REVOKED | d5 | :266-281; sets terminal and CLOSED |
| no generation | (unchanged) | observation invalid | closes the admission (:371) |
| COMPLETED_GENERATION | CLOSED | the authority is not retainable against the completed generation | :211-219 |

### Who drives a transition

There is **no dedicated timer**. `observe()` runs on the seed whenever any caller reads the seed's own startup authority:
- through the sync path (`control-plane-readiness-startup-authority-health.js:127-152`, `154-179`), or
- through the async path (`:193-223`), with `observeAuthority = (nodeId === authority && service.nodeId === authority)`. [V-code]

The callers include:
- the rebalancer's startup-authority reads (`unified-rebalancer-available-nodes.js:311`, `unified-rebalancer-priority-readiness.js:687`, `rebalance-coordinator-topology-guard-methods.js:103`);
- the bootstrap API readiness (`bootstrap-api-readiness-methods.js:134`);
- the cluster-view owner and join readiness snapshots. [V-code]

The cadence is therefore whatever those readers do. The rebalancer runs per partition, with gate delays of 5 s up to 76 s [V-log]. **A READY window that no reader samples is missed** [I].

Durable publication is event-driven from the same observe (`control-plane-readiness-formation-release-methods.js:313-318`), with one write in flight at a time and the latest pending write coalesced (coordinator :65-117). [V-code]

On a joiner, the barrier polls every 500 ms (`node-joining-constants.js:36`). Each poll performs the consumer's durable read (`control-plane-readiness-startup-authority-health.js:207-213`). [V-code]

### What is durable and what is process-local

- **Durable.** The contract row in `control_plane_publications`, keyed by the authority node and its **boot incarnation** (`formation-release-handoff-publication.js`; the read at methods :181-186). [V-code]
- **Process-local.** Everything else, including `terminalGeneration` and `successorCapture`. [V-code]

### What a seed restart does

- **Restore needs the same boot incarnation.** `restore()` (:145-191) only re-adopts an ACTIVE, release-authorised contract whose `authorityBootIncarnation` equals the current authority connection's boot incarnation (`contract.js:316-322`). The cached row lookup is itself keyed by the current boot incarnation (methods :181-186). [V-code]
- **After a restart:** no generation, `terminalGeneration = null`, `successorCapture = CLOSED`. The next capture needs d1(α). The post-reopen-capture quest verified "seed restart starts CLOSED" (`solve/quests/formation-release-handoff-post-reopen-capture/log.ndjson` L5).
- **Joiners reject the old contract.** Joiners validate the authority's current boot incarnation (`contract.js:321-322`), so the restarted seed's old contract is not consumable. [V-code]

---

## 3. Why the first handoff is revoked in every run

### What `startup_authority_incompatible` compares

The same reason string is written by three paths in `observe()`/`project()`. [V-code]

1. **No valid observation** (closure :358-370). Either `buildAuthorityEvidence` is not PRESENT, meaning `authorityAvailable !== true`, or a scalar is missing, or the fence is unparsable (`evidence.js:199-265`). Or the rows or connections do not parse.
2. **Boot incarnation mismatch.** The authority connection's boot incarnation differs from the captured one (:393-406).
3. **`isRetainableAuthority` is false** (:408-413). That happens when any of these holds:
   - the epoch regressed;
   - the fence identity changed;
   - a cohort member left the canonical set;
   - READY without spread;
   - RECOVERY_PENDING with any reason outside {`priority_partitions_not_spread`};
   - any other state, such as `seed_locally_ready_unpublished`, `authority_unavailable`, or `blocked` with reasons.

The revoked contract always prints `observedAuthorityReady = null`, because `revoke()` does not pass it (:273-279). That field is therefore uninformative [V-code]. The log cannot say which path fired.

### What the logs do show

The capture and revoke times in all four runs [V-log]:

| Run | Captured | Authorised | Revoked |
|---|---|---|---|
| fail | 12:31:02.980, epoch 1, ready=true, cohort [j1] | 03.258 | 03.801 |
| pass | 12:12:43.357 | 43.736 | 44.500 |
| 9991 | 10:11:26.340 | 26.454 | 27.075 |
| ed708 | 22:27:06.582 | 07.110 | 07.744 |

- Every revoke prints `observedPublicationEpoch = 1`.
- **No generation was ever captured at epoch 2 in any run.** In passing runs the recapture is at epoch 3, with `observedAuthorityReady = true` and **no** recovery reasons. It came 0.25 s after the owner reconcile drive committed (pass: drive 12:12:45.769 with `missingPublishedCount = 1`; capture 12:12:46.017).
- In passing runs, epoch 4 (the second joiner published) already reads `priority_partitions_not_spread` (pass 12:12:46.951).

### Why it is always incompatible about 1 s later (most likely mechanism) [I]

1. At capture, j1 is in the canonical set through `formationPlacementNodeIds` (startup-authority-snapshot-owner.js:269-285). But j1 is not yet a published, recovery-active member.
2. About 0.5-1.6 s later, j1 becomes a recovery-active node missing from the published set. The owner-membership driver then has a deficit: the next drive logs `missingPublishedCount = 1`.
3. That puts the authority into a publication-pending state. The candidates are `publication_epoch_pending` (b7), `seed_locally_ready_unpublished`, or a planning answer that is briefly unavailable. All three are non-retainable (d2), so the generation is revoked.
4. The state clears when the publication that includes j1 commits (epoch 3), which is when passing runs recapture.

This fits every timing above, but the reason codes at the revoke instant are not logged in any run. The closure owner logs transitions, not the inputs to a refused capture or a revoke.

### Was the first capture ever consumable?

**No.** In every run the generation was revoked before any joiner's barrier first evaluated [V-log]:
- fail: barrier first at 12:31:05.453, revoke at 03.801.
- pass: barrier first at 12:12:45.935, revoke at 44.500.
- 9991 and ed708: the barrier first state comes 1.0-1.6 s after the revoke (analysis table rows "gen-1 revoked" 6.8/7.9 against "barrier first" 8.4/8.9).

The only lasting effect of the epoch-1 capture is that it plants `terminalGeneration = {cohort [j1], epoch 1}`. That forbids recapturing cohort [j1] at epoch 1.

### Intended, harmless, or a defect?

It is **a defect in its own right, though not the cause of the deadlock.**

- The capture is admitted on a READY that is *vacuous with respect to the cohort it releases*. At epoch 1 the eligible set excludes j1, so `requiredDistinctNodeCount = min(3, 1) = 1` and the spread is trivially satisfied (b6) [I for the exact eligible set at that instant; V-code for the formula].
- The admission predicate tests a fact that the cohort's own next membership step is guaranteed to withdraw.
- The epoch-3 capture in passing runs has the same character. It succeeds because the second joiner has not yet entered the eligible set.
- **Release today succeeds only when admission samples a vacuous READY.**

---

## 4. Why each closing rule exists

### (i) A revoke closes the successor admission

- **Where it came from.** Quest `formation-release-handoff-post-reopen-capture`, commit `64befd994` (2026-08-30).
- **Why the successor admission exists.** In the GCP run 2026-08-30T10-05-10, gen-1 completed in the same evaluation that saw the priority reopen, so no gen-2 was captured. The late joiners waited 54-55 s at `waiting_for_startup_authority` (closure-v4 L25; commit message).
- **Constraint `typed-bounded-admission`:** the admission is "closed by the successor capture, by any revocation, and by the first incompatible or absent authority observation; it never reopens without a new completion."
- **Decision table** (`docs/specs/decision-tables/formation-release-handoff-closure.json`), rule `completion-under-compatible-reopen-captures-successor`: "a substantive block, an incompatible identity, or a revocation closes the admission and capture returns to the READY gate."
- **Safety property** (stated as minting evidence; the property label is [I]): "The completed generation's authority evidence ... is the minting evidence for its successor."
  - A revocation means that evidence chain is broken: a member was lost, an incarnation changed, or there was a substantive block.
  - So minting must return to fresh READY-with-spread evidence.
  - It protects against releasing joiners on authority evidence that has been invalidated.
- **What nobody recorded.** No quest records what happens if READY with spread can never recur. The quest's verification (L5) states only that the admission "never reopens".

### (ii) The `terminalGeneration` same-cohort, epoch <= terminal refusal

- **Where it came from.** It was introduced in checkpoint `3a065e5f2` (2026-08-28, `formation-release-handoff-closure-v3`). **No log entry states its reason.**
- **Indirect evidence:**
  - `test/control-plane/formation-release-handoff-closure.test.js:706-800` asserts that after a substantive revoke, recapture happens only at a fresh publication epoch.
  - v1 quest constraint `versioned-incarnation-bound-cohort` says incompatible epochs "revoke or rotate fail-closed".
- **Purpose [I].** It stops the same generation being re-minted at the same epoch after a completion or a revoke. That prevents a capture/revoke loop, and stops a revoked authority from being resurrected without new publication evidence.
- **What it is not.** It is *not* the v3 "flapping" fix, which was a retention defect fixed by removing `sameCanonicalNodeIds` (v3 L11).

### (iii) Capture needs READY and spread satisfied; retention tolerates only `priority_partitions_not_spread`

- **Decision-table invariants:**
  - `non-monotone-spread-safe`: "A compatible priority-spread reopening cannot withdraw release before every captured JOINING incarnation publishes a current READY lease."
  - `incarnation-and-safety-fenced`.
- **Rule `substantive-block-revokes`:** "Only the exact priority-not-spread reopening is retainable; admission, writability, eligibility, and evidence failures remain safety blocks."
- **v1 constraint:** "captures the JOINING cohort at the first globally satisfied priority-spread observation". Also "no readiness weakening" (`unchanged-certification-budgets`).
- **The property protected.** A joiner is released only by an authority that was, at least once, wholly healthy. After that, only the reopen caused by the cohort's own arrival is forgiven.
- **The design's internal contradiction.** The design already treats `priority_partitions_not_spread` as attributable to the cohort, because that is why it is retainable. But it refuses the same attribution at capture.
- **That asymmetry is the whole deadlock:** a not-spread caused by the cohort is safe to *keep* a release through, but not safe to *grant* one on.

---

## 5. What the join barrier protects

### Origin

- **Quest:** `formation-priority-spread-without-exclusive-self-move-cost`, L40 (2026-07-17).
- **Theory:** `theory-20260717-join-finalization-currently-conflates-priority-placement`.
- **Code:** first landed in bulk checkpoint `6929b3dfb` (2026-07-18).
- **The intervention as stated:** "publish an owner-authored priority-placement-ready lease ...; allow only startup-authority priority control-plane placement to target that live-transport cohort; keep ordinary placement ACTIVE-only; delay final ACTIVE until the replica_operations quorum is no longer concentrated."

### The stated hazard

The hazard was: "signalReadyForReplicas publishes ACTIVE and the live harness can open schema admission immediately, while serialized ledger REPLACE number two cannot even be minted until number one terminalizes ... leaving no formation barrier in which the ledger concentration can close." Its ancestry is `formation-ledger-quorum-spread-first` (2026-07-05): "never leaves the operation ledger's quorum concentrated on the seed".

### Whose property is it?

**The cluster's, not the joiner's.** A barrier-held joiner can already serve: it hosts priority replicas, and it passed the CDC, transport and metadata gates. The barrier protects two cluster observables from opening while the ledger quorum is concentrated on the seed:
- cluster ACTIVE / schema admission, and
- ordinary placement.

### What would break if a joiner published READY earlier

Per the design:
- Ordinary placement (ACTIVE-only) could target it. Ordinary placement already waits on the separate "Deferring non-system rebalancing until priority control-plane partitions spread" gate [V-log, V-code location c6].
- The cluster could report ACTIVE, and schema admission could open, while a single seed failure would lose the ledger quorum.

### The barrier no longer delivers this property in passing runs [V-log]

In pass f3aa2f08:
- The joiners signalled READY at 12:12:51.318 and 12:12:57.004.
- The *first* priority placement on any joiner after that was `control_plane_publications` -> 96203c04 at 12:12:55.0.
- `replica_operations` -> 96203c04 was created at 12:13:02.8.
- The seed's surplus ledger replica was removed at 12:14:04.1.
- The harness counted the cluster ACTIVE at +21.7 s, which is about 12:12:58.
- So **ACTIVE opened about 66 s before the ledger left the seed**.

The handoff has turned the barrier into ready-then-rebalance in every passing run. The decision table permits this through `non-monotone-spread-safe`.

The early-release history agrees. `formation-spread-progress-at-cause` (Q8, `0efda9137`, 2026-11-10) recorded the same circular wait: "joining nodes stalled on NODE_READY_LEASE_INCOMPLETE without ever receiving priority spread replicas". It fixed the wait only while a handoff is `active`.

---

## 6. Is the authority's unreadiness caused only by the pending cohort?

**In the failed run, yes [V-log].**
- From 12:31:07 to the end, every joiner barrier line shows `recovery_pending` with reasons exactly `['priority_partitions_not_spread']` and gate `priority_spread_pending`.
- The spread summary (12:32:17.975) shows `requiredDistinctNodeCount = 3` across 3 nodes. Every partition's gap is therefore made up only of j1 and j2.
- `control_plane_publications` reached 3 nodes. The ledger and SQL partitions held 1-2 distinct nodes, with the seed always among them [V-log, ADD targets].

**Every way the authority can be not READY, classified.** (i) means attributable to the pending joiners; it disappears once they are READY and the spread runs. (ii) means independent of them. [V-code for the producers; the classification is my judgement]

| Not-READY cause | Producer | Class |
|---|---|---|
| `priority_partitions_not_spread` | publication-recovery-gate :382-384; summary :560-621 | **(i)** when every blocked partition's missing holders are cohort members. That is computable: the spread over the eligible set *minus the cohort* is satisfied. **(ii)** when a READY non-cohort node is missing a holder, for example after a replica loss. |
| `publication_epoch_pending` | gate :233-235, 374-376 | **(i)** when the only missing-published or pending-ack nodes are cohort members. **(ii)** when an established member's acknowledgement is pending, or the publication write failed. |
| `priority_spread_evidence_unavailable` | gate :229-232, 378-381 | (ii) evidence is absent |
| `control_plane_not_writable` | constants :70; target participation | (ii) |
| `recovery_eligibility_pending` | constants :71; target participation (startup-authority-snapshot-owner.js :120-132) | (ii) by default; possibly (i) when the target is a cohort member [I] |
| state `blocked` (admission blocked :315-347; active gate blocked :507-512) | snapshot owner | (ii) |
| state `seed_locally_ready_unpublished` | :349-383 | (ii) before formation; (i) only if the sole unpublished nodes are the cohort [I] |
| state `authority_unavailable` (planning incomplete, read failed, service unavailable) | :169-225, 426-443, 478-504 | (ii), because evidence is absent |
| active-gate recovery open (no reason code) | :526-538 | ambiguous. It is (i) when the in-flight recovery ops are the cohort's own spread ops; this is not determinable from current fields [I] |

**Conclusion.** Only two reasons can be cohort-attributable: `priority_partitions_not_spread` and `publication_epoch_pending`. Both need an explicit attribution computation, because the producers do not currently say *whose* absence causes them. Everything else is a real reason not to release anyone.

---

## 7. Every other way into the same deadlock

The deadlock state is: no ACTIVE, release-authorised generation; the authority not READY for cohort-attributable reasons; joiners engaged in the barrier.

| Event order | Reachable? | Why |
|---|---|---|
| **Two joiners eligible within one driver tick (5 s)** | **Yes** [V-code + I] | Nothing caps a derivation (`membership-publication-candidate-derivation.js:528-557`). If both joiners are published at the same epoch, no observation exists with exactly one joiner counted, so α never holds after the first revoke. In the failed run the *projection* jumped 1 -> 3 at 06.158 (SWIM divergence) [V-log]. The *publication* still added one joiner per drive (epoch 2 at 11.8 s, epoch 3 by 15.1 s) [V-log]. The authority's not-spread came from the projection or eligible set before epoch 2 [I]. |
| **The membership derivation delayed by load** (the observed case) | **Yes** [V-log] | The race loss was about 1 s (analysis section 3). |
| **No authority reader samples the READY window** | **Yes** [I] | `observe()` is driven by readers (section 2). A window of about 0.3-1.4 s can fall between reads. |
| **A revoke at a later epoch** | **Yes** [V-code] | Any non-allow-listed reason during an ACTIVE generation revokes it and closes the admission (d2, d5). Examples: a transient `publication_epoch_pending` when the next joiner is published with acknowledgements pending, an evidence-unavailable instant, or `control_plane_not_writable`. If the remaining cohort is still pre-READY and the spread is unsatisfied, that is the deadlock. Passing runs got through epochs 4-5 with only `not_spread` [V-log], but nothing guarantees that. |
| **A joiner restart during formation** | **Yes** [V-code + I] | The captured member's incarnation changes, so the generation is revoked as `captured_cohort_incarnation_changed` (:100, 305) and the admission closes. A *fresh* (stateless) restarted joiner re-enters the barrier and the deadlock holds. A *durable-rejoin* restart bypasses the barrier (:398-400) and publishes READY, which **breaks** the cycle: the remove floor counts it once it holds a voter replica. |
| **A seed restart during formation** | **Yes** [V-code + I] | All closure state is lost and the old contract is unconsumable (section 2). Recapture needs α. If the joiners are already published (spread required = 3), α is unreachable. |
| **Five-node formation** | **Yes, with more exposure** [I] | Engagement needs only 2 pre-READY joiners (a2.2). Any successor-chain break (a revoke) while >= 2 joiners are pre-READY and counted reproduces the state. The history records five-node runs reading `node_ready_lease_incomplete` 521 times (`release-0-2-five-node-convergence` L19). The successor chain also releases one cohort at a time, which lengthens exposure. |
| **A single joiner** (sequential growth) | **No** | The barrier never engages (pre-READY < 2) and bypasses after the 5 s discovery window (a2.1) [V-code; pass joiner 2 released `bypassed_insufficient_formation_cohort` V-log]. |
| **The handoff captured but never acknowledged** (durable write failing repeatedly) | **Yes, as a stall rather than a lock** [I] | The joiners keep waiting until the write succeeds or the generation is revoked. |

---

## 8. The other reds in the failed run

### Two ADDs refused with "Stale dispatch for published membership epoch 2; current epoch is 3"

- **Partitions:** `sql_transaction_participants` (12:31:18.257) and `sql_write_operations` (12:31:25.562). [V-log]
- **Where it is raised.** `ensureDispatchMembershipEpochOrSkip` (`src/rebalancer/operation-workflow-dispatch-epoch-gate.js:91-152`) fails the operation *terminally* on an epoch mismatch. [V-code]
- **Why it happened** [I]. The publication advanced in two drives (epoch 2, then epoch 3) while ADDs bound to epoch 2 were dispatching. That is a cost of the one-joiner-per-drive publication.
- **Re-creation is supposed to come from ordinary rebalancer re-planning, and it did come** [V-log]:
  - Both partitions kept passing the planning gate with `bypassState = operation_creation_required`.
  - The planner re-planned the `spread_replicas` ADD repeatedly (12:32:00.09, 12:32:01.58 and later).
  - Admission refused each attempt with `operation_ledger_self_move_in_flight` (c4).
- **Verdict.** This is **a consequence of the deadlock** through C2, not an independent liveness gap.
- **A residual worth noting.** A terminal refusal that re-planning recreates is correct only while re-planning stays live. Here it was live but admission-blocked.

### The `replica_operations` REPLACE parked on `replace_remove_safety_blocked`

- **What happened.** It was coordinated by a6577360 from 12:31:55.012, with "would drop voter-ready replicas below minimum (2/3)". [V-log]
- **Verdict.** This is **the closing edge of the cycle** (c3). It is a consequence of no joiner READY lease, and it is also why the spread cannot complete.
- **Not a separate gap.** The operation itself is retried every second ("Deferred retryable replica operation dispatch failure") [V-log].

---

## 9. Candidate repairs

Each repair is stated as a rule.

### A. Level-triggered, cohort-discounted capture

**Rule.** The seed admits the capture of a generation for cohort K whenever the authority, evaluated with K's absence discounted, is READY. Concretely:
- every not-READY cause is in class (i) of section 6 for K;
- every non-K fact meets READY;
- the fence and incarnation are current.

Admission is a pure function of current evidence. The admission does not close on revoke; a revoked generation is replaced by a fresh one whenever the predicate holds at a new identity.

- **Invariant.** The joiners in K are released if and only if every reason not to release is caused by K's own absence.
- **Cycle removed: C1.** The predicate holds throughout the deadlock state, so capture happens on the next evaluation regardless of event order. That is level-triggered and independent of timing.
- **Must preserve** `substantive-block-revokes` and `incarnation-and-safety-fenced`. Class (ii) still blocks, and fencing is unchanged. Durable acknowledgement before release is unchanged.
- **Owners touched.** The startup-authority snapshot owner must publish the attribution: which nodes each blocked partition, and each pending publication, is missing. The closure owner consumes it.
- **Deletes.**
  - The `COMPLETED_GENERATION` successor admission and `fenceSuccessorCapture`: the successor becomes just another level capture.
  - The `terminalGeneration` refusal: idempotence comes from generation identity.
  - The transient-BLOCKED retention special case.
- **Risks.**
  - The attribution adds a new derivation. It must have one owner, or it duplicates spread logic.
  - It keeps the whole handoff apparatus (about 2,250 lines).
  - It keeps the joiner's *local* re-derivation of the authority (a3.i). That is a second derivation of one decision; the decision table's `durable-consumer-parity` only partly fences it.
  - It still leaves "ACTIVE before ledger spread" in place (section 5).

### B. A joiner's READY is independent of spread; the cluster gate moves to its consumers

**Rule.** A node publishes its READY lease when its node-local gates pass. Those are the CDC subscription, local query transport and metadata publication readiness (a4).

"Formation complete" means the priority partitions and the ledger are spread over `min(3, READY nodes)` distinct nodes. It is one fact, owned by the readiness owner. It is consumed by:
- the cluster-ACTIVE / schema-admission observable, and
- ordinary placement. Ordinary placement already consumes it: "Deferring non-system rebalancing until priority control-plane partitions spread" [V-log].

Evaluation of B:
- **Invariant.** READY ⇐ node-local facts only, and spread ⇐ READY nodes. The graph is acyclic by construction, so liveness does not depend on any window.
- **Cycles removed.** C1, C2 and C3. The c3 floor is then satisfied by READY joiners. That is exactly what passing runs do today after the handoff.
- **Safety preserved.**
  - The section 5 property ("the cluster does not open while the ledger is concentrated") becomes enforced at the observable it names, instead of indirectly through withheld leases.
  - In passing runs it is currently *not* enforced (section 5, V-log), so B strengthens it.
  - Remove safety, fencing and readiness semantics are untouched.
  - It is consistent with the binding ruling "one semantic READY owner at the durable NODES lifecycle boundary ... no compatibility branches" (memory `ready-owner-at-durable-nodes-boundary.md`).
- **Owners touched.**
  - Bootstrap join (`node-joining-ready-signal-readiness.js`).
  - The readiness owner (the formation fact).
  - The schema-admission and cluster-ACTIVE consumer: which component owns "cluster ACTIVE" for clients is not determined here (see the unknowns).
  - Rebalancer placement eligibility.
  - Coupled pair `formation-release-seed-contract-joiner-consumer` (join-core coupling directive).
- **Deletes.**
  - The barrier: about 479 lines.
  - The entire handoff: closure owner, contract, evidence, identity, publication, coordinator, readiness formation-release methods, and the consumer read in startup-authority-health. About 2,250 lines, plus their tests and decision table.
  - The pre-READY placement path (`startup-authority-placement-eligibility.js` cure classification, the `available-nodes` pre-READY branch :321-384, the critical-topology cure exemption :88).
  - The barrier's CONNECTED-only liveness heartbeat (:322-344).
- **Risks.**
  - A wider change to the join core.
  - The July concern about serialised ledger REPLACEs while the cluster is open. Passing runs already live with that.
  - Harness definitions of ACTIVE must move to the formation fact.
  - Rolling-restart and durable-rejoin paths must be re-witnessed.
  - Whether anything other than the barrier relies on "JOINING means not yet a placement target" needs a census.

### C1. One definition of "legitimate holder" across placement and remove safety

**Rule.** A voter replica counts toward the remove-safety floor exactly when its node satisfies the same predicate that admitted it as a priority placement target: startup-authority member, JOINING or ACTIVE, CONNECTED or READY, live transport, with incarnation fenced. One predicate, one owner.

- **Invariant.** The planner never places a replica it will then refuse to count.
- **Cycle removed.** C1's edge c3 ⇐ a1, and with it C2.
  - The raw cure then completes before READY. The census already counts pre-READY holders (section 6, V-log).
  - The authority becomes READY on its own evidence.
  - The barrier releases on a3.i at the level of its condition.
  - It is independent of timing because the cure no longer needs any joiner's READY.
- **Safety.** It *restores* the barrier's intended property (ledger spread before ACTIVE) instead of bypassing it.
  - The risk is counting a node without a READY lease toward a quorum floor.
  - The liveness evidence must be the committed CONNECTED heartbeat that the barrier already renews (:322-344) plus live transport. It must not be inferred from time.
  - Memory `formation-systemic-generators-2026-11-11` warns against time-inferred liveness.
- **Owners touched.** Remove safety (`priority-publication-safety-topology.js`, `operation-workflow-remove-safety-evaluator.js`) and the placement predicate (`startup-authority-placement-eligibility.js`).
- **Deletes.** After C1 holds, the handoff has no remaining job. The barrier releases on raw READY, so the about 2,250 handoff lines can be deleted.
- **Risk.**
  - It reverses part of `ab55403b6` (committed node authority for removal safety). Its rationale must be read and preserved: it was about not trusting cache-inferred readiness.
  - The ledger interlock still serialises self-moves, so formation is slow.
  - It keeps two notions of "joined" (pre-READY placement target, READY), which B removes.

### C2. Capture only on non-vacuous readiness

**Rule.** The admission predicate must evaluate the authority with the cohort counted.

On its own this makes the handoff never capture in three-node formation. It is useful only as a diagnostic that **every** current release is vacuous (section 3). **Not a repair.**

### C3. A barrier cohort generation owned by the joiners' engagement

**Rule.** The seed captures a generation at the moment the barrier would engage, defined as >= 2 pre-READY candidates. It releases the generation whenever the authority's non-cohort facts are READY.

This is A with a different trigger. It is listed so it can be rejected: it adds a second engagement owner.

### My choice: B

**Why.** It is the only option that makes READY and spread acyclic by construction. It deletes the most mechanism. It matches what every passing run already does. It aligns with the binding READY-owner ruling.

**Bounded alternative.** If the owner wants the smallest bounded repair first, choose C1. It removes the cycle edge without timing, restores the barrier's stated purpose, and makes the handoff deletable as a follow-up.

**What would falsify B.**
1. A census showing that some consumer other than the cluster-ACTIVE / schema-admission observable and ordinary placement depends on "pre-spread joiners have no READY lease" for *safety*, not liveness. For example, a routing, leadership, or SQL-transaction coordinator choice that would be unsafe on a READY node without ledger spread.
2. A run under B where the relocated cluster gate is green while the ledger quorum is concentrated. That would mean the gate is mis-owned.
3. The section 10 test failing under B for any arrival order.

**What would falsify C1.** Evidence that the CONNECTED heartbeat plus live transport is not a sufficient liveness fence for a quorum floor. For example, a run where a joiner counted by the floor dies before READY and the ledger loses quorum.

**What would falsify A.** A blocked-partition gap where attribution to the cohort is ambiguous: a partition missing holders on both a cohort member and a READY non-cohort node.

---

## 10. A deterministic reproducer

### Property

**Every admitted joiner is eventually released (publishes its READY lease) without any timer expiring.**
- "Timer" covers the barrier timeout (120 s), the discovery window (5 s), rebalancer gate delays, `priorityRetryDelay` and the owner-membership driver interval.
- Virtual time is frozen.
- Progress comes only from evaluations triggered by evidence changes and explicit "tick once" calls that do **not** advance any deadline.

### Composition (real owners; no stub that shares logic under test)

- **The seed's readiness service:**
  - the real `ControlPlaneReadinessService`, through `test/helpers/readiness-service-fixture.js`;
  - the real `FormationReleaseHandoffClosureOwner` and `FormationReleaseHandoffPublicationCoordinator`, against an in-memory `controlPlanePublicationsOwner` with durable read-back;
  - virtual time through the readiness `timeSource` seam (`control-plane-readiness-participation-base.js` DT4 seam).
- **The seed's membership coordinator:** the real `MembershipPublicationCoordinator`, with `deriveClusterMembershipCandidate` driven by explicit `driveOwnerMembershipReconcile()` calls rather than the 5 s interval.
- **Joiners:** real `NodeJoiningReadySignalReadiness`, calling `awaitOperationLedgerFormationBarrier`, with the injected `sleep` resolving immediately and a frozen `now`. Each reads the seed's published contract through the real consumer path.
- **Seed rebalancer:** real `UnifiedRebalancer` and `RebalanceCoordinator` for `replica_operations-p1` and one at-target SQL partition, so that c3 and c4 are both exercised.

### Script for the losing order

1. **Epoch 1.** The seed alone is published. The authority is READY with spread satisfied. j1 registers as JOINING and CONNECTED. Read the authority on the seed -> expect capture (ACTIVE) and acknowledgement.
2. **Make j1 recovery-active and unpublished** (`missingPublishedCount = 1`). Read the authority -> expect REVOKED `startup_authority_incompatible`. *This step also pins down section 3's open question: assert which path revoked.*
3. **j2 registers.** Run **one** derivation with both joiners eligible. Publish epoch 2 containing both; acknowledgements pending, then acknowledged.
4. **Expect the authority to read** `recovery_pending ['priority_partitions_not_spread']`.
5. **Start both joiner barriers.** Expect both to reach `waiting_for_startup_authority` (engaged).
6. **Drive the seed rebalancer.**
   - Expect ADDs to j1 to be admitted (pre-READY placement).
   - Expect the `replica_operations` REPLACE to defer `replace_remove_safety_blocked`.
   - Expect the other priority ADDs to be refused with `operation_ledger_self_move_in_flight`.
7. **Repeat evaluation rounds** (authority read, rebalancer pass, joiner poll, membership drive) until a fixpoint: two consecutive rounds with identical evidence.
8. **Assert** that both joiners released. On today's code this is red, deterministically.

### Negative control (same file)

In step 3, publish j1 alone first (epoch 3), read the authority, and only then add j2. Expect green on today's code. This proves the test discriminates on order, not on setup.

### Order sweep

Enumerate the interleavings of {revoke, derivation(j1), derivation(j2), derivation(j1,j2), authority read} over a bounded depth. A correct repair is green for **all** of them. Today's code is red exactly for the orders with no authority read between "j1 published" and "j2 counted".

### What it must print when red

- For each joiner:
  - barrier state;
  - `barrierEngaged`;
  - `startupAuthorityState`;
  - recovery reason codes;
  - handoff state, generation and `releaseAuthorized`.
- For the closure owner:
  - `generation`;
  - `terminalGeneration` (cohort signature and epoch);
  - `successorCapture.state`;
  - the last `captureAdmitted` inputs: `ready`, `state`, `prioritySpreadSatisfied`, `publicationEpoch`, the cohort signature;
  - which d1 conjunct refused.
- The authority's `canonicalStartupNodeIds`, eligible node ids and blocked partitions with their missing holders.
- For each priority partition: the planner gate decision, the admission reason, and any remove-safety deferral with projected/minimum counts and the node ids excluded from the floor.
- The cycle witness: the list of edges (a1...c4) whose guard is currently false, each with the code location.

### Where to build it

- **Primary base: `test/convergence/dt-formation-priority-placement-before-active.test.js`.** It already composes `NodeJoiningReadySignalReadiness`, `UnifiedRebalancer` and a replace witness; this comes from a sub-reading and I did not open the file.
- **Fixtures:**
  - `test/control-plane/formation-release-handoff-closure.test.js` and `formation-release-handoff-witness-fixture.js` for authority snapshots;
  - `test/rebalancer/formation-barrier-spread-cure-lane-discrimination.test.js` (READY nodes plus barrier-held joiners);
  - `test/rebalancer/quorum-conditioned-remove-safety*.test.js` for the floor.
- **Runner:** `npm run test:file -- <file>` (`package.json:50-63`). Tests use tap.
- **Placement:** heavy runs go to the lab (memory rules).

### The formation simulator cannot express it today

`test/simulation/formation-sim-runner.js` and `formation-sim-node-hosts.js` host the real readiness service (and with it the closure owner), the membership coordinator and the rebalancers. But:
- it does not host bootstrap or the join path;
- the `formation-sim-production-*` line mounts a real `BootstrapService` only on the seed, and joiners are bare environments;
- no simulator file references `NodeJoining*` or the barrier.

These points come from a sub-reading [V-code there; not re-opened by me]. Extending the simulator would need the real join path mounted on the joiners. The owner rule is that "simulator quests never touch src", so that work belongs to a separate simulator quest.

---

## What I could not determine

1. **Which `startup_authority_incompatible` path revoked gen-1, and which reason codes the authority carried at that instant**, in any run. The publication-pending mechanism in section 3 is inferred. The closure owner logs neither refused captures nor revoke inputs.
2. **The exact eligible node set behind `requiredDistinctNodeCount`** at epoch 1 and epoch 3 in the passing runs. That is why epoch-3 READY is "vacuous" only as an inference.
3. **Whether the pre-`ab55403b6` floor carve-out actually counted a JOINING joiner with no lease.** Its own test was `isNodeActiveWithCurrentLease`. So I cannot say whether `ab55403b6` *introduced* the permanent c3 edge or only removed a carve-out that never fired.
4. **Why the failed seed's derivation added the joiners to the projection at once but published them one per drive** (epoch 2 at 11.8 s, epoch 3 by 15.1 s), while the passing seed went 1 -> 3 -> 4 -> 5 within one drive. The reconcile step durations are not logged.
5. **What the 1.7 s pre-derivation latency and the 7.4 s reconcile on the failed seed waited on.**
6. **Who owns the client-facing "cluster ACTIVE / schema admission open" decision**, beyond the harness probe (`cluster-class-publication-evidence.js:308`), and which runtime consumers besides ordinary placement read joiner READY as "safe to use". Repair B needs this census.
7. **The original reason for the `terminalGeneration` refusal.** No log entry states it; section 4(ii) gives the inferred purpose.
8. **Whether the REPLACE path has a `priorityRecoveryCompletionSafe` exemption that could have applied here.** The evaluator (:663-669) consults it, but I did not trace its inputs.
9. **The passing runs' exact `Signaled readiness` to `replica_operations` spread chronology for 9991 and ed708.** Only f3aa2f08 was checked.
