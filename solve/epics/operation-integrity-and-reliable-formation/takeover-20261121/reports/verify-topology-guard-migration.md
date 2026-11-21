# Verification: topology-guard consumer migration onto the SERVICES owner fact

Verifier: independent, read-only, 2026-11-21. Subject: `work/topology-guard-owner-fact-20261121`
at 017921e1708b2801c57e299d5d3ea44ed7dee886, consumer migration only
(`git diff 855e4249d 017921e17 -- src test`; the owner-fact read is judged elsewhere).
Loaded: `CLAUDE.md`, `docs/steering/rules.md` (R01-R27, last_reviewed 2026-11-13), the author's record,
`pgwire-placement-refusal.md`, the sealed invariant, the lab directories. `router.md` not consulted.
Nothing was executed here; lab files were read only.
Marking: **[V]** read in code at 017921e17 or in a lab file, **[X]** executed by the author on the lab
and confirmed by me in the lab output, **[I]** inferred.

## Verdict

**APPROVE-WITH-CONDITIONS** for merging the consumer migration after the owner-fact read's corrective
round is merged and `readEntityServiceRowsOwnerFact` is adapted.

- The executed defect is repaired at fixture level: red at 625381bd6 / 582d197bc, green at 017921e17 [X].
- No path was found by which follower, cache or default-`[]` rows are used as data by the guard, the
  allocator, the recent-target lease or the hold's count [V]. Two cache-derived inputs remain inside
  migrated consumers (finding 4); both predate the branch.
- No consumer was found that can be left deferred without a wake, or that can spin [V].
- The conditions are about what is not yet shown: the sealed results the branch reverses have no
  in-repository supersession (finding 2), the guard's own decision table is asserted green almost nowhere
  (finding 3), and the liveness of the deleted escapes on a real cluster is unproven (finding 1).

## Conditions

Before merge:
1. Owner-fact corrective round merged; the adapter adapted in `src/rebalancer/entity-service-row-read.js`
   only (record 10.6); the `servicesOwnerFact` double of the sealed evidence test adapted; the nine witness
   files and the sealed evidence test re-run green on the lab at the merged sha.
2. An explicit supersession record in the repository for the sealed results this branch reverses
   (finding 2), and the lead's amendment or ruling on the invariant's named guard verdict.
3. `test/rebalancer/rebalance-coordinator-topology-guard.test.js` repaired so its cases reach the guard
   (finding 3), or an equivalent green assertion of the count rule, the REPLACE-occupied rule and the
   hold's alive-guard and cure exemption under the owner fact.

Before the three-node acceptance run:
4. The planner node's log must show why a create was deferred for every deferral, including the
   allocator's (finding 6). Capture on the planner node: guard deferrals with
   `authoritativeReasonCode`, `services_inventory_unavailable` skips, the hold's "hold open" info line,
   and `NO_HANDLER_FOR_PARTITION` warnings for `services-p1`.
5. Pass criterion stated in advance: PG-wire placed within the harness's 120 s poll; any
   `replica_inventory_unavailable` run longer than about 35 s is explained by a logged cause, not
   accepted as noise (finding 8).
6. The carried residuals recorded as open, not closed: stale-complete inventory at floor 0 (finding 7),
   the deleted escapes' liveness (finding 1), the address-quarantine clock (finding 8).

## Findings

### 1. The hold's sealed fail-open is kept to the letter, but the guard behind it now defers the same create [V code, I consequence]

- `holdCriticalPartitionCreateLaneIfOverTarget` returns on an UNAVAILABLE fact
  (`rebalance-coordinator-priority-budget-admission.js:228-233`). The same create then reaches
  `ensureCreateTopologyGuardAllowed` (`rebalance-coordinator-operation-creation.js:431-432`), which reads
  the same owner fact and defers (`rebalance-coordinator-topology-guard-methods.js:240-243`).
