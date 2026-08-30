# Topology-aware ephemeral stream relays — requirements

Status: proposed for the 2.0 distributed-execution roadmap.

## Purpose

Lagrange already models network locality with latency groups and a latency graph/tree. When an authoritative partition-side stream is already crossing an expensive latency-group boundary to a Lagrange peer, a later compatible subscriber in that downstream group should be able to attach to that already-active stream instead of causing another equivalent cross-group stream.

This is an optimization of the existing streaming/subscription path. It is deliberately **not** a cache, replica, gateway, new locality abstraction, or authority-transfer mechanism.

The intended shape is:

```text
source partition / stream owner
            |
            | one active cross-group stream
            v
      relay-capable peer B2
          /       \
     subscriber  subscriber

later compatible subscribe -> source
source -> ephemeral redirect to B2
subscriber -> attach to the already-active stream at B2
```

If any proof needed for the redirect is absent, Lagrange uses the normal authoritative/direct path.

## Problem statement

Latency groups already allow Lagrange to reason about topology and grouped CDC fan-out. A related case exists for long-lived partition-backed data streams, especially live-query/subscription traffic: several consumers in one remote latency group can independently establish equivalent streams from the same authoritative source, causing the same information to cross the costly group boundary repeatedly.

The core should be able to collapse that repeated crossing while the stream is already live, without adding retained copies or changing data ownership.

## Scope

### Goals

1. Reuse the existing latency-group and latency-tree/graph concepts.
2. Detect when a currently active outbound stream to a Lagrange peer can satisfy a new subscriber in the same downstream latency group.
3. Allow the authoritative/source stream owner to return an ephemeral relay redirect instead of opening another equivalent cross-group stream.
4. Preserve all existing authorization, ordering, cursor/resume, cancellation, and failure semantics.
5. Make the optimization opportunistic: inability to prove safety or usefulness must fall back to the existing direct path.
6. Keep v1 bounded enough that disabling the optimization restores the exact pre-existing behavior.

### Non-goals

The first implementation must not introduce:

- a cache, retained result store, replay store, or freshness/invalidation protocol;
- a new topology concept parallel to latency groups;
- a permanent gateway, ingress node, latency-group leader, or durable relay assignment;
- partition authority or ownership transfer;
- a new consistency model or stronger delivery guarantee;
- arbitrary client-to-client forwarding;
- query subsumption (for example, treating a broad stream as satisfying a narrower filter);
- recursive relay trees or redirects from relays to other relays;
- topology changes as a correctness dependency.

Grouped CDC propagation is prior art for topology-aware fan-out, but its group coordinator is not the generic stream-relay owner and must not become one implicitly.

## Terminology

**Source stream owner** — the existing authoritative component that accepts the subscription/stream request and can establish the normal direct stream. The implementation plan must identify the concrete owner before runtime changes begin.

**Relay candidate** — an authenticated, reachable Lagrange peer that is currently receiving the exact eligible source stream and can fan that live stream out to another authorized local subscriber.

**Subscriber** — a consumer requesting an eligible partition-backed stream. External clients may consume through normal Lagrange endpoints, but an arbitrary external client is never selected as a relay.

**Stream identity** — the canonical set of properties that make two subscriptions safe to share. V1 uses exact identity, not semantic query containment.

**Active stream instance** — one particular live source stream, including the source epoch/generation and cursor/sequence semantics needed to reject stale redirects.

## Normative requirements

### TSR-001 — Optional optimization only

Relay redirection MUST be observationally equivalent to the existing direct stream for an eligible subscriber, within the delivery guarantees already provided by that stream type.

If relay eligibility, topology, authorization, cursor compatibility, health, or capacity cannot be established, the source MUST use the normal direct path.

Correctness MUST NOT depend on a relay existing.

### TSR-002 — Reuse existing topology primitives

The implementation MUST use the existing latency-group identity and existing latency tree/graph evidence. It MUST NOT introduce an `island`, `region cache`, gateway, or parallel locality hierarchy for this feature.

