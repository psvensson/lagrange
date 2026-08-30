# Topology-aware ephemeral stream relays — design

Status: proposed; implementation not started.

Roadmap home: Future 2.0 — deeper distributed execution.

Requirements: [requirements.md](requirements.md)

Adversarial review: [adversarial-review.md](adversarial-review.md)

## Summary

Lagrange should reuse its existing latency groups and latency graph/tree to avoid sending the same live partition-backed stream repeatedly across an expensive group boundary.

The first subscriber follows the normal authoritative path. While that stream is active, the source stream owner may remember that an authenticated Lagrange peer in latency group B is already receiving the exact stream. If a later compatible subscriber in B arrives, the source may answer the normal subscribe request with a short-lived redirect that lets the new subscriber attach to that already-active stream at the peer.

```text
        latency group A                         latency group B

 authoritative partition/source
              A1
               |
               | one active stream across the boundary
               v
                                                 B2
                                               /    \
                                             B1      B3

 new subscription from B3 -> A1
 A1 proves exact stream/auth/cursor compatibility
 A1 -> ephemeral redirect(B2, active stream instance)
 B3 -> B2 attach
```

Nothing is retained because of this feature. B2 owns neither the partition nor the data. If B2 or the redirect fails, B3 returns to the normal authoritative route.

V1 is intentionally one-hop: only the source stream owner can issue a redirect, and a relay cannot redirect onward. A failed relay attempt also consumes the redirect budget for that recovery attempt, so authoritative fallback cannot be trapped in a source -> stale relay -> source loop.

V1 deliberately does **not** add source-side single-flight coordination. If several cold subscriptions race before the first eligible active stream has been established and observed as a candidate, more than one direct cross-group stream may briefly exist. The promised optimization begins once an eligible active candidate exists.

## Why this belongs in the existing topology/stream machinery

Lagrange already has the relevant concepts:

- `LatencyGroupManager` supplies latency-group identity;
- `LatencyTreeService` supplies topology evidence and an ordering/shape for cross-group communication;
- grouped CDC propagation demonstrates that Lagrange can reduce cross-group fan-out while preserving a local fan-out path;
- the existing stream/live-query owner already owns subscription, authorization, cursor/resume, cancellation, and transport semantics.

The new behavior should connect those existing owners rather than introduce a `TopologyIsland`, cache, gateway service, or second placement hierarchy.

The grouped CDC implementation is important precedent but not the generic relay implementation. In particular, `CDCGroupPropagationService` may route via a latency-group coordinator for its own delivery contract. An ephemeral data-stream relay is different: the relay peer is selected because it is **already receiving this exact active stream**, and that role disappears with the stream. The CDC coordinator must not become a permanent generic stream gateway.

## Architectural invariants

The implementation is valid only while all of these remain true:

1. **Partition/source authority is unchanged.** A relay never originates authoritative stream items.
2. **No new durable state exists.** Relay indexes and attach capabilities die with active streams/restarts.
3. **No cache semantics exist.** The feature does not retain a stream after normal transport/live-query buffering would otherwise release it.
4. **Direct streaming remains the correctness path.** Every inability to prove relay safety falls back to it.
5. **Topology is advisory for optimization.** Group membership does not grant data authority.
6. **Authorization is not weakened by sharing.** Exact query identity is insufficient without compatible security scope.
7. **Cursor compatibility is proved, not assumed.** A relay must already be able to serve the requested point.
8. **V1 has one redirect hop.** Relays do not redirect to relays.
9. **A failed redirect cannot loop.** Recovery consumes the relay attempt or otherwise forces direct authoritative service for that retry.
10. **Requester locality is trusted topology data.** An arbitrary client cannot self-declare a latency group and thereby select relay routing.
11. **Backpressure is bounded per downstream.** A slow subscriber cannot turn a shared live stream into an unbounded buffer or global stall.
12. **Existing delivery semantics win.** Ordering, retry, duplicate, epoch, and resume behavior stay owned by the underlying stream protocol.

## Ownership

### Existing source stream owner

The concrete source/live-query owner is intentionally not named here until implementation slice S0 maps the current code path. That owner should own:

