# Core Topology Publication Projection Boundary

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "core-topology-control-plane-rewrite",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "publication_projection_boundary",
  "dominantReason": "publication_stream_required_before_projection_readiness_consumer_cutover",
  "currentState": "publicationBoundaryOutcome implementation and focused proof are complete; this package is closed, committed, and pushed, and the projection/readiness contract successor is active.",
  "nextAction": "No action remains for this closed package; continue execution in the active projection/readiness contract successor.",
  "proof": [
    "npm run work:context",
    "npm run work:validate",
    "git diff --check"
  ],
  "touchedFiles": [
    "work/packages/done-20260508-core-topology-publication-projection-boundary.md",
    "src/control-plane/recovery-protocol-snapshot.js",
    "src/control-plane/control-plane-readiness-service-segment-4-stage-2.js",
    "src/control-plane/control-plane-publication-story.js",
    "test/control-plane/recovery-protocol-snapshot.test.js",
    "test/control-plane/unpublished-recovery-protocol-snapshot.test.js",
    "test/control-plane/control-plane-readiness-service.test-part-2.js",
    "work/model-ledger.jsonl"
  ],
  "predecessor": "work/packages/done-20260508-core-topology-partitioning-rebalancing-kernel.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Publication must become the only stream that projection/readiness consumes for
topology visibility. Runtime, diagnostics, admin, and harness code should not
rebuild ACK, freshness, or recovery gate state from raw membership, placement,
operation, cache, or timer evidence.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, with the Core Topology
Control-Plane Rewrite sprint acting as the representative topology workflow,
failure-simulation, and production-guarantee track.

## In Scope

1. Define the canonical publication row, ACK/freshness, and recovery gate
   vocabulary.
2. Identify and cut the first publication/projection consumers that currently
   recombine raw owner evidence.
3. Add proof that projection/readiness reads the canonical publication stream
   rather than local shadow state for the selected boundary.

## Out Of Scope

1. Projection/readiness consumer cutover that belongs in the successor package.
2. Placement or operation owner mutation changes.
3. Pro or Enterprise-only behavior, operator flows, or control surfaces.

## Shared Boundary Contract

Semantic owner: `topology_control_plane`.

Canonical contract shape / vocabulary: publication rows and publication-derived
ACK, freshness, and recovery gate outcomes that projection/readiness consumers
may observe but not recreate from raw membership, placement, operation, cache,
transport, phase, or timer evidence.

Allowed consumers: projection/readiness runtime readers, bootstrap readiness,
diagnostics, admin, harness, and tests that verify published topology state.

Prohibited reinterpretations: publication/projection paths must not infer
freshness, ACK completeness, recovery gate closure, active membership, or
control-plane readiness from raw owner tables, service rows, cache freshness,
transport reachability, or timeout text outside the canonical publication
boundary.

Primary diagnostics / proof surfaces: focused publication/projection contract
tests, existing topology publication convergence tests, file-scoped static
guardrails, work validation, and the successor readiness proof ladder.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Godel
      (`019e08ca-f041-7cf0-8ca6-1af2425cd59c`) reviewed
      `work/packages/done-20260508-core-topology-partitioning-rebalancing-kernel.md`;
      result `clean`.
- [x] Fix subagent recorded or explicitly not needed: `not-needed`.
- [x] Implementation subagent recorded: Agent Rawls
      (`019e08ce-72e4-7322-88a2-c4c6e05f67c6`) implemented
      `work/packages/done-20260508-core-topology-publication-projection-boundary.md`.

## Commit And Push Ledger

- Focused package commit: `88115c7a`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`

## Static Drift Ledger

Preflight:

- [x] Review the completed partitioning/rebalancing package before
      implementation starts.
- [x] Run fixes if the review finds them.
- [x] Record the implementation subagent before runtime edits are made for this
      package.

Implementation:

- [x] Runtime edits stay within the publication/projection boundary.
- [x] Existing unrelated dirty files remain untouched.
- [x] File-scoped literal, decision-boundary, and runtime-grammar guardrails
      pass for touched runtime files.
- [x] LLM-backed file guideline guard attempted for touched runtime files;
      blocked by repository-local invalid API key before producing file
      findings.

## Implementation Proof

- Added `publicationBoundaryOutcome` to the publication recovery protocol
  snapshot as the canonical publication/projection outcome for publication row
  state, ACK state, publication freshness, recovery gate state, readiness, and
  reason codes.
- Threaded `publicationBoundaryOutcome` through membership publication
  diagnostics and the control-plane publication story so diagnostics consumers
  can read one owner outcome instead of recombining row, ACK, freshness, and
  recovery-gate fields.
- Did not cut over successor projection/readiness consumers beyond the bounded
  diagnostics/story proof for this package.
- Touched runtime files:
  - `src/control-plane/recovery-protocol-snapshot.js`
  - `src/control-plane/control-plane-readiness-service-segment-4-stage-2.js`
  - `src/control-plane/control-plane-publication-story.js`
- Touched tests:
  - `test/control-plane/recovery-protocol-snapshot.test.js`
  - `test/control-plane/unpublished-recovery-protocol-snapshot.test.js`
  - `test/control-plane/control-plane-readiness-service.test-part-2.js`
- Recorded package experience with `npm run work:model-ledger -- record ...`.

## Validation

1. `npm run work:context`
2. Focused publication/projection tests:
   - `node --test test/control-plane/recovery-protocol-snapshot.test.js test/control-plane/unpublished-recovery-protocol-snapshot.test.js`
     - pass, 14 assertions.
   - `node --test test/control-plane/control-plane-readiness-service.test-part-2.js`
     - pass, 48 assertions.
   - `node --test test/control-plane/control-plane-publication-merge.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/canonical-readiness-consumption.test.js`
     - pass, 118 assertions.
3. File-scoped static guardrails:
   - `npm run audit:guideline:literals -- src/control-plane/recovery-protocol-snapshot.js src/control-plane/control-plane-readiness-service-segment-4-stage-2.js src/control-plane/control-plane-publication-story.js`
     - pass.
   - `npm run audit:guideline:decision-boundaries -- src/control-plane/recovery-protocol-snapshot.js src/control-plane/control-plane-readiness-service-segment-4-stage-2.js src/control-plane/control-plane-publication-story.js`
     - pass.
   - `npm run audit:runtime-grammar:file -- src/control-plane/recovery-protocol-snapshot.js src/control-plane/control-plane-readiness-service-segment-4-stage-2.js src/control-plane/control-plane-publication-story.js`
     - pass.
   - `npm run guard:guidelines:file -- <each touched runtime file>`
     - blocked by LLM API 401 invalid API key before producing file findings.
4. `npm run work:validate` - pass.
5. `git diff --check` - pass.

## Residual Blockers

- LLM-backed `guard:guidelines:file` cannot complete with the configured API
  key; each touched runtime file returns `invalid_api_key` from the LLM API.