Topology determines whether a redirect is useful and helps choose among otherwise-valid candidates. It MUST NOT confer authority over data or streams.

Unknown, stale, or insufficient topology evidence MUST result in direct streaming rather than a guessed redirect.

### TSR-003 — Source-owned redirect decision

In v1, only the normal source stream owner MAY issue an ephemeral relay redirect for a new subscription.

A relay MUST NOT redirect that subscriber onward to another relay. Redirect hop budget/depth is therefore exactly one in v1.

This rule prevents redirect loops and keeps recovery anchored at the authoritative subscription path.

### TSR-004 — Exact stream identity in v1

A relay candidate MUST match the new subscription's canonical stream identity exactly. The identity MUST cover every property that can affect observable stream contents or interpretation, including at least:

- authoritative source / partition identity;
- normalized query, filter, projection, or equivalent stream-plan identity;
- representation / protocol version or encoding that changes delivered values;
- snapshot versus live semantics;
- tenant and authorization/security scope, represented without exposing credentials;
- any other execution option that affects the produced stream.

Cursor/start position is tested separately for satisfiability under TSR-006.

V1 MUST NOT share streams by query subsumption, inferred equivalence, or post-relay filtering unless a later specification explicitly proves the authorization and semantic consequences.

### TSR-005 — Authorization isolation

A subscriber MUST receive no data through a relay that it could not receive from the source through the normal path.

The source MUST perform the normal authorization decision before redirecting, and relay attachment MUST use authenticated cluster/client context sufficient to bind the attach to that authorized subscription scope.

Stream identity MUST include a stable security-scope or authorization fingerprint (or an equivalent mechanism owned by the existing authorization layer). Raw credentials MUST NOT be used as the identity key or propagated as relay metadata.

A relay MUST NOT infer that two subscriptions are shareable merely because they address the same partition/query.

### TSR-006 — Cursor/start compatibility without new retention

A redirect MAY be issued only when the active relay can satisfy the subscriber's requested start/resume position using the live stream and buffering/replay capability that already exists for that stream type.

The feature MUST NOT add a retained history or cache to increase redirect hit rate.

If the requested cursor is older than the relay can satisfy, or if compatibility cannot be proven, the source MUST establish the normal direct/resume path.

### TSR-007 — Strictly ephemeral lifetime

Relay state MUST be in-memory/transient and tied to the lifetime of the active stream instance.

When the upstream stream closes, the relay becomes unhealthy, or the last downstream subscriber detaches and the existing stream machinery no longer needs the upstream, the relay association MUST be removable without metadata repair or invalidation work.

A restart MUST NOT require replaying or reconstructing relay assignments from durable state.

No durable system table, object, cache entry, or replication responsibility is created by a redirect.

### TSR-008 — Redirect is capability-scoped and stale-safe

The redirect/attach contract MUST identify the intended relay and active source-stream instance strongly enough to reject a stale or unrelated attach. At minimum the protocol needs the equivalents of:

- relay peer/endpoint identity;
- active stream instance identity;
- source epoch/generation when the existing stream protocol has such a concept;
- the subscriber's authorized attach scope;
- requested/compatible cursor information;
- v1 redirect hop budget of one;
- bounded validity or another existing liveness mechanism sufficient to reject obsolete redirects.

The exact field names are implementation details and are not frozen by this requirements document.

### TSR-009 — Failure returns to authoritative routing

If a redirect is stale, rejected, unreachable, incompatible, or fails during relay attachment, the subscriber MUST retry through the normal authoritative subscription route.

If an established relay fails mid-stream, the subscriber MUST resume through the existing authoritative path using the stream type's normal last-acknowledged cursor/sequence mechanism.

No redirect failure MAY require topology metadata repair, relay election, or cache invalidation.

### TSR-010 — Existing ordering and duplicate guarantees remain authoritative

