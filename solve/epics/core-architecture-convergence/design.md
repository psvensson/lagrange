# Core architecture convergence — execution design

This document is the execution manual for
[`core-architecture-convergence.md`](../core-architecture-convergence.md).

It is intentionally more prescriptive than an ordinary architecture note.
The expected executors include agents that are good at bounded implementation
but should not be asked to invent the architecture while working.

The governing idea is simple:

> Preserve proven owners. Prove duplicate authority before deleting it. Make
> existing owner interactions explicit. Do not translate the clean-room model
> into a second implementation.

## 0. How to use this document

### The current source always wins over this snapshot

The rs-raft foundation is now on shared `main` at
`f4f5b5a6e9c27d139b3ada85e0aabe38eb526480`.

Do not read "merged" as "partition cutover complete". At this exact head:

- Liferaft remains `RAFT_BACKEND_DEFAULT`;
- rs-raft is explicit-selection only;
- the frozen operation-port/runtime/lifecycle boundary is real and should be
  reused;
- the operation-port Quest explicitly kept real rs-raft transport/demux blocked;
- exact-main release proof was deferred until after merge.

Before changing behavior:

1. read `docs/steering/rules.md`;
2. read `docs/steering/workflow-guidelines/solver-quests.md`;
3. read `architecture/contracts/core-system-logic.md`;
4. read `architecture/current-owner-maps.md`;
5. read the applicable subsystem owner card;
6. run Q0 against the current exact main head.

If later source differs from this snapshot, current source + current owner docs
win. Record the discrepancy; do not repair the runtime to match this document.

### The epic itself grants no source scope

Its front matter intentionally has `authorizes: []`.

Each behavior-changing Quest gets a narrow source scope derived from the census
immediately before that Quest. Do not pre-authorize whole directories because
the epic is broad.

### Planned Quest ids are not declarations

Do not create all Quest records in advance.

The sequence is adaptive:

- Q0 measures the post-Raft-migration system.
- Q1 classifies the actual owner graph.
- Later Quest(s) are authored only where those measurements find a specific
  duplicate, bypass, or missing interaction.

A phase that finds no defect may finish as a verified no-op finding. Do not
manufacture work to satisfy the outline.

---

# 1. Global invariants

These invariants apply to every Quest in the epic.

## G1 — one semantic owner

Use the repository's existing invariant
`single-semantic-owner`.

A second spelling of the same data is not automatically a second semantic
owner. The question is:

> Can this site independently authorize, reject, advance, repair, or complete
> the same semantic transition?

If yes, it is a candidate duplicate authority.

If it merely supplies independent evidence to the owner, it may be legitimate.

## G2 — interactions are owned

When owner A needs owner B's decision, the boundary must have one canonical
shape.

Prefer:

```
owner A -> canonical request/decision contract -> owner B
```

over:

```
owner A -> raw fields -> local interpretation of B's semantics
```

Do not fix an interaction by adding yet another adapter shape.

## G3 — durable authority and observation are different

Classify every state item as one of:

- `DECLARED`: policy/intent;
- `DECIDED`: an owner's authorized next action or durable workflow state;
- `OBSERVED`: current runtime/read-model/transport evidence;
- `PRESENTATION`: a diagnostic projection only.

A `PRESENTATION` or `OBSERVED` value cannot silently become `DECLARED` or
`DECIDED`.

## G4 — no parallel normal path

A recovery path may exist, but it must be:

- explicitly recovery-only;
- bounded;
- unable to become the preferred normal owner;
- semantically consistent with the normal owner's durable state.

The existence of a recovery sweep is not enough to call it duplicate authority.

## G5 — production is not changed for the simulator

Simulation/harness code may expose a missing production seam as evidence.

It may not justify adding a production abstraction solely to improve simulation
ergonomics.

Any production seam is its own Quest, with production behavior as the proof
subject.

## G6 — red-on-revert

Every load-bearing source change has a named witness that becomes red when that
change alone is reverted against the rest of the attempt.

This is stricter than "the whole old commit is red".

## G7 — deletion is proven by reachability

A deletion/ratchet must survive:

- renaming;
- re-export;
- aliasing;
- nested property exposure;
- wrapper delegation;
- alternate constructor;
- dependency injection;
- recovery/restart path;
- test/default configuration accidentally used by production.

A grep for a literal class/property name is supporting evidence only.

## G8 — no source-change bundle with an unresolved semantic unknown

If a census leaves an `UNKNOWN` reachable site on the interaction being
changed, stop.

Classify it before writing production code.

## G9 — reuse the merged rs-raft proof boundary

The merged operation-port work is a standing foundation, not scaffolding to
replace.

Reuse:

- `scripts/checks/raft-rs-operation-boundary-audit.js`;
- operation-port/lifecycle/recovery/provenance tests;
- the existing capability/reachability falsifiers;
- the existing runtime/lifecycle/membership-administration boundaries.

A new checker or facade that proves the same thing is presumed duplicate until
shown otherwise. Extend the existing owner/audit when a genuinely new bypass
class is found.

---

# 2. Shared evidence artifacts

Create the following directory only when Q0 starts:

```
solve/epics/core-architecture-convergence/
```

Expected retained design/evidence artifacts:

```
rs-raft-readiness-baseline.json
owner-census.json
interaction-census.json
compatibility-surface-census.json
certification-matrix.json
final-owner-delta.md
```

These files are **evidence/projections**, not runtime authority.

Every generated JSON artifact should contain:

```json
{
  "schema": "...",
  "sourceCommit": "<exact sha>",
  "generatedBy": "<script/path>",
  "generatedAt": "<timestamp if needed>",
  "entries": []
}
```

Where reproducibility is important, prefer deterministic content without
timestamps and record the measurement timestamp in the Quest log instead.

Each generator must have a `--check` or equivalent static validation mode so
the probe can verify the artifact against current source without mutating it.

---

# 3. Q0 — rs-raft readiness baseline

Planned Quest id:

`core-convergence-rs-raft-readiness-baseline`

## Purpose

Answer whether the rs-raft partition migration is actually ready for this
architecture-convergence epic.

This Quest is deliberately **read-only with respect to production behavior**.
It reuses the merged operation-boundary proof instead of rebuilding it.

At the revision head of this document
(`f4f5b5a6e9c27d139b3ada85e0aabe38eb526480`), the honest expected outcome is
`BLOCKED_ON_RAFT_CUTOVER`, because source still defaults partitions to
Liferaft and the operation-port Quest explicitly blocks real rs-raft transport.

That red result is useful: it prevents a weaker agent from interpreting a
successful library/foundation merge as permission to delete the old production
path.

## Allowed changes

Expected scope:

- `solve/epics/core-architecture-convergence/`;
- one source-analysis checker under `scripts/checks/` if existing checkers
  cannot produce the needed classification;
- focused tests for that checker;
- architecture/current-state documentation only when it is stale about facts
  already present on main.

No `src/` behavior change.

## Required measurements

### Q0.A — exact foundation identity and proof status

Record:

- current shared main SHA;
- whether it descends from the rs-raft foundation merge;
- PR #46 merge SHA;
- current result of the structural operation-boundary audit **as exercised by
  its actual witness test**,
  `test/raft/raft-rs-backend/operation-port-boundary.test.js`;
- explicit confirmation that a direct
  `node scripts/checks/raft-rs-operation-boundary-audit.js` invocation is not
  being counted as proof while that module has no CLI entrypoint;
- current validity of the 11 sealed operation-port receipts against their
  present test-file digests;
- exact-main release-proof result.

Do not treat a branch-era receipt as proof of a later head without verifying
its bound witness bytes/current structural audit.

### Q0.B — production partition backend state

Record mechanically from source:

- `RAFT_BACKEND_DEFAULT`;
- every production caller of `createRaftProvider`;
- every production source of `raftBackend`;
- every direct `raftProvider` injection path;
- whether a production partition can reach Liferaft by omitted configuration;
- whether a production partition can reach rs-raft without explicit selection.

Classify:

- `PARTITION_RS_RAFT_SINGLE_PATH`;
- `PARTITION_DUAL_BACKEND`;
- `UNKNOWN`.

At the revision head, expected = `PARTITION_DUAL_BACKEND`.

### Q0.C — rs-raft boundary state

Confirm on current source:

- partition constructs via `createPartitionPort(request)`;
- operation port is frozen and contains only the declared semantic operations;
- runtime owner is the sole production binding/core invoker;
- lifecycle owner is the sole durable retirement writer;
- lifecycle administration is separate from data-plane operations;
- peer-identity reservation administration has its named owner;
- no public RawNode/core/handle/runtime-host/control graph is reachable;
- a genuine core entry still goes through the lowest-common instrumented owner.

Use the existing boundary audit and focused tests as primary evidence. Add a new
test only for a genuinely uncovered attack.

### Q0.D — consensus membership state

For the rs-raft partition path confirm:

- committed `ConfState` is the consensus-membership authority;
- stable peer identity reservation is a separate concern;
- service/cache metadata can at most request/project a membership transition;
- cache mutation alone cannot directly rewrite `ConfState`.

For the Liferaft partition path, classify the existing service-row/local-peer
membership behavior as migration debt, not something this epic repairs before
cutover.

### Q0.E — real transport state

Trace separately:

1. outbound rs-raft message:
   runtime owner -> port callback -> PartitionService -> MessageRouter;
2. inbound network message:
   MessageRouter/demux -> partition semantic handler -> operation-port `step`.

Record whether both are production-reachable with the actual rs-raft backend.

Also record:

- restart/catch-up over real transport;
- membership change over real transport;
- hostile-cache membership proof over real transport;
- whether Liferaft packet vocabulary is still the only inbound discriminator.

If the named transport Quest is still absent/blocked, classify this axis
`TRANSPORT_NOT_CUT_OVER`.

### Q0.F — message-group separation

Record message-group Raft provider/runtime separately.

A message group intentionally remaining on Liferaft is not a partition-cutover
failure. It must, however, be named so Q8 cannot later use a global
"delete Liferaft" rule.

### Q0.G — exact-main certification matrix

Resolve the exact current commands/scenarios for:

- release proof;
- operation-boundary audit;
- focused rs-raft tests;
- partition tests;
- deterministic formation simulation;
- cold multi-node formation;
- rolling restart;
- snapshot/follower rebuild;
- acknowledged writes through leader change;
- representative SQL;
- representative service/WASM execution;
- message-group safety if it still uses Liferaft.

Store them in `certification-matrix.json`; do not run every costly scenario
inside the census Quest.

## Q0 outcome

Emit one named result:

### `READY_FOR_CORE_CONVERGENCE`

Only when all are true:

1. exact-main release proof is green;
2. production partition construction has one intended backend path;
3. rs-raft real transport/demux is proven if rs-raft is that path;
4. omitted/error configuration cannot silently fall back to Liferaft on the
   production partition path;
