# Core Topology Legacy Path Deletion And Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "core-topology-control-plane-rewrite",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "legacy_path_deletion_and_proof",
  "dominantReason": "legacy_shadow_paths_remain_after_projection_readiness_contract",
  "currentState": "Projection/readiness contract implementation is closed and pushed. Remaining work is to delete or structurally block superseded topology fallback paths, shadow vocabularies, and duplicate decision surfaces, then run the representative proof ladder.",
  "nextAction": "Run the required review/fix/implementation subagent sequence, then delete or structurally block legacy paths and run the representative proof ladder.",
  "proof": [
    "npm run work:context",
    "npm run work:validate",
    "git diff --check"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-core-topology-legacy-path-deletion-and-proof.md",
    "work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-core-topology-projection-readiness-contract.md"
}
-->

## Why

The rewrite is not complete until legacy fallback paths, shadow vocabularies,
and duplicate decision surfaces are deleted or structurally blocked.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, with the Core Topology
Control-Plane Rewrite sprint acting as the representative topology workflow,
failure-simulation, and production-guarantee track.

## In Scope

1. Delete superseded topology decision paths.
2. Add structural guards that prevent consumers from binding to transitional
   paths.
3. Run the representative proof ladder for Phase 0.1 gates.

## Out Of Scope

1. Phase 0.5 deployment or CLI work.
2. Pro or Enterprise control surfaces.

## Shared Boundary Contract

Semantic owner: `topology_control_plane`.

Canonical contract shape / vocabulary: only the membership owner,
placement/operation owners, publication boundary outcome, and
projection/readiness contract may define topology state transitions and
consumer readiness. Legacy consumers may observe those contracts, but must not
rebuild equivalent decisions from raw owner rows, cache freshness, transport,
timers, or duplicated status strings.

Allowed consumers: runtime readers, bootstrap readiness, diagnostics, admin,
harness, and tests that verify topology visibility.

Prohibited reinterpretations: no consumer may infer membership, placement,
operation readiness, publication closure, recovery gate state, serve
eligibility, repair eligibility, or routability outside the canonical owner
contracts.

Primary diagnostics / proof surfaces: focused structural guards for deleted
paths, canonical readiness/publication consumer tests, affected admin/harness
diagnostic tests, file-scoped static guardrails, work validation, and the
representative Phase 0.1 proof ladder.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending review of
      `work/packages/done-20260508-core-topology-projection-readiness-contract.md`.
- [ ] Fix subagent recorded or explicitly not needed: pending review result.
- [ ] Implementation subagent recorded: pending clean review/fix ledger.

## Static Drift Ledger

Preflight:

- [ ] Review the completed projection/readiness package before implementation
      starts.
- [ ] Run fixes if the review finds them.
- [ ] Record the implementation subagent before runtime edits are made for this
      package.

Implementation:

- [ ] Runtime edits stay within the legacy path deletion/proof boundary.
- [ ] Existing unrelated dirty files remain untouched.
- [ ] Structural guardrails prove superseded paths cannot be rebound.
- [ ] File-scoped literal, decision-boundary, and runtime-grammar guardrails
      pass for touched runtime files.
- [ ] LLM-backed file guideline guard is run or recorded as blocked by the
      repository-local API key before closure.
