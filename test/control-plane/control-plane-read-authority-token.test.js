/**
 * Regression tests for the structural read-authority token (epic
 * formation-complexity-consolidation, O1 / quest
 * read-authority-structural-threading).
 *
 * Bug class: authority intent (leader pin, mode, consistency, readiness
 * dimension) traveled as optional booleans re-enumerated by hand at every
 * layer boundary; three 2026-07-18 incidents were drops of exactly this
 * shape. The token is built once at gateway read ingress, embedded in every
 * read coalescing identity, and threaded structurally through
 * requestOptions/executionOptions so intermediate layers cannot drop a field
 * they never enumerate.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  buildControlPlaneReadAuthority,
} from '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READ_PURPOSE,
  CONTROL_PLANE_READ_RECOVERY_ROUTING,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  COLUMN,
  NODE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ControlPlaneSystemTableGateway,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {AuthoritativeControlPlaneView} from
  '../../src/control-plane/authoritative-control-plane-view.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {
  executeAuthoritativeOwnerRpcRead,
} from '../../src/cdc/cdc-integration-service-owner-rpc-read-execution.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {MEMBERSHIP_PUBLICATION_READ_SOURCE} from
  '../../src/control-plane/membership-publication-row-contract.js';

const TABLE = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
const SQL_TEXT = 'SELECT * FROM replica_operations WHERE operation_id = ?';

function createGateway() {
  return new ControlPlaneSystemTableGateway({
    nodeId: 'node-authority-token',
    cdcIntegrationService: null,
    sqlQueryEngine: null,
    systemTableCache: null,
    messageRouter: null,
  });
}

test('membership publication threads purpose through view, CDC, owner RPC, ' +
  'and query routing without cross-purpose single-flight', async (t) => {
  const nodeId = 'node-authority-token';
  const tableName = SYSTEM_TABLE_NAME.NODES;
  const partitionId = INITIAL_PARTITION_IDS[tableName];
  const nodeRow = {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: NODE_STATE.ACTIVE,
    [COLUMN.LAST_HEARTBEAT]: Date.now(),
    [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() + 60_000,
    connection_state: 'ready',
  };
  const serviceRow = {
    service_id: 'nodes-owner',
    replica_id: 'nodes-owner',
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: partitionId,
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    address: `${nodeId}/partition/${partitionId}`,
    raft_role: 'leader',
  };
  const partitionRow = {
    partition_id: partitionId,
    table_name: tableName,
    leader_node_id: nodeId,
  };
  const cache = {
    get(candidateTable, key) {
      if (candidateTable === SYSTEM_TABLE_NAME.PARTITIONS &&
          key === partitionId) {
        return partitionRow;
      }
      return null;
    },
    getAll(candidateTable) {
      if (candidateTable === SYSTEM_TABLE_NAME.SERVICES) return [serviceRow];
      if (candidateTable === SYSTEM_TABLE_NAME.PARTITIONS) return [partitionRow];
      if (candidateTable === tableName) return [nodeRow];
      return [];
    },
    filter(candidateTable, predicate) {
      return this.getAll(candidateTable).filter(predicate);
    },
  };
  let ordinaryReadinessCount = 0;
  const readiness = {
    getControlPlaneParticipationSync() {
      ordinaryReadinessCount++;
      return {eligible: true, snapshot: null};
    },
    getNodeRow: () => nodeRow,
    getNodeTransportState: () => ({connected: true}),
  };
  const messageRouter = {
    getConnectionState: () => 'connected',
    async deliver() {
      return {acknowledged: true, success: true, rows: [nodeRow]};
    },
  };
  const productionExecutor = new QueryExecutor({
    nodeId,
    systemCache: cache,
    controlPlaneReadinessService: readiness,
    messageRouter,
  });
  productionExecutor.readRetryAttempts = 1;
  const ownerRpcService = {
    nodeId,
    logger: {info: () => {}, warn: () => {}, error: () => {}},
    sqlQueryEngine: {queryExecutor: productionExecutor},
  };
  const observedAuthorities = [];
  const cdcIntegrationService = {
    async executeAuthoritativeSystemTableRead(
      requestedTable,
      sql,
      params,
      options,
    ) {
      observedAuthorities.push({
        top: options.readAuthority,
        query: options.queryOptions?.readAuthority,
      });
      return executeAuthoritativeOwnerRpcRead(
        ownerRpcService,
        requestedTable,
        sql,
        params,
        options,
        {},
      );
    },
  };
  const view = new AuthoritativeControlPlaneView({
    nodeId,
    cdcIntegrationService,
    pressureGovernor: {
      configure: () => {},
      admit: async () => ({action: 'admit'}),
    },
  });
  const coordinator = new MembershipPublicationCoordinator({
    nodeId,
    systemTableCache: cache,
    cdcIntegrationService,
    authoritativeControlPlaneView: view,
  });
  const internalRead = coordinator.readTableRows(tableName, {
    readSource: MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
    purpose: CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL,
  });
  const ordinaryRead = coordinator.readTableRows(tableName, {
    readSource: MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
  });
  const [internalRows, ordinaryRows] = await Promise.all([
    internalRead,
    ordinaryRead,
  ]);
  t.equal(internalRows.length, 1,
    'the production membership chain completes its internal owner read');
  t.equal(ordinaryRows.length, 1,
    'the concurrent ordinary read remains independently usable');
  t.equal(observedAuthorities.length, 2,
    'ordinary and readiness-internal reads do not share one in-flight read');
  t.equal(
    observedAuthorities[0].top.purpose,
    CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL,
    'view threads the frozen internal purpose to CDC request options',
  );
  t.equal(
    observedAuthorities[0].query,
    observedAuthorities[0].top,
    'query execution receives the identical frozen authority token',
  );
  t.equal(ordinaryReadinessCount, 1,
    'only the concurrent ordinary read enters full readiness policy');
  coordinator.shutdown?.();
});

test('read coalescing identity distinguishes every authority field, ' +
  'including preferred/required leader authority and observation scope, ' +
  'in both key forms',
async (t) => {
  const gateway = createGateway();
  const buildOptions = (authority, options = {}) => ({
    ...options,
    readAuthority: buildControlPlaneReadAuthority(authority),
  });
  const base = buildOptions({});
  const variants = [
    {leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED},
    {leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED},
    {purpose: CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL},
    {
      recoveryRouting:
        CONTROL_PLANE_READ_RECOVERY_ROUTING.PRIORITY_RECOVERY_BOOTSTRAP,
    },
    {
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    },
    {
      authoritativeObservationScope:
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
    },
  ];
  const baseKey =
    gateway.buildReadRequestKey(TABLE, SQL_TEXT, ['op-1'], base);
  for (const variant of variants) {
    const variantKey =
      gateway.buildReadRequestKey(
        TABLE,
        SQL_TEXT,
        ['op-1'],
        buildOptions(variant),
      );
    t.not(
      variantKey,
      baseKey,
      `implicit key must differ for ${Object.keys(variant)[0]}`,
    );
    const explicitBase = gateway.buildReadRequestKey(
      TABLE, SQL_TEXT, ['op-1'], {...base, coalescingKey: 'shared'},
    );
    const explicitVariant = gateway.buildReadRequestKey(
      TABLE,
      SQL_TEXT,
      ['op-1'],
      buildOptions(variant, {coalescingKey: 'shared'}),
    );
    t.not(
      explicitVariant,
      explicitBase,
      `explicit key must differ for ${Object.keys(variant)[0]}`,
    );
  }
});

test('the authority constructor accepts one flat draft form and ignores the ' +
  'retired nested-token form',
async (t) => {
  const token = buildControlPlaneReadAuthority({
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  });
  const rebuilt = buildControlPlaneReadAuthority({
    readAuthority: token,
  });
  t.not(rebuilt, token, 'constructor emits one fresh canonical token');
  t.equal(Object.isFrozen(rebuilt), true, 'canonical token is immutable');
  t.equal(rebuilt.leaderMode, CONTROL_PLANE_READ_LEADER_MODE.ANY,
    'a nested token is not accepted as a second constructor form');
  t.equal(
    rebuilt.authoritativeReadMode,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
    'nested authority policy is not silently imported',
  );
  t.equal(rebuilt.purpose, CONTROL_PLANE_READ_PURPOSE.ORDINARY);
});

test('CDC owner-RPC execution pins the partition leader from the token alone',
  async (t) => {
    const executeCalls = [];
    const service = {
      nodeId: 'node-authority-token',
      logger: {info: () => {}, warn: () => {}, error: () => {}},
      sqlQueryEngine: {
        queryExecutor: {
          executeOnPartition: async (
            partitionId, statement, params, isRead, preferLeader,
          ) => {
            executeCalls.push({partitionId, statement, params, preferLeader});
            return {success: true, rows: [{operation_id: 'op-1'}]};
          },
        },
      },
    };

    const tokenOnlyOptions = {
      readAuthority: buildControlPlaneReadAuthority({
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
      }),
    };
    await executeAuthoritativeOwnerRpcRead(
      service, TABLE, SQL_TEXT, ['op-1'], tokenOnlyOptions, {},
    );
    t.equal(executeCalls.length, 1, 'owner-RPC read executed');
    t.equal(
      executeCalls[0].preferLeader,
      true,
      'leader pin honored from the structural token',
    );

    await executeAuthoritativeOwnerRpcRead(
      service, TABLE, SQL_TEXT, ['op-1'],
      {readAuthority: buildControlPlaneReadAuthority({})}, {},
    );
    t.equal(
      executeCalls[1].preferLeader,
      false,
      'default routing stays un-pinned when the token does not request it',
    );
  });

test('CDC owner-RPC execution rejects a field-level authority bag', async (t) => {
  let deliveryCount = 0;
  const result = await executeAuthoritativeOwnerRpcRead(
    {
      sqlQueryEngine: {
        queryExecutor: {
          async executeOnPartition() {
            deliveryCount++;
            return {success: true, rows: []};
          },
        },
      },
    },
    TABLE,
    SQL_TEXT,
    [],
    {preferOwnerRpcReadLeader: true},
    {},
  );

  t.equal(result, null, 'non-canonical authority fails closed');
  t.equal(deliveryCount, 0, 'no owner delivery occurs without a token');
});

test('readiness-internal owner RPC routes without re-entering readiness',
  async (t) => {
    const partitionId = INITIAL_PARTITION_IDS[TABLE];
    const serviceRow = {
      service_id: 'replica-operations-owner',
      replica_id: 'replica-operations-owner',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: partitionId,
      node_id: 'node-authority-token',
      status: SERVICE_STATUS.ACTIVE,
      address: `node-authority-token/partition/${partitionId}`,
      raft_role: 'leader',
    };
    const partitionRow = {
      partition_id: partitionId,
      table_name: TABLE,
      leader_node_id: 'node-authority-token',
    };
    const cache = {
      get(tableName, key) {
        if (tableName === 'partitions' && key === partitionId) {
          return partitionRow;
        }
        return null;
      },
      getAll(tableName) {
        if (tableName === 'services') return [serviceRow];
        if (tableName === 'partitions') return [partitionRow];
        return [];
      },
      filter(tableName, predicate) {
        return this.getAll(tableName).filter(predicate);
      },
    };
    let readinessDepth = 0;
    let maxReadinessDepth = 0;
    let asyncReadinessRepairCount = 0;
    const readiness = {
      getControlPlaneParticipationSync() {
        readinessDepth++;
        maxReadinessDepth = Math.max(maxReadinessDepth, readinessDepth);
        readinessDepth--;
        return {eligible: true, snapshot: null};
      },
      async getNodeReadiness() {
        asyncReadinessRepairCount++;
        return {dimensions: {repairEligible: true}};
      },
      getNodeRow() {
        return {
          [COLUMN.NODE_ID]: 'node-authority-token',
          [COLUMN.STATUS]: NODE_STATE.ACTIVE,
          [COLUMN.LAST_HEARTBEAT]: Date.now(),
          [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() + 60_000,
          connection_state: 'ready',
        };
      },
      getNodeTransportState() {
        return {connected: true};
      },
    };
    let handlerReady = false;
    let deliveryCount = 0;
    const messageRouter = {
      getConnectionState: () => 'connected',
      async deliver() {
        deliveryCount++;
        if (!handlerReady) {
          return {
            acknowledged: true,
            success: false,
            noHandler: true,
            error: 'No handler registered for partition service',
          };
        }
        return {acknowledged: true, success: true, rows: []};
      },
    };
    const productionExecutor = new QueryExecutor({
      nodeId: 'node-authority-token',
      systemCache: cache,
      controlPlaneReadinessService: readiness,
      messageRouter,
      noHandlerAddressQuarantineMs: 1,
    });
    productionExecutor.readRetryAttempts = 1;
    const service = {
      nodeId: 'node-authority-token',
      logger: {info: () => {}, warn: () => {}, error: () => {}},
      sqlQueryEngine: {
        queryExecutor: {
          executeOnPartition: async (
            routedPartitionId,
            _statement,
            _params,
            _forRead,
            _preferLeader,
            _preferSameLatencyGroup,
            executionOptions,
          ) => {
            const snapshot = productionExecutor.getPartitionRoutingSnapshot(
              routedPartitionId,
              executionOptions.routingReadinessDimension,
              {readAuthority: executionOptions.readAuthority},
            );
            return {success: snapshot.routableServiceCount > 0, rows: []};
          },
        },
      },
    };

    const result = await executeAuthoritativeOwnerRpcRead(
      service,
      TABLE,
      SQL_TEXT,
      ['op-1'],
      {
        readAuthority: buildControlPlaneReadAuthority({
          purpose: CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL,
          routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
        }),
      },
      {},
    );
    t.equal(result.success, true, 'minimal owner/transport route remains usable');
    t.equal(maxReadinessDepth, 0, 'readiness-internal routing recursion is zero');

    productionExecutor.getPartitionRoutingSnapshot(
      partitionId,
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    );
    t.equal(
      maxReadinessDepth,
      1,
      'ordinary routing retains the existing readiness participation policy',
    );

    const readinessReadAuthority = buildControlPlaneReadAuthority({
      purpose: CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    });
    const missingHandler = await productionExecutor.executeOnPartition(
      partitionId,
      SQL_TEXT,
      ['op-1'],
      true,
      true,
      false,
      {readAuthority: readinessReadAuthority},
    );
    t.equal(missingHandler.success, false,
      'a structural route still preserves the runtime no-handler failure');
    t.equal(maxReadinessDepth, 1,
      'no-handler recovery does not re-enter readiness adjudication');
    t.equal(asyncReadinessRepairCount, 0,
      'no-handler recovery does not invoke async readiness repair');

    handlerReady = true;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const lateDelivery = await productionExecutor.executeOnPartition(
      partitionId,
      SQL_TEXT,
      ['op-1'],
      true,
      true,
      false,
      {readAuthority: readinessReadAuthority},
    );
    t.equal(lateDelivery.success, true,
      'late handler installation restores the same structural owner route');
    t.equal(deliveryCount, 2,
      'the expired no-handler witness does not permanently suppress delivery');
    t.equal(asyncReadinessRepairCount, 0,
      'late delivery also leaves readiness repair recursion closed');
  });