5. operation-boundary witness test is green and actually executes
   `auditRaftRsOperationBoundary(...)`;
6. real partition restart and committed-membership authority are proven;
7. every remaining Liferaft production use is classified to a non-partition
   owner or explicit migration/test surface;
8. zero `UNKNOWN`.

### `BLOCKED_ON_RAFT_CUTOVER`

If any item above is incomplete.

The blocker must name the missing predecessor obligation, for example:

- exact-main release proof;
- real transport/demux;
- production default/selection cutover;
- partition fallback removal;
- restart/membership certification.

**Do not implement that predecessor work in Q0.**

## Q0 probe

Static and binary:

- readiness artifact exists and is bound to current head;
- all axes classified;
- zero `UNKNOWN`;
- existing boundary audit checked;
- certification matrix complete;
- result is explicitly READY or BLOCKED.

For the epic to advance to Q1, the measured result must be READY.

The probe must not start containers, WASM, a cluster, or the network.

## Q0 verifier attacks

The independent verifier must try to disprove:

1. that rs-raft is really the partition production path rather than merely
   available by explicit test option;
2. that omitted configuration cannot still select Liferaft;
3. that a provider injection/restart path bypasses the declared selector;
4. that a RawNode/core/handle is still reachable through wrappers/re-exports;
5. that a vacuous direct execution of the audit library was mistaken for a
   green checker;
6. that lifecycle retirement has another writer;
7. that peer-identity administration is being confused with committed
   membership authority;
8. that service/cache mutation directly changes rs-raft membership;
9. that real inbound transport actually reaches `step`;
10. that local short-circuit and remote transport use the same semantic path;
11. that branch-era receipts are stale relative to current head;
12. that message-group Liferaft reachability is being misclassified as a
    partition fallback.

Any unresolved item keeps Q0 blocked.

# 4. Q1 — owner and interaction census

Planned Quest id:

`core-convergence-owner-census`

## Purpose

Build a mechanically checked map of the core owner graph after Q0.

No production behavior change.

## Census schema

Each concern record:

```json
{
  "concernId": "partition_membership_transition",
  "semanticClass": "DECIDED",
  "owner": "actual-owner-name",
  "ownerPaths": ["..."],
  "entrypoints": ["..."],
  "writes": ["resource.field"],
  "consumers": ["..."],
  "observers": ["..."],
  "interactions": ["interaction-id"],
  "compatibilityEntrypoints": ["..."],
  "suspectDuplicates": ["..."],
  "unknown": []
}
```

Each interaction record:

```json
{
  "id": "placement-decision-to-participant",
  "fromOwner": "MovePlanner/topology owner",
  "toOwner": "partition participant/local safety owner",
  "canonicalShapeOwner": "...",
  "requestShape": "...",
  "outcomeShape": "...",
  "alternateShapes": [],
  "rawReachthroughs": [],
  "status": "CANONICAL|SUSPECT|UNKNOWN"
}
```

## Minimum concerns

### Partition/consensus

- local partition replica assembly;
- production partition backend selection;
- frozen operation-port interaction;
- rs-raft runtime/core-entry ownership;
- rs-raft local lifecycle ownership;
- stable peer identity reservation;
- **committed ConfState membership authority**;
- durable log/hard state;
- SQLite application data state;
- application/progress atomic transaction;
- write proposal;
- committed-entry apply;
- snapshot creation/install/catch-up;
- learner promotion gating;
- leadership publication;
- split/merge participation;
- remaining partition Liferaft compatibility after cutover;
- message-group Liferaft ownership separately.

### Placement/workflow

- desired RF;
- spread requirement;
- node eligibility;
- placement candidate scoring;
- temporary overflow authorization;
- operation creation;
- operation state;
- operation dispatch;
- executor outcome;
- workflow recovery;
- recovery sweep;
- capacity admission.

### Lifecycle/control plane

- node lifecycle;
- cluster active/traffic-ready;
- repair eligibility;
- serve eligibility;
- publication;
- system-table read model;
- epoch;
- canonical leader routing.

### Runtime/query/transport

- local/remote address routing;
- semantic message dispatch;
- SQL request normalization;
- distributed SQL planning;
- partition routing;
- runtime-driver selection;
- runtime lifecycle;
- service placement;
- ctx.call/service invocation.

### Observation

- admin state;
- diagnostics;
- harness/report snapshots;
- live object-environment/system-info projections if present.

## How to classify a suspect duplicate

A site is a suspect only if it can answer one of these without delegating to the
named owner:

- "may this happen?";
- "what is the target?";
- "what state comes next?";
- "is this complete?";
- "is this ready?";
- "who is leader/canonical owner?";
- "should I retry/stop/proceed?";
- "may this mutation commit?".

Mere formatting, evidence collection, or projection is not enough.

## Q1 acceptance

- zero `UNKNOWN`;
- every targeted concern has exactly one owner;
- every cross-owner interaction is `CANONICAL` or a named
  `SUSPECT` queued to a later phase;
- every compatibility entrypoint has a reachable-consumer count;
- owner map can be regenerated/check-validated statically;
- current `architecture/current-owner-maps.md` either agrees or is updated
  only to describe already-existing reality.

No production source change.

---

# 5. Phase Q2 — partition operation-boundary convergence

Family root:

`core-convergence-partition-boundary`

Author a child Quest only for a concrete residual leak found by Q1.

## Target invariant

