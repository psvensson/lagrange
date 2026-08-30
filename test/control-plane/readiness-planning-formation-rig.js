// Shared production-composition formation rig for the readiness-planning
// witnesses. Five nodes, a versioned system-table cache, the REAL
// ControlPlaneReadinessService and the REAL MembershipPublicationCoordinator on
// a virtual clock, driven at 200 owner builds/s with 40 source-table writes/s
// for 5s of virtual time. It counts heavy priority-recovery planning builds and
// publications winner reads, so a build rate is MEASURED rather than asserted.
// Calibrated against the live seed: 344.8 heavy builds/s here vs 355/s measured
// on the failing five-node GCP run (forensics 12, run 2026-08-30T17-32-03).
//
// It lives in its own module because more than one quest measures the same
// sequence: a shared rig is the only way two witnesses can compare rates.
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';

const NODE_COUNT = 5;
const PARTITION_ID = 'priority-partition';
const RATE_CALL_COUNT = 1000;
const RATE_STEP_MS = 5;
const RATE_WRITE_EVERY = 5;
const MS_PER_SECOND = 1000;
const READY_LEASE_WINDOW_MS = 60000;
const T0 = Date.parse('2026-08-30T06:00:00.000Z');

const CACHE_KEY_FIELDS = Object.freeze([
  COLUMN.NODE_ID,
  COLUMN.SERVICE_ID,
  'partition_id',
  'operation_id',
  'publication_id',
  'endpoint_id',
  'reservation_id',
]);

// The publication states a winner row can present to the memo guard.
const PUBLICATION_STATES = Object.freeze([
  Object.freeze({label: 'epoch-2-published', epoch: 2, status: 'PUBLISHED'}),
  Object.freeze({
    label: 'epoch-2-acknowledging', epoch: 2, status: 'ACKNOWLEDGING',
  }),
  Object.freeze({label: 'epoch-3-published', epoch: 3, status: 'PUBLISHED'}),
  Object.freeze({
    label: 'epoch-3-acknowledging', epoch: 3, status: 'ACKNOWLEDGING',
  }),
  Object.freeze({label: 'no-membership-row', epoch: null, status: null}),
]);

function publicationRow({epoch, status, nodeIds = ['node-a']}) {
  return {
    publication_id: 'pub-1',
    publication_kind: 'cluster_membership',
    publication_epoch: epoch,
    status,
    published_active_node_ids: JSON.stringify(nodeIds),
    required_ack_node_ids: JSON.stringify(nodeIds),
    acknowledged_node_ids: JSON.stringify(nodeIds),
  };
}

function rowsForState(state) {
  return state.epoch === null ? [] : [publicationRow(state)];
}

// Production-composition formation-shaped churn on a virtual clock, driving
// the real readiness owner build. Records the MEASURED heavy planning build
// rate and ratchets it against the pre-change measurement.
function createFormationShapedCache(nowMs) {
  const rowsByTable = new Map(Object.values(TABLES).map((table) => [
    table,
    new Map(),
  ]));
  const versions = new Map();
  const listeners = new Set();
  const keyFor = (table, row) => {
    const field = CACHE_KEY_FIELDS.find((candidate) => row?.[candidate]);
    return String(field ? row[field] :
      `${table}:${rowsByTable.get(table)?.size || 0}`);
  };
  const cache = {
    get: (table, key) => rowsByTable.get(table)?.get(String(key)) || null,
    getAll: (table) => [...(rowsByTable.get(table)?.values() || [])],
    filter(table, predicate) {
      return cache.getAll(table).filter(predicate);
    },
    getTableMutationVersion: (table) => versions.get(table) || 0,
    applySystemTableChange(table, operation, row) {
      const rows = rowsByTable.get(table);
      const key = keyFor(table, row);
      if (String(operation).toUpperCase() === 'DELETE') {
        rows?.delete(key);
      } else {
        rows?.set(key, Object.freeze({...rows?.get(key), ...row}));
      }
      versions.set(table, (versions.get(table) || 0) + 1);
      for (const listener of listeners) {
        listener(table, operation, row, null);
      }
    },
    onCacheChange: (listener) => listeners.add(listener),
    offCacheChange: (listener) => listeners.delete(listener),
  };
  for (let index = 0; index < NODE_COUNT; index++) {
    const nodeId = `node-${index}`;
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.LAST_HEARTBEAT]: nowMs,
      [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + READY_LEASE_WINDOW_MS,
      connection_state: 'ready',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: `service-${index}`,
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/${PARTITION_ID}`,
      partition_id: PARTITION_ID,
      raft_role: index === 0 ? 'leader' : 'follower',
    });
  }
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: PARTITION_ID,
    table_name: TABLES.NODES,
    leader_node_id: 'node-0',
  });
  cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'INSERT',
    publicationRow({
      ...PUBLICATION_STATES[0],
      nodeIds: Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`),
    }));
  return cache;
}

