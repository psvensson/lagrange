# Lagrange Engineering Doctrine

## Document Role

This document governs the short-form implementation doctrine for all coding
work in this repository.

Use this file for:

- the durable architectural intent behind code changes
- the rule that one concern has one owner
- the rule that one semantic decision uses one path

Do not use this file for:

- current concrete component owner maps
- workstream-local testing procedure
- style and lint details
- roadmap scope decisions

Read it together with [`.kiro/steering/system guidelines.md`](system%20guidelines.md),
[`.kiro/steering/testing-guidelines.md`](testing-guidelines.md), and the
canonical [`architecture.md`](../../architecture.md).

This document is the short-form design doctrine for all implementation work.

The doctrine is intentionally simple:

1. one semantic owner per concern
2. one write ingress per plane
3. one read ingress per semantic decision
4. one dissemination path for shared metadata
5. slower under pressure, never less correct
6. shrink porous boundaries when bugs cluster
7. sharpen work before changing code

## 1. One Semantic Owner Per Concern

Every durable concern must have one semantic owner.

- Node lifecycle has one owner.
- Replica lifecycle has one owner.
- Topology workflow state has one owner.
- Shared metadata row lifecycle has one owner.

Callers submit intent to the owner. They do not reproduce the owner's logic
locally, and they do not keep shadow state for the same concern.

## 2. One Ingress, Not Many Helpers

There may be multiple semantic owners, but there must not be many equivalent
runtime ingress paths.

- Shared metadata writes flow through semantic owners into one canonical
  mutation ingress.
- Shared metadata reads for a given semantic decision flow through one
  canonical read ingress.
- Query-plane traffic may use a separate ingress from metadata/control-plane
  traffic, but both planes must share the same pressure/admission contract.

The goal is not one giant generic helper. The goal is one structural path per
plane, so backpressure, retry semantics, batching, diagnostics, and admission
rules are universal.

## 3. One Dissemination Path For Shared Metadata

For CDC-propagated metadata, the dissemination path is:

`authoritative partition commit -> CDC -> SystemTableCache -> readers`

Bootstrap may hydrate initial state, but bootstrap code must not remain the
runtime dissemination owner.

If runtime correctness still depends on a phase-owned subscriber, retry loop,
cache patch, or bridge, the design is incomplete.

## 4. Phase Code Must Hand Off Completely

Bootstrap, join, and recovery phases may initialize runtime mechanisms, but
they must hand off to steady-state owners before phase completion.

- A phase must not tear down the only live runtime path.
- A phase-scoped bridge must either become a runtime-owned bridge or be
  replaced before teardown.
- Completion of a phase must reduce temporary machinery, not strand it.

## 5. Slower Under Pressure, Never Less Correct

Under load, the system may slow down, defer work, or reject new edge work with
structured retry semantics. It must not become less correct.

- Pressure must become admission, defer, reject, or coalescing signals.
- Pressure must not become hidden drops, memory growth without bounds, or
  correctness failures.
- Pressure policy belongs at canonical ingress boundaries, not at scattered
  feature call sites.

When an owner-path read or write is unresolved because pressure, authority
establishment, or recovery completion is still in flight, the owner must emit
one structured deferred outcome. It must not degrade into empty collections,
null-shaped absence, or timeout-only silence.

That deferred outcome must carry the canonical vocabulary for the boundary,
such as:

- outcome or completion state
- reason code set
- bounded retry delay
- authority, readiness, or recovery witness that explains why the owner is
  still deferred

Callers may consume or propagate that deferred outcome, but they must not
silently reinterpret it as success, empty visibility, or unknown absence.

For shared control-plane truth surfaces such as startup, readiness, admin
snapshot, service discovery, and harness convergence, readers must observe
through a canonical snapshot/watch owner. They must not run synchronous
multi-table authoritative repair inline on the hot read path. If freshness is
insufficient, the owner returns an explicit fresh, stale-but-usable, deferred,
or failed observation and schedules or performs repair through the owned
reconcile path.

Critical convergence traffic must keep stricter admission than diagnostics,
observability, or broad repair. In practice, node-state publication,
membership publication, and authoritative operation visibility must be allowed
to keep progressing under pressure conditions that may defer snapshot repair or
admin reads.

## 6. Shrink The Boundary When Bugs Cluster

When multiple bugs appear at the same boundary, assume the boundary is wrong
until proven otherwise.

Examples of a boundary:

- metadata mutation ingress
- metadata read ingress
- bootstrap-to-runtime handoff
- CDC dissemination
- readiness classification
- transport admission

After repeated bugs at one boundary, the next fix must reduce the number of
paths, states, or owners that can cross it. Do not keep patching symptoms while
leaving the boundary porous.

