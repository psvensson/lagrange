import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_SHARED} from
  '../../src/partition/partition-service-shared.js';
import {PARTITION_TRANSITION_STATE} from
  '../../src/partition/partition-constants.js';
import {PARTITION_SERVICE_MESSAGE_TYPE} from
  '../../src/partition/partition-service-constants.js';
import {ManagedMergeTopologyAdapter} from
  '../../src/partition/managed-merge-topology-adapter.js';
import {ManagedMergeWorkflow} from
  '../../src/partition/managed-merge-workflow.js';
import {SQLQueryEnginePartitionRoutingReadiness} from
  '../../src/query/sql-query-engine-partition-routing-readiness.js';
import {createContractMessageRouterStub} from
  '../contract/message-router-contract-support.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
} from '../../src/workflow/workflow-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from '../../src/partition/merge-ack-constants.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {
  openRecordStore,
  openView,
  parsePartitionTransition,
  readAuthoritativelyFrom,
  turns,
} from './workflow-record-sqlite-world.js';

const {RaftRole} = PARTITION_SERVICE_SHARED;
const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const NO_TIMERS = Object.freeze({setTimeout: () => null, clearTimeout() {}});
const SOURCE = 'users-p1';
const clock = {now: 1000};

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return {promise, resolve};
}

async function rejectionOf(operation) {
  try {
    await operation();
    return null;
  } catch (error) {
    return error;
  }
}

function splitMetadata(overrides = {}) {
  return {
    workflowId: 'split-tbl-users-users-p1-v2',
    workflowAttempt: 1,
    workflowFenceToken: 1,
    primaryKeyColumn: 'id',
    sourcePartitionId: SOURCE,
    splitKey: 'm',
    targetPartitionIds: ['users-p-left', 'users-p-right'],
    targetPartitionVersion: 2,
    ...overrides,
  };
}

function mergeMetadata(overrides = {}) {
  return {
    workflowId: 'merge-tbl-users-users-p1-users-p2-v2',
    workflowAttempt: 1,
    workflowFenceToken: 1,
    primaryKeyColumn: 'id',
    sourcePartitionIds: [SOURCE, 'users-p2'],
    targetPartitionIds: ['users-p-merged'],
    targetPartitionVersion: 2,
    ...overrides,
  };
}

function installSnapshotStorage(source, events, snapshotGate = null) {
  source.seedSplitReplayCursorFromDurableLog = (handle) => {
    handle.snapshotBarrierIndex = null;
    handle.replayWatermarkIndex = null;
  };
  source.openSplitSnapshotDatabase = () => ({
    prepare(sql) {
      if (sql.startsWith('PRAGMA table_info')) {
        return {all: () => [{name: 'id'}, {name: 'name'}]};
      }
      return {iterate: () => [{id: 'a', name: 'Alice'}][Symbol.iterator]()};
    },
    close() {},
  });
  source.applySplitSnapshotBatch = async () => {
    events.push('split-snapshot');
    if (snapshotGate) await snapshotGate.promise;
  };
  source.backfillMergeSnapshot = async () => {
    events.push('merge-snapshot');
    if (snapshotGate) await snapshotGate.promise;
  };
  source.replaySplitEntry = async () => {};
  source.replayMergeEntry = async () => {};
  source.waitForMergeCutoverActivation = async () => {};
}

function buildSource(events, snapshotGate = null) {
  const source = Object.create(PartitionService.prototype);
  Object.assign(source, {
    partitionId: SOURCE,
    tableId: 'tbl-users',
    tableName: 'users',
    role: RaftRole.LEADER,
    logger: QUIET,
    splitReplication: null,
    splitReplicationRun: null,
    mergeReplication: null,
    mergeReplicationRun: null,
    timeSource: {now: () => clock.now},
  });
  installSnapshotStorage(source, events, snapshotGate);
  return source;
}