> A partition receives only the frozen semantic operation port and immutable
> snapshots by value; exactly one runtime owner can enter the rs-raft binding,
> and lifecycle/identity administration remain separate owned interactions.

This is mostly an **already-landed invariant**.

## Keep by default

- `PartitionService` as Lagrange assembly/root;
- `RaftRsWasmProvider` as the stateless provider;
- `createRaftRsOperationPort`;
- `raft-rs-runtime-owner.js`;
- `RaftRsReplicaLifecycleOwner`;
- lifecycle administration;
- peer-identity reservation administration;
- existing operation-boundary structural audit;
- current clock/scheduler seam;
- specialized partition write/storage/transaction/split owners.

## Candidate residual defect classes

### P1 — operation-port escape

A consumer can traverse from the port/snapshot to:

- RawNode;
- core facade;
- handle;
- runtime host/group object;
- SQLite connection;
- mutable lifecycle state;
- arbitrary core callback.

Fix the existing boundary; do not create another facade.

### P2 — second core-entry owner

A new import, alias, dynamic load, helper, recovery path or test-like production
path invokes the vendored binding outside the runtime owner.

Extend the existing AST/reachability audit rather than writing a parallel one.

### P3 — second lifecycle writer

A direct SQL/store mutation or new administrative path writes active/retired
state outside the lifecycle owner/coordinator contract.

### P4 — backend-specific semantic leak

Post-cutover partition code depends on Liferaft-only behavior such as:

- concrete event vocabulary;
- mutable peer arrays;
- timer internals;
- packet shape;
- direct node properties.

Replace it with the smallest semantic operation/outcome on the existing port or
owner. Do not imitate Liferaft in rs-raft.

### P5 — restart/recovery alternate construction

A restart, snapshot or repair path constructs a runtime/port outside the
canonical owner path.

## Required proof

Every Q2 child keeps the merged permanent falsifiers green:

- binding/core reachability;
- lifecycle writer ownership;
- actual core-entry counter;
- retirement-before-core-entry;
- Ready failure reconstruction;
- atomic application/progress;
- capability inventory decrease.

If Q1 finds none of P1-P5, record Q2 as no-op evidence and continue.

# 6. Phase Q3 — state authority convergence

Family root:

`core-convergence-state-authority`

## Target flow

```
declared placement / RF policy
   -> MovePlanner + topology workflow
decided exact transition
   -> partition operation port
requested configuration change
   -> raft-rs core
committed ConfState
   -> consensus membership truth
owner outcomes
   -> metadata/cache/diagnostics projections
```

## Q3.A desired RF census

Search every runtime calculation of desired/target replica count.

Forbidden:

```
desired RF = current ConfState count
desired RF = length(current replica identities)
desired RF = count(current service rows)
```

Current membership is observation/consensus state, not declared policy.

## Q3.B spread/policy census

For each formula, record the question it answers:

- desired placement;
- candidate admissibility;
- local/Raft safety;
- current membership observation;
- presentation.

Only formulas answering the same semantic question are duplicate candidates.

## Q3.C placement decision to consensus change

Required shape:

```
placement/workflow owner authorizes exact transition
   -> operation carries identity/fence/authorization
   -> partition validates Lagrange-owned preconditions
   -> operation port submits change
   -> raft-rs decides whether/when it commits
   -> committed ConfState is observed/projected
```

Do not recreate a Lagrange-owned committed-membership protocol above raft-rs.

The participant may reject:

- stale operation/fence;
- wrong destination/identity;
- locally retired runtime;
- malformed command;
- a Lagrange safety precondition it actually owns.

It must not independently recalculate placement policy already decided by the
planner.

## Q3.D metadata versus ConfState

This is a mandatory adversarial distinction.

Service/cache metadata may legitimately:

- provide an address;
- say a replica is desired/retired;
- wake reconciliation;
- cause the owner to request an ADD/REMOVE;
- project a committed result.

It may not be treated as if its rows are already the Raft voting
configuration.

Tests must distinguish:

1. metadata changes causing a **request** that is then committed by Raft;
2. metadata mutation directly changing quorum/membership without a committed
   configuration change.

Case 1 can be correct. Case 2 is a duplicate membership authority.

## Q3.E completion/leader authority

Census every place cache presence, service rows, role metadata, publication
visibility, timer age, or `readStatus()` is turned into claims about:

- workflow completion;
- canonical leader identity;
- desired placement.

Use canonical durable owners where they exist. `readStatus()` is an immutable
consensus observation, not a placement/workflow owner.

# 7. Phase Q4 — workflow/reconciliation convergence

Family root:

`core-convergence-workflow-reconcile`

## Target pattern

```
external/runtime event
  -> OwnerKeyReconcileQueue.enqueue(ownerKey, reason)
  -> semantic owner loads durable state
  -> owner computes one nextAction
  -> durable transition if needed
  -> executor/port
  -> typed result
  -> owner consumes result
```

## Do not remove the queue

The queue is a serialization/de-duplication mechanism, not a second semantic
owner.

The owner-key callback must remain the decision site.

## Census categories

### W1 direct owner-field writer

Search all writes to:

- `operation_progress`;
- owner-managed `replica_operations` fields;
- split/merge workflow phases;
- any successor resources introduced before this epic.

For each field, source write sites must match the documented writer owner.

A DB helper called by the owner is not a second semantic writer if callers
cannot bypass owner semantics.

### W2 observer-completion inference

Search readiness, publication, admin, harness, and diagnostics for logic that
answers workflow state from symptoms.

