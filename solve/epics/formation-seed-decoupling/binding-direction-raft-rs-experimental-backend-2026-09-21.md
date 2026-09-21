# Binding direction: the experimental raft-rs partition backend (owner, 2026-09-21)

**Status: binding scope for the quest `raft-rs-experimental-partition-backend`.**
Taken after `raft-backend-evaluation` was exhausted. It supersedes, where they
differ, the post-approval sketch in
[owner-decision-raft-backend-evaluation-2026-09-20.md](owner-decision-raft-backend-evaluation-2026-09-20.md)
section 9 and its third addendum.

## 0. What the decision rests on

`raft-backend-evaluation` is exhausted and must not be repaired again. Its
terminal result is recorded exactly as:

> Findings delivered; receipts not certified.

The rejected evaluation artifact is never described as certified evidence.
Preserved as uncertified historical evidence: all three independent verifier
reports; their attack scripts; part A's independently reconfirmed liferaft
findings; the tagged rejected trees; and the specific raft-rs and WASM findings
each verifier measured for itself
([evidence](evidence/raft-backend-evaluation-verification-2026-09-21/README.md)).

> The quest's own receipt system did not achieve certification. Three
> independent adversarial verifiers nevertheless independently measured the same
> high-level backend verdict. Those verifier reports, not the rejected generated
> artifact, motivated the experimental integration.

All three concluded: raft-rs consensus core **viable**; WASM RawNode boundary
**viable with named gaps**; Lagrange migration **undetermined, with no decisive
incompatibility found**. That is sufficient to justify an integration
experiment. No further implementation effort repairs that harness; the
integration itself becomes the stronger evidence source, because it exercises
the real Lagrange boundary.

## 1. Scope

An experimental backend integration, not a production cutover. It **must**: sit
behind the existing Raft/provider seam; support fresh clusters only; use the
existing Lagrange transport; use real durable storage; use the raft-rs
RawNode/WASM core; make raft-rs `ConfState` authoritative for consensus
membership; project membership outward to Lagrange metadata rather than deriving
Raft membership from cached service rows; support deterministic restart from
durable state; and run formation and failure scenarios side by side with the
liferaft backend.

It **must not**: migrate old liferaft logs; remove liferaft; silently become the
default backend; resume the old membership-model-reduction implementation; build
a separate Lagrange-owned committed-membership protocol above liferaft; or use
the rejected evaluation artifact as a golden oracle.

## 2. Backend selection

The smallest possible selection seam, if one does not already exist:
`liferaft` or `raft-rs-wasm`. Existing backend behaviour is unchanged. The
experimental backend is selected explicitly by test or harness configuration. No
generalized plugin framework unless the existing provider seam proves
insufficient.

## 3. The forked binding is experimental infrastructure

Start from the tested raft-rs/WASM binding work, carrying forward only what the
integration actually needs. The minimum likely surface: create/restore RawNode;
tick; step; propose; propose ConfChangeV2; decode committed configuration
entries; apply ConfChange; inspect ConfState; Ready/LightReady handling; advance
append/apply; status/progress; export/restore durable state; snapshots and
compaction if the real backend requires them.

No convenience calls at the binding level - no `addNode()`, `replaceNode()`,
`promoteNode()`. Those are Lagrange policy and workflow concepts; the binding
exposes raft-rs primitives.

## 4. Real persistence is the first implementation priority

Before formation or placement integration, build the production-shaped
Ready/persistence/apply loop, with its order derived from raft-rs 0.7's
documented host contract. Preserve the independently verified rule:

> The commit index must be durably recorded with or before applying committed
> entries.

The real storage path durably preserves at least: log entries; HardState (term,
vote, commit); applied progress; ConfState; snapshot metadata and state as
required. ConfState and its corresponding applied progress are persisted
atomically where recovery correctness requires them to agree. Recovery state is
never inferred from service or system-table caches: a restarted replica
reconstructs its Raft state from its own durable Raft record.

## 5. Actual ConfState is the membership authority

The central experiment. Under the raft-rs backend, `ConfState` is the authority
for consensus membership. Lagrange tables may record or project voter, learner,
incoming and outgoing voter, membership generation or version, and operational
lifecycle state - but those rows never modify the active Raft configuration
merely because a cache changed.

Explicitly reproduce the liferaft part A case: node A's cache `{a,b,c}`, node
B's cache `{a,b,d}` with d SYNCING. Under the raft-rs backend the hostile or
divergent caches may differ, both peers still observe membership determined from
the committed Raft configuration, and no local cache mutation independently
alters quorum membership. This is one of the primary acceptance tests.

