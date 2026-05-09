# Spec-Led Runtime Modularization Publication Owner Stream Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "none",
  "playback": "none",
  "owner": "publication_owner",
  "boundary": "revisioned_publication_stream",
  "dominantReason": "publication_consumers_can_still_infer_freshness_from_cache_presence",
  "currentState": "Publication logic has improved, but consumers and recovery gates can still depend on freshness, ACK, and merge interpretations that should belong to a revisioned publication stream contract.",
  "nextAction": "Define and implement a publication-owner stream contract with explicit revisions, ACK state, freshness fences, and recovery outcomes.",
  "proof": [
    "Focused publication coordinator tests",
    "Focused publication recovery gate tests",
    "Focused publication evidence merge tests",
    "Touched-file decision-boundary and literal guardrails"
  ],
  "touchedFiles": [
    "src/control-plane/membership-publication-coordinator*.js",
    "src/control-plane/control-plane-publication-merge.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-owner-*.js",
    "test/control-plane/*publication*.test.js",
    "work/packages/todo-20260509-spec-led-runtime-modularization-publication-owner-stream.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-placement-owner-kernel.md"
}
-->

## Why

Publication is the bridge between control-plane truth and consumer visibility.
The old failure mode is that freshness and ACK semantics leak into consumers as
cache-presence or merge heuristics. This package gives publication one
revisioned stream contract that downstream readiness and diagnostics can trust.

## Scope Basis

Spec-led runtime modularization design and publication-scoped consistency
closure evidence.

## In Scope

1. Define publication evidence for desired topology revision, committed
   publication revision, subscriber ACKs, recovery gates, and freshness fences.
2. Emit stream states such as not-started, publishing, published, waiting-for-ack,
   stale, recovering, and failed with explicit reasons.
3. Rewrite publication recovery gates to consume the stream state.
4. Preserve existing publication guarantees while removing local freshness
   guesses.
5. Add tests for merge, ACK, stale, recovery, and consumer-lag behavior.

## Out Of Scope

1. Projection readiness consumer rewrite.
2. Operation owner logic.
3. Cluster-wide feature flags or edition-specific publication behavior.
4. Harness presentation cleanup beyond tests required for this contract.

## Invariants

1. Publication owner owns publication freshness and ACK state.
2. Consumers observe stream revisions; they do not infer freshness from cache
   presence.
3. Publication states use named variants.
4. Recovery gates are consumers of stream state, not competing owners.

## Tactical Inspiration

1. Raft/KRaft metadata controllers: ordered metadata revisions are the
   authority for consumers.
2. etcd and Kubernetes watch APIs: consumers track resource versions and
   compaction/freshness boundaries.
3. Database CDC systems: publication streams expose durable position and lag,
   not best-effort cache observations.

## Hotspots

1. `src/control-plane/membership-publication-coordinator*.js`
2. `src/control-plane/control-plane-publication-merge.js`
3. `src/control-plane/publication-recovery-gate.js`
4. `src/control-plane/publication-recovery-evidence.js`
5. `test/control-plane/*publication*.test.js`
6. `test/distributed/harness/publication-evidence-*.js`

## Shared Boundary Contract

Semantic owner: `publication_owner`.

Canonical contract shape / vocabulary: publication revision, desired revision,
subscriber ACK state, freshness fence, recovery gate state, stream outcome, and
reason list.

Allowed consumers: projection/readiness owner, diagnostics, publication
recovery gate, analyzers, and publication tests.

Prohibited reinterpretations: consumers cannot derive publication freshness from
cache row presence, admin reachability, pending ACK count alone, or startup
active-gate symptoms.

Primary diagnostics / proof surfaces: publication coordinator tests,
publication recovery gate tests, publication evidence merge tests, and static
guardrails.

## Detection / Analysis Tasks

- [ ] Inventory publication freshness, ACK, and merge decisions.
- [ ] Map each decision to stream owner, recovery consumer, or deletion.
- [ ] Identify consumers that inspect publication internals.
- [ ] Identify old state names that need canonical aliases or deletion.

## Implementation Tasks

- [ ] Add publication owner constants, evidence, state, and decision modules.
- [ ] Add stream state output and freshness fence shape.
- [ ] Cut recovery gates to stream state.
- [ ] Update tests to assert stream revisions and ACK states.
- [ ] Remove consumer-side freshness guesses.

## Validation

1. Focused publication coordinator tests.
2. Focused publication recovery gate tests.
3. Focused publication evidence merge tests.
4. Touched-file decision-boundary and literal guardrails.

## Done When

1. Publication exposes a revisioned stream contract.
2. Consumers no longer infer publication freshness from raw cache signals.
3. Recovery gate decisions are traceable to publication-owner state.
