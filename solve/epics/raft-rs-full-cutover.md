---
id: raft-rs-full-cutover
status: open
proof: certification
roadmapRow: null
graduatesTo: core-architecture-convergence
doneWhen:
  probe: oracle
  args:
    file: solve/oracle/raft-rs-full-cutover.json
quests: []
authorizes:
  - architecture
  - docs
  - examples
  - package.json
  - package-lock.json
  - scripts
  - src
  - test
  - .github
  - solve/oracle
---

# Raft-rs full cutover

## Owner decision

Lagrange is no longer pursuing a long-lived dual-backend architecture.

The target is one consensus implementation:

> **All active Lagrange consensus groups use the Rust `raft-rs` core through
> the WASM operation-port/runtime boundary. Liferaft is removed, not retained as
> a compatibility fallback.**

This supersedes the earlier experimental rule that Liferaft remain the default
and untouched. That rule was correct while the rs-raft boundary was under
evaluation. The operation-port/runtime/lifecycle work has since landed and the
remaining work is now a cutover-and-deletion program.

The purpose of this epic is not to make rs-raft "available". It is to make it
the only active consensus architecture and then delete the old one.

## Activation

The already-open `raft-rs-partition-transport-demux` work is a prerequisite.
It is not absorbed into this epic. The first source-changing Quest under this
epic starts only after that real semantic transport lands on shared `main`.

At the time this epic was authored, PR #52 is the transport predecessor.

## Final zero-Liferaft rule

The terminal tree must contain **zero active Liferaft references** across:

- `src/**`;
- `test/**`;
- `architecture/**`;
- `docs/**`;
- `examples/**`;
- `scripts/**`;
- `.github/**`;
- `package.json`;
- `package-lock.json`;
- active configuration and generated current-state documentation.

This means zero:

- `Liferaft`, `LifeRaft`, `liferaft`, or `LIFERAFT` vocabulary;
- `@markwylde/liferaft` dependency;
- Liferaft provider/backend selection;
- native-Liferaft packet vocabulary as a production protocol;
- Liferaft timer/event names in active owner contracts;
- message-group Liferaft execution;
- worker/replica helper Liferaft execution;
- test fixtures whose purpose is to preserve Liferaft behavior;
- active docs describing Liferaft as part of current architecture.

### Historical provenance exception

Sealed/append-only historical evidence under `solve/**` is not rewritten merely
to make a grep return zero. Those records document what actually happened and
are not an executable or current architecture surface.

A terminal ratchet MUST explicitly scope this exception to immutable historical
records. New solve records written after this decision use "legacy consensus
backend" or another historical description unless naming Liferaft is necessary
to identify an old artifact.

## No compatibility migration

This is a 0.x/alpha cutover.

Do **not** build an automatic Liferaft-log-to-rs-raft migration protocol.

A replica database containing meaningful legacy partition consensus state and
no valid rs-raft durable record fails closed with a typed outcome such as:

```
legacy_partition_consensus_state_detected
```

The operator action is recreate/reseed the replica under rs-raft.

There is never:

```
try rs-raft -> detect legacy bytes -> silently fall back to Liferaft
```

and there is never dual writes to both consensus formats.

The detector must be based on meaningful durable content, not mere table
existence: current partition initialization creates some historically named
SQLite tables even on paths that may not be using them as consensus authority.

## Existing rs-raft owners to preserve

Unless a falsifier proves otherwise, KEEP:

- the frozen semantic Raft operation port;
- `raft-rs-runtime-owner.js` as the binding/core-entry owner;
- `RaftRsReplicaLifecycleOwner` for local active/retired eligibility;
- peer-identity reservation administration;
- committed `ConfState` as current consensus-membership authority;
- the rs-raft durable store/application transaction owners;
- MessageRouter as local/remote addressing owner;
- Lagrange learner-promotion safety above the core;
- the existing operation-boundary structural audit and witnesses.

Do not resurrect a RawNode facade or create a second general Raft abstraction
to ease the deletion.

## Already-closed historical gaps

The following older findings are rechecked but are not presumed open:

- arbitrary JS proposals are now encoded at the operation port through
  `bytesOf(...)`;
- application transaction rollback is threaded into the runtime and invokes the
  partition rollback callback on application host failure;
