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
  - replica-create-timeout-replay-custody
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
- **Integration owner:** `codex:formation-takeover` on
  `work/formation-takeover-20261105`. The original composed branch
  `work/composed-05-comparison-readiness-20261103` and its preservation mirrors
  remain unchanged.
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

## Current integration summary

Updated 2026-11-05 by `codex:formation-takeover`. Governing rule-set revision
`5`, rules/router source `2fca51dc9a2f0344e23f0535dfa50fe0e000b674`.
The stopped Gemini source and its remote preservation branch both resolve to
`fffd9addfd600cf58bc0c40b1c7df43d5ba4a899`. Work continues on
`work/formation-takeover-20261105` in an isolated worktree; the original
worktrees remain unchanged. The accepted baseline above is not advanced.

Independent review `subagent:/root/formation_independent_review` rejected the
inherited verification package: the no-poll case injected completed cache
rows, the cited public embedded test used one runtime, two edited production
files exceeded 800 lines, and the hydration witness lacked interaction
registration. These are proof/steering defects, not a newly demonstrated
formation regression. The seven focused baseline suites passed 758 assertions.
The extracted diagnostics and CDC state helpers passed the three affected
suites (522 assertions). Reviewed frozen candidate
`2f344fde524ab6077033c4131881aca56e7fe9a3` then passed 17 affected suites on
locked `lenovo-laptop` (1,173 assertions), including the separate native
owner-wake negative control. The native cleanup witness passed eight assertions
on locked `tv-dator`. These remain separate from public formation acceptance.

The genuine three-process no-admin-poll witness failed on `2f344fde` at the
public harness CREATE probe within its unchanged budget. All three retained
guards report `installed:true,calls:[]`. The seed's first provisioning refusal
at `2026-11-05T09:14:48.688Z` was typed `PROVISIONING_UNAVAILABLE`, but the schema
job owner persisted it as terminal `FAILED`, so later attempts replayed it.
This repeats the historical schema-provisioning collision/retry failure class.
The repair retains the canonical fenced retry and answers the current refusal
as `DEFERRED/RETRY`, with identical epoch/reasons/retry delay through SQLSTATE
`57P03`. It changes no quorum, wait budget or timer policy and does not migrate
previously terminal rows. The production-seam red and green logs, distinct-owner
lease/recovery control, and retained six-file live evidence are recorded in the
Quest logs. Broader checks also exposed two unchanged April-era quorum fixtures;
they now enforce RF2's quorum and exercise RF3's real caller minimum with actual
GENESIS replica/node identities. The repaired source is frozen at
`9f9e039269bf04a6f19def12c5940cd8244df5df`: five schema/quorum suites pass 413
assertions; strict classifier complexity passes. E8 then passed 20 assertions
on locked `tv-dator` in 136,132 ms. Its logs contain 67 temporary quorum
refusals before recovery and all three no-admin guards remain empty. Six copied
evidence files match their remote hashes. The verified 33-file archive is
`sha256:ea38366b8e7fdfb90123d5cfcb6589a75cd8443b628e6f5e41d9eda3f0a64019`,
linked by the canonical evidence-store finding in the formation Quest.

Audit reconciliation preserves the formation seal: E8 did not satisfy its
H1-before-source ordering, and later green cannot retroactively do so. The
bounded schema custody repair is recorded under the already-sealed
`serve-eligibility-committed-epoch-read` F10 contract. Original formation
receipts remain false. The receipt audit found an inherited 100 ms
`ServeEligibilityOwner` regression timer contrary to the unchanged no-new-timer
constraint. The bounded F10 repair removes that polling arm and retains one
real source event across an in-flight committed read, including a failed read.
Revocation generation remains separate from non-revoking lease refresh.
Before the repair, composed public CREATE/cohort/readiness/cache witnesses
failed eight assertions; owner witnesses failed six. Four focused files now
pass 480 assertions. Deliberately dropping the retained wake or restoring the
poll each fails its intended witness. Production source hash is
`02c907fd954943d524ddef6bf7191582e7f0868713d1b88aa44255e4b146b33e`.
Independent exact-source review approves this bounded mechanism at the hashes
recorded in the F10 Quest log. Frozen commit
`340e34e484c04bb2badacfc97b5aa34aedf5c74a` ran the canonical 150-file Q6 set
on four locked lab hosts: 138 passed, 12 failed, 6,274 runner assertions. The
genuine three-process no-admin-poll witness passed on that source. All twelve
failing files also failed with the same first-failure signature on frozen
predecessor `d717874ca0d0271802f584ad654d006b24450d21`, on their same machines.
Complete logs and ledgers are uploaded through the evidence owner at
`sha256:14c19ad9c8ebf02aceb2fccd370365d5ecd2110c073bd5286461beaf12c39d92`
(candidate) and
`sha256:41b1bb2e5dfcd1adb0f1b3c89c273b299dac7721288ccdd6760bf63c2c5cf1cb`
(comparison). These inherited failures remain open; no broader green or physical
formation acceptance is claimed.

