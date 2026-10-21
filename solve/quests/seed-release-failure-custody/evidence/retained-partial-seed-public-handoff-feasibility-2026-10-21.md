---
audience: development
documentClass: current
---

# Retained partial-seed public handoff feasibility

Date: 2026-10-21. Independent reviewer: subagent physical_custody_review.
Read-only source candidate: `393f411ca09449898465cc3cb7320c03fba2aba8`.
This is an additive design recommendation, not an implementation approval,
new seal, measured result, or change to an existing acceptance record.
It follows the retained-partial-seed charter and its separate independent
REVISE review in this directory. Only this new note was written; no source,
test, receipt, seal, Git index, or HEAD was changed and no test was run.

## Concrete decision

Use the existing startup/membership and physical lifecycle owners to admit
**nonserving recovery of the original allocation**. Keep public admission
closed throughout that recovery. Existing cluster-identity ownership must
reserve one stable identity for that original allocation and publish that
same identity through the replicated CONFIG singleton; it must not mint a
replacement because a read or response is unavailable.

Literal seed-restart-v2 can remain unchanged for this nonserving recovery.
It cannot honestly certify an isolated restarted singleton as serving-ready:
cluster identity alone does not meet its second proof requirement. Choose
one explicit handoff contract before sealing the next unit:

1. Preserve v2 literally: recovered replicas and registration may be complete,
   but public serving remains deferred until its existing proof is satisfied.
   This proves internal continuation, not full standalone startup success.
2. If the required positive is standalone public startup after the initial
   partial-seed crash, explicitly supersede only the first-publication case
   using prospective, unspent original-allocation authority and the one-shot
   consumption boundary described below. Do not call this unchanged v2.

The operator's delegated design judgment permits this bounded decision without
another user prompt. Independent contract review and a red seal still precede
implementation. A phase flag, absent peer, empty table, or workflow checkpoint
cannot decide which branch applies.

## Current source facts

- `solve/quests/seed-restart-recovery-mode-v2/quest.json` is sealed at
  `23ca84017cfd906269bb81cbf217e791a2785ec5`. Its literal statement requires
  cluster-id match plus durable quorum evidence or current-member contact
  before a durable seed serves bootstrap. Persisted role alone is insufficient.
  `src/bootstrap/seed-recovery-proof.js:37-48` implements the classifier;
  `:88-91` selects refusal and `:103-128` builds fail/seed startup decisions.
  This note preserves that classifier; its implementation's peer-address and
  node-count inputs are not newly certified as physical quorum evidence here.
- Public decision occurs in `src/entrypoint-runtime-join-decision.js:386-408`.
  Expected cluster ID is read from local hints, and
  `src/bootstrap/rejoin-hints.js:338-391` reads the same hints and membership
  evidence before classifying. This self-consistency check is not permission
  to manufacture an expected identity or treat UNKNOWN as MATCH.
  Explicit failure is thrown at join-decision `:443-445` before seed runtime
  construction. A new recovery-only outcome must survive this boundary as a
  distinct owner decision, not be translated into FRESH_SEED/ordinary seed.
- `src/lagrange-runtime-startup.js:401-434` reserves boot incarnation, reads
  storage admission and constructs BootstrapService. At `:437-465`, BootstrapAPI
  is initialized before `bootstrap()`. The server actually registers routes
  and listens in `src/bootstrap/bootstrap-api-server-methods.js:34-66`.
  Therefore a listener can exist before registration; listener existence is
  neither serving permission nor evidence that serving was previously granted.
- `src/bootstrap/pipeline/seed-startup-plan.js:34-45` acquires SQL and the
  replica handler before participant release and registration. Internal SQL
  becomes available during the very interval being recovered.
- Public bootstrap request admission is evaluated before admission acquisition
  in `src/bootstrap/owners/bootstrap-request-owner-handler.js:154-210,335-340`.
  `bootstrap-request-owner.js:648-688` can admit a ready join snapshot even
  when startup is incomplete. It can also admit completed startup without
  an available blocking join-authority snapshot. Thus keeping phase incomplete
  is not a sufficient recovery fence.
- `src/bootstrap/owners/service-registration-handoff-owner.js:505-598` validates
  its request, rejects the unsupported move route, and checks SQL availability
  before entering registration work. It has no common partial-seed-mode gate
  in that entry sequence. Existing lower assignment/cleanup guards remain
  necessary but do not prove global public nonserving status.