## 6. Do not over-filter Raft senders

The earlier ingress rule is corrected. The host validates transport and routing
invariants but must not reject every message from a sender absent from the
receiver's current ConfState - the verifier demonstrated that this rejects
legitimate Raft traffic during a membership change. Validate at minimum:
explicit group/partition identity is present; the recipient is the intended
local peer and group; the envelope is correctly formed; cross-group delivery
cannot reach `step`; obviously corrupted encoding is rejected.

Never impose "sender must already be a current local member" for all message
classes. raft-rs permits legitimate membership-transition traffic from peers not
yet represented by the receiver's local applied configuration. If
sender-membership validation is added at all, its allowed cases derive from
raft-rs message semantics, and membership-transition races are tested directly.

## 7. Hostile and fatal messages are a real backend concern

Verification found remotely triggerable raft-rs fatal paths, so the integration
puts an explicit safety boundary around `step`. Test at least: a misrouted
heartbeat between groups; a heartbeat with an impossible commit position; a
malformed or empty ReadIndex request; a non-contiguous append; an append
response beyond the leader's log; TimeoutNow from an unexpected sender;
TransferLeader from an unexpected sender.

Raft correctness checks are not reproduced in JavaScript. The host validates
what it can know authoritatively - routing and group identity, message decoding
and schema, the recipient, basic transport invariants - and raft-rs owns
protocol semantics. Which hostile messages remain capable of trapping despite
correct routing validation is recorded.

## 8. A WASM trap invalidates the runtime

A WASM instance is not used indefinitely after a raft-rs fatal or trap: the
verified evidence says repeated fatals eventually make the runtime unusable even
though the handle-table poisoning bug was repaired.

> A WASM trap marks the containing Raft runtime unhealthy.

Recovery: stop dispatching work into that runtime; instantiate a fresh
module/runtime; restore its groups from durable state; resume. The independent
verifier's real restore figures - roughly 100-group recovery small, roughly
1,000-group recovery on the order of tens of milliseconds - are historical
evidence only, never an acceptance oracle. Re-measure in the actual integration
with the real storage adapter.

## 9. No runtime sharding yet

Start with the simplest Multi-Raft host: one WASM runtime containing many
RawNodes. Measure 1 group, 100 groups, 1,000 groups, and preferably one
production-shaped formation workload; measure runtime replacement at the same
scales using real persisted group state. Multiple Raft runtimes or shards only
if evidence shows the restart blast radius is operationally too large, trap
frequency makes whole-runtime restart unacceptable, or memory and resource
isolation materially benefits. No runtime-sharding subsystem is pre-built.

## 10. Stable peer identity is a Lagrange obligation

raft-rs does not prevent logical peer-id reuse. Define and test a stable mapping
from Lagrange replica identity to a raft-rs `u64` peer identity: stable across
process restart; independent of address; not based on current list position;
never reassigned to another logical replica after retirement; exact across the
JS/WASM boundary. Keep the decimal-string boundary or an equivalently exact
representation. Raft ids never pass through a JavaScript `Number`.

## 11. Election safety belongs partly to the host

Carried forward: never call `campaign()` on a learner; nor on a removed peer;
nor for a peer not present as a voter in its own committed ConfState.
Investigate `pre_vote` and `check_quorum` in the integration - settings are not
chosen by assumption; run failure scenarios and determine whether enabling them
is appropriate for Lagrange. The removed-peer case that kept ticking and
disturbed leadership is reproduced under the real backend. The target invariant:

> A peer which is no longer a voter cannot participate in future elections as
> though it still were one.

## 12. Learner catch-up remains Lagrange policy

raft-rs does not guarantee a promoted learner is sufficiently caught up. The
placement and workflow layer decides when promotion is safe, using raft-rs
progress information where appropriate, without duplicating consensus
membership. Lagrange asks "is learner D sufficiently caught up that we want to
promote it?"; raft-rs commits and applies the membership change safely.

## 13. Start with the sequential membership workflow

Prefer the workflow already close to Lagrange's model: add learner, catch up,
promote, remove old voter. Joint consensus is not required for the first
production-shaped integration. ConfChangeV2 and joint support stay available and
tested. After sequential replacement works through formation and recovery,
compare whether joint replacement simplifies anything enough to justify it. The
integration quest is not required to make that policy choice.

