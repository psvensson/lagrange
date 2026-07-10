---
id: owner-boundary-hardening-and-unification
roadmapRow: null
status: active
graduatesTo: owner-boundary-hardening-and-unification
---

# Owner-Boundary Hardening and Unification

## Intent

Turn the July 2026 direction review into small, independently provable
owner-boundary cutovers. Integrity, durability, deadline, and secure-default
corrections land before broader convergence work. Consolidation then reuses the
repository's existing owners instead of creating parallel sources of truth.

Review source:
[`docs/reviews/2026-07-10-recent-work-direction-review.md`](../../docs/reviews/2026-07-10-recent-work-direction-review.md)

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