function buildOwner(store, source, startDelivery) {
  const view = openView(store);
  const workflow = buildWorkflow({
    cdcIntegrationService: store.cdcFor('A'),
    getTableInfo: () => view.row(),
    listTableInfos: () => view.list(),
    getPartitionInfo: (id) => store.partitionRow(id),
    logger: QUIET,
    now: () => clock.now,
    listTablePartitionRows: () => store.partitionIds()
      .map((id) => store.partitionRow(id)),
    resolveActivePartitionVersion: (row) =>
      Number(row?.active_partition_version) || 1,
    groupRetirementScheduler: NO_TIMERS,
    groupRetirementLeaseScheduler: NO_TIMERS,
    startSplitReplicationOnSourcePartition: (...args) =>
      startDelivery(source, ...args),
    parsePartitionTransition,
    topologyAdapter: null,
  }).workflow;
  workflow.workflowOwnerId = 'owner-A';
  readAuthoritativelyFrom(workflow, store);
  workflow.readCommittedGroupMembers = async () => ['r1', 'r2', 'r3'];
  workflow.listPartitionServiceRows = (partitionId) =>
    ['r1', 'r2', 'r3'].map((replicaId) => ({partition_id: partitionId,
      replica_id: replicaId, node_id: `n-${replicaId}`}));
  workflow.deliverReplicaRemoval = async () => ({status: 'completed'});
  source.sqlQueryEngine = {managedSplitWorkflow: workflow};
  return workflow;
}

async function registerRealStartAuthorization(source, family, metadata) {
  const store = openRecordStore({partitions: [
    {partition_id: SOURCE},
    {partition_id: 'users-p2'},
  ]});
  let workflow;
  if (family === 'split') {
    workflow = buildOwner(store, source, async () => {
      throw new Error('registration-only owner does not send START');
    });
  } else {
    const view = openView(store);
    workflow = new ManagedMergeWorkflow({
      cdcIntegrationService: store.cdcFor('M'),
      getTableInfo: () => view.row(),
      listTableInfos: () => view.list(),
      getPartitionInfo: (id) => store.partitionRow(id),
      parsePartitionTransition,
      logger: QUIET,
      now: () => clock.now,
      groupRetirementScheduler: NO_TIMERS,
      groupRetirementLeaseScheduler: NO_TIMERS,
    });
    workflow.workflowOwnerId = 'owner-M';
    readAuthoritativelyFrom(workflow, store);
  }
  const status = family === 'split' ?
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING :
    PARTITION_TRANSITION_STATE.MERGE_BACKFILLING;
  const registration = await workflow.workflowCoordinator
    .registerWorkflowFromRead({workflowId: metadata.workflowId,
      ownerKey: SOURCE, tableId: 'tbl-users', tableName: 'users',
      partitionId: SOURCE, status, metadata, createdAt: clock.now,
      updatedAt: clock.now}, store.tablesRow());
  if (!registration.workflow) {
    throw new Error(`real ${family} registration refused`);
  }
  source.sqlQueryEngine = family === 'split' ?
    {managedSplitWorkflow: workflow} : {managedMergeWorkflow: workflow};
  return {metadata: registration.workflow.metadata, store, workflow};
}

function recordSnapshot(store) {
  const row = store.tablesRow();
  const metadata = JSON.parse(row.partition_transition_metadata || '{}');
  return {
    state: row.partition_transition_state,
    attempt: metadata.workflowAttempt ?? null,
    fence: metadata.workflowFenceToken ?? null,
    sourceStatus: metadata.participants?.['source-partition']?.status ?? null,
  };
}

test('split and merge START senders distinguish a router ACK from handler ' +
  'processing', async (t) => {
  for (const [kind, messageType, buildSender] of [
    ['split', PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION,
      (router, addressOf) => {
        const sender = Object.create(
          SQLQueryEnginePartitionRoutingReadiness.prototype);
        sender.queryExecutor = {
          findPartitionService: () => ({address: addressOf()}),
        };
        sender.messageRouter = router;
        return (metadata) => sender.startSplitReplicationOnSourcePartition(
          SOURCE, 'tbl-users', 'users', metadata);
      }],
    ['merge', PARTITION_SERVICE_MESSAGE_TYPE.START_MERGE_REPLICATION,
      (router, addressOf) => {
        const adapter = new ManagedMergeTopologyAdapter({sqlQueryEngine: {
          queryExecutor: {
            findPartitionService: () => ({address: addressOf()}),
          },
          messageRouter: router,
        }});
        return (metadata) => adapter.startMergeReplicationOnSourcePartition(
          SOURCE, 'tbl-users', 'users', metadata);
      }],
  ]) {
    let address = `${kind}-no-handler`;
    const router = createContractMessageRouterStub({
      simulateNoHandlerAckAddresses: [address],
      handlers: [[`${kind}-processed`, async () => ({success: true})]],
    });
    const send = buildSender(router, () => address);
    const metadata = kind === 'split' ? splitMetadata() : mergeMetadata();

    const dropped = await rejectionOf(() => send(metadata));
    t.ok(dropped, `${kind}: transport-only ACK is rejected by the sender`);
    t.equal(dropped?.retryable, true,
      `${kind}: noHandler retains bounded retry classification`);
    t.equal(router.deliveries[0].message.type, messageType,
      `${kind}: witness drives the production START message leg`);

    address = `${kind}-processed`;
    await send(metadata);
    t.equal(router.deliveries[1].message.type, messageType,
      `${kind}: registered handler processing is accepted`);
  }
});

