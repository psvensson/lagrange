# Handover: rs-raft transport WIP and hard-cutover direction (2026-09-23)

## Owner decision

The owner has now chosen a **hard rs-raft cutover**.

Do not preserve Liferaft as a hidden/secondary/compatibility backend after the
remaining rs-raft gaps are closed.

The intended terminal architecture is:

```
all Raft-owning Lagrange subsystems
        |
        v
frozen semantic Raft operation port
        |
        v
rs-raft WASM runtime
```

Not:

```
subsystem -> backend selector -> Liferaft OR rs-raft
```

This supersedes the earlier temporary guidance that message groups could remain
on Liferaft indefinitely. The end state should contain **no Liferaft runtime,
provider, packet-vocabulary, configuration-default, or compatibility authority**.

Because Lagrange is still alpha, do not create a large automatic Liferaft-log
migration framework merely to retain backward compatibility. If a pre-cutover
database contains meaningful legacy consensus state that cannot be reconstructed
safely, prefer a typed fail-closed startup outcome plus replica/cluster
reseed/recreation over silent fallback or dual operation.

Do not implement that broader cutover inside the current transport PR. Finish
the transport prerequisite first, land it, then open a separately sealed hard
cutover quest.

## Current repository state

- Main before this WIP handover:
  `ef9151f2c6d3b63cbabd70fc7512b4a4e29c4ecd`
  (`apparatus: own generated test metadata refresh (#54)`).
- Core-convergence Q0 is already on main and remains
  `BLOCKED_ON_RAFT_CUTOVER`.
- Current WIP:
  - branch: `quest/raft-rs-partition-transport-demux`
  - PR: #52
  - pre-handover head: `d2b3d8e47425744fc807bb17161e68154cd6b7ff`
  - PR remains a draft and MUST NOT be merged red.
- PR #54 permanently fixed the repeated generated-test-metadata problem:
  - one `npm run test:metadata:refresh` owns primary/resource/subsystem
    manifests plus the impact-graph seal;
  - pre-commit is deletion-aware and staged-tree-safe;
  - Solver `land` invokes the same owner;
  - the remote change gate regenerates/diffs all four artifacts together.
- PR #52 has already demonstrated the fix on a real feature branch:
  `Prepare generated test metadata` is green on exact head
  `d2b3d8e47425744fc807bb17161e68154cd6b7ff`.

## What PR #52 currently implements

Production changes are intentionally narrow:

1. rs-raft runtime emission stamps one semantic transport envelope:
   ```
   {
     protocol: 'raft-rs',
     groupId,
     from,
     to,
     message
   }
   ```
2. `raft-packet-utils.js` distinguishes:
   - native legacy packet vocabulary;
   - semantic rs-raft envelopes;
   - shared "consensus transport payload" classification.
3. the production `MessageRouter` direct-consensus path uses the shared
   transport classifier;
4. `PartitionService.handleTransportMessage()` feeds a semantic rs-raft
   envelope unchanged to the frozen operation-port `step()`;
5. no sender-membership filtering was added;
6. no placement/membership policy was moved into transport;
7. no fake Liferaft packet is created to carry rs-raft traffic.

The obsolete `RouterDeliveryManager` has no production import and was
deliberately not taught a duplicate copy of the new classifier.

## Current red ordinary-proof failure

Run:

- change-gate run: `35818387599`
- exact PR head: `d2b3d8e47425744fc807bb17161e68154cd6b7ff`
- generated-metadata preflight: **green**
- ordinary proof: **red**

The first concrete remaining failure is test-fixture legacy reach-through, not a
transport failure:

`test/convergence/dt6-learner-promotion-fixture.js:createLeader()`

currently does:

```js
const uncommittedEntries =
  await leader.raft.log.getUncommittedEntriesUpToIndex(...);
await leader.raft.commitEntries(uncommittedEntries);
```

But `leader.raft` is now the frozen semantic operation port. It intentionally
does not expose `.log`, `.term`, or `commitEntries()`.

Observed failure across the DT6 channel-wake tests:

```
TypeError: Cannot read properties of undefined
(reading 'getUncommittedEntriesUpToIndex')
at createLeader (.../dt6-learner-promotion-fixture.js:250:52)
```