- Registered public routes include bootstrap, register-service, cluster-state
  and Request Cell catchalls, plus liveness/readiness/health
  (`bootstrap-api-server-methods.js:80-146`). Health projects ready from SQL
  existence at `:102-118`. Readiness dependency probes at
  `bootstrap-readiness-dependency-probes.js:30-69` use phase/router/SQL facts.
  None of these observations can substitute for original-allocation authority.
  No reachable exploit of another ingress is claimed from this source census;
  the new mode must positively cover all exposed effectful ingresses.

## Narrow public boundary

The existing startup/membership owner should issue a typed recovery-only
outcome, backed by the original durable allocation owner. BootstrapAPI consumes
that outcome through its existing startup adapter. It must not derive a second
permission from caches, phase, SQL availability, or the caller's request.

During recovery-only operation:

- Permit exact original replica reopen, existing consensus reconstruction,
  same-owner release continuation, and exact internal registration/identity
  reconciliation only when their individual owners authorize them.
- Refuse bootstrap admission before leases, node registration or assignment;
  refuse register-service before registration mutation; refuse application
  Request Cell dispatch and public administrative mutation. Existing protocol
  responses should retain typed retry/defer semantics and exact cause.
- Liveness and diagnostic failure responses may remain available. Startup,
  bootstrap-ready, general ready and health must not advertise serving-ready.
  Cluster-state must not advertise a joinable authoritative topology from this
  mode. Readiness remains a projection of the owner, never the admission grant.
- Internal consensus/control transport needed for recovery is distinct from
  public serving. Do not disable the internal path needed to satisfy the
  gate, and do not send internal registration through the refused public path.
- Absence/unavailability of the recovery permission is a closed gate. Gate
  recheck at the actual public mutation/dispatch boundary must prevent an
  in-flight request from crossing a concurrent withdrawal or shutdown.

Implement this as one owner decision consumed at existing ingress boundaries,
not a new controller, policy registry, or route-by-route authority algorithm.
The next charter must inventory exact relevant entry paths and show zero
public effect while real internal SQL/native recovery is engaged.

## Cluster identity: one original value, one publication owner

Current semantic ownership is explicit in
`src/bootstrap/cluster-identity-constants.js:1-32`: the first seed mints once;
CONFIG is the authoritative cluster-wide copy; every durable carrier agrees.
`solve/quests/durable-cluster-identity-v2/quest.json` describes these seams but
has `sealedAt: null`; do not fabricate a seal for its migrated history.

Today `src/bootstrap/phases/seed-registration-phase.js:121-128` publishes the
identity after service/system-table registration. At `:646-678`, a successful
nonempty leader query returns without reading/comparing the value; otherwise
execution reaches randomUUID plus upsert. An unsuccessful/malformed read or
missing leader is not distinguished there from proved absence. This is a
source-bound retry hazard to settle before reusing the method in new recovery,
not an executed corruption claim. The writer already offers authoritative
read and INSERT operations (`src/bootstrap/system-table-writer.js:28-54`);
use those owners instead of a new database or an overwrite-on-retry shortcut.

Recommended bounded contract extension:

1. At original admitted fresh allocation, the existing cluster-identity
   minting responsibility reserves one candidate cluster ID, durably bound to
   that exact immutable allocation in the existing lifecycle storage chosen
   by the allocation owner. Reserve before any recoverable participating
   effect. This extends the original authority record; no second cluster ID,
   sidecar metadata database, or derived UUID-from-files rule is introduced.
2. On restart, consume that exact value only after allocation/identity/cohort
   checks. If a carrier already holds another ID, refuse; if required evidence
   is unreadable, retain debt and defer. Historical stores without this
   prospective authority cannot be backfilled from native history or absence.
3. At CONFIG publication, use a typed authoritative read: same ID is
   idempotent; different ID is terminal conflict; unavailable is unresolved;
   proved absence plus valid original unspent publication authority permits
   an INSERT of the reserved ID. Duplicate/lost-response handling reads the
   exact committed row and compares the value. Never upsert a new identity
   over an unknown prior result. A later missing row cannot remint identity.
4. Hints and checkpoint carriers consume the same ID through their existing
   owners. The current hint service starts late (`lagrange-runtime-startup.js:
   579-588`); `rejoin-hints.js:697-707,726-750` starts asynchronous persistence
   and can return null after a logged write failure. That best-effort call is
   not a durable publication acknowledgment. A serving prerequisite must use
   an exact success-confirmed persistence/read contract, not timer creation.
