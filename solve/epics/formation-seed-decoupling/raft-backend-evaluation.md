# raft-rs backend evaluation

<!-- GENERATED from raft-backend-evaluation.json by
     test/raft/backend-evaluation/build-evaluation-document.js. Do not edit by hand. -->

Generated 2026-09-20T15:05:13.679Z.

## Three verdicts

| Question | Verdict | Follows from |
| --- | --- | --- |
| consensusCore | `viable` | 69 driven scenarios |
| wasmBoundary | `viable-with-named-gaps` | 51 driven scenarios |
| lagrangeMigration | `undetermined-needs-integration-stage` | 4 driven scenarios |

### consensusCore: `viable`

replicated membership, learner and promotion behaviour, replacement behaviour, pending-change semantics, restart correctness at nine boundaries for both victim roles and both batch shapes, and configuration convergence independent of service caches, with every host-order mutant killed. Peer identity is NOT an input here: the core enforces nothing about ids.

Scenarios: `three-voter-group`, `sequential-replacement`, `sequential-replacement-peer-failure`, `joint-replacement-explicit`, `joint-replacement-auto`, `joint-replacement-peer-failure-incoming`, `joint-replacement-peer-failure-outgoing`, `conf-state-convergence`, `disagreeing-caches`, `pending-conf-change`, `ready-persistence-ordering`, `reapplication-idempotence`, `joint-reapplication`, `joint-quorum-requirement`, `sequential-failure-matrix`, `host-order-mutants`, `lost-proposal`, `durable-record-corruptions`, `lost-proposal-one-follower`, `promotion-gating`, `apply-refusal-regression`, `determinism-proof`, `runtime-trap-recovery`, `ingress-validation`, `restart-proposed-not-persisted-follower-mixed`, `restart-proposed-not-persisted-follower-conf-entry-alone`, `restart-proposed-not-persisted-leader-mixed`, `restart-proposed-not-persisted-leader-conf-entry-alone`, `restart-persisted-not-committed-follower-mixed`, `restart-persisted-not-committed-follower-conf-entry-alone`, `restart-persisted-not-committed-leader-mixed`, `restart-persisted-not-committed-leader-conf-entry-alone`, `restart-committed-not-applied-follower-mixed`, `restart-committed-not-applied-follower-conf-entry-alone`, `restart-committed-not-applied-leader-mixed`, `restart-committed-not-applied-leader-conf-entry-alone`, `restart-conf-applied-conf-state-not-recorded-follower-mixed`, `restart-conf-applied-conf-state-not-recorded-follower-conf-entry-alone`, `restart-conf-applied-conf-state-not-recorded-leader-mixed`, `restart-conf-applied-conf-state-not-recorded-leader-conf-entry-alone`, `restart-conf-state-recorded-not-advanced-follower-mixed`, `restart-conf-state-recorded-not-advanced-follower-conf-entry-alone`, `restart-conf-state-recorded-not-advanced-leader-mixed`, `restart-conf-state-recorded-not-advanced-leader-conf-entry-alone`, `restart-ready-advanced-follower-mixed`, `restart-ready-advanced-follower-conf-entry-alone`, `restart-ready-advanced-leader-mixed`, `restart-ready-advanced-leader-conf-entry-alone`, `restart-joint-entered-follower-mixed`, `restart-joint-entered-follower-conf-entry-alone`, `restart-joint-entered-leader-mixed`, `restart-joint-entered-leader-conf-entry-alone`, `restart-joint-committed-follower-mixed`, `restart-joint-committed-follower-conf-entry-alone`, `restart-joint-committed-leader-mixed`, `restart-joint-committed-leader-conf-entry-alone`, `restart-joint-left-follower-mixed`, `restart-joint-left-follower-conf-entry-alone`, `restart-joint-left-leader-mixed`, `restart-joint-left-leader-conf-entry-alone`, `restart-joint-leave-entry-durable-not-applied-follower-mixed`, `restart-joint-leave-entry-durable-not-applied-follower-conf-entry-alone`, `restart-joint-leave-entry-durable-not-applied-leader-mixed`, `restart-joint-leave-entry-durable-not-applied-leader-conf-entry-alone`, `restart-lightready-phase-apply-leader-mixed-single-voter`, `restart-lightready-phase-apply-leader-conf-entry-alone-single-voter`, `restart-joint-entered-follower-mixed-retained-follower`, `restart-joint-committed-follower-mixed-retained-follower`, `restart-joint-left-follower-mixed-retained-follower`.

### wasmBoundary: `viable-with-named-gaps`

the full RawNode lifecycle is exposed, persistence and restore are correct, a joint ConfState restores, u64 identity is exact, many handles share one runtime, and no consensus decision is made in JavaScript

