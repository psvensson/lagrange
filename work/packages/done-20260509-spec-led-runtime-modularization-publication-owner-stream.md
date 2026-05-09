# Spec-Led Runtime Modularization Publication Owner Stream Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
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
    "src/control-plane/control-plane-publication-merge.js",
    "src/control-plane/membership-publication-coordinator-class-stage-1.js",
    "src/control-plane/membership-publication-coordinator-stage-2.js",
    "src/control-plane/publication-owner-constants.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/control-plane-publication-merge.test.js",
    "test/control-plane/membership-publication-coordinator.test.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "work/packages/done-20260509-spec-led-runtime-modularization-publication-owner-stream.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-placement-owner-kernel.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true
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

- [x] Inventory publication freshness, ACK, and merge decisions.
- [x] Map each decision to stream owner, recovery consumer, or deletion.
- [x] Identify consumers that inspect publication internals.
- [x] Identify old state names that need canonical aliases or deletion.

## Implementation Tasks

- [x] Add publication owner constants, evidence, state, and decision modules.
- [x] Add stream state output and freshness fence shape.
- [x] Cut recovery gates to stream state.
- [x] Update tests to assert stream revisions and ACK states.
- [x] Remove consumer-side freshness guesses.

## Implementation Notes

Inventory result:

1. `control-plane-publication-merge.js` owned publication row merging but also
   derived status directly from ACK coverage and row status.
2. `publication-recovery-gate.js` derived ACK, publication-pending, stale, and
   priority recovery gate states from raw counts, status strings, and recovery
   protocol hints.
3. `publication-recovery-evidence.js` merged top-level convergence, gate,
   priority observation, and active-gate evidence, then recomputed publication
   pending from raw counts and cache-observation fields.
4. Membership publication ACK paths exposed raw candidate ACK booleans without a
   canonical stream state.

Implemented owner stream contract:

1. Added `publication-owner-constants.js`, `publication-owner-evidence.js`,
   `publication-owner-decision.js`, and `publication-owner-state.js`.
2. The stream state now carries semantic owner, observed/desired/committed
   revisions, ACK state, pending ACK evidence state, freshness fence, recovery
   outcome, stream outcome, and owner reason codes.
3. Merge status derivation now routes through the publication owner merge
   decision while preserving same-revision ACK union behavior and newer-revision
   trim behavior.
4. Recovery gates now map their external gate state from
   `publicationOwnerStream` instead of reclassifying freshness from raw ACK
   counts or cache-style publication observations.
5. Canonical recovery evidence now carries `publicationOwnerStream` and derives
   `publicationPending`, `streamOutcome`, `ackState`, `freshnessFence`, and
   `recoveryOutcome` from that stream.
6. Membership ACK candidate and ACK write decisions now expose the owner stream
   ACK state alongside the existing compatibility booleans.

Compatibility retained:

1. Existing `pendingAckCount`, `pendingAckNodeIds`, `missingPublishedCount`,
   `publicationPending`, `ackPending`, and recovery gate `state` fields remain
   available for existing consumers.
2. A stale `ACK_PENDING` plus `publication_pending` protocol hint with an
   explicit empty required-ACK list still closes as ready; ACK-complete or
   ACK-not-required owner evidence wins over stale protocol hints.

## Validation

1. Focused publication coordinator tests.
2. Focused publication recovery gate tests.
3. Focused publication evidence merge tests.
4. Touched-file decision-boundary and literal guardrails.

Validation notes:

1. Pre-edit literal guardrail with handoff quoted glob failed before scanning:
   `ENOENT: src/control-plane/membership-publication-coordinator*.js`.
2. Pre-edit explicit-file literal guardrail passed: scanned 11 files, 0 new
   violations.
3. Pre-edit explicit-file decision-boundary guardrail passed: scanned 11 files,
   0 violations.
4. Pre-edit broad runtime grammar guardrail failed on inherited
   `src/control-plane/membership-publication-coordinator.js` export facade
   contract: 5 violations for missing split-stage fragments/functions.
5. Focused tests passed:
   `npx tap test/control-plane/publication-owner-stream.test.js test/control-plane/control-plane-publication-merge.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator.test.js`
   with 436 passing assertions.
6. ESLint passed for touched production and test files.
7. Post-edit explicit-file literal guardrail passed: scanned 15 files, 0 new
   violations, 0 inherited baseline violations.
8. Post-edit explicit-file decision-boundary guardrail passed: scanned 15
   files, 0 violations.
9. Post-edit touched-file runtime grammar passed for the 9 touched production
   files: 0 violations.
10. Post-edit broad runtime grammar using the package handoff file set still
    fails only on the inherited
    `src/control-plane/membership-publication-coordinator.js` export facade
    contract described above.
11. `git diff --check` passed for tracked touched files; `git diff --check
    --no-index /dev/null <file>` produced no whitespace warnings for new
    publication owner files and the new publication owner stream test.
12. `npm run work:validate` passed.
13. Parent rerun after ledger and touched-file correction:
    `npx tap test/control-plane/publication-owner-stream.test.js test/control-plane/control-plane-publication-merge.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator.test.js`
    passed with 436 assertions.
14. Parent rerun of explicit touched production guardrails passed: literals,
    decision boundaries, runtime grammar, ESLint, and `git diff --check`.
15. Parent rerun of `npm run work:dirty-scope -- --package work/packages/done-20260509-spec-led-runtime-modularization-publication-owner-stream.md`
    reported 14 package-owned dirty entries, 2 tracker-generated entries, and
    6 unrelated dirty entries.

## Done When

1. Publication exposes a revisioned stream contract.
2. Consumers no longer infer publication freshness from raw cache signals.
3. Recovery gate decisions are traceable to publication-owner state.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Ramanujan (`019e0bd8-dfda-76c1-abb0-f9c312c140be`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-placement-owner-kernel.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Newton (`019e0bdd-d124-7db3-ae0e-f470ec1661b3`) fixed `work/packages/done-20260509-spec-led-runtime-modularization-placement-owner-kernel.md`.
- [x] Implementation subagent recorded:
      Agent Copernicus (`019e0be4-5e40-7623-bc3c-db9341a4fd4b`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-publication-owner-stream.md`.

## Commit And Push Ledger

- Focused package commit: `0f15da41`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