5. Snapshot identity is a separate consumer. The checkpoint constants explicitly
   leave production source pinning to S2/S3 (`src/raft/snapshot-checkpoint-
   constants.js:104-107`). Existing descriptor checks alone do not certify
   end-to-end checkpoint wiring. Do not claim this unit closes that frontier.

Early reservation changes timing, not the cluster-wide authority: local storage
holds the original admitted value pending publication, CONFIG owns its committed
cluster-wide identity. The next design must specify exact field/storage and
atomicity; this note does not bless a vague per-file flag as a complete cohort.

## Proposed transition table

Labels below are design states, not claims about implemented constants.
Every row also requires unchanged directory/process, incarnation, loss,
cleanup, native history and per-effect authorization checks.

| Current authoritative facts | Permitted effect | Public boundary | Remaining obligation / restart |
| --- | --- | --- | --- |
| Historical artifacts but no valid original allocation, or incomplete/unreadable required grant | Read-only diagnosis; no invented fresh grant or native genesis | Closed, typed missing/unreadable cause | Existing allocation/lifecycle owner retains refusal and custody; wait for named evidence or explicit owner resolution |
| Valid original allocation, intact exact cohort/history, unspent authority; no complete SERVICES transfer | Reopen only original objects; resume committed origins and legitimately authorized remaining release; reconcile exact rows | Recovery-only, all public admission closed | Same allocation and row owners retain work; repeated crash uses same facts, no new ID/deadline for an old operation |
| Identity or row write outcome uncertain | Read/reconcile exact original write; no replacement write inferred from timeout | Closed | Original write owner retains uncertainty until exact result established |
| Complete exact row transfer and identity publication, v2 proof missing | Internal recovery completed; no serving transition | Closed even if phase COMPLETE and SQL works | Existing seed-serving owner owns missing proof; standalone public-start positive remains unfulfilled |
| Complete exact transfer/identity and actual existing v2 proof satisfied | Existing normal handoff under current serving owner | May open only after handoff and ordinary readiness | Existing serving/rejoin owners take over; grant cannot authorize later resurrection |
| Explicitly superseded first-publication case, prospective unspent never-admitted authority plus complete exact transfer/identity | Consume first-publication authority durably, then permit same live owner to hand off | Closed until successful consumption and final boundary check | Crash/uncertain consumption remains closed; later cold startup uses v2, not original allocation permission |
| Transferred/consumed/retired allocation, foreign identity, destructive loss, or contrary established membership evidence | Existing rejoin/recovery/refusal only; no original-allocation recreation | Existing v2 and ordinary fences | No deletion or absence can reset original authority |

## If standalone public completion requires supersession

The narrow prospective exception is: a durable original first-seed allocation
that **could not yet have admitted any external work** may complete its first
public handoff under the original grant. This is stronger than saying no current
SERVICES/NODES/hints row was found. It requires an invariant installed on the
original fresh path before any public effect, plus an authoritative consumption
transition before opening admission. Local workflow progress is insufficient.

Place consumption/discharge in the existing allocation lifecycle owner, coupled
to the established registration and cluster-identity handoff. It represents
retirement of an actual permission, not another progress ledger. A successful
one-shot consumption can create only a process-scoped permission for the exact
live owner holding directory/boot custody. Restart cannot recreate that
permission from a consumed record. Unknown consumption stays closed until its
owner resolves it; after process loss it cannot treat uncertainty as unused.

This conservative exception has a deliberate availability cost: crash after
consumption but before the first external response may require v2 proof and
remain unavailable as an isolated singleton. Do not conceal that gap or claim
unbounded standalone restart liveness. Expanding beyond it requires another
explicit safety argument and seal, not replaying the consumed original grant.

An old/foreign/copied store must not gain this exception merely by presenting a
matching UUID. Exact allocation/incarnation/loss fences and the declared threat
model remain required. If the existing lifecycle store cannot durably establish
complete issuance and irreversible consumption across its cohort, do not
implement the exception yet. Select nonserving continuation and retain the
public-completion prerequisite.

The superseding record must name the v2 seal and the precise first-publication
clause it changes. Preserve all historical v2 records/tests; established seeds,
consumed grants, stale isolated seeds, mismatches, loss, and unknown evidence
retain the old fail-closed requirements. No new user approval is required for
this delegated design decision, but independent review must approve the exact
contract before source edits.

## Binary proof for this handoff

- Cold public startup on the frozen predecessor must reach the real original
  native release before fault/expiry, then preserve the first actual restart
  refusal. Use the real issued deadline (public default 30,000 ms), not the
  direct BootstrapService fixture's 3,000 ms override.
