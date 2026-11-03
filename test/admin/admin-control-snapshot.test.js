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

