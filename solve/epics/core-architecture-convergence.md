---
id: core-architecture-convergence
status: open
proof: certification
roadmapRow: null
graduatesTo: null
doneWhen:
  probe: oracle
  args:
    file: solve/oracle/core-architecture-convergence.json
quests: []
authorizes:
  - architecture
  - docs
  - package.json
  - scripts/checks
  - solve/oracle
  - src/admin
  - src/bootstrap
  - src/cdc
  - src/config
  - src/constants
  - src/control-plane
  - src/message-group
  - src/node
  - src/partition
  - src/policy
  - src/query
  - src/raft
  - src/rebalancer
  - src/runtime
  - src/service
  - src/transport
  - src/wasm-service
  - src/worker
  - src/workflow
  - src/lagrange-runtime-startup.js
  - test/admin
  - test/bootstrap
  - test/control-plane
  - test/distributed
  - test/message-group
  - test/node
  - test/partition
  - test/policy
  - test/query
  - test/raft
  - test/rebalancer
  - test/runtime
  - test/manifests
  - test/scripts
  - test/service
  - test/shards
  - test/simulation
  - test/transport
  - test/wasm-service
  - test/workflow
---

# Core architecture convergence

## Status and activation

The rs-raft/WASM foundation is now merged on shared `main` at
`f4f5b5a6e9c27d139b3ada85e0aabe38eb526480`.

That merge is a **foundation landing**, not evidence that the partition Raft
cutover is already complete. The exact merged tree currently says all of the
following:

- `RAFT_BACKEND_DEFAULT` is still `liferaft`;
- `raft-rs-wasm` is selected only when `raftBackend` names it explicitly;
- `PartitionService` now constructs consensus through
  `raftProvider.createPartitionPort(...)` rather than a direct LifeRaft
  subclass;
- the rs-raft side exposes a frozen operation-only port;
- `src/raft/raft-rs-runtime-owner.js` is the production binding/core-entry
  owner;
- `RaftRsReplicaLifecycleOwner` owns durable rs-raft replica retirement;
- rs-raft peer identity reservation has a separate administration boundary;
- `scripts/checks/raft-rs-operation-boundary-audit.js` guards several of
  those ownership boundaries structurally;
- the sealed operation-port Quest is 11/11 green and its targeted
  operation/formation proof was 260/260 green;
- that Quest deliberately kept real rs-raft transport/demux blocked;
- PR #46 was merged with an owner-authorized bypass of the independent-review
  landing condition, and the merge commit explicitly says exact-main release
  certification follows after landing.

Therefore this epic is now **post-rs-raft-foundation**, but it is not allowed to
pretend it is post-cutover.

The first Quest is a read-only readiness/baseline Quest. It must classify the
actual current production backend, real-transport status, exact-main release
proof, and remaining Liferaft reachability. If the intended partition cutover is
not yet complete, the Quest stops with a typed blocker and this epic waits for
the Raft predecessor work. It does not absorb transport/cutover work merely to
make itself start.

Message groups are a separate concern. Liferaft remaining reachable for an
explicitly owned message-group path does not by itself block this epic. A silent
partition fallback to Liferaft after partition cutover would block it.

## Intent

Make the running implementation converge on the architecture Lagrange already
claims:

> one semantic owner per concern, one owned interaction between owners, one
> execution path, durable authority separated from observations, and no
> subsystem that re-derives another owner's decision.

This is **not a rewrite epic**.

The desired outcome is a smaller and more explainable core produced primarily
by:

- keeping proven owners;
- strengthening their explicit contracts;
- redirecting consumers to those contracts;
- deleting duplicate semantics and compatibility paths;
- refusing new stores, planners, state machines, transports, runtime roots, or
  generic frameworks unless a census proves that no current owner can carry
  the concern;
- retaining the existing deterministic/simulation and model infrastructure as
  falsifiers rather than replacing it.

The clean-room architecture discussion that motivated this epic is a
**reference model for finding duplicate authority**, not a component shopping
list.

## Why this epic follows the rs-raft foundation and cutover boundary

