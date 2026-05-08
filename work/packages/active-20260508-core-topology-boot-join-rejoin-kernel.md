# Core Topology Boot Join Rejoin Kernel

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "core-topology-control-plane-rewrite",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "boot_join_rejoin_membership_kernel",
  "dominantReason": "boot_join_rejoin_membership_owner_required_before_runtime_extraction",
  "currentState": "Agent Dalton implemented the boot/join/rejoin membership owner outcome through rejoin hints, startup join decision, node joining, membership lifecycle, bootstrap admission, and durable rejoin registration boundaries. Focused owner-path tests, file-scoped guardrails, work validation, context refresh, and diff whitespace proof passed.",
  "nextAction": "Review the uncommitted package-owned diff and commit only this package slice when ready.",
  "proof": [
    "node --test test/control-plane/membership-lifecycle-controller.test.js",
    "node --test test/bootstrap/rejoin-hints.test.js",
    "node --test test/bootstrap/bootstrap-api-rejoin.test.js",
    "node --test test/bootstrap/node-registration-owner.test.js",
    "node --test test/bootstrap/node-joining-service.test-part-3.js",
    "node --test test/bootstrap/node-joining-service.test.js",
    "node --test test/entrypoint-runtime-helpers-join-decision.test.js",
    "node --test test/bootstrap/bootstrap-api.test-part-3.js",
    "node scripts/check-guideline-literals.js src/bootstrap/rejoin-hints-constants.js src/bootstrap/rejoin-hints.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/node-joining-service-shared.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/shared/node-registration-owner.js src/entrypoint-runtime-helpers.js src/index.js",
    "node scripts/check-guideline-decision-boundaries.js src/bootstrap/rejoin-hints-constants.js src/bootstrap/rejoin-hints.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/node-joining-service-shared.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/shared/node-registration-owner.js src/entrypoint-runtime-helpers.js src/index.js",
    "npm run audit:runtime-grammar:file -- src/bootstrap/rejoin-hints-constants.js src/bootstrap/rejoin-hints.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/node-joining-service-shared.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/shared/node-registration-owner.js src/entrypoint-runtime-helpers.js src/index.js",
    "npm run work:validate",
    "npm run work:context",
    "git diff --check -- src/bootstrap/rejoin-hints-constants.js src/bootstrap/rejoin-hints.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/node-joining-service-shared.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/shared/node-registration-owner.js src/entrypoint-runtime-helpers.js src/index.js test/control-plane/membership-lifecycle-controller.test.js test/bootstrap/rejoin-hints.test.js test/bootstrap/bootstrap-api-rejoin.test.js test/bootstrap/bootstrap-api.test-part-3.js test/entrypoint-runtime-helpers-join-decision.test.js work/packages/active-20260508-core-topology-boot-join-rejoin-kernel.md work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md work/sprints/current-blocker.json work/sprints/current-blocker.md .kiro/specs/core-topology-control-plane-rewrite/tasks.md"
  ],
  "touchedFiles": [
    "src/bootstrap/rejoin-hints-constants.js",
    "src/bootstrap/rejoin-hints.js",
    "src/control-plane/membership-lifecycle-controller.js",
    "src/bootstrap/node-joining-service-shared.js",
    "src/bootstrap/node-joining-service-segment-1.js",
    "src/bootstrap/node-joining-service-segment-2.js",
    "src/bootstrap/phases/contact-seed-phase.js",
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "src/bootstrap/owners/bootstrap-join-admission-owner.js",
    "src/bootstrap/shared/node-registration-owner.js",
    "src/entrypoint-runtime-helpers.js",
    "src/index.js",
    "test/control-plane/membership-lifecycle-controller.test.js",
    "test/bootstrap/rejoin-hints.test.js",
    "test/bootstrap/bootstrap-api-rejoin.test.js",
    "test/bootstrap/bootstrap-api.test-part-3.js",
    "test/entrypoint-runtime-helpers-join-decision.test.js",
    "work/packages/active-20260508-core-topology-boot-join-rejoin-kernel.md",
    "work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    ".kiro/specs/core-topology-control-plane-rewrite/tasks.md"
  ],
  "predecessor": "work/packages/done-20260508-core-topology-owner-boundary-inventory.md"
}
-->

## Why

Boot, join, and rejoin must converge through one membership owner contract
instead of phase-local state, seed contact fallbacks, or readiness-side repair.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, with the Core Topology
Control-Plane Rewrite sprint acting as the representative topology workflow,
failure-simulation, and production-guarantee track.

## In Scope

