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

## Second addendum (owner, 2026-09-20): the restart/persistence matrix is the acceptance surface

The lead found the first phase-2 result vacuous on the restart boundaries (six
named boundaries were one host state: the stop fired on the first Ready cycle,
not the cycle carrying the configuration entry). The owner: continue the
repair, do not broaden the quest, do not begin backend integration; treat the
previous all-green result as invalid until these receipts are repaired and
independently verified.

1. **Boundaries relative to the actual configuration-change entry**, its index
   discovered from the core's own Ready. Per boundary: configuration entry
   index; durable last log index, commit index, applied index; durable
   HardState term/vote/commit; durable ConfState; in-memory ConfState before
   the stop where meaningful; Ready/LightReady phase reached; whether
   `apply_conf_change`, append advancement and apply advancement have run. Each
   named boundary is proved a distinct host state; two that serialize to the
   same relevant durable state keep the receipt red unless the raft-rs contract
   proves them intentionally indistinguishable.
2. **Recovery without network repair.** The victim restarts isolated; the first
   assertions come only from the persisted log, HardState, applied position,
   ConfState/snapshot and the restored RawNode. `local restore correctness` and
   `eventual cluster convergence` are separate claims; convergence never
   satisfies the restore receipt.
3. **Follower and leader victims**, measured not prescribed.

   > After restart, the node's state is exactly explainable by what was durably
   > persisted, and it never invents a configuration change that durable Raft
   > state does not justify.

   A leader crash before persistence may legitimately lose the proposal.
4. **Persistence-order violations are explicit mutants**: advance append before
   persisting entries; persist HardState but omit the entries; apply a committed
   configuration change before its entry is durable; update in-memory ConfState
   without persisting it; persist ConfState but leave the applied index behind;
   advance application before persisting applied progress; restore an applied
   index ahead of the durable log; restore a new ConfState with an old applied
   index; restore an old ConfState with an applied index beyond the
   configuration entry. Each is refused, fails restart equivalence, or produces
   an explicit unsafe result. raft-rs need not detect them all; the adapter
   must be unable to implement one by accident.
5. **Raft's contract separated from Lagrange's host obligations.** The
   evaluation ends with a small host contract - the operations around a Ready
   cycle, in the order derived from raft-rs 0.7 and proved followed by the
   adapter - distinguishing `raft-rs guarantees` from `host must guarantee`.
6. **Joint-consensus restart proves both configurations**: the complete
   ConfState (voters, outgoing voters, learners, learners-next, auto-leave),
   never reduced to "current voters"; then, separately, departure from the
   joint state. Auto-leave needing a tick is a measured behavioural property
   the future host must know, not necessarily a blocker.
7. **Re-application, precisely.** Record only:

   > For the specific idempotent configuration-change case measured here,
   > re-applying that change produced the same ConfState.

   An applied index also matters for state-machine command re-application,
   snapshot restore, compaction, which committed entries still require host
   application, and exactly-once side effects above Raft.
8. **Sequential and joint replacement stay separate**, each reported on its own
   terms (entries, catch-up criterion, learner death, old-voter death at each
   phase, quorum per phase, restart; joint-enter configuration, joint quorum,
   leave behaviour, auto against manual leave, peer failure while joint,
   restart). The integration stage chooses; this quest does not.
9. **The backend-contract census has four categories**: MUST SERVE;
   MEMBERSHIP-LOCAL DELETE CANDIDATE (narrow: local join, local leave, mutable
   local nodes list, `joinPeer`, peer-cache reconciliation as Raft membership
   authority); DIFFERENT IMPLEMENTATION (not an architectural deletion);
   PRODUCTION GAP (for example the Ready persistence protocol, ConfState
   persistence, membership generation/projection, stable peer-id ownership).
   The deletion forecast counts only the second.
10. **Multi-Raft numbers are promising and preliminary.** They do not
    extrapolate to 1,000 real partition groups under real traffic, SQLite
    persistence, Ready processing, snapshots and entry delivery. The question
    here is only whether the RawNode/WASM hosting model creates an obvious
    blocker; current evidence appears to say no.
11. **WASM build reproducibility is not a backend blocker.** Artifact integrity
    and byte-reproducible build stay separate; identify the likely toolchain
    nondeterminism; full reproducibility is a later supply-chain improvement
    unless the difference shows uncontrolled source or build inputs.
12. **Verdict derivation.** Consensus core: replicated membership;
    learner/promotion; replacement; pending-change semantics; restart
    correctness; stable peer identity; convergence independent of service
    caches. WASM/backend boundary: full RawNode lifecycle exposure; correct
    persistence/restore; ConfState restore; correct u64 identity; acceptable
    handle hosting; no missing primitive forcing consensus semantics back into
    JavaScript. Lagrange migration: `undetermined - requires integration stage`
    unless a decisive incompatibility appears. Part A defects are reasons to
    replace the current backend, not evidence that integration will succeed.
13. **Independent verification** attacks the harness before trusting the
    outcomes: move each crash trigger one Ready earlier/later; prove every
    boundary is tied to the configuration entry; permit network delivery during
    isolated restore and see it caught; corrupt durable ConfState only; corrupt
    applied index only; omit HardState persistence; reuse a removed peer id;
    mutate a learner into a voter on restore; attempt a second pending
    ConfChange; alter service caches during raft-rs scenarios; replace a core
    membership read with a test-declared set and require the receipt to fail.
    Performance figures are re-measured as sanity checks; most effort goes to
    persistence and membership safety.
14. **Decision after this quest.** If independently approved with the core and
    the WASM RawNode boundary viable and migration undetermined: stop investing
    in a Lagrange-owned committed-membership protocol above liferaft. The next
    quest is a minimal **experimental raft-rs partition backend integration** -
    behind the existing provider seam; fresh clusters only; the existing
    Lagrange transport; real durable storage; Raft ConfState as consensus
    membership; membership projected outward rather than derived from
    service-cache rows; the formation and failure corpus run side by side
    against liferaft. No migration of old logs, no removal of liferaft, and the
    membership-model-reduction implementation does not resume until the
    integration experiment says which concepts raft-rs makes unnecessary.