## 14. One outstanding membership change

Use raft-rs's pending configuration-change semantics rather than recreating a
compatibility overflow budget. At the Lagrange provider and workflow boundary,
expose an explicit result such as `membership-change-in-progress` when another
configuration change cannot yet proceed. `pendingConfIndex` alone is not the
semantic signal if its lifecycle does not match the desired application concept;
the provider may combine pendingConfIndex, applied position and an active
durable ReplicaOperation to expose an application-level state. raft-rs remains
the authority for whether another ConfChange can actually take effect.

## 15. Snapshots and compaction are an explicit acceptance area

The evaluation binding lacked the complete snapshot and compaction surface. The
experimental backend establishes the production contract before being considered
viable beyond short-lived tests. Test: a snapshot containing membership and
ConfState; the applied index; restore from snapshot; log compaction; restart
after compaction; a membership operation spanning a snapshot boundary where
meaningful. ConfState and applied state must not diverge across snapshot
restore. This is not postponed until after cutover.

## 16. The existing ReplicaOperation is the control-plane operation

No separate `MembershipTransition` subsystem during this experiment. The model
remains `ReplicaOperation` as durable Lagrange intent and workflow, raft-rs
`ConfState` as committed consensus membership. Investigate adding only the
minimum missing data to ReplicaOperation - relevant Raft peer ids, the requested
membership change, perhaps a base membership or config identity, the current
phase. No reason, generation or transition fields added speculatively;
integration falsifiers show which fields are actually needed.

## 17. Service rows become projections and lifecycle state

Service and system rows are not deleted; they still carry SYNCING, ACTIVE,
placement intent, readiness, diagnostics, routing and health. But these are
explicitly separated from Raft membership: `SYNCING` may describe application
catch-up and lifecycle, and must not mean "therefore this peer is a voter" -
that decision comes from ConfState. This eliminates the current ambiguity where
lifecycle status doubles as consensus membership.

## 18. Side-by-side formation scenarios

Every scenario runs on the current liferaft backend and on the experimental
raft-rs backend. Identical internal behaviour is not demanded; application-level
outcomes and safety properties are compared. Starting set: a fresh RF=3
partition; a seed with joining nodes; learner add, catch-up and promotion;
replica relocation; a previous target ACTIVE; a previous target SYNCING; peer
failure mid-relocation; leader failure mid-relocation; restart at every durable
operation phase; divergent service caches; a removed peer still ticking; a
second membership change while one is outstanding; formation on the slow lab
machine; split/merge overlap if reachable.

The experimental backend does not preserve liferaft behaviour where that
behaviour is itself the measured defect.

## 19. Complexity reduction is an acceptance criterion

Maintain the complexity ledger, tracking at least: authoritative membership
sources; decision owners; voter-count and census functions; membership
reconciliation paths; persistent fields; compatibility exceptions; Raft-specific
guard branches.

> If raft-rs integration adds a new mechanism but leaves all current local
> membership machinery active, that is not a successful architectural outcome.

Successful integration should eventually make these deletion candidates real:
local `join`; local `leave`; `joinPeer` as membership authority; the mutable
local peer array as membership authority; peer-cache reconciliation as consensus
membership authority; the compatibility overflow budget; competing voter
censuses where ConfState answers the question directly; the membership
interpretation of SYNCING. They are not deleted during the first experimental
implementation unless required, but exactly what can disappear after cutover is
identified.

## 20. Acceptance result

**A. Correctness.** Can real Lagrange partition groups run with raft-rs owning
committed membership safely across formation, membership changes, failures,
restart, stale metadata caches and snapshots?

**B. Operational viability.** Can the WASM Multi-Raft host handle the target
group count, recover acceptably after a runtime trap, and integrate with the
actual Lagrange transport and storage?

**C. Architectural reduction.** Does the backend eliminate more membership
complexity than it introduces?

**D. Migration decision.** One of: `recommend raft-rs backend cutover`;
`continue experimental - named blockers`; `reject raft-rs backend - named
incompatibility`. A positive result is not forced.

## Phase-4 addendum (owner, 2026-09-21): the partition seam is authorised

Phase 3 established, and the lead verified, that
`src/partition/partition-service-raft-init-base.js:408` constructs
`class RaftNode extends LifeRaft` directly and never calls the provider, so
selecting the raft-rs backend does not change the node a partition runs on. The
owner's decisions:

1. **The partition construction seam change is authorised** - necessary scope,
   not optional refactoring, because the quest exists to answer whether real
   Lagrange partition groups can run on raft-rs. The narrowest change that
   creates a real backend boundary: `PartitionService` ->
   `RaftProvider.createPartitionNode(...)` -> `liferaft` or `raft-rs-wasm`. The
   default stays liferaft; with it selected, partition behaviour stays
   decision-for-decision equivalent where measurable; unknown names fail closed;
   no production code silently chooses raft-rs; selection stays explicit through
   test or harness configuration; no generalized plugin framework. The provider
   receives the real requirements of a partition group rather than hidden
   globals - partition/group identity, logical peer identity, durable storage
   handle or context, transport/send capability, bootstrap membership where
   appropriate, tick and lifecycle hooks - and only what the two real backends
   need.
2. **The liferaft-internal lifecycle event is a separate migration seam.** The
   commit-rollback event is not hidden or emulated to make raft-rs look
   compatible. Identify exactly what semantic fact the partition lifecycle
   consumes from it, then define the smallest backend-neutral semantic event or
   result the partition service actually requires.

   > Abstract the semantic contract, not the liferaft event name.

   If it encodes liferaft-only behaviour rather than something partitions
   genuinely need, the dependency is removed instead of reproduced. Kept a
   distinct change from constructor routing so each can be differentially
   verified.
3. **No complete LifeRaft imitation.** Not an ever-growing facade over 20
   methods, 33 properties and 27 events. Every consumed member is classified as
   a true partition/consensus semantic requirement, a generic lifecycle or
   transport requirement, a liferaft implementation detail, or unused and dead;
   only the first two survive into the backend-neutral contract. raft-rs never
   lies about unsupported states such as mapping `PreCandidate` onto
   `CANDIDATE`. Prefer changing a small number of partition consumers to use the
   narrower interface over making raft-rs impersonate LifeRaft. Before and after
   surface size goes in the complexity ledger; a successful seam makes the
   required backend interface smaller than LifeRaft's public surface.
4. **`pre_vote` and `check_quorum` stay OFF for the seam conversion**, not
   changed in the same patch. Phase 3's measurements support the target
   `{pre_vote: true, check_quorum: true}`, which also aligns with the intended
   semantics - PreVote reduces disruption from a partitioned or rejoining node,
   CheckQuorum makes a leader step down after losing quorum activity - but
   changing them alters election behaviour and would complicate the earlier
   receipts. Order: complete the seam under the settings phases 1-3 were
   measured on; establish the real partition backend; then a small independent
   election-policy step re-running the failure scenarios over all four
   combinations, judged against the same deterministic scenarios. The
   conclusion is not encoded before that re-measurement.
5. **Retirement is scheduling eligibility, not a campaign guard.**

   > A logically retired replica must cease receiving election ticks or
   > participating in elections even if its local stale ConfState still contains
   > itself.

   A retired replica gets no ticks, no forced campaign, no participation as an
   active local Raft runtime, and restart preserves retirement before ticking
   starts. The learner and non-voter campaign guards remain but are not the
   primary protection. The reproduced case is tested: remove a peer while
   partitioned, its stale local state still lists itself, heal or restart, and
   durable retirement prevents it disrupting the live cluster before
   configuration catch-up.
6. **The seam must not turn service status back into membership.** With the
   raft-rs backend, `ConfState` remains authoritative; the constructor migration
   never reintroduces `services.status -> provider peer set` as a hidden
   bootstrap or reconciliation rule. Lifecycle values such as `SYNCING` remain
   observations that may control catch-up workflow, routing, promotion policy
   and diagnostics, and may never independently change who raft-rs considers a
   voter or learner. The phase-2 hostile-cache acceptance tests are retained
   through the real partition path.
7. **Phase 4 continues only after the real partition path works.** The next
   proof is not another message-group test: drive one real partition through the
   new seam - fresh partition; elect; propose, commit and apply; restart;
   membership read from the durable `ConfState`; learner addition; catch-up;
   promotion; removal or relocation; hostile service-cache mutations throughout.
   Only then do broader formation and failure runs begin. If the partition
   service requires a LifeRaft-specific member that cannot be mapped to a
   backend-neutral semantic requirement, stop and report instead of extending
   the compatibility facade automatically.
