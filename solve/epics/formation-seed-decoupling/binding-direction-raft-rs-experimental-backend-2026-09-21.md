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
