# Solve report: oci-runtime-host-contract

**Goal:** Phase 2 has one sealed Docker Compose OCI host-runtime contract: the existing node-local lifecycle owner route targets one authenticated, label-scoped host agent without exposing Docker Engine authority to Lagrange nodes; artifact, operation, network, failure, cleanup, production-binding, and downstream live-proof boundaries are explicit, while Kubernetes remains a separate provider milestone.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/oci-runtime-host-contract.json

**Attempts:** 2

## Links
- spec: solve/specs/service-portability-ladder/design.md#oci-provider-milestone
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 5
- Change bytes: 49361
- Owner areas: architecture, solve
- Categories: docs, workflow
- Split plan:
  - solve: 3 file(s)
  - architecture: 2 file(s)
- Signals: none

## Frontiers
- **oci-runtime-host-contract-main** [solved] rung 2, attempts 2, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **oci-runtime-host-contract-main**: Independent verification rejected attempt 1: the authenticated protocol lacks signed response framing and replay restart semantics, restart-safe idempotency lacks a durable agent receipt and label representation, and the Oracle conflates C2 agent operations with owner-level outcomes. [subagent:c0_proof_surface]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T18:39:11.580Z | oci-runtime-host-contract-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/oci-runtime-host-contract/attempt-1.diff |
| 2026-07-14T18:47:12.852Z | oci-runtime-host-contract-main | local-fix | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/oci-runtime-host-contract/attempt-2.diff |
