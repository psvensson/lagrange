import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATION,
  COLUMN,
  ENDPOINT_STATUS,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {getSystemCachePrimaryKeyFieldOrFallback} from
  '../../src/cache/system-cache-key-descriptor.js';
import {
  ReadinessPlanningSemanticGenerationTracker,
  planningIdentitiesEqual,
} from '../../src/control-plane/readiness-planning-semantic-generation.js';
import {
  readConnectedNodeFingerprint,
  shouldResetReadinessBuildAttempts,
} from '../../src/control-plane/readiness-planning-version-contract.js';

const NODE_A = 'node-a';
const NODE_B = 'node-b';
const USER_PARTITION_ID = 'ratings:p1';
const PRIORITY_PARTITION_ID = 'control_plane_publications-p1';
const SOURCE_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICES,
  TABLES.PARTITIONS,
  TABLES.REPLICA_OPERATIONS,
  TABLES.STORAGE_RESERVATIONS,
  TABLES.CONTROL_PLANE_PUBLICATIONS,
]);

function createFixture(initialRows = {}) {
  const rowsByTable = new Map();
  const revisions = new Map();
  for (const tableName of SOURCE_TABLES) {
    rowsByTable.set(tableName, new Map());
    revisions.set(tableName, 0);
    const rows = initialRows[tableName] || [];
    for (const row of rows) {
      const keyField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
      rowsByTable.get(tableName).set(
        String(row[keyField]),
        Object.freeze({...row}),
      );
    }
  }
  const cache = {
    getAll: (tableName) => [...(rowsByTable.get(tableName)?.values() || [])],
    getTableMutationVersion: (tableName) => revisions.get(tableName) || 0,
  };
  const tracker = new ReadinessPlanningSemanticGenerationTracker();
  tracker.initializeSourceRevisionTracking(cache);
  tracker.ensureSourceRevisionBaseline(tracker.readSourceObservation(cache),
    cache);

  const apply = (tableName, operation, row, options = {}) => {
    const tableRows = rowsByTable.get(tableName);
    const keyField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
    const key = String(row?.[keyField]);
    let eventRecord = row;
    if (operation === CDC_OPERATION.DELETE) {
      eventRecord = tableRows.get(key) || row;
      tableRows.delete(key);
    } else {
      eventRecord = Object.freeze({
        ...(tableRows.get(key) || {}),
        ...row,
      });
      tableRows.set(key, eventRecord);
    }
    const increment = options.revisionIncrement ?? 1;
    const revision = (revisions.get(tableName) || 0) + increment;
    revisions.set(tableName, revision);
    return tracker.recordTableChange(
      tableName,
      operation,
      eventRecord,
      options.sourceRevision ?? revision,
      tracker.readSourceObservation(cache),
    );
  };
  return {apply, cache, revisions, rowsByTable, tracker};
}

function nodeRow(nodeId) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: 'ready',
    [COLUMN.LAST_HEARTBEAT]: 1_000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: 2_000,
    [COLUMN.CPU_USAGE_PERCENT]: 10,
    [COLUMN.MEMORY_USAGE_PERCENT]: 20,
    [COLUMN.DISK_USAGE_PERCENT]: 30,
  };
}

function serviceRow(serviceId, nodeId, partitionId = USER_PARTITION_ID) {
  return {
    [COLUMN.ADDRESS]: `ws://${nodeId}/${serviceId}`,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
  };
}

function endpointRow(endpointId, nodeId, status = ENDPOINT_STATUS.ACTIVE) {
  return {
    [COLUMN.ADDRESS]: `ws://${nodeId}`,
    [COLUMN.ENDPOINT_ID]: endpointId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: status,
    [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
  };
}

test('direct planning table classifier keeps raw cadence separate from node ' +
  'semantics', (t) => {
  const fixture = createFixture({
    [TABLES.NODES]: [nodeRow(NODE_A), nodeRow(NODE_B)],
  });
  const beforeA = fixture.tracker.captureIdentity(NODE_A);
  const heartbeat = fixture.apply(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.NODE_ID]: NODE_A,
    [COLUMN.LAST_HEARTBEAT]: 1_001,
    [COLUMN.READY_LEASE_EXPIRES_AT]: 2_001,
  });
  t.equal(heartbeat.semanticChanged, false,
    'heartbeat and lease cadence remains exclusively P-owned');
  t.ok(planningIdentitiesEqual(
    beforeA,
    fixture.tracker.captureIdentity(NODE_A),
  ), 'a P-verdict-preserving row write leaves planning currency unchanged');

  const load = fixture.apply(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.CPU_USAGE_PERCENT]: 95,
    [COLUMN.NODE_ID]: NODE_A,
  });
  t.equal(load.globalChanged, false, 'load is node-local planning evidence');
  t.same(load.affectedNodeIds, [NODE_A],
    'the load change invalidates only its node');
  t.end();
});

