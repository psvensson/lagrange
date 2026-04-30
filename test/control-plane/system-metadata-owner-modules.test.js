import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
  ControlPlanePublicationsOwner,
  createSystemMetadataOwners,
  LogsOwner,
  MessageGroupsOwner,
  NodesOwner,
  PartitionsOwner,
  ReplicaOperationsOwner,
  ServiceDefinitionsOwner,
  ServiceEndpointsOwner,
  ServicesOwner,
} from '../../src/control-plane/owners/index.js';

const TEST_PUBLICATION_READ_PROFILE_DIAGNOSTICS = 'diagnostics';
const TEST_PUBLICATION_READ_PROFILE_PLANNING = 'planning';
const TEST_PUBLICATION_ID = 'publication-1';

test('System metadata owner modules exist for each shared metadata family',
  async (t) => {
    const ownerSpecs = [
      [NodesOwner, 'nodes-owner', TABLES.NODES],
      [ServicesOwner, 'services-owner', TABLES.SERVICES],
      [PartitionsOwner, 'partitions-owner', TABLES.PARTITIONS],
      [MessageGroupsOwner, 'message-groups-owner', TABLES.MESSAGE_GROUPS],
      [
        ReplicaOperationsOwner,
        'replica-operations-owner',
        TABLES.REPLICA_OPERATIONS,
      ],
      [LogsOwner, 'logs-owner', TABLES.LOGS],
      [
        ServiceEndpointsOwner,
        'service-endpoints-owner',
        TABLES.SERVICE_ENDPOINTS,
      ],
      [
        ServiceDefinitionsOwner,
        'service-definitions-owner',
        TABLES.SERVICE_DEFINITIONS,
      ],
    ];

    for (const [OwnerClass, ownerName, tableName] of ownerSpecs) {
      const owner = new OwnerClass();
      t.equal(owner.getOwnerName(), ownerName,
        `${ownerName} should expose its semantic owner name`);
      t.equal(owner.getTableName(), tableName,
        `${ownerName} should expose its primary table`);
      t.equal(owner.getGateway(), null,
        `${ownerName} should default to no gateway until composition wires it`);
    }
  });

test('createSystemMetadataOwners wires one shared gateway and cache into every owner',
  async (t) => {
    const gateway = {name: 'shared-gateway'};
    const systemTableCache = {name: 'shared-cache'};
    const owners = createSystemMetadataOwners({
      controlPlaneSystemTableGateway: gateway,
      systemTableCache,
    });

    t.equal(Object.isFrozen(owners), true,
      'owner bundle should be frozen once composed');
    for (const owner of Object.values(owners)) {
      t.equal(owner.getGateway(), gateway,
        'owner bundle should share one injected gateway');
      t.equal(owner.getSystemTableCache(), systemTableCache,
        'owner bundle should share one injected cache handle');
    }
  });

test('ControlPlanePublicationsOwner marks publication mutations as ' +
  'critical deferrable writes', async (t) => {
  const gatewayCalls = [];
  const gateway = {
    async upsertSystemTableRow(tableName, row, options) {
      gatewayCalls.push({
        tableName,
        row,
        options,
      });
      return {success: true};
    },
  };

  const owner = new ControlPlanePublicationsOwner({
    controlPlaneSystemTableGateway: gateway,
  });

  await owner.upsertPublication({
    publication_id: 'publication-1',
    status: 'OPEN',
  });

  t.equal(
    gatewayCalls.length,
    1,
    'publication owner should route the upsert through the gateway',
  );
  t.equal(
    gatewayCalls[0]?.tableName,
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    'publication owner should target the control_plane_publications table',
  );
  t.equal(
    gatewayCalls[0]?.options?.workClass,
    'critical',
    'publication mutations should use the critical work class',
  );
  t.equal(
    gatewayCalls[0]?.options?.deliveryPriority,
    'critical',
    'publication mutations should keep critical delivery priority',
  );
  t.equal(
    gatewayCalls[0]?.options?.allowPressureDefer,
    true,
    'publication mutations should defer behind transport pressure',
  );
  t.equal(
    gatewayCalls[0]?.options?.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'publication mutations should route through recovery-eligible readiness',
  );
  t.equal(
    gatewayCalls[0]?.options?.workloadClass,
    CONTROL_PLANE_WORKLOAD_CLASS.PUBLICATION_MUTATION,
    'publication mutations should carry the shared membership-publication workload class',
  );
});

