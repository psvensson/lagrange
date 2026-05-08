# Core Topology Publication Projection Boundary

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "core-topology-control-plane-rewrite",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "publication_projection_boundary",
  "dominantReason": "publication_stream_required_before_projection_readiness_consumer_cutover",
  "currentState": "Placement and operation owner contracts are closed. Publication rows, ACK/freshness state, and recovery gate state still need one canonical publication stream before projection/readiness consumers can stop recombining raw owner evidence.",
  "nextAction": "Run the required review/fix/implementation subagent sequence, then implement the publication/projection owner boundary.",
  "proof": [
    "npm run work:context",
    "npm run work:validate",
    "git diff --check"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-core-topology-publication-projection-boundary.md",
    "work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-core-topology-partitioning-rebalancing-kernel.md"
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
- [ ] Implementation subagent recorded:

## Static Drift Ledger

Preflight:

- [x] Review the completed partitioning/rebalancing package before
      implementation starts.
- [x] Run fixes if the review finds them.
- [ ] Record the implementation subagent before runtime edits are made for this
      package.

Implementation:

- [ ] Runtime edits stay within the publication/projection boundary.
- [ ] Existing unrelated dirty files remain untouched.
- [ ] File-scoped literal, decision-boundary, and runtime-grammar guardrails
      pass for touched runtime files.

## Validation

1. `npm run work:context`
2. Focused publication/projection tests - pending.
3. File-scoped static guardrails - pending.
4. `npm run work:validate` - pending.
5. `git diff --check` - pending.