Scenarios: `restart-proposed-not-persisted-follower-mixed`, `restart-proposed-not-persisted-follower-conf-entry-alone`, `restart-proposed-not-persisted-leader-mixed`, `restart-proposed-not-persisted-leader-conf-entry-alone`, `restart-persisted-not-committed-follower-mixed`, `restart-persisted-not-committed-follower-conf-entry-alone`, `restart-persisted-not-committed-leader-mixed`, `restart-persisted-not-committed-leader-conf-entry-alone`, `restart-committed-not-applied-follower-mixed`, `restart-committed-not-applied-follower-conf-entry-alone`, `restart-committed-not-applied-leader-mixed`, `restart-committed-not-applied-leader-conf-entry-alone`, `restart-conf-applied-conf-state-not-recorded-follower-mixed`, `restart-conf-applied-conf-state-not-recorded-follower-conf-entry-alone`, `restart-conf-applied-conf-state-not-recorded-leader-mixed`, `restart-conf-applied-conf-state-not-recorded-leader-conf-entry-alone`, `restart-conf-state-recorded-not-advanced-follower-mixed`, `restart-conf-state-recorded-not-advanced-follower-conf-entry-alone`, `restart-conf-state-recorded-not-advanced-leader-mixed`, `restart-conf-state-recorded-not-advanced-leader-conf-entry-alone`, `restart-ready-advanced-follower-mixed`, `restart-ready-advanced-follower-conf-entry-alone`, `restart-ready-advanced-leader-mixed`, `restart-ready-advanced-leader-conf-entry-alone`, `restart-joint-entered-follower-mixed`, `restart-joint-entered-follower-conf-entry-alone`, `restart-joint-entered-leader-mixed`, `restart-joint-entered-leader-conf-entry-alone`, `restart-joint-committed-follower-mixed`, `restart-joint-committed-follower-conf-entry-alone`, `restart-joint-committed-leader-mixed`, `restart-joint-committed-leader-conf-entry-alone`, `restart-joint-left-follower-mixed`, `restart-joint-left-follower-conf-entry-alone`, `restart-joint-left-leader-mixed`, `restart-joint-left-leader-conf-entry-alone`, `restart-joint-leave-entry-durable-not-applied-follower-mixed`, `restart-joint-leave-entry-durable-not-applied-follower-conf-entry-alone`, `restart-joint-leave-entry-durable-not-applied-leader-mixed`, `restart-joint-leave-entry-durable-not-applied-leader-conf-entry-alone`, `restart-lightready-phase-apply-leader-mixed-single-voter`, `restart-lightready-phase-apply-leader-conf-entry-alone-single-voter`, `restart-joint-entered-follower-mixed-retained-follower`, `restart-joint-committed-follower-mixed-retained-follower`, `restart-joint-left-follower-mixed-retained-follower`, `peer-identity`, `multi-raft-cost`, `panic-isolation`, `ready-persistence-ordering`, `host-order-mutants`, `host-consensus-surface`.

### lagrangeMigration: `undetermined-needs-integration-stage`

this quest measures the contract, the persistence model fit, the id mapping and the hosting cost. None of that is sufficient: no backend is integrated and the formation case is not run. Part A's defects are reasons to replace the current backend, not evidence that an integration will succeed, and are not inputs here.

Scenarios: `minimum-backend-contract-census`, `peer-identity`, `multi-raft-cost`, `host-consensus-surface`.

## The current backend

One partition, two caches: node A reported [node-replica-a/partition/replica-a, node-replica-b/partition/replica-b, node-replica-c/partition/replica-c] with majority 2; node B reported [node-replica-a/partition/replica-a, node-replica-b/partition/replica-b, node-replica-d/partition/replica-d] with majority 2. Protocol messages emitted: 0.

### An independent safety defect: term and vote

a restarted replica returns at term 0 with no record of the vote it granted, so it may vote again in a term it has already voted in. This is a durability defect of the current backend on its own, separate from the membership finding.

## Scenarios