test('stale split and merge delta replay uses the target registry and ' +
  'preserves a newer target-authoritative write', async (t) => {
  for (const family of ['split', 'merge']) {
    const targetId = `${family}-target`;
    const target = new PartitionService(withFoundingStamp({
      partitionId: targetId,
      tableId: 'tbl-users',
      tableName: 'users',
      replicaId: `${targetId}-r1`,
      replicaIds: [`${targetId}-r1`],
      schema: {columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ]},
      dbPath: ':memory:',
      deferElection: true,
    }));
    await target.initialize();
    try {
      await target.raft.campaign();
      const queryExecutor = {executeOnPartition: async (
        partitionId, sql, params, _forRead, _preferLeader,
        _preferSameLatencyGroup, executionOptions) => {
        t.equal(partitionId, targetId,
          `${family}: replay reaches the selected target partition`);
        return target.executeQuery(sql, params, executionOptions);
      }};
      const source = Object.assign(Object.create(PartitionService.prototype), {
        tableName: 'users',
        sqlQueryEngine: {queryExecutor},
        assertSplitRoutingDescriptorEpoch() {},
        assertMergeRoutingDescriptorEpoch() {},
      });
      t.equal((await target.executeQuery(
        'INSERT INTO users (id, value) VALUES (?, ?)', ['a', 'initial'],
        {entryId: `${family}-seed`})).success, true,
      `${family}: target seed write commits`);
      const mirrored = {
        entryId: `${family}-source-entry`,
        operationId: `${family}-source-operation`,
        idempotencyKey: `${family}-source-idempotency`,
        sql: 'UPDATE users SET value = ? WHERE id = ?',
        params: ['mirrored', 'a'],
        data: {id: 'a', value: 'mirrored'},
      };
      const metadata = family === 'split' ? {
        primaryKeyColumn: 'id',
        splitKey: 'm',
        targetPartitionIds: [targetId, `${targetId}-right`],
        targetPartitionVersion: 2,
      } : {
        primaryKeyColumn: 'id',
        sourcePartitionIds: [SOURCE, 'users-p2'],
        targetPartitionId: targetId,
        targetPartitionVersion: 2,
      };
      if (family === 'split') {
        await source.replaySplitEntry(mirrored, metadata);
      } else {
        await source.replayMergeEntry(mirrored, metadata);
      }
      t.equal((await target.executeQuery(
        'UPDATE users SET value = ? WHERE id = ?', ['target-newer', 'a'],
        {entryId: `${family}-target-newer`})).success, true,
      `${family}: newer target-authoritative write commits`);
      if (family === 'split') {
        await source.replaySplitEntry(mirrored, metadata);
      } else {
        await source.replayMergeEntry(mirrored, metadata);
      }
      const result = await target.executeQuery(
        'SELECT value FROM users WHERE id = ?', ['a']);
      t.equal(result.rows[0].value, 'target-newer',
        `${family}: stale source replay is deduped by entry identity and ` +
        'cannot overwrite newer target state');
    } finally {
      await target.shutdown();
    }
  }
});