- raw core/control reachability was replaced by the operation-only boundary;
- durable local retirement gates runtime execution.

A Quest may reopen one only with a current-source falsifier.

## Gaps that MUST be settled before deletion certification

### Election settings

Driven failure scenarios already derive:

```
pre_vote = true
check_quorum = true
```

while production constants remain false.

The cutover must turn on the measured settings and re-run the same disruption
matrix through the production operation-port/runtime path.

No setting is enabled merely because raft-rs documentation recommends it.

### Runtime failure isolation

The current runtime owner may host many groups in one WASM runtime. A fatal can
therefore affect unrelated groups.

Before final certification, prove one of:

1. failure is isolated per group; or
2. runtime sharding has an explicit bounded blast radius and deterministic
   reconstruction; or
3. the shared-runtime recovery contract is measured acceptable under a
   destructive multi-group campaign and independently approved.

Do not leave this as an undocumented implementation accident.

### Message groups

Message groups are a first-class consensus owner and must move to rs-raft.

The migration must decide and prove their durable-state model. An in-memory
term/vote reset after restart is not acceptable merely because the old
implementation already behaved that way.

Prefer using the same operation port and runtime owner as partitions, with a
message-group-specific application callback and explicitly owned local durable
storage.

Open obligation (owner decision 2026-10-04, identity-reuse safety fix): a
message-group replica is no longer moved to a joiner (MOVE_REPLICA re-opened a
committed raft identity on an empty log with no conf change: vote amnesia, a
trapped core, two leaders in one term). Every joiner hosts its own group and
mg-1 stays entirely on the seed. That is an availability regression accepted
ONLY as an interim state: mg-1 is not replicated off the seed, and its leader
runs the rebalancing scheduler, so seed loss leaves mg-1 without quorum. The
next quest inside this epic is a fresh-identity ADD and promotion path for
message groups (a new raft id as a learner, caught up, promoted through a
committed conf change), never a revival of an identity-keeping move. The seed
side's now-unreachable MOVE reservation/handoff machinery
(`src/bootstrap/owners/move-replica-*`, its bootstrap-api and register-service
handoff wiring) is deleted with that quest or before it.

Amendment 2026-10-04 (corrective attempt after verifier
identity-safety-review-1 rejected the identity-reuse safety fix; owner rulings
of 2026-10-04 relayed by the lead):

- mg-1 stays on the seed. Its committed state lives only on the seed's disk:
  losing that disk loses mg-1's committed state, and there is no recovery
  path. The seed's disk is a single point of durable loss for mg-1, and while
  it is down every control-plane function mg-1 owns stops cluster-wide. A
  replica held for reseed (`reseed-required`) has no recovery path either: no
  reseed procedure and no release exist. The fresh-replica-identity ADD and
  promotion path for message groups is therefore a closing condition of this
  epic (see Completion criteria, part a), not a follow-up.
- Until that path exists, every message-group membership change (ADD,
  REPLACE, MOVE, and a CREATE_REPLICA arriving at a node) is refused with one
  typed reason, at the rebalancer's planning and fail-closed at the
  `MessageGroupServiceHandler`. A joiner hosting its own group and a durable
  rejoin of a node's own replica remain allowed.
- The legacy `POST /register-service` MOVE handoff is refused unconditionally
  at the wire. Deleting the seed-side subsystem it fronted
  (`src/bootstrap/owners/move-replica-*`, about 2.3k lines, its bootstrap-api
  reservation endpoints and the register-service handoff wiring) is the
  follow-up quest `move-replica-handoff-deletion` (part b). It shares code
  with ordinary service registration, which must keep working.
