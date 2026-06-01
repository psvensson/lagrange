# Core Topology Control-Plane Rewrite Design

## Overview

The rewrite replaces overlapping topology phase behavior with four mutation
owners and one projection/readiness consumer contract. The design target is not
more topology machinery; it is fewer places where runtime code can decide what
membership, placement, operation progress, publication, or readiness means.

## Owner Model

### Topology Membership Owner

Owns node identity, incarnation, admission, boot, join, rejoin, and lifecycle
handoff state. It emits explicit membership outcomes for placement,
publication, projection/readiness, diagnostics, and harness proof.

Forbidden reinterpretations:

1. Seed contact success is not admission.
2. Transport reachability is not active membership.
3. Cache visibility is not lifecycle handoff completion.
4. Phase timeout absence is not readiness.

### Topology Placement Owner

Owns partition assignment, replica intent, split intent, move intent, and
placement policy. It emits placement plans and policy reasons, not actuation
completion.

Forbidden reinterpretations:

1. Rebalancer pressure branches must not rewrite placement policy locally.
2. Recovery paths must not create assignment intent from partial cache evidence.
3. Survivors of a failed cohort must not become policy targets by fallback.

### Topology Operation Owner

Owns durable topology operations, workflow progress, retry, resume, terminal
outcome, and operation pressure. It turns placement intent into controlled
actuation and owns the transition grammar.

Forbidden reinterpretations:

1. Participants must not persist owner-managed phase transitions.
2. Timers must not rewrite terminal outcomes from another owner.
3. Event handlers may enqueue owner-key work but must not execute long-running
   progression inline.

### Topology Publication Owner

Owns topology projection publication, acknowledgement, freshness, and
watch/resume visibility. It emits the canonical projection stream consumed by
readiness and observation surfaces.

Forbidden reinterpretations:

1. Cache visibility alone must not prove publication convergence.
2. SQL fallback reads must not become an alternate publication source.
3. Diagnostics-only evidence must not acknowledge or complete publication.

## Projection And Readiness

Projection/readiness is a shared consumer contract. It consumes membership,
placement, operation, and publication outcomes, normalizes one snapshot, and
emits named readiness states:

1. Internal readiness for control-plane work.
2. Repair readiness for recovery and maintenance paths.
3. Serve readiness for user-visible routing and query/data-plane work.

Readiness consumers must consume those named states rather than reassembling
raw evidence from cache, SQL, transport, timers, or phase internals.

## Package Sequence

1. Spec and roadmap rebaseline.
2. Owner boundary inventory.
3. Boot, join, and rejoin membership kernel.
4. Partitioning and rebalancing placement/operation kernel.
5. Publication/projection boundary contract.
6. Projection/readiness consumer contract.
7. Legacy path deletion and representative proof.

## Inventory Handoff

The pre-runtime inventory lives in
`.kiro/specs/core-topology-control-plane-rewrite/owner-boundary-inventory.md`.
It is the source for package sequencing until runtime extraction starts. The
important split is that publication rows, ACK state, and freshness must be
canonical before projection/readiness consumers are cut over.

## Validation Strategy

Each runtime Quest must provide:

1. A boundary-specific static drift ledger.
2. Focused owner tests before and after cutover.
3. Harness or representative proof appropriate to Phase 0.1.
4. `npm run solve:status -- --id <quest>` and the Quest's focused validation.
5. `git diff --check` over Quest-owned files.