test('duplicate catch-up readiness re-enters the canonical split and merge ' +
  'cutover owners after durable persistence', async (t) => {
  for (const family of ['split', 'merge']) {
    const source = buildSource([]);
    const registered = await registerRealStartAuthorization(
      source, family, family === 'split' ? splitMetadata() : mergeMetadata());
    const {metadata, workflow} = registered;
    const participantKey = family === 'split' ?
      SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION :
      buildMergeSourceParticipantKey(SOURCE);
    const ack = (status) => ({
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]: participantKey,
      [PARTICIPANT_ACK_FIELD.STATUS]: status,
      [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: metadata.workflowFenceToken,
      [PARTICIPANT_ACK_FIELD.ATTEMPT]: metadata.workflowAttempt,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: clock.now,
    });
    const startMetadata = family === 'split' ? metadata :
      source.normalizeMergeTransitionMetadata(metadata);
    const startContext = {metadata: startMetadata,
      tableId: 'tbl-users', tableName: 'users'};
    const startStatus = family === 'split' ?
      SPLIT_ACK_STATUS.SNAPSHOT_STARTED : MERGE_ACK_STATUS.SNAPSHOT_STARTED;
    const catchupStatus = family === 'split' ?
      SPLIT_ACK_STATUS.CATCHUP_READY : MERGE_ACK_STATUS.CATCHUP_READY;
    const start = family === 'split' ?
      await workflow.acknowledgeSourceParticipant(
        metadata.workflowId, ack(startStatus), startContext) :
      await workflow.acknowledgeMergeSourceParticipant(
        metadata.workflowId, ack(startStatus), startContext);
    t.equal(start.result, PARTICIPANT_ACK_RESULT.ACCEPTED,
      `${family}: durable START is accepted first`);
    const persisted = await workflow.workflowCoordinator
      .acknowledgeParticipant(metadata.workflowId, ack(catchupStatus));
    t.equal(persisted.result, PARTICIPANT_ACK_RESULT.ACCEPTED,
      `${family}: crash window leaves readiness durably persisted`);

    let reactions = 0;
    if (family === 'split') {
      workflow.resolveSplitCutoverOutcome = async () => {
        reactions += 1;
        return {applied: true, readiness: {decision: 'ready'}};
      };
    } else {
      workflow.applyMergeCutoverIfReady = async () => {
        reactions += 1;
        return true;
      };
    }
    const duplicate = family === 'split' ?
      await workflow.acknowledgeSourceParticipant(
        metadata.workflowId, ack(catchupStatus)) :
      await workflow.acknowledgeMergeSourceParticipant(
        metadata.workflowId, ack(catchupStatus));
    t.equal(duplicate.result, PARTICIPANT_ACK_RESULT.DUPLICATE,
      `${family}: readiness redelivery is a durable duplicate`);
    t.equal(family === 'split' ? duplicate.splitCutoverApplied :
      duplicate.mergeCutoverApplied, true,
    `${family}: duplicate readiness re-enters the cutover decision`);
    t.equal(reactions, 1,
      `${family}: canonical cutover owner reacts exactly once`);
  }
});

test('an accepted split START whose answer is lost stays on its durable ' +
  'attempt', async (t) => {
  clock.now = 1000;
  const store = openRecordStore({partitions: [
    {partition_id: SOURCE},
    {partition_id: 'users-p3'},
  ]});
  const events = [];
  const snapshotGate = deferred();
  const source = buildSource(events, snapshotGate);
  let starts = 0;
  let acceptedMetadata = null;
  const router = {async deliver(_address, message) {
    starts += 1;
    acceptedMetadata = message.transitionMetadata;
    await source.handleStartSplitReplication(message);
    throw new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT);
  }};
  const sender = Object.create(SQLQueryEnginePartitionRoutingReadiness.prototype);
  sender.queryExecutor = {findPartitionService: () => ({address: 'source'})};
  sender.messageRouter = router;
  const workflow = buildOwner(store, source, async (_service, partitionId,
    tableId, tableName, transitionMetadata) =>
    sender.startSplitReplicationOnSourcePartition(
      partitionId, tableId, tableName, transitionMetadata));

  const result = await workflow.execute(SOURCE);
  await turns(40);
  const accepted = recordSnapshot(store);
  t.equal(accepted.attempt, 1, 'the accepted physical worker keeps attempt 1');
  t.equal(accepted.fence, 1, 'the accepted physical worker keeps fence 1');
  t.equal(accepted.sourceStatus, 'snapshot_started',
    'the record proves START acceptance before snapshot copy');
  t.equal(accepted.state, PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'answer loss does not write a deferred record over accepted START');
  t.equal(result.success, true,
    'the owner confirms the accepted START from its durable record');
  t.equal(starts, 1, 'the owner does not register and dispatch a successor');

  const executableRecovery = await source.emitSplitSourceAck(
    acceptedMetadata, 'snapshot_started');
  t.equal(executableRecovery.result, 'accepted',
    'the real BACKFILLING record authorizes exact executable recovery');

  source.isShutdown = true;
  const resumedEvents = [];
  const resumedGate = deferred();
  const resumedSource = buildSource(resumedEvents, resumedGate);
  resumedSource.systemTableCache = {getAll: (table) =>
    table === 'tables' ? [store.tablesRow()] : []};
  resumedSource.sqlQueryEngine = {managedSplitWorkflow: workflow};
  const resumed = await resumedSource.startOrResumeSplitReplicationFromDurable();
  t.equal(resumed, true,
    'durable reconstruction obtains real START authorization before running');
  t.same(resumedEvents, ['split-snapshot'],
    'authorized reconstruction installs one replacement worker');

  await workflow.workflowCoordinator.recordExecutionOutcome(
    acceptedMetadata.workflowId,
    {status: PARTITION_TRANSITION_STATE.FAILED, delta: {},
      incident: {reason: 'operator cancelled the attempt'}},
  );
  const terminalExecution = await resumedSource.emitSplitSourceAck(
    acceptedMetadata, 'snapshot_started');
  t.equal(terminalExecution.result, 'invalid_transition',
    'the same real record refuses executable recovery after cancellation');
  const answerLossConfirmation = await workflow.confirmSplitReplicationStart(
    acceptedMetadata, 'tbl-users', 'users');
  t.equal(answerLossConfirmation, true,
    'confirmation-only still proves the previously accepted START answer');

  const terminalEvents = [];
  const terminalSource = buildSource(terminalEvents);
  terminalSource.sqlQueryEngine = {managedSplitWorkflow: workflow};
  const resurrected = await terminalSource.handleStartSplitReplication({
    tableId: 'tbl-users', tableName: 'users',
    transitionMetadata: acceptedMetadata,
  });
  t.equal(resurrected.acknowledged, false,
    'a terminal record cannot authorize a replacement physical worker');
  t.same(terminalEvents, [],
    'terminal refusal performs no replacement snapshot work');

  snapshotGate.resolve();
  resumedGate.resolve();
  await source.splitReplicationRun;
  await resumedSource.splitReplicationRun;
});

