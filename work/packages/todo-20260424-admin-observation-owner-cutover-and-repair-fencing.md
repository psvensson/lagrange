# Admin Observation Owner Cutover And Repair Fencing

## Why

The latest blocker includes admin and snapshot reachability timeouts, but they
are contributing observations around a later convergence timeout. Admin
snapshot code still contains enough local repair and degradation policy that it
can compete with the control snapshot owner for semantic meaning.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Production guarantees`

Sprint:

1. [Critical topology convergence grammar contract](./done-20260424-critical-topology-convergence-grammar-contract.md)

## In Scope

1. Make admin snapshot readers request a named observation mode from
   `ControlPlaneSnapshotOwner`.
2. Keep repair scheduling and force-repair semantics behind the snapshot owner.
3. Return only `fresh`, `stale_usable`, `deferred_refresh`, or `failed`
   observation states to admin consumers.
4. Fence or delete caller-local repair/degrade branches that reinterpret owner
   timeouts.
5. Prove failure bundles consume observation state as supporting evidence, not
   the dominant runtime barrier when convergence has already thrown.

## Out Of Scope

1. Rewriting the admin API surface.
2. Treating diagnostics reachability as equivalent to runtime convergence.
3. New observation states created only for a harness artifact.

## Shared Boundary Contract

- Semantic owner:
  `ControlPlaneSnapshotOwner`.
- Canonical contract:
  admin readers choose an observation mode and receive one owner-state
  observation.
- Allowed consumers:
  admin snapshot responses, readiness diagnostics, failure bundles, and
  playback tooling.
- Prohibited reinterpretations:
  inline authoritative repair fallback ladders that convert owner timeout or
  pressure into local success, empty visibility, or startup failure.

## Residual Closure Inventory

- [ ] Inventory admin snapshot repair/degrade branches.
- [ ] Route live admin repair modes through `ControlPlaneSnapshotOwner`.
- [ ] Label retained artifact paths as diagnostics-only.
- [ ] Add focused admin snapshot contract proof.
- [ ] Add failure-bundle proof that observation deferral is secondary evidence
      under a later convergence barrier.

## Validation

1. `npm test -- test/admin/admin-control-snapshot-response-contract.test.js`
2. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
3. `node --check src/admin/admin-control-snapshot-class-part-1.js`

## Done When

1. Admin snapshot code no longer owns repair/degrade policy outside the
   snapshot owner.
2. Snapshot reachability timeout is reported as observation evidence unless it
   is the actual failing barrier.
