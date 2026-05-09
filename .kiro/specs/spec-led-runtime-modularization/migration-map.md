# Migration Map

## Package Order

1. Spec and reference-pattern rebaseline.
2. Operation owner decision kernel.
3. Priority recovery observation contract.
4. Workflow owner adapter cutover.
5. Placement owner policy kernel.
6. Publication owner stream contract.
7. Projection/readiness consumer contract.
8. Diagnostics and harness consumer rewrite.
9. Legacy deletion and representative proof.

## Owner Contract Matrix

Each row names the primary semantic owner for a package. File targets below are
candidate hotspots only; write ownership begins only when the matching package
is active and its contract is frozen.

| Package | Semantic owner | Boundary | Primary contract | Deletion or quarantine target |
| --- | --- | --- | --- | --- |
| Spec and reference-pattern rebaseline | `specification_owner` | `runtime_module_contracts` | Specification pack, module template, and sprint queue. | Ambiguous rewrite guidance that lacks a module contract. |
| Operation owner decision kernel | `operation_workflow_owner` | `workflow_progress_decision_kernel` | Pure operation progress decision from normalized operation evidence. | Workflow progress, serial wait, timeout, and visibility branch piles outside the owner. |
| Priority recovery observation contract | `priority_recovery_observation_owner` | `partition_progress_observation` | Partition progress derived from owner outcomes and request contracts. | Snapshot-local operation progress rewrites and shadow progress grammars. |
| Workflow owner adapter cutover | `operation_workflow_owner` | `workflow_owner_adapter` | Existing workflow facades routed through the operation decision kernel. | Duplicate transition, retry, timeout, and dispatch branches in facades. |
| Placement owner policy kernel | `placement_owner` | `placement_policy` | Filter, score, reserve, and emit placement intent. | Survivor-set fallback and pressure branches that mutate placement policy. |
| Publication owner stream contract | `publication_owner` | `publication_stream` | Revisioned publication, acknowledgement, freshness, and recovery-gate stream. | SQL fallback or diagnostics paths that complete publication. |
| Projection/readiness consumer contract | `projection_readiness_consumer` | `readiness_projection` | Internal, repair, and serve readiness from owner outcomes and source revisions. | Raw transport, service-row, heartbeat, cache, or ready-lease recombination. |
| Diagnostics and harness consumer rewrite | `diagnostics_consumer` | `owner_witness_ranking` | One canonical owner witness list and pure dominant-blocker ranking. | Raw log, probe, or fallback-snapshot classifiers when owner outcomes exist. |
| Legacy deletion and representative proof | `closure_owner` | `superseded_path_deletion` | Structural guards plus focused and representative proof. | Remaining compatibility branches, shadow vocabularies, and transitional imports. |

## Initial File Ownership Targets

Operation owner:

1. `src/rebalancer/operation-workflow-owner*.js`
2. `src/rebalancer/rebalance-coordinator*.js`
3. `src/rebalancer/replica-operation-repository*.js`
4. `src/control-plane/priority-recovery-snapshot-stage-10.js`

Priority recovery observation:

1. `src/control-plane/priority-recovery-snapshot*.js`
2. `src/control-plane/priority-recovery-diagnostics-constants.js`
3. `test/control-plane/priority-recovery-snapshot*.js`

Placement owner:

1. `src/rebalancer/move-planner*.js`
2. `src/rebalancer/unified-rebalancer*.js`
3. `src/rebalancer/storage-admission-service.js`

Publication owner:

1. `src/control-plane/membership-publication-coordinator*.js`
2. `src/control-plane/control-plane-publication-merge.js`
3. `src/control-plane/publication-recovery-gate.js`
4. `src/control-plane/publication-recovery-evidence.js`

Projection/readiness:

1. `src/control-plane/active-node-projection.js`
2. `src/control-plane/control-plane-readiness-service*.js`
3. `src/control-plane/startup-authority-snapshot-owner.js`
4. `src/admin/admin-service-discovery-readiness-methods.js`

Diagnostics and harness:

1. `test/distributed/harness/failure-bundle-segment-*.js`
2. `test/distributed/harness/publication-evidence-*.js`
3. `test/distributed/harness/active-gate-closure-classification.js`
4. `scripts/analyze-topology-convergence.js`

## Cutover Rule

For each old path:

1. Add the pure decision fixture first.
2. Route one existing facade through the new decision module.
3. Cut over tail consumers.
4. Add import or structural guard against the old branch.
5. Delete the old branch.
6. Rerun focused proof.
7. Rerun representative proof or record the named migrated blocker.

## Activation Constraint

Do not work two packages from this map in parallel unless they have disjoint
owner and write scope. The operation-owner and priority-recovery packages are
not disjoint and must stay sequential.
