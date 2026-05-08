# Core Topology Rewrite Spec And Roadmap Rebaseline

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "core-topology-control-plane-rewrite",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "spec_and_roadmap_rebaseline",
  "dominantReason": "phase_0_1_representative_track_rebaseline",
  "currentState": "The Core Topology Control-Plane Rewrite sprint is being established as the active Phase 0.1 representative track. This package performs setup only: archive stale root work items, create the idea, sprint, package queue, architecture spec, roadmap rebaseline, and current-blocker handoff without runtime/source-code changes.",
  "nextAction": "Validate the setup package, keep it active until a focused commit and push records closure proof, then start the owner-boundary inventory successor.",
  "proof": [
    "npm run work:validate",
    "npm run work:context",
    "git diff --check -- work/ideas work/packages work/sprints .kiro/specs/core-topology-control-plane-rewrite roadmap.md"
  ],
  "touchedFiles": [
    "work/ideas/idea-20260508-core-topology-rewrite.md",
    "work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/packages/done-20260508-core-topology-rewrite-spec-and-roadmap-rebaseline.md",
    "work/packages/done-20260508-core-topology-owner-boundary-inventory.md",
    "work/packages/done-20260508-core-topology-boot-join-rejoin-kernel.md",
    "work/packages/active-20260508-core-topology-partitioning-rebalancing-kernel.md",
    "work/packages/todo-20260508-core-topology-projection-readiness-contract.md",
    "work/packages/todo-20260508-core-topology-legacy-path-deletion-and-proof.md",
    ".kiro/specs/core-topology-control-plane-rewrite/requirements.md",
    ".kiro/specs/core-topology-control-plane-rewrite/design.md",
    ".kiro/specs/core-topology-control-plane-rewrite/tasks.md",
    "roadmap.md"
  ],
  "predecessor": null,
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Phase 0.1 representative closure has accumulated many root-level historical
packages and active/todo sprint files while the actual blocker keeps migrating
across topology control-plane boundaries. The first package establishes a
single rewrite track before runtime work starts.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, with the rewrite sprint becoming the
current representative track for topology workflow stabilization, failure
simulations, and production guarantees.

## In Scope

1. Archive non-rewrite root-level package files into `work/packages/archived/`.
2. Archive old root-level active/todo sprint files into `work/sprints/archived/`.
3. Create the core topology rewrite idea, active sprint, and package queue.
4. Create architecture spec documents under
   `.kiro/specs/core-topology-control-plane-rewrite/`.
5. Rebaseline `roadmap.md` to name the rewrite sprint as the current Phase 0.1
   representative track.
6. Update current-blocker handoff to this active package.

## Out Of Scope

1. Runtime JavaScript or source-code changes.
2. Harness timeout changes.
3. Pro or Enterprise feature work.
4. Closing this package before commit and push proof exists.

## Shared Boundary Contract

Semantic owner: `topology_control_plane`.

Canonical contract shape / vocabulary: four mutation owners (`membership`,
`placement`, `operation`, `publication`) plus projection/readiness as the
consumer contract.

Allowed consumers: boot, join, rejoin, partitioning, rebalancing, diagnostics,
admin, harness, and readiness surfaces after the successor packages cut them
over.

Prohibited reinterpretations: consumers must not combine raw cache, SQL,
transport, phase, or timer evidence to recreate membership, placement,
operation, publication, projection, or readiness decisions locally.

Primary diagnostics / proof surfaces: architecture spec, package queue,
roadmap truth, current-blocker handoff, and later representative harness proof.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: `not-needed` (`first-package-in-sprint`).
- [x] Fix subagent recorded or explicitly not needed: `not-needed`.
- [x] Implementation subagent recorded: Agent Bernoulli
      (`019e0876-39cb-72f1-ac3a-ee61df59ab64`) implemented
      `work/packages/done-20260508-core-topology-rewrite-spec-and-roadmap-rebaseline.md`.

## Commit And Push Ledger

- Focused package commit: `485bed1a`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`

## Residual Closure Inventory

- [x] Root-level non-rewrite packages archived.
- [x] Root-level old active/todo sprint files archived.
- [x] Rewrite idea, active sprint, active package, and successor queue created.
- [x] Architecture spec documents created.
- [x] Roadmap Phase 0.1 rebaseline updated.
- [x] Current-blocker handoff points at this package.
- [x] Focused package commit created.
- [x] Focused package commit pushed.

## Static Drift Ledger

Preflight:

- [x] No runtime/source-code files are in scope.
- [x] Documentation and tracker proof selected.

Closure:

- [x] `npm run work:validate`
- [x] `npm run work:context`
- [x] `git diff --check -- work/ideas work/packages work/sprints .kiro/specs/core-topology-control-plane-rewrite roadmap.md`
- [x] Package-owned changes committed as one focused slice.
- [x] Slice commit pushed to the recorded remote/branch.

## Model Ledger

- [x] No model-ledger record required; this setup-only package produced no
      runtime implementation model-fit evidence.

## Validation

1. `npm run work:validate`
2. `npm run work:context`
3. `git diff --check -- work/ideas work/packages work/sprints .kiro/specs/core-topology-control-plane-rewrite roadmap.md`