- deriving canonical stream identity from an already-authorized subscription;
- observing active outbound stream instances;
- indexing eligible active relay candidates by stream identity and downstream latency group;
- deciding `direct` versus `redirect`;
- invalidating candidate entries when the corresponding active source stream is gone;
- exposing decision diagnostics.

This keeps relay eligibility adjacent to the component that already knows what the stream means and whether it is live.

### Existing topology owners

`LatencyGroupManager` answers group identity. `LatencyTreeService` / the existing latency graph may rank otherwise-valid relay candidates or determine that a cross-group redirect is worth considering.

They do not learn stream identity, authorization, cursors, or relay lifetime. Requester group/locality must come from the existing authenticated peer/ingress/transport topology context; external subscriber input is not authoritative topology evidence.

### Relay peer

The peer currently receiving the source stream owns only transient downstream fan-out for that active stream instance. It must:

- authenticate/validate an attach capability using the normal cluster security boundary;
- prove that the named active stream instance is still present;
- prove that the requested cursor/start is currently satisfiable;
- give each downstream bounded flow-control state;
- reject stale/incompatible attaches with a typed result that causes authoritative fallback;
- remove transient attach state on teardown.

### Subscriber

The subscriber follows the normal source route first. If it receives a redirect it may attempt one relay attach. Any failure returns to the normal source route with the redirect budget consumed (or an equivalent direct-only recovery marker), so that recovery attempt cannot simply receive the same redirect again. The subscriber does not search the cluster for relays itself.

## V1 stream identity

The first version should optimize only **exact-equivalent** streams.

Conceptually, not as a frozen API:

```text
StreamIdentity {
  authoritativeSourceOrPartition,
  normalizedPlanOrQueryHash,
  representationOrProtocolVersion,
  snapshotOrLiveMode,
  authorizationScopeFingerprint,
  otherOutputAffectingOptions
}
```

Cursor/start is not part of equality because two subscribers may ask for different positions in the same logical stream. It is a separate satisfiability check against the relay's currently available live/buffered window.

The security fingerprint must be supplied/owned by the authorization layer; this feature must not hash ad-hoc credential material or attempt to reconstruct policy equivalence. If policy version/revocation semantics affect the observable stream scope, that is part of the authorization layer's effective scope contract rather than something this feature infers from principal IDs.

Future designs may prove that one stream can safely satisfy another by query containment or relay-side filtering. V1 explicitly does not.

## Transient candidate index

The source stream owner needs a small, in-memory view of relay opportunities already created by normal streaming. Conceptually:

```text
ActiveRelayCandidate {
  streamIdentity,
  activeSourceStreamInstanceId,
  sourceEpochOrGeneration,
  relayPeerId,
  downstreamLatencyGroupId,
  currentlySatisfiableCursorWindow,
  healthAndCapacityState
}
```

This is **not a catalog**. It is derived from active runtime state and must be removable by normal stream teardown. It is not reconstructed after restart.

A candidate exists only when all of these hold:

- the peer is a reachable/authenticated Lagrange relay-capable endpoint;
- the peer is currently receiving that exact source stream instance;
- source and relay are in different latency groups (or equivalent existing topology evidence says the cross-group optimization is useful);
- the relay is in the requester's latency group for the new subscription, with that requester group derived from trusted existing topology context rather than client assertion;
- the candidate is healthy and below bounded fan-out/resource limits.

If multiple candidates are valid, the existing latency tree/graph and local health/load evidence may choose among them. The optimization does not need a permanent representative.

## Subscription algorithm

For an eligible subscription request:

1. Route the request to the normal authoritative/source stream owner.
2. Perform the existing authorization and subscription validation first.
3. Derive canonical `StreamIdentity` from the authorized request.
4. Resolve the requester's latency group from trusted existing peer/ingress/transport topology context. If it cannot be established, use the direct path.
5. If this request is already a recovery from a failed relay attach and its one-hop redirect budget is consumed (or it carries the equivalent direct-only marker), establish the normal direct stream.
6. Otherwise look for an active candidate keyed by exact stream identity and that downstream group.
7. Reject candidates whose source stream instance/epoch is stale, whose relay is unhealthy/capacity-limited, or whose currently available cursor window cannot satisfy the requested start/resume point.
8. If no candidate remains, establish the normal direct stream.
9. If a candidate remains and topology evidence says the redirect is useful, return an ephemeral relay redirect.
10. The subscriber attempts exactly one attach to the named relay.
11. The relay authenticates the attach, matches the active stream instance/epoch/security scope, and rechecks cursor satisfiability/capacity.
12. On success, attach a bounded downstream to the already-active stream.
13. On any stale/unavailable/incompatible/error result, retry through the normal authoritative path with the relay attempt consumed/direct-only for that recovery attempt.

The optimization should be safe even when candidate lookup races with stream teardown. The relay's attach-time validation is authoritative for whether the ephemeral opportunity still exists.

### Cold-start concurrency boundary

Candidate discovery begins from a stream that already exists. Therefore simultaneous first subscriptions can race:

```text
B1 -> source   no candidate yet -> direct stream 1
B2 -> source   no candidate yet -> direct stream 2
```

V1 accepts this. It does not add an in-flight stream coalescer or distributed/single-flight lock just to guarantee one initial crossing. Once one eligible active stream has been registered, later compatible subscriptions may collapse onto it. If measurements later show the cold-start race matters materially, source-side in-flight coalescing should be specified separately because it has different concurrency and cancellation semantics.

## Redirect contract

The exact wire shape should be designed beside the existing subscription handshake during S2/S3. It conceptually needs enough information to name a capability-scoped active stream rather than a durable location:

```text
EphemeralRelayRedirect {
  relayPeerOrEndpoint,
  activeSourceStreamInstanceId,
  sourceEpochOrGeneration,
  authorizedAttachCapabilityOrEquivalent,
  requestedOrResumeCursor,
  hopBudget: 1,
  validityBoundOrExistingLivenessToken
}
```

Important properties:

- It says **"this active stream can currently be attached here"**, never "this peer owns this data".
- It must be safe for the relay to reject after issuance.
- Failure of that attach must lead to a source retry that cannot simply be redirected again on the same recovery attempt.
- It must not require writing metadata when created, accepted, expired, or rejected.
- It must not expose raw credentials or sensitive query text just to identify the stream.
- A typed stale/unavailable response is normal control flow, not an exceptional cluster-repair event.

If the current transport already has a capability/session token suitable for this, reuse it rather than adding another token family.

## Joining after the stream has started

A later subscriber can attach only at a position the relay can already satisfy.

Examples:

```text
active stream at relay:  cursor 100 ... 180 (current)
new request:             cursor 170 ...
=> eligible if the existing stream machinery still exposes 170
```

```text
active stream at relay:  cursor 160 ... 180 (current)
new request:             cursor 120 ...
=> not eligible; use authoritative/direct resume path
```

The implementation must not retain cursor 120 solely to improve future relay eligibility. If existing bounded transport/live-query replay state happens to satisfy it, it may be used; otherwise the optimization misses.

For a stream type that cannot safely attach a downstream after start, that stream type is simply not relay-eligible until it gains an explicit, independently useful attach/resume contract.

## Failure and recovery

### Redirect races

A redirect can be stale before the subscriber reaches the relay. The relay returns a typed stale/unavailable result; the subscriber returns to authoritative routing with the redirect attempt consumed/direct-only for that recovery attempt. There is no election or invalidation protocol, and the source cannot repeatedly bounce that recovery request back to the same stale opportunity.

### Relay failure after attach

The subscriber uses the underlying stream's existing last-acknowledged cursor/sequence semantics to resume through the source route. If the direct path permits duplicates around reconnect, the relayed path may have the same duplicates; it must not quietly claim stronger semantics.

### Source epoch/generation changes

The redirect binds to one active source stream instance and, where present, its source epoch/generation. A relay must reject attaches for an obsolete instance. Existing authoritative routing determines the new source/epoch.

### Topology changes

Existing attached streams need not migrate just because the graph changes. Future subscription decisions use the newer topology evidence. Correctness is independent of optimization quality.

