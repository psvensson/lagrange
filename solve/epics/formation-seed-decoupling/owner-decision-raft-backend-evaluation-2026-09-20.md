# Owner decision: evaluate replacing liferaft with the raft-rs WASM core (owner, 2026-09-20)

**Status: binding.** Taken on the verified reconnaissance finding that Lagrange
has no committed Raft membership
([reconnaissance](evidence/model-reduction-reconnaissance-2026-09-20/README.md)).
It refines, and does not replace, the
[binding direction on model reduction](binding-direction-replica-membership-model-reduction-2026-09-20.md):
complexity reduction is still the objective, and Model A's missing third
element - committed membership with a generation - is to come from a mature
Raft core rather than from a Lagrange-owned protocol.

## The decision

> Do not implement a new Lagrange-owned committed-membership protocol on top of
> liferaft yet. First prove whether raft-rs via the existing WASM work can
> provide the missing committed-membership primitive cleanly.

> Use raft-logic as the starting experiment, but regard the TiKV/raft-rs WASM
> core - not the current high-level JS API - as the asset we are evaluating.

If the wrapper turns out messy, fork/simplify it into a Lagrange-specific
Multi-Raft adapter rather than abandon the raft-rs core. Main is not switched
immediately; there is no flag-day rewrite.

## Why

The defect is at the consensus boundary. Today: system-table/service cache ->
local interpretation of replica membership -> `liferaft.join()/leave()` -> a
local Raft peer array, so two nodes can disagree about who belongs to one Raft
group, and SYNCING is a peer wherever a node's cache shows it. Lagrange is
implementing safe dynamic membership - one of the hardest parts of Raft -
outside Raft. A proper core gives: leader proposes a configuration change ->
Raft log -> committed/applied -> the same `ConfState` on every peer, and
refuses more than one pending configuration change (`pending_conf_index`),
which is the one-operation invariant the direction converged on independently.
A mature consensus implementation should own that invariant.

Bug surfaces differ: the raft-logic JS/WASM glue is young and fixable
integration code; raft-rs is TiKV's production consensus module. Treat
raft-logic as a prototype and be ruthless about replacing its JS shell.

## What stays and what changes

Stays: the SQLite state machine, partition service, routing, replication
planner, durable workflows, transport/message router, SQL, system tables. The
seam is `src/raft/liferaft-provider.js`.

- **Transport** - fairly easy: raft-rs emits messages, Lagrange routes them,
  the remote runtime calls `step`.
- **Log/hard-state persistence** - moderate: log entries, hard state (term,
  vote, commit), snapshots, configuration state, persisted before advance.
  Investigate the replica's existing SQLite database or a Lagrange storage
  adapter rather than one more database per group.
- **Membership** - the biggest behavioural change: `ConfState` becomes the
  authoritative consensus membership and service/system rows become its
  projection (`ConfState -> system-table replica state`), never the reverse.
- **Stable Raft ids** - identities, never addresses, never reused for another
  member: `replica identity -> u64 raft peer id`, with a contract for
  collisions and reuse.
- **Learners and promotions** - wrapper work: expose something close to the real
  raft-rs API (`proposeConfChange`, `applyConfChange`, `confState`, possibly
  `addLearner`, `promoteLearner`, `removeNode`).
- **Multi-Raft** - one heavyweight JS object, timer or worker per partition
  group is the wrong final architecture. Reuse the Rust logic, the WASM build,
  message encoding, configuration changes, Ready/advance, hard-state
  structures, deterministic ticks; rework toward one host driving many RawNodes
  with one tick source, one transport integration and batched persistence. It
  may also help the event-loop starvation problem.

## Facts established by the lead before the evaluation (2026-09-20)

Recorded because they correct the premises above; verified by reading.

- `raft-logic` is already a Lagrange dependency (`package.json`, `^0.3.14`) and
  an earlier spike exists: `src/raft/spike/` (adapter, cluster, id mapper,
  provider control), `test/raft/spike/`, `npm run spike:raft-logic`.
- **raft-logic 0.3.14 (published = repository head 918d481) has no membership
  API.** Its WASM binding exports `create_node`, `seed_storage`, `free`, `tick`,
  `has_ready`, `take_ready`, `persist_ready`, `advance_append`, `advance_apply`,
  `advance`, `campaign`, `status`, `step`, `propose` - a RawNode-shaped surface -
  but nothing proposes or applies a configuration change; `addNode` /
  `removeNode` occur nowhere in the repository or its README. `ConfState`
  (voters, learners, outgoing, learners_next) is only seeded at creation, and
  ConfChange entry types are only decoded. `readIndex` exists in the JS shell.
- The core is `raft = "0.7"` (ConfChangeV2 and joint consensus available), and
  cargo, wasm-pack and the wasm32 target are installed locally, so the binding
  can be extended. That extension is therefore the first piece of work, not an
  optional one.

## The evaluation (changes the model-reduction quest)

**A. liferaft cannot satisfy the required contract.** Nearly established by
reading: divergent peer sets possible; configuration not replicated; no
configuration generation; local join/leave changes quorum; term persistence
appears incomplete. Driven evidence of divergent quorums is decisive.

**B. The minimum raft-rs/WASM contract Lagrange needs**, started from what
Lagrange needs, not from the `RaftNode` convenience API; approximately
`create(groupId, localPeerId, ConfState)`, `step`, `tick`, `propose`,
`proposeConfChange`, `applyConfChange`, `ready`, `advance`, `status`,
`confState`.

**C. Five decisive scenarios:** (1) a 3-voter stable group; (2) add learner ->
catch up -> promote; (3) replace a voter safely; (4) crash/restart during each
configuration-change phase; (5) two nodes hold stale Lagrange service caches
while Raft quorum membership remains identical. Then the current formation
case.

## Migration strategy, if the evaluation succeeds

1. **Provider interface** - an explicit `RaftBackend`, liferaft implementing
   the old backend; no behaviour change.
2. **raft-rs/WASM experimental backend** - the same partition state-machine
   interface; fresh test clusters only; old Raft logs are not migrated.
3. **Formation comparison** - same partitions, joins, failures and seeds through
   both; compare application semantics, never internal Raft logs.
4. **Configuration membership authoritative** - on the new backend only:
   `ConfState -> consensus membership`, service rows follow.
5. **Remove liferaft** once the new backend passes the formation and failure
   corpus; two backends are not maintained indefinitely.

## Deletion candidates if it succeeds

Local peer-set reconciliation as authority; the compatibility overflow budget;
multiple voter censuses; `max(activeCount, activeVoterCount)`; an invented
membership generation; much of the authorization carrier; chained-REPLACE
admission arithmetic; membership interpretations of SYNCING; local
join()/leave() reconciliation; some formation-specific repair machinery. The
committed configuration itself supplies the missing structural identity.
