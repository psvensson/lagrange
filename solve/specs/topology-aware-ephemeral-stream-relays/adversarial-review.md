# Topology-aware ephemeral stream relays — adversarial review

Review date: 2026-08-30

Verdict: **PASS WITH REQUIRED V1 CONSTRAINTS**

This is a fresh-pass design review performed after the requirements/design draft was written. The pass deliberately treats the proposal as hostile to Lagrange's existing ownership and transport invariants: the goal is to find ways a seemingly small redirect optimization could accidentally become a cache, new authority layer, delivery-semantics change, topology dependency, security bypass, or unbounded fan-out service.

The review uses the repository's verification guidance as its checklist, especially:

- `docs/steering/verification-templates/transport-delivery.md`;
- `docs/steering/verification-templates/concurrency-serialization.md`;
- `docs/steering/verification-templates/recovery-replay.md`;
- `docs/steering/verification-templates/owner-interaction.md`.

It also checks the existing topology implementation and grouped CDC propagation as architectural precedent. The review does **not** assume that CDC's latency-group coordinator is suitable as the generic stream relay.

## Result in one sentence

The mechanism can remain a small, correctness-optional extension of the existing stream path **if** v1 is exact-match, one-hop, source-authorized, cursor-safe, bounded, non-retaining, and guaranteed to fall back to a direct retry without being redirected into a loop.

## Findings

| ID | Severity | Attack / failure mode | Consequence if ignored | Required constraint | Disposition |
| --- | --- | --- | --- | --- | --- |
| F-01 | Blocker | Relay attach fails; subscriber retries source; source offers the same stale relay again | Infinite redirect/fallback loop | A retry after a failed relay attempt must consume the redirect budget / request direct service (or at minimum exclude the failed relay) for that recovery attempt | Required in v1 |
| F-02 | High | Two or more cold subscriptions race before the first cross-group stream is established and registered | More than one initial boundary crossing despite the feature | V1 must explicitly promise collapse only after an eligible active stream exists; do not add single-flight coordination secretly | Accepted v1 limitation |
| F-03 | Blocker | Same query/partition but different effective authorization scope shares a stream | Cross-tenant / row-policy data leak | Exact stream identity includes authorization-owned effective security scope; normal authorization happens before redirect and attach is capability/session bound | Required in v1 |
| F-04 | High | Redirect capability is stolen/replayed by another client/session | Unauthorized attachment or resource amplification | Redirect/attach authority must be short-lived or otherwise stale-safe and bound to relay + active stream + authorized subscriber/session/scope using existing security primitives where possible | Required in v1 |
| F-05 | Blocker | New live-query subscriber requires initial snapshot/history that the active relay no longer has | Missing rows/events or temptation to add an implicit cache | Redirect only when existing live/bounded stream state can satisfy requested start; otherwise direct source. No retention added for hit rate | Required in v1 |
| F-06 | Blocker | Slow downstream shares one upstream and stalls the relay | Head-of-line blocking or unbounded memory | Per-downstream bounded flow control/cancellation is a prerequisite; if absent, implement/prove the minimal transport primitive first | Required in v1 |
| F-07 | High | Relay or source stream disappears between redirect issuance and attach | Stale route / partial session | Attach revalidates stream instance/epoch/cursor; typed stale/unavailable returns to direct authoritative path | Required in v1 |
| F-08 | High | Relay failure after data delivery and before acknowledgement | Duplicate/reordered delivery on recovery | Existing cursor/sequence/ack semantics remain authoritative; relay must not claim stronger exactly-once semantics | Required in v1 |
| F-09 | Blocker | Relays issue further redirects based on their local view | Redirect loops, recursive failure trees, hidden distributed control plane | Only the authoritative/source subscription owner redirects in v1; hop budget is one | Required in v1 |
| F-10 | High | Existing CDC latency-group coordinator is reused as a generic relay owner | Permanent gateway/hotspot and new hidden authority role | CDC grouped propagation is precedent only; relay is selected from peers already receiving the exact active stream | Required in v1 |
| F-11 | High | Relay state survives normal stream lifetime to make future redirects more likely | Cache/replay-store semantics and invalidation burden | Candidate/attach state is transient and lifecycle-bound; restart requires no reconstruction | Required in v1 |
| F-12 | High | Requester self-asserts latency-group identity or untrusted network location | Topology spoofing / inappropriate redirect exposure | Requester group must come from trusted existing cluster/transport topology context, not arbitrary client input | Required in v1 |
| F-13 | High | Dynamic authorization policy changes while an older shared stream remains active | A newly authorized/changed subscriber attaches to output computed under incompatible policy context | Security identity must represent the authorization layer's effective stream scope/version as needed; policy-revocation behavior remains owned by the underlying stream/security contract | Required in v1 |
| F-14 | Medium | Relay accumulates many downstreams because it is the first peer in a group | Hotspot / memory or socket exhaustion | Health/capacity/subscriber limits gate eligibility; direct streaming is always allowed | Required in v1 |
| F-15 | Medium | Latency-group membership flaps or topology evidence is stale | Churn, bad optimization, or accidental correctness coupling | Topology is advisory; unknown/stale evidence means direct path; existing hysteresis is reused | Required in v1 |
| F-16 | Medium | Arbitrary external client is chosen because it is already receiving the stream | NAT/reachability/trust failures and client-as-infrastructure semantics | Only authenticated relay-capable Lagrange peers/endpoints are candidates | Required in v1 |
| F-17 | Medium | Stream identity omits representation/projection/output-affecting option | Semantically different subscribers share bytes | Exact canonical identity must cover every output-affecting option for the first supported stream type | Required in v1 |
| F-18 | Medium | Source's active-candidate registry is treated as a catalog needing convergence | New metadata/distributed-state owner | Registry is a local derived view of active runtime streams; misses cause direct service, not repair | Required in v1 |