The new sealed bounded Quest `replica-create-timeout-replay-custody` addresses
the participant's timeout/replay mismatch exposed by the physical baseline.
Its real handler, admission and lifecycle owners reproduce the unchanged
PENDING timeout while an authority read waits. Retained recovery before replay
succeeds, whereas direct replay loses custody. The current working candidate
reconciles exact FAILED lifecycle evidence into admission FAILED and preserves
typed deferral at the initial-status boundary, including the actual
`sql_transactions-p1` priority path and unavailable classification authority.
It reuses existing attempt rotation, failure settlement and worker release.
No timer, retry budget, cleanup policy or shared-worker semantics change.
Forty-two composed cases and fifteen retained-recovery cases pass locally;
five controlled negative treatments fail their intended behavioral assertions,
including both returned and rejected classifier-read unavailability.
Thirty fence controls cover terminal operations, cleanup claims, CLOSED
admissions, boot changes and changed identities across three wait points on
ordinary and priority partitions. Independent exact-source re-review approves
the bounded repair and its component proof. Frozen commit
`9ee285e1a5d4aacdaee43c8ae9c5cd24049f94bf` passed the eleven-file locked-lab
interaction proof on `tv-dator`: 1,019 assertions, no retries and no controller
assignment. Independent review verified the original controller completion
record, exact source, complete per-file ledger and archive hashes. This repair does not
identify the physical authority delay, settle formation H1 or prove physical
cleanup completion. The historical epic YAML parser defect was separately
reviewed and repaired without changing acceptance fields and is included in
the same `9ee285e1` checkpoint.

The canonical 1,350-file change cone for `340e34e4..9ee285e1` completed on four
locked hosts, with seven reserved files explicitly assigned to `tv-dator`:
1,325 passed, 25 failed, 44,833 runner assertions. Independent review reconciled
the exact disjoint per-host manifests and retained nested fixture records
separately. Same-host predecessor runs at `340e34e4` failed 23 of those files;
package installation and seed-release custody passed there. Fresh-seed
activation also has a different first failure. These differences remain
unattributed, and historical reproduction does not waive any failure. Earlier
Q6 adds six distinct unresolved files, for 31 across those two measured sets.

The current WIP adds the bounded F10 committed-node liveness repair: both
rebalancer consumers delegate lease meaning to the existing semantic owner,
and critical topology refuses missing, non-READY, malformed or empty committed
answers without cache fallback. Three component suites pass 188 assertions;
four mechanism mutants fail their intended assertions. Independent exact-source
review approves the four-file change for preservation. Its 33-file evidence
archive is `sha256:df9403129d09ddb340e10353a8ed2bad77ccdaf3f4ef4689358f8a551aec19f4`.
Frozen-head lab verification remains unsubmitted. No Quest was landed.

At the user's WIP-push request, all agent edits were frozen. The proposed
CDC logging fixture, hydration prerequisites, obsolete constants and simulation
logging-clock repairs remain unimplemented. The FAILED cleanup investigation
found an inherited recipient accepts null-token cleanup without consuming the
exact CREATE terminal decision; a paired live-retain/terminal-cleanup proof and
explicit bounded scope decision are required before changing that policy.

All five registered lab hosts are reachable with the required toolchain.
`carinas-windows` now uses an isolated dependency-current worker checkout at
`/home/peter/projects/lagrange-lab-worker-20261105`; its original dirty package
files and HEAD were hash-checked unchanged. Its exact `9ee285e1` validation
passed ten files and failed the native authority-unavailability case at the
release deadline, retaining all 1,019 reported assertions. This is not an
all-green workload claim. `adam-laptop` remains usable for native tests but has
only about 2.4 GB free on the Docker root; privileged storage maintenance is
unexecuted. The prepared relocation script is a retained, unreviewed operator
proposal only and needs interactive sudo. No host images or evidence were
pruned. The final fleet probe reports all five dependency/toolchain-ready and
all machine locks free. Fleet capability and physical service acceptance remain
separate. The reopened 128-file WIP archive, including raw candidate/comparison
logs, eleven actual controller completion records, triage, host preparation and
unexecuted operator proposals, is
`sha256:77a21c3b855adcd03d262467cc77bc43049e4ec2c6e63b4cef0c4d83a6a510e7`;
its verified evidence-store reference is in the replay Quest log.