function driveFormationShapedChurn() {
  let clock = T0;
  const cache = createFormationShapedCache(T0);
  const readiness = new ControlPlaneReadinessService({
    nodeId: 'node-0',
    systemTableCache: cache,
    now: () => clock,
    readinessPlanningScheduleDrainFn: () => {},
    messageRouter: {
      getConnectionState: () => 'connected',
      getConnectedNodes: () => new Set(
        Array.from({length: NODE_COUNT}, (_, index) => `node-${index}`),
      ),
    },
  });
  readiness.syncOwnerDependencies({
    membershipPublicationService: new MembershipPublicationCoordinator({
      nodeId: 'node-0',
      systemTableCache: cache,
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: readiness,
      now: () => clock,
    }),
  });
  let heavyBuilds = 0;
  const buildProjection =
    readiness.buildTrackedPriorityRecoveryPlanningProjection;
  readiness.buildTrackedPriorityRecoveryPlanningProjection = function(...args) {
    heavyBuilds += 1;
    return buildProjection.apply(this, args);
  };
  let publicationWinnerReads = 0;
  const readProbe = readiness.readLatestMembershipPublicationEpochStatusProbe;
  readiness.readLatestMembershipPublicationEpochStatusProbe = function(...args) {
    publicationWinnerReads += 1;
    return readProbe.apply(this, args);
  };
  const churnTables = [
    TABLES.NODES,
    TABLES.NODE_ENDPOINTS,
    TABLES.SERVICES,
    TABLES.PARTITIONS,
    TABLES.REPLICA_OPERATIONS,
    TABLES.CONTROL_PLANE_PUBLICATIONS,
  ];
  // The floored planning generation latches on the wall clock, so the virtual
  // clock drives it for the duration of the measured sequence.
  const platformNow = Date.now;
  Date.now = () => clock;
  let writeRevision = 0;
  try {
    for (let call = 0; call < RATE_CALL_COUNT; call++) {
      clock += RATE_STEP_MS;
      if (call % RATE_WRITE_EVERY === 0) {
        writeRevision += 1;
        cache.applySystemTableChange(
          churnTables[writeRevision % churnTables.length],
          'UPDATE',
          {
            revision: writeRevision,
            updated_at: clock,
            node_id: `node-${writeRevision % NODE_COUNT}`,
            endpoint_id: 'endpoint-0',
            service_id: 'service-0',
            partition_id: PARTITION_ID,
            operation_id: 'operation-0',
            publication_id: 'publication-aux',
            publication_kind: 'other',
          },
        );
      }
      readiness.buildNodeReadinessSyncCurrent(
        `node-${call % NODE_COUNT}`,
        {readinessPlanningOwnerBuild: true},
      );
    }
  } finally {
    Date.now = platformNow;
    readiness.shutdownReadinessPlanningOwner();
  }
  return {heavyBuilds, publicationWinnerReads};
}


export {
  MS_PER_SECOND,
  NODE_COUNT,
  PUBLICATION_STATES,
  RATE_CALL_COUNT,
  RATE_STEP_MS,
  T0,
  createFormationShapedCache,
  driveFormationShapedChurn,
  rowsForState,
};