Several subtests fail from the same fixture root cause.

### Required repair

Migrate this fixture to the semantic operation-port model.

Do **not**:

- re-expose raw log/core/node state;
- add a compatibility `.log` field to the operation port;
- reconstruct Liferaft commit mechanics in a helper;
- weaken the learner-promotion assertions.

The fixture needs to establish its stated precondition ("leader has committed
entries") using a backend-neutral semantic operation/outcome or a production
owner already responsible for proposal/commit progression.

Treat any additional failing legacy fixture the same way: migrate the fixture
to `propose()`, `readStatus()`, `probePeerProgress()`, typed events, or
another existing semantic operation. Never restore raw Liferaft-shaped access.

## Ordered next steps

### 1. Finish PR #52 only

- Repair the DT6 fixture failure above.
- Run the exact-head gate.
- If another red is another pre-operation-port test fixture, migrate it
  narrowly.
- If a red is a production semantic defect, stop and falsify it before patching.
- Keep PR #52 limited to real semantic transport/demux + fixture migrations
  exposed by that proof.
- Mark ready and merge only on a green exact-head gate.

### 2. Re-measure Q0 immediately after #52 lands

Expected movement:

```
rs-raft-real-transport-demux:
  BLOCKED -> SATISFIED
```

Do not assume Q0 is READY merely because transport lands.

### 3. Seal a new hard-cutover quest

The new owner direction is stronger than the original experimental-backend
quest. Its purpose is to make rs-raft the sole Raft implementation in Lagrange.

It should adversarially cover at least:

- remove partition omission/default fallback to Liferaft;
- remove the dual-backend partition selector once no production consumer needs
  it;
- migrate message groups (and any other real Raft consumer) onto the same
  semantic rs-raft operation/runtime ownership model;
- remove `LiferaftProvider`, direct `LifeRaft` imports/extends, Liferaft
  packet/event/timer vocabulary and compatibility paths once consumers are
  migrated;
- prove zero production and zero test-support dependency on Liferaft except
  historical evidence text that is intentionally retained;
- classify the historical `_raft_log` / `_raft_state` facilities:
  - generic application/snapshot/HLC state needed by rs-raft -> move/rename to
    the correct generic owner;
  - legacy Liferaft consensus state -> delete from the live rs-raft path;
- fail closed on an existing legacy consensus database rather than silently
  falling back;
- explicitly choose reseed/recreation rather than building a migration
  subsystem unless a falsifier proves migration is necessary;
- retain committed rs-raft `ConfState` as the one current consensus-membership
  authority;
- retain the frozen operation port, runtime/core-entry owner, local lifecycle
  owner, and peer-identity owner already proven.

### 4. Close the remaining rs-raft correctness gaps

Use the 2026-09-21 handover and later operation-port work as evidence, but
re-verify on current source.

Known historical gaps/findings that must be re-censused rather than assumed
closed include:

- apply-rollback semantics;
- proposal encoding (historically a JS object could become an empty proposal);
- committed-entry callback shape;
- shared module-level WASM runtime blast radius;
- unregistered-peer workflow behavior;
- pre-vote/check-quorum decision;
- snapshot/restart/catch-up through the current rs-raft path;
- learner promotion and removal under real transport;
- durable local retirement versus committed `ConfState`;
- restart after failure and runtime replacement.

Some may already be closed by the operation-port/runtime-boundary work. Prove
current reality before adding mechanisms.

### 5. Exact-main certification

Before declaring hard cutover complete:

- operation-boundary witness;
- real transport witness;
- cold formation;
- restart;
- membership add/promote/remove;
- leader-change acknowledged writes;
- follower rebuild/snapshot;
- hostile/stale metadata versus `ConfState`;
- SQL;
- service/WASM execution;
- release-full-v1 proof for the exact terminal main SHA.

Then re-measure Q0. Only a real
`READY_FOR_CORE_CONVERGENCE` opens Q1.

## Important architectural prohibitions

- No hidden Liferaft fallback.
- No dual normal partition path.
- No "temporary" compatibility facade that exposes raw log/core objects.
- No fake Liferaft events/packets around rs-raft.
- No service/cache rows as committed consensus membership.
- No transport-layer quorum/membership filtering.
- No generic new workflow/transport/epoch framework merely to accomplish
  cutover.
- No global replacement of legacy storage names until each stored fact is
  classified by semantic owner.
- No broad implementation before a red control proves the gap.

## Useful files to read first

- `solve/epics/core-architecture-convergence.md`
- `solve/epics/core-architecture-convergence/design.md`
- `solve/epics/core-architecture-convergence/rs-raft-readiness-baseline.json`
- `solve/epics/formation-seed-decoupling/HANDOVER-raft-rs-2026-09-21.md`
- `solve/epics/formation-seed-decoupling/binding-direction-raft-rs-experimental-backend-2026-09-21.md`
- `src/raft/raft-rs-operation-port.js`
- `src/raft/raft-rs-runtime-owner.js`
- `src/raft/raft-rs-replica-lifecycle-owner.js`
- `src/raft/raft-rs-membership-administration.js`
- `src/partition/partition-service-entry-apply-base.js`
- `test/partition/raft-rs-transport-demux.test.js`

## Takeover instruction

Start by reproducing the exact DT6 fixture failure on PR #52. Do not begin the
hard cutover until PR #52 itself is green and merged. After merge, re-measure
Q0, record the reduced blocker set, then seal the hard-cutover quest under the
owner decision above.
## Addendum 2026-09-23 (afternoon): PR #52 landed, Q0 re-measured, cutover census started

### What landed
PR #52 merged as `8ed8f889cfa817c6d786ca688f581c83bc1573a5` (squash). Beyond the transport/demux production change it carries:

- port migrations for every pre-operation-port fixture inside its proof cone: the
  DT6 learner-promotion fixture and its two witnesses (real consensus kept; the
  committed-prefix precondition declared through the partition's durable log
  owner), the snapshot catch-up end-to-end witness (`campaign()`,
  `probePeerProgress(peer)`, `readStatus().term`), the packet round-trip
  property (delivery preservation over all packet types through the
  backpressure-mute helper, plus the seam port's outbound send), and three
  partition-service suites (controllable provider double);
- three fixes-red repairs for statics main had carried since #46 and that made
  the local push gate refuse every push (file-size ratchet 28/27 via the runtime
  owner's vocabulary/tuning extraction, complexity ratchet 1817/1816 via
  `runReadyCycle`, four literals in `liferaft-provider.js`).

An earlier variant on the branch replaced both DT6 replicas' consensus with the
controllable test double; it was superseded because it left real replication,
catch-up and the production progress probe unexercised (the owner chose the
real-replication version on 2026-09-23).

### Still red on main, outside that cone (owner: the cutover epic's first quest)
`test/bootstrap/production-scheduling-defaults.test.js`,
`test/convergence/dt6-ledger-leader-durability-fitness.test.js`,
`test/query/write-path-internal-pacing.test.js` - all fixture reach-through
into the frozen port (`raft.emit`, `raft.leader =`, `raft.term =`).

### Q0 re-measure
`rs-raft-real-transport-demux` -> SATISFIED. Q0 stays `BLOCKED_ON_RAFT_CUTOVER`
with two blockers: `partition-backend-single-path` (liferaft is still the
default; note `raftBackend` is read only from PartitionService construction
options, no configuration key reaches it, so production partitions are
liferaft today) and `exact-main-release-proof`.

### Cutover census (lab node, read-only)
Running the whole corpus with `RAFT_BACKEND_DEFAULT = raft-rs-wasm` on
`d551b2875` (local branch on tv-dator, never pushed) to measure, not assume,
what breaks when rs-raft becomes the only partition path. Result:
in progress on the lab node at the time of this addendum (interim, about half way: 986 files ok, 11 not ok - formation simulations, the DT6 channel-wake witness whose committed-prefix seeding is liferaft-only, the SEA bundle smoke, and the operation-port regression test that asserts liferaft is still the default). The full classification is recorded in a follow-up once the run completes.

### Next
1. Rebase and merge PR #55 (`raft-rs-full-cutover` epic, records + zero-reference audit).
2. Seal R1 `single-path partition cutover` from the census, with red controls
   named in the epic (omitted backend reaches liferaft; explicit old backend
   constructs; legacy durable content coexists without typed refusal).