## Backpressure and resource isolation

Sharing an upstream changes the failure shape: a naive relay can let one slow subscriber stall everyone or accumulate unlimited queued data. Therefore v1 is gated on bounded per-downstream flow control.

The preferred implementation is to reuse the current stream transport's existing per-subscriber queue/window/cancellation primitive. Each downstream independently advances or is disconnected according to the existing bounded policy; one stalled downstream cannot stop healthy downstreams indefinitely.

If no such primitive exists in the source/transport path, S0 must expose that as a prerequisite. Add the smallest generally useful transport-level bounded fan-out primitive first. Do **not** solve slow consumers by adding retained replay/cache storage to this feature.

Relay candidate selection also needs bounded subscriber/capacity limits. A fully loaded relay is simply not a candidate; the source may choose another already-active valid candidate or stream directly.

## Relationship to grouped CDC propagation

Current topology-aware CDC code provides two useful precedents:

1. latency groups can reduce cross-group duplicate delivery;
2. missing/insufficient topology can conservatively fall back to direct targets.

But the ownership models differ:

```text
CDC grouped propagation:
  CDC delivery owner -> group coordinator -> group-local recipients

Ephemeral stream relay:
  source stream owner -> peer already receiving this exact active stream
                    then peer -> additional compatible subscriber(s)
```

The relay design therefore reuses **group identity, topology evidence, fallback style, and test ideas**, not the CDC coordinator role itself.

## Implementation plan

The slices are intentionally ordered so each risky semantic assumption is proved before the redirect path becomes live.

### S0 — Map and freeze the existing stream contract

Before code changes, identify the concrete owner(s) for the first target stream type, expected to be the partition-backed live-query/subscription path. Record in the implementation issue/quest:

- request/subscription handshake and routing owner;
- normalized query/plan representation;
- authorization decision point and stable security-scope representation, including policy-change/revocation behavior relevant to an active stream;
- source stream instance/epoch semantics;
- cursor, acknowledgement, resume, retry, and duplicate guarantees;
- current buffering/backpressure and cancellation owner;
- endpoint identity/reachability rules for Lagrange peers;
- trusted source of requester latency-group identity.

Gate: do not introduce a relay registry or redirect wire shape until these are explicit. If bounded per-downstream fan-out is absent, make that a prerequisite slice rather than hiding new buffering inside the relay.

### S1 — Canonical exact stream identity

Add a side-effect-free identity function at the existing stream owner boundary.

Proofs:

- output-affecting query/plan changes produce different identities;
- different authorization/security scopes do not collide;
- semantically irrelevant request/session details do not prevent exact sharing where the underlying stream is identical;
- raw credentials/query payloads are not exposed in metrics/logs.

Keep the identity internal to the stream owner; topology code does not learn it.

### S2 — Observe active relay-capable outbound streams

Teach the source stream owner to derive an ephemeral candidate entry when an eligible stream is already being delivered to a relay-capable Lagrange peer in another latency group.

Candidate registration/removal must follow the existing stream lifecycle. No durable writes.

Proofs:

- first stream behaves exactly as today;
- candidate appears only while the active stream exists;
- teardown/restart removes it without cleanup;
- arbitrary external clients never become candidates;
- requester group is derived from trusted existing topology context;
- topology unavailable/unknown produces no unsafe candidate choice;
- concurrent cold-start requests are allowed to create more than one direct stream before a candidate is observable.

### S3 — Optional one-hop redirect response

Extend the existing subscription handshake with an optional ephemeral relay result. Do not invent a second top-level subscription API.

The source may return redirect only after normal authorization and exact-identity/cursor/topology/capacity checks.

Proofs:

- feature disabled/no candidate => byte/behavior-equivalent normal direct path as far as the public contract requires;
- relay redirects carry a one-hop budget and bind to one active stream instance/epoch;
- relays cannot issue a second redirect in v1;
- a failed relay attach consumes that recovery attempt's redirect budget or sets an equivalent direct-only marker;
- stale redirect can be rejected without repair and cannot create a redirect/fallback loop.