- Upgrade residual (verifier probe `probe-residual.mjs` R1): two message-group
  replicas re-opened empty under names a joiner received by MOVE_REPLICA can
  elect each other in term 1 before any heartbeat from the seed reaches them,
  and an acknowledged write is lost when the seed returns. In-place upgrade
  from every affected build is declared UNSUPPORTED (owner ruling A).
  Affected builds (checked 2026-10-04 against git history, the npm registry
  and Docker Hub): every commit from 30d64250a (2026-01-19, "bootable system
  and working admin cli", the first commit carrying the MOVE_REPLICA
  assignment strategy and the joiner's join-existing-group phase) up to and
  excluding 9d006ff31 on this branch, which removed it. That covers every
  release tag v0.1.0 through v0.2.5 (including v0.2.4-rc.0..rc.2 and v0.2.4,
  which was tagged and never published), every published artifact (npm
  `lagrange-server` 0.1.1, 0.2.4-rc.0, 0.2.4-rc.1, 0.2.4-rc.2 and 0.2.5;
  Docker `psvensson/lagrange` 0.1.0, 0.1.1, 0.2.4-rc.2, 0.2.5 and `latest`;
  the Helm chart shipped with 0.2.5), the unreleased 0.2.6 (CHANGELOG entry
  of 2026-09-30, untagged), and origin/main up to at least d60c30921
  (2026-10-04), which still contains the join-time MOVE. The affected STATE
  is a node holding a message-group replica (`mg-<n>-r<k>`) whose name that
  node did not create: it received it by MOVE_REPLICA at join, so after the
  upgrade it re-opens under a raft id derived from that name with no history
  of its own. A cluster in which no node ever joined (single seed) does not
  carry the state. Clusters that ever ran such a build with a joined node are
  rebuilt or dumped and restored; no in-place path is offered. Recorded in
  `docs/current-capabilities.json` (limitation
  `upgrade-from-message-group-move-builds`), the implementation-status
  authority `audit:current-capabilities` checks. The sweep that would make
  such an upgrade safe is the required follow-up quest
  `message-group-foreign-replica-startup-sweep` (part b). No per-group
  identity high-water mark is built.
- Votes stay un-gated by the participation gate: refusing a vote while the
  local gate is closed locked a group out for good (verifier reproduced
  `evidence-o1-restart-equivalence` M4, H1 + self), and nothing in an empty
  shell's local state separates it from a genuine founder at genesis.
- Residual stated, not closed: the node transport does not authenticate a
  sender (limitation `node-transport-security`), and raft ids derive from
  replica names, so a sender that presents a member's id at a current term
  can still hold a replica for reseed or step a leader down. The sender rule
  stops unknown ids and stale terms only.
- No document may present a mechanism that does not exist yet as an
  operational exit (owner ruling B). The only exits today are rebuilding the
  cluster or dump and restore; there is no per-replica reseed, release of a
  `reseed-required` hold, fresh-identity re-add, or startup sweep yet. The
  "recreate/reseed the replica under rs-raft" wording under "No compatibility
  migration" names no existing per-replica procedure either: for legacy state
  the exit is likewise recreating the cluster or dump and restore.

### Generic/worker/WASM replica helpers

`RaftGroup`, `RaftReplicaBase`, worker partition/message-group services, and
`WasmServiceReplica` still carry the old object/event model.

Do not implement an rs-raft object that impersonates LifeRaft.

Consumers must move to the semantic operation port or be deleted if unreachable.

### Legacy partition consensus state

Fresh rs-raft state and old partition consensus state can coexist in one SQLite
file today. Production cutover must distinguish them and refuse unsafe reuse.

No migration and no fallback.

### Snapshot/catch-up ownership

Snapshot creation/install/catch-up currently contains historical assumptions
around `_raft_log`, `_raft_state`, append-fail vocabulary, and old adapters.

Classify each mechanism:

- generic state-machine/snapshot concern -> retain and rename/re-own;
- rs-raft concern -> integrate with rs-raft durable state;
- old-backend-only concern -> delete.

Do not carry dead compatibility tables merely because snapshot tests mention
them.

## Planned sequence

These are phase names, not pre-created Quest authority.

### R0 — real partition transport

Existing predecessor: `raft-rs-partition-transport-demux`.

Acceptance:

- semantic rs-raft envelope emitted by runtime owner;
- MessageRouter owns local/remote delivery;
- inbound partition demux reaches exactly one operation-port `step`;
- no fake old-backend packet conversion;
- no sender-membership filtering in transport;
- focused witness and repository gate green.

### R1 — single-path partition cutover

Goal:

- normal `PartitionService` construction always uses rs-raft;
- remove partition backend default/selector choice;
- remove production `raftProvider` injection as an alternate semantic backend;
- test injection moves to an operation-port factory or a narrower test seam;
- legacy durable consensus content is detected and refused;
- partition startup cannot silently reach the old backend by omission, error,
  restart, snapshot recovery, worker path, or test-like production option.

Red controls:

- omitted backend configuration currently reaches Liferaft;
- explicit old backend currently constructs successfully;
- legacy durable old-backend content currently can coexist without typed
  cutover refusal.

### R2 — committed-membership cleanup

Goal:

- delete partition service-row/local-peer-array membership authority;
- `ConfState` is the sole current-membership truth;
- metadata can request/project transitions but cannot mutate membership by
  itself;
- stable peer identity reservation stays distinct;
- desired RF/placement remains above Raft.

Delete old join/leave/cache-reconcile behavior only after the request/projection
replacement is proven.

### R3 — message groups on rs-raft

Goal:

- message groups use the same semantic operation-port/runtime boundary;
- their application command/commit contract is explicit;
- restart preserves term/vote/configuration safely;
- role/leader publication consumes semantic port events/status;
- transport uses the same semantic rs-raft envelope;
- no old provider, old in-memory Raft log adapter, or cloned peer runtime
  remains.

### R4 — generic replica/worker/WASM paths

Goal:

- migrate or delete `RaftGroup`;
- migrate or delete `RaftReplicaBase`;
- migrate worker message-group/partition paths;
- migrate `WasmServiceReplica`;
- delete process-level alternate Raft-provider control/spike paths unless they
  are moved under explicitly test-only research tooling with no production
  reachability.

No production consensus runtime may expose the old object/event API.

### R5 — rs-raft production-hardening gaps

Settle and land:

- `pre_vote=true`;
- `check_quorum=true`;
- runtime failure-isolation decision and proof;
- unregistered/retired peer workflow under real transport;
- proposal/apply/rollback semantics on current production path;
- snapshot/restart/catch-up under rs-raft durable state;
- learner promotion and removal under real topology workflows;
- no stale/retired replica can tick, campaign, or re-enter core.

Every item needs a destructive or adversarial witness, not a shape assertion.

### R6 — delete legacy implementation and dependency

After every production consumer has moved:

- delete all `liferaft*.js` implementation files;
- delete old provider/backend-selector branches;
- delete obsolete packet/timer/event vocabulary;
- delete old peer-representation and protocol-task machinery when it has no
  rs-raft semantic owner;
- remove `@markwylde/liferaft` from package and lockfile;
- delete old-backend tests rather than converting them into rs-raft tests unless
  they express a backend-independent invariant worth retaining.

### R7 — active-surface zero-reference ratchet

Add a static checker that fails on any case-insensitive `liferaft` occurrence
or old dependency/file-name pattern in active surfaces.

The checker must:

- follow active directories recursively;
- include filenames and file contents;
- include package manifests/lockfiles;
- fail on new references;
- exclude only explicitly listed append-only historical `solve/**` evidence;
- fail if the exclusion expands without an owner decision.

Also add structural guards that production cannot:

- select a second partition consensus backend;
- construct an old Raft implementation;
- import deleted old-backend modules;
- route native old-backend packets.

### R8 — certification

On one exact shared-main head:

1. zero active Liferaft references;
2. no old dependency installed;
3. operation-boundary audit green;
4. rs-raft transport witness green;
5. election disruption matrix green with both measured settings enabled;
6. cold 3/5-node formation;
7. node join/removal/replacement;
8. leader change during acknowledged writes;
9. restart and follower reconstruction;
10. snapshot/catch-up and wiped follower rebuild;
11. hostile/stale metadata cannot alter `ConfState`;
12. message-group replicated delivery/restart;
13. WASM service-group consensus path;
14. worker-path consensus if worker paths remain supported;
15. runtime fatal/blast-radius campaign;
16. whole required release proof green and durably recorded for exact SHA.

Then re-measure `core-convergence-rs-raft-readiness-baseline`.

Its terminal result must be:

```
READY_FOR_CORE_CONVERGENCE
metric = 0
```

before Q1 of `core-architecture-convergence` starts.

## Per-Quest adversarial contract

Every source-changing Quest:

1. names one semantic owner/interaction;
2. creates a red falsifier first;
3. distinguishes current-source facts from historical findings;
4. proves red-on-revert for each load-bearing source change;
5. tests restart/recovery where the path survives process restart;
6. tests local and remote transport where relevant;
7. tests stale/retired identity where membership/lifecycle is involved;
8. keeps generated test metadata current through
   `npm run test:metadata:refresh`;
9. receives an independent verifier attempting to find:
   - an old-backend fallback,
   - an alternate constructor,
   - raw core reachability,
   - observer-as-authority,
   - stale durable-state reuse,
   - renamed legacy behavior,
   - a second transport path,
   - a test stand-in instead of production engagement.

A verifier may conclude that a proposed deletion is actually a generic
state-machine concern and should be renamed/re-owned rather than removed.

## Completion criteria

Structured 2026-10-04 (owner ruling C) in three parts. An epic-level finding of
"no regression from main" does not clear a release-level blocker in part c.

### a. Conditions required to close this epic

This epic closes only when:

- all active consensus groups are rs-raft;
- no production consensus selector/fallback exists;
- old durable consensus state is refused rather than silently reused;
- message groups, worker paths, and WASM replicas are either rs-raft or
  intentionally removed;
- measured election settings are enabled and re-certified;
- runtime failure blast radius is explicitly owned and proven;
- snapshot/recovery uses rs-raft semantics;
- old implementation files are deleted;
- old dependency is absent;
- active-surface zero-reference ratchet is green;
- exact-main release proof is durably recorded;
- Q0 reports READY for core convergence;
- (owner ruling B, 2026-10-04) a fresh-replica-identity ADD and promotion
  path for message groups exists and is proven: a new raft id joins as a
  learner, catches up and is promoted through a committed configuration
  change, and mg-1 is replicated off the seed with it. Reason: the identity
  reuse it replaces demonstrably lost acknowledged committed state; until it
  exists the seed's disk is a single point of durable loss for mg-1, and a
  replica held for reseed has no recovery path.

### b. Follow-up quests created

- `message-group-foreign-replica-startup-sweep` (REQUIRED; owner ruling A).
  Statement: at node startup, before any message-group replica opens, every
  message-group replica whose persisted identity this node did not create is
  quarantined durably (held, never opened as a voter), once. Done when: the
  verifier's R1 shape upgraded in place (two such replicas, seed unreachable
  at their restart) opens no second leader and loses no acknowledged write,
  witnessed on real ports; a genuine founder and a node's own durable rejoin
  still open. Mandatory before an in-place upgrade from an affected version
  is advertised anywhere. It does not build a per-group identity high-water
  mark.
