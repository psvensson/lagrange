import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  clearRegisteredControlPlaneSystemTableGateway,
  registerControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-gateway-registry.js';
import {
  CDC_PROPAGATION_DELIVERY_PRIORITY,
  CDC_PROPAGATION_DELIVERY_STATE,
  resolveCdcPropagationDeliveryProfile,
} from '../../src/cache/cdc-propagation-delivery-profile.js';
import './admin-control-snapshot-publication-convergence-test-cases.js';
import './admin-control-snapshot-repair-handoff-outcome-test-cases.js';
import './admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js';
import {registerAdminControlSnapshotTailTests} from './admin-control-snapshot-tail-test-cases.js';

registerAdminControlSnapshotTailTests({
  test,
  TABLES,
  AdminControlSnapshot,
  CONTROL_PLANE_READINESS_DIMENSION,
});

test(
  'AdminControlSnapshot buildLocalControlSnapshot is a non-mutating observation path over systemTableCache',
  async (t) => {
    clearRegisteredControlPlaneSystemTableGateway();
    const cachedServices = [{service_id: 's-cached', state: 'active'}];
    const cachedOps = [{operation_id: 'op-cached', state: 'active'}];
    let queryCalls = 0;
    let cacheMutationCalls = 0;

    const cache = {
      getAll(table) {
        if (table === TABLES.NODES) {
          return [
            {node_id: 'n1', status: 'active'},
            {node_id: 'n2', status: 'active'},
          ];
        }
        if (table === TABLES.SERVICES) return cachedServices;
        if (table === TABLES.REPLICA_OPERATIONS) return cachedOps;
        return [];
      },
      applySystemTableChange() {
        cacheMutationCalls += 1;
      },
    };
    const gateway = {
      async querySystemTable() {
        queryCalls += 1;
        return {rows: [{service_id: 's-auth', state: 'active'}]};
      },
      applySystemTableRowsToCache() {
        cacheMutationCalls += 1;
      },
    };

    registerControlPlaneSystemTableGateway(gateway);
    try {
      const snapshot = new AdminControlSnapshot({
        systemTableCache: cache,
        controlPlaneSystemTableGateway: gateway,
        nowFn: () => 1000,
      });

      const res = await snapshot.buildLocalControlSnapshot({});
      t.ok(res, 'should return control snapshot');
      t.equal(
        queryCalls,
        0,
        'buildLocalControlSnapshot must not query authoritative services/operations directly',
      );
      t.equal(
        cacheMutationCalls,
        0,
        'buildLocalControlSnapshot must not mutate shared systemTableCache during observation',
      );
    } finally {
      clearRegisteredControlPlaneSystemTableGateway();
    }
  },
);

test(
  'resolveCdcPropagationDeliveryProfile classifies control_plane_publications, replica_operations, and tables as critical_visibility and non-critical tables as standard_visibility',
  async (t) => {
    for (const criticalTable of [
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      TABLES.REPLICA_OPERATIONS,
      TABLES.TABLES,
    ]) {
      const profile = resolveCdcPropagationDeliveryProfile([
        {tableName: criticalTable, operation: 'UPSERT', data: {}},
      ]);
      t.equal(
        profile.state,
        CDC_PROPAGATION_DELIVERY_STATE.CRITICAL_VISIBILITY,
        `${criticalTable} must use CRITICAL_VISIBILITY`,
      );
      t.equal(
        profile.deliveryPriority,
        CDC_PROPAGATION_DELIVERY_PRIORITY.CRITICAL,
        `${criticalTable} must use CRITICAL deliveryPriority`,
      );
    }

    const standardProfile = resolveCdcPropagationDeliveryProfile([
      {tableName: TABLES.LOGS, operation: 'UPSERT', data: {}},
    ]);
    t.equal(
      standardProfile.state,
      CDC_PROPAGATION_DELIVERY_STATE.STANDARD_VISIBILITY,
      'non-critical system tables must remain STANDARD_VISIBILITY',
    );
    t.equal(
      standardProfile.deliveryPriority,
      CDC_PROPAGATION_DELIVERY_PRIORITY.BACKGROUND,
      'non-critical system tables must remain BACKGROUND deliveryPriority',
    );
  },
);

