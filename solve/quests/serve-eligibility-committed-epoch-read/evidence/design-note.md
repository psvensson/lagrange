---
audience: evidence
documentClass: planning
recorded: 2026-11-02
quest: serve-eligibility-committed-epoch-read
---

# Design note: serve eligibility from a committed epoch read (Group A: C5, C6, C7, C11, C12 input)

Template: `docs/development/verification-templates/design-note-template.md`. Base HEAD `df28ef54a`
(`origin/work/learner-committed-admission-rebase-20261102`, PR #184 head). `src/` is byte-identical to the census
HEAD `b26d2c090` (`git diff --stat b26d2c090 HEAD -- src` is empty), so every census line number holds; the
spot checks below were re-read on this HEAD. Status: DESIGN ONLY. No `src/` change, no `solve start`. The lead
answers the decisions in section 9 before any source change.

Labels: **[S]** source-established on this HEAD; **[C]** contract or record analysis; **[H]** hypothesis.

## 1. Claim, scope, current evidence

**Invariant.** A decision that grants serving, placement, provisioning or planning progress on a node consumes
one owner's answer derived from committed facts at a stated epoch, or a typed unavailability. A projection may
trigger a refresh; it never grants (`architecture/contracts/authority-and-recovery.md:110-114`), and recovery
must not depend on the condition it restores (`:118-127`).

**Failing witness.** `fresh-formation-user-table-routability` predicate (a): the serve lane never opens on a
fresh three-node formation (analysis section 1 consequence chain; learner quest log: still red after C2/C3 for
C1/C10 plus this group).

**Repair claim (bounded).** One owner answer for per-node serve eligibility; every Group A consumer rewritten to
consume it (or the committed lease it is built from); the alternate paths deleted. Distinct from: the
scenario milestone (needs C1/C10 from Stream B too) and release acceptance.

**Observed vs inferred.**
- [S] The serve lane is `runtimeServeEligible && publication stream ready && !priorityRecoveryActive`
  (`control-plane/projection-readiness-decision.js:63-90`); `runtimeServeEligible = repairEligible && loadReady
  && transportNotExplicitlyNegative && serveEligibleControlPlaneService`
  (`control-plane-readiness-diagnostics-eligibility.js:251-280`). All row inputs come from `SystemTableCache`
  (`control-plane-readiness-node-service-rows.js:114-160`; `control-plane-readiness-service-node-methods.js:29-33,
  296-399`). The authoritative read exists only behind `allowAuthoritativeRefresh === true` and falls back to the
  cache on failure (`node-service-rows.js:29-53, 83-112`).
- [S] Every heartbeat bumps the NODES table version, which rotates the planning token; `readSync` then returns
  the all-false placeholder `buildMemoizedDeferredSnapshot` with `planning_snapshot_refresh_pending`
  (`readiness-planning-snapshot-owner.js:543-572,603-614`; `readiness-planning-publication-contract.js:375-421`).
  The critical-topology settle reads `controlPlaneRecoveryEligible` from that placeholder and reports
  `node_ready_lease_incomplete` while the lease is current (`unified-rebalancer-critical-topology-methods.js:66-83,
  162-171`). The reason name is therefore misleading: it is "the projection was rebuilding", not a lease fact.
- [S] Circularity, the root of the carve-outs. (1) The authoritative read of `control_plane_publications` itself
  routes through query routing on the `CONTROL_PLANE_RECOVERY_ELIGIBLE` readiness dimension
  (`control-plane/owners/control-plane-publications-owner.js:16-26,48-55`;
  `cdc/cdc-integration-service-owner-rpc-read-execution.js:382-385`), i.e. reading the fact that opens readiness
  requires readiness. The fail-open (`query-executor-partition-routing-snapshot.js:63-115`) and the priority
  bootstrap bypass (`query-executor-priority-recovery-bootstrap-routing.js:15-89`) exist to break exactly this.
  (2) Membership publication planning gates a node's publication on `serveEligible !== false`
  (`membership-publication-priority-partition-readiness-data.js:66-77`), while serve eligibility requires the
  publication to be ready. The `!== false` default is what lets a never-evaluated node through. (3) The rebalancer
  defers non-priority system planning on `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
  (`unified-rebalancer-local-serve-readiness.js:81-93,127-157`), which clears only when priority spread completes,
  which is rebalancer work [H for the full loop; each edge S].
- [S] The 75 s / 120 s deferrals are scheduler backoff, not readiness durations (section 6).

**First discriminating check (before attempt 1).** On a lab formation, log per node at each routing denial the
committed `nodes` row and latest published publication read on the leaders beside the projection's answer.
Prediction: denials with a current committed lease and the node in `published_active_node_ids`. This is the
analysis's H1-style observation for C5; it is recorded as the red receipt input, not as a new harness path.

## 2. The one owner read

**Owner.** `ControlPlaneReadinessService` (the existing readiness owner, R01; no new service). New module
`src/control-plane/serve-eligibility-owner.js` mixed into it, holding the epoch memo. Public surface:

```
readServeEligibility(nodeIds, {deadlineMs})      // async: committed read, refreshes the memo, answers
answerServeEligibility(nodeId, {nowMs})          // sync: answers from the memo only
answerServeCohort(nodeIds, {nowMs})              // sync: per-member answers + eligibleNodeIds + epoch
subscribeServeEligibility(listener)              // completion event (R14 pattern of the Q6 record)
```

Answer shape (frozen, R07/R08):

```
{state: 'ready',  decision: 'eligible'|'not_eligible', reasons: [...], epoch, leaseExpiresAtMs}
{state: 'unavailable', reason: 'unavailable_stale'|'committed_read_failed'|'no_committed_record'
                               |'owner_stopped', epoch|null, retryAfterMs}
```

`epoch = {publicationEpoch, publicationId, readAtMs}`. `ready/not_eligible` is a committed negative; only
`unavailable` is "do not know". There is no third, quieter value.

**What "committed read" means on this code.**
- Gateway: the control-plane system-table gateway `executeRead` with `strategy:
  CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED`
  (`control-plane-system-table-gateway-constants.js:97-103`; dispatch `-read-dispatch.js:141`), read authority
  `authoritativeReadMode: OWNER_RPC_REQUIRED` and `leaderMode: REQUIRED`
  (`-read-contracts.js:152-200`; constants `:120-124`). Effect [S]: no SQL fallback
  (`-read-strategies.js:369`), no `any_replica` local fallback, failure outcome `STALE_NOT_ALLOWED`
  (`:296-299`), and the answer is rejected unless the serving replica returns a leader witness
  `{role: leader, partitionId, servingNodeId, servingReplicaId, term, observedAtMs}`
  (`cdc/cdc-integration-service-owner-rpc-read-execution.js:65-84`;
  `partition/partition-service-remote-query-methods.js:164-184`;
  `control-plane/control-plane-authoritative-read-witness.js`). Same shape as the existing users
  `message-group-forwarding-owner-delivery-methods.js:151,166,200` and
  `admin-service-discovery-readiness-context-methods.js:432`.
- Rows: `nodes` (all rows; fields `node_id, status, boot_incarnation, ready_lease_expires_at, last_heartbeat`,
  load columns; schema `bootstrap/system-table-core-schema-definitions.js:140-170`) and
  `control_plane_publications` (latest row with `status` PUBLISHED of the membership kind; fields
  `publication_epoch, publication_id, published_active_node_ids, required_ack_node_ids, acknowledged_node_ids,
  priority_partition_summary`; schema `system-table-runtime-schema-definitions.js:21-52`).
- Epoch field: `control_plane_publications.publication_epoch` of that row, with its `publication_id`.
- Precision limit [S]: raft-rs exports no ReadIndex (`raft/raft-rs-ingress-constants.js:45`); the leader read is
  a leader-local read with a role witness, the strongest read this code offers. A deposed leader that has not
  stepped down can answer; the lease bound below limits how long such an answer can grant. Recorded, not fixed.
- Routing of the read itself: the read routes as a **system-table read on leadership** (section 3.2), not on a
  readiness dimension. This is what removes the circularity; without it the owner read would need the bypass it
  is meant to delete.

**Decision at epoch E for node N** (pure function of the two committed reads plus the clock):
`eligible` iff `nodes[N].status = active` and `ready_lease_expires_at > nowMs` and N in
`published_active_node_ids(E)` and publication E acknowledged (`acknowledged ⊇ required_ack`) and
`priority_partition_summary(E)` states the priority partitions spread. Otherwise `not_eligible` with the
failing facts as reasons (reuse existing reason constants where they name the same fact: e.g.
`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, `publication_stream_not_ready`; a lease reason named for the lease).
Not inputs any more: the planning placeholder, cached service rows, `serveEligibleControlPlaneService` (its
empty-rows-means-true default, `node-service-rows.js:232-243`, is deleted), and the timed-out-reporter
preservation. Live transport to N is a per-request routing condition of the router (a refused connection is a
typed transport error), not part of eligibility.