The startup ownership dependency has current independent source review and
seven passing suites (743 assertions). Its shutdown witness now measures live
watcher removal after subscribe-before-hydrate, zero profile-detection reads,
and no later loop; the startup interaction is registered. The final witness
rerun passes 147 assertions. This remains bounded mechanism proof, with its
historical replay limitations and spent-bound certification policy intact;
Solver landing is pending.

Fresh-release sequencing remains explicit: the sealed first-admission-send
boundary and C1-C3 follow-up is conditional on both owning changes reaching
main. Verified remote main `644017d7155882f98ab01bf7bc0900ff3eaf090d` contains
neither. Current runtime-open and resumed-SYNCING markers conservatively retain
cleanup custody; no new orphan path was demonstrated. This is a retained
conditional obligation, not a silently waived requirement.

The registered physical baseline on clean
`d717874ca0d0271802f584ad654d006b24450d21` failed on
`adams-gamla,lenovo-laptop,tv-dator` at 2026-11-05 11:40:32 UTC. It never opened
the serve lane; priority spread, quiet, routability, projection agreement and
observation integrity also failed. The 22-file full-log/report/playback archive
was reopened, hash-checked, uploaded and downloaded through the evidence owner:
`sha256:00956b36b2f84c73baa51c1961bf0f3d502e6c720d0089f4a8a780630d6ddd7c`.
It is a diagnostic baseline, not an acceptance streak. A read-only preflight
found `adam-laptop` below the existing 10 GiB free-space requirement; the run
used three other physical hosts under existing locks and unchanged budgets.
This scenario lacks `SCENARIO_CERTIFICATION_REQUIREMENT`: use its ordinary
physical harness route with exact committed source/image evidence, and do not
claim the distinct `--certify` certificate. The receipt remains failing.

The independently traced ADD `91ab63d0-edcc-40e1-a6c6-952d5b70aa4b` /
`sql_transactions-p1-r5` enters durable PENDING at 11:34:58.013 UTC, spends its
30-second state bound, and persists FAILED at 11:35:39.212 before CREATE first
reports starting at 11:35:44.645. Replay then rejects FAILED-to-PENDING.
Admission materialization and the worker claim follow PENDING persistence;
the retained trace cannot identify which authority await held startup. This
sequence predates the takeover. Direct replay's MATERIALIZED admission versus
FAILED lifecycle interaction is reproduced and repaired by the bounded Quest
above, without attributing the preceding physical delay. The subsequent cleanup
refusal is retained separately. There were no
learner-address refusals, so the specific H1 settling observation remains
unavailable; aggregate CDC acceptance holds do not prove it.