test('endpoint and active-service classification follows canonical first/last ' +
  'membership presence', (t) => {
  const fixture = createFixture({
    [TABLES.NODES]: [nodeRow(NODE_A)],
    [TABLES.SERVICES]: [serviceRow('service-a', NODE_A)],
  });
  const firstEndpoint = fixture.apply(
    TABLES.NODE_ENDPOINTS,
    CDC_OPERATION.INSERT,
    endpointRow('endpoint-a', NODE_A),
  );
  t.equal(firstEndpoint.globalChanged, true,
    'first canonical websocket endpoint changes shared membership evidence');
  t.same(firstEndpoint.affectedNodeIds, [NODE_A]);

  const secondEndpoint = fixture.apply(
    TABLES.NODE_ENDPOINTS,
    CDC_OPERATION.INSERT,
    endpointRow('endpoint-b', NODE_A),
  );
  t.equal(secondEndpoint.globalChanged, false,
    'another endpoint for the same node preserves shared presence');
  t.same(secondEndpoint.affectedNodeIds, [NODE_A],
    'endpoint details still invalidate that node');

  const deleteOne = fixture.apply(
    TABLES.NODE_ENDPOINTS,
    CDC_OPERATION.DELETE,
    endpointRow('endpoint-a', NODE_A),
  );
  t.equal(deleteOne.globalChanged, false,
    'deleting one of two endpoints preserves canonical presence');
  const deleteLast = fixture.apply(
    TABLES.NODE_ENDPOINTS,
    CDC_OPERATION.DELETE,
    endpointRow('endpoint-b', NODE_A),
  );
  t.equal(deleteLast.globalChanged, true,
    'deleting the last endpoint restores active-service fallback');

  const secondService = fixture.apply(TABLES.SERVICES, CDC_OPERATION.INSERT,
    serviceRow('service-b', NODE_A));
  t.equal(secondService.globalChanged, false,
    'another active service preserves fallback presence');
  const deleteFirstService = fixture.apply(
    TABLES.SERVICES,
    CDC_OPERATION.DELETE,
    serviceRow('service-a', NODE_A),
  );
  t.equal(deleteFirstService.globalChanged, false,
    'deleting one of two active services preserves fallback presence');
  const deleteLastService = fixture.apply(
    TABLES.SERVICES,
    CDC_OPERATION.DELETE,
    serviceRow('service-b', NODE_A),
  );
  t.equal(deleteLastService.globalChanged, true,
    'deleting the last active service changes shared membership evidence');
  t.end();
});

test('candidate membership and row moves retain exact old/new attribution',
  (t) => {
    const nodeC = 'node-c';
    const fixture = createFixture({
      [TABLES.NODES]: [nodeRow(NODE_A), nodeRow(NODE_B)],
      [TABLES.SERVICES]: [serviceRow('service-a', NODE_A)],
    });
    const inserted = fixture.apply(
      TABLES.NODES,
      CDC_OPERATION.INSERT,
      nodeRow(nodeC),
    );
    t.equal(inserted.globalChanged, true,
      'node insertion changes the shared candidate set');
    t.same(inserted.affectedNodeIds, [nodeC],
      'node insertion also advances its node-local evidence');
    const deleted = fixture.apply(
      TABLES.NODES,
      CDC_OPERATION.DELETE,
      nodeRow(nodeC),
    );
    t.equal(deleted.globalChanged, true,
      'node deletion changes the shared candidate set');
    t.same(deleted.affectedNodeIds, [nodeC],
      'node deletion preserves exact evicted-node attribution');

    const moved = fixture.apply(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
      [COLUMN.NODE_ID]: NODE_B,
      [COLUMN.SERVICE_ID]: 'service-a',
    });
    t.equal(moved.globalChanged, true,
      'moving the only fallback service changes shared membership evidence');
    t.same(moved.affectedNodeIds, [NODE_A, NODE_B],
      'service moves invalidate both the old and new owning nodes');
    t.end();
  });