## 7. Resource Lifetime Must Be Owned And Bounded

Every queue, buffer, subscriber set, retry registry, deferred-work map, or
single-flight registry must have:

- one owner
- one capacity or bounding rule
- one teardown or expiry rule
- one diagnostic surface

If memory, queue depth, or subscriber count can grow without a named owner and
plateau condition, the design is not finished.

## 8. Architectural Direction For Repeated Control-Plane Problems

When control-plane behavior becomes hard to reason about, move upward in
abstraction.

Prefer:

- immutable decision snapshots over ad-hoc booleans
- owner-key reconcile queues over inline progression
- canonical gateways over raw helper access
- snapshot/watch dissemination over repeated point-query discovery
- shared pressure governors over call-site-specific retry logic
- revisioned or freshness-explicit observation contracts over caller-local
  cache-gap interpretation

Do not respond to repeated distributed failures by adding more scattered local
special cases. Collapse the behavior into stronger shared building blocks.

## 9. Normalize Evidence Before Adjudicating Decisions

When one decision depends on several live signals, separate observation from
policy.

- Collect evidence first.
- Normalize it into one immutable snapshot per entity.
- Let one canonical adjudicator emit the final state, reasons, and retryability.
- Treat weaker or cross-plane signals as degraded evidence unless the spec says
  they are equivalent.
- Never let degraded evidence promote a blocked entity to ready or admitted.

If fixes keep arriving as new boolean exemptions, the decision boundary is not
modeled yet. Replace the branch pile with an explicit state model and decision
table.

## 10. Sharpen Work Before Changing Code

Implementation work should be as explicit and bounded as the runtime design.

- A human idea should first become either:
  - a sharpened roadmap item
  - or a bounded work package
- Broad ideas must not go straight into code.
- Active implementation should target one executable concern per work package.
- Work-package status should live in the filename under `work/` rather than in
  several parallel trackers.
- Every active package must name its residual-closure inventory before code is
  treated as complete. At minimum that inventory must cover:
  - owner-path cutovers
  - direct and tail consumers
  - status, diagnostics, and reporting surfaces
  - deletion of superseded paths or stale vocabulary
  - required proof layers
- Do not treat a package as complete when only the hot path is fixed. A
  package is complete only when the hot path, tail consumers, diagnostics or
  reporting, deletion work, and required proof are all closed.
- Do not begin the next package on the same architectural boundary while the
  current package still has unresolved in-scope residuals. Either finish the
  residuals in the current package or split them explicitly into a new package
  before moving on.
- Parallel package execution on the same boundary is allowed only when the
  packages have explicitly disjoint file and owner scope, or one umbrella
  package owns the combined closure plan.
- A package is not complete when the narrow change lands; it is complete only
  after a final deep dive across the affected owner boundaries confirms the
  area is free of known doctrine and system-guideline violations.

If the proposed change cannot be described as one bounded concern with clear
ownership, invariants, and completion criteria, it is not ready for active
implementation yet.

## 11. One Contract Shape Per Concern

When the same concern appears as several near-synonymous caches, helpers,
snapshots, or output shapes, the design has already started to drift.

Prefer:

- one operationally authoritative contract per concern
- additional views only when their roles are explicit and non-overlapping
- one declared consumer set per shared surface
- one declared list of forbidden reinterpretations

Do not let observed, published, retained, cached, repaired, or fast-path
variants drift into several interchangeable authorities.

## 12. Normalize Boundary Impedance Once

Storage rows, bootstrap inputs, wire payloads, and transport observations are
evidence gathered at a boundary. They are not the steady-state runtime model.

Prefer:

- one ingress normalizer per boundary
- explicit runtime state variants
- storage and transport details contained at the edge

Do not let row nullability, protocol-specific fields, or bootstrap-only shapes
become semantic runtime contracts inside the system.

## 13. Prefer Named Modes Over Combinable Flags

If callers need to choose between semantic policies, give them one named mode
set owned by the boundary.

Prefer:

- explicit read, write, admission, or lifecycle modes
- invalid combinations made structurally impossible
- diagnostics that emit the resolved named mode

Do not encode semantic policy as independent booleans that callers can combine
into overlapping or contradictory behavior.

## 14. Shared Surfaces Must Name Consumers

If a runtime surface is shared across owners or layers, the design is not done
until its consumer contract is explicit.

Prefer:

- one named operational authority surface
- observed or retained views only when their roles are explicit
- one declared consumer set per shared surface
- one declared list of forbidden reinterpretations

Do not let diagnostics views, retained owner state, bootstrap-normalized
ingress state, or cache-local observations drift into a second operational
authority by convention.