| Scenario | Driven |
| --- | --- |
| `liferaft-two-caches-two-configurations` | yes |
| `liferaft-configuration-locality` | yes |
| `liferaft-term-and-vote-across-restart` | yes |
| `three-voter-group` | yes |
| `sequential-replacement` | yes |
| `sequential-replacement-peer-failure` | yes |
| `joint-replacement-explicit` | yes |
| `joint-replacement-auto` | yes |
| `joint-replacement-peer-failure-incoming` | yes |
| `joint-replacement-peer-failure-outgoing` | yes |
| `conf-state-convergence` | yes |
| `disagreeing-caches` | yes |
| `pending-conf-change` | yes |
| `ready-persistence-ordering` | yes |
| `reapplication-idempotence` | yes |
| `joint-reapplication` | yes |
| `joint-quorum-requirement` | yes |
| `sequential-failure-matrix` | yes |
| `host-order-mutants` | yes |
| `lost-proposal` | yes |
| `durable-record-corruptions` | yes |
| `lost-proposal-one-follower` | yes |
| `promotion-gating` | yes |
| `apply-refusal-regression` | yes |
| `determinism-proof` | yes |
| `runtime-trap-recovery` | yes |
| `ingress-validation` | yes |
| `restart-proposed-not-persisted-follower-mixed` | yes |
| `restart-proposed-not-persisted-follower-conf-entry-alone` | yes |
| `restart-proposed-not-persisted-leader-mixed` | yes |
| `restart-proposed-not-persisted-leader-conf-entry-alone` | yes |
| `restart-persisted-not-committed-follower-mixed` | yes |
| `restart-persisted-not-committed-follower-conf-entry-alone` | yes |
| `restart-persisted-not-committed-leader-mixed` | yes |
| `restart-persisted-not-committed-leader-conf-entry-alone` | yes |
| `restart-committed-not-applied-follower-mixed` | yes |
| `restart-committed-not-applied-follower-conf-entry-alone` | yes |
| `restart-committed-not-applied-leader-mixed` | yes |
| `restart-committed-not-applied-leader-conf-entry-alone` | yes |
| `restart-conf-applied-conf-state-not-recorded-follower-mixed` | yes |
| `restart-conf-applied-conf-state-not-recorded-follower-conf-entry-alone` | yes |
| `restart-conf-applied-conf-state-not-recorded-leader-mixed` | yes |
| `restart-conf-applied-conf-state-not-recorded-leader-conf-entry-alone` | yes |
| `restart-conf-state-recorded-not-advanced-follower-mixed` | yes |
| `restart-conf-state-recorded-not-advanced-follower-conf-entry-alone` | yes |
| `restart-conf-state-recorded-not-advanced-leader-mixed` | yes |
| `restart-conf-state-recorded-not-advanced-leader-conf-entry-alone` | yes |
| `restart-ready-advanced-follower-mixed` | yes |
| `restart-ready-advanced-follower-conf-entry-alone` | yes |
| `restart-ready-advanced-leader-mixed` | yes |
| `restart-ready-advanced-leader-conf-entry-alone` | yes |
| `restart-joint-entered-follower-mixed` | yes |
| `restart-joint-entered-follower-conf-entry-alone` | yes |
| `restart-joint-entered-leader-mixed` | yes |
| `restart-joint-entered-leader-conf-entry-alone` | yes |
| `restart-joint-committed-follower-mixed` | yes |
| `restart-joint-committed-follower-conf-entry-alone` | yes |
| `restart-joint-committed-leader-mixed` | yes |
| `restart-joint-committed-leader-conf-entry-alone` | yes |
| `restart-joint-left-follower-mixed` | yes |
| `restart-joint-left-follower-conf-entry-alone` | yes |
| `restart-joint-left-leader-mixed` | yes |
| `restart-joint-left-leader-conf-entry-alone` | yes |
| `restart-joint-leave-entry-durable-not-applied-follower-mixed` | yes |
| `restart-joint-leave-entry-durable-not-applied-follower-conf-entry-alone` | yes |
| `restart-joint-leave-entry-durable-not-applied-leader-mixed` | yes |
| `restart-joint-leave-entry-durable-not-applied-leader-conf-entry-alone` | yes |
| `restart-lightready-phase-apply-leader-mixed-single-voter` | yes |
| `restart-lightready-phase-apply-leader-conf-entry-alone-single-voter` | yes |
| `restart-joint-entered-follower-mixed-retained-follower` | yes |
| `restart-joint-committed-follower-mixed-retained-follower` | yes |
| `restart-joint-left-follower-mixed-retained-follower` | yes |
| `auto-leave-entry-self-appended-before-any-tick` | yes |
| `trigger-shifts` | yes |
| `peer-identity` | yes |
| `multi-raft-cost` | yes |
| `panic-isolation` | yes |
| `minimum-backend-contract-census` | yes |
| `step-rejection-census` | yes |
| `host-ambient-input-census` | yes |
| `host-consensus-surface` | yes |
| `membership-provenance-audit` | yes |

## What a Lagrange raft-rs backend must do

Each obligation states what must be done, the measurement or verifier observation behind it, and where it is attributable.

### Inbound message safety

- **obligation**: validate the ENVELOPE of every message before `step`: the group id, that the message is addressed to this peer, that the sender is in this peer's own ConfState read from the core, that the type is known and not local-only, and that a heartbeat's commit is not beyond this peer's durable last index. Do NOT duplicate Raft protocol validation.
- measured: verification round 2 found several message shapes reaching a raft-rs fatal through `step`, from the leader, from a non-leader, from an unknown peer and with `to != self`. The ingress-validation scenario runs them with and without the validator and records which become clean refusals and which still reach a fatal.
- attribution: **hosting-model**

### Runtime trap recovery

- **obligation**: treat a trap or fatal as a RUNTIME-HEALTH event with bounded recovery: stop using the affected runtime, instantiate a fresh WASM module and restore the groups from their durable records. Multi-Raft in one WASM instance is viable only on that basis.
- measured: the handle-table poisoning is fixed and one fatal no longer immediately poisons other handles, but aborts are a finite per-instance budget - the runtime-trap-recovery scenario measures how many, and what a fresh instance plus restore costs at 100 and 1,000 groups. PRELIMINARY figures.
- attribution: **wasm-binding**

### Membership and elections

- **obligation**: never call `campaign()` on a learner, on a removed peer, or on any peer absent from its own committed ConfState.
- measured: round 2: only a host `campaign()` reaches the panic at raft-0.7.0/src/raft.rs:1225 - ticks do not, because raft.rs:1083 requires `promotable`. The MECHANISM this evaluation previously stated (a quorum over an empty voter set) is WRONG and withdrawn: what was measured is that the real voters granted their votes to the removed peer, the live leader was deposed, and the removed peer then panicked on the winning vote response. Separately, a host `campaign()` on a LEARNER does not panic - the learner BECOMES LEADER and commits.
- attribution: **host-obligation**

### pre_vote and check_quorum

- **obligation**: decide both explicitly at the integration stage.
- measured: NOT EVALUATED HERE. Neither is configured or exercised anywhere in this evaluation. Round 2 measured the consequence of leaving them off: a removed peer that kept ticking campaigned repeatedly, reached term 28, and deposed the live leader on reconnect, with real voters granting it their votes. Do not assume the defaults suit.
- attribution: **raft-rs**

### Promotion policy

