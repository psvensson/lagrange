---
id: operation-integrity-and-reliable-formation
status: open
proof: certification
roadmapRow: RM-0.2.9-published-operating-contract
graduatesTo: architecture/contracts/authority-and-recovery.md
doneWhen:
  probe: test-receipt
  args:
    file: solve/quests/fresh-formation-user-table-routability/evidence/receipt.json
    requiredReceipts:
      - reproducer-red-on-current-product
      - first-divergence-repaired-at-cause
      - scenario-green-three-consecutive
      - independent-verification
quests:
  - fresh-formation-user-table-routability
  - serve-eligibility-committed-epoch-read
  - fresh-create-release-authority-from-committed-operation
  - replica-admission-from-committed-operation
  - dynamic-config-startup-owned-initialization
authorizes:
  - src
  - test
  - docs
  - architecture
  - scripts
  - solve/epics
  - solve/quests
  - roadmap*
---

# Operation integrity and reliable formation

Enforce one coherent operation contract across Lagrange's existing authority,
readiness, lifecycle, configuration, CDC propagation, and diagnostic owners so a
fresh three-node cluster forms reliably through the public startup path, opens
every serve lane under its committed authority contract, spreads all six
priority control-plane partitions, settles replica operations to quiet, and
completes `CREATE TABLE`, `SELECT COUNT(*)`, `INSERT`, and readback from every
node within preregistered bounds.

## Milestone, integration owner, and baseline

- **Assigned version milestone:** `0.4.1` (`RM-0.2.9-published-operating-contract`
  in `docs/development/agpl-feature-map.md`), the immediate bounded correctness
  and stabilization release following published `v0.4.0`
  (`07206ba1c8bb396f4eb097a753915bb34580d824`).
- **Preserved successor dependencies:** `0.5` retains five-node comparative
  qualification (`RM-0.4-wasm-public-comparison`, `RM-0.4-scenario-a-comparison`),
  standard HTTP/Hono service authoring (`RM-0.5-standard-http-service-api`), and
  full Queryable Core completion (`RM-0.2.9-stable-core-completion`). Three-node
  formation correctness in `0.4.1` does not claim five-node comparative
  performance.
- **Integration owner:** `local-integration-owner` on composed branch
  `work/composed-05-comparison-readiness-20261103` (mirrored to
  `wip/handover-20261103/comparison-readiness` and
  `wip/handover-20261103/composed-05-comparison-readiness`).
- **Reviewed baseline SHA:** `77e5b4c5ba01826f2ddceecb088f56fcd27b436e`.
- **Starting candidate SHA at E0:** `63e4a854b783d4b3176b3ecd123677384c96fafa`
  (one commit ahead of `77e5b4c5ba01826f2ddceecb088f56fcd27b436e`, landing
  `ServeEligibilityOwner` published-only epoch ratchet, required-domain node
  readiness completeness in `ControlPlaneReadinessService`, and bounded causal
  aggregation in `ControlPlaneDiagnosticsLedger`).
- **Retained red baseline and quests:** preserves
  `solve/quests/fresh-formation-user-table-routability/quest.json` (red physical
  run `multi-host-lab-run1-20261101T2118Z` retained in relocated bundle
  `comparative-benchmark-evidence-repair--comparative-benchmark-evidence-repair-evidence-435c426b9-2026-11-01.tar.gz`),
  `solve/quests/serve-eligibility-committed-epoch-read/quest.json`,
  `solve/quests/fresh-create-release-authority-from-committed-operation/quest.json`,
  and `solve/quests/replica-admission-from-committed-operation/quest.json`.

## Current proof package (5 November evening)

- Candidate base: `fffd9addfd600cf58bc0c40b1c7df43d5ba4a899`, clean on takeover;
  rule-set revision 5. The user-provided evening review accepts the bounded
  production repairs in E1, E2, E4, E6 and E7. Their existing adverse schedules
  remain retained; this does not complete E8 or E9.
- E3 now has a bounded completed-placement handoff witness in
  `test/admin/completed-placement-autonomous-progress.test.js`: terminal ADD
  and stale target visibility are initial conditions. A settled SERVICES read
  refusal clears, the existing membership driver and CDC hydration wake the
  real priority-visibility listener, and the publication owner persists a
  satisfied priority summary through the gateway into SQLite. No new ADD
  execution is claimed. The first admin read follows durable assertions.
  Its disabled-trigger negative must remain unresolved for the same 40-second
  virtual recovery bound, preserving the production 5-second driver and
  30-second catch-up cooldown.
- E6 validates **every** proposed `CDC_DELIVERED` command before measuring it;
  adding a 257-event ACK to otherwise valid batches must fail measurement.
  Router deliveries retain a separate transport-count assertion.