The merged foundation already removed a large amount of the object-graph risk
that motivated the clean-room recommendation. In particular, the rs-raft path
now has an operation-only port and explicit runtime/lifecycle ownership. Re-doing
that work inside this epic would be waste.

The high-value ordering is now:

```
merged rs-raft foundation
        ↓
real partition transport + production cutover decision/certification
        ↓
this epic's owner census
        ↓
converge the rest of Lagrange around the owners that survived
```

The start gate matters because the current tree is intentionally dual-backend.
If this epic started by deleting Liferaft assumptions before the partition
cutover contract is settled, it could accidentally change the migration itself.
Conversely, if the cutover is complete but the code still has silent partition
fallbacks, those are migration defects rather than "architecture cleanup".

So Q0 answers one narrow question first:

> Is the partition Raft migration sufficiently complete and certified that the
> rest of Lagrange can now be simplified around the rs-raft operation boundary?

Only a measured yes opens the behavior-changing convergence phases.

## Existing owners to preserve unless disproved

The current merged rs-raft boundary materially sharpens this map. These are
semantic anchors to re-confirm in Q0/Q1, not names to recreate if they later
move:

- partition-local execution assembly: `PartitionService`;
- partition consensus provider selection:
  `src/raft/raft-backend-selection.js`;
- rs-raft provider:
  `RaftRsWasmProvider`;
- rs-raft partition interaction:
  the frozen operation port from `createRaftRsOperationPort(...)`;
- rs-raft binding/core-entry owner:
  `src/raft/raft-rs-runtime-owner.js`;
- rs-raft durable consensus state:
  `RaftRsDurableStore` plus the application/progress transaction owner;
- rs-raft local replica lifecycle:
  `RaftRsReplicaLifecycleOwner`;
- rs-raft lifecycle administration:
  `raftRsLifecycleAdministration`, reached from the named replica-removal
  coordinator path;
- rs-raft peer identity reservation administration:
  `raft-rs-membership-administration.js`;
- **consensus membership on rs-raft: the core's committed `ConfState`**;
  identity reservation and service metadata are not second consensus-membership
  authorities;
- partition durable/application storage integration:
  the current partition SQLite/storage owners;
- partition writes: `PartitionWriteKernel`;
- partition-local transactions: `PartitionTransactionHandler`;
- split lifecycle: `ManagedSplitWorkflow`;
- placement planning: `MovePlanner`;
- topology operation lifecycle: `OperationWorkflowOwner` and
  `RebalanceCoordinator` at their documented resources;
- durable workflow mechanics: `DurableWorkflowCoordinator`;
- event-triggered owner progression: `OwnerKeyReconcileQueue`;
- dispatch: `ReplicaDispatchService`;
- control-plane readiness: `ControlPlaneReadinessService`;
- node-local metadata read model: `SystemTableCache`;
- transport/addressing: `MessageRouter`;
- SQL planning/execution: `SqlCore`;
- runtime selection: `Runtime_Driver_Registry`;
- runtime lifecycle: `Service_Runtime_Lifecycle`;
- service model: Artifact / Binding / Cell;
- architecture ownership rules and model bindings:
  `architecture/contracts/core-system-logic.md`,
  `architecture/contracts/invariants.json`, and
  `architecture/current-owner-maps.md`.

Important distinction for Q1: `raft-rs-membership-administration.js` reserves
stable peer identity for an intended configuration change. It does **not** own
which peers are currently members of the Raft group. The committed
`ConfState` does.

If a later census shows one of these names moved, map the semantic concern to
the actual owner. Never restore a historical class merely to satisfy this
document.

## Binding non-goals

The following are forbidden by default. A future Quest may supersede one only
with a specific owner decision and a falsifier proving the current owner cannot
carry the concern.

1. **No new `PartitionRuntime` mega-owner.**
   The useful concept is "one local partition replica has one understandable
   owner boundary". Prefer the existing partition assembly and its existing
   sub-owners. Do not create a second root around them.

2. **No second durable bootstrap database or `ClusterKernel` store.**
   Keep durable cluster truth in Lagrange tables. Process-local seed/contact,
   node identity, local storage roots, and transport configuration may remain a
   bootstrap envelope; they are not a second metadata authority.

