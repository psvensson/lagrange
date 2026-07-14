# Solve report: service-lifecycle-command-catalog-composition

**Goal:** The service lifecycle command owner composes manifest normalization, explicit artifact policy, stable authenticated intent identity, and ServiceInstallCatalogOwner durable operations and status projections, with shared bootstrap wiring to the same catalog owner.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-lifecycle-command-catalog-composition/service-lifecycle-command-catalog-composition-2026-07-14T12-14-41-205Z.report.json

**Attempts:** 2

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- parent quest: service-lifecycle-sql-control-surface
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 8
- Change bytes: 85669
- Owner areas: scripts/checks, src/bootstrap, src/control-plane, src/service, test/bootstrap, test/service
- Categories: other, runtime, test
- Action: land or separate 6 owner areas: scripts/checks, src/bootstrap, src/control-plane, src/service, test/bootstrap, test/service
- Split plan:
  - src/service: 3 file(s)
  - scripts/checks: 1 file(s)
  - src/bootstrap: 1 file(s)
  - src/control-plane: 1 file(s)
  - test/bootstrap: 1 file(s)
  - test/service: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **service-lifecycle-command-catalog-composition-main** [solved] rung 2, attempts 2, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **service-lifecycle-command-catalog-composition-main**: Exact reconstruction proved normalized manifest fields and artifact source were omitted from replay identity, so changed intent could replay successfully instead of conflicting. (rules out: Do not derive install or upgrade replay identity from only digest, version, config, and service name.) [subagent:verify_s0_transport_decision]
- **service-lifecycle-command-catalog-composition-main**: Independent reconstruction approved the superseding full patch: changed manifest/runtime/source intent conflicts before resolution, canonical key order replays, and replay, rejection-before-write, and bootstrap-owner mutants all turn red. [subagent:verify_s0_transport_decision]
- **service-lifecycle-command-catalog-composition-main**: Independent aggregate verification approved the canonical superseding patch; it is byte-identical to attempt 2 and covers all eight rejected-attempt paths with the collision fix and red-on-revert proofs. [subagent:verify_s0_transport_decision]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T12:03:47.608Z | service-lifecycle-command-catalog-composition-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-lifecycle-command-catalog-composition/attempt-1.diff |
| 2026-07-14T12:14:41.258Z | service-lifecycle-command-catalog-composition-main | local-fix | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-lifecycle-command-catalog-composition/attempt-2.diff |