test('a split START transport failure before source acceptance defers the ' +
  'same attempt', async (t) => {
  clock.now = 1000;
  const store = openRecordStore({partitions: [
    {partition_id: SOURCE},
    {partition_id: 'users-p3'},
  ]});
  const events = [];
  const source = buildSource(events);
  let deliveries = 0;
  const workflow = buildOwner(store, source, async () => {
    deliveries += 1;
    throw Object.assign(new Error('START_SPLIT_REPLICATION not delivered'),
      {retryable: true});
  });

  const result = await workflow.execute(SOURCE);
  const rejected = recordSnapshot(store);
  t.equal(result.success, false, 'an unaccepted delivery is not completed');
  t.equal(rejected.state, PARTITION_TRANSITION_STATE.DEFERRED,
    'the owner records a retryable deferral when START was not accepted');
  t.equal(deliveries, 1, 'the owner performs one bounded delivery attempt');
  t.same(events, [], 'an unaccepted delivery performs no source work');
});

test('the durable split record rejects altered payload at the same attempt ' +
  'and fence', async (t) => {
  clock.now = 1000;
  const store = openRecordStore({partitions: [
    {partition_id: SOURCE},
    {partition_id: 'users-p3'},
  ]});
  const events = [];
  const snapshotGate = deferred();
  const source = buildSource(events, snapshotGate);
  let alteredResponse = null;
  let exactResponse = null;
  const workflow = buildOwner(store, source, async (service, partitionId,
    tableId, tableName, transitionMetadata) => {
    alteredResponse = await service.handleStartSplitReplication({
      partitionId,
      tableId,
      tableName,
      transitionMetadata: {...transitionMetadata, splitKey: 'z'},
    });
    exactResponse = await service.handleStartSplitReplication({partitionId,
      tableId, tableName, transitionMetadata});
    return exactResponse;
  });

  const result = await workflow.execute(SOURCE);
  await turns(20);
  const accepted = recordSnapshot(store);
  t.equal(alteredResponse?.acknowledged, false,
    'same attempt and fence cannot authorize a different split key');
  t.equal(exactResponse?.acknowledged, true,
    'the exact durable execution payload remains admissible');
  t.equal(result.success, true, 'the exact START completes owner admission');
  t.equal(accepted.sourceStatus, 'snapshot_started',
    'the durable participant records the exact accepted START');
  t.equal(events.filter((event) => event === 'split-snapshot').length, 1,
    'only the exact durable payload starts physical snapshot work');
  snapshotGate.resolve();
  await source.splitReplicationRun;
});

