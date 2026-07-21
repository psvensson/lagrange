import t from 'tap';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  createTestCoordinator,
} from '../rebalancer/test-helpers.js';

const LEDGER_PARTITION_ID = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
const SECOND_LEDGER_PARTITION_ID =
  `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p2`;
const DEPENDENT_PARTITION_ID =
  `${SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS}-p1`;
const QUORUM_CONCENTRATED_REASON =
  'operation_ledger_quorum_concentrated';
const NODE_IDS = Object.freeze([
  'node-0',
  'node-1',
  'node-2',
  'node-3',
  'node-4',
]);

function buildLedgerRows(partitionId, nodeIds) {
  return nodeIds.map((nodeId, index) => ({
    service_id: `${partitionId}-r${index + 1}`,
    replica_id: `${partitionId}-r${index + 1}`,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: nodeId,
    status: 'active',
    raft_role: index === 0 ? 'leader' : 'follower',
  }));
}

function buildCacheData(localPlacements) {
  return {
    nodes: NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      connection_state: 'ready',
    })),
    partitions: Object.keys(localPlacements).map((partitionId) => ({
      partition_id: partitionId,
      replica_count: 3,
    })),
    services: Object.entries(localPlacements).flatMap(
      ([partitionId, nodeIds]) => buildLedgerRows(partitionId, nodeIds),
    ),
  };
}

async function runDependentAdmission({
  localPlacements,
  authoritativePlacements,
  authoritativeSources = {},
  malformedPartitionIds = [],
  unavailablePartitionIds = [],
}) {
  const authoritativeReads = [];
  const malformed = new Set(malformedPartitionIds);
  const unavailable = new Set(unavailablePartitionIds);
  const gateway = {
    async readAuthoritativeRows(tableName, _sql, params = [], options = {}) {
      if (tableName !== SYSTEM_TABLE_NAME.SERVICES) {
        return {success: true, rows: []};
      }
      const partitionId = params[1];
      authoritativeReads.push({
        partitionId,
        options: {...options},
      });
      if (unavailable.has(partitionId)) {
        return {
          success: false,
          error: 'services owner unavailable',
          rows: [],
        };
      }
      return {
        success: true,
        source: authoritativeSources[partitionId] || 'owner_rpc_lane',
        rows: malformed.has(partitionId) ?
          {} :
          buildLedgerRows(
            partitionId,
            authoritativePlacements[partitionId] || [],
          ),
      };
    },
    async readRows(tableName, sql, params = [], options = {}) {
      return this.readAuthoritativeRows(tableName, sql, params, options);
    },
  };
  const coordinator = createTestCoordinator({
    nodeId: 'node-2',
    cacheData: buildCacheData(localPlacements),
    controlPlaneSystemTableGateway: gateway,
  });
  coordinator.queryIncompleteOperations = async () => [];
  coordinator.queryShutdownIncompleteOperations = async () => [];
  let verdict = 'ADMITTED';
  try {
    await coordinator.ensureOperationLedgerSelfMoveSerialized({
      normalizedMoveType: OperationType.ADD,
      partitionId: DEPENDENT_PARTITION_ID,
      entityType: 'partition',
      entityId: DEPENDENT_PARTITION_ID,
      move: {},
    });
  } catch (error) {
    verdict =
      error?.admissionResult?.reason ||
      error?.rebalanceSkipReason ||
      'ERROR';
  } finally {
    await coordinator.shutdown();
  }
  return {authoritativeReads, verdict};
}

t.test(
  'a cache-local concentration hold releases only after the services owner ' +
    'proves the ledger is completely spread',
  async (t) => {
    const result = await runDependentAdmission({
      localPlacements: {
        [LEDGER_PARTITION_ID]: ['node-0', 'node-0', 'node-0'],
      },
      authoritativePlacements: {
        [LEDGER_PARTITION_ID]: ['node-0', 'node-1', 'node-2'],
      },
    });

    t.equal(
      result.verdict,
      'ADMITTED',
      'the final dependent ADD is not pinned by stale coordinator-local rows',
    );
    t.equal(result.authoritativeReads.length, 1);
    t.equal(
      result.authoritativeReads[0].partitionId,
      LEDGER_PARTITION_ID,
    );
    t.equal(
      result.authoritativeReads[0].options.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      'confirmation requires the services-table owner RPC lane',
    );
    t.equal(
      result.authoritativeReads[0].options.allowSqlFallback,
      false,
      'a SQL projection cannot release the cache-local safety hold',
    );
    t.equal(
      result.authoritativeReads[0].options.preferOwnerRpcReadLeader,
      true,
      'the owner read prefers its current leader',
    );
  },
);