If a canonical owner outcome is available, consume it.

Presentation code may support legacy retained artifacts only if explicitly
isolated from live decisions.

### W3 inline progression

Event handler does more than:

- normalize event;
- enqueue owner key / send canonical command;
- record observation.

If it decides and mutates long-running workflow state inline, it is a suspect.

### W4 retry loops

Classify each retry:

- transport retry;
- owner re-entry;
- durable workflow recovery;
- periodic recovery sweep;
- consumer-local retry.

Consumer-local retry of an owner decision is suspect.

### W5 periodic sweep

For each periodic loop prove:

- what durable state it scans;
- why it exists;
- whether it is recovery-only;
- how it avoids creating an alternate normal path;
- bounded cadence/lifetime.

Delete only if another mechanism demonstrably provides the same recovery
guarantee.

### W6 topology workflow -> local lifecycle -> committed ConfState

The rs-raft merge introduced a real multi-owner interaction that must be
preserved, not flattened.

Census ADD, learner promotion, REMOVE and REPLACE end to end:

```
topology/workflow owner
  -> participant/executor
  -> local rs-raft lifecycle or promotion safety when relevant
  -> operation-port membership request
  -> raft-rs committed ConfState
  -> metadata/publication projection
  -> typed executor outcome
  -> workflow owner
```

For each transition prove:

- exactly which owner decides the desired topology action;
- who reserves the stable peer identity;
- who gates local active/retired execution;
- who proves learner catch-up/promotion safety;
- which operation-port command requests the Raft change;
- that committed `ConfState` is the membership result;
- which metadata update is a request/wake versus a projection of that result;
- what durable event/outcome lets the topology workflow advance.

Local durable retirement and consensus REMOVE are different facts. A local
replica can be retired even while stale local `ConfState` still contains self;
retirement gates local execution but does not rewrite consensus history.

Likewise, a services-row DELETE may legitimately wake/request removal. It is not
proof that the committed configuration already removed the peer.

### W7 learner-promotion proof fences are not consensus membership

The existing learner-promotion proof uses:

- backend-owned follower progress from immutable Raft status;
- a Lagrange publication/snapshot membership epoch as a proof/catch-up fence.

Do not rename or consolidate that publication epoch into the Raft
`ConfState` authority merely because both use "membership" vocabulary.

The census must state what each epoch/fence protects and who writes it.

---

# 8. Phase Q5 — post-cutover MessageRouter convergence

Family root:

`core-convergence-message-router`

## Entry condition

Q0 already proved real rs-raft transport/demux and partition cutover.

If it did not, this phase must not start and must not absorb
`raft-rs-partition-transport-demux`.

## Target invariant

One addressing/delivery owner, explicit semantic protocols, no consensus policy
inside transport.

Conceptually:

```
                    MessageRouter
                         |
        +----------------+----------------+
        |        |        |       |       |
   partition   query    service   CDC    admin
     Raft
        |
 frozen operation-port step/tick boundary
```

## Census

Search production:

- socket/WebSocket creation and sends;
- transport adapter sends;
- worker/bridge sends;
- local direct handler invocation;
- bulk channel sends;
- Liferaft packet detection still reachable by partitions;
- rs-raft envelope/demux;
- route registration;
- request/reply correlation;
- fire-and-forget paths.

For each, identify:

- subsystem owner;
- semantic protocol;
- addressing owner;
- pressure/backpressure owner;
- local-delivery behavior;
- remote-delivery behavior.

## rs-raft transport invariant

The core/runtime owner never learns MessageRouter internals.

Transport owns:

- destination/addressing;
- local versus remote delivery;
- envelope routing validation;
- pressure/time budget.

Raft owns:

- message semantics;
- term/log/membership/quorum.

A sender absent from the receiver's current `ConfState` is not globally
invalid merely for that reason; membership-transition races require valid Raft
messages from not-yet-applied peers.

## Allowed separate channel

A dedicated bulk snapshot channel may remain when explicitly owned and bounded.
Do not collapse it for aesthetic uniformity.

## Adversarial bypass proof

Show:

- local and remote delivery enter the same partition semantic handler;
- no direct peer socket bypasses MessageRouter ownership;
- restart/bootstrap does not register a second partition handler;
- active message-group Liferaft routing is separately owned;
- bulk transfer cannot inject ordinary Raft/query/service messages;
- no transport code mutates `ConfState`, placement policy, or lifecycle state.

# 9. Phase Q6 — lifecycle/bootstrap/readiness convergence

Family root:

`core-convergence-readiness-lifecycle`

## Bootstrap envelope

Allowed process-local facts:

- node identity;
- seed/contact endpoints;
- local storage roots;
- transport listener configuration;
- credentials/trust bootstrap material as owned elsewhere;
- start/join mode.

Not allowed:

- a second durable copy of cluster placement;
- a second desired-replica policy store;
- a second durable readiness truth;
- a second operation ledger.

## Lifecycle domains must stay distinct

The merged rs-raft code has at least three differently scoped lifecycle
concerns:

1. `RaftRsReplicaLifecycleOwner`: local consensus-runtime eligibility
   (`active|retired`) and the zero-core-entry retirement fence;
2. replica/service lifecycle owners such as the existing
   `ReplicaStateMachine`: externally visible replica/service state;
3. topology operation workflow owners: durable progression of ADD/REMOVE/
   REPLACE.

They interact, but none is a replacement for the others.