test('stale and different-payload START requests perform no snapshot work',
  async (t) => {
    for (const [kind, metadata, start] of [
      ['split', splitMetadata({workflowAttempt: 2, workflowFenceToken: 2}),
        (source, payload) => source.handleStartSplitReplication(payload)],
      ['merge', mergeMetadata({workflowAttempt: 2, workflowFenceToken: 2}),
        (source, payload) => source.handleStartMergeReplication(payload)],
    ]) {
      const events = [];
      const source = buildSource(events);
      const decisions = ['attempt_mismatch', 'invalid_transition'];
      const owner = kind === 'split' ? {
        acknowledgeSourceParticipant: async () => ({
          result: decisions.shift(), splitCutoverApplied: false,
        }),
      } : {
        acknowledgeMergeSourceParticipant: async () => ({
          result: decisions.shift(), mergeCutoverApplied: false,
        }),
      };
      source.sqlQueryEngine = kind === 'split' ?
        {managedSplitWorkflow: owner} : {managedMergeWorkflow: owner};

      const stale = await start(source, {transitionMetadata: metadata});
      const changed = kind === 'split' ?
        {...metadata, splitKey: 'z'} :
        {...metadata, targetPartitionIds: ['users-other-merged']};
      const mismatched = await start(source, {transitionMetadata: changed});
      await turns(20);

      t.equal(stale.acknowledged, false,
        `${kind}: stale durable authorization is refused`);
      t.equal(mismatched.acknowledged, false,
        `${kind}: different payload cannot borrow authorization`);
      t.same(events, [], `${kind}: rejected START reaches no snapshot work`);
    }
  });

test('accepted START recovery and concurrent redelivery retain one physical ' +
  'worker', async (t) => {
  for (const [kind, metadata, start, runField] of [
    ['split', splitMetadata(),
      (source, payload) => source.handleStartSplitReplication(payload),
      'splitReplicationRun'],
    ['merge', mergeMetadata(),
      (source, payload) => source.handleStartMergeReplication(payload),
      'mergeReplicationRun'],
  ]) {
    const events = [];
    const authorizationGate = deferred();
    const owner = kind === 'split' ? {
      acknowledgeSourceParticipant: async (_workflowId, ack) => {
        await authorizationGate.promise;
        return {result: 'accepted', splitCutoverApplied:
          ack.status === 'catchup_ready'};
      },
    } : {
      acknowledgeMergeSourceParticipant: async (_workflowId, ack) => {
        await authorizationGate.promise;
        return {result: 'accepted', mergeCutoverApplied:
          ack.status === 'catchup_ready'};
      },
    };
    const source = buildSource(events);
    source.sqlQueryEngine = kind === 'split' ?
      {managedSplitWorkflow: owner} : {managedMergeWorkflow: owner};

    let firstSettled = false;
    let secondSettled = false;
    const first = start(source, {transitionMetadata: metadata})
      .finally(() => {
        firstSettled = true;
      });
    const second = start(source, {transitionMetadata: metadata})
      .finally(() => {
        secondSettled = true;
      });
    await turns(10);
    t.equal(firstSettled, false,
      `${kind}: START waits for durable authorization`);
    t.equal(secondSettled, false,
      `${kind}: concurrent redelivery joins the authorization`);
    t.same(events, [], `${kind}: copy has not begun before authorization`);

    authorizationGate.resolve();
    const responses = await Promise.all([first, second]);
    await source[runField];
    t.same(responses, [
      {acknowledged: true, success: true},
      {acknowledged: true, success: true},
    ], `${kind}: both exact requests observe the one accepted START`);
    t.equal(events.filter((event) => event === `${kind}-snapshot`).length, 1,
      `${kind}: one physical snapshot worker runs`);
    if (kind === 'split') {
      source.replaySplitEntry = async () => {
        events.push('split-live-mirror');
      };
      await source.handleSplitReplicationAfterWrite({
        sql: 'INSERT INTO users (id) VALUES (?)', params: ['after-cleanup'],
      });
      t.equal(source.splitReplication.terminal, false,
        'split cleanup without durable retirement keeps the handle live');
      t.equal(events.includes('split-live-mirror'), true,
        'a settled split run still mirrors writes until retirement');
    }

    const restartedEvents = [];
    const restarted = buildSource(restartedEvents);
    const duplicateOwner = kind === 'split' ? {
      acknowledgeSourceParticipant: async () => ({result: 'duplicate',
        splitCutoverApplied: false}),
    } : {
      acknowledgeMergeSourceParticipant: async () => ({result: 'duplicate',
        mergeCutoverApplied: false}),
    };
    restarted.sqlQueryEngine = kind === 'split' ?
      {managedSplitWorkflow: duplicateOwner} :
      {managedMergeWorkflow: duplicateOwner};
    const recovered = await start(restarted, {transitionMetadata: metadata});
    await restarted[runField];
    t.equal(recovered.acknowledged, true,
      `${kind}: accepted START recovers the same attempt after source crash`);
    t.equal(restartedEvents.filter(
      (event) => event === `${kind}-snapshot`).length, 1,
    `${kind}: recovery starts one replacement worker`);
  }
});

