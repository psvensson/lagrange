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

## Addendum (owner, 2026-09-20): the evaluation tightened before sealing

The extended Rust/WASM binding stays inside the Lagrange evaluation and is not
upstreamed yet: establish the contract Lagrange needs first, or raft-logic gets
designed around assumptions the evaluation later disproves. The owner does not
redirect again; the quest tests the missing primitive at its proper owner. The
acceptance result wanted:

> Can raft-rs/WASM make Raft membership a replicated fact which remains correct
> despite divergent Lagrange metadata caches, crash/restart and concurrent
> configuration-change attempts, at an acceptable Multi-Raft cost?

If yes, the next architectural decision is probably to build the experimental
Lagrange Raft backend rather than invent CommittedMembership above liferaft. If
it fails, the failure says whether the problem is raft-rs, WASM, the current
binding, or the hosting model.

1. **Raft primitives, not convenience membership.** No `addNode()` /
   `removeNode()` in the experimental binding. Expose `propose_conf_change_v2`,
   `apply_conf_change`, enough to identify committed `EntryConfChange` /
   `EntryConfChangeV2` entries, and the resulting `ConfState`. The policy - add
   learner, wait until caught up, promote, remove old voter - stays in Lagrange.
2. **Ready/persistence ordering is a major acceptance item**, probably the
   highest-risk part of the wrapper: persist Raft state, apply committed
   configuration changes through `apply_conf_change()`, and make the returned
   `ConfState` the durable configuration used on restore, in the raft-rs
   model's order. Restart at each boundary: proposed but not persisted;
   persisted but not committed; committed but not application-applied; conf
   change applied but ConfState not durably recorded; ConfState recorded but
   Ready not advanced; Ready advanced; joint configuration entered; joint
   configuration committed; joint configuration left.

   > Restart must reconstruct the same Raft membership from durable Raft state
   > alone.

   No service-row cache is allowed to repair it.
3. **Convergence, not instantaneous identity.**

   > After the relevant configuration entry has been committed and applied on
   > each surviving peer, their ConfState converges to the same configuration,
   > without consulting Lagrange service rows.

   During the intermediate period quorum and membership decisions come from
   raft-rs's own configuration state, not Lagrange's cache.
4. **The second pending ConfChange is observed, not prescribed.** raft-rs keeps
   `pending_conf_index` and may neutralise a second proposal into a normal empty
   entry rather than reject it. Measure the return value, the emitted log entry,
   the committed entry type, the resulting ConfState, and whether the second
   requested change ever takes effect. Lagrange then decides whether its
   provider turns that into an explicit membership-change-in-progress refusal.
5. **Stable peer identity is a hard invariant.** `Lagrange replica identity ->
   stable mapping -> Raft u64 peer identity`: stable across restart; stable
   across address change; distinct replicas on one physical node get distinct
   ids where needed; a deleted replica id is never reassigned to another
   logical replica; deterministic reconstruction. At the JS boundary an
   arbitrary Rust u64 does not pass safely through a JavaScript Number: BigInt,
   strings, split words, or a deliberately constrained encoding.
6. **Both replacement styles, separately.** Sequential Lagrange-style (A B C
   voters; + D learner; D catches up; D promoted; B removed) and ConfChangeV2
   replacement (old A B C; new A C D; joint; new only). The evaluation says what
   each costs and what semantics it provides; it does not decide which Lagrange
   uses. The multi-phase operation may stay useful for learner catch-up while
   the voter replacement becomes a joint change.
7. **Three verdicts, not one.** Consensus core viable? WASM boundary viable?
   Lagrange migration viable? A result such as "raft-rs core PASS, current
   raft-logic wrapper FAIL, WASM RawNode adapter PASS" is still very positive.
8. **Multi-Raft measurements separate WASM overhead from RawNode overhead** at
   1 / 100 / 1,000 handles: one-time WASM/module/runtime memory; incremental
   bytes per RawNode; tick cost per idle group; step cost; has_ready scan cost;
   Ready processing cost; configuration-change cost - in the intended hosting
   shape, never accidentally 1,000 heavyweight runtimes (or the reverse). The
   result says what architecture to build.
9. **The checked-in fork pins its toolchain.** Cargo.lock; rust-toolchain.toml /
   exact rustc; wasm-pack version; wasm-bindgen version; crate source/version;
   build command; WASM SHA-256. An artifact-integrity receipt and a
   reproducible-build receipt are distinct; byte-for-byte reproducibility is
   not a blocker, but the distinction is honest.

**Part A sharpened.** Same partition, same underlying state, node A's cache
says peers {A,B,C}, node B's cache says {A,B,D}: what does each Raft instance
believe its quorum is? Different voting configurations without any consensus
operation having occurred probably closes the architectural question about
liferaft. Then term/vote before a crash and after a restart from the actual
production persistence path: absent term persistence would be an independent
reason not to keep investing in that backend.
