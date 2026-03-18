import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
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

test('System metadata owners route typed read and mutation methods through the gateway',
  async (t) => {
    const gatewayCalls = [];
    const gateway = {
      async readRows(tableName, sql, params, options) {
        gatewayCalls.push({
          method: 'readRows',
          tableName,
          sql,
          params,
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
        'readRows',
        `${ownerSpec.readMethod} should route through gateway reads`,
      );
      t.equal(
        gatewayCalls[0].tableName,
        ownerSpec.tableName,
        `${ownerSpec.readMethod} should target the owner table`,
      );
      t.equal(
        gatewayCalls[1].method,
        'readRows',
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
