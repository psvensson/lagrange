---
audience: development
documentClass: current
---

# FreshMG 6.B slice B1: current CREATE crosses the handler refusal only for an exact recorded learner

Quest: `message-group-fresh-identity-membership` (epic `raft-rs-full-cutover`).
Runbook: [local takeover](local-takeover-20261010.md) section 6.B, first slice.
Base: `6c6bb915b` on `freshmg/integration-20261010`. Consumed surfaces cite
that base tree; lines marked (B1) cite the working tree after this slice. This
note is a design and implementation record. It is not independent approval,
driver activation, install/open proof or physical acceptance.

## 0. Why the inherited witness answers `error` today

`test/node/message-group-service-handler-membership.test.js:126` (base) expects
INITIATED and exactly one physical create. The trace on `6c6bb915b`:

1. `MessageGroupServiceHandler.handleMessage` routes CREATE_REPLICA to
   `handleCreateReplica` (`src/node/message-group-service-handler.js:152-153`).
2. `handleCreateReplica` (`:187-201`) refuses every message-group CREATE
   unconditionally: status ERROR, reason
   `message_group_membership_change_unsupported`
   (`src/rebalancer/rebalancer-constants.js:475`). The run logs exactly that
   refusal; no read, admission or worker is reached.

Removing that refusal alone would be wrong, because the original fixture cannot
be greened by any owner-respecting handler (the
[implementation frontier](implementation-frontier-20261008.md), "Critical
harness limitation", already recorded this):

- its `cdcIntegrationService` answers every authoritative read with zero rows
  (base test `:22-27`): there is no operation row and no `nodes` boot row, so
  the existing admission owner's `readOperation`
  (`src/node/replica-create-admission-owner.js:343`) and
  `requireCurrentBootIncarnation` (`:440`) can only refuse;
- its learner is proposed directly through `proposeConfChange` (base test
  `:76`), outside any operation permit, so the native owner keeps no operation
  origin and the recorder cannot record it
  (`src/rebalancer/replica-operation-message-group-membership-authorization.js:332-338`);
- the stamp, phase, join package and admission tokens exist only in the
  payload. Crossing the refusal on that fixture means payload-as-evidence.

B1 keeps the witness's name, replaces its fixture with the canonical owners
(real operation row, membership claim, authorization CAS, native ADD_LEARNER
commit, recorder, CREATE CAS, boot row), and keeps the original payload-only
composition as a required negative in the same file. Replacement map of the
original six assertions (also in the test file header):

| Base assertion | Now |
| --- | --- |
| 1 'the real founding group elects' | the learner-operation fixture elects and applies its founding no-op before the operation exists (`test/test-helpers/learner-operation-fixture.js:33-38`) |
| 2 'every surviving voter permanently reserves the same fresh peer id' | kept verbatim in the inherited test; the reservation is now made by the native ADD_LEARNER apply |
| 3 direct `proposeConfChange` answers CORE_OK | the operation-authorized native proposal answers PROPOSED (shared create fixture); a proposal outside any operation leaves no origin the recorder could record |
| 4 'a fresh applied ConfState on every survivor names the exact learner' | kept verbatim in the shared create fixture |
| 5 INITIATED, 6 exactly one admitted physical worker | unchanged |

## 1. Consumed surfaces

| Surface | Citation (base) | Use in B1 |
| --- | --- | --- |
| Shared recorded-fact predicate | `replica-operation-message-group-membership-authorization.js:510-519` (`recordedLearnerFactIsValid`) | The only learner evidence accepted; consumed first, as new branch selection does (`:119-121`). |
| Learner stamp coherence | same file `:38-52` (`priorLearnerStamp`) | Inside the predicate: the stamp names the source voter and the target learner with their identities, at or past the proposal index. |
| Membership identity codec, obligation names | `replica-operation-message-group-membership-permit.js:67-75`, `:19-20` | Decodes the row's own identity; `targetPeerId` must derive from the target. |
| Authoritative membership row read | `replica-operation-message-group-membership-owner-claim.js:48-57` (`observeMembershipOperation`), options `:17-19` | Owner-RPC, leader-required read with absence confirmation, decoded by the repository's canonical decoder (`replica-operation-repository-row-methods.js:79-147`, membership columns kept by `nullableValue`). |
| Column/field pairs | owner-claim `:116-132` (`CLAIM_FIELDS`), `:133-146` (`membershipRowWhere`) | B1 spells the seven fact columns as the same pairs in the authorization owner; see section 8 for why owner-claim is not edited. |
| Durable CREATE admission CAS | `replica-create-admission-owner.js:523-612` (`claim`): WHERE `:546-561` (SENDING, exact `updated_at`, `completed_at` NULL, unadmitted state/token); readback adoption `:579-590`; rotated attempt `:591-597`; terminal `:598-604`; any other no_op `:605-611` | Reused. B1 adds an optional basis merged under the owner's own keys and re-required on adoption. |
| No_op classification | `src/control-plane/control-plane-mutation-outcome-classifier.js:64-72` (NO_OP is retryable) | Why a CAS that loses to a non-matching row answers `REPLICA_CREATE_ADMISSION_DEFERRED`, not STALE. |
| Admission state advance | owner `:614-654` (`advance`, existing `extraWhere`), `:656-662` (`markMaterialized`) | ADMITTED -> MATERIALIZED under the same basis before any worker starts. |
| Process-wide sole-worker owner | owner `:273-307` (`acquire`/`release`, key `nodeId:bootIncarnation`); `replica-create-process-owner.js:96-133` (claim plus durable reread), `:135-148` (revalidate), `:150-157` (release) | Exactly one physical worker per operation per live boot, revalidated against the boot row before the physical call. |
| Admission tokens | `src/rebalancer/replica-create-admission-token.js:5-25` | The request package as the dispatcher builds it (`operation-workflow-dispatch-response-reconcile.js:649-672`). |
| Partition precedent | `replica-handler-create-admission-methods.js:370-392` (claim under `runExclusive`), `:622-652` (`markMaterialized` before the worker), `:529-537` (worker claim); `replica-handler-create-methods.js:134-180` (queued start revalidates, releases) | Same owner calls in the same order; nothing partition-specific is reused. |
| Install admission requirement | `src/raft/snapshot-install.js:364-376`, `:548-561` | Why the worker receives the owner, the exact evidence and the claim: the install slice passes them to `requestSnapshotInstall`, which refuses without them. |
| Leader-produced join descriptor | BOOTSTRAP read purpose `src/raft/raft-committed-membership-constants.js:52`; joiner open `src/raft/raft-rs-operation-port.js:170-180` (`raft-operation-port-request.js:18,23`); exercised in `test/integration/message-group-learner-runtime-authorization.integration.test.js:775-800` | NOT consumed by B1. No `joinDescriptor`/join-package producer exists in `src/` (grep for joinDescriptor, join package, raft_log_or_checkpoint: zero hits). The payload `messageGroupJoinPackage` is a route hint that B1 binds to the recorded identity. |
| Planner, dispatcher, composition | `unified-rebalancer-rebalance-loop.js:67-95` (message groups park); dispatcher request without a package (`operation-workflow-dispatch-response-reconcile.js:649-672`); `src/bootstrap/shared/message-group-service-handler-setup.js:97-106`, delegates `bootstrap-service-control-plane-runtime-methods.js:182-187`, `node-joining-publication-activation.js:550-555` | Why B1 is inert in production (section 7). |
| ACTIVE publication rule | `implementation-frontier-20261008.md`, "Next bounded source interaction" item 3 | B1 never calls `createReplicaAsync` (handler `:203-279`), which registers and activates a services row and emits CREATE_ACTIVE. |
| Composed create capability is a lone founder | every root composes `createMessageGroupReplica` (setup `:97-106`; `bootstrap-service-control-plane-runtime-methods.js:182-187`; `node-joining-publication-activation.js:550-555` -> `bootstrap/phases/create-message-group-replica-lifecycle.js:74`); with no replica list `message-group-service-state.js:148-150` makes `[replicaId]`, and `message-group-service-raft-lifecycle.js:236-239` -> `message-group-consensus-port.js:176-185` campaigns at once | The learner worker never calls it. It calls a separate learner-join capability that no root composes; absent, the CREATE is refused before any read or write. |
| Partition startup admission recovery | `replica-handler-create-admission-methods.js:711-747` -> owner `snapshotTargetAdmissions` (`READ_TARGET_ADMISSIONS_SQL`, base `:51-53`, no entity filter) -> `replica-create-admission-retained-recovery.js:21-39` (`takeoverRetained`, then lifecycle reconcile: ADMITTED advanced without the fact basis, MATERIALIZED without a services row CLOSED, partition CREATE started) | The node's other consumer of the same admission rows. B1 scopes the scan to the recovering handler's entity type, so the partition handler never reads a message-group admission. |

Surfaces B1 adds or changes (none is a scheduler, ledger or protocol):

- `ReplicaOperationField.MESSAGE_GROUP_JOIN_PACKAGE`
  (`replica-operation-constants.js:79`, B1).
- `MESSAGE_GROUP_CREATE_REFUSAL` (including
  `message_group_create_learner_join_capability_unavailable`),
  `MESSAGE_GROUP_JOIN_PACKAGE` and three log names
  (`message-group-service-handler-constants.js:48-53,79-97`, B1).
- The subordinate helper `src/node/message-group-service-handler-create-admission.js`
  (B1), entered from `handleCreateReplica` (handler `:206-209`, B1).
- `recordedLearnerCreateBasis` in the authorization owner (`:522-548`, B1).
- The optional `admissionBasis` of `ReplicaCreateAdmissionOwner.claim` and
  `markMaterialized` (owner `:76,156-164,540,567,600,675-683`, B1), and the
  entity-typed `snapshotTargetAdmissions(entityType)` (owner `:51-56,425-455`,
  B1) with its one caller passing `SERVICE_TYPE.PARTITION`
  (`replica-handler-create-admission-methods.js:714`, B1).
- Handler options `joinMessageGroupReplicaAsLearner`,
  `replicaOperationRepository`, `ownerIncarnation`, `now`,
  `getReplicaCreateAdmissionOwner()` and its release on shutdown (handler
  `:70-77,105-106,319-329,721-723`, B1).

## 2. Mechanism

A CREATE_REPLICA without an own `messageGroupJoinPackage` keeps the existing
refusal, reason and zero effects (the four existing shapes in
`test/node/message-group-service-handler.test.js:207-276` stay green, and a
recorded learner dispatched without the package is refused the same way). With
the package, one algorithm runs (helper `handleMessageGroupLearnerCreate`):

0. Require the composed learner-join capability; absent (every production root
   today) the CREATE is refused non-retryably before any read or write.
1. Read the operation row through the repository's authoritative observation.
   No cache, payload phase, payload stamp or payload identity is read.
2. `recordedLearnerCreateBasis(row)`: decode the row's own identity, require
   `recordedLearnerFactIsValid` and the still-outstanding UNKNOWN obligation,
   and return the identity, the recorded stamp and permit, and the fact's seven
   exact membership columns (identity, phase, obligation, permit, learner, voter
   and removal stamps) as the CAS basis.
3. Require the join package to be exactly `{kind, groupId, replicaIdentity,
   peerId}` with a known kind and bound to that identity. It is handed on as a
   hint, never treated as evidence.
4. Under the admission owner's per-operation lane, `claim(request, basis)`: the
   existing CAS plus the basis; the readback adoption re-requires the basis. A
   REMOVE selection or any other change to the fact columns between step 1 and
   the CAS defeats it. Terminal-first, wrong group/target/node, stale workflow
   generation and a boot change keep the owner's own refusals.
5. Only an ADMITTED evidence of THIS boot may start a worker. MATERIALIZED (a
   worker of this admission already started) or an older boot's admission is
   ADMISSION_RETAINED: IN_PROGRESS, zero work, debt and admission untouched.
6. `markMaterialized(evidence, basis + completed_at IS NULL)`: the durable
   ADMITTED -> MATERIALIZED CAS under the same basis and on a still-open
   operation, so a REMOVE selection or an ordinary terminal settlement committed
   after admission but before the worker defeats it (the owner's existing
   `extraWhere`, the same mechanism its attempt rotation uses). Then the
   existing `claimPhysicalWorker`.
7. Answer INITIATED. A queued start checks that the handler still holds this
   owner (not shut down) and revalidates the worker against the boot row, then
   calls the learner-join capability once with the owner, the exact
   MATERIALIZED evidence, the claim and a frozen `messageGroupLearnerJoin`
   (decoded identity, recorded stamp and permit from the row, package hint),
   and finally releases the claim. `createMessageGroupReplica`,
   `startMessageGroupReplica`, services rows, ACTIVE and CREATE_ACTIVE are never
   reached. A thrown learner join emits the existing
   MESSAGE_GROUP_CREATE_FAILED outcome; the admission stays MATERIALIZED.
   With today's composition there is no running target at all: no root
   supplies the learner-join capability, so step 0 refuses.

## 3. Typed failure edges

Every refusal fails closed: no admission write unless stated, no worker, no
physical call, the membership obligation untouched.

| Edge | Outcome | Caller observes |
| --- | --- | --- |
| No join package (every existing dispatch shape) | existing refusal | ERROR `message_group_membership_change_unsupported` |
| No learner-join capability composed (production capability set, with or without repository and boot) | `message_group_create_learner_join_capability_unavailable` | ERROR, `deferRetry: false`, no read, no write, no capability invoked |
| Package not exact, unknown kind, or not bound to the recorded identity | `message_group_create_join_package_invalid` | ERROR, no CAS |
| No repository composed (production today) or the authoritative read unavailable | `message_group_create_learner_fact_unavailable` | ERROR, `deferRetry: true`, no CAS |
| Row absent, identity undecodable, fact invalid (in-flight phase, forged or incoherent stamp, voter/removal stamp, non-canonical encoding, later phase after REMOVE selection), obligation not UNKNOWN | `message_group_create_learner_fact_not_recorded` | ERROR, no CAS |
| Admission boot authority unavailable or replaced | `REPLICA_CREATE_ADMISSION_DEFERRED` | ERROR, `deferRetry: true` |
| Terminal before the CAS | `REPLICA_CREATE_ADMISSION_REFUSED_TERMINAL` | ERROR, `deferRetry: false`, row unadmitted |
| CAS no_op against a non-matching row: fact changed, wrong group/target/node, older workflow generation, unrotated other attempt | `REPLICA_CREATE_ADMISSION_DEFERRED` (owner's existing classification) | ERROR, `deferRetry: true`, row unadmitted or unchanged; after a fact change the redelivery is refused `learner_fact_not_recorded` |
| Closed admission, rotated previous attempt | `REPLICA_CREATE_ADMISSION_STALE` | ERROR |
| Malformed admission package | `REPLICA_CREATE_ADMISSION_INVALID` | ERROR |
| Admission MATERIALIZED, or owned by another boot | `message_group_create_admission_retained` | IN_PROGRESS, zero work |
| MATERIALIZED CAS lost to a fact change after admission | `REPLICA_CREATE_ADMISSION_STALE` | ERROR, `deferRetry: false`, admission stays ADMITTED |
| Ordinary terminal (FAILED) settlement between ADMITTED and MATERIALIZED | MATERIALIZED CAS requires `completed_at IS NULL`: `REPLICA_CREATE_ADMISSION_STALE` | ERROR, `deferRetry: false`, zero physical work, admission stays ADMITTED for its later close owner, membership debt retained. The admission itself was ordered before the settlement by the owner's CAS; B1 stops before physical work rather than let a settled operation start a worker (the earlier B1 draft let the worker run). |
| Claim CAS applied, answer lost, fact moved before the readback | readback re-requires the basis: not adopted | claim rejects (DEFERRED); the later MATERIALIZED CAS would also lose |
| Partition handler startup recovery on a node holding message-group admissions | entity-typed scan | message-group rows are never read, taken over, advanced or CLOSED by it |
| Sole-worker owner refuses (row moved, closed, boot) | `message_group_create_worker_not_admitted` | IN_PROGRESS, zero work |
| Boot replaced, or handler shut down, between INITIATED and the queued start | worker fenced | zero physical calls, claim released, warn log |
| Physical create throws | existing MESSAGE_GROUP_CREATE_FAILED outcome | claim released, admission stays MATERIALIZED, redelivery IN_PROGRESS |
| Lost CAS or MATERIALIZED answer | owner readback adoption | INITIATED once |
| Lost INITIATED answer, redelivery | step 5 | IN_PROGRESS, still one worker |

## 4. Cached-view audit

- `systemTableCache` and the replicated operation cache: not read on the CREATE
  path (the handler's cache use stays in REMOVE's `getKnownLocalReplica`). A
  stale cache cannot admit.
- Payload copies (`messageGroupMembershipPhase`, `messageGroupMembershipIdentity`,
  `messageGroupLearnerStamp`): never read. The package is checked against the
  authoritative identity and handed on as a hint.
- The repository observation is owner-RPC/leader-required with absence
  confirmation; the admission owner reads are owner-RPC/leader-required/critical
  (owner `:56-61`). Either may be stale by the next await; that cannot admit,
  because the CAS and the MATERIALIZED advance both carry the exact fact columns
  and the readback adoption re-requires them.
- `processOwnerRegistry`, `activePhysicalWorkerOperationIds`,
  `laneTailByOperationId`: process-local, keyed by node and boot incarnation. A
  new boot is a new owner whose evidence cannot match an older admission (step
  5). The handler releases its reference on shutdown; at zero references the
  worker map clears (`:295-307`). A queued worker also compares its owner with
  the handler's current one. These maps only ever refuse.
- `handler.inProgressOperations`: bookkeeping only, never an admission decision.
- The partition handler's startup scan now selects by its own entity type in
  SQL, so no message-group row enters its retained-recovery path at all.
- Sealed evidence (`replica-create-admission-evidence.js:13-39`, WeakSet) cannot
  be minted from a payload; only the owner's CAS or readback seals it.

## 5. Identity anchoring

| Artifact | Anchors | Source |
| --- | --- | --- |
| Recorded learner fact | operation, group, source/target replica and node, transition identity, lane key, derived target peer id; committed ADD_LEARNER permit (sequence 1, proposal index, leader term, configuration stamp); learner stamp (term, applied index, generation index, configuration key, voters/learners/identities) | operation row, written only by the recorder's CAS (authorization `:401-431`) |
| CREATE admission | admission token (operation, replica, target node, workflow updatedAt), attempt token/seq, workflow updatedAt, owner boot incarnation, minted `replicaCreatedAt` physical generation | admission owner CAS (`:523-612`), token owner |
| Worker | claim bound to the exact MATERIALIZED evidence of this boot | process owner (`replica-create-process-owner.js:96-133`) |

Anchor moves: a branch selection or any later membership phase changes the fact
columns, so the CREATE CAS or the MATERIALIZED advance loses; terminal before
admission refuses; a boot change defers the claim and fences the queued worker;
a newer workflow generation or another attempt makes the old package lose its
CAS. Holder replacement (owner-claim column) is deliberately not in the basis:
adoption is not a successor grant and does not change the historical fact.

## 6. Witness ladder

Red-first: every witness below was run on the base source (or, for the four
added after the first source change, on the base bytes swapped back in) and
failed at its named assertion; only the legacy-refusal guard passes on base by
design.

- `test/node/message-group-service-handler-membership.test.js`: the inherited
  positive control (strengthened fixture, both assertions unchanged, plus: no
  start, no executor outcome, admission MATERIALIZED, obligation still unknown);
  the original payload-only composition (learner_fact_unavailable); a natively
  committed but unrecorded learner (learner_fact_not_recorded); a dispatch
  without the package (existing refusal).
- `test/node/message-group-create-admission-recovery.test.js` (the sealed proof
  plan's file name): forged stamp; obligation not outstanding; stale descriptor
  after a real abort-learner REMOVE selection; REMOVE racing the CAS and racing
  the MATERIALIZED advance (injected at the owner's actual row CAS); package for
  another group/target/peer/kind; request for another group/target or another
  node; terminal-first and terminal racing the CAS; boot replaced before the
  claim and before the queued worker; handler shut down before the queued
  worker while the node's owner lives on; stale workflow generation and other
  attempt; duplicates (concurrent, sequential after completion, second handler
  of the same boot); lost CAS and MATERIALIZED answers (positive recovery);
  process loss after the admission CAS and while the worker creates; failing
  physical create; unavailable authority then recovery (positive recovery).
- After the independent review (round 1 REJECT): the production capability set
  with the operation owner composed refuses before any admission write, and
  the setup owner composes no learner-join capability (membership file); each
  of the seven fact columns moving alone between read and CAS defeats the CAS;
  the readback does not adopt a moved fact after a lost answer; an ordinary
  terminal settlement between admission and MATERIALIZED starts no worker;
  `deferRetry: false` is pinned on terminal and stale refusals; and
  `test/node/replica-create-admission-recovery.test.js` (real SQL for
  `replica_operations`) shows older-boot ADMITTED and MATERIALIZED
  message-group rows untouched by a partition handler's startup recovery while
  a partition row is still recovered. The per-column, readback and pin tests
  witness behaviour the first draft already had; they are green on it and red
  only under their mutations.
- Shared fixture: `test/test-helpers/message-group-create-fixture.js`; the
  learner-join stub asserts sealed MATERIALIZED evidence, the matching durable
  row, the recorded stamp and `revalidatePhysicalWorker(claim, evidence)` before
  it records an effect; the composed `createMessageGroupReplica` only counts and
  must stay at zero.
- Registered as impact contract and coupled pair
  `message-group-learner-create-admission` in `test/shards/impact-contracts.json`
  (now including the partition retained-recovery modules and witness).

Twenty mutation controls each fail their named assertion while the positive
control passes (except M13, whose killer is the positive control itself);
results are in the implementer report.

## 7. What B1 leaves open (explicitly not claimed)

- ACTIVATION BLOCKER for the install slice: every production root composes
  `createMessageGroupReplica`, which opens a lone founder that elects at once
  (section 1). B1 never calls it and refuses when no learner-join capability is
  composed. The install slice must supply a learner-join capability that joins
  the existing group as a learner (never the lone-founder path) before any root
  composes the repository and boot for this handler; composing those alone
  changes nothing because step 0 still refuses.
- Leader-produced join descriptor and install/open: the worker gets the owner,
  exact evidence, claim and recorded stamp. B2 must read the leader's current
  committed membership (BOOTSTRAP purpose) and origin-bearing checkpoint at its
  own effect boundary, validate them against the recorded stamp, install through
  `requestSnapshotInstall`, open as a learner (`JOINING_EXISTING_GROUP`), and
  only then report progress. Services-row publication stays behind the sealed
  promotion/committed-voter proof.
- A REMOVE committed after MATERIALIZED is not yet ordered against the running
  worker; the install step must re-require the fact (or the abort selection must
  respect a live admission).
- The message-group handler's own recovery of an older boot's
  ADMITTED/MATERIALIZED admission (the partition handler no longer touches
  them; they stay retained), worker failure progression (FAILED, attempt
  rotation) and admission close, including the ADMITTED row left by a terminal
  settlement before MATERIALIZED.
- Production composition (learner-join capability, repository, boot
  incarnation) and the driver that dispatches CREATE with a package after the
  fact is recorded. Until then the path is inert: no dispatcher builds the
  package, and no root composes the learner-join capability.
- 6.C ordered successor and everything after it.

## 8. Findings outside B1 (R17, not absorbed)

- The admission owner classifies every no_op claim CAS against a non-matching,
  non-terminal, non-rotated row as DEFERRED (retryable), so a request that can
  never match (wrong group/target/node, older generation) is retried rather than
  refused. Owner: `replica-create-admission-owner.js:605-611`.
- The admission owner admits any attempt sequence on the first claim (an
  unrotated `attemptSeq: 2` package admits an unadmitted row). Owner: same
  `claim`, `isValidRequest` (`:130-139`).
- `replica-operation-message-group-membership-owner-claim.js` carries
  un-baselined guideline hits at base (literal `:145`, silent catches `:174`,
  `:236`); the pre-commit hook checks staged files, so any commit staging that
  file fails until they are repaired. B1 therefore spells the seven fact column
  pairs in the authorization owner instead of exporting `CLAIM_FIELDS`.
- From the round-1 review: `ReplicaCreateAdmissionOwner.acquire` returns an
  unregistered owner for a null or non-positive incarnation (owner `:283-287`),
  and the durable layer alone does not serialize workers across two owner
  objects of one boot (sole-worker safety rests on the process registry);
  `rowMatchesAdvanceResult` does not re-check `extraWhere` (benign today);
  `readReplicaAdmissions` (lifecycle close, keyed by replica id) is still
  entity-agnostic; a package-bearing CREATE with the learner-join capability but
  no repository answers `deferRetry: true`.