- `move-replica-handoff-deletion`. Statement: delete the seed-side MOVE
  reservation/handoff subsystem (`src/bootstrap/owners/move-replica-*`, its
  bootstrap-api reservation endpoints and the register-service handoff
  wiring) that the wire refusal of 2026-10-04 left unreachable, keeping
  ordinary service registration. Done when: no reference to the subsystem
  remains, ordinary registration witnesses stay green, and the wire refusal
  witness is replaced by the absence of the route's MOVE branch.
- `group-retirement-operator-retirement-fact` (owner ruling C, 2026-10-04).
  Statement: an operator mechanism retires a member that lingers in a retired
  group (a replica of a group retired as a unit whose own retirement never
  completed) by writing an explicit, durable operator retirement fact for the
  exact group and member identity. The fact is authoritative, idempotent and
  auditable (who, when, which group/member identity), survives cleanup of the
  group's workflow records, and is never inferred from a missing row. Done
  when: retiring a lingering member through the fact ends it; replaying the
  fact is a no-op; a member whose workflow records were cleaned up is still
  refused without the fact and retired with it; the fact for one identity
  never retires another. Until it lands this epic keeps the current behaviour:
  a lingering member stays fail-closed indefinitely, with no timer as its
  exit.
- `single-unresolved-operation-owner` (owner decision 2026-10-05: the
  invariant "at most one unresolved operation per partition" is NOT made
  universal on `replace-in-flight-blocks-planning`; the deliberate
  two-operation flows go to this one quest). Statement: one owner answers
  "this partition has an unresolved operation", and every admission asks it;
  today each lane derives part of the answer. A provisioning cohort is one
  logical operation. Scope: the serial planner's deficit-transition
  admissions (FAILED_REPLICA_REMOVE / TRUE_DEFICIT_ADD under
  `isEligibleDuringDeficitTransition`); the COORDINATION_MISMATCH exemption,
  replaced by an explicit supersede (fail the mismatched operation, then
  plan); the missing coordinator lane for a REMOVE beside an unresolved ADD
  on a priority partition; non-priority cleanup REMOVE while an operation is
  pending; and the initial-provisioning fan-out
  (`deferDispatchUntilBootstrapTopology`) as one multi-replica cohort
  operation. Done when: one predicate
  owns "unresolved operation exists" and every admission asks it, with a
  witness per flow.

