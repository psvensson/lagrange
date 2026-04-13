# Publication Observation Ingress and Bootstrap Consumer Collapse

## Why

The seed-side startup blocker is amplified when publication truth is observed
through multiple consumer-specific paths. Observation, diagnostics, and
bootstrap consumption still overlap more than they should.

The system needs one publication-observation ingress through the readiness
owner, and bootstrap consumers should consume one final startup-authority
answer instead of reaching into lower layers.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Seed Startup Authority and Initial Publication Establishment Sprint](../sprints/active-2026-q2-seed-startup-authority-and-initial-publication-establishment.md)

## In Scope

1. Collapse publication observation onto the readiness owner.
2. Remove bootstrap-consumer reconstruction of startup authority from raw
   publication diagnostics.
3. Keep observation read-only.
4. Make harness and bootstrap diagnostics consume the same final startup state
   vocabulary.

## Out Of Scope

1. New admin UX work beyond the minimum diagnostics needed for startup truth.
2. Non-startup observation paths unrelated to publication or seed authority.

## Invariants

1. Publication observation is read-only.
2. Bootstrap consumers do not directly rebuild startup-authority state from raw
   publication rows.
3. Diagnostics and harness evidence speak the same startup-state vocabulary as
   the owner contract.

## Hotspots

1. `src/control-plane/control-plane-readiness-service.js`
2. `src/admin/admin-control-snapshot.js`
3. `src/bootstrap/owners/bootstrap-readiness-owner.js`
4. `src/bootstrap/startup-recovery-coordinator.js`
5. `test/distributed/harness/cluster.js`
6. `test/distributed/harness/startup-readiness-evidence.js`

## Detection / Analysis Tasks

- [ ] Inventory remaining bootstrap or harness reads that still consume raw
      publication diagnostics directly.
- [ ] Confirm where startup diagnostics and harness evidence still use
      different blocker vocabularies.

## Implementation Tasks

- [ ] Route remaining startup/publication observation through readiness-owned
      ingress methods.
- [ ] Collapse bootstrap consumers onto one final startup-authority answer.
- [ ] Normalize startup blocker and state vocabulary across bootstrap logs and
      harness evidence.
- [ ] Remove any remaining read-path side effects on publication observation in
      this startup path.

## Validation

1. Bootstrap logs and harness failure artifacts report the same startup state
   and blocker reason for the seed path.
2. Observation no longer mutates publication workflow while serving startup
   diagnostics.

## Done When

1. Publication observation has one ingress.
2. Bootstrap consumers no longer reconstruct startup truth locally.
3. Runtime diagnosis of seed startup authority is direct instead of inferred.

## 2026-04-12 execution update

Status: implemented for the intended bootstrap-consumer scope.

What landed:
- bootstrap-facing startup authority now flows from readiness-owned publication / planning answers
- bootstrap consumers no longer reconstruct publication authority from weaker local bootstrap signals
- publication observation remains read-only at the bootstrap consumer edge

Validation:
- readiness, bootstrap API, and startup recovery unit suites passed

Runtime result:
- the system still does not reach first authoritative publication establishment on the seed
- this confirms the remaining gap is in publication establishment itself, not bootstrap-side observation ingress

## 2026-04-12 implementation slice

Implemented:
- the startup-authority call path no longer loops from readiness back into readiness through publication planning
- nested planning recursion is disabled on the readiness-owned startup call path while the broader coordinator behavior remains unchanged for its own reconciliation work

Validation:
- `test/control-plane/membership-publication-coordinator.test.js`
- `test/control-plane/control-plane-readiness-service.test.js`
