/**
 * Formation owner queue fairness: alternating formation owners cannot
 * repeatedly jump the fair owner queue of the readiness planning owner.
 * Split from control-plane-readiness-service-sync-and-priority-recovery.
 */

import {
  test,
} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  NODE_STATE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  READINESS_CHURN_NODE_COUNT,
  READINESS_CHURN_NOW_MS,
  createReadinessChurnCache,
} from './control-plane-readiness-service-test-support.js';

test('alternating formation owners cannot repeatedly jump the fair owner queue',
  async (t) => {
    const cache = createReadinessChurnCache();
    for (const nodeId of ['node-3', 'node-4']) {
      cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.STATUS]: NODE_STATE.JOINING,
      });
    }
    const scheduled = [];
    let connectedFormationOwner = 'node-3';
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'node-0',
      systemTableCache: cache,
      now: () => READINESS_CHURN_NOW_MS,
      readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
      messageRouter: {
        getConnectionState: (nodeId) =>
          nodeId === connectedFormationOwner || nodeId === 'node-0' ?
            STATE.CONNECTED : STATE.DISCONNECTED,
        getConnectedNodes: () =>
          new Set(['node-0', connectedFormationOwner]),
      },
    });
    readiness.getNodeReadinessSync('node-0');
    const planningOwner = readiness.readinessPlanningSnapshotOwner;
    const buildsBeforeStorm =
      readiness.getReadinessPlanningDiagnostics().buildOwnerKeys.length;
    planningOwner.enqueueOwnerKeys('fairness_probe');
    for (let turn = 0;
      turn < READINESS_CHURN_NODE_COUNT && scheduled.length > 0;
      turn++) {
      connectedFormationOwner = turn % 2 === 0 ? 'node-3' : 'node-4';
      planningOwner.enqueueOwnerKeys('alternating_formation_fairness_probe');
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
    }
    const stormOwners = readiness.getReadinessPlanningDiagnostics()
      .buildOwnerKeys.slice(buildsBeforeStorm);
    t.ok(stormOwners.includes('node-1'),
      'an unrelated dirty owner progresses despite alternating formation owners');
    t.ok(stormOwners.filter((ownerKey) =>
      ownerKey === 'node-3' || ownerKey === 'node-4').length <= 2,
    'each formation owner receives at most one priority turn per epoch');
    readiness.shutdownReadinessPlanningOwner();
  });