- **obligation**: gate promotion on the core's own progress. raft-rs permits promoting a learner that has not caught up; catch-up is a Lagrange control-plane responsibility.
- measured: the promotion-gating scenario promotes a learner that never received anything, and shows the same position refused by a policy reading the leader's progress for that learner.
- attribution: **host-obligation**

### Peer-id reuse

- **obligation**: own peer identity entirely, and make the retired set DURABLE: raft-rs checks nothing about ids.
- measured: the core re-added a removed id and caught an amnesiac replica up under it. The peer-identity scenario's registry refuses a retired id, and the refusal survives a restart of the mapping owner rebuilt from its durable rows alone.
- attribution: **host-obligation**

### Snapshot and configuration atomicity

- **obligation**: a snapshot must advance the durable applied index and the ConfState together. The binding exports no snapshot or compaction primitive, which is an integration gap, and this evaluation therefore does NOT claim the full RawNode lifecycle - the verdict input is named `readyLifecycleExposed` for what was driven.
- measured: round 2 (snap.mjs) hand-built a MsgSnapshot to a learner: the host loop stored a snapshot at index 5 and left the durable applied index at "0"; only raft-rs's tolerance saved the restart. No snapshot produced by a real leader could be tested, because the binding cannot produce one.
- attribution: **wasm-binding**

### Joint consensus

- **obligation**: persist enough application progress that an applied ConfChange is never replayed. Re-applying an enter-joint or leave entry is REFUSED by the core, not idempotent.
- measured: round 2 saw "config is already joint" (x5) and "can't leave a non-joint config" (x2) when the applied index was rewound at the joint boundaries. The narrowed re-application sentence covers only the idempotent SIMPLE change measured here. raft-rs carries a TODO at src/raft.rs:962 - "it may never auto_leave if leader steps down before enter joint is applied" - which is upstream behaviour requiring integration testing, not a reason to reject the core.
- attribution: **raft-rs**

#### Runtime trap recovery, measured (PRELIMINARY)

Fatals before the runtime died: **303** (measured, not a constant), then every call trapped "memory access out of bounds".

| Groups restored into a fresh instance | Time (ms) | Memory (bytes) | Damaged group |
| --- | --- | --- | --- |
| 99 of 100 | 1.5 | 262144 | reported: `unreachable` |
| 999 of 1000 | 7.8 | 3145728 | reported: `unreachable` |

Withdrawn: "the blast radius is exactly the group that caused the fatal"; "found-and-fixed-in-this-fork" for the fatal hazard as a whole; "one runtime holding many RawNodes STANDS" without qualification.

> Multi-Raft in one WASM instance is viable only if a trap/fatal is treated as a runtime-health event with bounded recovery, and the host validates inbound messages before `step`.

#### Ingress validation, measured

| Message shape | Host envelope validator | Reaching the core |
| --- | --- | --- |
| heartbeat commit beyond last index, from the leader | refused: a heartbeat commit beyond this peer's durable last index | FATAL |
| heartbeat commit beyond last index, from a non-leader | refused: a heartbeat commit beyond this peer's durable last index | FATAL |
| heartbeat commit beyond last index, from an unknown peer | refused: the sender is not a member of this peer's own ConfState | FATAL |
| heartbeat addressed to another peer (misrouted) | refused: the message is not addressed to this peer | FATAL |
| MsgReadIndex with empty entries to the leader | passed | FATAL |
| append with non-contiguous entries | passed | accepted |
| appendResponse claiming an index beyond the leader's last | passed | accepted |
| unknown message type 99 | refused: unknown message type | refused by the core: undefined |
| a local-only MsgHup arriving as if from the network | refused: a local-only message type may not arrive from the network | refused by the core: undefined |

Honest traffic is unaffected: 0 refusals in a full configuration-change scenario run with the validator enabled. Residue that still reaches a fatal: MsgReadIndex with empty entries to the leader.

## The minimum backend contract, in four categories

| Category | Names | Counts toward the deletion forecast |
| --- | --- | --- |
| MUST SERVE | 11 | no |
| MEMBERSHIP-LOCAL DELETE CANDIDATE | 4 | yes |
| DIFFERENT IMPLEMENTATION | 35 | no |
| PRODUCTION GAP | 14 | no |

Only the membership-local category feeds the forecast: `join`, `joinPeer`, `leave`, `nodes`.

Production gaps - what a raft-rs backend requires and Lagrange has no call site for:

- `readyPersistenceProtocol` - no call site performs the raft-rs Ready persistence protocol at all: there is no persist-then-advance discipline to inherit
- `confStatePersistence` - nothing persists a configuration state, so there is nothing for a restart to restore membership from
- `membershipGeneration` - no generation fences an operation planned against one membership from executing against a later one
- `stablePeerIdOwnership` - no owner assigns, retires or refuses reuse of a stable peer id; today a peer is an address
- `proposeConfChange` - no call site proposes a configuration change, so membership can never become a committed fact
- `applyConfChange` - nothing applies a committed configuration entry, so the configuration the consensus layer holds never moves
- `confState` - nothing observes a configuration state, so there is nothing for service rows to be a projection of
- `pendingConfIndex` - nothing reads whether a configuration change is already pending, which is the one-operation invariant the direction converged on
- `persistTerm` - defined on PartitionRaftStorage and called from nowhere: term is lost across a restart
- `persistVotedFor` - defined on PartitionRaftStorage and called from nowhere: the vote is never recorded at all
- `appliedIndex` - no applied index is handed back to the consensus layer on restart, so it cannot know what has already been applied
- `readIndex` - no linearizable read barrier is requested from the consensus layer
- `change` - liferaft's change() forces the node into the LEADER state (partition-service-raft-init-base.js:605). raft-rs has no equivalent: leadership is won, never assigned. Moved here from DIFFERENT IMPLEMENTATION after verification round 2.
- `forcedLeadership` - partition-service-raft-init-base.js:605 forces the node into the LEADER state through liferaft's change(). raft-rs has no equivalent: leadership is won, never assigned. Any production path that depends on it has to be re-expressed.

