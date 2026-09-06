---
id: owner-boundary-hardening-and-unification
status: open
proof: deterministic
legacy: true
roadmapRow: null
graduatesTo: owner-boundary-hardening-and-unification
quests:
  - canonical-replica-inventory-cutover
  - control-plane-readiness-trust-cutover
  - durable-provisioning-job-owner
  - helm-admin-default-deny-cutover
  - helm-contract-ci-tooling
  - helm-render-parser-tooling
  - priority-recovery-admin-control-plane-admission-publication-single-engaged-authority
  - priority-recovery-admin-control-plane-build-priority-recovery-admission-by-partition-id-authority
  - priority-recovery-admin-dormant-context-retirement
  - priority-recovery-control-plane-normalize-distinct-string-array-authority
  - priority-recovery-owner-inventory
  - provisioning-parent-deadline-cutover
  - raft-committed-entry-immutability
  - raft-snapshot-gated-compaction
  - solver-acceptance-proof-manifest
  - solver-proof-artifact-census
  - solver-proof-artifact-content-addressing
  - solver-scope-pressure-precommit-enforcement
  - solver-terminal-integrity-cutover-exhaustion-fix
  - solver-terminal-integrity-cutover-fail-closed-fix
  - solver-terminal-integrity-cutover-verifier-fix
  - solver-terminal-integrity-cutover
  - solver-terminal-integrity-red-test-bootstrap-verifier-fix
  - solver-terminal-integrity-red-test-bootstrap
  - transaction-owned-commit-mode-cutover
authorizes: []
legacyStatus: active
---

# Owner-Boundary Hardening and Unification

## Intent

Define small, independently provable owner-boundary cutovers. Integrity,
durability, deadline, and secure-default corrections land before broader
convergence work. Consolidation reuses the repository's existing owners instead
of creating parallel sources of truth.

Executable plan:
[`solve/specs/owner-boundary-hardening-and-unification/implementation-plan.md`](../specs/owner-boundary-hardening-and-unification/implementation-plan.md)

## Decisions

- Solver terminal integrity and acceptance-manifest execution are separate
  Quests.
- Honest non-measurements are not integrity violations and cannot advance or
  solve a Quest.
- Raft conflict truncation/append immutability and compaction are separate
  contracts. Physical compaction stays disabled until an end-to-end snapshot
  transfer/install protocol exists.
- Helm secure-default removal is independent of a later authenticated admin
  exposure feature. Until concrete authentication is wired, the chart cannot
  publish the listener.
- Parent-deadline correctness lands immediately. Durable provisioning jobs are
  a later `TableCreationService`/`OwnerContractOutcome` cutover.
- `ControlPlaneReadinessService` remains the readiness owner. `NodeTrustState`
  is observer-local derived evidence, not replicated truth or a second owner.
- Replica inventory owns occupancy and voter-target accounting. Readiness and
  replication catch-up remain inputs from their owners.
- Transaction optimization uses `AUTOCOMMIT`, `ONE_PHASE_COMMIT`, and
  `TWO_PHASE_COMMIT`; explicit transactions always enlist participants.
- Artifact storage, scope-pressure enforcement, and recovery-module
  reorganization are distinct work surfaces and must be measured before
  migration Quests are sealed.

## Dependency Index

```text
Immediate independent safety lane
  W0 solver terminal-integrity red-test bootstrap -> W1 solver terminal integrity
  W2 executable proof manifest
  W3 raft committed-entry immutability
  W4 disable unsafe compaction pending snapshot protocol
  W5 helm admin default-deny
  W6 provisioning parent-deadline cutover

Ownership lane
  W7 readiness cycle cut + observer-local trust
       -> W8 canonical replica inventory
       -> W9 durable provisioning job owner
  W10 transaction-owned commit mode (independent)

Surface lane
  W1 -> W11 artifact census -> W12 artifact storage cutover
                           \-> W13 scope-pressure enforcement
  W7-W10 -> W14 recovery-module ownership inventory
              -> later owner-scoped migrations defined by that inventory
```

## Decision Log

- 2026-07-10 — Initial eight-Quest draft authored from the direction review.
- 2026-07-10 — Independent architecture reviewer
  `/root/plan_arch_review` rejected the draft because readiness ownership,
  transaction semantics, Raft mutator coverage, chart protection, and several
  Quest boundaries were unresolved.
- 2026-07-10 — Independent proof/workflow reviewer
  `/root/plan_proof_review` rejected the draft because exact artifact-bound
  `doneWhen` probes, engagement witnesses, mixed-tree controls, and executable
  security/job contracts were missing.
- 2026-07-10 — Revision 2 split the work into bounded owner-scoped work packages,
  chose existing owners, and added exact scenario/report closure contracts in
  the linked implementation plan.
- 2026-07-10 — Revision 3 added the Solver red-test bootstrap, protocol-level
  Raft rejection, compaction disablement, canonical durable workflow reuse,
  mandatory live Helm proof, measured artifact reduction, and the generated-
  migration reapproval gate requested by the second review.

## Plan Verification Record

Revision 3 is approved:

- `/root/plan_arch_review` — APPROVE; no remaining architecture blocker after
  the W3, W4, and W9 protocol/owner corrections.
- `/root/plan_proof_review` — APPROVE; no remaining proof/workflow blocker after
  the W0 fresh-oracle bootstrap and W13 split-only correction.

Source implementation may begin under the linked execution contract.