for (const testCase of [
  {
    name: 'authoritatively concentrated',
    authoritativePlacements: {
      [LEDGER_PARTITION_ID]: ['node-0', 'node-0', 'node-0'],
    },
  },
  {
    name: 'authoritatively incomplete',
    authoritativePlacements: {
      [LEDGER_PARTITION_ID]: ['node-0', 'node-1'],
    },
  },
  {
    name: 'authoritative observation unavailable',
    authoritativePlacements: {},
    unavailablePartitionIds: [LEDGER_PARTITION_ID],
  },
  {
    name: 'malformed owner observation',
    authoritativePlacements: {
      [LEDGER_PARTITION_ID]: ['node-0', 'node-1', 'node-2'],
    },
    malformedPartitionIds: [LEDGER_PARTITION_ID],
  },
  {
    name: 'SQL projection labeled as authoritative',
    authoritativePlacements: {
      [LEDGER_PARTITION_ID]: ['node-0', 'node-1', 'node-2'],
    },
    authoritativeSources: {
      [LEDGER_PARTITION_ID]: 'sql_query_engine',
    },
  },
]) {
  t.test(`${testCase.name} evidence keeps the dependent hold engaged`,
    async (t) => {
      const result = await runDependentAdmission({
        localPlacements: {
          [LEDGER_PARTITION_ID]: ['node-0', 'node-0', 'node-0'],
        },
        authoritativePlacements: testCase.authoritativePlacements,
        authoritativeSources: testCase.authoritativeSources,
        malformedPartitionIds: testCase.malformedPartitionIds,
        unavailablePartitionIds: testCase.unavailablePartitionIds,
      });
      t.equal(result.verdict, QUORUM_CONCENTRATED_REASON);
      t.equal(result.authoritativeReads.length, 1);
    });
}

t.test(
  'a spread-looking local follower fallback cannot release the stale hold',
  async (t) => {
    const result = await runDependentAdmission({
      localPlacements: {
        [LEDGER_PARTITION_ID]: ['node-0', 'node-0', 'node-0'],
      },
      authoritativePlacements: {
        [LEDGER_PARTITION_ID]: ['node-0', 'node-1', 'node-2'],
      },
      authoritativeSources: {
        [LEDGER_PARTITION_ID]: 'local_partition_replica',
      },
    });

    t.equal(result.verdict, QUORUM_CONCENTRATED_REASON);
    t.equal(result.authoritativeReads.length, 1);
  },
);

t.test(
  'every locally actionable ledger hold must have complete authoritative ' +
    'spread proof before dependent admission releases',
  async (t) => {
    const result = await runDependentAdmission({
      localPlacements: {
        [LEDGER_PARTITION_ID]: ['node-0', 'node-0', 'node-0'],
        [SECOND_LEDGER_PARTITION_ID]: ['node-0', 'node-0', 'node-0'],
      },
      authoritativePlacements: {
        [LEDGER_PARTITION_ID]: ['node-0', 'node-1', 'node-2'],
        [SECOND_LEDGER_PARTITION_ID]: ['node-0', 'node-0', 'node-0'],
      },
    });

    t.equal(result.verdict, QUORUM_CONCENTRATED_REASON);
    t.same(
      result.authoritativeReads.map((read) => read.partitionId),
      [LEDGER_PARTITION_ID, SECOND_LEDGER_PARTITION_ID],
      'the first spread answer cannot hide another engaged ledger hold',
    );
  },
);

t.test(
  'the no-local-hold path admits without adding an authoritative read',
  async (t) => {
    const result = await runDependentAdmission({
      localPlacements: {
        [LEDGER_PARTITION_ID]: ['node-0', 'node-1', 'node-2'],
      },
      authoritativePlacements: {},
    });

    t.equal(result.verdict, 'ADMITTED');
    t.equal(
      result.authoritativeReads.length,
      0,
      'owner verification remains bounded to a positive cache-local hold',
    );
  },
);