## Boundary distinctness, all three figures

three figures. distinctByHostState includes in-memory facts and is the weakest claim. distinctByFiveFieldDurableState uses exactly the five fields the rule names. distinctByFullDurableState adds what the durable log actually holds, which is durable too. The exemption is judged on the last of these.

| Drive | Boundaries | Distinct by host state | Distinct by the five durable fields | Distinct by full durable state |
| --- | --- | --- | --- | --- |
| `follower/mixed/departing-follower/three-voters-one-learner` | 10 | 10 | 8 | 9 |
| `follower/conf-entry-alone/departing-follower/three-voters-one-learner` | 10 | 10 | 7 | 8 |
| `leader/mixed/departing-follower/three-voters-one-learner` | 10 | 10 | 8 | 9 |
| `leader/conf-entry-alone/departing-follower/three-voters-one-learner` | 10 | 10 | 7 | 8 |
| `leader/mixed/departing-follower/single-voter` | 1 | 1 | 1 | 1 |
| `leader/conf-entry-alone/departing-follower/single-voter` | 1 | 1 | 1 | 1 |
| `follower/mixed/retained-follower/retained-follower` | 3 | 3 | 3 | 3 |

Two boundaries that serialize to the same durable state are the same thing as far as a restart can tell, so every collision is either an explicitly claimed exemption or the receipt is red.

- **[committed-not-applied, conf-applied-conf-state-not-recorded]** - the only thing separating these two is that apply_conf_change has run inside the core. raft-rs keeps the configuration in the host's Storage - the host stores the ConfState the call returns - so an apply that has not been recorded leaves no durable trace by construction, and a restart cannot possibly tell them apart. What the exemption has to buy is asserted rather than assumed: both restore to the same image AND both re-apply the configuration entry from their own durable log in the isolated window, reaching the new configuration with no message delivered.
  - examples/five_mem_node/main.rs:292-293 (the ConfState returned by apply_conf_change is what the host stores; raft-rs stores nothing)
  - src/storage.rs:106-112 (Storage::initial_state returns only the HardState and ConfState the host persisted)
  - src/raw_node.rs:302-311 (a restart resumes from Config.applied, so a committed entry above it is re-delivered and re-applied)
  - proved not vacuous by: recoveredFromOwnLogAlone is true for both members in every role and batch shape

Unexplained collisions: none. Every class restores identically: true.

boundaries these batch shapes cannot tell apart. With the configuration entry alone in its batch the applied index reaches the entry at both conf-state-recorded-not-advanced and ready-advanced, so they are one durable state; a mixed batch separates them (applied 3 against applied 4). This is the measured reason the matrix is driven in both shapes.

## The sequential replacement, on its own terms

This section reports what the sequential style costs and what semantics it provides. It makes NO recommendation: which style Lagrange uses is the integration stage's decision, not this quest's.

- entries: 3 committed configuration changes, one per step (add learner, promote, remove the old voter).
- catch-up criterion: read from the leader's OWN progress for the learner (matched 2 against the leader's committed index 2), never from a tick count.
- the core does NOT gate promotion on catch-up: a learner that never caught up was promoted to voter when the policy did not stop it. Gating is a Lagrange policy.
- learner death and old-voter death at each phase:
  - `learner-dies-before-catch-up`: every surviving peer agreed (true); the voter set the core used at each phase was 3, 4, 3.
  - `old-voter-dies-after-add-learner`: every surviving peer agreed (true); the voter set the core used at each phase was 3, 4, 3.
  - `old-voter-dies-after-promote`: every surviving peer agreed (true); the voter set the core used at each phase was 3, 4, 3.
  - `old-voter-dies-after-remove`: every surviving peer agreed (true); the voter set the core used at each phase was 3, 4, 3.
- restart: every boundary in the matrix is driven for a simple change as well as a joint one.

## The joint replacement, on its own terms

Again: reported, not recommended.

- entries: 2 with an explicit transition, 1 with the automatic one - the automatic transition costs the host fewer proposed changes because the core appends the leave entry itself.
- joint-enter configuration: the core reports both halves - incoming [1, 3, 4] and outgoing [1, 2, 3].
- joint quorum: a commit while joint needs a majority of BOTH configurations (measured: true). With only the outgoing-only voter down the group still committed; with a voter present in both also down it did not.
- automatic against manual leave: the automatic transition left without a proposal (true) but needed a tick first (true); the explicit transition did not leave by itself and the host proposed the empty change.
- peer failure while joint: driven for an incoming voter and for an outgoing one, and the group committed with each down.
- restart: the joint boundaries are driven with the departing follower AND with a follower the group keeps.

## Multi-Raft cost: PRELIMINARY

