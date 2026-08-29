import {test} from '../../src/test-helpers/tap.js';
import {NODE_STATE, TABLES} from '../../src/constants/index.js';
import {TRANSPORT_EVENT} from '../../src/constants/transport.js';
import {
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_RESPONSE_STATE,
} from '../../src/partition/split-cutover-handoff-contract.js';
import {
  SplitCutoverHandoffQueryPlaneOwner,
} from '../../src/query/split-cutover-handoff-query-plane-owner.js';
import {
  SQLQueryEngineLifecycleAndCallbackDispatch,
} from '../../src/query/sql-query-engine-lifecycle-and-callback-dispatch.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';

const NODE_ID = 'node-a';
const TABLE_ID = 'tbl-users';
const SOURCE_ID = 'users-p1';
const TARGET_IDS = ['users-left', 'users-right'];
const GENERATION = 'split-users:1:2:7:node-a@3';

function buildClosure() {
  return {
    state: 'closing',
    generation: GENERATION,
    workflowId: 'split-users',
    ownerNodeId: NODE_ID,
    tableId: TABLE_ID,
    sourcePartitionId: SOURCE_ID,
    targetPartitionIds: TARGET_IDS,
    targetPartitionVersion: 2,
    membershipPublicationEpoch: 7,
    requiredNodes: [{nodeId: NODE_ID, bootIncarnation: 3}],
  };
}

function buildTableRow(closure = buildClosure()) {
  return {
    table_id: TABLE_ID,
    table_name: 'users',
    active_partition_version: 2,
    partition_transition_state:
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    partition_transition_metadata: JSON.stringify({
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]: 'split-users',
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]: SOURCE_ID,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: TARGET_IDS,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
      [PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE]: closure,
    }),
  };
}

