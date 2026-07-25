# Requirements: Request Invocation Partitioning And Cell Continuity

## Scope and ownership

This contract extends request routing inside the existing
`RequestBindingRouteResolver`. It does not own Cell count, placement, runtime
activation, transport delivery, effect journaling, or OCI provider lifecycle.

## R1 — Trusted key contract

- Immutable request Binding policy SHALL select one supported extractor.
- The transport adapter SHALL derive the canonical key from the already
  normalized request and server-authenticated context. Client-supplied node,
  replica, or owner identity is never trusted.
- The hash namespace SHALL include tenant identity, immutable Binding version,
  extractor version, and canonical actor key.
- Missing, ambiguous, oversized, malformed, or unauthorized keys SHALL produce a
  typed fail-closed result or an explicitly selected unkeyed policy.

## R2 — Rendezvous assignment

- One transport-neutral rendezvous implementation SHALL rank the current ready
  actuals by stable runtime-service replica identity.
- Assignment SHALL be independent of iteration order and identical on nodes with
  the same ready-actual snapshot.
- Adding or removing one ready actual SHALL remap only the keys required by the
  selected algorithm; distribution and remap thresholds SHALL be sealed before
  the live Quest.
- The assignment policy lives inside `RequestBindingRouteResolver` and cannot
  create Cells, change replica count, or bypass dispatcher/receiver validation.

## R3 — Churn, stale routes, and effects

- A selected actual SHALL be revalidated before delivery and again by the
  receiver's existing authority.
- Kill, replacement, shutdown, or stale-cache races SHALL resolve through bounded
  retry against a fresh ready-actual view.
- The existing durable invocation journal remains the sole duplicate-effect
  boundary. Rerouting may retry delivery but cannot create a second effect.
- Generic Cell request continuity SHALL prove active-target kill, exactly-one
  replacement, bounded route recovery, no acknowledged-only success, and no
  duplicate component effect.

## R4 — Affinity versus ownership

- Rendezvous hashing provides affinity and bounded remapping only.
- It SHALL NOT be documented as strict actor ownership, ordering, or fencing.
- If correctness requires one actor owner across topology change, a separate
  specification SHALL introduce fixed logical shards, replicated epoch
  authority, and fenced handoff through existing metadata owners.

## R5 — Portability and non-request boundaries

- OCI provider recovery SHALL consume the generic Cell continuity contract and
  add provider-specific pull/start/probe/endpoint evidence only.
- Change, time, once, boot, call, and pushdown invocation are sibling source
  cutovers. Their existing placement/readiness is not invocation proof.
- Source cutovers SHALL reuse desired-state, Cell lifecycle, dispatcher, runtime,
  authorization, and effect owners one source at a time.

## Reuse comparison

- **REUSED:** normalized request/security context, immutable Binding,
  `RequestBindingRouteResolver`, ready actuals, dispatcher, message router,
  receiver validation, invocation journal, and shutdown fence.
- **EXTENDED:** Binding route policy and resolver assignment.
- **NEW:** trusted extractor contract and rendezvous scorer. No scheduler or
  replica owner is added.