PRELIMINARY. These numbers are idle RawNodes in one process with no message traffic, no SQLite persistence, no snapshots and no application entry delivery. They do NOT extrapolate to a thousand real partition groups under load; the integration stage measures that. The question answered here is only whether the RawNode/WASM hosting model itself creates an obvious blocker.

Hosting shape: one WASM runtime holding many RawNode handles. One runtime shared by every handle: true. One-time runtime cost is reported apart from the per-RawNode cost.

**No cost figure feeds any verdict input.** The hosting input is a set of booleans, so a thousandfold regression in any number below could not change a verdict. They are reported to answer the owner's question about the hosting model, not to gate one.

| Groups | Incremental bytes (upper bound) | Bytes per group | Idle tick ns | has_ready scan ns | Ready cycle ns |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 1290 | 2966 | 475 |
| 100 | 0 | 0 | 306 | 207 | 794 |
| 1000 | 2949120 | 2949 | 224 | 200 | 758 |

## Re-application, precisely

> For the specific idempotent configuration-change case measured here, re-applying that change produced the same ConfState.

That sentence is the whole finding. It does NOT extend to:

- state-machine command re-application
- snapshot restore
- log compaction
- which committed entries still need host application after a restart
- exactly-once side effects above Raft

the enter-joint entry re-applied to a peer already in the joint configuration is recorded separately; see the joint-reapplication scenario for what the core returned

## The host contract

Derived from raft 0.7.0 (checksum f12688b23a649902762d4c11d854d73c49c9b93138f2de16403ef9f571ad5bae). every step and obligation cites the raft-rs source it was read from; nothing here is copied from an instruction.

### Where raft-rs contradicts itself

- src/lib.rs numbers the steps with committed entries (3, :256) before the HardState (5, :337), and examples/five_mem_node/main.rs:287-327 follows that order. The note at src/lib.rs:304-310 says that order is unsafe for the commit index and instructs the opposite.
- the safety note wins; this evaluation persists the hard state before applying, and keeps the example's order as a host mutant that the core refuses.
- round 1 of this evaluation derived the loop from the example and recorded the resulting hazard as "not a gap". That was wrong: the note names it. Withdrawn.

### What raft-rs guarantees

- a configuration change takes effect only when its entry is committed and applied through apply_conf_change, and the ConfState it returns is the configuration — `examples/five_mem_node/main.rs:288-293`
- at most one configuration change may be pending; a second one proposed while the first is unapplied is neutralised into an empty normal entry rather than rejected — `src/raft.rs:206-216 (pending_conf_index)`
- a joint configuration is restored from a ConfState alone, including its outgoing set and its auto-leave flag — `src/confchange/restore.rs:103`
- advance_append commits the persistence of the Ready and returns the LightReady; advance_apply moves the applied index to what has been collected — `src/raw_node.rs:654-705`
- with an automatic transition the core itself appends the entry that leaves the joint configuration once the enter entry is applied on the leader — `src/raft.rs:961-982 (commit_apply)`
- the applied index a node starts from is Config.applied, and committed entries above it are re-delivered — `src/raw_node.rs:302-311 (commit_since_index: config.applied)`

### What the host must guarantee

- the commit index is persisted WITH OR BEFORE the committed entries are applied. raft-rs states this by name and says why: "it doesn't guarentee commit index is persisted before being applied ... apply index can be larger than commit index and cause panic. To solve the problem, persisting commit index with or before applying entries." The doc's own numbered steps put the committed entries (step 3) before the HardState (step 5); where the steps and this note differ, the note wins. Its alternative - clamping the commit index to max(commit, applied) on restart - the doc itself calls out as silently losing log. — `src/lib.rs:304-310 (the note); src/lib.rs:256, :312, :337 (the numbered steps it overrides)`
  - measured: with one normal entry before the configuration entry and one after, applying before persisting leaves durable applied 3 and durable commit 1, and the restart aborts: "applied(3) is out of range [prev_applied(0), min(committed(1), persisted(4))]" (raft-0.7.0/src/raft_log.rs:314). Kept as the apply-before-persisting-commit host mutant.
- the ConfState returned by apply_conf_change and the applied index are ONE durable write. A record whose configuration is ahead of its applied index describes a state no crash can produce, and a restart from it re-delivers a configuration entry the record already claims to have applied. — `examples/five_mem_node/main.rs:292-293 with src/raw_node.rs:302-311`
  - measured: the confstate-and-applied-written-separately host mutant fails restart equivalence
- an apply_conf_change refusal is never swallowed. The core refuses a configuration change it cannot apply ("config is already joint", "can't leave a non-joint config"); a host that advances past it has silently diverged from the core. — `src/raw_node.rs:397-401 (apply_conf_change returns Result)`
- nothing is advanced before what it accounts for is durable: the entries and hard state of a Ready are stored before advance_append — `examples/five_mem_node/main.rs:316-335`
- the ConfState returned by apply_conf_change is stored durably; raft-rs stores it only in the host's Storage — `examples/five_mem_node/main.rs:292-293`
- the applied index is durable and is handed back as Config.applied on restart, and it never moves past an entry whose effect is not durable — `src/raw_node.rs:302-311`
- the commit index from the LightReady is stored; raft-rs returns it and writes nothing — `examples/five_mem_node/main.rs:337-339`
- a tick source exists: the core surfaces nothing for an entry it appended itself (the joint auto-leave) until a tick drives the next Ready — `src/raft.rs:961-982`
- peer identity is the host's: raft-rs takes a u64 and never assigns, recycles or validates one — `src/config.rs (Config.id)`

