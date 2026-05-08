# Core Topology Projection Readiness Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "core-topology-control-plane-rewrite",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "projection_readiness_contract",
  "dominantReason": "projection_readiness_consumers_need_one_publication_derived_contract",
  "currentState": "Publication boundary outcomes are committed and pushed. Projection/readiness consumers still need one canonical contract so diagnostics, admin, harness, and runtime readers stop recombining raw topology owner evidence.",
  "nextAction": "Run the required review/fix/implementation subagent sequence, then cut the first projection/readiness consumers to the canonical publication-derived contract.",
  "proof": [
    "npm run work:context",
    "npm run work:validate",
    "git diff --check"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-core-topology-projection-readiness-contract.md",
    "work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-core-topology-publication-projection-boundary.md"
}
-->

## Why

Projection and readiness must become the single consumer contract for topology
visibility instead of allowing diagnostics, admin, harness, and runtime readers
to recombine raw owner evidence.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, with the Core Topology
Control-Plane Rewrite sprint acting as the representative topology workflow,
failure-simulation, and production-guarantee track.

## In Scope

1. Define the canonical projection snapshot and revision stream.
2. Define internal, repair, and serve readiness states.
3. Cut diagnostics, admin, harness, and runtime readers over to the shared
   projection/readiness contract.

## Out Of Scope

1. New user-facing topology management concepts.
2. Owner mutation logic outside projection publication.

## Shared Boundary Contract

Semantic owner: `topology_control_plane`.

Canonical contract shape / vocabulary: projection/readiness snapshots derived
from publication boundary outcomes, node participation, and readiness lanes.
Consumers may observe internal, repair, and serve decisions, but must not
recreate those decisions from raw membership, placement, operation,
publication, cache, transport, or timer evidence.

Allowed consumers: projection/readiness runtime readers, bootstrap readiness,
diagnostics, admin, harness, and tests that verify topology visibility.

Prohibited reinterpretations: projection/readiness paths must not infer
readiness, routability, repair eligibility, serve eligibility, active
membership, or recovery gate closure outside the canonical projection/readiness
contract.

Primary diagnostics / proof surfaces: focused projection/readiness contract
tests, existing canonical readiness consumer tests, file-scoped static
guardrails, work validation, and the successor legacy-path deletion proof
ladder.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending review of
      `work/packages/done-20260508-core-topology-publication-projection-boundary.md`.
- [ ] Fix subagent recorded or explicitly not needed: pending review result.
- [ ] Implementation subagent recorded: pending clean review/fix ledger.

## Static Drift Ledger

Preflight:

- [ ] Review the completed publication/projection package before
      implementation starts.
- [ ] Run fixes if the review finds them.
- [ ] Record the implementation subagent before runtime edits are made for this
      package.

Implementation:

- [ ] Runtime edits stay within the projection/readiness boundary.
- [ ] Existing unrelated dirty files remain untouched.
- [ ] File-scoped literal, decision-boundary, and runtime-grammar guardrails
      pass for touched runtime files.
- [ ] LLM-backed file guideline guard is run or recorded as blocked by the
      repository-local API key before closure.