test(
  'AdminControlSnapshot inFlightCount preserves nonterminal operations across active target services and observer startup',
  async (t) => {
    const REMOTE_OWNER_NODE_ID = 'node-remote-owner';
    const OBSERVER_NODE_ID = 'node-observer';
    const OPERATION_UPDATED_AT_MS = 50_000;
    const OBSERVATION_NOW_MS = 100_000;

    let observerStartupReady = false;
    let operationRow = {
      operation_id: 'op-remote-add-1',
      type: 'ADD',
      entity_type: 'partition',
      entity_id: 'tbl-users-p1',
      partition_id: 'tbl-users-p1',
      replica_id: 'tbl-users-p1-r2',
      source_node_id: REMOTE_OWNER_NODE_ID,
      target_node_id: OBSERVER_NODE_ID,
      status: 'syncing',
      workflow_step: 'SYNCING',
      created_at: 1_000,
      updated_at: OPERATION_UPDATED_AT_MS,
      completed_at: null,
    };
    const activeTargetServiceRow = {
      service_id: 'tbl-users-p1-r2',
      replica_id: 'tbl-users-p1-r2',
      partition_id: 'tbl-users-p1',
      service_type: 'partition',
      node_id: OBSERVER_NODE_ID,
      status: 'active',
      started_at: 90_000,
    };

    const snapshot = new AdminControlSnapshot({
      nodeId: OBSERVER_NODE_ID,
      nowFn: () => OBSERVATION_NOW_MS,
      startupRecoveryCoordinator: {
        evaluate: () => ({ready: observerStartupReady}),
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.SERVICES) return [activeTargetServiceRow];
          if (tableName === TABLES.REPLICA_OPERATIONS) return [operationRow];
          return [];
        },
      },
    });

    // (1) Live remote operation observed during a newer node's startup (with active target service)
    const duringStartupSummary =
      snapshot.buildControlSnapshotReplicaOperationSummary([operationRow]);
    t.equal(
      duringStartupSummary.inFlightCount,
      1,
      'a newer observing node still in startup must not erase a remote owner live nonterminal operation',
    );

    // Even when explicit ignorePreRestart is requested without remote owner start evidence,
    // a remote owner operation must not fall back to the local observer restart time.
    const explicitRestartDiagnosticSummary =
      snapshot.buildControlSnapshotReplicaOperationSummary([operationRow], {
        ignorePreRestart: true,
      });
    t.equal(
      explicitRestartDiagnosticSummary.inFlightCount,
      1,
      'ignorePreRestart without remote owner start evidence must not use observer process start time for a remote owner',
    );

    // (2) The observer becomes ready without operation progress while target service already appears active
    observerStartupReady = true;
    const afterObserverReadySummary =
      snapshot.buildControlSnapshotReplicaOperationSummary([operationRow]);
    t.equal(
      afterObserverReadySummary.inFlightCount,
      1,
      'an active target service must not complete a nonterminal SYNCING operation when the observer is ready',
    );

    // (3) Actual terminal settlement
    operationRow = {
      ...operationRow,
      status: 'active',
      workflow_step: 'ACTIVE',
      updated_at: OBSERVATION_NOW_MS,
      completed_at: OBSERVATION_NOW_MS,
    };
    const afterTerminalSettlementSummary =
      snapshot.buildControlSnapshotReplicaOperationSummary([operationRow]);
    t.equal(
      afterTerminalSettlementSummary.inFlightCount,
      0,
      'outward inFlightCount drops to 0 once the operation row is durably terminal',
    );
  },
);