test('priority topology is global while user capacity inputs stay with C',
  (t) => {
    const fixture = createFixture({
      [TABLES.NODES]: [nodeRow(NODE_A), nodeRow(NODE_B)],
      [TABLES.PARTITIONS]: [{
        [COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID,
        [COLUMN.TABLE_ID]: TABLES.CONTROL_PLANE_PUBLICATIONS,
      }, {
        [COLUMN.PARTITION_ID]: USER_PARTITION_ID,
        [COLUMN.TABLE_ID]: 'ratings',
      }],
      [TABLES.SERVICES]: [
        serviceRow('priority-service', NODE_A, PRIORITY_PARTITION_ID),
        serviceRow('user-service', NODE_B),
      ],
    });
    const userPartition = fixture.apply(
      TABLES.PARTITIONS,
      CDC_OPERATION.UPDATE,
      {[COLUMN.PARTITION_ID]: USER_PARTITION_ID, [COLUMN.SIZE_BYTES]: 500},
    );
    t.equal(userPartition.semanticChanged, false,
      'user partition size has no duplicate direct-planning classifier');
    const priorityPartition = fixture.apply(
      TABLES.PARTITIONS,
      CDC_OPERATION.UPDATE,
      {[COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID, state: 'recovering'},
    );
    t.equal(priorityPartition.globalChanged, true,
      'priority partition topology rotates global currency');

    const userOperation = fixture.apply(
      TABLES.REPLICA_OPERATIONS,
      CDC_OPERATION.INSERT,
      {
        [COLUMN.OPERATION_ID]: 'user-operation',
        [COLUMN.PARTITION_ID]: USER_PARTITION_ID,
        [COLUMN.STATUS]: 'pending',
      },
    );
    t.equal(userOperation.semanticChanged, false,
      'ordinary operation semantics remain capacity-owner inputs');
    const priorityOperation = fixture.apply(
      TABLES.REPLICA_OPERATIONS,
      CDC_OPERATION.INSERT,
      {
        [COLUMN.OPERATION_ID]: 'priority-operation',
        [COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID,
        [COLUMN.STATUS]: 'pending',
      },
    );
    t.equal(priorityOperation.globalChanged, true,
      'priority operation topology rotates global currency');

    const userService = fixture.apply(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
      [COLUMN.ADDRESS]: 'ws://node-b/user-service-v2',
      [COLUMN.SERVICE_ID]: 'user-service',
    });
    t.equal(userService.globalChanged, false,
      'ordinary service detail is not cluster-global');
    t.same(userService.affectedNodeIds, [NODE_B]);
    const priorityService = fixture.apply(
      TABLES.SERVICES,
      CDC_OPERATION.UPDATE,
      {
        [COLUMN.ADDRESS]: 'ws://node-a/priority-service-v2',
        [COLUMN.SERVICE_ID]: 'priority-service',
      },
    );
    t.equal(priorityService.globalChanged, true,
      'priority service detail rotates global currency');
    t.end();
  });

test('only the canonical membership publication winner rotates global currency',
  (t) => {
    const fixture = createFixture({
      [TABLES.CONTROL_PLANE_PUBLICATIONS]: [{
        publication_id: 'winner',
        publication_kind: 'cluster_membership',
        publication_epoch: 2,
        status: 'PUBLISHED',
      }, {
        publication_id: 'superseded',
        publication_kind: 'cluster_membership',
        publication_epoch: 1,
        status: 'PUBLISHED',
      }],
    });
    const superseded = fixture.apply(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      CDC_OPERATION.UPDATE,
      {publication_id: 'superseded', reason_code: 'diagnostic-only'},
    );
    t.equal(superseded.semanticChanged, false,
      'a superseded row does not rotate planning currency');
    const winner = fixture.apply(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      CDC_OPERATION.UPDATE,
      {publication_id: 'winner', status: 'ACKNOWLEDGING'},
    );
    t.equal(winner.globalChanged, true,
      'winner status/content changes rotate global currency');
    t.end();
  });

test('ordered source revisions ignore duplicates and fail closed on gaps',
  (t) => {
    const fixture = createFixture({[TABLES.NODES]: [nodeRow(NODE_A)]});
    const exact = fixture.apply(TABLES.NODES, CDC_OPERATION.UPDATE, {
      [COLUMN.LAST_HEARTBEAT]: 1_001,
      [COLUMN.NODE_ID]: NODE_A,
    });
    t.equal(exact.semanticChanged, false, 'exact semantic no-op is classified');
    const beforeDuplicate = fixture.tracker.captureIdentity(NODE_A);
    const duplicate = fixture.tracker.recordTableChange(
      TABLES.NODES,
      CDC_OPERATION.UPDATE,
      nodeRow(NODE_A),
      1,
      fixture.tracker.readSourceObservation(fixture.cache),
    );
    t.equal(duplicate.semanticChanged, false, 'duplicate revision is ignored');
    t.ok(planningIdentitiesEqual(
      beforeDuplicate,
      fixture.tracker.captureIdentity(NODE_A),
    ), 'duplicate delivery cannot rotate currency');

    const gap = fixture.apply(TABLES.NODES, CDC_OPERATION.UPDATE, {
      [COLUMN.NODE_ID]: NODE_A,
      [COLUMN.LAST_HEARTBEAT]: 1_002,
    }, {revisionIncrement: 2});
    t.equal(gap.globalChanged, true, 'a revision gap fails closed globally');
    t.equal(fixture.tracker.hasUnclassifiedSourceChange(
      fixture.tracker.readSourceObservation(fixture.cache)), true,
    'the gap never launders the latest cache revision into classified state');

    const hostileIdentity = {};
    Object.defineProperty(hostileIdentity, 'globalPlanningGeneration', {
      get: () => 1,
    });
    t.equal(planningIdentitiesEqual(
      hostileIdentity,
      fixture.tracker.captureIdentity(NODE_A),
    ), false, 'accessor-bearing identity cannot alias current currency');
    t.end();
  });

test('transport and retry identities reject shapes that could alias current',
  (t) => {
    const validEmpty = readConnectedNodeFingerprint({
      getConnectedNodes: () => new Set(),
    });
    t.equal(validEmpty.valid, true, 'a canonical empty Set is valid topology');
    t.equal(readConnectedNodeFingerprint({}).valid, true,
      'an owner without topology capability retains the supported empty state');

    class InheritedSet extends Set {}
    t.equal(readConnectedNodeFingerprint({
      getConnectedNodes: () => new InheritedSet(),
    }).valid, false, 'a Set subclass cannot alias canonical empty topology');
    t.equal(readConnectedNodeFingerprint({
      getConnectedNodes: () => new Proxy(new Set(), {}),
    }).valid, false, 'a proxied collection fails closed');
    t.equal(readConnectedNodeFingerprint(Object.defineProperty({},
      'getConnectedNodes', {
        get: () => {
          throw new Error('hostile accessor');
        },
      })).valid, false, 'a throwing topology accessor is contained');

    const identity = Object.freeze({
      globalPlanningGeneration: 1,
      nodePlanningGeneration: 2,
      saturated: false,
    });
    t.equal(shouldResetReadinessBuildAttempts(
      {planningIdentity: identity},
      {planningIdentity: {...identity}},
    ), false, 'same semantic identity cannot reset an exhausted retry key');
    t.equal(shouldResetReadinessBuildAttempts(
      {planningIdentity: identity},
      {planningIdentity: {...identity, nodePlanningGeneration: 3}},
    ), true, 'a newer node identity releases the exhausted retry key');
    const accessorIdentity = Object.defineProperty({},
      'globalPlanningGeneration', {get: () => 1});
    t.equal(shouldResetReadinessBuildAttempts(
      {planningIdentity: identity},
      {planningIdentity: accessorIdentity},
    ), true, 'accessor-bearing identity cannot impersonate current currency');
    t.end();
  });