### c. Conditions that remain 0.3 release blockers

- (recorded from another branch's findings, 2026-10-04) prepared or
  in-flight 2PC transactions are not awaited at split/merge cutover, so
  atomicity is lost. The defect exists on main and belongs to the
  transaction-replication owner. It blocks any release that claims split or
  merge is supported with transactional work in flight: for 0.3 either that
  owner's quest fixes it, or the supported-contract and release
  documentation explicitly exclude transactional split/merge.
- In-place upgrade from a build that moved message-group replicas (part b,
  first quest) stays unsupported and stated so in the release documentation
  until the sweep lands.
- A finding of "no regression from main" at epic level (for example for the
  2PC split/merge defect above, which main already has) does not clear a
  release-level blocker: each item here is cleared only by its own fix or by
  the release's supported-contract documentation excluding it.

## Amendments

- 2026-10-04, owner decision: ruling F2 (2026-09-26, a removed replica keeps
  participating until its own removal commits) is amended - "a group retired
  by a durable cutover exits AS A UNIT". F2 stays for every removal from a
  continuing group; split/merge source dissolution and aborted split-child /
  merge-target teardown retire the whole group on verified durable-workflow
  evidence with no conf change, and the 30 s consensus-exit backstop is an
  ERROR alarm only. Record:
  [`f2-amendment-group-retirement-2026-10-04.md`](raft-rs-full-cutover/quest-records/replace-source-removal-owner/f2-amendment-group-retirement-2026-10-04.md).

## Upgrade notes

- 2026-10-05, workflow record generation (quest zero-liferaft-active-runtime,
  group retirement as a unit; design
  [`design-workflow-record-change-store-2026-10-05.md`](raft-rs-full-cutover/quest-records/replace-source-removal-owner/design-workflow-record-change-store-2026-10-05.md),
  "Round 7"). Durable-format change: the `tables` system row gains
  `partition_transition_generation INTEGER NOT NULL DEFAULT 0`. On open, the
  tables-table column upgrade adds it to an existing `tables` partition
  database (existing rows read 0); a view/cache/CDC row image without the
  field decodes as 0. The first managed split/merge record write after the
  upgrade moves a row to 1; nothing ever writes 0 again. The record metadata
  gains `workflowAttempt` (absent = legacy attempt 0) and records may carry
  `postCutoverIncidents`; group-retirement evidence gains `attempt`;
  group-retired tombstones are version 3 (`attempt`; a version-2 file reads
  as attempt 0). Constraint: a node that predates the column fails to apply a
  replicated `tables` UPDATE naming it, and neither advances nor compares
  the generation - upgrade every node holding a `tables` replica before any
  managed split or merge runs (quiesce split/merge during a rolling upgrade).

<!-- BEGIN identity-open-refusal-native-prevote 2026-10-05 -->
### 2026-10-05: open-time identity refusal, native pre-vote / check-quorum (owner ruling)

**Closing condition (part a).** pre_vote and check_quorum on for every group the
port opens is a required closing condition of this epic. It is no longer an
optional follow-up. `RAFT_RS_GROUP_TUNING` in
`src/raft/raft-rs-group-constants.js` is the one place, and `tuningOf` builds
every core config from it. The disruptive-server requirement rests on
raft-rs's own lease:
- a replica that heard a leader within its election timeout ignores a
  higher-term vote or pre-vote request;
- a pre-vote never moves a term;
- a leader that hears no quorum for an election timeout steps down.

A transfer's election (MsgTimeoutNow, CAMPAIGN_TRANSFER) bypasses the lease.

**Tick ownership.** Every opened replica is ticked, so no lease freezes.
- A COMMITTED joiner opens with itself as a **learner** of C_j. O2 still
  holds: it names itself. The core does not campaign it: raft-rs
  `tick_election` returns before MsgHup while the replica is not promotable.
- The applied AddNode that opens the participation gate is the entry that
  makes it a voter.
- Configuration entries at or below j are folded into C_j and not applied to
  the core again. Without the fold, a replay could walk C_j through
  configurations the group never held, or leave it with no voter.
- The gate still refuses campaigns, proposals, and a tick of a gated core that
  is promotable (only a record written before this change).
- Founder deferrals and the durable-rejoin deferral stay host decisions,
  bounded by `startElection()` in the same phase. The joiner deferral is
  removed.
- B0: `quest-records/identity-open-refusal-native-prevote/b0-gate-ticking-finding-2026-10-05.md`.

**Open-time refusal (primary amnesia detector).** The rule lives in one place,
the participation gate's opening admission (`openingWithoutRecordRefusal`).
An opening under any bootstrap source (GENESIS, COMMITTED, DURABLE_RECORD) is
refused when both hold:
- the replica holds no durable raft record;
- the opening host's authoritative row proves the identity existed before.

The refusal is reseed-required and is held durably by the replica's lifecycle
owner, before the core is entered.

The prior-existence facts:
- **Seed and message-group founders:** a SERVICES row for this replica on this
  node in a non-empty startup admission. The seed registers founder rows only
  after the founders opened, so a first boot has an empty admission.
- **CREATE_REPLICA targets (provisioning GENESIS retries, stale COMMITTED
  stamps):** the authoritative SERVICES row read before this create writes any
  status. It names this node in SYNCING or ACTIVE, statuses the target writes
  only after its port opened. An unreadable row defers the create.

**The open-to-SYNCING window is closed (verifier N3, follow-up of
2026-10-05).** raft-rs 0.7 learners grant votes and a GENESIS founder votes
from birth, so a target that voted between its port open and its SYNCING row,
then lost its disk, reopened with no fact and could vote again in the same
term (reproduced on c7a942030 with the real core: two leaders in term 1). Now:
- The participation gate has an "identity unrecorded" state. A port opened
  with `IDENTITY_RECORDED` (a promise) drops every delivered envelope
  unstepped (a lost message to its sender, never a typed refusal), enters the
  core for a status read only (no tick, campaign, proposal, transfer or
  probe) and reports `gateOpen` false.
- `createReplicaAsync` hands that promise whenever its prior-existence read
  found no SYNCING/ACTIVE row on this node. Only the durable acknowledgement
  of the SYNCING write releases it (an event, never a timer). The write now
  runs through the status owner's bounded retry; a write that ends without it
  logs the spent wait, the create fails, and its failure path closes a port
  that never stepped anything. A crash before the write means the core never
  voted, so the reopening (no fact) is safe; a crash after it carries the
  fact and is refused reseed-required.
- The row-driven peer admission no longer admits PENDING/CREATING rows as
  voters. A target becomes a voter on the row change that records its fact,
  so no group counts a voter that cannot answer, and the services
  partition's own SYNCING write never waits on the replica it records (the
  formation-order deadlock the gate would otherwise create at services RF
  1->2 and at a REPLACE into {a, b, c-dead}).