- Before this branch the guard's `isEngagedPrioritySpreadCureMove` admitted exactly the cure ADD the hold
  exempts, from the cache/operation union, when the read was unavailable. The deleted comment in the hold
  said so ("the same conjunct isEngagedPrioritySpreadCureMove already encodes one step later").
- Minimal schedule: priority partition over target with co-located replicas; the planner retains its one
  spread-cure ADD and yields the surplus REMOVE to it; the SERVICES owner fact is UNAVAILABLE. The hold
  opens, the guard defers `replica_inventory_unavailable`, the drain waits. This is the stranded drain
  the sealed sentence names as G1, now produced by the guard for as long as the gap lasts.
- Bounded by the gap when the gap is exogenous (election: seconds; address quarantine: 30 s). It is a
  deadlock only if the gap is caused by the uncured state. I found no such dependency for `services-p1`
  itself (a concentrated but alive group has a leader) [I]. The read still passes the pressure governor
  (`control-plane-system-table-gateway-read-dispatch.js:112-131`), as the old read did [V].
- The recorded stalls the escapes were added for (2026-07-18, run-22) never established why the read was
  unavailable (PG-wire report 5a). So "the owner fact is available whenever the cure is needed" is not
  demonstrated on a cluster. The restated stall tests assert the new behaviour (nothing admitted during
  the outage, the cure on the first cycle after the owner answers), green at 017921e17 [X].

### 2. Sealed results are reversed with no supersession record in the repository [V]

- Commit 494c71ec1 (quest `spread-cure-union-escape-and-monotone-gate`) seals: a priority partition at
  target with co-located replicas and "an UNAVAILABLE authoritative services read receives an admitted
  spread-restoring operation within one evaluation cycle". The branch makes that false by design.
  The ledger-escape quests listed in the PG-wire report 5a are reversed the same way.