- While recovery native work and SQL are demonstrably engaged, send actual
  public bootstrap/register-service requests and a valid routable Request Cell
  request. Assert typed refusal, zero admission/registration/dispatch effects,
  and nonready projections. Inject an otherwise ready snapshot and completed
  phase to prove these cannot override recovery-only authority.
- Exercise exact CONFIG same-value/lost-response replay; conflicting value,
  failed read, malformed read, missing leader, and missing-after-transfer must
  not mint or overwrite. Check all local carriers agree without treating cache
  absence as authoritative absence.
- Crash before identity reservation commit, after original native participation,
  before/after CONFIG INSERT, after exact row transfer, and around serving-grant
  consumption. Preserve uncertainty and exact custody at each cut.
- If retaining v2, prove internal recovery positive and public refusal without
  proof, then actual proof-driven handoff. Label missing standalone completion.
  If superseding, prove one original first handoff and prove consumed/restarted,
  established stale, foreign, lost and absent-grant negatives remain closed.
- Require semantic negatives targeting the actual admission and durable
  authority boundaries. Setup failure, unsupported ingress, static mutation
  rejection, timeout alone, and component readiness are not native kills.

The five prerequisites in the independent charter review remain applicable.
This note settles the serving/identity decision alternatives and recommends
existing owners; it does not supply the still-required exact storage shape,
atomic issuance/discharge proof or final next-unit implementation approval.

## Explicit bounded-operation decision and RF1 limit

A complete **internal original-allocation handoff** can be defined without
claiming public startup success. Its operation is:

`cold public entry -> validated original allocation and process custody ->
exact original native reopen/release -> durable exact SERVICES registration
and identity reconciliation -> authoritative transfer/discharge of original
creation permission -> retained nonserving runtime or orderly exact cleanup`.

Its success oracle must positively observe the durable exact-generation
SERVICES handoff (including committed-but-response-lost reconciliation), the
owner's irreversible transfer decision, unchanged original physical identities,
and public admission still closed. The existing row/lifecycle owners take over
replica and cleanup obligations; the seed-serving owner retains the unresolved
serving-proof obligation. A reported handoff does not abandon a live runtime:
startup must either retain bounded named custody or finish exact cleanup under
the existing ledger. Merely creating rows, reaching a phase, or leaving a hung
startup promise is not completion.

This is a legitimate separate bounded complete operation **only after an
explicit new-unit decision** sets this oracle. It must not replace the planned
complete-public-serving positive silently. If the new unit remains specified
as public startup success, an internal handoff plus serving refusal is partial
progress and that oracle remains RED. The handoff unit still needs exact
storage/transfer semantics from the other charter prerequisites; source
feasibility is not implementation approval.

An intact original RF1-only cohort cannot, by its local release origins, Raft
logs, single-node committed membership, or multiple system-table replicas,
satisfy the current v2 proof API. `resolveSeedRecoveryProofSatisfied` in
`seed-recovery-proof.js:37-48` requires MATCH and at least one of:
nonempty selected peer, `clusterNodeCount > 1`, or nonempty recovered peer list.
The current public collector (`rejoin-hints.js:354-391`) supplies node-count
and normalized peer-address evidence; it does not consume native RF1 ConfState
as quorum evidence. The local node is excluded when normalizing peers
(`rejoin-hints.js:355-369`). For actual original RF1 with no other node,
count=1/peers=[]/selectedPeer=null leaves the proof false even after exact local
recovery and identity publication. Adding invented hints, counting table
replicas as cluster nodes, or treating a self-probe as peer contact is forbidden.

If real additional membership/current-peer evidence later exists, the existing
owner may admit through its existing classifier. Note the classifier also
accepts its named durable-evidence branch without a successful live probe;
this note does not strengthen that source into a new claim of observed live
quorum or reinterpret local RF1 as satisfying it. Tightening that historical
proof algorithm is separately scoped, not smuggled into this recovery unit.

The optional first-publication supersession's cut immediately after irreversible
consumption and before first admission is a **named lost-progress obligation**.
The original effect/identity/cleanup debts remain owned. The public-progress
debt moves to the existing seed-serving/rejoin owner, whose gate stays closed
until its required genuine evidence returns or an explicitly reviewed further
contract resolves this case. No marker deletion, consumed-grant replay, forced
fresh seed, or timeout can settle the debt. The fault must be preserved and
reported as this limitation; if automatic isolated progress across that cut is
required by the new seal, the proposed one-shot exception is insufficient and
must stay REVISE. It is not permissible to drop the cut from the positive oracle.