## Fresh-pass changes to the original shape

The review produced several constraints that are easy to miss if the feature is described only as "redirect to an already-streaming peer":

### 1. Recovery must consume the redirect attempt

One-hop redirect prevents relay-to-relay loops, but it does **not** by itself prevent this loop:

```text
subscriber -> source -> redirect B2
subscriber -> B2 -> stale
subscriber -> source -> redirect B2
...
```

Therefore a failed relay attach must cause an authoritative retry that cannot simply return the same redirect again. The cleanest implementation is a per-subscription redirect budget consumed by the first attempt, or an equivalent `direct-only` recovery marker owned by the existing handshake. This is a control-flow property, not durable state.

### 2. V1 does not solve the cold-start race

The proposed mechanism discovers an opportunity from an **already-active** cross-group stream. If N subscriptions arrive concurrently before the first candidate exists, more than one direct upstream may be created.

Eliminating that race would require source-side in-flight coalescing/single-flight semantics. That is a different mechanism and should not be smuggled into v1. Once the first eligible stream is active and registered, later subscriptions can collapse onto it.

### 3. Topology identity must be trusted, not client-declared

A source cannot safely accept an arbitrary "I am in latency group B" field from an external subscriber and use it as relay-routing authority. Requester group must be derived from the existing authenticated Lagrange peer/ingress/transport topology context. If the source cannot reliably place the requester, it streams directly.

### 4. Authorization equivalence is an authorization-layer concept

A principal ID or tenant ID alone may be insufficient when row-level policy, role changes, policy versions, or delegated scope affect stream contents. The relay feature should consume a stable authorization-owned effective scope/fingerprint/capability rather than inventing its own policy-equivalence function.

### 5. Some live-query semantics may be intrinsically ineligible

If a new subscription requires an initial snapshot that has already passed and the existing stream contract does not retain it, the active relay cannot satisfy the subscription. This is not a reason to add a cache. It is a normal optimization miss.

## Transport / delivery verification

### Framing and protocol ownership

The redirect should extend the existing subscription handshake rather than introduce a parallel transport. The underlying stream framing remains unchanged after attach.

Required proofs:

- direct response and relay response are explicitly distinguishable;
- malformed/unknown redirect response is rejected safely;
- attach binds to one active source-stream instance;
- failed attach consumes the redirect attempt for that recovery path;
- relay close/cancel reaches all relevant transient downstream state.

### Duplicate, ordering, retry