test('ControlPlanePublicationsOwner routes authoritative publication reads ' +
  'through recovery-eligible readiness', async (t) => {
  const gatewayCalls = [];
  const gateway = {
    async readAuthoritativeRows(tableName, sql, params, options) {
      gatewayCalls.push({
        tableName,
        sql,
        params,
        options,
      });
      return {success: true, rows: []};
    },
  };

  const owner = new ControlPlanePublicationsOwner({
    controlPlaneSystemTableGateway: gateway,
  });

  await owner.listPublications({
    readProfile: TEST_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
  });
  await owner.getPublication(TEST_PUBLICATION_ID, {
    readProfile: TEST_PUBLICATION_READ_PROFILE_PLANNING,
  });

  t.equal(
    gatewayCalls.length,
    2,
    'publication owner should route both list and get reads through the gateway',
  );
  t.equal(
    gatewayCalls.every((call) =>
      call?.options?.routingReadinessDimension ===
        CONTROL_PLANE_READINESS_DIMENSION
          .CONTROL_PLANE_RECOVERY_ELIGIBLE),
    true,
    'publication reads should use recovery-eligible routing semantics',
  );
  t.same(
    gatewayCalls.map((call) => call?.options?.readProfile),
    [
      TEST_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
      TEST_PUBLICATION_READ_PROFILE_PLANNING,
    ],
    'publication reads should preserve the caller read profile',
  );
});