1. Define and implement the membership owner transition model.
2. Cut boot, join, and rejoin consumers over to the owner contract.
3. Preserve restart and rejoin durability without cache-derived promotion.

## Out Of Scope

1. Placement or rebalancing policy changes beyond membership handoff inputs.
2. Publication, projection, and readiness contract rewrites.
3. Pro or Enterprise-only behavior, operator flows, or control surfaces.

## Shared Boundary Contract

Semantic owner: `topology_control_plane`.

Canonical contract shape / vocabulary: boot, join, and rejoin membership owner
outcomes that downstream placement, publication, projection, readiness, and
harness consumers may observe but not recreate from raw peer, SQL, cache,
transport, phase, or timer evidence.

Allowed consumers: bootstrap, membership lifecycle, rejoin hint, diagnostics,
admin, harness, and readiness surfaces after implementation cuts them over.

Prohibited reinterpretations: boot, join, and rejoin paths must not promote
membership from seed contact, durable-row presence, peer probe, cache freshness,
readiness repair, or timeout text outside the membership owner decision.

Primary diagnostics / proof surfaces: focused membership owner tests, restart
and rejoin durability tests, affected readiness/harness projection tests, and
the sprint representative proof ladder after runtime implementation.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Hypatia
      (`019e0894-a16e-7143-a4aa-16a48025d839`) reviewed
      `work/packages/done-20260508-core-topology-owner-boundary-inventory.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed: Agent Nash
      (`019e0895-f20b-7743-83d1-0e06e5fbff56`) fixed
      `work/packages/done-20260508-core-topology-owner-boundary-inventory.md`.
- [x] Implementation subagent recorded: Agent Dalton
      (`019e0899-a821-7002-97c7-f4fc33482ede`) implemented
      `work/packages/active-20260508-core-topology-boot-join-rejoin-kernel.md`.

## Static Drift Ledger

Preflight:

- [x] No runtime/source-code files were edited during the review-finding fix.
- [x] Tracker, package, sprint, blocker, and task proof selected.

Implementation:

- [x] Runtime edits stayed within boot/join/rejoin membership owner outcome,
      startup decision, lifecycle, bootstrap admission, and durable rejoin
      registration boundaries.
- [x] Existing unrelated dirty files were not edited.
- [x] File-scoped literal, decision-boundary, and runtime-grammar guardrails
      passed for touched runtime files.
- [x] Package remains uncommitted per user instruction.

## Validation

1. `node --test test/control-plane/membership-lifecycle-controller.test.js`
2. `node --test test/bootstrap/rejoin-hints.test.js`
3. `node --test test/bootstrap/bootstrap-api-rejoin.test.js`
4. `node --test test/bootstrap/node-registration-owner.test.js`
5. `node --test test/bootstrap/node-joining-service.test-part-3.js`
6. `node --test test/bootstrap/node-joining-service.test.js`
7. `node --test test/entrypoint-runtime-helpers-join-decision.test.js`
8. `node --test test/bootstrap/bootstrap-api.test-part-3.js`
9. `node scripts/check-guideline-literals.js src/bootstrap/rejoin-hints-constants.js src/bootstrap/rejoin-hints.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/node-joining-service-shared.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/shared/node-registration-owner.js src/entrypoint-runtime-helpers.js src/index.js`
10. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/rejoin-hints-constants.js src/bootstrap/rejoin-hints.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/node-joining-service-shared.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/shared/node-registration-owner.js src/entrypoint-runtime-helpers.js src/index.js`
11. `npm run audit:runtime-grammar:file -- src/bootstrap/rejoin-hints-constants.js src/bootstrap/rejoin-hints.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/node-joining-service-shared.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/shared/node-registration-owner.js src/entrypoint-runtime-helpers.js src/index.js`
12. `npm run work:validate`
13. `npm run work:context`
14. `git diff --check -- src/bootstrap/rejoin-hints-constants.js src/bootstrap/rejoin-hints.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/node-joining-service-shared.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/bootstrap/shared/node-registration-owner.js src/entrypoint-runtime-helpers.js src/index.js test/control-plane/membership-lifecycle-controller.test.js test/bootstrap/rejoin-hints.test.js test/bootstrap/bootstrap-api-rejoin.test.js test/bootstrap/bootstrap-api.test-part-3.js test/entrypoint-runtime-helpers-join-decision.test.js work/packages/active-20260508-core-topology-boot-join-rejoin-kernel.md work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md work/sprints/current-blocker.json work/sprints/current-blocker.md .kiro/specs/core-topology-control-plane-rewrite/tasks.md`