Next actions after WIP preservation: verify the liveness repair's focused
contract on its frozen commit; resolve the measured historical owner/fixture
failures and differing predecessor outcomes; finish lab workload capacity;
then resume the unchanged physical scenario and obtain three consecutive greens
on one exact candidate. Integration owner retains the cleanup interaction,
H1 attribution, Quest landing, publication and milestone acceptance as distinct
obligations. Keep every formation receipt red until its exact-candidate evidence
closes the sealed claim. No further proof run is queued at this checkpoint.

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
| `E1` Authority & metadata meaning | Preserve `ELIGIBLE`/`INELIGIBLE`/`ABSENT`/`UNAVAILABLE` definition outcomes; decisive SQL authoritative absence vs unavailable routing; sealed quorum-minimum initial partition provisioning without observed-singleton RF3 downgrade; `PUBLISHED`-only epoch floor; complete `SELECT` plan propagation and post-overlay routing snapshot repair | `src/node/runtime-service-definition-resolution.js`, `src/node/runtime-service-generic-replica.js`, `src/control-plane/serve-eligibility-owner.js`, `src/query/sql-query-engine-metadata-authority-refresh.js`, `src/query/sql-query-engine-initial-partition-provisioning.js`, `src/query/sql-query-engine-provision-target-methods.js`, `src/query/query-executor-partition-routing-snapshot.js` | Authoritative SQL absence overrides and evicts stale cached presence; RF3 sealed quorum minimum (`2`) never downgrades to `1` on observed singleton node count; `awaitPostOverlayRoutingRepair` passes positional `routingReadinessDimension` through the overlay/serve-refresh chain | `test/node/runtime-service-handler.test.js`, `test/query/sql-query-engine-cold-metadata-plan-coherence.test.js`, `test/query/sql-query-engine-provision-partition-waits.test.js`, `test/control-plane/serve-eligibility-owner.test.js`, `test/control-plane/serve-eligibility-committed-epoch-read.test.js`, `test/query/sql-query-engine-execution.test.js` | In progress (retaining `65cc65b62`, `c10f1f854`; closing RF3 singleton downgrade and post-overlay snapshot call) |
| `E2` Role-publication freshness & voter readiness | Monotone revision-fenced role publication and shared incarnation-fenced `raft_role` preservation across durable persistence and local seeding; purpose-specific voter readiness | `src/raft/authoritative-row-mutation-helper.js`, `src/partition/partition-service-metadata-mutation-helpers.js`, `src/message-group/message-group-service-metadata-publication.js`, `src/node/replica-state-machine-lifecycle-observation.js`, `src/node/replica-state-machine-transition.js`, `src/node/replica-handler-create-status-methods.js`, `src/node/replica-handler-status-methods.js`, `src/raft/replica-voter-readiness.js` | Superseded flush revision and stale cached `raft_role` yield to current live Raft role; durable role persistence and local priority seeding share one incarnation-matching rule in `replica-state-machine-lifecycle-observation.js` | `test/raft/authoritative-row-mutation-helper.test.js`, `test/partition/durable-voter-visibility-role-write.test.js`, `test/node/replica-state-machine.test.js`, `test/node/replica-local-only-row-convergence.test.js`, `scripts/check-voter-readiness-single-owner.js` (metric 0) | In progress (retaining `65cc65b62`; unifying incarnation rule across durable persistence and local seeding) |
| `E3` Causally read-only observation & honest admin liveness | Zero observer-originated product cache writes and convergence progress without admin polling; outward `inFlightCount` uses `replica_operations` terminal state without active-service shortcuts or local observer startup-time erasure of remote owners' operations | `src/cache/read-only-system-table-cache.js`, `src/node/node-runtime-local-authorities.js`, `src/admin/admin-control-snapshot-local-build-base.js`, `src/admin/admin-control-snapshot-leadership-summary.js`, `src/rebalancer/replica-operation-liveness.js` | Read-only cache proxy throws `READ_ONLY_SYSTEM_TABLE_CACHE_MUTATION` on write/reconcile; `ignorePreRestart` requires actual operation owner start-time evidence; convergence progresses without `getControlSnapshot` polling | `test/admin/admin-control-snapshot-local-published-membership-recovery.test.js`, `test/admin/admin-control-snapshot.test.js` | In progress (retaining `f8a16904f`; adding explicit convergence-without-admin-polling proof) |
| `E4` CREATE, retry, transition & cleanup custody | Post-`ACTIVE` transient progress deferral preserves live runtime; confirmed boot/attempt supersession fences and retires superseded runtime via single cleanup owner (`fenceFailedReplicaCreateRuntime`); per-call admission observation; workflow visibility across concurrent admission/membership advancement and terminal timestamp adoption; bounded mutation retry cost | `src/node/replica-create-admission-owner.js`, `src/node/replica-create-admission-retained-recovery.js`, `src/node/replica-runtime-cleanup-custody.js`, `src/node/replica-create-process-owner.js`, `src/node/replica-handler-create-methods.js`, `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js`, `src/rebalancer/operation-workflow-coordinator-created-handoff-scheduling.js`, `src/rebalancer/operation-workflow-transition-retry.js` | Per-call `{progressed, row}` prevents cross-call `lastAdvanceRow` bleed; retained recovery delegates runtime unregistration exclusively to `fenceFailedReplicaCreateRuntime` and requires positive tagged/instance identity match; workflow UPDATE confirms when concurrent admission/membership owner advances its fields | `test/node/replica-create-admission-owner.test.js`, `test/node/replica-create-admission-recovery.test.js`, `test/node/replica-runtime-cleanup-custody.integration.test.js`, `test/rebalancer/replica-operation-confirmation-authority-read.test.js`, `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js` | In progress (retaining `f8a16904f`, `65cc65b62`; restoring single cleanup owner and positive identity match) |
| `E5` Deferred join, config & runtime handoffs | Deferred join message-group activation retains owned retry trigger; subscribe-before-hydrate config initialization; `WasmComponentDriver.#prepareRequestCell` generation fence before and after `stop(serviceId)` | `src/bootstrap/node-joining-message-group-runtime-delegation.js`, `src/config/raft-adaptive-timing-controller.js`, `src/config/dynamic-config-service.js`, `src/runtime/wasm-component-driver.js` | Retained `deferredMessageGroupServiceReplicaIds` re-drives on bounded timer until empty or shutdown; `WasmComponentDriver.#prepareRequestCell` aborts after `await stop(serviceId)` if service generation changed | `test/bootstrap/node-joining-service-message-group-activation.test.js`, `test/config/raft-adaptive-timing-controller.test.js`, `test/config/dynamic-config-service.test.js`, `test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js` | Complete (`65cc65b62`) |
| `E6` CDC fairness, exact coverage & hydration handoff | 3+ contender FIFO slice fairness with live credit retention across delayed ACK continuations and lifecycle-only contender retirement; bounded `<= 256` hydration ACK batches with actual-prefix pressure preserved; absolute retry timer deadlines (`dueAtMs`); pre-hydration invocation retirement via progress-cell `logIndex` and verified `command.acknowledged` batches | `src/topology/cdc-group-propagation-durable-delivery.js`, `src/topology/cdc-group-propagation-service.js`, `src/partition/partition-cdc-obligation-progress.js`, `src/partition/partition-cdc-obligation-delivery.js` | Reservation hold expiry (`300ms`) allows ready work without dropping a live contender's FIFO queue position or credit; actual owed-prefix pressure (`readOwedCdcHead`) bounds retained delivered rows; retry timer preemption compares absolute `dueAtMs`; `command.acknowledged` batches verified `<= 256` | `test/topology/cdc-group-propagation-service.test.js`, `test/partition/cdc-hydration-live-handoff.test.js`, `test/partition/partition-cdc-obligation-reclamation.test.js` | In progress (retaining `f8a16904f`, `c10f1f854`; completing interaction package for prefix pressure, live credit, `dueAtMs`, and `command.acknowledged`) |
| `E7` First-cause diagnostics & required-domain evaluation | Bounded key-based diagnostic aggregation retaining `firstSample`, `latestSample`, original cause, boundary, owner, trigger, and explicit truncation/eviction loss accounting outward on `AdminControlSnapshot`; complete keyed readiness disposition over published required node domain | `src/control-plane/control-plane-diagnostics-ledger.js`, `src/control-plane/authoritative-node-evidence-reconciler.js`, `src/control-plane/control-plane-readiness-diagnostics-eligibility.js`, `src/control-plane/control-plane-system-table-gateway-dependency-resolution.js`, `src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`, `src/admin/admin-control-snapshot-control-plane-diagnostics.js`, `src/control-plane/control-plane-readiness-service-node-methods.js` | Every required node in published membership receives an explicit readiness entry; `ControlPlaneDiagnosticsLedger` bounds payload values, preserves distinct-key root causes under secondary churn, and exposes explicit loss accounting (`evictedKeyCount`, `droppedSampleCount`, `truncatedValueCount`) outward on `AdminControlSnapshot` | `test/control-plane/control-plane-readiness-service-cluster-health-and-recovery-diagnostics.test.js`, `test/admin/admin-control-snapshot.test.js` | In progress (retaining `c10f1f854`; exposing diagnostic loss accounting) |
| `E8` Composed verification on faithful substrates | Deterministic repros with negative controls and process-isolated embedded-cluster verification covering E1–E7 on one canonical candidate SHA | `test/closure/registry.json`, `test/integration/helpers/embedded-cluster-harness.js`, focused unit/integration suites | Independent verifier (`subagent:bfecb08b-7326-49a4-a70d-9cf10cf4617f`) verifies composed candidate with negative controls | Focused + genuine three-process `test/integration/fresh-formation-without-admin-polling.integration.test.js`, separate owner-wake negative in `test/convergence/dt6-publication-quorum-failback-network.test.js`, and current independent verification `approve`; the historical public seam suite retains its one-runtime ceiling | In progress |
| `E9` Unchanged physical acceptance & closure | Three consecutive green fresh-state runs of `fresh-formation-user-table-routability` on `local-three-node.json` (`adams-gamla,lenovo-laptop,tv-dator`; host substitution recorded below) and admitted proof receipt | `scripts/lab.js`, `solve/quests/fresh-formation-user-table-routability/evidence/receipt.json` | Full node logs, harness reports, and admitted receipt bound to exact candidate SHA | `node scripts/lab.js harness run fresh-formation-user-table-routability --base test/distributed/config/local-three-node.json --nodes adams-gamla,lenovo-laptop,tv-dator` (x3 consecutive) + `node scripts/solve.js probe --id fresh-formation-user-table-routability` | In progress |

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
- 2026-11-05 takeover: preserved the sealed Quest and previous failures;
  corrected the E8 evidence ceiling and registered the hydration interaction
  witness. Diagnostics aggregation and CDC lane bookkeeping are extracted
  within their existing owners to satisfy the scoped size rule. The physical
  host substitution above resolves a disk preflight refusal without deleting
  another run's data, lowering the requirement, or changing the scenario.