test('System metadata owners route typed read and mutation methods through the gateway',
  async (t) => {
    const gatewayCalls = [];
    const gateway = {
      async readAuthoritativeRows(tableName, sql, params, options) {
        gatewayCalls.push({
          method: 'readAuthoritativeRows',
          tableName,
          sql,
          params,
          options,
        });
        return {success: true, rows: []};
      },
      async readProjectionRows(tableName, options) {
        gatewayCalls.push({
          method: 'readProjectionRows',
          tableName,
          options,
        });
        return {success: true, rows: []};
      },
      async insertSystemTableRow(tableName, row, options) {
        gatewayCalls.push({
          method: 'insertSystemTableRow',
          tableName,
          row,
          options,
        });
        return {success: true};
      },
      async upsertSystemTableRow(tableName, row, options) {
        gatewayCalls.push({
          method: 'upsertSystemTableRow',
          tableName,
          row,
          options,
        });
        return {success: true};
      },
      async updateSystemTableRow(tableName, whereClause, data, options) {
        gatewayCalls.push({
          method: 'updateSystemTableRow',
          tableName,
          whereClause,
          data,
          options,
        });
        return {success: true};
      },
      async deleteSystemTableRow(tableName, whereClause, options) {
        gatewayCalls.push({
          method: 'deleteSystemTableRow',
          tableName,
          whereClause,
          options,
        });
        return {success: true};
      },
    };

    const ownerSpecs = [
      {
        OwnerClass: NodesOwner,
        tableName: TABLES.NODES,
        key: 'node-1',
        readMethod: 'getNode',
        listMethod: 'listNodes',
        insertMethod: 'insertNode',
        upsertMethod: 'upsertNode',
        updateMethod: 'updateNode',
        deleteMethod: 'removeNode',
        row: {node_id: 'node-1'},
      },
      {
        OwnerClass: ServicesOwner,
        tableName: TABLES.SERVICES,
        key: 'svc-1',
        readMethod: 'getService',
        listMethod: 'listServices',
        insertMethod: 'insertService',
        upsertMethod: 'upsertService',
        updateMethod: 'updateService',
        deleteMethod: 'removeService',
        row: {service_id: 'svc-1'},
      },
      {
        OwnerClass: PartitionsOwner,
        tableName: TABLES.PARTITIONS,
        key: 'part-1',
        readMethod: 'getPartition',
        listMethod: 'listPartitions',
        insertMethod: 'insertPartition',
        upsertMethod: 'upsertPartition',
        updateMethod: 'updatePartition',
        deleteMethod: 'removePartition',
        row: {partition_id: 'part-1'},
      },
      {
        OwnerClass: MessageGroupsOwner,
        tableName: TABLES.MESSAGE_GROUPS,
        key: 'group-1',
        readMethod: 'getMessageGroup',
        listMethod: 'listMessageGroups',
        insertMethod: 'insertMessageGroup',
        upsertMethod: 'upsertMessageGroup',
        updateMethod: 'updateMessageGroup',
        deleteMethod: 'removeMessageGroup',
        row: {group_id: 'group-1'},
      },
      {
        OwnerClass: ReplicaOperationsOwner,
        tableName: TABLES.REPLICA_OPERATIONS,
        key: 'assign-1',
        readMethod: 'getReplicaOperation',
        listMethod: 'listReplicaOperations',
        insertMethod: 'insertReplicaOperation',
        upsertMethod: 'upsertReplicaOperation',
        updateMethod: 'updateReplicaOperation',
        deleteMethod: 'removeReplicaOperation',
        row: {assignment_id: 'assign-1'},
      },
      {
        OwnerClass: LogsOwner,
        tableName: TABLES.LOGS,
        key: 'log-1',
        readMethod: 'getLog',
        listMethod: 'listLogs',
        insertMethod: 'appendLog',
        upsertMethod: 'upsertLog',
        updateMethod: 'updateLog',
        deleteMethod: 'removeLog',
        row: {id: 'log-1'},
      },
      {
        OwnerClass: ServiceEndpointsOwner,
        tableName: TABLES.SERVICE_ENDPOINTS,
        key: 'endpoint-1',
        readMethod: 'getEndpoint',
        listMethod: 'listEndpoints',
        insertMethod: 'insertEndpoint',
        upsertMethod: 'upsertEndpoint',
        updateMethod: 'updateEndpoint',
        deleteMethod: 'removeEndpoint',
        row: {endpoint_id: 'endpoint-1'},
      },
      {
        OwnerClass: ServiceDefinitionsOwner,
        tableName: TABLES.SERVICE_DEFINITIONS,
        key: 'svc-def-1',
        readMethod: 'getServiceDefinition',
        listMethod: 'listServiceDefinitions',
        insertMethod: 'insertServiceDefinition',
        upsertMethod: 'upsertServiceDefinition',
        updateMethod: 'updateServiceDefinition',
        deleteMethod: 'removeServiceDefinition',
        row: {service_name: 'svc-def-1'},
      },
    ];

    for (const ownerSpec of ownerSpecs) {
      gatewayCalls.length = 0;
      const owner = new ownerSpec.OwnerClass({
        controlPlaneSystemTableGateway: gateway,
      });

      await owner[ownerSpec.readMethod](ownerSpec.key);
      await owner[ownerSpec.listMethod]();
      await owner[ownerSpec.insertMethod](ownerSpec.row);
      await owner[ownerSpec.upsertMethod](ownerSpec.row);
      await owner[ownerSpec.updateMethod](ownerSpec.key, {status: 'active'});
      await owner[ownerSpec.deleteMethod](ownerSpec.key);

      t.equal(
        gatewayCalls[0].method,
        'readAuthoritativeRows',
        `${ownerSpec.readMethod} should route through gateway reads`,
      );
      t.equal(
        gatewayCalls[0].tableName,
        ownerSpec.tableName,
        `${ownerSpec.readMethod} should target the owner table`,
      );
      t.equal(
        gatewayCalls[1].method,
        'readAuthoritativeRows',
        `${ownerSpec.listMethod} should route through gateway reads`,
      );
      t.equal(
        gatewayCalls[2].method,
        'insertSystemTableRow',
        `${ownerSpec.insertMethod} should route through gateway inserts`,
      );
      t.equal(
        gatewayCalls[3].method,
        'upsertSystemTableRow',
        `${ownerSpec.upsertMethod} should route through gateway upserts`,
      );
      t.equal(
        gatewayCalls[4].method,
        'updateSystemTableRow',
        `${ownerSpec.updateMethod} should route through gateway updates`,
      );
      t.equal(
        gatewayCalls[5].method,
        'deleteSystemTableRow',
        `${ownerSpec.deleteMethod} should route through gateway deletes`,
      );
    }
  });