8. **Generated WASM and glue move out of `src`** if cheap: hand-written adapter
   and loader stay under `src/raft/`, generated and vendored build output moves
   to an explicit non-source location, because generated code should not
   participate in source lint, complexity and unused-export accounting, a large
   excluded subtree hides future hand-written code placed there, and the
   loader's digest verification does not need `src`. Digest verification, pinned
   source and toolchain metadata and the vendored raft-rs citations are kept. No
   baseline is raised. If the move creates a larger structural problem than
   expected, stop and retain the explicit exclusions rather than spending a
   large phase on repository layout.
9. **Reduce rather than enlarge the backend-neutral interface.** The goal is not
   that raft-rs implements LifeRaft, but that partitions depend on a minimal
   Raft semantic interface both backends can implement: lifecycle start and
   close; tick; message ingress; proposal; committed-entry delivery; leadership
   and state observation; membership and configuration observation; snapshot and
   recovery; membership-change operations. Internal raft-rs concepts are not
   exposed unless consumers genuinely require them.
10. **Sequencing and budget.** Continue through the partition seam and the first
    real raft-rs partition proof - the highest-value next step and necessary to
    answer the migration question - then **pause before any large phase-5
    expansion** and report: which LifeRaft dependencies remained; the size of
    the backend-neutral interface; whether a real partition survives restart;
    whether ConfState remains authoritative under hostile caches; whether
    sequential membership change works; what can now be deleted; and the
    expected scope and cost of the remaining formation and failure corpus.
    Another large phase is not spent merely because it was numbered in the
    original plan if the real-partition proof has changed what it should
    contain. Independent adversarial verification remains required before
    landing.
11. **Complexity acceptance** adds to the ledger: concrete LifeRaft imports
    removed from partition code; concrete LifeRaft enum reads removed;
    backend-neutral methods introduced; compatibility shim methods introduced;
    LifeRaft-only events removed or replaced; source checker exclusions removed
    after the generated output moves; membership authority sources before and
    after. The desired direction is fewer concrete LifeRaft dependencies, one
    consensus-membership authority, a smaller backend surface, no additional
    membership census and no new generic framework. A facade about as large as
    LifeRaft itself is evidence the seam is at the wrong level, and work stops.
12. **The method discipline stands.** Phase 1's production-before-test deviation
    remains recorded; phases 2 and 3's corrected method continues - test or
    falsifier first, observe the intended red, implement, retain the
    load-bearing falsifiers - and test-first is never claimed for work not done
    that way. The verifier is asked specifically to attack whether the default
    liferaft partition construction and behaviour remained unchanged while the
    raft-rs path became reachable.

## Phase-5 addendum (owner, 2026-09-21): the proof answers the question; spend narrowly from here

Measured through the real partition and provider seam: a raft-rs partition
survives restart; term, vote, commit and committed membership restore from real
SQLite state; `ConfState` stays authoritative while real service-table caches
are actively poisoned and disagree across replicas; service and cache lifecycle
state no longer defines consensus membership; learner addition, catch-up,
promotion and removal work through the real partition path; and the backend
abstraction is substantially smaller than the LifeRaft-shaped requirement it
replaced. The principal architectural question is answered sufficiently to
change the remaining work order, so spending does not continue by the old phase
numbering.

1. **The liferaft service-row membership authority is NOT repaired now.** No
   behavioural repair quest to remove `service row change -> raft.leave()` from
   the current backend: liferaft has no replicated committed-membership
   mechanism to replace it, its local peer set is derived from those rows, and
   removing one direction in isolation risks stale voters indefinitely and makes
   the old backend less coherent without making it safe. The finding stands and
   is recorded as a known architectural defect and a cutover deletion target:

   > On the liferaft backend, service metadata is consensus-membership
   > authority.

   No other membership mechanism is built above liferaft to repair it during
   migration. What is added or preserved instead is a structural regression test
   proving the raft-rs backend never changes `ConfState` because of service-row
   peer reconciliation. The liferaft `join`/`leave`/`joinPeer` machinery is a
   cutover deletion candidate. If a separate, currently reachable liferaft bug
   is found that causes immediate formation failure or a data-safety regression
   beyond the known architecture, that specific falsifier comes back before any
   behaviour changes.
2. **Receipt 17's witness correction is authorised, narrowly**: only because the
   semantic requirement is unchanged, phase 5 genuinely drove the sealed
   substance, and only the witness location and name moved with the proof onto
   the real partition path. The quest log records the old and the new witness
   and why they mean the same thing. This authorisation never alters acceptance
   criteria; the probe then truthfully reflects what phases 1-5 proved.