test('same-attempt owner takeover waits for predecessor quiescence and old ' +
  'fence callbacks stay inert', async (t) => {
  clock.now = 1000;
  const store = openRecordStore({partitions: [
    {partition_id: SOURCE},
    {partition_id: 'users-p3'},
  ]});
  const events = [];
  const predecessorGate = deferred();
  const source = buildSource(events, predecessorGate);
  let predecessorMetadata = null;
  const workflow = buildOwner(store, source, async (service, partitionId,
    tableId, tableName, transitionMetadata) => {
    predecessorMetadata = transitionMetadata;
    return service.handleStartSplitReplication({partitionId, tableId,
      tableName, transitionMetadata});
  });
  const first = await workflow.execute(SOURCE);
  const predecessorRun = source.splitReplicationRun;
  const predecessorIdentity = {...predecessorMetadata,
    targetPartitionIds: [...predecessorMetadata.targetPartitionIds]};
  clock.now += 60001;
  workflow.resolveWorkflowState(predecessorMetadata.workflowId);
  const claim = await workflow.claimSplitWorkflowOwnership(
    predecessorMetadata.workflowId);
  t.equal(claim.accepted, true,
    'the durable takeover claim is accepted');
  workflow.workflowCoordinator.removeWorkflow(predecessorMetadata.workflowId);
  workflow.resolveWorkflowState(predecessorMetadata.workflowId);
  const continuationMetadata = {...predecessorMetadata,
    workflowFenceToken: claim.workflow.fenceToken};
  const premature = await source.handleStartSplitReplication({
    tableId: 'tbl-users', tableName: 'users',
    transitionMetadata: continuationMetadata,
  });
  t.equal(first.success, true, 'the predecessor is authorized');
  t.equal(claim.workflow.fenceToken, predecessorIdentity.workflowFenceToken + 1,
    'the real durable owner claim advances only the workflow fence');
  t.equal(source.splitReplication.metadata.workflowFenceToken,
    predecessorIdentity.workflowFenceToken,
    'the live predecessor retains its captured fence after owner takeover');
  t.equal(premature.acknowledged, false,
    'a higher owner fence cannot relabel a live predecessor');
  t.equal(events.filter((event) => event === 'split-snapshot').length, 1,
    'the rejected takeover installs no second worker');

  predecessorGate.resolve();
  await predecessorRun;
  workflow.workflowCoordinator.removeWorkflow(predecessorMetadata.workflowId);
  const recoveredTakeover = workflow.resolveWorkflowState(
    predecessorMetadata.workflowId);
  t.ok(recoveredTakeover,
    'the successor recovers the claimed durable record after quiescence');
  const continuationGate = deferred();
  source.applySplitSnapshotBatch = async () => {
    events.push('split-snapshot');
    await continuationGate.promise;
  };
  const continuation = await source.handleStartSplitReplication({
    tableId: 'tbl-users', tableName: 'users',
    transitionMetadata: continuationMetadata,
  });
  t.equal(continuation.acknowledged, true,
    'the same attempt continues under the new fence after quiescence');
  t.equal(events.filter((event) => event === 'split-snapshot').length, 2,
    'the continuation owns one replacement worker');

  const delayed = await source.emitSplitSourceAck(
    predecessorIdentity, 'catchup_ready');
  t.equal(delayed.result, 'stale_fence',
    'a delayed predecessor callback cannot report for the continuation');
  t.equal(recordSnapshot(store).fence, continuationMetadata.workflowFenceToken,
    'the delayed callback leaves the successor fence on the real record');
  continuationGate.resolve();
  await source.splitReplicationRun;
});

