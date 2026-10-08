# C0 complete-operation contract review packet

Status: submitted for independent review; NOT an approved source repair.
Runtime source: `82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af`.
Owner-entry measurement: `458b5d2fa0dc2a3774ce15c5dcbee6b787692563`, Actions
`37739512267`; no runtime changes. See
[evidence](evidence/owner-entry-2026-10-08.json) and the earlier
[working census](transition-census.md). Later analysis refines, not rewrites,
the original direct-adapter measurements.

## 1. Acceptance and implementation are separate

The existing `message-group-fresh-identity-membership/quest.json` is the
acceptance authority. Its original sealed record is unchanged. The tables
below express its owner interactions and identify missing implementation;
they do not claim that planning/handler membership has been unparked.

Current source confirms the planner parks message-group membership in
`src/rebalancer/unified-rebalancer-rebalance-loop.js:58-84` and the handler
refuses direct CREATE in `src/node/message-group-service-handler.js:181-199`.
The inspected `src/rebalancer`, `src/node` and `src/message-group` paths have
no production `ADD_LEARNER`/`PROPOSE_MEMBERSHIP_TRANSITION` caller. The semantic
runtime primitives and component tests are not the end-to-end workflow.

Notation: O is the immutable admitted operation; S is its old source replica;
T is its permanently fresh target. Both identities include their exact group
and physical generation. An address or a node name alone is neither S nor T.
A proposal result is not a committed-membership observation.

## 2. Successful replacement: complete transition table

| Trigger / phase | Authoritative input | Authorized action and owner | Durable completion fact | Lost answer / restart | Remaining obligation and release owner |
| --- | --- | --- | --- | --- | --- |
| Placement requests REPLACE | Existing planner intent; exact S generation; fresh T; current operation admission | Coordinator/repository admit O and acquire the one per-group membership lane | Canonical operation row, immutable identity and unique lane | Adopt exact durable winner, never mint a second replacement from an ambiguous insert | Operation owner retains lane and admission obligation |
| O may attempt learner admission | Exact current operation/owner fence and nonterminal-first admission rule | Existing repository records pending membership authorization BEFORE runtime proposal | Durable pending membership obligation | Unknown proposal outcome remains outstanding; a single absent observation cannot prove never-admitted | Membership obligation survives ordinary terminal settlement |
| Pending learner admission | Exact current leader/configuration and O/T authority | Existing runtime proposes ADD_LEARNER for T only | Applied committed configuration plus exact permanent T mapping | Re-observe committed owner facts; fence late/replayed requests; no genesis or same-identity move | Lane retained until safe definitive non-admission or reconciled completion |
| T is committed learner | Exact join descriptor and durable CREATE CAS for T generation | Existing CREATE owner admits one physical worker; install/replay through its owner | Durable CREATE generation/attempt plus real group-state/applied boundary | Lost CREATE response adopts exact current attempt; successor generations refuse old work | CREATE worker/cleanup owners retain their own obligations |
| T has real state and current configuration generation | Target-owned applied observation; leader-owned commit and match; current term/configuration | One runtime-owner turn validates catch-up and proposes PROMOTE T | Fresh applied committed voter observation, not the proposal response | Re-read exact configuration after term/config drift; never normalize missing progress to 0/0 | O remains responsible for source retention/handoff |
| T is a committed voter | Fresh target voter and named leadership-handoff evidence | Existing operation/leadership owners arrange handoff while S remains ACTIVE | Handoff's required owner observation under the sealed contract | Unknown handoff is not removal permission | Source-retirement obligation still held |
| Handoff complete | O's exact S identity, current leader/configuration, target retention requirements | Existing runtime proposes REMOVE S (not T) | Fresh committed absence of S from current leader/quorum | Lost REMOVE response resolves against exact S absence; do not issue target rollback | Membership owner resolves serialization only on its sealed proof |
| S absent in leader/quorum configuration | Exact committed removal and generation-bound cleanup claim | Existing membership/lifecycle owners release membership lane and authorize exact S cleanup claim | Durable obligation resolution and exact claim | Ordinary terminal row may remain for cleanup without retaining the membership lane | Source-own applied absence separately gates stopping its port |
| S has applied its own absence | Exact S generation and local applied membership fact | Existing local lifecycle owner stops S; cleanup owner deletes only authorized artifacts | Exact generation cleanup completion | Late A cleanup cannot delete later B files; unavailable authority defers | Cleanup and storage accounting finish under their own owners |
| Repeat for second source | R1 membership obligation fully resolved | Existing operation owner admits R2; same chain, distinct off-seed target storage | Two off-seed voters in the intended three-voter configuration | Restart/seed-loss must retain quorum and authoritative data operations | Final physical acceptance proves SQL/CDC/cache/routing; component green is insufficient |