- Seed founders take their fact from the seed phase, not this path: every
  founder of a system partition is on the seed node, rows are registered
  after the founders opened, and a partial first boot defers every founder
  without a row (`assertBootstrapPartitionStorageAdmission`), so no founder
  re-founds empty while a sibling remembers its vote.

**Property 2, exactly.** Vote and pre-vote requests from a never-member or a
removed ex-member never move a healthy leader's term: measured with the real
core at term+5, single or looped every 5/15/30 ticks to the leader and to the
followers, the term stays unchanged, the leader holds 100% of rounds and every
proposal commits; a removed ex-member kept running for 1500 rounds moves no
term. What it does NOT cover: FABRICATED higher-term leader traffic (a
heartbeat or append from a non-member: Byzantine, or a transport bug) deposes
its receiver exactly as in plain raft-rs (`become_follower` on a higher-term
append/heartbeat/snapshot, independent of pre_vote and check_quorum). Looped
at one election timeout to every member it keeps the group leaderless
indefinitely. Refusing it host-side would lock out a legitimate new leader the
receiver has not applied yet; Raft does not defend against it. It is a
residual, not covered.

**O2 (DECIDED 2026-10-05).** B1 represents the joiner in its own opening
configuration as a LEARNER of C_j. The owner confirmed that "self as learner
of C_j" satisfies O2: it is role establishment, which O2 allows ("fix the
gate / role establishment, not the bootstrap membership convention").