3. **Phases 1-5 are independently verified now**, before any transport code -
   higher value than expanding the corpus. The verifier attacks at least:
   backend selection and liferaft parity (default explicitly liferaft, unknown
   refused, no production code silently selecting raft-rs, existing partition
   behaviour unchanged by the construction seam); real partition construction
   (the partition really receives the provider's node, no remaining direct
   subclass or equivalent bypass creates the load-bearing runtime, the
   backend-neutral requirements are genuine partition requirements rather than
   LifeRaft emulation); durable restart (restore from the real SQLite records,
   stale bootstrap membership unable to overwrite committed membership,
   term/vote/commit surviving, no service-table cache in the restore path);
   ConfState authority, repeating the hostile-cache test while mutating
   SYNCING/ACTIVE status, invented replica rows, a removed replica still shown
   live, and deleted legitimate rows; sequential membership change verified from
   the core and the durable ConfState rather than test-declared sets; the
   refusal-versus-fatal convention, so an ordinary stale or removed-peer refusal
   does not retire the runtime and a genuine trap does; retirement scheduling,
   reproducing the removed-but-stale peer so durable retirement prevents ticking
   and election participation before stale local state destabilises the group;
   and the lifecycle semantic hook - `applyTransactionRolledBack` is inspected
   to answer whether the raft-rs Ready/apply/trap path preserves the actual
   partition invariant the hook exists to protect, recorded as a real
   integration gap if it does not, with no imitation event created merely for
   interface completeness.
4. **If verification materially invalidates the proof, stop** - if durable
   restart, ConfState authority under hostile caches, sequential membership
   change, real provider construction or retirement safety is shown false,
   return the falsifier rather than proceeding to transport to keep moving.
   Ordinary test or receipt defects are repaired narrowly.
5. **If verification holds, one transport quest is authorised**:
   `raft-rs-partition-transport-demux`. Its only architectural question:

   > Can a real raft-rs partition communicate through Lagrange's actual
   > transport without forcing raft-rs messages into LifeRaft's packet
   > vocabulary or reintroducing cache-derived membership?

   The broad side-by-side corpus does not begin.
6. **The demux extends semantically, not by imitation.** raft-rs messages are
   not wrapped in fake LifeRaft packets to satisfy `isRaftPacket`. The smallest
   transport-level distinction necessary identifies the Raft backend or protocol
   kind if required, the partition/group id, the sender peer id, the recipient
   peer id and the encoded Raft payload. Transport decides **where the message
   belongs**; raft-rs decides **what it means**; transport never decides quorum
   or membership.
7. **The corrected ingress rule is preserved.** A message is never rejected
   solely because its sender is absent from the receiver's applied `ConfState` -
   the earlier evaluation proved that breaks legitimate membership-change
   traffic. Ingress may validate authoritative envelope facts: group id present,
   recipient resolving to this local group, no cross-group delivery, valid
   encoding, a recognised backend discriminator. It may never infer
   "unknown-to-my-current-ConfState sender implies invalid message" for all
   message types; a stronger sender rule needs a concrete raft-rs semantic
   justification and a race test.
8. **The first real-transport acceptance test is not formation.** The smallest
   meaningful three-peer partition: create three raft-rs replicas through the
   real provider; communicate exclusively through real Lagrange transport; elect
   a leader; propose and commit an ordinary state-machine entry; restart one
   peer; confirm it catches up over real transport; add one learner through a
   committed configuration change; partition an existing peer while membership
   changes; heal it; confirm all surviving and applied peers converge on the
   committed configuration. **No driver wire carries Raft messages.** The
   driver's only role is environmental: partition, heal, crash, restart, submit
   an application proposal.
9. **The hostile-cache test is repeated over real transport**, each replica's
   service-table view mutated differently and continuously, the caches left
   visibly divergent so the test cannot pass because reconciliation happened to
   make them identical, and committed membership converging independently of
   them. This closes the last meaningful gap between the phase-5 proof and the
   real deployment path.
10. **The full side-by-side corpus is not run yet.** After the smoke test, stop
    and report: whether real transport works; any further LifeRaft-specific
    assumptions found in the demux; the transport and API surface added; whether
    hostile caches remain harmless; whether restart works over the actual
    network path; whether membership change works over actual transport; new
    deletion candidates; remaining blockers to a cutover; and the estimated cost
    of the smallest useful next corpus. Then the full corpus or a much smaller
    migration-certification set is chosen.