A cleanup based only on the shared word "lifecycle" is forbidden. Q6 must
identify the owned handoff between the topology REMOVE executor and
`raftRsLifecycleAdministration.retireReplica(...)`, and prove that local
retirement neither independently completes the topology workflow nor gets
re-derived from cache visibility.

## Temporary owner handoff

Census startup/join/recovery/migration-only owners.

For each temporary owner:

- activation condition;
- semantic concern temporarily owned;
- steady-state owner;
- handoff condition;
- proof temporary entrypoint becomes unreachable or non-authoritative after
  handoff.

This directly exercises the existing
`phase-owner-handoff-completes` architecture invariant.

## Readiness decision census

Find every source site that can promote/authorize:

- node ACTIVE;
- cluster ACTIVE;
- `TRAFFIC_READY`;
- `repairEligible`;
- `serveEligible`;
- publication completeness;
- benchmark/harness admission.

For each, classify as:

- semantic owner;
- owner contract consumer;
- presentation-only;
- suspect duplicate.

## Evidence is not decision

A consumer may inspect:

- cache freshness;
- heartbeat;
- leases;
- publication;
- pressure;
- topology;
- workflow state.

But once the readiness owner emits a canonical state/action, the consumer must
not re-interpret those inputs into a conflicting decision.

## Adversarial readiness cases

At minimum preserve/test:

- stale cache;
- missing cache row;
- canonical owner present but observer missing;
- deferred owner outcome;
- pressure/high load;
- startup handoff;
- restart/recovery;
- publication lag;
- non-shrinking retry evidence.

Degraded evidence may block/defer/explain; it may not upgrade readiness.

---

# 10. Phase Q7 — canonical owner observation

Family root:

`core-convergence-owner-observation`

## Why this phase is late

Do not build an "architecture view" over duplicate semantics and then make it a
new de facto authority.

First converge the owners, then project them.

## Preferred reuse order

Before adding anything:

1. inspect existing admin/control snapshots;
2. inspect `PriorityRecoveryObservationSnapshot` and sibling owner snapshots;
3. inspect operation-progress observer;
4. inspect partition/Raft diagnostics;
5. inspect live-query/system-info work;
6. compose existing canonical outcomes if possible.

Only add a new read-only shape where composition otherwise forces a consumer to
re-derive semantics.

For partition consensus observation, prefer the existing immutable operation
port `readStatus()` projection (or its exact successor). Never expose RawNode,
the runtime owner, a handle, or mutable lifecycle state to make observability
easier. Label committed `ConfState` as observed consensus membership, never as
desired placement policy.

## Suggested partition explanation shape

Illustrative only; reuse current vocabulary:

```json
{
  "partitionId": "...",
  "capturedAt": "...",
  "declared": {
    "replicationFactor": 3,
    "sourceOwner": "..."
  },
  "decided": {
    "placementGeneration": "...",
    "desiredNodes": ["..."],
    "operationId": "...",
    "workflowState": "..."
  },
  "observed": {
    "raft": [
      {"nodeId": "...", "role": "...", "progress": "..."}
    ],
    "publication": "...",
    "readiness": {
      "repairEligible": true,
      "serveEligible": false
    }
  },
  "blockers": [
    {"owner": "...", "reasonCode": "...", "nextAction": "..."}
  ]
}
```

## Forbidden behavior

Observation code must not:

- mutate owner state;
- run repair;
- choose placement;
- decide workflow completion;
- synthesize readiness from raw evidence when an owner outcome exists;
- persist a second durable copy;
- poll because a live owner event/CDC path already exists unless polling is an
  explicit bounded recovery mechanism.

## Useful test

Remove or stale one observer input while owner state remains intact.

Expected:

- projection says evidence unavailable/stale/deferred;
- owner state does not change;
- no repair is launched by the projection;
- no readiness is upgraded.

---

# 11. Phase Q8 — partition cutover deletion and ratchets

Family root:

`core-convergence-legacy-surface-deletion`

## Only delete after Q0 proved cutover

Per compatibility surface:

1. list reachable consumers;
2. separate partition from message-group consumers;
3. redirect bounded partition consumers to canonical owners;
4. prove behavior;
5. re-run reachability census;
6. delete partition-only old surface;
7. prove zero partition production reachability;
8. add structural ratchet.

## Candidate surfaces

Re-census; do not assume:

- partition production selection of Liferaft;
- partition-only Liferaft provider/factory compatibility;
- native Liferaft packet detection on partition ingress;
- partition peer-array/cache membership helpers whose only meaning was the old
  backend;
- partition `LIFERAFT_*` timer/config vocabulary;
- old mutable Raft accessors;
- duplicate operation-state derivations;
- alternate readiness booleans;
- obsolete runtime/service paths.

## Explicit non-target

Do **not** require zero Liferaft references repository-wide.

If message groups still intentionally use Liferaft, retain the minimum owned
implementation they require and mark it in the owner census. Partition
convergence may still be complete.

## Structural ratchets

Prefer call/import/AST/runtime-construction proofs:

- production partition path cannot select Liferaft by omission/error;
- only runtime owner reaches vendored rs-raft binding;
- only lifecycle owner writes local retirement;
- participant code cannot import planner policy classifiers;
- no live partition consumer imports deleted compatibility;
- no partition network send/receive bypasses transport owner;
- no observer can obtain RawNode/core/runtime control.

Literal-name guards are secondary alarms only.

## Complexity check

Run scoped complexity/dependency/unused-export gates.

