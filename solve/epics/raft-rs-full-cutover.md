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