test('System metadata owners retry transient mutation failures and apply ' +
  'primary-key upsert coalescing by default', async (t) => {
  let upsertCallCount = 0;
  const observedOptions = [];
  const owner = new NodesOwner({
    controlPlaneSystemTableGateway: {
      async upsertSystemTableRow(_tableName, _row, options) {
        upsertCallCount += 1;
        observedOptions.push(options);
        if (upsertCallCount === 1) {
          return {
            success: false,
            error: 'Transaction already active on this partition',
          };
        }
        return {success: true};
      },
    },
    controlPlaneWriteRetrySleep: async () => {},
    controlPlaneWriteRetryTimeoutMs: 50,
    controlPlaneWriteRetryBaseDelayMs: 1,
    controlPlaneWriteRetryMaxDelayMs: 1,
  });

  const result = await owner.upsertNode({
    node_id: 'node-1',
    status: 'active',
  });

  t.equal(result.success, true,
    'upsert should recover after one retryable mutation failure');
  t.equal(upsertCallCount, 2,
    'owner writes should retry transient control-plane mutation failures');
  t.equal(
    observedOptions[0]?.owner,
    'nodes-owner',
    'owner writes should stamp the semantic owner name onto gateway mutations',
  );
  t.equal(
    observedOptions[0]?.mergePolicy,
    CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    'full-row upserts should replace older pending writes for the same primary key',
  );
  t.equal(
    observedOptions[0]?.coalescingKey,
    'system-metadata:nodes:node-1',
    'full-row upserts should share one stable per-row coalescing key',
  );
});

test('System metadata owners throw typed errors when mutation retries still fail',
  async (t) => {
    const owner = new NodesOwner({
      controlPlaneSystemTableGateway: {
        async updateSystemTableRow() {
          return {
            success: false,
            error: 'Query execution failed',
            errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
            retryAfterMs: 250,
            deferRetry: true,
            participantFailures: [{
              error: 'control_plane_pressure_degraded',
              errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
              retryAfterMs: 250,
              deferRetry: true,
              failedTable: TABLES.NODES,
            }],
          };
        },
      },
      controlPlaneWriteRetrySleep: async () => {},
      controlPlaneWriteRetryTimeoutMs: 0,
    });

    try {
      await owner.updateNode('node-1', {status: 'active'});
      t.fail('updateNode should throw when the gateway still returns failure');
    } catch (error) {
      t.equal(error.message, 'Query execution failed');
      t.equal(error.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE');
      t.equal(error.retryAfterMs, 250);
      t.equal(error.deferRetry, true);
      t.equal(error.tableName, TABLES.NODES);
      t.equal(error.ownerName, 'nodes-owner');
      t.equal(error.operation, 'update');
      t.equal(
        error.firstFailedParticipant?.errorCode,
        'CONTROL_PLANE_PRESSURE_DEGRADED',
        'typed participant failure metadata should survive the owner boundary',
      );
    }
  });