**Memo keyed by epoch.** One record `{epoch, byNodeId, leaseExpiresAtMs per node}` per process. The sync answer
is `ready` iff the record exists, no trigger has marked it superseded, and for a positive the node's committed
lease is unexpired. It is `unavailable_stale{epoch, retryAfterMs}` when:
- a cache apply event shows a publication with a higher `publication_epoch` (trigger only), or
- a cache apply event shows a non-monotonic `nodes` change for a node in the record (status, boot incarnation,
  lease cleared or shortened). A lease *extension* does not invalidate: the committed lease at E is still true
  until its own expiry, so heartbeat churn does not rotate the memo (the Q6 record's "formation-hot key storm"
  objection, `readiness-observation-currency.md` section 5, does not arise), or
- a positive answer's lease has expired.
Each staleness enqueues one committed refresh (the existing `OwnerKeyReconcileQueue`,
`workflow/owner-key-reconcile-queue.js`; coalesced, one in flight). `retryAfterMs` is the owner's own stated
reconsideration time: the in-flight refresh's deadline. No new constant, no poll: waiters `await` the refresh
completion bounded by the caller's own deadline. A refresh is also armed at the earliest positive lease expiry
in the record (a legitimate trigger derived from the committed value, `authority-and-recovery.md:128-133`).

