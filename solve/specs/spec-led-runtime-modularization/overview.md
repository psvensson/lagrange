# Spec-Led Runtime Modularization

## Purpose

This sprint turns the completed core topology rewrite into a stricter
replacement program for the remaining troublesome runtime paths. The goal is to
remove old compatibility branches, shadow grammars, and local fallback decision
logic by replacing them with small owner modules generated from sound
specifications.

The sprint is a follow-on to:

1. `.kiro/specs/core-topology-control-plane-rewrite/`
2. `_legacy_work/sprints/archived/done-2026-q2-core-topology-control-plane-rewrite.md`
3. The parked rolling-restart release-gate evidence that handed off the
   operation workflow/progress successor boundary.

This sprint is active by human direction as of May 9, 2026. It does not reopen
the parked release-gate sprint by itself. Runtime packages may use
rolling-restart artifacts as representative proof, or may migrate them only
when a package names the new owner boundary and canonical evidence block.

## Rewrite Thesis

The current system fails hardest where code combines these roles:

1. It observes raw evidence.
2. It decides semantic owner state.
3. It performs runtime effects.
4. It formats diagnostics.

Every rewrite package must split those roles. Runtime logic should be generated
from owner specifications in this shape:

1. `evidence`: normalize raw SQL, cache, transport, timer, and harness inputs.
2. `state`: declare one finite vocabulary for the owner.
3. `decision`: pure table from normalized evidence to one owner outcome.
4. `effects`: map outcomes to commands without deciding new semantics.
5. `ports`: declare repository, timer, message, and publication interfaces.
6. `adapter`: integrate the new module with existing facades during cutover.
7. `diagnostics`: format owner outcomes without reclassifying them.

## Owner Set

The sprint keeps the four mutation owners from the core topology rewrite:

1. Membership owner.
2. Placement owner.
3. Operation owner.
4. Publication owner.

Projection/readiness remains a consumer contract, not a fifth mutation owner.
Diagnostics and harness code are bounded observation consumers.

## Primary Starting Boundary

Start with the operation owner and priority recovery observation contract.

Reason:

1. The current representative failure is
   `operation_workflow_owner / workflow_progress_decision_kernel`.
2. The broad priority-recovery snapshot suite is red after recent fixes.
3. The active code still lets snapshot normalization, operation workflow
   re-entry, timeout reconcile, and diagnostics classification overlap.

## Tactical Inspirations

The sprint may take tactical inspiration from mature systems, but must not
import new product scope or foreign abstractions wholesale:

1. Kubernetes controllers: reconcile from desired/observed state, publish
   status conditions, keep controllers as the only writers for owned status.
2. Temporal and Cadence: durable workflow history plus deterministic command
   emission; workers execute commands but do not rewrite workflow truth.
3. Raft and KRaft metadata controllers: one log/controller owns ordered
   metadata transitions; observers consume committed state.
4. Kubernetes scheduler and CockroachDB allocator: separate filtering, scoring,
   and placement intent from actuation.
5. etcd and Kubernetes watches: revisioned streams and bounded watch consumers
   rather than ad hoc cache visibility as convergence proof.
6. SRE incident tooling: diagnostics choose one dominant witness from canonical
   signals and never become a second source of runtime truth.

These are implementation tactics only. Repository specifications and roadmap
scope remain authoritative.

## Activation Rule

Activate this sprint only after one of these is true:

1. The active rolling-restart package closes or migrates to a blocker that this
   sprint explicitly owns.
2. A human explicitly asks to switch from release-gate symptom packages to this
   modular replacement sprint.
3. The current owner-boundary package names this sprint as its successor.

As of this specification pack, condition 2 is satisfied. Later packages still
activate one at a time from the sprint queue and must freeze their owner module
contract before runtime edits begin.
