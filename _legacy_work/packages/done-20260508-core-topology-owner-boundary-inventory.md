# Core Topology Owner Boundary Inventory

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "core-topology-control-plane-rewrite",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "owner_boundary_inventory",
  "dominantReason": "topology_owner_boundary_inventory_required_before_runtime_extraction",
  "currentState": "Agent Beauvoir completed the pre-runtime owner-boundary inventory without runtime/source/test edits. The inventory maps boot, join, rejoin, partitioning, rebalancing, publication, projection, readiness, and harness observation to canonical membership, placement, operation, publication, and projection/readiness boundaries.",
  "nextAction": "Validate the inventory handoff, then start the boot/join/rejoin membership kernel package before runtime extraction.",
  "proof": [
    "npm run work:validate",
    "npm run work:context",
    "git diff --check -- work/packages/done-20260508-core-topology-owner-boundary-inventory.md .kiro/specs/core-topology-control-plane-rewrite/owner-boundary-inventory.md .kiro/specs/core-topology-control-plane-rewrite/design.md .kiro/specs/core-topology-control-plane-rewrite/tasks.md work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md work/sprints/current-blocker.json work/sprints/current-blocker.md"
  ],
  "touchedFiles": [
    "work/packages/done-20260508-core-topology-owner-boundary-inventory.md",
    ".kiro/specs/core-topology-control-plane-rewrite/owner-boundary-inventory.md",
    ".kiro/specs/core-topology-control-plane-rewrite/design.md",
    ".kiro/specs/core-topology-control-plane-rewrite/tasks.md",
    "work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-core-topology-rewrite-spec-and-roadmap-rebaseline.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The rewrite needs a precise inventory of existing boot, join, rejoin,
partitioning, rebalancing, publication, and readiness decision paths before any
runtime code changes begin.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, with the Core Topology
Control-Plane Rewrite sprint acting as the representative topology workflow,
failure-simulation, and production-guarantee track.

## In Scope

1. Map current call sites and persistence ownership to membership, placement,
   operation, publication, and projection/readiness boundaries.
2. Identify duplicated decision paths and forbidden reinterpretations.
3. Produce the smallest successor package sequence for runtime extraction.

## Out Of Scope

1. Runtime behavior changes.
2. User-facing partition or replica management APIs.
3. Pro or Enterprise-only behavior, operator flows, or control surfaces.

## Invariants

1. The inventory must preserve one semantic owner vocabulary for membership,
   placement, operation, publication, and projection/readiness.
2. The package must not perform runtime/source-code changes.
3. The setup package closure proof remains historical proof for the setup
   slice; this package only repairs the successor handoff.

## Hotspots

1. `src/bootstrap/`
2. `src/control-plane/`
3. `src/rebalancer/`
4. `test/distributed/harness/`
5. `.kiro/specs/core-topology-control-plane-rewrite/`

## Shared Boundary Contract

Semantic owner: `topology_control_plane`.

Canonical contract shape / vocabulary: membership, placement, operation,
publication, and projection/readiness boundaries.

Allowed consumers: boot, join, rejoin, partitioning, rebalancing, diagnostics,
admin, harness, and readiness surfaces.

Prohibited reinterpretations: consumers must not combine raw cache, SQL,
transport, phase, or timer evidence to recreate topology owner decisions
locally.

Primary diagnostics / proof surfaces: owner-boundary inventory, successor
package sequence, architecture spec, and later representative harness proof.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Euclid
      (`019e0887-8c7f-7191-8b03-b02f89262565`) reviewed
      `work/packages/done-20260508-core-topology-rewrite-spec-and-roadmap-rebaseline.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed: Agent Laplace
      (`019e0889-5132-79f0-b33b-2c5ccc9f338a`) fixed
      `work/packages/done-20260508-core-topology-rewrite-spec-and-roadmap-rebaseline.md`.

- [x] Implementation subagent recorded: Agent Beauvoir
      (`019e088c-7b3b-7432-9901-793d0f0b3e44`) implemented
      `work/packages/done-20260508-core-topology-owner-boundary-inventory.md`.

## Commit And Push Ledger

- Focused package commit: `34f320cf`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`

## Closure Status Note

Commit `34f320cf` remains the recorded focused implementation slice for the
owner-boundary inventory. Hypatia later found successor handoff metadata defects
before boot/join/rejoin implementation; those defects are repaired in the active
boot/join/rejoin package without changing this package's implementation commit.

## Owner Boundary Inventory

Inventory artifact:
`.kiro/specs/core-topology-control-plane-rewrite/owner-boundary-inventory.md`.

Runtime source and test files were read only. No runtime source or tests were
edited in this package.

### Path Mapping

1. Boot: membership boundary. `src/bootstrap/rejoin-hints.js` derives startup
   decisions from hints, durable `nodes` rows, peer probes, and incarnation
   fence evidence; these are membership inputs, not admission outcomes.
2. Join: membership boundary. `src/control-plane/membership-lifecycle-controller.js`
   maps fresh startup to `JOIN_ADMISSION` and emits a lifecycle summary for
   downstream publication/readiness.
3. Rejoin: membership boundary. Durable rejoin is selected in
   `src/bootstrap/rejoin-hints.js` and represented as `RESTART_REENTRY` by the
   membership lifecycle controller.
4. Partitioning: placement boundary. `src/rebalancer/move-planner.js`
   calculates replica target state and target nodes; it must emit placement
   intent and policy reasons only.
5. Rebalancing: placement plus operation boundaries. `UnifiedRebalancer` owns
   orchestration requests, `RebalanceCoordinator` owns coordinator rows, and
   `OperationWorkflowOwner` owns workflow retry/resume/timeout grammar.
6. Publication: publication boundary. `MembershipPublicationCoordinator`,
   publication row merge, and publication recovery gate own publication status,
   ACK evidence, freshness, and recovery gate state.
7. Projection/readiness: consumer boundary. `active-node-projection.js` and
   `ControlPlaneReadinessService` currently combine owner evidence into active
   node views and readiness/planning answers.

### Duplicated Decisions And Forbidden Reinterpretations

1. Boot/rejoin peer discovery and durable `nodes` reads must not be interpreted
   directly as active membership.
2. Active-node projection currently combines publication rows, readiness
   dimensions, runtime authority, transport, service rows, heartbeat freshness,
   ready leases, and liveness fallback. That combination must collapse behind
   one projection/readiness contract.
3. Rebalancer priority-recovery planning consumes planning snapshots and active
   node cohorts in sync and async variants; follow-on runtime work must keep one
   operation/readiness owner answer rather than caller-local reconstruction.
4. Deferred operation visibility and transition retries must remain operation
   owner outcomes, not cache-lag fallbacks in consumers.
5. Harness/reporting surfaces may format owner evidence, but must not classify
   readiness, admission, placement, publication, or operation truth from raw
   logs, probes, or timing evidence.

### Successor Sequence Update

The sequence needs one explicit boundary between publication and
projection/readiness:

1. Boot Join Rejoin Kernel.
2. Partitioning Rebalancing Kernel.
3. Publication Projection Boundary.
4. Projection Readiness Contract.
5. Legacy Path Deletion And Proof.

## Static Drift Ledger

Preflight:

- [x] No runtime/source-code files are in scope for this handoff repair.
- [x] Source files read only for inventory.
- [x] Tracker, spec, and package-status proof selected.

Closure:

- [x] `npm run work:validate`
- [x] `npm run work:context`
- [x] `git diff --check -- work/packages/done-20260508-core-topology-owner-boundary-inventory.md .kiro/specs/core-topology-control-plane-rewrite/owner-boundary-inventory.md .kiro/specs/core-topology-control-plane-rewrite/design.md .kiro/specs/core-topology-control-plane-rewrite/tasks.md work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md work/sprints/current-blocker.json work/sprints/current-blocker.md`

## Validation

1. `npm run work:validate`
2. `npm run work:context`
3. `git diff --check -- work/packages/done-20260508-core-topology-owner-boundary-inventory.md .kiro/specs/core-topology-control-plane-rewrite/owner-boundary-inventory.md .kiro/specs/core-topology-control-plane-rewrite/design.md .kiro/specs/core-topology-control-plane-rewrite/tasks.md work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md work/sprints/current-blocker.json work/sprints/current-blocker.md`