11. **`pre_vote` and `check_quorum` stay unchanged.** The evidence continues to
    suggest both true is desirable, but changing election policy now would
    confound the transport proof. After real transport works, a small
    election-policy experiment on the actual backend and transport tests all
    four combinations against the same failure scenarios, and then chooses.
12. **Whole-runtime trap containment is not solved now.** Recorded:

    > A fatal in one partition currently retires the WASM runtime containing
    > every group on that node.

    A production-readiness blocker, not a blocker to proving viability. No
    runtime sharding yet; the integration must keep distinguishing ordinary core
    refusals from actual traps. After real transport, the next reliability work
    measures actual trap reachability through validly routed production
    messages, whole-runtime restoration from real SQLite state, and 100 and
    1,000-group recovery cost through the real backend - and only then is
    sharding decided.
13. **The complexity-reduction direction continues**, tracking required backend
    methods, concrete LifeRaft references, LifeRaft-only events, membership
    authorities, membership census functions and compatibility shims. **If the
    transport step introduces a large LifeRaft compatibility layer, stop.** The
    direction remains less LifeRaft vocabulary, less locally inferred
    membership, one Raft membership authority, a smaller backend-neutral
    contract.
14. **Checkpointing.** Every coherent step commits on the quest branch, through
    the real pre-commit hook, never bypassed, never accommodating this work by
    raising a ratchet. WIP checkpoints are allowed; landing, merging and pushing
    remain separate decisions. Another seventy-file uncommitted working set is
    not allowed to accumulate.
15. **Authorised spend**, replacing the phase-5-plus-three-phases plan:
    independent verification of phases 1-5; if it holds, one narrow real
    transport and demux implementation and proof; independent verification of
    that proof. Then stop and report before any broad corpus expansion. The
    migration hypothesis is already strongly supported; the remaining
    high-value uncertainty is whether the real transport path preserves the
    semantics phase 5 proved with a driver wire.

**Target decision after the transport proof**: proceed toward cutover with a
reduced certification corpus; continue experimental work on named blockers; or
stop the migration because real transport exposes a substantive incompatibility.
The full historical liferaft corpus is not assumed to be the right certification
vehicle - the target is confidence in the raft-rs backend, not behavioural
equivalence with a backend whose membership behaviour is already known to be
defective.

## Prerequisite addendum (owner, 2026-09-21): `raft-rs-runtime-boundaries` before transport

The verification of phases 1-5 approved with recorded defects and falsified none
of the five stop conditions, but its two blocking defects are split out as a
narrowly scoped prerequisite. **Real transport routing does not begin until this
prerequisite is independently approved**, because the transport quest introduces
exactly the caller paths that expose both: transport invokes node ingress, which
makes scheduler-only retirement insufficient, and transport and persistence
callbacks execute around WASM calls, which makes failure-origin classification
load-bearing. Proving transport first would make its result ambiguous.

Scope, exactly: distinguish core refusal, WASM fatal and host failure; make
retirement an invariant of the node itself rather than of the current scheduler;
verify both adversarially; then resume transport. Not general runtime
reliability work.

**1. Three failure domains, structurally distinguished.** `error instanceof
Error => WASM fatal` is invalid because the boundary encloses host code.
*Core refusal*: a normal raft-rs operation returns a typed refusal - a stale or
invalid operation, a configuration-change refusal, a normal step refusal - and
does **not** retire the runtime. *WASM fatal*: the call itself traps or panics,
or the binding gives its explicit fatal indication, and the trap policy already
recorded applies. *Host failure*: JavaScript outside Rust fails - a SQLite
write, address resolution, a packet send, a committed-entry callback,
serialization of a host object, other adapter code - which is neither a core
refusal nor proof of a fatal and classifies as a host error with its own
recovery semantics. Origin is never inferred from JavaScript's base `Error`
type.

**2. Narrow the trap boundary** to as close as practical around the actual WASM
invocation: host preparation, then the invocation boundary, then host
persistence, send and apply work. Only an exception originating from the
invocation may be classified a WASM fatal. SQLite, send hooks, address
resolution and application callbacks do not sit inside a catch that converts
arbitrary failures into a Raft-runtime fatal. If wasm-bindgen returns a JS
exception for both Rust errors and real traps, derive a structural discriminator
from the binding or change the binding to expose one. Message-string matching
only if the binding offers nothing stronger and a falsifier proves it adequate.