**Cached-view analysis (template section 3).** Authority: the two leader reads. Invalidation: the triggers
above. Stale-read behaviour: `unavailable_stale`, never the old decision. Recovery: refresh completion. A stale
observation cannot resurrect a closed answer (the record is replaced only by a newer committed read whose epoch
is >= the record's) and cannot permanently veto (any trigger or the lease-expiry arm refreshes; a failed read
answers `committed_read_failed` with the read deadline, and the next trigger refreshes).

## 3. Consumers rewritten

### 3.1 User-table routing (C5)
`query-executor-partition-service-resolution.js:180-338`: for user-table partitions the routability of a
service on N is `answerServeEligibility(N)`. `ready/eligible` routes; `ready/not_eligible` is
`NODE_NOT_ELIGIBLE` with the committed reasons; `unavailable` is a typed retryable routing refusal carrying
`{epoch, retryAfterMs}` (no candidate is admitted on it). Deleted on this path: the no-readiness-service
`routable: true` default (`:197-211`), `shouldAllowFreshBootstrapRoutingGrace` and
`isBootstrapRoutingGraceWindow` (`:296, :373-420`; it admits a service whose `SERVE_ELIGIBLE` failed, for any
partition including user tables, contrary to the reproducer constraint; **uncatalogued, R17 finding UA-1**,
0 test files name it), and the call to `shouldAllowPriorityRecoveryBootstrapRoutingGrace` (`:299`).

### 3.2 System-table routing (the fail-open and the bypass disappear without replacement)
System-table partitions route on raft leadership: the cached `leader_node_id` / service role is a *hint*
(analysis section 3(b): a projection may route when every use is validated by the target and a mismatch is a
typed error with retry to authority); the target validates by its leader witness (reads, `leaderMode
REQUIRED`) or answers the existing non-leader redirect (writes,
`partition-service-remote-query-methods.js:186-190`). No readiness dimension filters system-table candidates.
Deleted: the fail-open block and its inline evidence-absent set (`routing-snapshot.js:63-115`), the module
`query-executor-priority-recovery-bootstrap-routing.js` (exports `isPriorityRecoveryWriteRouting`,
`shouldAllowPriorityRecoveryBootstrapRoutingGrace`; only importer `service-resolution.js:9-10`, calls `:165,
:299`), the `ALLOW_PRIORITY_RECOVERY_BOOTSTRAP` routing option and the `PRIORITY_RECOVERY_BOOTSTRAP`
read-recovery lane (`control-plane-publications-owner.js:16-26`), and `CONTROL_PLANE_RECOVERY_ELIGIBLE` as a
*routing* dimension for system partitions. Shared surface with Group B (leader address resolution): this
attempt changes only how the query executor filters candidates, not `resolveLeaderAddress` or the partition's
peer resolution; recorded as a coordination point.

