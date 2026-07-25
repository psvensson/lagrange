---
epicContractVersion: 2
id: request-invocation-partitioning
roadmapRow: null
graduatesTo: request-invocation-partitioning
---

# Request invocation partitioning

## Intent (why now)

Add stable keyed routing for replicated Cells without changing Cell capacity,
placement, lifecycle, or dispatch ownership. The current resolver hashes the
per-invocation identifier modulo the ready-actual count; it distributes calls
but does not provide actor-key stickiness under membership change.

## Selected boundary

- A transport-owned extractor derives a canonical actor key only from normalized,
  trusted request properties selected by immutable Binding policy.
- One transport-neutral rendezvous policy inside
  `RequestBindingRouteResolver` ranks current ready actuals by stable replica
  identity.
- The existing dispatcher, receiver revalidation, invocation journal, shutdown
  fence, and Cell lifecycle remain authoritative.
- Hashing supplies affinity and bounded remapping, not correctness ownership.
  Strict per-actor ownership requires a later fixed logical-shard namespace with
  epoch-fenced handoff.
- Generic Cell request continuity owns kill/replacement and stale-route recovery.
  OCI portability consumes that proof and adds only provider-specific evidence.

## Quest ladder

1. `keyed-invocation-route-contract`
2. `request-cell-rendezvous-routing`
3. `request-cell-routing-churn-failover`
4. `cell-request-continuity-live`

Non-request invocation remains a sibling program under the minimal-deployment
owner because CDC, timers, boot, named calls, and pushdown have different ingress
semantics.

## Open questions

- Which request Binding field selects the extractor without accepting
  caller-supplied owner identity?
- Is tenant plus Binding version plus actor key the complete hash namespace?
- Which remap and distribution thresholds qualify the live gate?

## Decision log

- 2026-07-25 — Selected trusted transport extraction plus rendezvous assignment
  inside the existing route resolver, and separated affinity from strict
  ownership. Graduated requirements to
  `solve/specs/request-invocation-partitioning/requirements.md`.