3. **No second placement planner.**
   `MovePlanner` remains the placement decision owner unless explicitly
   superseded. A participant may enforce local mechanical/Raft safety; it may
   not re-plan placement policy.

4. **No second workflow engine.**
   Reuse `DurableWorkflowCoordinator` for durable multi-step mechanics and
   the existing topology owners for topology semantics.

5. **No replacement for `OwnerKeyReconcileQueue` merely because the epic
   wants "less reconciliation".**
   Enqueue-one-owner-key and let the owner decide is good reconciliation.
   The deletion target is consumer-local semantic re-derivation, inline
   progression, and parallel owner logic.

6. **No family of independent semantic transports.**
   Raft, query, service, admin, and CDC semantics may have explicit envelopes
   or handlers, but local and remote addressing still converge through
   `MessageRouter` unless the transport owner is intentionally superseded.

7. **No generic `GenerationManager` or universal epoch framework.**
   Raft terms, workflow fences, operation versions, config epoch, planning
   generations, artifact versions, and replica incarnations have different
   semantics. Add a monotonic fence to the owning domain when stale authority
   is a demonstrated defect.

8. **No new formation state machine.**
   Reuse lifecycle/readiness/publication owners. Strengthen their contracts if
   they still admit local reinterpretation.

9. **No simulator-driven production design.**
   The deterministic formation simulator observes production owners. Simulator
   work does not authorize changing production semantics merely to make the
   simulator easier. Preserve the repository's current rule that simulator
   quests do not touch `src/`; a missing production seam becomes a separate
   production Quest with its own proof.

10. **No "cleanup" whose only proof is tests remain green.**
    Every deletion or redirection needs a falsifier for the duplicate authority
    or bypass it claims to remove.

## The target conceptual model

The end state should be explainable without introducing new runtime
subsystems:

```
process/bootstrap envelope
          |
          v
     MessageRouter
          |
          v
 local partition replica assembly
   |       |        |
   |       |        +-- SQLite / durable partition storage
   |       +----------- post-migration Raft engine adapter
   +------------------- partition-local execution owners

declared policy
      |
      v
  MovePlanner
      |
      v
durable operation/workflow owners
      |
      v
partition participant / local safety
      |
      v
canonical owner outcome
      |
      +--> SystemTableCache / diagnostics / admin / harness projections
```

SQL and services sit above that substrate:

```
PG/internal/service ingress --> SqlRequest --> SqlCore --> partition execution

Artifact + Binding --> placed Cell --> runtime driver --> ctx.call / SqlCore
```

The important distinctions are semantic, not class names:

### Declared

What the operator/system policy says should be true.

Examples:

- `partitions.replica_count`;
- table placement constraints;
- service/runtime policy.

### Decided

What the relevant owner has authorized next.

Examples:

- a `MovePlanner` placement decision;
- an operation-specific temporary-overflow authorization;
- a durable operation/workflow step.

### Observed

What the system currently sees.

Examples:

- actual Raft membership/progress;
- node/service publication;
- cache visibility;
- learner catch-up;
- runtime health.

An observer may block or explain. It may not silently become declared policy or
recreate a planner decision.

## Planned work sequence

The names below are **planned Quest ids only**. They are intentionally not in
front matter and no Quest should be pre-created before its predecessor has
produced the evidence required to scope it.

### Q0 — `core-convergence-rs-raft-readiness-baseline`

Freeze and adversarially classify the exact rs-raft foundation and cutover
state on current shared `main`.

**No production behavior change.**

This Quest reuses the merged proof machinery instead of rebuilding it. In
particular, it consumes and independently checks:

- `scripts/checks/raft-rs-operation-boundary-audit.js`;
- the sealed `raft-rs-operation-port-boundary` evidence;
- the real-partition rs-raft tests already on main;
- current provider-selection source;
- current partition transport/demux source;
- current release-proof result for the exact main SHA.

Required output:

1. exact foundation/cutover head being measured;
2. exact-main release-proof status;
3. current partition backend selection state:
   - default backend;
   - explicit selection paths;
   - whether any production startup path can omit selection and silently reach
     Liferaft after cutover;