### 3.3 Provisioning (C6, with F10)
`sql-query-engine-provisioning-methods.js:155-225` takes one `answerServeCohort(allMembers)` after its last
await (Q6 S2 rule). If any member is `unavailable`, it awaits the owner's refresh bounded by the statement
deadline, then decides once. Outcomes (section 5). Deleted: `degradedFallbackNodeIds`/`usedDegradedFallback`
(`:184-207`), `getProvisioningNodeTrustViewSync` as a decision input (its cache trust view
`service-node-methods.js:362-399` stays only if a presentation consumer remains; else deleted),
`waitForProvisionTargetNodeIds`' `waitForCondition` poll and `TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS`
(`provision-target-methods.js:143-275`, `sql-query-engine-shared.js:170`), the FALLBACK_USED warn and reason
(`provision-target-methods.js:256-265,289-292`; `shared.js:166-169`), `TRANSIENT_PROVISIONING_SHORTFALL_REASONS`,
`AGGREGATE_TRANSIENT_PROVISIONING_SHORTFALL_REASONS`, `hasOnlyTransientProvisioningShortfall`,
`resolveProvisioningShortfallFallbackMinimum` (`provisioning-admission-methods.js:13-33,264-280`), the
`Math.max(1, ...)` under-planning (`initial-partition-provisioning.js:202-214,415-418,520-523`). Not touched:
`CACHE_VISIBILITY_TIMEOUT` retry classification (`shared.js:153-157`, Stream B, C1).

### 3.4 Rebalancer (C7, C11)
- Settle blocker: per-node readiness becomes the committed **lease** at E (`nodes` row read through the owner),
  not `controlPlaneRecoveryEligible` from the placeholder. `node_ready_lease_incomplete` is stated only when a
  committed lease is absent or expired; `unavailable` answers a typed defer naming the epoch. Deleted:
  `readCachedRows` for the decision (`critical-topology-methods.js:45-48,444`), the startup lease OR-bypass
  `shouldBypassLocalPriorityControlPlaneStartupReadiness` at `:57,:78-81` and `local-serve-readiness.js:99`
  (other readers: `unified-rebalancer-priority-readiness.js:659`, `bootstrap/phases/seed-partitions-phase.js:647`,
  producer `startup-recovery-coordinator.js:471,524`: the field is deleted only if those readers move too;
  decision D5).
- Available nodes (`unified-rebalancer-available-nodes.js:216-269`): placement eligibility reads the committed
  lease (placement must not require serve eligibility, which requires spread, which requires placement). Deleted:
  the formation carve-out `:250-265`, `isEvidenceAbsentReadinessDenialSnapshot` and the file
  `control-plane/readiness-denial-classification.js` (other caller `priority-publication-safety-topology.js:162`,
  Q6 row R12: migrates to the same lease read; residuals of R12 stay with the Q6 follow-up), the
  `systemTableCache.filter(NODES)` decision read `:218`.
- Local-serve defer (`local-serve-readiness.js:127-157`, gate `rebalancer-planning-gate-methods.js:485-508`):
  deleted. Non-priority system planning is not gated on the local node's serve lane (that lane waits on the
  spread this planner performs); the local node's committed lease is the precondition.
- `!== false` (`unified-rebalancer-control-plane-readiness-methods.js:81-96`, seven dimensions): replaced by the
  owner answer; absent is `unavailable`, never satisfied.
- C11 (`unified-rebalancer-shared.js:211-214`): one source. The in-flight blocker is computed from
  `getOperationsByEntity(..., {visibilityReadMode: OWNER_RPC_REQUIRED})` (`critical-topology-methods.js:389-436`)
  or answers `unavailable{reason}`. [S] today the cache answer *grants*: an empty cached set yields no blocker
  and is never revalidated (`:244-259, 655-666`); only a cache-positive is revalidated, and a revalidation error
  keeps the cache blocker (`:407-410`). Deleted: `CACHE` source, the constant, the cache read
  `collectCriticalSystemInFlightReplicaOperations` (`:607-647`), the keep-on-error branch. U23 (join-side analogue)
  is recorded for bootstrap, not absorbed.
- C12 (`partition-service-learner-promotion-count-check-methods.js:139-150`): [S] `readinessByNodeId` does not
  derive the overflow bound; it only sorts learners for `LEARNER_NEVER_PROMOTABLE` diagnostics
  (`priority-recovery-snapshot-burndown.js:382-430`; `priority-recovery-partition-assessment.js:143-171`); the bound
  is `learner-promotion-count-check.js:49-63,124-131`. The carried ADD authorization is decoded and logged only
  (`count-check-methods.js:246-303`). Repair: the readiness loop is deleted (or reads `answerServeEligibility` if
  the diagnostic stays; D6). Census unknown resolved.

