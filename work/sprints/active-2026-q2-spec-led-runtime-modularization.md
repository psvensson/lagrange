# Spec-Led Runtime Modularization Sprint

Status: active. This sprint was activated by human direction on May 9, 2026
after the prior rolling-restart package closed and handed off a workflow
progress successor boundary.

## Current Package Snapshot

Current package:
`work/packages/done-20260509-spec-led-runtime-modularization-spec-and-reference-patterns.md`.

Owner boundary: `specification_owner / runtime_module_contracts`.

Current blocker: the successor sprint must baseline contract-first module
specifications before any runtime package can edit production or test code.

Next proof surface: work tracker validation and diff hygiene for the spec pack,
sprint file, active package, and roadmap pointer.

## Goal

Rewrite the next layer of troublesome runtime logic from sound specifications,
not by patching old branches. The sprint creates modular owner contracts first,
then replaces runtime logic owner by owner, and deletes compatibility paths once
the contract and proof ladder are stable.

## Scope Basis

1. Roadmap Phase `0.1 - Internal Coherence` release-gate closure and runtime
   coherence scope.
2. Core topology control-plane rewrite follow-on:
   `work/sprints/archived/done-2026-q2-core-topology-control-plane-rewrite.md`.
3. Specification pack:
   `.kiro/specs/spec-led-runtime-modularization/overview.md`.
4. Edition scope: Community / AGPL repo only.

## Rewrite Doctrine

1. Specifications become executable module contracts before runtime code moves.
2. Each semantic owner is split into evidence, state, decision, effects, ports,
   adapter, and diagnostics modules.
3. Decisions are pure and table-driven; effects are canonical commands emitted
   from those decisions.
4. Diagnostics, harnesses, analyzers, and admin surfaces observe owner
   decisions. They do not classify from raw runtime traces.
5. Deletion is part of every runtime package, not a cleanup afterthought.

## Best-Of-Breed Tactics To Borrow

1. Kubernetes controllers: reconcile desired and observed state, write status
   through the owning controller, and make conditions stable for consumers.
2. Temporal and Cadence: keep workflow history durable, deterministic, and
   replayable; workers execute commands but do not reinterpret workflow state.
3. Raft and KRaft controllers: order metadata transitions through one owner log
   instead of allowing scattered publication side effects.
4. Kubernetes Scheduler and CockroachDB allocator: separate filter, score,
   reserve, and commit intent phases.
5. etcd and Kubernetes watches: expose revisioned streams and freshness fences,
   not cache-presence guesses.
6. SRE diagnostic pipelines: derive one dominant witness from canonical signals
   and keep diagnostics read-only.

## Package Queue

1. [Spec And Reference Pattern Rebaseline](../packages/done-20260509-spec-led-runtime-modularization-spec-and-reference-patterns.md)
2. [Operation Owner Decision Kernel](../packages/todo-20260509-spec-led-runtime-modularization-operation-owner-kernel.md)
3. [Priority Recovery Observation Contract](../packages/todo-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md)
4. [Workflow Owner Adapter Cutover](../packages/todo-20260509-spec-led-runtime-modularization-workflow-owner-adapter-cutover.md)
5. [Placement Owner Policy Kernel](../packages/todo-20260509-spec-led-runtime-modularization-placement-owner-kernel.md)
6. [Publication Owner Stream Contract](../packages/todo-20260509-spec-led-runtime-modularization-publication-owner-stream.md)
7. [Projection Readiness Contract](../packages/todo-20260509-spec-led-runtime-modularization-projection-readiness-contract.md)
8. [Diagnostics And Harness Consumer Rewrite](../packages/todo-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md)
9. [Legacy Deletion And Representative Proof](../packages/todo-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md)

## Activation Rules

1. Activate only one package at a time.
2. Before runtime implementation starts, move the selected package to `active`
   and record real review, fix if needed, and implementation subagent proof.
3. Runtime packages must freeze one filled module contract before production or
   test edits begin.
4. Keep the parked rolling-restart sprint as predecessor evidence unless a
   fresh owner-boundary package explicitly reopens it.
5. Each runtime package starts with a decision-contract fixture or structural
   guard that fails for the old behavior.
6. Each runtime package ends with explicit deletion, downgrade, or quarantine of
   superseded paths.

## Cross-Package Invariants

1. Runtime state cannot be encoded with `null`, `undefined`, missing rows, raw
   elapsed time, or cache presence.
2. Owner modules do not import diagnostics, harnesses, or admin presentation
   code.
3. Consumers cannot choose a new owner-boundary label unless the owner decision
   contract emits it.
4. Best-of-breed inspiration is tactical only. Do not import a foreign system's
   vocabulary when the local specification already owns the domain language.
5. No Pro or Enterprise feature work enters this sprint.

## Exit Criteria

1. All packages in the queue are closed, superseded with a named replacement, or
   explicitly deferred in a new sprint.
2. Operation, priority recovery, placement, publication, projection/readiness,
   and diagnostics consumers all read from owner contracts.
3. Legacy compatibility branches, shadow grammars, and fallback decisions named
   by the migration map are deleted or guarded as unreachable.
4. Representative rolling-restart proof is green or has migrated to a fresh
   owner-boundary package with a canonical evidence block.
