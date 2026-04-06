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