### 3.5 Publication planning (Q6 Q18; prerequisite for deleting allowStaleOnCacheChange)
`membership-publication-priority-partition-readiness-data.js:66-77` drops `serveEligible` (a cycle: the output
cannot be an input) and decides publication on the committed lease and cluster membership; the other `!== false`
publication sites (`membership-publication-readiness-repair.js:82-83`, `-candidate-derivation.js:240-242`,
`-coordinator-reconcile.js:341`, `-target-selection.js:49-51`, `recovery-epoch-summary-methods.js:40,95,189`
`recoveryOpen`) become explicit. `getAllNodeReadinessSync`'s forced `allowStaleOnCacheChange: true`
(`service-node-methods.js:296-360`) and `membership-publication-coordinator-planning.js:219` move to the
committed read. Remaining `allowStaleOnCacheChange`/`maxCachedAgeMs` users: `storage-admission-service.js:262`
(Q6 R20), admin diagnostics (`admin-control-snapshot-readiness-diagnostics-methods.js:175-241`,
`admin-control-snapshot-control-plane-diagnostics.js:523`; presentation, may keep a non-decision read),
`control-plane-mutation-readiness.js:292` and five rebalancer sites passing `false` (option disappears with the
option). Q23 (`admin-websocket-load-lane-admission.js`) uses `maxCachedAgeMs`: migrate or record (D7).

## 4. Complete deletion list
1. `query-executor-partition-routing-snapshot.js:63-115` fail-open + inline `evidenceAbsentReasonCodes`.
2. `src/query/query-executor-priority-recovery-bootstrap-routing.js` (whole module); `ALLOW_PRIORITY_RECOVERY_BOOTSTRAP`;
   `CONTROL_PLANE_READ_RECOVERY_ROUTING.PRIORITY_RECOVERY_BOOTSTRAP` and its resolver in the publications owner.
3. `shouldAllowFreshBootstrapRoutingGrace` / `isBootstrapRoutingGraceWindow` (UA-1) and the no-readiness-service
   routable default (`service-resolution.js:197-211`).
4. `src/control-plane/readiness-denial-classification.js` and both callers' uses.
5. Every `!== false` / empty-means-true on a readiness input listed in 3.4-3.5 (13 sites) plus
   `hasServeEligibleControlPlaneService` empty default.
6. `allowStaleOnCacheChange`, `maxCachedAgeMs` on decision paths (CL-033 supersession), `getAllNodeReadinessSync`
   cache reads for decisions, `readNodeRows`/`readAllNodeServiceRows` cache fallbacks inside the serve decision
   (`node-service-rows.js:29-53,83-112`).
7. Provisioning: degraded fallback, poll, 10 s constant, FALLBACK_USED warn and reason, transient sets and
   minimum lowering, `Math.max(1, ...)`.
8. Rebalancer: formation carve-out, startup lease bypass (D5), `readCachedRows` for decisions, local-serve defer,
   `TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE` and the cache in-flight path.
9. C12 readiness loop (D6).
10. Contract text superseded (appended, section 8).
Not deleted here (Q6 follow-ups, section 7): the placeholder machinery for non-serve dimensions, wall-clock maps,
deferred frontier, 250 ms latch, stale grace, trust grace (S4a/b, S6/S1b, S8).

## 5. F10 outcome shapes and the pgwire mapping
- Full RF: `contractState: 'ready'`, `nextAction: 'proceed'`, `epoch`.
- Quorum minimum reached, RF not: `contractState: 'under_replicated'`, `nextAction: 'proceed'`,
  `{epoch, requestedReplicaCount, committedReplicaCount, missingReplicaCount}`; replaces today's `pending`
  forcing (`query/provisioning-completion-summary.js:1-6,38-60`; `table-creation-service-completion.js:91-152`).
  Requires adding `UNDER_REPLICATED` to `OWNER_CONTRACT_STATE` (`control-plane/owner-contract-outcome.js:1-7`) and
  to `TABLE_CREATION_CONTRACT_PRIORITY`: a change to a shared vocabulary (R08), recorded. Client: a NoticeResponse
  (`runtime/pgwire-message-builders.js:114-121`, existing use `pgwire-transaction-outcome.js:234`); whether the
  DDL result path can carry a notice today is unverified (attempt 2 first check).