- The only record is a header sentence in `critical-spread-terminal-stall-repro.test.js` ("Superseded by
  the lead's ruling of 2026-11-21") and the takeover report, which is outside the repository.
  `git diff --stat 855e4249d 017921e17 -- . ':!src' ':!test'` shows one generated inventory file: no quest
  record, no contract change.
- The sealed invariant `failed-authoritative-read-admission-verdict` names "the topology guard's
  replica_inventory_unusable denial" as the guard's verdict on a failed read
  (`architecture/contracts/invariants.json:439`). At head a failed SERVICES read gives
  `replica_inventory_unavailable`, DEFERRED; `replica_inventory_unusable` is now the verdict for a failed
  operation read under a READY fact. The formal predicate (defer or deny) still holds; the named verdict
  does not. R09 asks for supersession, not rereading.
- The evidence test itself was not weakened against 23344cddc: the fail-open row, its red-on-revert
  row, the at-target row and the conflict-lane row keep their assertions; only the double changed from
  `getAuthoritativeEntityServiceRows: async () => []` to an UNAVAILABLE fact issued by the production
  `readOwnerFact`; two guard rows were added. 18 assertions green at 017921e17 [X].

### 3. The guard's decision table is barely asserted green [X + V]

`rebalance-coordinator-topology-guard.test.js` is red at 582d197bc and at 017921e17. Its
`createOperation` cases stop at the add-like lane's `entity_operation_observation_incomplete` deferral and
never reach the guard (the diagnostic line in the head log confirms it). Assertion count 105 -> 85.

| Guard behaviour | Asserted green at 017921e17 | Where |
| --- | --- | --- |
| ALLOWED on a READY fact from a follower host | yes | reproduction contracts, W1, anchor (a) |
| DEFERRED `replica_inventory_unavailable` with reason | yes | W2, W3, election-log, anchor (b), evidence-test row, the restated ledger case (direct snapshot, 7 moves) |
| TARGET_NODE_OCCUPIED from the leader's rows | yes | anchor (c), read-point witness |
| BLOCKED `replica_inventory_unusable` on a deferred operation read | yes | evidence-test row |
| Cure admitted after the owner answers ([A,A,B], [A,A,A,B]) | yes | stall repro |
| TARGET_REPLICA_COUNT_SATISFIED | **no** (unit cases red) | |
| REPLACE onto an occupied node; message-group occupancy; orphan census | **no** (red) | |
| Hold: alive-guard, cure exemption, dedupe (unit cases) | **no** (red); the exemption is exercised only through the [A,A,A,B] stall repro | |
| A cache-only occupant refuses; `target_unavailable` under a READY fact | **no** | |
| The unit assertion of the new deferral ("no decision: a deferral") | **no**: NEW red in that file, same first cause | |

Also deleted with the escape case, although they passed at the base: the eight-owner loop asserting
`target_unavailable` precedence and `resolvePrioritySurplusRemoveFenceTargetReplicaCount(...) === null`
(the surplus REMOVE fence, a consumer this branch does not migrate).

### 4. Cache-derived inputs that still grant inside migrated consumers [V], pre-existing

- Retired-source check: `isEngagedLedgerQuorumSpreadCureReplace`
  (`rebalance-coordinator-replica-identity-methods.js:294-309`) takes the source replica's node from
  `cache.filter(SERVICES, ...)` and the concentration from the cache, and exempts a ledger REPLACE from
  the recent-self-move lease (`:336-343`). A projection row decides an exemption. Not in the author's
  census (C2 lists only the owner read).
- Over-target hold: the count's rows are the owner fact's, but `isNodeReadyForRouting(nodeId)` (`:259`)
  is the node's readiness projection and removes replicas from the count, which releases the hold.
  Documented alive-guard; "nothing is counted from the cache" is true of rows only.
- Guard: `mergeEntityServiceRows` (`rebalance-coordinator-operation-read-methods.js:596-628`) lets the
  owner row win per replica id and keeps cache-only rows, so the projection can only add an occupant [V].

### 5. The hint adapter is not the production address-book path [V]

- Partition and runtime service are placement-managed
  (`rebalance-coordinator-operation-creation-support.js:80-83`), so a production partition create leaves
  `createOperationInternal` at `:443-448` and never reaches `buildOperationBootstrapTopology`.
- The production address book is read in the workflow:
  `operation-workflow-replace-target-binding.js:131-136` calls `buildCommittedBootstrapTopology` with
  `readServiceRowsForBootstrap` (`:48-56`), a raw `systemTableCache.filter`, not `readHint`.
- So "one hint adapter serves the partition bootstrap address book" holds only for compositions without
  the placement factory. Two readers of the same address book remain. Same for the allocator calls at
  `rebalance-coordinator-operation-creation.js:521, 532`.
- Semantics are otherwise as claimed: `bootstrapAddressBook`
  (`committed-membership-bootstrap-read.js:178-197`) names only stamp-listed replicas and skips a missing
  row; no reader of the addresses under `src/node`, `src/partition`, `src/raft` (grep). A hint cannot be
  passed where a fact is required: `ownerFactRows` checks a private brand
  (`control-plane-owner-fact-read.js:268-273`).

### 6. Typed deferrals lose the read's reason in the planner's log [V]

`buildCoordinatorCreationErrorResult` (`unified-rebalancer-move-execution.js:128-135`) forwards only
`rebalanceSkipReason` and `admissionResult`. The guard's deferral carries its reason inside
`admissionResult.topologySnapshot`. The allocator's, the retired-source check's and the hint's
`services_inventory_unavailable` errors carry it in `error.reasonCode` and the message, which are dropped.
On the PG-wire path the allocator reads the fact a second time after the guard admitted
(`rebalance-coordinator-operation-creation-support.js:447-455`); a deferral there logs no cause. This is
the same class of gap the PG-wire report named ("the missing log fields").

### 7. Stale-but-complete inventory at floor 0: per consumer [V fences, I residual]

A current leader cannot miss a committed registration (the read requires its election log and commit
applied), so staleness needs a deposed leader that still answers: the read's own residual.

| Consumer | Decision a missing or stale row changes | Fence on the effect | Residual |
| --- | --- | --- | --- |
| Guard | missing occupant admits a second replica on the node | PARTITION_BUSY only while the earlier op is incomplete (`partition-placement-admission-decision.js:220-222`); runtime claim key passes with a new id | **open, bounded** by the deposed-leader window; needs the planner's projection stale too |
| Allocator | unseen id reused | union with the ledger's entity operations (`...-replica-identity-methods.js:112-133`); runtime claim key claimed once (`...-admission-decision.js:183-190`) | closed for ledger-created ids |
| Retired-source lease | a stale FAILED row releases the lease | PARTITION_BUSY; REMOVE safety on the strict readers | bounded (churn, not occupancy) |
| Hold | undercount releases | the conflict lane; the guard's count rule for ADD | bounded; a hold, sealed fail-open |

Nothing re-checks SERVICES at apply. The author says the same (record 3, 4.4, 9.4).

### 8. Address quarantine: mechanism and numbers verified; frequency in a formation not determinable [V, I]

- Host clock: `Date.now()` at `query-executor-temporary-unroutable-addresses.js:28-29` and `:132` [V].
- Only a NO_HANDLER outcome marks an address (`query-executor-partition-delivery.js:581-599, 681-695`
  -> `query-executor-partition-candidate-state.js:172-186`) [V].
- Duration for a system-table partition: 30 s (`:150-166`, `query-constants.js:474-475`) [V].
- A quarantined address is neither a candidate nor a redirect target (`candidate-state.js:18-22, 45-50`)
  [V]. That it makes the owner-fact read UNAVAILABLE is executed: W2 red at 807652bae for this cause [X].
- Up to about 35 s late: 30 s plus one 5 s priority turn (`rebalancer-planning-gate-methods.js:751-760`).
- When it happens [I]: the planner node's executor delivered to a `services-p1` replica address before
  that replica's handler existed or after it was removed, and that address is the leader within 30 s.
  A formation moves `services-p1` replicas onto joiners (GCP run: leader moved to a `replace-replica-…`
  14 s after the scale request), so it is plausible there, but not inherent to every fresh cluster.
  The earlier GCP logs cannot show it: the old read never left the planner node.
- A leader that keeps answering NO_HANDLER renews the mark; an early clear needs a changed service
  fingerprint (`:117-131`) or a successful route (`query-executor-partition-failure.js:224`).

### 9. Smaller items [V]

- `getRetiredReplaceSourceMoveSafetyError` runs before the dedupe read
  (`rebalance-coordinator-operation-creation.js:383-392` before `:396`). During a read gap an identical
  re-request of an existing REPLACE is refused instead of returning the existing operation. Retried.
- Up to three owner-fact reads per create (hold, guard, allocator), each at its own read point and
  deadline. With an unreachable leader the hold's read and the guard's read both spend the timeout.
- Anchor (b) was relaxed to "no hop reached the leader (refused, or its address quarantined)", which
  zero hops satisfy. The read-point witness accepts a deferral or `target_node_already_occupied`.
- The REPLACE-binding witness was green at its first run: a characterisation, not a red-first witness.
- W2 keeps a 500 ms real-time wait (record 10.4).

## Per consumer: rows, unavailable outcome, wake

| Consumer | Rows that reach the decision | On UNAVAILABLE | What re-evaluates it |
| --- | --- | --- | --- |
| Guard (`...-topology-guard-methods.js:230-249`) | owner fact; projection only adds | DEFERRED `replica_inventory_unavailable`, reason, `nextAction: retry` (`:408-429`) | planner's scheduled turn: skipped move (`unified-rebalancer-move-execution.js:128-145`) -> `advanceCheckCadence` (`rebalancer-planning-gate-methods.js:651-673`) -> `scheduleNextCheck` (`:57-87`, minimum 1 s) |
| Allocator (`...-replica-identity-methods.js:399-461`) | owner fact + projection + ledger ids (all only add) | throws `services_inventory_unavailable`, `deferRetry` (`...-operation-read-methods.js:513-522`); no id | planner turn; workflow REPLACE binding: `runOperationOwnerAction` -> `deferTransitionRetry` (`operation-workflow-transition-retry.js:163-237`, timer with a delay; `deferRetry` retryable at `control-plane-error-classification.js:246-251`), witnessed [X] |
| Retired-source lease (`:364-397`) | owner fact only; an absent row keeps the lease | same typed throw | planner turn |
| Hold (`...-priority-budget-admission.js:222-234`) | owner fact; READY empty returns | fails open, info line | nothing persists; evaluated per create. Released by the drain REMOVE (never in this lane), the cure exemption, a not-ready node, or a read gap |
| Address book (`...-operation-creation.js:342-348`) | projection (hint) | typed throw if the projection read throws | planner turn (non-production path, finding 5) |

- Who consumes the guard's deferral: only the planner; `enforceConcurrentOperationBudget` is set at
  `unified-rebalancer-move-execution.js:65` and nowhere else. It becomes a skipped move: not a failed
  operation, not a success. No code branches on the two reason strings or on `nextAction` (grep).
- Formation: the guard, the hold and the retired-source check run only on unified-rebalancer creates.
  Formation partition placements go through `ReplicaPlacementOwner` and the ledger admission (PG-wire
  report section 4: 138 placements, zero planner moves for partitions). So the earliest formation steps
  never depended on the escapes [V code, X that run]. On a single seed the fact is answered in process
  by the seed's own leader (anchor (a)) [X].
- Deleted pieces: `getAuthoritativeEntityServiceRows` has no caller (`git grep -w`); `createOperation`
  on the coordinator has exactly two production callers
  (`unified-rebalancer-move-execution.js:312`, `sql-query-engine-provisioning-admission-methods.js:498`),
  neither makes a message-group ADD or REPLACE [V].

## Evidence confirmed from the lab files

| Run (sha in the log name) | Files, pass, fail | Confirms |
| --- | --- | --- |
| `guard-stage1-red-625381bd6` | 3, 0, 3 | reproduction, W1-W3, siblings red before |
| `guard-stage2-red-582d197bc` | 10, 5, 5 | election-log, read-point, retired-source (both cases), address book, hold, allocator red; owner-fact files green |
| `guard-cone-base-582d197bc` | 119, 92, 27 | base cone |
| `guard-stage2-green-807652bae` | 136, 104, 32 | six new reds as the record lists (three doubles, W2, anchor (b), read-point) |
| `guard-residual-7f85d7f0b` | 1, 0, 1 | `t.notEqual is not a function` only |
| `guard-stage2-final-6d1237341` | 15, 12, 3 | witnesses green; two doubles and the guard unit file red |
| `guard-stage2-final2-4da9da27a` | 9, 8, 1 | `committed-membership-stamp` red |
| `guard-stage2-harness-d6fa64092` | 11, 11, 0 | all green |
| `guard2-final-017921e17` | 139, 112, 27 | head cone |

- Head cone: 26 reds are red at the base; one (`committed-membership-census`) is not in the base
  selection. Confirmed from `test-results.ndjson` of both runs.
- `attribute.py` compares failing assertion titles only. I compared the whole per-file output after
  normalising times, paths, pids and ids: 11 of the 26 are identical, including the surplus REMOVE fence
  file; the other 15 differ, in the lines I sampled, only by worktree path, pid, duration, line number
  or log interleaving. Not inspected line by line.
- Green files print no case names in the run log, so green-after is confirmed per file and assertion
  count, not per case: reproduction 57, owner-fact inventory 25, read point 11, siblings 35, deposed
  leader 4, binding 18, evidence test 18.
- Not established by any run: a three-node cluster, the F1 window of the read, the count rule.