Ordinary terminal settlement can occur independently of membership and
physical obligations. This table does NOT impose a new universal reservation
release point: approved storage retain/release/expiry/recovery accounting
continues to decide that fact. Nor does source-own applied absence become an
extra prerequisite for the leader/quorum membership-lane decision.

## 3. Failure branches and exact mutation subject

The abandoned permit WIP at `cd366cc0` must not be adopted as a successful
replacement protocol: its own final log entry records the target-based
REMOVE/release versus old-source-retirement conflict.

| Observed committed effect | Required response | Forbidden inference | Disposition |
| --- | --- | --- | --- |
| Terminal-first before pending learner authorization | Existing repository decides definitive non-admission; stale invocation must remain fenced | Missing local phase means no late proposal can exist | Existing sealed contract; prove the zero-physical-work control |
| Learner proposal attempted, answer unknown | Retain exact O/T membership debt and lane; re-observe through current owner | Timeout, cache absence, or ordinary terminal status means no learner was admitted | Existing sealed lost-answer contract |
| T committed as learner, operation cannot continue | Reconcile the admitted target obligation; any removal is of exact T and requires current owner authorization/committed absence | Successful source-retirement REMOVE S and failed-target REMOVE T share one implicit subject | Separate subject required; no accepted WIP implementation |
| T promoted, S still retained | Preserve quorum and committed identities; choose explicit forward recovery versus safe abandonment through the protocol owner | Generic operation failure automatically permits deletion of the new voter | J1: phase-specific policy is not completely selected by the existing statement; review/judgment required before source changes |
| Source removal attempted, answer unknown | Resolve S's exact committed status and preserve T | A stale phase label permits target rollback | Existing source-retention/absence obligations apply |
| S already committed removed | Preserve T as surviving replacement; continue exact S cleanup/recovery | Failure means remove T as compensation | Target-based generic rollback is forbidden by the successful replacement invariant |
| Cleanup answer lost / successor generation present | Existing cleanup claim re-observes exact generation; refuse mismatched or unavailable authority | Row terminality or reused path proves files belong to this cleanup | Existing identity/cleanup contract |

### Proposed narrow resolution for review, not new runtime authority

Keep O's immutable S/T pair. Do not change the meaning of targetPeerId between
stages. An existing operation-owner decision derives the requested membership
subject from its admitted intent: ADD/PROMOTE T, successful retirement S, or
separately justified failed-target reconciliation T. The request and returned
absence/commit observation must name the SAME exact subject. Callers cannot
select a recovery mode to choose whom to remove.

The existing semantic runtime already resolves `request.replicaIdentity` into
its peer id and config-change context (`raft-rs-membership-transition.js`,
`transitionCommand` / `normalizeMembershipTransition`). It must remain the
configuration/progress authority; adding a second membership store is not a
solution. Reuse its operation/stage/configuration fencing, while checking
whether source versus target obligations need distinct transition identities
under O. That last identity choice and J1 require explicit review before any
permit field or semantic-port change. This packet does not re-seal FreshMG.

## 4. Workflow authority: corrected interpretation

The actual durable operation write is `persistFn` inside
`OperationWorkflowTransitionOrchestration.runAtomicTransitionUnderLane`, after
local `transitionStep` and before `markTransitionCommitted`.
`persistOperationWorkflowTransitionToDurableRow` itself checks only history
length. The current name/comment is not proof that it writes SQL or validates
all history content.

However, `operation-workflow-port-freshness.js` contains the existing
`basisPrefixDiverges` / `resolveOperationWorkflowPublicationFenceState`
check consumed by the owner ports. The GCP witness confirms a matching prefix
is CURRENT and the tested conflicting prefix is STALE. Do not introduce a
second prefix-validation owner from the isolated callback finding.

The default `operation_progress` store is volatile. Real scheduler/owner
entries can overlap under the injected load barrier: one CAS wins, one loses,
and two retry_requested events are appended. With actual repository policy
and active remote-retry evidence, BOTH commands are no_operation_effect.
The owner-lane-first control refuses reentry entirely. Therefore the original
raw-adapter LOCAL_AUTHORITATIVE double-dispatch witness is NOT evidence of
duplicate dispatch on this remote-retry path.