- E6 proposal cost is bound to
  `test/topology/cdc-group-propagation-proposal-cost.test.js`:
  `K = 4` distinct source event waves, `M = 3` message groups **including the
  source**, `c = 1`. The healthy schedule has sequential waves, native RF1
  group leaders, no injected faults or leadership changes, and timely native
  application. Count every call to each real consensus port's `propose`,
  including any refused or retried attempt, after group setup. The measured
  bound is `proposals <= c*K*M` (12), with native applied-index advancement
  and cache effects on every group. This counts CDC propagation proposals;
  source-partition SQL/`CDC_DELIVERED`, setup and membership proposals are
  excluded. The negative doubles real native proposals (24) while transport
  stays at eight deliveries and must reject the same bound. This is a
  component/native healthy-schedule claim, not physical performance evidence.
- E7 names the outward seven-field accounting below. E8 final committed-tree
  focused/process-isolated proof and independent verification, and E9 three
  consecutive fresh-state physical runs remain open. The formal receipt stays
  failing until its existing obligations have evidence. Continuation owner:
  the current local integration session; no physical run has yet been submitted.

## Approved user-visible contract

1. **Fresh three-node formation:** each node's serve lane opens from committed
   authority (`serveEligible: true`), all six priority partitions reach
   `readyDistinct == required`, and `replica_operations` reaches `0` in-flight
   for the registered quiet window.
2. **Approved `CREATE TABLE` contract:** completes at the sealed committed
   quorum-minimum cohort with a visible typed `under_replicated` outcome when
   appropriate, returns typed `57P03` (`PROVISIONING_UNAVAILABLE`) below quorum,
   and retains responsibility for completing replication.
3. **Public SQL routability:** `SELECT COUNT(*)`, `INSERT`, and readback succeed
   from every node with zero `learner_address_unresolvable` refusals for
   durably committed learners.
4. **Observational purity:** diagnostics and readiness/snapshot observers
   observe progress without mutating product caches or causing convergence.

## Work packages and baseline classification