4. current rs-raft operation-boundary audit result;
5. current real partition transport status:
   - outbound MessageRouter path;
   - inbound semantic demux;
   - restart/catch-up over real transport;
6. current partition consensus-membership authority;
7. every remaining Liferaft production reachability classified by semantic
   consumer:
   - partition;
   - message group;
   - migration/test-only;
   - history/dead;
8. current partition-only cutover deletion candidates;
9. current documentation drift caused by the foundation merge;
10. exact current certification commands/scenarios to be reused by Q9.

The Quest returns one of two explicit outcomes:

- `READY_FOR_CORE_CONVERGENCE`: the partition rs-raft cutover is complete
  enough that later phases can simplify around the operation-port boundary;
- `BLOCKED_ON_RAFT_CUTOVER`: transport, default selection, exact-main
  certification, or another named migration obligation is still incomplete.

At the commit where this epic was revised
(`f4f5b5a6e9c27d139b3ada85e0aabe38eb526480`), the source is expected to
classify as **blocked**, because Liferaft is still the partition default and the
operation-port Quest explicitly kept real rs-raft transport/demux blocked. That
is not an epic failure; it is the correct measurement.

**Stop condition:** on `BLOCKED_ON_RAFT_CUTOVER`, do not "helpfully" finish
the Raft migration inside this Quest. Record the exact predecessor work and
stop. Q1 begins only after Q0 is re-measured green on a later exact main head.

### Q1 — `core-convergence-owner-census`

Build the authoritative "concept -> owner -> owned interaction -> consumers ->
observers -> compatibility surfaces" census **after Q0 says the partition
cutover is ready**.

No production behavior change.

Seed the census from the owners the rs-raft foundation already proved rather
than treating them as greenfield unknowns:

- operation port = partition's rs-raft interaction surface;
- runtime owner = sole rs-raft binding/core-entry owner;
- lifecycle owner = local active/retired authority;
- peer-identity administration = stable identity reservation boundary;
- committed `ConfState` = rs-raft consensus-membership authority;
- partition service = Lagrange participant/assembly above those owners.

At minimum census:

- local partition replica assembly;
- Raft runtime construction and lifetime;
- partition consensus-membership mutation;
- peer identity reservation;
- local replica retirement;
- partition durable consensus state;
- partition write/apply state;
- placement policy;
- topology operation state;
- durable workflow mechanics;
- event/reconcile progression;
- lifecycle/readiness;
- publication;
- metadata read model;
- SQL execution;
- service runtime selection/lifecycle;
- transport/addressing;
- diagnostic/admin/harness projections;
- any remaining partition Liferaft compatibility surface after cutover;
- message-group Liferaft surface separately, so it is not accidentally deleted
  as partition debt.

Classify every site as:

- `OWNER`;
- `OWNED_INTERACTION`;
- `CONSUMER`;
- `OBSERVER`;
- `COMPATIBILITY`;
- `SUSPECT_DUPLICATE_AUTHORITY`;
- `OUT_OF_SCOPE_ACTIVE_OWNER`;
- `UNKNOWN`.

`UNKNOWN` is red. An intentionally active message-group Liferaft owner should
be `OUT_OF_SCOPE_ACTIVE_OWNER`, not mislabeled duplicate debt.

Follow reachable call/construction graphs, not names alone. A wrapper,
re-export, nested escape, alias, provider option, or restart/recovery constructor
still counts as reachability.

### Q2 — preserve and finish the local partition operation boundary

Planned family root: `core-convergence-partition-boundary`.

The rs-raft foundation has already answered a major part of the clean-room
question: **do not create another `PartitionRuntime`, RawNode facade, or
control object.**

The existing frozen operation port is now the presumptive correct boundary.
Q2 exists only for concrete residual leaks found by Q1, for example:

- a consumer can still reach mutable consensus/storage internals around the
  port;
- a second core/binding invocation route appears;
- a restart/recovery path constructs an unowned runtime;
- a compatibility accessor recreates provider control;
- partition code relies on Liferaft-only semantics after partition cutover;
- a port operation is so broad that it reintroduces arbitrary-core capability.

The existing operation-boundary audit and its mutation/falsifier tests are
standing gates for every Q2 child Quest; do not fork a second checker that asks
the same question.