**3. Make the binding result explicit if needed.** If the current surface leaves
refusal and fatal ambiguous, modify the experimental binding minimally toward an
explicit shape - `Ok(value)`, `Err(core-refusal)`, `Trap`, or equivalent
structured tagging. No Rust convenience policy is exposed; the binding's job is
only to make the execution outcome unambiguous. This is preferable to
increasingly clever JavaScript exception classification.

**4. Required D1 falsifiers**, each driven: an ordinary raft-rs refusal; a
malformed argument rejected by the binding before Rust runs; a SQLite failure
after a successful core call; a send hook throwing; an address resolver
throwing; an application or committed-entry callback throwing; a genuine
Rust/WASM panic. For each, assert the classification, whether the group remains
usable, whether the runtime remains usable, whether unrelated groups remain
usable, and whether retry or recovery is appropriate. **A host error is never
upgraded to a WASM fatal merely because it is an `Error`; a genuine fatal is
never downgraded to an ordinary host refusal.**

**5. Retirement belongs to node admissibility.** Gating only the existing
scheduler is insufficient. After durable retirement and across restart a retired
logical replica must not tick, campaign, accept ordinary inbound Raft envelopes
for active participation, originate Raft traffic, accept application proposals,
or rejoin merely because stale local `ConfState` still includes itself. This is
a Lagrange runtime-lifecycle invariant above raft-rs, and it does not rely on
the current scheduler being the sole caller - the transport quest is
specifically about adding another caller.

**6. The retired check happens before the core is touched** - before `tick`,
`step`, `campaign`, `propose`, configuration-change proposals and other active
RawNode calls. A message is never fed to raft-rs and judged retired afterwards.
The node fails closed with a typed `replica-retired` result.

**7. Retirement is separate from committed `ConfState`.** A peer may legitimately
hold stale durable or core state listing itself while Lagrange has durably
retired the local runtime, so both facts are preserved: `ConfState` is what this
RawNode last knew about consensus membership; local durable retirement is
whether this local logical replica may participate at all. Retirement does not
rewrite `ConfState`; it gates local execution until a valid lifecycle explicitly
creates a new logical replica with a new stable identity. **A retired identity is
never reactivated because a later message arrives.**

**8. The required D2 reproducer** is the verifier's exact failure: the peer is
partitioned; the cluster removes it; local stale `ConfState` still includes
itself; durable retirement is recorded; the process restarts; the scheduler is
never run; the test directly calls node tick and feeds real envelopes. Expected:
tick refused as retired, campaign refused, envelopes refused before `step`, no
outbound Raft message, and the live cluster's term and leader unchanged because
of this node. Then the retirement check is deliberately bypassed and the old
disruptive behaviour must reappear - a load-bearing permanent falsifier.

**9. Do not over-filter non-retired nodes.** D2 must not resurrect the incorrect
sender-membership rule. For a non-retired local replica inbound transport still
follows the corrected ingress semantics - valid group, valid recipient, valid
envelope, and the sender need not already appear in local applied `ConfState`.
Retirement is a property of the local receiving replica's lifecycle, never a
sender-membership filter.

**10. Independent verification before transport starts**, by a fresh adversarial
verifier attempting at least: a host SQLite error presented as a WASM fatal; a
send-hook failure presented as fatal; a wasm-bindgen argument error presented as
fatal; a true Rust panic presented as a host error; `step`, `tick` and
`campaign` called directly on a retired node; a retired node restarted with
stale self-containing `ConfState`; the scheduler bypassed entirely; and
legitimate membership-race traffic delivered to a non-retired node. It must
affirm both that failure origin is correctly classified and that retirement
holds regardless of caller path. If either fails, transport does not start.

**11. The other newly found gaps stay parked but explicit**, recorded as
required inputs to `raft-rs-partition-transport-demux` rather than absorbed
here: the apply-rollback invariant, where no fake LifeRaft event is invented and
the backend-neutral semantic requirement for a failed application transaction is
established during transport integration; outbound proposal encoding, which is
part of transport; the committed-entry callback shape; the module-level shared
runtime host, not redesigned here unless D1 cannot be fixed without it; and the
unregistered-peer workflow rule. The transport quest confronts each where it
becomes real.

**12. Transport resumes only after approval**, with its previously approved
scope: actual Lagrange transport; no driver wire carrying Raft messages; a
semantic raft-rs envelope rather than a fake LifeRaft packet; the corrected
ingress rule; the ten-step scenario; the hostile-cache repeat. Then stop and
report before any broader corpus.