### The core does not do this for you

- **propose_conf_change returning ok means the change will happen** — it means the proposal was accepted for appending. A second change proposed while one is pending also returns ok and is neutralised into an empty normal entry that never takes effect.
  - measured: pending-conf-change: both proposals returned ok, the committed entry types were [2, 0], and the second change never took effect
  - source: `src/raft.rs:206-216 (pending_conf_index)`
- **pendingConfIndex tells you whether a change is in progress** — it does NOT clear when the change is applied. The signal is pendingConfIndex > applied, not pendingConfIndex != 0.
  - measured: pending-conf-change: pendingConfIndexAfter stayed at the entry index after the change was applied
  - source: `src/raft.rs:206-216`
- **the core will not promote a learner that has not caught up** — it promotes whatever the change names. Catch-up is a HOST policy and must be read from the core's own progress.
  - measured: promotion-gating: a learner that never received anything (matched behind the leader's commit) was promoted to voter; the same position with the policy reading progress refused
  - source: `src/confchange/changer.rs (apply_conf_change applies the requested change)`
- **the core notices a peer id being reused** — it checks nothing. Identity is wholly a host obligation, and the retired set must be DURABLE or a restarted owner will hand a dead replica's id to a live one.
  - measured: peer-identity: the mapping double refuses a retired id, and the refusal survives a restart of the mapping owner rebuilt from its durable rows alone
  - source: `src/config.rs (Config.id is a u64 the host chooses)`
- **asking any node to campaign is safe** — a node the configuration no longer holds PANICS if it wins: a quorum over an empty voter set is trivially satisfied and become_leader then unwraps its own missing progress. The host must never campaign a peer that its own ConfState does not contain.
  - measured: driving the retained-follower joint-left row without that guard trapped with "called `Option::unwrap()` on a `None` value" at raft-0.7.0/src/raft.rs:1225
  - source: `src/raft.rs:1225 (become_leader, self.mut_prs().get_mut(id).unwrap())`
- **a message-driven pump is enough** — with the automatic transition the core appends the entry that leaves the joint configuration ITSELF and surfaces nothing for it until a tick. Without a tick source the group stays joint forever.
  - measured: auto-leave-entry-self-appended-before-any-tick: has_ready was false on every peer, the leader held the entry and no follower did, and it committed only after the leader was ticked
  - source: `src/raft.rs:961-982 (commit_apply)`
- **a proposal whose leader died before persisting it is lost** — if one follower held it, it can still commit.
  - measured: lost-proposal-one-follower: driven, observed, and the only assertion is the safety property
  - source: `the Raft paper's leader-completeness property`
- **the core protects you from a corrupted durable record** — the record IS the configuration. A consistently rewritten ConfState at a boundary where the change is not yet applied cannot be contradicted by anything the core holds.
  - measured: durable-record-corruptions: add-a-voter, drop-a-voter and learner-into-voter are caught at every boundary except joint-entered, where they are undetectable from durable state alone
  - source: `src/storage.rs:106-112 (initial_state returns what the host persisted)`
- **elections can be made reproducible** — raft-rs 0.7 draws the randomized election timeout from its own RNG and Config exposes no seed. Every election in this evaluation is forced with campaign() instead.
  - measured: determinism-proof: with only the leader ticked and every election forced, 200 runs of each scenario produce identical records
  - source: `src/config.rs (no seed field)`

## Named gaps

Every gap carries its attribution: `raft-rs` is the core, `wasm-binding` is the fork, `hosting-model` is the shape a host runs them in, and `host-obligation` is something the host must do that the core will not do for it.

### `auto-leave-needs-a-tick`

- attribution: **raft-rs**
- measured: with the automatic transition the core appends the empty leave entry itself inside commit_apply (src/raft.rs:961-982), but has_ready stays false for that self-appended entry until a tick drives the next Ready: the leader held lastIndex one ahead of its followers until a heartbeat tick, then the leave committed and applied everywhere
- bearing: a periodic tick is required anyway for heartbeats and elections, so a Multi-Raft host must have one; the finding is that a purely message-driven pump is not sufficient, not that a tick is an extra cost

### `commit-index-must-be-persisted-with-or-before-applying`

- attribution: **host-obligation**
- measured: driven as the apply-before-persisting-commit host mutant: refused; unreachable :: panicked at /home/peter/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/raft-0.7.0/src/raft_log.rs:314:13: applied(3) is out of range [prev_applied(0), min(committed(1), persisted(4))], raft_id: 2
- citation: src/lib.rs:304-310 - "it doesn't guarentee commit index is persisted before being applied ... apply index can be larger than commit index and cause panic. To solve the problem, persisting commit index with or before applying entries."

### `runtime-recovery-after-a-fatal-or-trap`

- attribution: **wasm-binding** · status: `open`
- measured: the handle-table poisoning IS fixed: `with_node` takes the node out of the table for the call, so one fatal no longer immediately poisons other handles, and a bystander group ran a full scenario afterwards. But aborts are a FINITE per-instance budget: after 303 fatals in this run every call on every group in the runtime trapped "memory access out of bounds", with 1638400 bytes of linear-memory growth. The count is measured, not a constant. Fatals are also REMOTELY TRIGGERABLE through `step`.
- host obligation: Multi-Raft in one WASM instance is viable only if a trap/fatal is treated as a runtime-health event with bounded recovery, and the host validates inbound messages before `step`.

### `corrupt-conf-change-data-decoded-as-leave-joint`

- attribution: **wasm-binding** · status: `found-and-fixed-in-this-fork`
- measured: upstream decode_conf_change_entry used unwrap_or_default() on the base64, so undecodable bytes became an EMPTY change list - which is a valid request to leave a joint configuration. It now returns an error: "conf change entry data is not valid base64".

### `pending-conf-index-crossed-as-a-javascript-number`

- attribution: **wasm-binding** · status: `found-and-fixed-in-this-fork`
- measured: it was the one u64 crossing as a JS number; it now crosses as a decimal string like every other. Separately: pendingConfIndex does NOT clear after a change is applied, so it is not a change-in-progress signal on its own - the signal is pendingConfIndex > applied.

### `snapshot-and-compaction-surface-is-incomplete`

- attribution: **wasm-binding** · status: `open`
- measured: the binding exports no snapshot or compaction primitive, and the host loop leaves the durable applied index behind after storing a snapshot (round 2, snap.mjs: a snapshot at index 5 left appliedIndex "0"; only raft-rs's tolerance saved the restart). A snapshot must move the durable applied index and the ConfState atomically. The RawNode lifecycle this evaluation exercises is therefore NOT the full one: see the verdict input `readyLifecycleExposed`, which is named for what was actually driven.
- host obligation: a production backend needs snapshot and compaction primitives from the binding, and must advance applied state and ConfState together when it installs one

### `remotely-triggerable-fatals-need-host-side-ingress-validation`

- attribution: **hosting-model** · status: `open`
- measured: several message shapes reach a raft-rs fatal through `step`. A host-side ENVELOPE validator (group, recipient, sender in this peer's own ConfState, known and non-local type, heartbeat commit not beyond this peer's durable last index) refuses most of them and rejects nothing in honest traffic; the residue is recorded in the ingress-validation scenario.
- host obligation: validate the envelope before `step`; one misrouted heartbeat between groups in a Multi-Raft host is a fatal

### `pre-vote-and-check-quorum-are-not-evaluated`

- attribution: **raft-rs** · status: `open`
- measured: neither pre_vote nor check_quorum is configured or exercised anywhere in this evaluation. Round 2 measured the consequence of leaving them off: a removed peer that keeps ticking campaigns repeatedly, real voters GRANT it their vote, and it deposed the live leader. NOT EVALUATED HERE; integration stage.
- host obligation: decide pre_vote/check_quorum explicitly, or stop removed replicas ticking; do not assume the defaults suit

### `election-rng-cannot-be-seeded-through-the-binding`

- attribution: **wasm-binding** · status: `open`
- measured: raft-rs 0.7 draws the randomized election timeout from its own RNG and Config exposes no seed, so an election driven by ticks is not reproducible. Every scenario here forces elections with campaign() instead, which is deterministic; a future deterministic simulator would need a seeding hook that does not exist.

### `campaigning-a-peer-outside-its-own-configuration-panics`

- attribution: **raft-rs** · status: `open`
- measured: driving the retained-follower joint-left row while asking every live peer to campaign trapped with "called `Option::unwrap()` on a `None` value" at raft-0.7.0/src/raft.rs:1225 (become_leader). A node the configuration no longer holds satisfies a quorum over an empty voter set trivially, wins, and then cannot find its own progress. The evaluation now reads each peer's own ConfState before campaigning it.
- host obligation: never campaign a peer that its own ConfState does not contain; a removed replica must be shut down, not re-elected

### `the-unstable-log-is-not-observable-through-the-binding`

- attribution: **wasm-binding** · status: `open`
- measured: export_persisted_state reads the module's MemStorage, so an entry the core has appended but not yet surfaced in a Ready is invisible to the host. The auto-leave boundary is therefore measured through what the durable record and has_ready show, not by reading the core's unstable buffer.
- bearing: a deterministic simulator or a debugging tool would want it; no measurement in this evaluation depends on it

### `a-corrupted-durable-record-is-not-always-detectable`

- attribution: **host-obligation** · status: `open`
- measured: each corruption is injected between the crash and the restart of an ordinary matrix row and judged by the RECEIPT'S OWN local checks. The exact rows each corruption is and is not caught at are in the durable-record-corruptions scenario's `notCaughtAt` and `undetectableFromDurableStateAloneAt` lists; this gap does not restate them, because round 2 found the restatement contradicting the table.
- host obligation: integrity protection of the durable Raft record (checksum or authenticated storage). raft-rs cannot do it: the record is the only thing it has.

### `wasm-memstorage-is-not-durable`

- attribution: **hosting-model**
- measured: the binding's MemStorage lives inside the WASM module and no export reads it back except the one this fork added; durability is entirely the host's, and every restart here was rebuilt from a host-side durable record
- bearing: a production backend must own a durable store; the module is process memory

## Deletion forecast (a forecast)

copied from the owner's decision and labelled a forecast: nothing here has been deleted or proved deletable

- local peer-set reconciliation as membership authority
- the compatibility overflow budget
- multiple voter censuses
- max(activeCount, activeVoterCount)
- an invented membership generation
- much of the authorization carrier
- chained-REPLACE admission arithmetic
- membership interpretations of SYNCING
- local join()/leave() reconciliation
- some formation-specific repair machinery