Relay fan-out MUST preserve the ordering guarantees of the underlying stream. Failover MAY expose the same duplicate/retry behavior already permitted by the direct stream, but MUST NOT weaken it further without an explicit contract change.

This feature MUST NOT claim exactly-once delivery if the existing stream does not provide it.

### TSR-011 — Slow subscribers must be isolated

One slow or blocked downstream subscriber MUST NOT indefinitely stall the shared upstream stream or unrelated downstream subscribers.

Relay fan-out MUST use the existing bounded per-subscriber flow-control/backpressure primitive when one exists. If the current stream owner lacks a bounded isolation primitive sufficient for safe fan-out, implementation MUST pause at that boundary and add/prove the minimal transport-level isolation needed before enabling relays.

Adding retained history as a workaround is out of scope.

### TSR-012 — Relay resource use is bounded

Relay eligibility MUST be health- and capacity-gated. The implementation MUST bound at least the number of downstream attachments and queued/buffered data according to existing transport/resource limits or explicit feature limits.

A source MAY choose the direct path even when an equivalent relay exists.

### TSR-013 — Only Lagrange peers are relay candidates

A relay candidate MUST be an authenticated, reachable Lagrange peer or service endpoint participating in the relevant cluster transport/security model.

Arbitrary PostgreSQL clients, browser clients, application sockets, or other end consumers MUST NOT become relay endpoints merely because they currently receive the stream.

### TSR-014 — Topology changes do not change semantics

Latency-group membership or graph changes MAY cause future subscriptions to choose direct streaming or a different active candidate. They MUST NOT alter partition ownership, current stream contents, or authorization.

Existing topology hysteresis/stability rules SHOULD be reused. This feature MUST NOT add another group-membership state machine solely for relay decisions.

### TSR-015 — Observable decisions

The implementation MUST expose enough diagnostics to answer, at minimum:

- whether a subscription was served directly or offered a relay;
- whether a relay offer was accepted, rejected, stale, incompatible, or unavailable;
- why a potential relay was ineligible at a coarse safe-to-log reason level;
- current active relay streams and downstream counts;
- fallback count;
- evidence that equivalent cross-group streams were avoided (count and, where existing accounting permits it, bytes).

Observability MUST NOT log credentials or sensitive query/auth material merely to expose stream identity.

## Acceptance proof

Before the feature is considered complete, an integration harness MUST exercise at least two latency groups with a deliberately expensive/narrow inter-group path and prove all of the following:

1. The first eligible subscriber establishes the normal cross-group stream.
2. Additional exact-equivalent subscribers in the same downstream latency group attach through one active relay, leaving only one equivalent upstream crossing for that active stream.
3. A subscriber with a different query/plan identity is not redirected to the existing stream.
4. A subscriber with a different authorization/security scope is not allowed to consume another scope's relay stream.
5. A subscriber requesting a cursor the relay cannot satisfy uses the direct/resume path without creating retained history.
6. A stale redirect caused by source/stream epoch churn is rejected and falls back correctly.
7. Relay failure after attachment resumes through normal authoritative routing with the underlying stream's documented duplicate/order semantics.
8. Missing/uncertain topology evidence produces the direct path.
9. A deliberately slow downstream subscriber cannot stall healthy downstream subscribers or cause unbounded buffering.
10. Relay state disappears after stream teardown/restart without durable cleanup or cache invalidation.
11. V1 cannot form a redirect loop or relay chain longer than one hop.

The proof SHOULD include an A/B run with relay optimization disabled so the existing direct path remains a falsifiable baseline.

## Implementation gate

Before production code is changed, the implementation owner MUST map the concrete existing source-stream/live-query owner and record:

- its subscription handshake;
- canonical query/stream-plan representation;
- authorization point and security-scope representation;
- cursor/resume and source-epoch semantics;
- buffering/backpressure ownership;
- cancellation and reconnect behavior.

The implementation plan in `design.md` treats this mapping as slice S0. If any of those semantics are missing or ambiguous, they are a prerequisite to the relay optimization rather than something the relay layer may invent locally.