| Work package | Invariant | Production owner | Retained obligation / trigger | Test and evidence | Status |
| --- | --- | --- | --- | --- | --- |
| `E0` Candidate & baseline | Single version milestone (`0.4.1`), one composed candidate from `77e5b4c5b`, preserved quest seals and successor links | `solve/epics/operation-integrity-and-reliable-formation.md`, `docs/development/agpl-feature-map.md` | Keep epic/quest/roadmap alignment current at each package boundary | `npm run audit:roadmap-authority`, `node scripts/solve.js board` | Complete (`572461011`) |
| `E1` Authority & metadata meaning | Preserve `ELIGIBLE`/`INELIGIBLE`/`ABSENT`/`UNAVAILABLE` definition outcomes; decisive SQL authoritative absence vs unavailable routing; sealed quorum-minimum initial partition provisioning without observed-singleton RF3 downgrade; `PUBLISHED`-only epoch floor; complete `SELECT` plan propagation and post-overlay routing snapshot repair | `src/node/runtime-service-definition-resolution.js`, `src/node/runtime-service-generic-replica.js`, `src/control-plane/serve-eligibility-owner.js`, `src/query/sql-query-engine-metadata-authority-refresh.js`, `src/query/sql-query-engine-initial-partition-provisioning.js`, `src/query/sql-query-engine-provision-target-methods.js`, `src/query/query-executor-partition-routing-snapshot.js` | Authoritative SQL absence overrides and evicts stale cached presence; RF3 sealed quorum minimum (`2`) never downgrades to `1` on observed singleton node count; `awaitPostOverlayRoutingRepair` passes positional `routingReadinessDimension` through the overlay/serve-refresh chain | `test/node/runtime-service-handler.test.js`, `test/query/sql-query-engine-cold-metadata-plan-coherence.test.js`, `test/query/sql-query-engine-provision-partition-waits.test.js`, `test/control-plane/serve-eligibility-owner.test.js`, `test/control-plane/serve-eligibility-committed-epoch-read.test.js`, `test/query/sql-query-engine-execution.test.js` | Bounded repairs verified by evening review at `fffd9add`; composed acceptance E8/E9 pending |
| `E2` Role-publication freshness & voter readiness | Monotone revision-fenced role publication and shared incarnation-fenced `raft_role` preservation across durable persistence and local seeding; purpose-specific voter readiness | `src/raft/authoritative-row-mutation-helper.js`, `src/partition/partition-service-metadata-mutation-helpers.js`, `src/message-group/message-group-service-metadata-publication.js`, `src/node/replica-state-machine-lifecycle-observation.js`, `src/node/replica-state-machine-transition.js`, `src/node/replica-handler-create-status-methods.js`, `src/node/replica-handler-status-methods.js`, `src/raft/replica-voter-readiness.js` | Superseded flush revision and stale cached `raft_role` yield to current live Raft role; durable role persistence and local priority seeding share one incarnation-matching rule in `replica-state-machine-lifecycle-observation.js` | `test/raft/authoritative-row-mutation-helper.test.js`, `test/partition/durable-voter-visibility-role-write.test.js`, `test/node/replica-state-machine.test.js`, `test/node/replica-local-only-row-convergence.test.js`, `scripts/check-voter-readiness-single-owner.js` (metric 0) | Bounded repairs verified by evening review at `fffd9add`; composed acceptance E8/E9 pending |
| `E3` Causally read-only observation & honest admin liveness | Zero observer-originated product cache writes and convergence progress without admin polling; outward `inFlightCount` uses `replica_operations` terminal state without active-service shortcuts or local observer startup-time erasure of remote owners' operations | `src/cache/read-only-system-table-cache.js`, `src/node/node-runtime-local-authorities.js`, `src/admin/admin-control-snapshot-local-build-base.js`, `src/admin/admin-control-snapshot-leadership-summary.js`, `src/rebalancer/replica-operation-liveness.js` | Read-only cache proxy throws `READ_ONLY_SYSTEM_TABLE_CACHE_MUTATION` on write/reconcile; `ignorePreRestart` requires actual operation owner start-time evidence; convergence progresses without `getControlSnapshot` polling | `test/admin/admin-control-snapshot-local-published-membership-recovery.test.js`, `test/admin/admin-control-snapshot.test.js`, `test/admin/completed-placement-autonomous-progress.test.js` | Bounded handoff proof independently approved; E8/E9 pending |
| `E4` CREATE, retry, transition & cleanup custody | Post-`ACTIVE` transient progress deferral preserves live runtime; confirmed boot/attempt supersession fences and retires superseded runtime via single cleanup owner (`fenceFailedReplicaCreateRuntime`); per-call admission observation; workflow visibility across concurrent admission/membership advancement and terminal timestamp adoption; bounded mutation retry cost | `src/node/replica-create-admission-owner.js`, `src/node/replica-create-admission-retained-recovery.js`, `src/node/replica-runtime-cleanup-custody.js`, `src/node/replica-create-process-owner.js`, `src/node/replica-handler-create-methods.js`, `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js`, `src/rebalancer/operation-workflow-coordinator-created-handoff-scheduling.js`, `src/rebalancer/operation-workflow-transition-retry.js` | Per-call `{progressed, row}` prevents cross-call `lastAdvanceRow` bleed; retained recovery delegates runtime unregistration exclusively to `fenceFailedReplicaCreateRuntime` and requires positive tagged/instance identity match; workflow UPDATE confirms when concurrent admission/membership owner advances its fields | `test/node/replica-create-admission-owner.test.js`, `test/node/replica-create-admission-recovery.test.js`, `test/node/replica-runtime-cleanup-custody.integration.test.js`, `test/rebalancer/replica-operation-confirmation-authority-read.test.js`, `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js` | Bounded repairs verified by evening review at `fffd9add`; composed acceptance E8/E9 pending |
| `E5` Deferred join, config & runtime handoffs | Deferred join message-group activation retains owned retry trigger; subscribe-before-hydrate config initialization; `WasmComponentDriver.#prepareRequestCell` generation fence before and after `stop(serviceId)` | `src/bootstrap/node-joining-message-group-runtime-delegation.js`, `src/config/raft-adaptive-timing-controller.js`, `src/config/dynamic-config-service.js`, `src/runtime/wasm-component-driver.js` | Retained `deferredMessageGroupServiceReplicaIds` re-drives on bounded timer until empty or shutdown; `WasmComponentDriver.#prepareRequestCell` aborts after `await stop(serviceId)` if service generation changed | `test/bootstrap/node-joining-service-message-group-activation.test.js`, `test/config/raft-adaptive-timing-controller.test.js`, `test/config/dynamic-config-service.test.js`, `test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js` | Complete (`65cc65b62`) |
| `E6` CDC fairness, exact coverage & hydration handoff | 3+ contender FIFO slice fairness with live credit retention across delayed ACK continuations and lifecycle-only contender retirement; bounded `<= 256` hydration ACK batches with actual-prefix pressure preserved; absolute retry timer deadlines (`dueAtMs`); pre-hydration invocation retirement via progress-cell `logIndex` and verified `command.acknowledged` batches | `src/topology/cdc-group-propagation-durable-delivery.js`, `src/topology/cdc-group-propagation-service.js`, `src/partition/partition-cdc-obligation-progress.js`, `src/partition/partition-cdc-obligation-delivery.js` | Reservation hold expiry (`300ms`) allows ready work without dropping a live contender's FIFO queue position or credit; actual owed-prefix pressure (`readOwedCdcHead`) bounds retained delivered rows; retry timer preemption compares absolute `dueAtMs`; `command.acknowledged` batches verified `<= 256` | `test/topology/cdc-group-propagation-service.test.js`, `test/topology/cdc-group-propagation-proposal-cost.test.js`, `test/partition/cdc-hydration-live-handoff.test.js`, `test/partition/partition-cdc-obligation-reclamation.test.js` | Bounded fixes and explicit ACK/proposal measurements independently approved; E8/E9 pending |
| `E7` First-cause diagnostics & required-domain evaluation | Bounded key-based diagnostic aggregation retaining `firstSample`, `latestSample`, original cause, boundary, owner, trigger, and explicit truncation/eviction loss accounting outward on `AdminControlSnapshot`; complete keyed readiness disposition over published required node domain | `src/control-plane/control-plane-diagnostics-ledger.js`, `src/control-plane/authoritative-node-evidence-reconciler.js`, `src/control-plane/control-plane-readiness-diagnostics-eligibility.js`, `src/control-plane/control-plane-system-table-gateway-dependency-resolution.js`, `src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`, `src/admin/admin-control-snapshot-control-plane-diagnostics.js`, `src/control-plane/control-plane-readiness-service-node-methods.js` | Every required node in published membership receives an explicit readiness entry; `ControlPlaneDiagnosticsLedger` bounds payload values, preserves distinct-key root causes under secondary churn, and exposes explicit loss accounting (`evictedKeys`, `overwrittenEntries`, `droppedSamples`, `truncatedStrings`, `truncatedArrays`, `truncatedObjects`, `totalLossEvents`) outward on `AdminControlSnapshot` | `test/control-plane/control-plane-readiness-service-cluster-health-and-recovery-diagnostics.test.js`, `test/admin/admin-control-snapshot.test.js` | Bounded mechanism verified at `fffd9add`; outward field names reconciled; E8/E9 pending |
| `E8` Composed verification on faithful substrates | Deterministic repros with negative controls and process-isolated embedded-cluster verification covering E1–E7 on one canonical candidate SHA | `test/closure/registry.json`, `test/integration/helpers/embedded-cluster-harness.js`, focused unit/integration suites | Fresh independent verifier must bind approval and negative controls to the final committed candidate; earlier approvals retain only their measured scope | Focused + embedded-cluster tests (`test/integration/public-application-database-multinode.integration.test.js`) + independent verification `approve` | In progress |
| `E9` Unchanged physical acceptance & closure | Three consecutive green fresh-state runs of `fresh-formation-user-table-routability` on `local-three-node.json` (`adam-laptop,lenovo-laptop,tv-dator`) and admitted proof receipt | `scripts/lab.js`, `solve/quests/fresh-formation-user-table-routability/evidence/receipt.json` | Full node logs, harness reports, and admitted receipt bound to exact candidate SHA | `node scripts/lab.js harness run fresh-formation-user-table-routability --base test/distributed/config/local-three-node.json --nodes adam-laptop,lenovo-laptop,tv-dator` (x3 consecutive, frozen clean candidate) + `node scripts/solve.js probe --id fresh-formation-user-table-routability` | In progress |