**Latent conditions and limits, stated plainly:**
- The raft-rs runtime does no log compaction, so no snapshot can carry a
  joiner past its AddNode. If compaction is added, the gate must also open
  from the snapshot's ConfState; otherwise a promotable gated core has its
  ticks refused (the old lock-out).
- A legacy record with a promotable gated core keeps its ticks refused. That
  is acceptable only because in-place upgrade is unsupported.
- A once-opened replica whose row later reads FAILED is not read as having
  existed (FAILED is also written for creates that never opened). Reaching
  it needs the replica DB lost without a restart; recorded, not closed.
- Message-group replicas created outside the seed carry no prior-existence
  fact at all (the open-time rule covers seed message-group founders only);
  the message-group create handler opens and starts the replica before its
  row exists - the same N3 window shape (owner: message-group create
  handler).
- One producer still admits a voter without the row filter: the partition
  init loop (`partition-service-raft-init-base.js`, bootstrap peers proposed
  when the opening replica already leads, e.g. a restored sole voter).
  Under check_quorum a not-yet-recorded voter costs the measured leaderless
  window: RF 1->2 and a REPLACE into {a, b, c-dead} lose their leader while
  it is closed (94 and 106 of 120 rounds) and elect on its release; RF 2->3
  and 3->4 with every member live keep their leader.