- Below quorum: engine error `QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE` carrying `{epoch, reasons,
  retryAfterMs}`; `PG_ERROR_CODE.CANNOT_CONNECT_NOW = '57P03'` added in `runtime/pgwire-protocol-constants.js`
  (55P03 is at `:117`); one row added to `SQLSTATE_BY_ENGINE_ERROR_CODE` (`runtime/pgwire-result-mapper.js:122-142`;
  resolver `:152-156`). Admin envelope: `contractState: 'deferred'`, `nextAction: 'retry'`, reason
  `provisioning_unavailable` (the analysis' `'unavailable'` is not in the vocabulary; D3).
- The schema-provisioning job owner (`schema-provisioning-job-owner.js:327-351,449`) treats `under_replicated` as
  terminal success (no ~2 s structural retry; Q6 S3' witness), and full RF stays the rebalancer's obligation.

## 6. Where the 75 s / 120 s come from [S]
`PERIODIC_CHECK_INTERVAL_MS 60000` (`rebalancer-constants.js:105`); `maxInterval = 2 x 60000 = 120000`
(`unified-rebalancer-lifecycle-base.js:244-246`); each blocking gate multiplies `currentInterval` by
`REBALANCE_PLANNING_GATE_DELAY_MULTIPLIER.WAIT 1.25` (`rebalancer-planning-gate-constants.js:35-38`;
`increaseCurrentInterval`, `rebalancer-planning-gate-methods.js:123-129`), every gate is evaluated (and
multiplies) even when only the first is applied (`:612-637`), and a non-priority partition schedules that delay
without jitter (`unified-rebalancer-policy-scheduler-methods.js:266-272`). First defer 75 000 ms, then 93 750,
117 188, then the 120 000 cap. [H, S on each edge] The local-serve gate arms no wake and the settle gate arms only
the local-mutation wake, so a reason that clears mid-sleep waits the full timer. **How they disappear:** the two
gates that defer on projection reasons are deleted or answer from committed facts; a committed `not_eligible`
or `unavailable` defer subscribes to `subscribeServeEligibility` (the owner's completion event) instead of sleeping
on the multiplied interval. No constant is changed; the backoff remains for genuine no-op passes.

## 7. Reconciliation with the Q6 record (R09/R17)
The Q6 contract (section 5) keeps the readiness *projection* as the owner and makes its answers current against a
relevance-filtered cache-revision key. This quest takes the other branch the analysis recommends for the serve
decision: the answer is derived from a committed read, and the projection is a memo keyed by the committed epoch.
They are compatible: Q6's vocabulary rule (named PENDING, never a placeholder that looks like data) is kept as
`unavailable`; Q6's cohort rule (per-member answers, `pendingNodeIds`) is kept by `answerServeCohort`.
- Subsumed: S1a and S2 (provisioning names pending, decides once after the last await), S3' (with F10), S7a for
  Q9 and R1 (deleted rather than restated as typed carve-outs, because system-table routing and placement no
  longer depend on serve eligibility), S7b rows R1, R7, R8, R23 and the CL-033 supersession for Q18, S7d row Q8.
- Remain follow-ups (not absorbed): S0, S5, S4a/S4b, S6+S1b, S8, S7a R12 residuals and Q13, S7b rows R2-R6,
  R9-R11, R13, R16, R20 (unless D7), R28, S7c (join/bootstrap, incl. U19, U21, U23, U24), S7d Q10, Q11, Q14, Q24,
  Q25, N1-N3, S7e. They concern non-serve dimensions of the projection.
- **Gate conflict (must be decided, D1).** The record's gate (`readiness-observation-currency.md:669-675`) and the
  epic's activation status (`solve/epics/core-architecture-convergence.md` "Status and activation") say no
  behaviour-changing slice starts until `raft-rs-full-cutover` closes and Q0 re-measures READY. Neither holds
  (`raft-rs-full-cutover.md` `status: open`; `core-convergence-rs-raft-readiness-baseline` has no log). The
  brief's paraphrase ("no slice starts without owner decision") is not the recorded text. Starting this quest
  under this epic therefore needs an explicit, recorded owner supersession of that gate for this quest (R09), or
  the quest moves to `raft-rs-full-cutover` (authorizes `src` wholesale; the census's alternative). I recommend
  the recorded supersession under `core-architecture-convergence`, since the record it realizes lives there.
- All touched paths are in the epic's `authorizes` (`src/control-plane`, `src/query`, `src/rebalancer`,
  `src/partition`, `src/runtime`, `src/node`, `architecture`, `test/*` dirs used); no scope widening is needed.

## 8. R09 supersession texts (appended at landing, not before)
- `architecture/runtime-contracts.md` after the "Required patterns" list (`:190-200`): "Superseded 2026-11-xx
  for gating decisions by quest serve-eligibility-committed-epoch-read: a decision that grants serving,
  placement, provisioning or planning progress reads the owner's committed-epoch answer; the cache remains the
  read model for presentation, diagnostics, discovery and reconciliation triggers."
- `architecture/readiness-and-owner-contracts.md` after `:13-24`: "Superseded: `serveEligible` is the readiness
  owner's committed-epoch answer (committed nodes lease and published membership epoch); self-readiness does not
  preserve it across a timed-out reporter attempt; system-table routing does not consume it."
- CL-033 (5 s staleness bound behind `allowStaleOnCacheChange`/`maxCachedAgeMs`): supersession entry in its
  closure-ledger owner, naming the epoch memo as the replacement.
- Q6 record: an appended reconciliation entry quoting section 7 of this note.

## 9. Decisions requested from the lead
- **D1** Gate conflict above: record an owner supersession of the epic/Q6 gate for this quest, or move epics.
- **D2** System-table routing on leadership with no readiness filter (3.2). This is the load-bearing choice; the
  alternative (keep a readiness filter for system partitions) re-creates the circularity and needs the bypass.
- **D3** Admin envelope state for PROVISIONING_UNAVAILABLE: `deferred/retry` (proposed) vs a new `unavailable`
  state; and `under_replicated` added to the shared `OWNER_CONTRACT_STATE` vocabulary as F10 states.
- **D4** Consequence for predicate (d): `under_replicated != pending`, so (d)'s contract clause is satisfied at
  quorum minimum where today's `pending` fails it. The predicate text and bounds are unchanged and its replica
  clause already asks for quorum (`>= syncReplicaAcks+1` distinct nodes), but its satisfying states change because
  of F10. Record as an observation, or as an R09 supersession of the reproducer's predicate (owner's call).
- **D5** Startup lease bypass: delete with its readers in `bootstrap/phases/seed-partitions-phase.js:647` and
  `unified-rebalancer-priority-readiness.js:659` (widens touched files into bootstrap), or keep those readers and
  delete only the rebalancer uses.
- **D6** C12: delete the readiness loop (diagnostics lose the per-learner readiness) or keep it on the owner answer.
- **D7** R20 storage admission and Q23 load-lane `maxCachedAgeMs`: migrate here (needed to delete the option) or
  keep the option for those two with a recorded residual.

## 10. Attempt split (sealed attempts after D1-D7)
| # | Scope | Red test (file) | First failing assertion expected today |
| --- | --- | --- | --- |
| 1 | Owner read + epoch memo (2), user-table routing (3.1), system-table routing on leadership (3.2), deletions 1-3, 5 (routing sites), 6 (serve path), runtime/readiness contract supersessions | new `test/control-plane/serve-eligibility-committed-epoch-read.test.js`; extend `test/query/query-executor-system-table-leader-fail-open.test.js` (becomes the deletion witness) | (a) cache NODES row says lease expired, committed row current and N published at E -> `answerServeEligibility(N)` is `{state:'ready', decision:'eligible', epoch.publicationEpoch:E}`: fails, no such method (and `getNodeReadinessSync(N).dimensions.serveEligible` is false). (b) memo at E, cache shows publication E+1 -> `unavailable_stale{E}`: fails. (c) system partition, all candidates readiness-denied, leader hint N -> routes to N with no `systemTableLeaderFailOpen` diagnostic and no readiness read: fails (fail-open diagnostic present). (d) user partition in bootstrap grace with SERVE_ELIGIBLE failed -> not routable: fails (grace admits). |
| 2 | Provisioning C6 + F10 + pgwire 57P03 + NOTICE + schema job terminal | extend `test/query/sql-query-engine-provision-partition-waits.test.js`; new `test/runtime/pgwire-provisioning-unavailable.test.js` | (a) RF 3, committed cohort 2 eligible + 1 `repairEligible`-only -> no ADD targets the third node and outcome `under_replicated` missing 1: fails (degraded fallback selects it, outcome `pending`). (b) cohort 1 of quorum 2 -> error code PROVISIONING_UNAVAILABLE and SQLSTATE `57P03`: fails (insufficient-targets, XX000). (c) zero `setTimeout` arms from the provisioning poll: fails. |
| 3 | Rebalancer C7 + C11 + C12 input + deletions 4, 8, 9, rebalancer `!== false` | new `test/rebalancer/critical-topology-committed-lease.test.js`; extend `test/rebalancer/startup-authority-available-node-contract.test.js` | (a) placeholder readiness for N but committed lease current -> settle blocker is null: fails (`node_ready_lease_incomplete`). (b) cache REPLICA_OPERATIONS empty, owner read has one in-flight ADD -> blocker `topology_operations_in_flight` source authoritative: fails (null). (c) owner read throws -> `unavailable`, not the cache blocker: fails. (d) local-serve PRIORITY_..._PENDING on a non-priority system partition -> no defer, interval unchanged: fails (defer, 75 000 ms). |
| 4 | Publication planning Q18, CL-033 supersession, remaining `allowStaleOnCacheChange`/`maxCachedAgeMs` per D7 | extend `test/control-plane/active-node-projection.test.js` and `membership-publication-leader-driven-gate.test.js` | node with committed lease and no serve evaluation -> publication candidate admitted on the lease, with `serveEligible` absent from the predicate's inputs: fails today only via the `!== false` default (passes for the wrong reason); the red assertion is that a node whose serve answer is `not_eligible` solely for "not yet published" is still published: fails (`serveEligible !== false` excludes it). |
Scenario receipt `serve-lane-opens-on-fresh-formation`: lab run of `fresh-formation-user-table-routability`
after all four attempts and after `replica-admission-from-committed-operation` lands; red receipt taken on base.

## 11. Blast radius (test files, `grep -rlF` on this HEAD)
- Attempt 1 surfaces (`serveEligible` 86, `getNodeReadinessSync` 139, `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` 61,
  `planning_snapshot_refresh_pending` 17, `allowAuthoritativeRefresh` 23, `maxCachedAgeMs` 10,
  `allowStaleOnCacheChange` 5, `PRIORITY_RECOVERY_BOOTSTRAP` 3, bypass module 1, denial classification 3,
  `getAllNodeReadinessSync` 2, placeholder 2+1): union **238 files** (control-plane 76, rebalancer 67,
  distributed 28, bootstrap 17, query 14, integration 9, admin 8, partition 5, convergence 5, scripts 3).
- Attempt 2: **39 files** (query 14, partition 10, control-plane 6, shards 4, bootstrap 2, distributed 2, admin 1).
- Attempt 3: **32 files** (rebalancer 15, partition 4, bootstrap/control-plane/integration/simulation 2 each, ...).
- Union over attempts 1-3: **280 files**. Zero test files name `TRANSIENT_PROVISIONING_SHORTFALL_REASONS`,
  `TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS`, `table_partition_target_node_fallback_used`,
  `TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE`, `shouldAllowFreshBootstrapRoutingGrace`, `57P03`: unwitnessed.
- Wide net per attempt (Q6 section 7): impact contract `readiness-versioned-planning-liveness`
  (`test/shards/impact-contracts.json:248`, 34 owners, 15 tests, 8 witness tests at `:2195`), `core-system-logic`,
  `committed-bootstrap-stamp` where touched, node-joining/operation-ledger/formation/spread/replica-recovery/
  learner-promotion globs, `readiness-routing-heartbeat-window`, `readiness-planning-identity-churn-currency`,
  `readiness-planning-deferral-bounded`, `npm run -s test:duplication`; on lab hosts only.

## 12. Safety, progress, bounds; unknowns
Safety: no answer grants without a committed read; stale answers refuse. Progress under finite failure: every
staleness enqueues a refresh; a recovered leader answers the next read; no answer depends on itself (sections
3.2, 3.4, 3.5 cut the three cycles). Resource bound: one coalesced refresh in flight per process; read volume is
two full-table leader reads per refresh (nodes and publications are small); a deadline per read.
Unknowns: whether the publisher builds `priority_partition_summary` from committed membership or from cached rows
(Q19/U15 adjacency; if cached, the serve answer inherits it, and the fix belongs to the publication owner);
whether DDL results can carry a NoticeResponse; the observed composition of readiness denial durations on a lab
run (section 1 check); remaining readers of `shouldBypassLocalPriorityControlPlaneStartupReadiness` beyond those
listed; whether the leader-local read's deposed-leader window matters at the lease length (15 s,
`constants/time.js:5-6`).

## 13. Lead decisions and resolved unknowns (appended 2026-11-02)
Decisions D1-D7 are recorded in the quest log (`kind: decision`); F10 and D3 are confirmed by the owner (Peter,
2026-11-02). D1: the quest runs under `raft-rs-full-cutover`; the core-architecture-convergence and Q6 gates are
not superseded; the Q6 record carries a pointer entry (its section 13). D2 approved as section 3.2. D3: provisioning
unavailability is the existing `deferred`/`retry` state with the typed reason; `UNDER_REPLICATED` joins the shared
vocabulary. D4: R09 supersession of predicate (d) recorded in that quest's log. D5: the startup bypass and its
bootstrap readers go together (fifth attempt if another owner). D6: the C12 loop is deleted. D7: residual.
Resolved: `priority_partition_summary` is built from cached and merged rows (same class, attempt 4, red test now);
a successful DDL cannot carry a NoticeResponse today (attempt 2 adds it at the pgwire owner). Existing primitives
attempt 1 reuses: `AuthoritativeControlPlaneView.readReadinessOwnerRows` (`authoritative-control-plane-view.js:470-494`,
OWNER_RPC_REQUIRED + leader REQUIRED + READINESS_INTERNAL) for the committed read, and the structural route
`isReadinessInternalRouteStructurallyReady` (`query/query-executor-bootstrap-deferred-routing.js`) for system-table
routing on leadership.