test('terminal quiesced predecessors admit reset workflow numbering and a ' +
  'split-to-merge successor through real record owners', async (t) => {
  clock.now = 1000;
  const events = [];
  const source = buildSource(events);
  source.splitReplication = {
    metadata: splitMetadata({workflowId: 'older-finished-workflow',
      workflowAttempt: 9, workflowFenceToken: 19}),
    terminal: true,
    quiesced: true,
    authorized: true,
    activities: new Set(),
  };
  const retainedPredecessor = source.splitReplication;
  source.applySplitSnapshotBatch = async () => {
    events.push('split-successor-snapshot');
    throw new Error('finish the split successor for the family transition');
  };

  const split = await registerRealStartAuthorization(source, 'split',
    splitMetadata({workflowId: 'new-workflow-reset-numbering',
      workflowAttempt: 0, workflowFenceToken: 0}));
  const refusedSplit = await source.handleStartSplitReplication({
    tableId: 'tbl-users', tableName: 'users',
    transitionMetadata: {...split.metadata, splitKey: 'z'},
  });
  t.equal(refusedSplit.acknowledged, false,
    'a refused successor authorization installs no replacement worker');
  t.equal(source.splitReplication, retainedPredecessor,
    'refusal restores the terminal predecessor idempotency witness');
  t.same(events, [],
    'refused successor authorization cannot overlap physical work');
  const splitResponse = await source.handleStartSplitReplication({
    tableId: 'tbl-users', tableName: 'users',
    transitionMetadata: split.metadata,
  });
  await source.splitReplicationRun;
  t.equal(splitResponse.acknowledged, true,
    'a different durable workflow is admitted despite reset attempt numbers');
  t.equal(source.splitReplication.terminal, true,
    'the replacement split reaches a terminal execution boundary');
  t.equal(source.splitReplication.quiesced, true,
    'the replacement split explicitly quiesces before another family starts');

  source.backfillMergeSnapshot = async () => {
    events.push('merge-successor-snapshot');
    throw new Error('finish the merge successor');
  };
  const merge = await registerRealStartAuthorization(source, 'merge',
    mergeMetadata({workflowId: 'merge-after-finished-split',
      workflowAttempt: 0, workflowFenceToken: 0}));
  const mergeResponse = await source.handleStartMergeReplication({
    tableId: 'tbl-users', tableName: 'users',
    transitionMetadata: merge.metadata,
  });
  await source.mergeReplicationRun;
  t.equal(mergeResponse.acknowledged, true,
    'a real merge record authorizes work after the split handle quiesces');
  t.equal(source.splitReplication, null,
    'accepted cross-family START consumes the terminal split predecessor');

  source.applySplitSnapshotBatch = async () => {
    events.push('split-after-merge-snapshot');
    throw new Error('finish the reverse-family successor');
  };
  const reverseSplit = await registerRealStartAuthorization(source, 'split',
    splitMetadata({workflowId: 'split-after-finished-merge',
      workflowAttempt: 0, workflowFenceToken: 0}));
  const reverseResponse = await source.handleStartSplitReplication({
    tableId: 'tbl-users', tableName: 'users',
    transitionMetadata: reverseSplit.metadata,
  });
  await source.splitReplicationRun;
  t.equal(reverseResponse.acknowledged, true,
    'a real split record authorizes work after the merge handle quiesces');
  t.equal(source.mergeReplication, null,
    'accepted reverse-family START consumes the terminal merge predecessor');
  t.same(events, ['split-successor-snapshot', 'merge-successor-snapshot',
    'split-after-merge-snapshot'],
  'each real record authorization starts exactly one successor worker');
});

test('shutdown while START authorization is pending installs no worker',
  async (t) => {
    for (const [kind, metadata, start, runField] of [
      ['split', splitMetadata(),
        (source, payload) => source.handleStartSplitReplication(payload),
        'splitReplicationRun'],
      ['merge', mergeMetadata(),
        (source, payload) => source.handleStartMergeReplication(payload),
        'mergeReplicationRun'],
    ]) {
      const events = [];
      const authorizationGate = deferred();
      const source = buildSource(events);
      const owner = kind === 'split' ? {
        acknowledgeSourceParticipant: async () => {
          await authorizationGate.promise;
          return {result: 'accepted', splitCutoverApplied: false};
        },
      } : {
        acknowledgeMergeSourceParticipant: async () => {
          await authorizationGate.promise;
          return {result: 'accepted', mergeCutoverApplied: false};
        },
      };
      source.sqlQueryEngine = kind === 'split' ?
        {managedSplitWorkflow: owner} : {managedMergeWorkflow: owner};

      const pending = start(source, {tableId: 'tbl-users', tableName: 'users',
        transitionMetadata: metadata});
      const duplicate = start(source, {tableId: 'tbl-users', tableName: 'users',
        transitionMetadata: metadata});
      await turns(10);
      source.isShutdown = true;
      authorizationGate.resolve();
      const [response, duplicateResponse] = await Promise.all(
        [pending, duplicate]);
      t.equal(response.acknowledged, false,
        `${kind}: shutdown refuses the accepted-but-unstarted handler`);
      t.equal(duplicateResponse.acknowledged, false,
        `${kind}: the joined duplicate observes the same lifecycle refusal`);
      t.same(events, [], `${kind}: shutdown reaches no physical work`);
      t.equal(source[kind === 'split' ? 'splitReplication' :
        'mergeReplication'], null, `${kind}: provisional handle is removed`);
      t.equal(source[runField], null,
        `${kind}: no worker promise is installed after shutdown`);
    }
  });