Default direction:

- keep `PartitionService` as the Lagrange assembly/root;
- keep the frozen rs-raft operation port;
- keep `raft-rs-runtime-owner.js` private to binding/core entry;
- keep lifecycle and peer-identity administration separate from data-plane
  operations;
- keep specialized partition write/storage/transaction/split owners;
- narrow or delete only proven residual reach-throughs;
- preserve immutable status snapshots by value.

Potential work MUST be split by interaction. Do not combine consensus lifetime,
write semantics, transaction semantics, membership policy, and split/merge
behavior in one Quest.

If Q1 finds no residual partition-boundary defect, Q2 is a verified no-op
phase. Do not manufacture a refactor because the epic originally expected one.

### Q3 — declared / decided / observed authority separation

Planned family root: `core-convergence-state-authority`.

The rs-raft merge makes one distinction especially important:

```
DECLARED / DESIRED
  table + placement policy, operation intent
          ↓
DECIDED
  MovePlanner / topology workflow authorizes a transition
          ↓
REQUESTED CONSENSUS CHANGE
  Lagrange submits one operation through the partition port
          ↓
CONSENSUS AUTHORITY
  raft-rs commits and exposes ConfState
          ↓
OBSERVED / PROJECTED
  services rows, caches, admin/harness diagnostics
```

For rs-raft, committed `ConfState` is the authority on who is in the Raft
configuration. A service/cache row may:

- provide routing/address evidence;
- represent declared/desired topology;
- wake the owner to consider a transition;
- project a committed result outward.

It must not become a second answer to "who is currently a Raft voter/learner?"

Conversely, `ConfState` is not placement policy. It does not decide where a
partition *should* live. That remains above consensus.

The first Q3 attempt must census:

- every derivation of desired replica count;
- every derivation of required spread/failure-domain count;
- every temporary-overflow authorization;
- every place a participant re-derives an already-decided placement rule;
- every place service/cache metadata requests a consensus membership change;
- every place service/cache metadata is treated as if it already *is* consensus
  membership;
- every place `ConfState` or `readStatus()` is misused as desired placement
  policy;
- every place cache/service rows infer workflow completion or canonical
  leadership when a durable owner exists.

Do not delete all service-row-driven reconciliation merely because Liferaft made
service rows consensus authority. Under rs-raft, a metadata event may
legitimately request a configuration change while the core remains the only
authority that commits it. The falsifier must distinguish those two roles.

After partition cutover, Liferaft-only cache-to-local-peer-array membership
machinery is a deletion candidate. It is not replaced by a new Lagrange
membership protocol above rs-raft.

### Q4 — workflow and reconciliation convergence

Planned family root: `core-convergence-workflow-reconcile`.

Goal:

```
event
  -> enqueue owner key
  -> one owner loads durable state
  -> one owner emits next legal action/outcome
  -> executor acts
  -> typed outcome returns
```

Preserve:

- `OperationWorkflowOwner`;
- `RebalanceCoordinator` at its documented row fields;
- `DurableWorkflowCoordinator` for generic workflow mechanics;
- `OwnerKeyReconcileQueue`;
- `ReplicaDispatchService`;
- `ExecutorOutcomeEmitter`.

Find and eliminate, where actually present:

- event handlers that progress long-running work inline;
- direct writes to owner-managed operation fields;
- workflow completion inferred from cache visibility, publication symptoms, or
  timer age;
- local retry/progression loops that bypass the owner-key queue;
- callers that reconstruct `operation_progress` meaning from raw topology
  rows after a canonical owner outcome exists;
- periodic loops that are acting as the normal path rather than recovery-only
  safety nets.

A periodic recovery sweep is not a duplicate normal path merely because it
exists. Its authority and activation conditions must be classified before any
deletion.

### Q5 — post-cutover MessageRouter and Raft transport ownership

Planned family root: `core-convergence-message-router`.

This phase is **not** the missing `raft-rs-partition-transport-demux` migration
Quest. If rs-raft real transport/demux is still incomplete, Q0 blocks this epic.

Once the partition cutover is certified, Q5 verifies that the landed transport
has the intended owner shape and removes only duplicate/bypass semantics:

- one local/remote addressing owner remains;
- rs-raft messages enter through the frozen operation port's `step` operation
  or its exact successor;
- scheduling enters through owned tick/scheduling operations;
- transport validates envelope/routing facts but never Raft membership/quorum;
- legitimate membership-transition traffic is not rejected merely because the
  sender is absent from the receiver's current `ConfState`;
- local short-circuit and remote delivery share the same semantic handler;
- no provider, worker bridge, snapshot path, query path, or service call opens
  an ungoverned side channel.

Census:

- direct socket/WebSocket/network writes from `src/`;
- direct local handler invocation that bypasses canonical routing;
- rs-raft and Liferaft packet/envelope demux still reachable after cutover;
- query/service/admin/CDC semantic dispatch;
- bulk snapshot-transfer exceptions and their owned interaction with
  MessageRouter/pressure accounting;
- partition versus message-group transport ownership, so an active
  message-group Liferaft path is not mistaken for partition fallback.

The dedicated bulk channel is not presumed wrong. Prove a second authority
before changing it.

### Q6 — lifecycle, bootstrap and readiness convergence

Planned family root: `core-convergence-readiness-lifecycle`.

Goal:

- bootstrap retains only the minimum process-local envelope required to reach
  durable system-table truth;
- lifecycle/readiness/publication contracts remain the owners of readiness;
- no new formation state machine is created;
- callers consume canonical `contractState` / `nextAction` or the
  current post-migration equivalents rather than interpreting raw evidence;
- temporary phase owners hand off completely to steady-state owners.

Census for:

- every decision that upgrades `serveEligible`, `repairEligible`,
  `TRAFFIC_READY`, ACTIVE, or their successors;
- every caller that branches on raw cache presence, phase labels, timers, or
  partial evidence when an owner outcome exists;
- every bootstrap-mode direct-write or temporary-owner path reachable after
  handoff.

The desired result is not "fewer readiness checks". It is one interpretation of
readiness with many legitimate evidence inputs.

### Q7 — canonical owner observation for operators

Planned family root: `core-convergence-owner-observation`.

This is the one phase allowed to add a small new **read-only** contract if the
census proves the existing owner outcomes cannot already be composed without
semantic re-derivation.

Goal: make a partition/operation explainable from owner-produced state.

A useful projection should be able to answer, with provenance:

- declared RF/policy;
- decided placement/operation;
- observed Raft membership/progress;
- operation/workflow state;
- readiness dimensions;
- current blocker/reason codes;
- source owner and capture generation/epoch where applicable.

This projection MUST NOT:

- write anything;
- repair anything;
- infer owner state from raw rows when a canonical owner outcome exists;
- become a new cache of durable truth;
- create a second readiness or placement vocabulary.

Prefer extending current observation snapshots / admin contracts over creating a
new service.

### Q8 — partition cutover deletion, compatibility-surface deletion and complexity ratchet

Planned family root: `core-convergence-legacy-surface-deletion`.

Only after Q0 has proven partition cutover and bounded consumers have moved to
canonical owners:

- delete partition-only Liferaft compatibility that no longer has a production
  consumer;
- delete old partition packet/membership/timer vocabulary proven unreachable;
- delete duplicate owner derivations proven by earlier Quests;
- migrate remaining semantic behavior out of legacy ordinal
  `segment-*` / `stage-*` compatibility surfaces where current owner cards
  already identify the destination;
- tighten dependency direction so observers cannot import lower-level mutable
  owner internals;
- retain the rs-raft operation-boundary audit as a permanent ratchet.

**Do not use a global "no Liferaft in src" criterion.** Message groups or another
explicitly owned subsystem may still use Liferaft. The correct cutover
invariant is:

> production partition construction/operation has one backend path, and cannot
> silently fall back to Liferaft by omission or error.

If message-group migration is later chosen, that is separately scoped work.

Candidates to re-census after cutover include:

- `raft-backend-selection.js` dual-backend production reachability;
- partition-only uses of `LIFERAFT_*` constants/vocabulary;
- partition packet detection built only for native Liferaft packets;
- peer-array/cache membership helpers that exist solely for Liferaft;
- old provider/factory compatibility;
- raw mutable Raft accessors;
- alternate operation-state/readiness derivations;
- obsolete runtime/service paths.

