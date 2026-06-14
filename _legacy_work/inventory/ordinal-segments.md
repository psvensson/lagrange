# Ordinal Segment Inventory

- Schema: `ordinal-segment-inventory-v1`
- Source root: `src`
- Ordinal files: `102`
- Semantic clusters: `16`
- Primary kind counts: `{"segment":73,"stage":22,"part":7}`

## Migration Plan

Replace numbered `segment`, `stage`, and `part` modules with semantic owner-boundary modules in successor packages. This inventory is diagnostic only; it must not rename or refactor runtime modules.

## Clusters

- `admin-control-snapshot-class` (7 files): `admin_control_snapshot_owner / admin_control_snapshot_projection`; proposed module `admin-control-snapshot-projection.js`; successor `runtime-modularization-admin-control-snapshot-projection`; samples `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/admin/admin-control-snapshot-class-part-3.js`.
- `admin-websocket-api` (3 files): `admin_websocket_api_owner / admin_websocket_routing`; proposed module `admin-websocket-routing.js`; successor `runtime-modularization-admin-websocket-routing`; samples `src/admin/admin-websocket-api-segment-1.js`, `src/admin/admin-websocket-api-segment-2.js`, `src/admin/admin-websocket-api-segment-3.js`.
- `control-plane-readiness-service` (10 files): `control_plane_readiness_owner / control_plane_readiness_workflow`; proposed module `control-plane-readiness-workflow.js`; successor `runtime-modularization-control-plane-readiness-workflow`; samples `src/control-plane/control-plane-readiness-service-segment-1.js`, `src/control-plane/control-plane-readiness-service-segment-2.js`, `src/control-plane/control-plane-readiness-service-segment-3.js`.
- `control-plane-readiness-service-runtime-authority-methods` (1 files): `control_plane_readiness_owner / control_plane_readiness_workflow`; proposed module `control-plane-readiness-workflow.js`; successor `runtime-modularization-control-plane-readiness-workflow`; samples `src/control-plane/control-plane-readiness-service-segment-3-runtime-authority-methods.js`.
- `membership-publication-coordinator` (4 files): `membership_publication_owner / membership_publication_coordination`; proposed module `membership-publication-coordination.js`; successor `runtime-modularization-membership-publication-coordination`; samples `src/control-plane/membership-publication-coordinator-stage-1.js`, `src/control-plane/membership-publication-coordinator-stage-2.js`, `src/control-plane/membership-publication-coordinator-stage-3.js`.
- `membership-publication-coordinator-class` (3 files): `membership_publication_owner / membership_publication_coordination`; proposed module `membership-publication-coordination.js`; successor `runtime-modularization-membership-publication-coordination`; samples `src/control-plane/membership-publication-coordinator-class-stage-1.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/control-plane/membership-publication-coordinator-class-stage-3.js`.
- `message-router-shared` (4 files): `message_router_owner / message_router_shared_transport`; proposed module `message-router-shared-transport.js`; successor `runtime-modularization-message-router-shared-transport`; samples `src/transport/message-router-shared-stage-1.js`, `src/transport/message-router-shared-stage-2.js`, `src/transport/message-router-shared-stage-3.js`.
- `operation-workflow-owner` (18 files): `operation_workflow_owner / operation_workflow_progression`; proposed module `operation-workflow-progression.js`; successor `runtime-modularization-operation-workflow-progression`; samples `src/rebalancer/operation-workflow-owner-segment-1.js`, `src/rebalancer/operation-workflow-owner-segment-2.js`, `src/rebalancer/operation-workflow-owner-segment-3.js`.
- `partition-service` (13 files): `partition_service_owner / partition_service_workflow`; proposed module `partition-service-workflow.js`; successor `runtime-modularization-partition-service-workflow`; samples `src/partition/partition-service-segment-1-part-1.js`, `src/partition/partition-service-segment-1-part-2.js`, `src/partition/partition-service-segment-1-part-3.js`.
- `priority-recovery-snapshot` (11 files): `priority_recovery_owner / priority_recovery_snapshot_projection`; proposed module `priority-recovery-snapshot-projection.js`; successor `runtime-modularization-priority-recovery-snapshot-projection`; samples `src/control-plane/priority-recovery-snapshot-stage-1.js`, `src/control-plane/priority-recovery-snapshot-stage-10.js`, `src/control-plane/priority-recovery-snapshot-stage-11.js`.
- `query-executor` (7 files): `query_executor_owner / query_execution_workflow`; proposed module `query-execution-workflow.js`; successor `runtime-modularization-query-execution-workflow`; samples `src/query/query-executor-segment-1.js`, `src/query/query-executor-segment-2-part-1.js`, `src/query/query-executor-segment-2-part-2.js`.
- `sql-query-engine` (7 files): `sql_query_engine_owner / sql_query_planning_execution`; proposed module `sql-query-planning-execution.js`; successor `runtime-modularization-sql-query-planning-execution`; samples `src/query/sql-query-engine-segment-1.js`, `src/query/sql-query-engine-segment-2.js`, `src/query/sql-query-engine-segment-3.js`.
- `unified-rebalancer` (11 files): `rebalancer_planning_owner / placement_rebalance_planning`; proposed module `placement-rebalance-planning.js`; successor `runtime-modularization-placement-rebalance-planning`; samples `src/rebalancer/unified-rebalancer-segment-1.js`, `src/rebalancer/unified-rebalancer-segment-2.js`, `src/rebalancer/unified-rebalancer-segment-3.js`.
- `unified-rebalancer-control-plane-methods` (1 files): `rebalancer_planning_owner / placement_rebalance_planning`; proposed module `placement-rebalance-planning.js`; successor `runtime-modularization-placement-rebalance-planning`; samples `src/rebalancer/unified-rebalancer-segment-1-control-plane-methods.js`.
- `unified-rebalancer-critical-topology-methods` (1 files): `rebalancer_planning_owner / placement_rebalance_planning`; proposed module `placement-rebalance-planning.js`; successor `runtime-modularization-placement-rebalance-planning`; samples `src/rebalancer/unified-rebalancer-segment-2-critical-topology-methods.js`.
- `unified-rebalancer-policy-scheduler-methods` (1 files): `rebalancer_planning_owner / placement_rebalance_planning`; proposed module `placement-rebalance-planning.js`; successor `runtime-modularization-placement-rebalance-planning`; samples `src/rebalancer/unified-rebalancer-segment-1-policy-scheduler-methods.js`.

## Rules For Successors

- Use semantic owner-boundary names; do not introduce new numbered segment, stage, or part files.
- Keep runtime behavior unchanged unless the successor package is a runtime owner-boundary package with focused proof.
- Use the JSON `entries` list for exact file membership when opening successor packages.