### S4 — Relay attach and authoritative fallback

Add attach handling to the relay-capable Lagrange stream endpoint using existing cluster authentication/session mechanisms.

Proofs:

- exact active stream + authorized scope + satisfiable cursor attaches;
- wrong stream instance/epoch/security scope/cursor returns typed incompatible/stale/unavailable;
- attach race with teardown falls back cleanly;
- failed attach retries source without being immediately re-redirected on the same recovery attempt;
- midstream relay loss resumes through the normal source route with documented cursor/duplicate semantics.

### S5 — Topology-aware candidate selection

Use existing latency-group identity to require the relay to be on the useful side of the boundary. Use `LatencyTreeService` / current graph evidence to rank multiple valid candidates only if needed.

Proofs:

- two-group case chooses a same-downstream-group active peer and removes a later duplicate cross-group stream once an eligible candidate exists;
- requester locality cannot be selected by arbitrary client input;
- missing/stale topology falls back direct;
- topology movement changes optimization decisions, not correctness/authority;
- no permanent group gateway/coordinator role is created.

### S6 — Backpressure and bounded resource proof

Wire relay downstreams through existing bounded per-subscriber flow control, or land the minimal prerequisite primitive exposed by S0.

Proofs:

- one deliberately stalled subscriber does not stall healthy subscribers;
- queues/windows stay bounded;
- capacity limit causes direct fallback/alternate valid candidate rather than unbounded relay growth;
- cancellation releases downstream state promptly.

### S7 — Diagnostics and falsification counters

Expose safe diagnostics/counters for:

- direct vs redirect decisions;
- redirect accepted/rejected/stale/unavailable;
- reason class for ineligibility/fallback;
- active relay streams/downstreams;
- avoided duplicate cross-group streams;
- bytes direct/relayed/avoided where current accounting can measure this without invasive instrumentation.

Make it possible to prove that the optimization is helping rather than merely present.

### S8 — Multi-group integration harness

Build a deterministic integration/demo harness using the existing latency-group/topology test machinery.

Required scenarios are those in `requirements.md`, including:

- first subscriber uses the normal direct cross-group path;
- later exact-compatible subscribers collapse onto one already-active cross-group stream;
- concurrent cold-start subscribers before candidate registration are allowed to produce multiple initial direct streams, without deadlock or false diagnostics;
- query mismatch;
- authorization-scope mismatch;
- forged/self-declared requester group ignored/rejected;
- unsatisfied cursor;
- stale source epoch;
- failed relay attach followed by direct-only authoritative retry;
- relay failure and resume;
- topology uncertainty;
- slow subscriber;
- teardown/restart with zero durable relay state;
- feature-off A/B baseline.

A useful final assertion is not just request count but the actual cross-group stream count/bytes: after an eligible candidate is active, N later compatible subscribers in group B do not create additional equivalent source-to-B crossings for that active stream instance.

## Rollout and rollback

The safest rollout is opt-in for the first supported stream type and conservative by default. Reuse an existing feature/capability mechanism if the repository already has one; do not introduce a general configuration subsystem just for this work.

Rollback is simple by design: stop returning relay redirects. Existing authoritative/direct streaming remains available and no persisted relay state needs migration or cleanup.

## Deferred extensions

Only after the one-hop design is proven should later work consider:

- source-side single-flight/in-flight coalescing for the cold-start race;
- recursive relay trees across several latency-group boundaries;
- broader stream-type eligibility;
- semantic/query-subsumption sharing;
- planner-initiated pre-arranged fan-out;
- bandwidth/congestion metrics beyond the existing latency graph.

Each of those changes expands either the correctness surface or the topology/concurrency policy surface. None is required to prove the original narrow-gap property.

## Success criterion

The feature is successful when Lagrange can demonstrate the following without adding another core subsystem:

> When an exact, authorized live stream is already crossing a latency-group boundary to a Lagrange peer, later compatible subscribers on that side can branch from the active stream, so the same information need not cross that boundary again while the stream remains live.

If the relay opportunity disappears, the system behaves exactly like ordinary Lagrange streaming again.