The expected direction is fewer partition consensus concepts after cutover.
Moving old behavior into another helper without reducing authority/reachability
is not success.

# 12. Q9 — integrated certification

Planned Quest id:

`core-convergence-certification`

## Entry gate

Do not start until:

- Q0 is READY;
- all source-changing child Quests landed;
- no verifier rejection is outstanding;
- owner/interaction censuses validate current head;
- the operation-boundary witness test is green and demonstrably executes the
  exported structural audit;
- model contracts and focused shards are green;
- no architectural UNKNOWN remains.

## Deterministic first

Run current canonical equivalents of:

```bash
npm run model:contracts
npm run model:invariants
npm run model:alloy
npm run model:statecharts
npm run model:owner-traces
npm run audit:runtime-grammar
npm run audit:operation-progress-authority
node scripts/run-classified-test-files.js test/raft/raft-rs-backend/operation-port-boundary.test.js
npm run test:metrics:scoped
npm run test:unused:ratchet
npm test
```

Also run the Q0-frozen focused rs-raft operation-port/lifecycle/recovery tests.

## Release proof

Run the repository's exact-main release proof on the exact terminal SHA.

A branch-only proof or a proof from the foundation merge is not terminal
evidence for the later convergence head.

## Live last

Use Q0-frozen scenarios covering:

1. cold cluster formation on the active partition backend;
2. declared RF reached without deriving policy from `ConfState`;
3. topology spread repair;
4. node join;
5. node loss/replacement;
6. rolling restart;
7. leader change under acknowledged writes;
8. lagging/wiped follower catch-up through active snapshot mechanism;
9. operation recovery after restart;
10. SQL read/write;
11. distributed SQL representative path;
12. service/WASM invocation near data;
13. admin/diagnostic observation does not affect owner outcomes;
14. committed rs-raft membership remains correct under hostile/stale metadata;
15. durable retirement cannot re-enter core after restart.

If message groups still use Liferaft, include their current focused recovery
proofs rather than pretending they were migrated.

## Terminal receipt

Produce `final-owner-delta.md` with:

- before owner/path;
- duplicate/bypass found;
- falsifier;
- landed Quest(s);
- after owner/path;
- deleted surface;
- retained out-of-scope active owner;
- ratchet;
- certification evidence.

List refuted cleanup hypotheses too, so future agents do not reopen them.

# 13. Adversarial verification matrix

Every independent verifier should use the rows applicable to the Quest.

| Attack | What it tries to disprove | Required response |
| --- | --- | --- |
| Rename attack | guard only catches spelling | rename/alias cannot resurrect bypass |
| Wrapper attack | raw authority is hidden one call deeper | reachability census still catches it |
| Nested-object attack | returned object exposes `parts.host.core`-style raw runtime | recursive/behavioral proof catches access |
| Alternate constructor | second runtime root exists | construction census names and rejects it |
| Recovery attack | old path reappears on restart/recovery | recovery test/census stays canonical |
| Config/provider attack | env/config selects fallback | production selection remains single-path |
| Stale-message attack | old authority applies after fence/generation moves | stale request is refused/replanned |
| Cache-stale attack | observer becomes authority | owner outcome wins; no promotion/repair |
| Missing-cache attack | local absence is read as operation failure | typed unavailable/deferred observation |
| Pressure attack | load opens correctness shortcut | same semantic path; latency/backpressure only |
| Timeout attack | timeout causes alternate mutation path | typed timeout/defer, no bypass |
| Simulator attack | test harness uses stand-in and passes falsely | production construction engagement proven |
| Local-vs-remote attack | local short-circuit has different semantics | both enter same semantic handler |
| Peer-autonomy attack | peer descriptor runs its own consensus timers | one participant owner only |
| Revert attack | change has no causal proof | named witness goes red on source revert |
| Deletion attack | compatibility path still reachable | zero production reachability after deletion |
| Evidence-integration attack | "duplicate" actually combines distinct evidence | verifier can refute deletion; keep site |

A verifier should record not just "tests pass" but which attacks were attempted
and what evidence ruled each out.

---

# 14. Quest authoring template

Use this template when creating a behavior-changing Quest under the epic.

## Statement skeleton

> **Owner:** `<semantic owner>` owns `<concern>`.
> **Defect:** `<exact site/path>` can independently
> `<authorize/reject/advance/complete/mutate>` the same concern by
> `<mechanism>`, bypassing/re-deriving `<canonical interaction>`.
> **Change:** route `<bounded consumer set>` through
> `<canonical owner interaction>` and remove `<duplicate capability>`.
> **Preserve:** `<safety/recovery/pressure/timeout behaviors>`.
> **Do not change:** `<neighbor owner concerns>`.

## doneWhen skeleton

A binary probe should establish:

1. canonical owner path is exercised;
2. duplicate path is unreachable or no longer semantic authority;
3. preserved behavior remains;
4. the load-bearing source change is red-on-revert;
5. no source outside declared scope is needed.

## Falsifiers section

List at least:

- one direct defect witness;
- one alternate explanation;
- one safety regression;
- one recovery/restart case where relevant.

Example:

```
F1: participant can reject planner-authorized transition by re-running placement policy.
F2: rejection is actually Raft mechanical safety, not placement re-derivation.
F3: removing the check can overrun the exact voter bound.
F4: concurrent membership change can make the authorization stale.
```

The Quest is allowed to conclude F1 was false and F2 was true.

## Scope

Name exact files/directories.

Do not use the whole epic's concern list as scope.

## Verification request