## Decision log

- 2026-11-04: Created `operation-integrity-and-reliable-formation` for milestone
  `0.4.1` (`RM-0.2.9-published-operating-contract`), binding work packages
  `E0–E9` to one composed candidate starting from reviewed baseline
  `77e5b4c5ba01826f2ddceecb088f56fcd27b436e` (current `HEAD`
  `63e4a854b783d4b3176b3ecd123677384c96fafa`). Preserved existing quest seals
  (`fresh-formation-user-table-routability`,
  `serve-eligibility-committed-epoch-read`,
  `fresh-create-release-authority-from-committed-operation`,
  `replica-admission-from-committed-operation`) and `0.5` successor dependencies
  for five-node comparative qualification.
- 2026-11-05: Reopened `E1`, `E2`, `E3`, `E4`, `E6`, `E7`, and `E8` to address
  the 2026-11-05 independent observer findings on one candidate while retaining
  completed subcases: single-owner custody unregistration and shared incarnation
  provenance (`E4`/`E2`), removal of RF3 observed-singleton quorum downgrade and
  positional `routingReadinessDimension` in `awaitPostOverlayRoutingRepair`
  (`E1`), CDC actual-prefix pressure + live credit retention + absolute
  `dueAtMs` retry deadlines + `command.acknowledged` batch verification (`E6`),
  and bounded cost / progress-without-admin-polling / diagnostic loss accounting
  / receipt applicability (`E3`/`E4`/`E7`/`E8`/`E9`).