Every deletion requires a reachability falsifier and a red-on-revert ratchet.
Renaming a Liferaft symbol without removing the alternate semantic path is not
progress.

### Q9 — integrated certification

Planned Quest: `core-convergence-certification`.

No new architecture work is authorized here. It certifies the converged system
on one exact shared head.

The matrix frozen by Q0 must include the current canonical equivalents of:

- exact-main release proof;
- architecture/model contracts;
- `raft-rs-operation-boundary-audit`;
- rs-raft operation-port/lifecycle/recovery/provenance witnesses;
- rs-raft real partition restart and committed `ConfState` authority;
- real partition transport/demux;
- focused partition tests;
- placement/rebalancer/workflow tests;
- message routing/transport tests;
- SQL path tests;
- WASM/runtime-service invocation;
- deterministic formation simulation;
- three/five-node cold formation;
- rolling restart/churn;
- lagging/wiped follower catch-up using the active snapshot mechanism;
- acknowledged-write correctness across leader change;
- operation recovery/replay;
- representative service-near-data execution.

If message groups still intentionally use Liferaft, their focused safety and
recovery proofs remain part of certification. Q9 must not hide that mixed
implementation; the final owner map names it explicitly.

The live/costly runs are terminal evidence, not a debugging loop.
Deterministic/focused proofs must be green first.

## Per-Quest adversarial proof contract

Every behavior-changing Quest in this epic must satisfy all of the following.

### 1. Name the owner before the symptom

The sealed statement names:

- the semantic concern;
- the current owner;
- the owner interaction being changed;
- the exact suspected duplicate/bypass;
- why the duplicate is semantically the same decision rather than merely
  nearby logic.

### 2. Build a falsifier before the fix

At least one test/probe must fail for the claimed architectural defect.

Good examples:

- two reachable mutation authorities exist for one field;
- a caller can bypass the owner and still mutate state;
- a participant re-derives a planner-owned decision and can disagree;
- a stale observer can upgrade readiness;
- a peer representation autonomously schedules Raft work;
- a direct transport path avoids MessageRouter accounting/ownership.

Bad examples:

- "the file is large";
- "the code looks duplicated";
- "all tests stay green after cleanup";
- a grep that can be defeated by renaming.

### 3. Test reachability, not vocabulary

Where possible, adversarially test:

- aliases and re-exports;
- nested raw objects;
- wrapper methods;
- alternate constructors;
- dependency injection escape hatches;
- test-only defaults accidentally reachable in production;
- fallback/provider selection;
- stale messages/generations;
- restart/recovery entrypoints.

### 4. Separate contract migration from deletion

Preferred sequence:

1. prove existing owner;
2. expose/strengthen the canonical interaction if necessary;
3. redirect one bounded consumer set;
4. prove no semantic change except removal of the duplicate path;
5. delete the obsolete path;
6. prove the old path is unreachable;
7. add a ratchet.

Do not move large amounts of code and change behavior in the same attempt.

### 5. Red on source revert

For every load-bearing source change, the verifier must identify the witness
that turns red if that change is reverted while the rest of the attempt
remains.

If no witness changes, the source change is not proven by the Quest.

### 6. Independent verification is hostile, not ceremonial

The verifier must attempt to disprove:

- that the named owner is actually unique;
- that the old path is actually unreachable;
- that the replacement uses the canonical owner rather than copying its logic;
- that restart/recovery does not reopen the old path;
- that test/simulator wiring did not replace production semantics;
- that a renamed/relocated duplicate did not satisfy a static guard;
- that a cache/observer became a hidden new authority;
- that the change silently weakens pressure, timeout, or fail-closed behavior.

An independent verifier may approve a no-op/refutation. "The suspected
duplicate is legitimate evidence integration" is a valid and useful outcome.

## Scope discipline for weaker agents

This epic is intentionally written so GPT-5.5/Kimi-class agents can execute it
without architecture invention.

Rules:

- one semantic concern or one owner interaction per behavior-changing Quest;
- default to fewer than ~12 touched `src/` files; exceeding that is a signal
  to stop and split unless the extra files are mechanical imports/deletions;
- do not broaden a Quest because the same smell appears elsewhere; record a
  finding for the appropriate later phase;
- do not edit an owner and all its observers in one unbounded sweep;
- do not create a new abstraction until the census shows at least two
  duplicated semantics that the existing owner cannot absorb;
- never use this epic's broad `authorizes` list as the effective Quest scope: every Quest must bind itself to the smallest paths required by its sealed concern;
- follow R15-R23 and R27 in `docs/steering/rules.md`;
- read the applicable owner card before touching its code;
- if repository current state contradicts this document, current source +
  owner docs win and the contradiction is recorded before proceeding.

## Required standing gates

The exact current command surface is re-confirmed in Q0. At authoring time the
relevant stable gates include:

```bash
npm run model:contracts
npm run model:invariants
npm run model:alloy
npm run model:statecharts
npm run model:owner-traces
npm run audit:runtime-grammar
npm run audit:operation-progress-authority
node scripts/checks/raft-rs-operation-boundary-audit.js
npm run test:metrics:scoped
npm run test:unused:ratchet
```

Use `npm test` / classified focused tests according to changed files. Do not
substitute a huge unrelated sweep for a missing focused falsifier.

## Epic completion criteria

This epic may close only when all of the following are true on one exact shared
head:

1. Q0 records `READY_FOR_CORE_CONVERGENCE`, not a waived migration blocker.
2. Exact-main release proof is green for the active partition Raft backend.
3. Production partition construction has one authoritative backend path; no
   silent Liferaft fallback remains after partition cutover.
4. The rs-raft operation-only boundary remains intact:
   - one binding/core-entry owner;
   - frozen operation port;
   - one durable local lifecycle owner;
   - peer identity administration does not become consensus membership;
   - structural boundary audit green.
5. Current partition consensus membership comes from the committed rs-raft
   `ConfState`; metadata may request/project changes but is not a competing
   membership authority.
6. Every targeted core semantic concern has one documented owner and every
   cross-owner interaction changed by this epic has one canonical contract.
7. No targeted participant re-derives placement policy already decided by
   `MovePlanner`.
8. Desired replication policy is not inferred from current replica identities,
   observed `ConfState`, or cache membership.
9. Operation/workflow progression uses documented durable owners;
   observers/cache/publication/timers are not alternative completion oracles.
10. Event-triggered progression routes through the canonical owner path;
    recovery sweeps are classified and cannot become an alternate normal owner.
11. Partition semantic communication uses the canonical MessageRouter/owned
    transport interactions; any explicit bulk path remains separately owned and
    bounded.
12. Bootstrap/readiness has no second durable truth store or second readiness
    state machine introduced by this epic.
13. SQL and service runtime entrypoints still converge on their existing single
    execution/runtime owners.
14. Observation surfaces project owner outcomes without becoming authority or
    exposing rs-raft RawNode/runtime control.
15. Every deleted partition compatibility/bypass path has an adversarial
    reachability guard that cannot be satisfied by renaming.
16. Any remaining Liferaft production use is explicitly mapped to a different
    owner such as message groups; it is not an implicit partition fallback.
17. Architecture contracts, invariants, owner maps, current-state docs, and
    implementation agree.
18. The integrated deterministic and live certification matrix frozen by Q0 is
    green on the exact terminal head.
19. An independent final verifier finds no unclassified raw mutation path for
    the concerns this epic claims to converge.

## What success should look like

Success is not a new framework with cleaner names.

Success should look like:

- fewer ways to make the same decision;
- fewer objects exposing mutable internals across owner boundaries;
- fewer compatibility branches;
- fewer consumer-local interpretations of raw state;
- existing workflow/queue/router/model machinery doing more of the work it was
  already designed to own;
- a smaller current owner map;
- easier causal explanations;
- stronger red-on-revert proofs;
- no reduction in correctness, recovery, or operability.

If the line count barely changes but duplicate authority disappears, the epic
can still be successful. If the line count drops dramatically by deleting
evidence integration or recovery safety, it is a failure.