Ask the verifier to:

- inspect exact diff;
- trace both old and new call paths;
- run the named falsifier;
- revert each load-bearing source hunk or otherwise demonstrate red-on-revert;
- search for alternate reachability;
- report APPROVE or REJECT with one concrete reason per failed invariant.

---

# 15. Decision rules for ambiguous findings

## Looks duplicated but uses different evidence

Do not consolidate yet.

Write down:

- the two questions each site answers;
- their input evidence;
- where their outputs are consumed.

If questions differ, assign separate owners/interactions.

## Existing owner API is awkward

Do not create a new owner.

First ask whether a narrow method/contract on the existing owner is enough.

## Existing owner is too large

Size is not authority evidence.

Extract cohesive implementation modules only after semantic ownership is
settled. Do not split ownership by line count.

## Compatibility path has no production callers

Delete it in a narrow deletion Quest after proving:

- no dynamic/config/reflection caller;
- no recovery/startup caller;
- no supported public API contract requires it.

## Duplicate path is needed for recovery

Then it is not a normal-path duplicate.

Make recovery status explicit and prove:

- only activates under recovery condition;
- converges back to normal owner;
- cannot promote itself to normal path.

## A change would require a new store

Stop.

The burden of proof is high because the current architecture intentionally
keeps durable authority in tables and avoids secondary truth stores.

## A change would require bypassing MessageRouter

Stop and classify the transport interaction first.

Bulk transfer may be a legitimate exception only because it is explicitly
owned and bounded.

## The clean-room concept is not represented by a class

That is fine.

Conceptual clarity is the objective; new class count is not.

---

# 16. Expected final architecture narrative

When the epic is done, a future agent should be able to explain the core in
roughly this order:

1. A process starts with only local bootstrap facts and reaches the cluster's
   durable system-table truth.
2. MessageRouter is the node's owned local/remote addressing surface.
3. Each local partition replica has one Lagrange assembly:
   - it receives a frozen rs-raft operation port, not a RawNode/control graph;
   - one runtime owner alone enters the vendored Rust/WASM core;
   - one lifecycle owner gates local active/retired eligibility;
   - SQLite stores consensus/application durability through the named owners.
4. Committed rs-raft ConfState is current consensus membership.
5. Declared placement/RF policy is separate durable intent and is never inferred
   from current ConfState, replica identities, or service-row counts.
6. MovePlanner decides desired topology changes.
7. Durable topology/workflow owners carry those decisions through idempotent
   operations and request exact consensus changes.
8. The rs-raft core decides/commits consensus membership; partition participants
   enforce only the Lagrange preconditions they actually own and do not re-plan
   placement.
9. OwnerKeyReconcileQueue serializes/de-duplicates owner work; it does not own
   semantics.
10. SystemTableCache and observation snapshots are read models, never completion
    or consensus-membership authorities.
11. SqlCore is the single SQL execution owner.
12. Artifact/Binding/Cell plus the runtime driver/lifecycle owners are the
    service execution model.
13. Diagnostics/admin/live views explain owner outcomes without repairing or
    redefining them.
14. Any intentionally retained Liferaft subsystem such as message groups is
    separately owned and cannot become a silent partition fallback.

If explaining one of these requires saying "except this other path also decides
..." the epic is not finished, unless that exception is an explicitly named
and proven owner interaction/recovery path.

---

# 17. Ready-to-use handoff prompt for the agent that starts Q0

Use this now, on a current shared main descended from the rs-raft foundation:

> Continue from current shared `main`. Read
> `solve/epics/core-architecture-convergence.md` and
> `solve/epics/core-architecture-convergence/design.md` first, then current
> steering rules and owner docs.
>
> Start only Q0, `core-convergence-rs-raft-readiness-baseline`. Do not assume
> that "rs-raft merged" means "partition cutover complete". The foundation merge
> at `f4f5b5a6e9c27d139b3ada85e0aabe38eb526480` still declared Liferaft the
> default and its operation-port Quest explicitly kept real rs-raft transport
> blocked.
>
> This is a read-only census Quest: no `src/` behavior changes. Reuse the
> existing rs-raft operation-boundary audit and receipts instead of cloning
> them. Establish the exact current main SHA, exact-main release-proof result,
> partition backend default and every production selection/injection path,
> current rs-raft operation-boundary ownership, committed ConfState membership
> authority, real inbound/outbound MessageRouter path, restart/membership proof
> over real transport, and every remaining Liferaft production consumer
> classified separately as partition, message-group, migration/test or dead.
>
> Produce one explicit outcome:
> `READY_FOR_CORE_CONVERGENCE` only if the production partition path has one
> intended backend, real transport is proven, omitted/error configuration cannot
> silently fall back to Liferaft, the operation-boundary audit is green,
> exact-main release proof is green, and zero UNKNOWN remains.
> Otherwise produce `BLOCKED_ON_RAFT_CUTOVER` naming the exact predecessor
> obligation and stop.
>
> The Q0 probe is static. It may read source, receipts and committed proof
> artifacts; it must not start a cluster/network/runtime. Before landing, obtain
> independent verification that actively tries provider-option omission,
> direct provider injection, restart/recovery construction, RawNode/core escape,
> second lifecycle writer, service-row-as-membership confusion, missing inbound
> demux, stale receipt evidence and message-group/partition misclassification.
>
> Do not proceed to Q1 in the same Quest, and do not implement missing Raft
> transport/cutover work merely to make Q0 green.

This prompt is deliberately bounded.