function createFixture(options = {}) {
  const tableRows = [buildTableRow(options.closure)];
  const nodeRows = [{
    node_id: NODE_ID,
    boot_incarnation: 3,
    status: NODE_STATE.ACTIVE,
  }];
  const listeners = new Set();
  const cache = {
    getAll(tableName) {
      if (tableName === TABLES.TABLES) return tableRows;
      if (tableName === TABLES.NODES) return nodeRows;
      return [];
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
  };
  const transactionsBySession = new Map();
  const deliveredMessages = [];
  const routerListeners = new Map();
  const deliveryResults = [...(options.deliveryResults || [])];
  let workflowReconcileRequests = 0;
  let childrenRoutable = options.childrenRoutable !== false;
  let transactionRecoveryReady = options.transactionRecoveryReady !== false;
  const parsePartitionTransition = (tableInfo) => ({
    state: tableInfo.partition_transition_state,
    metadata: JSON.parse(tableInfo.partition_transition_metadata),
  });
  const owner = new SplitCutoverHandoffQueryPlaneOwner({
    nodeId: NODE_ID,
    systemCache: cache,
    messageRouter: {
      register() {},
      unregister() {},
      on(eventName, listener) {
        routerListeners.set(eventName, listener);
      },
      off(eventName, listener) {
        if (routerListeners.get(eventName) === listener) {
          routerListeners.delete(eventName);
        }
      },
      async deliver(address, message, deliveryOptions) {
        deliveredMessages.push({address, message, deliveryOptions});
        return deliveryResults.shift() ||
          {acknowledged: true, state: HANDOFF_RESPONSE_STATE.READY};
      },
    },
    transactionCoordinator: {transactionsBySession},
    getTableInfo: (nameOrId) => {
      for (let index = 0; index < tableRows.length; index++) {
        const row = tableRows[index];
        if (row.table_id === nameOrId || row.table_name === nameOrId) {
          return row;
        }
      }
      return null;
    },
    parsePartitionTransition,
    resolveActivePartitionVersion: (row) => row.active_partition_version,
    getRoutablePartitionServiceNodeIds: () =>
      childrenRoutable ? [NODE_ID] : [],
    isTransactionRecoveryReady: () => transactionRecoveryReady,
    requestWorkflowReconcile() {
      workflowReconcileRequests++;
    },
    logger: {warn() {}},
  });
  return {
    owner,
    tableRows,
    nodeRows,
    transactionsBySession,
    deliveredMessages,
    routerListeners,
    get workflowReconcileRequests() {
      return workflowReconcileRequests;
    },
    setChildrenRoutable(value) {
      childrenRoutable = value;
    },
    setTransactionRecoveryReady(value) {
      transactionRecoveryReady = value;
    },
  };
}

function buildPrepare() {
  return {
    type: HANDOFF_MESSAGE_TYPE.PREPARE,
    generation: GENERATION,
    workflowId: 'split-users',
    tableId: TABLE_ID,
    sourcePartitionId: SOURCE_ID,
    targetPartitionIds: TARGET_IDS,
    targetPartitionVersion: 2,
    membershipPublicationEpoch: 7,
    requiredNode: {nodeId: NODE_ID, bootIncarnation: 3},
  };
}

async function observePending(promise) {
  let settled = false;
  promise.then(() => {
    settled = true;
  }, () => {
    settled = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  return settled;
}

test('query-plane owner activation belongs to the final transaction-recovery ' +
'handoff, not provisional engine construction', async (t) => {
  let starts = 0;
  let recoveryNotifications = 0;
  const engine = {
    distributedTransactionRecoveryActivated: false,
    splitCutoverHandoffQueryPlaneOwner: {
      start() {
        starts++;
      },
      notifyTransactionStateChanged() {
        recoveryNotifications++;
      },
    },
    recoverDistributedTransactionStateFromCache() {},
    resumeRecoveredDistributedTransactions: async () => ({recovered: 0}),
    tableCreationService: {
      resumeDurableProvisioningJobs: async () => {},
    },
    transactionCoordinator: {
      startRecoverySweep() {},
    },
    logger: {warn() {}},
  };
  t.equal(starts, 0,
    'constructing the subordinate owner does not claim runtime authority');

  await SQLQueryEngineLifecycleAndCallbackDispatch.prototype
    .activateDistributedTransactionRecovery.call(engine);

  t.equal(starts, 1,
    'the final recovery handoff activates exactly one query-plane owner');
  t.equal(engine.distributedTransactionRecoveryActivated, true,
    'runtime recovery and handoff ownership become active together');
  t.equal(recoveryNotifications, 1,
    'replay terminal progress directly rearms the handoff owner');
});

test('statement lease discovery includes nested subquery tables', (t) => {
  const {owner} = createFixture();
  t.same(owner.resolveStatementTableNames({
    type: 'SELECT',
    from: {name: 'users'},
    where: {
      type: 'in',
      subquery: {
        type: 'subquery',
        query: {type: 'SELECT', from: {name: 'orders'}},
      },
    },
  }), ['users', 'orders'],
  'a nested plan cannot outlive the barrier for either source table');
  t.end();
});

test('query-plane barrier waits for an already-built source plan and fences ' +
'new planning until the durable transition clears', async (t) => {
  const {owner, tableRows, deliveredMessages} = createFixture({closure: null});
  const oldPlanLease = await owner.acquireStatementLease({table: 'users'});
  t.equal(oldPlanLease.tables[0].requiresSourceMirror, true,
    'the pre-barrier V2 lease permanently pins source-mirror engagement');
  tableRows[0] = buildTableRow();

  const waiting = await owner.handleMessage({
    sourceNodeId: NODE_ID,
    payload: buildPrepare(),
  });
  t.equal(waiting.state, HANDOFF_RESPONSE_STATE.WAITING,
    'handoff cannot close while the already-built plan is active');

  owner.releaseStatementLease(oldPlanLease);
  await Promise.resolve();
  t.equal(deliveredMessages[0].message.type, HANDOFF_MESSAGE_TYPE.READY,
    'lease completion directly notifies the workflow owner');
  const ack = await owner.handleMessage({
    sourceNodeId: NODE_ID,
    payload: buildPrepare(),
  });
  t.equal(ack.state, HANDOFF_RESPONSE_STATE.READY,
    'the rearmed owner observes the ready generation');

  const queuedPlan = owner.acquireStatementLease({table: 'users'});
  t.equal(await observePending(queuedPlan), false,
    'no new table plan crosses an installed barrier');
  tableRows[0].partition_transition_state = null;
  tableRows[0].partition_transition_metadata = null;
  owner.observeDurableBarriers();
  const admitted = await queuedPlan;
  t.equal(admitted.tables[0].partitionVersion, 2,
    'the queued statement replans only after terminal metadata is visible');
  owner.releaseStatementLease(admitted);
});

test('a V1 source plan created before cutover remains a blocker after the ' +
'V2 handoff barrier is published', async (t) => {
  const fixture = createFixture({closure: null});
  fixture.tableRows[0].active_partition_version = 1;
  fixture.tableRows[0].partition_transition_state =
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP;
  const v1Lease = await fixture.owner.acquireStatementLease({table: 'users'});
  t.equal(v1Lease.tables[0].partitionVersion, 1,
    'the witness engages a real pre-cutover V1 plan lease');

  fixture.tableRows[0] = buildTableRow();
  const waiting = await fixture.owner.handleMessage({
    sourceNodeId: NODE_ID,
    payload: buildPrepare(),
  });
  t.equal(waiting.state, HANDOFF_RESPONSE_STATE.WAITING,
    'the V1 lease prevents source deletion after V2 becomes active');
  fixture.owner.releaseStatementLease(v1Lease);
  await Promise.resolve();
  t.equal(fixture.deliveredMessages[0].message.type,
    HANDOFF_MESSAGE_TYPE.READY,
    'V1 completion directly rearms the exact generation');
});

test('planning synchronously observes a durable barrier even when the cache ' +
'listener callback has not run', async (t) => {
  const {owner, tableRows} = createFixture();
  const acquisition = owner.acquireStatementLease({table: 'users'});
  t.equal(await observePending(acquisition), false,
    'planning-path observation closes the listener scheduling race');

  tableRows[0].partition_transition_state = null;
  tableRows[0].partition_transition_metadata = null;
  owner.observeDurableBarriers();
  const lease = await acquisition;
  t.equal(lease.tables[0].workflowId, null,
    'the admitted plan reads the post-barrier table projection');
  owner.releaseStatementLease(lease);
});

test('explicit transaction participants remain handoff blockers after the ' +
'statement lease has returned', async (t) => {
  const {owner, transactionsBySession, deliveredMessages} = createFixture();
  transactionsBySession.set('session-a', {
    participants: new Map([[SOURCE_ID, {status: 'active'}]]),
  });
  const waiting = await owner.handleMessage({
    sourceNodeId: NODE_ID,
    payload: buildPrepare(),
  });
  t.equal(waiting.state, HANDOFF_RESPONSE_STATE.WAITING,
    'source-touching explicit transaction blocks closure');

  transactionsBySession.delete('session-a');
  owner.notifyTransactionStateChanged();
  await Promise.resolve();
  t.equal(deliveredMessages[0].message.type, HANDOFF_MESSAGE_TYPE.READY,
    'commit or rollback completion directly rearms closure');
  t.equal((await owner.handleMessage({
    sourceNodeId: NODE_ID,
    payload: buildPrepare(),
  })).state, HANDOFF_RESPONSE_STATE.READY,
  'the rearmed owner receives an exact ready acknowledgement');
});

test('a restarted query node cannot acknowledge before durable transaction ' +
'recovery is observed', async (t) => {
  const fixture = createFixture({transactionRecoveryReady: false});
  const waiting = await fixture.owner.handleMessage({
    sourceNodeId: NODE_ID,
    payload: buildPrepare(),
  });
  t.equal(waiting.state, HANDOFF_RESPONSE_STATE.WAITING,
    'an empty process-local map is not recovery-complete evidence');
  fixture.setTransactionRecoveryReady(true);
  fixture.owner.evaluateBarriers();
  await Promise.resolve();
  t.equal(fixture.deliveredMessages[0].message.type,
    HANDOFF_MESSAGE_TYPE.READY,
    'recovery completion directly rearms the generation');
});

test('a transport reconnection event retries a lost ready notification ' +
'without a handoff timer', async (t) => {
  const fixture = createFixture({
    deliveryResults: [{acknowledged: false, error: 'connection lost'}],
  });
  fixture.owner.start();
  await Promise.resolve();
  await Promise.resolve();
  t.equal(fixture.deliveredMessages.length, 1,
    'the ready generation first attempts one direct notification');
  fixture.routerListeners.get(TRANSPORT_EVENT.CONNECTION_ESTABLISHED)?.();
  await Promise.resolve();
  t.equal(fixture.deliveredMessages.length, 2,
    'transport progress rearms the same generation after delivery failure');
  fixture.owner.shutdown();
  t.equal(fixture.routerListeners.size, 0,
    'shutdown unregisters every transport progress listener');
});

test('child routing and node incarnation are both fail-closed barrier ' +
'evidence', async (t) => {
  const fixture = createFixture({childrenRoutable: false});
  fixture.nodeRows[0].boot_incarnation = 2;
  const first = await fixture.owner.handleMessage({
    sourceNodeId: NODE_ID,
    payload: buildPrepare(),
  });
  t.equal(first.state, HANDOFF_RESPONSE_STATE.WAITING,
    'ready child rows alone cannot override an old node incarnation');

  fixture.nodeRows[0].boot_incarnation = 3;
  fixture.owner.evaluateBarriers();
  t.equal((await fixture.owner.handleMessage({
    sourceNodeId: NODE_ID,
    payload: buildPrepare(),
  })).state, HANDOFF_RESPONSE_STATE.WAITING,
  'current incarnation alone cannot override unroutable children');

  fixture.setChildrenRoutable(true);
  fixture.owner.evaluateBarriers();
  const ack = await fixture.owner.handleMessage({
    sourceNodeId: NODE_ID,
    payload: buildPrepare(),
  });
  t.equal(ack.bootIncarnation, 3,
    'ack binds the current node incarnation and locally routable children');
});

test('prepare authority is strict own-data and independent of post-import ' +
'mutable collection intrinsics', async (t) => {
  const {owner} = createFixture();
  let accessorCalls = 0;
  let envelopeAccessorCalls = 0;
  const accessorPayload = {...buildPrepare()};
  Object.defineProperty(accessorPayload, 'type', {
    enumerable: true,
    get() {
      accessorCalls++;
      return HANDOFF_MESSAGE_TYPE.PREPARE;
    },
  });
  const inherited = Object.create(buildPrepare());
  const inheritedResult = await owner.handleMessage({
    sourceNodeId: NODE_ID,
    payload: inherited,
  });
  const accessorResult = await owner.handleMessage({
    sourceNodeId: NODE_ID,
    payload: accessorPayload,
  });
  const wrongOwnerResult = await owner.handleMessage({
    sourceNodeId: 'node-forged',
    payload: buildPrepare(),
  });
  const accessorEnvelope = {sourceNodeId: NODE_ID};
  Object.defineProperty(accessorEnvelope, 'payload', {
    enumerable: true,
    get() {
      envelopeAccessorCalls++;
      return buildPrepare();
    },
  });
  const accessorEnvelopeResult = await owner.handleMessage(accessorEnvelope);
  t.equal(inheritedResult.state, HANDOFF_RESPONSE_STATE.REFUSED,
    'inherited authority is refused');
  t.equal(accessorResult.state, HANDOFF_RESPONSE_STATE.REFUSED,
    'accessor authority is refused');
  t.equal(accessorCalls, 0, 'authority accessors are never invoked');
  t.equal(accessorEnvelopeResult.state, HANDOFF_RESPONSE_STATE.REFUSED,
    'an accessor-backed transport envelope is refused');
  t.equal(envelopeAccessorCalls, 0,
    'strict transport ingestion never invokes an envelope accessor');
  t.equal(wrongOwnerResult.state, HANDOFF_RESPONSE_STATE.REFUSED,
    'only the durable workflow owner may prepare the barrier');

  const mutations = [
    [Array, 'isArray', () => false],
    [Number, 'isSafeInteger', () => false],
    [Object, 'freeze', () => {
      throw new Error('mutable Object.freeze invoked');
    }],
    [Array.prototype, 'every', () => false],
    [Array.prototype, 'some', () => true],
    [Array.prototype, 'find', () => null],
    [Array.prototype, 'map', () => []],
    [Array.prototype, 'filter', () => []],
    [Map.prototype, 'get', () => null],
    [Map.prototype, 'set', () => {
      throw new Error('mutable Map.set invoked');
    }],
    [Map.prototype, 'forEach', () => {}],
    [Set.prototype, 'add', () => {
      throw new Error('mutable Set.add invoked');
    }],
    [Set.prototype, 'has', () => false],
    [Set.prototype, 'forEach', () => {}],
  ];
  const originals = mutations.map(([target, key]) => [
    target,
    key,
    Object.getOwnPropertyDescriptor(target, key),
  ]);
  let result;
  try {
    for (const [target, key, replacement] of mutations) {
      Object.defineProperty(target, key, {
        value: replacement,
        configurable: true,
        writable: true,
      });
    }
    result = await owner.handleMessage({
      sourceNodeId: NODE_ID,
      payload: buildPrepare(),
    });
  } finally {
    for (const [target, key, descriptor] of originals) {
      Object.defineProperty(target, key, descriptor);
    }
  }
  t.equal(result.state, HANDOFF_RESPONSE_STATE.READY,
    'captured intrinsics preserve the exact ready decision');
});