Remaining workflow questions are bounded: downstream consumers of duplicate
volatile events; changes in actual row/lease/retry facts across awaits; and
real disk-failure/restart between local mirror and durable commit. The measured
schedule used fixed observation rows and an explicit awaited-port barrier.
It is not proof that that exact timing happens uninstrumented in production.
No blanket CAS repair or additional queue/store is authorized by this packet.

## 5. Snapshot/restart: actual chain versus proposed contract

The authoritative comparison target for the proposed solution is the
preserved `9554f689` snapshot-catchup draft. It is not accepted production code.
Current source has several useful pieces, but not the whole desired path:

| Interaction | Current source | What this proves / does not prove |
| --- | --- | --- |
| Install dispatcher on partition instance | bootstrap/shared/snapshot-catchup-wiring.js:100-135 | A callback can be called; installation is not automatic runtime engagement |
| Pass catch-up callback into port request | partition/partition-service-raft-init-base.js:458-463; raft-operation-port-request.js:50 | The request declares snapshotCatchupNeeded; inspected src has no runtime consumer of that request field |
| Receive on registered bulk route | snapshot-catchup-wiring.js:184-225 | Calls the common receive/install orchestration through existing factory/registry |
| Receive -> shutdown -> request install | snapshot-catchup.js:362-414 | Shuts service before install decision; request carries path/index/identity but no fresh CREATE claim or receiver-native accepted Ready binding; rejection returns without reconstruction on this path |
| Fresh raft-rs image install | snapshot-install.js:514 onward | Requires exact CREATE admission/physical worker for the raft-rs image kind; that correct safeguard must not be bypassed to make an intact-member path work |
| Native Ready durability | raft-rs-runtime-owner.js:1048-1080; raft-rs-durable-store.js:404-413 | Persists snapshot/log/HardState before dependent work; this is not a demonstrated atomic SQL application-image installation |
| Native Ready continuation | raft-rs-runtime-owner.js:975-1028 | Applies committed entries/advances; the inspected path does not connect a received file-backed application image to that Ready transaction |
| Existing end-to-end test | test/raft/snapshot-catchup-end-to-end.test.js | Explicitly tests refusal of an installed legacy-format image, not successful intact rs-raft application catch-up |
| Fresh learner component test | test/message-group/message-group-fresh-learner-snapshot.test.js | Drives a real group plus component transfer/install under supplied CREATE authority; not the full planner/handler replacement path and not intact partition catch-up |

The missing callback and application-image links are source-level findings,
not results of a multi-host failure campaign. Before repair, validate aliases
and owner interactions, and retain the existing positive/refusal component
proofs on the exact candidate. A generic SQLite image, a raft-rs replica image,
and an intact partition application snapshot cannot be assumed interchangeable.

### Four gates to retain

LOCAL_OPEN: reconstruct an intact replica from its valid local durable facts;
no new live-majority precondition for cold restart.

KNOWN_WIPE: readable current storage plus authoritative prior-existence and
missing durable history is a distinct unsafe-reuse decision. Do not recreate
the same voter on empty history.

INSTALL_ADMISSION: the receiver's actual accepted native snapshot Ready must
be bound to the exact application image and generation. A sender assertion,
staged bulk file, or fresh-CREATE capability is not an interchangeable grant.
Historical committed snapshots may be admissible; this is not a new demand
for current majority connectivity or latest wall-clock configuration.

READ_UNAVAILABLE: block the transition requiring that fact and retain its
retry/obligation owner. Do not turn inability to read into absence, a wipe,
a global HOLD, or permission to install.

## 6. Recommended next authorized unit

First obtain independent contract/harness review of this packet. Keep C0 open
until its actual classification requirements are satisfied. The first product
work remains the existing FreshMG operation-owner interaction: resolve exact
membership subject and the promoted-target failure policy before completing
runtime wiring. Snapshot/partition application catch-up belongs to its existing
cutover frontier and is not repaired by passing a counterfeit CREATE grant.

No source safety defect has been proved by the raw progress baseline alone.
The success of the narrower GCP controls is evidence for NOT adding speculative
progress machinery. Broad architecture convergence, physical off-seed
acceptance, restart-inclusive certification and A1-v13 compatibility approval
remain gated. All original Quest statements and salvage refs remain intact.
