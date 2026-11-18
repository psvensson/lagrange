# Persisting reds: triage report (2026-11-11)

Base HEAD 103f132c1 (exported to scratchpad/triage/head). Every run was serial, after a thermal wait, under `nice -n 15 node scripts/run-test-files.js --jobs 1 <file>`. Outputs are in scratchpad/triage/out/ (`cur-*` is the first pass on the current tree, `final-*` the last pass, `head*` the committed-HEAD runs).

**Before/after on the current tree:** of the 27 files in scope (the original 29, minus the two marked skip, plus the coordinator's W7 file), 24 were red on the first pass. After the fixes 16 are green. Two of those, cache-observation and membership-consistency, were already green on the first pass. The last pass ends with 10 red files: 9 still red, plus membership-consistency, which is intermittent. On top of that, a new witness test is green, and the four files the coordinator asked me to confirm are green.

## Table

| File | Now | First failing assertion (lab) | Class | Cause (file:line) | Done |
|---|---|---|---|---|---|
| admin/completed-placement-autonomous-progress | RED (hangs) | Tests 1 and 2 pass. Test 3 never finishes and is killed at 600 s. | PRODUCT DEFECT (livelock) | See D1. publication-active-gate-handoff-contract-evidence.js:424-439 now reads readiness reasons, so the self re-enqueue at membership-publication-active-gate-reconcile.js:~690-705 loops for ever. | Located; not fixed (design change, see D1). Green at HEAD. |
| bootstrap/cdc-initial-subscription-leader-fallback | GREEN | `cdc_committed_acceptance_unknown` thrown at partition-cdc-propagation-subscriber.js:212 | STALE FIXTURE | The test mocked `seedCacheHydrationPhase.propagatePartitionCDCEvent`. The seed delegate now calls `propagatePartitionCdcVector` → `latencyTopology.cdcGroupPropagationService.propagateCDCEvent`, which the test stubbed to return undefined (bootstrap-service-seed-delegates.js:323). | The mock now sits on the real seam. 8 failing → 5/5 pass. |
| cache/system-table-cache-observation | GREEN | Watermark diff: revision 1 vs 2 | (already fixed by the CDC writer) | — | Confirmed green. |
| cdc/cdc-integration-service-execute-sql-and-delivery | GREEN | `isTransientCdcError('Message timeout')` returned false, expected true | TEST PINS SUPERSEDED BEHAVIOUR | Timeouts are now classified by transport code (`ROUTER_MESSAGE_TIMEOUT`), not by text (cdc-routed-mutation-readiness.js:711). | Test now uses the router's real coded error, and adds a pin that the bare text is NOT transient. 52 → 53 assertions, green. |
| cdc/cdc-integration-service-time-seam | RED | Attempts [200] vs [200,150,100,50] | PRODUCT DEFECT (CDC, fenced) | D2 | Reported. Green at HEAD. |
| cdc/cdc-routed-mutation-wait-bound-spent | RED | `exactly one wait_bound_spent`: 0 vs 1 | PRODUCT DEFECT (CDC, fenced) | D2 (same cause) | Reported. Green at HEAD. |
| cdc/write-then-read-projection-census | GREEN | New `onCacheChange`+Promise wait in rebalancer/operation-creation-admission-clearance.js | Census entry owed | A new legitimate wait (an admission re-entry clearance, not a write position) needed its named entry. | Named it with its reason in `OWN_CACHE_CHANGE_WAITS`. |
| config/system-cache-write-callsite-guardrails | RED | Unsanctioned `applySystemTableChange` at seed-cache-hydration-cdc-subscription.js:51,56 | PRODUCT/OWNER (CDC, fenced) | D3 | Reported. Green at HEAD. |
| control-plane/heartbeat-memory-trend | RED | Unclassified NODES mutation site `seed-cache-hydration-cdc-subscription.js#raiseNodeReadyRebalanceTriggers` | Same cause as the guardrail file (D3) | D3 | Reported. Green at HEAD. |
| distributed/harness/__tests__/run-health-collection | GREEN | healthCollection `{state, response:null}` vs `{state}` | STALE FIXTURE | The hand-built node health answer lacked the producer's `response` field (src/diagnostics/node-health-collection.js:145-177). | Fixture now uses the real producer (`NodeHealthBuffer` + `collectNodeHealth`) and pins `response`. 16/16. |
| integration/lagrange-server-npm-package | RED | test:54 `packed.entryCount <= 2100` | GATE (package budget) | `npm pack --dry-run`: 2116 entries now vs 2073 at HEAD (+44 untracked src files). Unpacked size is 23.7 MB of the 25 MB budget. | Reported. I did not raise the budget. |
| integration/membership-consistency | INTERMITTENT | test:667 "published epoch settles with the seed eligible" is false | PRODUCT DEFECT candidate (CDC) | D4 | Locally green 2 of 3 times; lab red 2 of 2; HEAD green 1 of 1. The red run logs `cdc_committed_acceptance_unknown` on mg-1 publication writes; green runs log none. |
| integration/message-group-learner-successor-ordering | GREEN | `membership-change-removes-live-quorum` vs `conf-change-pending` | PRODUCT DEFECT (fixed) | **Same cause as S1** | Fixed by S1. |
| message-group/message-group-fresh-learner-promotion | GREEN | `membership-change-removes-live-quorum` vs `proposed`; then TypeError `lastActiveTick` | S1 + STALE FIXTURE | S1. The hand-built group lacked `voterLiveness`. | S1, plus the fixture now uses `createVoterLiveness()`. |
| message-group/message-group-peer-address-committed-configuration | GREEN | `removes-live-quorum` vs `proposed` | S1 | S1 | Fixed by S1. |
| node/message-group-service-handler-membership | GREEN | CORE_REFUSED removes-live-quorum | S1 | S1 | Fixed by S1. |
| node/replica-handler-release-recovery | GREEN | Listener count 2 vs 1 | STALE FIXTURE | S2 | Fixed. |
| partition/participant-release-applied-position | GREEN | Listener count 2 vs 1 | STALE FIXTURE | S2 | Fixed. |
| query/durable-provisioning-job-owner-guard | GREEN | `/operationIntentId/` not found in sql-query-engine-initial-partition-provisioning.js | STALE FIXTURE (source trace) | The ADD move moved into sql-query-engine-provisioning-admission-methods.js:518-541. | Guard now pins the intents on the exact `createOperation(this.buildProvisioningCreateOperationMove(...))` move. The no-`replica_operations` rule now covers all 3 provisioning files; I reworded one comment (:300) from `replica_operations rows` to `replica-operation ledger rows`. 21 → 23 assertions. |
| raft/raft-rs-backend/committed-membership-census | GREEN | T7-3/T7-5/T7-8 carrier and reader sets | Census entries owed | New legitimate readers: replica-removal-cancellation.js and replica-removal-settlement.js (own-config witness read, like consensus-exit), and replica-operation-topology-drain.js (reads the GENESIS stamp kind; entry 139 flagged it). | Declared each with its reason. |
| raft/raft-rs-backend/committed-membership-read | GREEN | "setup: the leader applied a joint configuration" | TEST PINS SUPERSEDED BEHAVIOUR (R09 entry 142) | A genuine RemoveNode right after the election is now refused until the leader has heard its voters. | Setup commits one write (the leader hears every voter) before proposing. Assertions unchanged. |
| raft/raft-rs-backend/message-group-membership-semantic-port | GREEN | removes-live-quorum vs proposed | S1 | S1 | Fixed by S1. |
| raft/raft-rs-backend/multi-replica-runtime-prerequisites | GREEN | F17 CORE_REFUSED removes-live-quorum | S1 | S1 | Fixed by S1. |
| scripts/canonical-authority-formation-acceptance | RED | Subtests 5/8/11/17: witness digest mismatch; 12/13/14: prerequisites | GATE/EVIDENCE | G1 | Reported; no pins edited. |
| scripts/check-guideline-navigability | RED | "real audit over src reports only inherited violations" | GATE (ratchet) | G2 | Reported. Green at HEAD. |
| scripts/fresh-formation-user-table-routability | RED | Manifest missing at solve/quests/fresh-formation-user-table-routability/evidence/three-consecutive-runs-manifest.json | GATE/EVIDENCE | Three consecutive lab formation runs are owed. | Reported. |
| scripts/repository-legacy-fallback-closure | RED | Inventory incomplete; reintroduction guard fails | GATE/EVIDENCE | G3 | Reported. |
| rebalancer/replace-in-flight-blocks-planning (coordinator add-on) | GREEN | W7: STOPPING vs FAILED | STALE FIXTURE + new rule pinned | S3 | Fixed and W7 rewritten (S3). 235 → 415 assertions. |

The coordinator's four confirm-only files are green on the current tree: learner-discovery 21/21, replace-source-removal-owner 100/100, replace-owner-recovery-equivalence 288/288, replace-real-group-scheduling 137/137.

## Shared causes

**S1: the live-quorum admission refused every new learner (product defect, fixed in src/raft, unfenced).** It caused 7 files: learner-successor-ordering, fresh-learner-promotion, peer-address-committed-configuration, message-group-service-handler-membership, membership-semantic-port, multi-replica-runtime-prerequisites, and the setup of committed-membership-read.

- **What went wrong:** `removesLiveQuorum` (src/raft/raft-rs-conf-change-admission.js:109) fired on any step whose type is in `TAKES_A_VOTER`. `ADD_LEARNER_NODE` is in that set (it covers a voter's demotion), so adding a fresh learner — no voter leaves — was checked too.
- **Effect:** with the leader not yet having sampled its followers (a fresh election, or any idle window), only the leader counts as live. Every learner add then failed `REMOVES_LIVE_QUORUM`, which blocks fresh formation and joins.
- **Repair:** the check now runs only when the resulting configuration drops a current voter.
- **Unchanged:** RemoveNode, a voter's demotion, and the REPLACE pair (AddNode t + RemoveNode s) are still refused without a live quorum. partition-removal-live-quorum, replica-handler-membership-relay, replica-membership-witness and transfer-leadership-drop-classification stay green.
- **New witness:** test/raft/raft-rs-conf-change-admission-live-quorum.test.js. It is red on revert (1 of 2 tests fails with the old predicate).

**S2: the applied-position listener count included a resident listener (stale fixture).** It caused replica-handler-release-recovery and participant-release-applied-position.

- **What changed:** src/partition/partition-service-removal-subject-handoff.js:218 now keeps a lifetime `APPLIED_PROGRESS` listener per replica.
- **Why the tests broke:** `fixtureParticipantObservationListenerCount` (test/test-helpers/participant-transaction-fixture.js) counted every listener on the event, not just the observation's.
- **Repair:** `startReplica` records the replica's resident listeners right after `initialize()`. The helper counts only the others, and throws if no record exists. A leaked observation listener is still counted.

**S3 (coordinator's W7): fixture rows had no generation.** The REPLACE owner sends CANCEL_REPLICA_REMOVAL only with the source generation it reads authoritatively. The world's hand-built services rows had no `created_at` and no `state_entered_at`, so `lifecyclePrecondition` was `{}` and the read answered GENERATION_UNAVAILABLE. No cancel was ever sent, and the owner waited correctly.

- **Repair:** `replicaRow` now carries both fields, as the handler writes them.
- **W7 is now three tests pinning the rule.** Each first runs an unanswered (UNAVAILABLE) cancel and checks:
  - the REPLACE stays STOPPING;
  - exactly one cancel went out, naming the source replica and its generation;
  - nothing is recorded, and every admission still refuses.
- **Then, per answer:**
  - CANCELLED and NOT_IN_PROGRESS: FAILED, terminal, the answer is recorded, there is no degraded record, the source row stays ACTIVE, and planning resumes on the terminal event.
  - ALREADY_REMOVED (after `commitRemoval`): terminal, not FAILED, never recorded as retained. The degraded record names the removed source, the dead target and `durability_repair_add`.
- **Deviation from the coordinator's wording:** the cancel is answered by the shared witness double (`createReplaceWitness`, the same double W2/W3 use), not by a production ReplicaHandler. The production-handler path stays witnessed by replace-real-group-target-death-cancel.test.js.

**D2 and D3 are each one cause shared by two files** (time-seam + wait-bound-spent; guardrail + heartbeat). Details below.

## Product defects in detail

**D1: livelock in the membership-publication active-gate reconcile. This is the admin test hang.** It is green at HEAD.

- **Where it stops:** instrumented, the test reaches step 5 and never returns from `f.membership.reconcileClusterMembership({reason: 'verify_repair_capable'})`. In 30 s it wrote over 64 MB of trace from back-to-back runs of `reconcileActiveGateMembershipPublication`.
- **Loop path:** `OwnerKeyReconcileQueue.drain` → `reconcileFn` (membership-publication-coordinator-reads.js:163) → `reconcileClusterMembership` → `reconcileActiveGateMembershipPublication`. That function's owner-recovery-wait branch (membership-publication-active-gate-reconcile.js:~685-705) calls `enqueueClusterMembershipReconcile(ACTIVE_GATE_HANDOFF_OWNER_RECONCILE, {publicationActiveGateHandoff})`, and the queue runs it again at once.
- **Why it never ends:** the re-enqueue carries the same captured handoff in its context, so every rerun re-evaluates the same stale snapshot (target_blocked, `activeGateCatchupFence` catchup_pending, `pendingRecoveryNodeIds` [node-1,node-2,node-3]). Nothing ever changes it.
- **Why it is new:** publication-active-gate-handoff-contract-evidence.js:424-439 now reads reason codes through `collectReasonCodes`. This is verification F10 in log entry 130: "a constant fix turned a dead read live". `pendingRecoveryCount > 0` is now reachable, which `isActiveGateMembershipPublicationOwnerRecoveryWaitTarget` (:585) requires. At HEAD that branch was dead.
- **Production impact:** the same hot loop holds the membership owner's queue for as long as any node is recovery-pending.
- **Repair owed:**
  1. The owner-recovery wait must not re-enqueue itself. It should wait on the recovery owner's progress event (priority-recovery progress or readiness publication), or at minimum carry the outcome's `retryAfterMs` as a delayed wake (R13: bound the wait).
  2. A re-run must re-derive the handoff, not replay the captured `publicationActiveGateHandoff`.
- **Owner:** control-plane membership publication. It is not fenced, but it is a design change, so I left it unedited.

**D2: CDC routed system-table writes no longer retry `ROUTER_CONNECTION_CLOSED` or `ROUTER_MESSAGE_TIMEOUT`.** CDC fenced. Green at HEAD.

- **What changed:** src/cdc/cdc-integration-service-shared.js:412-413 replaced `QUERY_ERROR_CODE.ROUTER_CONNECTION_CLOSED`, which was undefined at HEAD (a dead check), with the real codes, and added `ROUTER_MESSAGE_TIMEOUT`.
- **Effect:** both answers now match `isSystemTableOwnerHandoffFailure`. Its only consumer, `shouldRetryRoutedSystemTableMutationFailure` (src/cdc/cdc-routed-mutation-readiness.js:722), returns false for a handoff signature, so the routed loop (:601-627 and :649-652) throws on the first attempt.
- **Probe:** for `{errorCode: 'ROUTER_CONNECTION_CLOSED', deferRetry: true}`, `isTransientCdcError` = true but should-retry = false (true at HEAD).
- **Contradiction:** the comment added in `isTransientCdcError` (:711-714) says these are "re-sent under the same write key". No caller handles a "handoff" by re-routing.
- **Repair:** either drop these two codes from the handoff signature, or make the handoff path re-route under the same write key within the budget. The two red tests already pin the intended retry and budget behaviour.

**D3: a scratch `SystemTableCache` used as a pure fold.** CDC fenced. Green at HEAD.

- **Where:** `raiseNodeReadyRebalanceTriggers` (src/bootstrap/phases/seed-cache-hydration-cdc-subscription.js:51,56) builds a throwaway `SystemTableCache` and calls `applySystemTableChange` on it to compute each event's predecessor row.
- **Why two gates fire:** both static censuses (cache-write callsites; NODES mutation sites) correctly see a cache-write and NODES-mutation call outside the sanctioned owners. Neither can tell a scratch cache from the node's cache.
- **Repair at the owner:** the cache owner should expose a pure "fold one CDC event onto a row" function — the same merge rule — that the hook calls. Whitelisting the site in either census would misclassify it: it is not a NODES transition.

**D4 (candidate, intermittent): membership-consistency settle failure.**

- **Pattern:** red in both lab runs and in 1 of 3 local runs; green at HEAD in 1 run.
- **Correlation:** the red run logs `Raft CDC command failed ... cdc_committed_acceptance_unknown` (attempts 3/3, mg-1, leader) and "CDCIntegrationService shut down before this write was confirmed" on control_plane_publications writes. The green runs log none.
- **Effect:** the publication write's outcome is UNKNOWN, so the readiness verdict never returns to settled within the bound.
- **Owner:** CDC propagation outcome classification. It is not proven further than this correlation.

## Gate and evidence tests: what is off

- **G1, canonical-authority-formation-acceptance.**
  - Witness file digests differ:
    - canonical-replica-completion-observation.test.js: pinned e8bfba67…, actual 70c65cac…
    - formation-spread-progress-at-cause.test.js: pinned dc8cdc53…, actual 6887e423…
    - repository-legacy-fallback-closure.test.js: pinned 2eaf5d92…, actual 0ecffc60…
    - topology/cdc-recipient-domain-and-retained-debt.test.js: pinned a6eab735…, actual 4438c74a…
  - Each owing quest needs re-verification and re-sealed receipts. I did not edit any pins.
  - Subtest 12: quest fresh-formation-user-table-routability must be solved.
  - Subtest 13: `isInventoryComplete` is false (from G3).
  - Subtest 14: 18 of 37 prerequisite quests are not solved: fresh-formation-user-table-routability, serve-eligibility-committed-epoch-read, fresh-create-release-authority-from-committed-operation, dynamic-config-startup-owned-initialization, replica-create-timeout-replay-custody, partition-placement-declared-target, committed-readiness-fixture-custody, required-entity-operation-observation, committed-node-remove-safety-wake, system-cache-reconciliation-ingress, runtime-definition-create-authority, readiness-bulk-required-domain, readiness-direct-publication-planning-identity (superseded), readiness-direct-publication-planning-custody, readiness-self-grace-service-evidence-contract, failed-create-cleanup-claim-normalization, strict-hydration-fixture-owner-ports, tap-default-machine-factor-portability.
- **G2, check-guideline-navigability.** Violations above the baselines are rising as writers work: 25 on the lab snapshot, 32 now.
  - CDC (fenced):
    - cdc-recipient-lifecycle.js: 6 legacy_term_identifiers
    - partition-cdc-propagation-subscriber.js:419 typeof_dual_paths and :492 owner_port_feature_detection
    - cdc-propagation-progress.js:134
    - cdc-integration-service-source-relist.js:94
    - partition-cdc-delivery.js:589
  - Removal node files (that writer is now done):
    - replica-removal-cancellation.js:110 and :151 catch_returns_default, :407 prototype_copy_bags
    - replica-removal-settlement.js:89 catch_returns_default and :113 owner_port_feature_detection
    - replica-removal-group-verdict.js:57
  - Others:
    - replica-dispatch-service.js:57 and :79 legacy_term_identifiers
    - live-query-startup-wiring.js:351
    - plus the rest of the 32 (full list in out/final-test_scripts_check-guideline-navigability.test.js.txt)
  - Owed: fix the sites. Baselines must not be raised.
- **G3, repository-legacy-fallback-closure.**
  - 2669 active detected (matches the pin), but retired is 32 vs the pinned 22, so 2669+32 ≠ 2685. The 10 newly retired sites are in rolling-upgrade-owner, partition-cdc-obligation-delivery, sql-query-engine-routing-metadata-methods, operation-creation-admission, cdc-group-propagation-durable-delivery, message-router-* and others; the full list is in the report run.
  - The reintroduction guard finds 10 detected fallback sites that are not in code-navigability-fallback-classification.json.
  - Owed: classify the 10 new sites and re-record the census, then reconcile the pinned counts through the quest's supersession. Not edited.
- **fresh-formation-user-table-routability.** Three consecutive physical-lab formation runs and their manifest are owed.
- **npm package.** 2116 > 2100 entries (+43 from today's new src files). Either consolidate files or get an owner decision on the budget.

## What I changed

- **src/raft/raft-rs-conf-change-admission.js** — S1. The only behavioural src change.
- **src/query/sql-query-engine-provisioning-admission-methods.js:300** — comment wording only.
- **Tests and fixtures:**
  - test/raft/raft-rs-conf-change-admission-live-quorum.test.js (new)
  - test/message-group/message-group-fresh-learner-promotion.test.js
  - test/raft/raft-rs-backend/committed-membership-read.test.js
  - test/raft/raft-rs-backend/committed-membership-census.test.js
  - test/test-helpers/participant-transaction-fixture.js
  - test/query/durable-provisioning-job-owner-guard.test.js
  - test/cdc/write-then-read-projection-census.test.js
  - test/cdc/cdc-integration-service-execute-sql-and-delivery.test.js
  - test/bootstrap/cdc-initial-subscription-leader-fallback.test.js
  - test/distributed/harness/__tests__/run-health-collection.test.js
  - test/rebalancer/replace-in-flight-blocks-planning.test.js
- ESLint is clean on all touched files. No git state was changed, and no pins, receipts or baselines were edited.
- **Owed by the composer:** `npm run test:metadata:refresh`. The shard classifications were already stale (30 unclassified files) and now also lack the new witness file. I did not regenerate them, because doing so would sweep in other writers' tests.

## Left, with owner

- **D1:** control-plane membership publication owner (admin hang).
- **D2 and D3:** CDC writer (time-seam, wait-bound-spent, guardrail, heartbeat).
- **D4:** CDC writer (membership-consistency, intermittent).
- **G1, G3, routability:** each quest owner.
- **G2:** CDC writer, plus the removal and other file owners.
- **npm package budget:** owner decision, or file consolidation.