- An RF=1 replica created by CREATE_REPLICA no longer campaigns inside
  `initialize()`: its gate is closed until the SYNCING write, so it elects
  on its first election timeout after the release.

**Live formations: what the next ones should and must not show** (production
timing: 20 ms ticks; election timeout 1 s / 3.5 s / 6 s for replica index
0/1/2, randomized up to 2x). Expect more terms and leader changes during cold
formation than before; each spurious check_quorum step-down costs about
3.5-7 s leaderless, because followers holding the lease ignore pre-votes until
their own timeout. Watch: raft-rs "stepped down to follower since quorum is
not active"; "ignored ... lease is not expired"; leader changes per group in
the first 5 minutes; terms above about 10; no-leader deferrals of critical
system partitions; the new "Replica identity record never became durable"
warning. Must NEVER show: `reseed-required` at open for a first-boot founder
or a first create; a gated joiner whose applied index freezes while its group
advances; a replica that stays `identityRecorded: false` after its SYNCING
row is durable; two leaders in one term.

**Live-formation watch list after the identity follow-up (verifier
verify-identity-4, 2026-10-05).** Should show: creates logging SYNCING then
AddNode within about 1 s (event-driven); create->voter-ready of a few seconds,
the same as base within noise; an RF1 partition's first leader 1-2 s after its
SYNCING; no new spent 60 s voter-ready waits attributable to the admission
filter; a joiner's self-hosted message group electing only after its STOPPED
services rows are registered. Must NOT show: two leaders in one term;
`IDENTITY_RECORD_WAIT_SPENT` in a healthy formation (any occurrence is the
ack-loss wedge or its residue: capture the row and the authority-read
errors); a replica stuck with `identityRecorded:false` after its SYNCING row
is visible; `participation-gate-identity-unrecorded` refusals after release;
reseed-required at open for a first create or a first join; a leaderless group
whose ConfState names a FAILED or closed target (the FAILED_REPLICA cure must
REMOVE a terminally failed ADD/REPLACE target); a services group leaderless
after a seed restart during an ADD (I3-i); a message-group replica of a joiner
that leads before its services row is durable.

**The heartbeat hold stays as the second net.** P1, the local-log guard's
commit-beyond-log hold, is unchanged.

**Removed.** The host's non-member vote/pre-vote refusal (C1, 08f2cbb87) is
removed. Three host-side patches of it each opened a new hole, the last a
permanent lock-out (verdict round 2, B1). The owner ruled out a fourth patch
and any host-side lease.

**Residuals, stated plainly:**
- Fabricated higher-term leader traffic (above): not covered.
- `from` is unauthenticated, so a forger naming a member id is not covered.
- A held replica has no recovery path until the fresh-identity ADD exists.
- With a quorum held or unreachable, the leader now steps down (no leader,
  term unchanged under pre-vote) instead of leading a group that cannot commit.
<!-- END identity-open-refusal-native-prevote 2026-10-05 -->