The relay must not define new delivery promises. Tests need to inject failure:

- immediately before a delivered item is acknowledged;
- immediately after acknowledgement;
- during attach;
- during source epoch/generation change.

The observed duplicates/order must stay within the direct stream's existing contract.

### Bounded buffering / backpressure

This is a hard implementation gate, not a performance nicety. A shared upstream creates correlated downstream pressure. Test one subscriber that stops reading while others continue and assert both bounded memory/queue state and progress of healthy subscribers.

## Concurrency / serialization verification

The active-candidate registry is derived local state and should be owned by the existing source stream lifecycle/serialization boundary where possible.

Races to falsify:

1. stream teardown vs candidate lookup;
2. relay capacity exhausted between source decision and attach;
3. source epoch changes between redirect and attach;
4. last subscriber cancellation while a new attach is arriving;
5. multiple simultaneous attaches to a candidate at its capacity limit.

The design is intentionally tolerant of stale observations: attach-time revalidation turns all of these into success or typed fallback rather than a distributed transaction.

## Recovery / replay verification

There is no new durable recovery boundary. That is a feature of the design.

After source/relay restart:

- no relay catalog is replayed;
- no cache is rebuilt;
- no invalidation runs;
- clients resume through the existing authoritative path;
- new candidates appear only when new normal active streams make them observable again.

A test should inspect durable/system state before and after use and prove that enabling the optimization created no durable relay assignment.

## Owner-interaction verification

The owner boundaries should remain:

```text
LatencyGroupManager / LatencyTreeService
    owns: topology/group evidence
    does not own: stream equivalence, auth, cursor, relay lifecycle

source stream owner
    owns: authorized stream identity, active-stream observation,
          redirect/direct decision, fallback semantics

relay-capable stream endpoint
    owns: transient attach validation and bounded downstream fan-out

partition/data owner
    remains authoritative exactly as before

CDCGroupPropagationService
    remains CDC-specific; its coordinator is not promoted to generic relay owner
```

A code review should reject any implementation that puts query/auth/cursor knowledge into topology services or writes relay ownership into partition/placement metadata.

## Required pre-implementation gate

The proposal is not ready for runtime code until S0 identifies the actual first stream/live-query owner and records its existing behavior for:

- canonical plan/query identity;
- authorization scope and policy-change behavior;
- stream instance/source epoch;
- cursor/ack/resume and duplicate guarantees;
- bounded buffering/backpressure;
- cancellation/reconnect;
- peer endpoint/reachability identity.

This is deliberately a gate rather than an invitation to invent these semantics inside the new feature.

## Adversarial acceptance matrix

The implementation quest should include negative controls for at least:

| Scenario | Expected result |
| --- | --- |
| First eligible subscriber | Direct authoritative stream; candidate may become observable |
| Later exact subscriber in same downstream group | One-hop relay attach; no second equivalent boundary stream |
| Concurrent cold-start subscribers before candidate exists | Direct streams are allowed; no false one-crossing guarantee |
| Different query/projection/representation | Direct stream |
| Same query, different effective auth scope | Direct stream / attach denied |
| Forged/self-declared group identity | Ignored/rejected; trusted topology only |
| Cursor outside relay's existing window | Direct/resume path; no added retention |
| Stale redirect | Typed rejection, then direct-only authoritative retry |
| Relay fails midstream | Authoritative resume using existing cursor semantics |
| Source epoch changes | Stale attach rejected; normal source re-resolution |
| Slow downstream | Healthy downstreams progress; bounded queue/window |
| Relay at capacity | Alternative valid candidate or direct path |
| Topology unavailable | Direct path |
| Relay/source restart | No durable recovery work; direct path until new candidate exists |
| Attempted second redirect hop | Rejected/not generated in v1 |
| Optimization disabled | Existing baseline behavior |

## Final verdict

Proceed with the roadmap/specification **without adding a new core subsystem**. The design is coherent with Lagrange's current topology direction provided the implementation keeps the relay as ephemeral stream state and satisfies the blockers above.

The strongest signal that the design has stayed small is rollback: disabling redirect issuance must leave ordinary authoritative streaming intact, with no persisted data to migrate, invalidate, elect, or repair.
