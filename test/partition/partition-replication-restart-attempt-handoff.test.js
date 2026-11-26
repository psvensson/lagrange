import {admittedMirrorSource, sourceMirrorReservationFixture} from './source-mirror-reservation-fixture.js';
import {reconcileFailedMirrorCustody, redriveFailedMirrorRelease} from '../../src/partition/partition-mirror-custody-lifecycle.js';
import {readDurableMirrorRetentionCustodyIn, replicateSourceMirrorRetentionCustody} from '../../src/partition/partition-mirror-effect-retention.js';
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
import {SQLQueryEngine} from
  '../../src/query/sql-query-engine.js';
import {SQLQueryEnginePartitionRoutingReadiness} from
  '../../src/query/sql-query-engine-partition-routing-readiness.js';
import {createContractMessageRouterStub} from
  '../contract/message-router-contract-support.js';
import {ROUTER_MESSAGE_TIMEOUT_ERROR_CODE} from '../../src/transport/transport-error-codes.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {resumeFixtureParticipantAdmission} from
  '../test-helpers/participant-transaction-fixture.js';
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
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';

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

async function buildSource(t, events, snapshotGate = null) {
  const source = await admittedMirrorSource(t, SOURCE, [
    {name: 'id', type: 'TEXT', primaryKey: true}, {name: 'name', type: 'TEXT'},
  ]);
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

async function registerRealStartAuthorization(source, family, metadata, {children = [], recordStore} = {}) {
  const store = recordStore ?? openRecordStore({partitions: [
    {partition_id: SOURCE},
    {partition_id: 'users-p2'},
    ...children,
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
      resolveProvisionTargetNodeIds: () => [],
      getRoutablePartitionServiceNodeIds: () => [],
      calculateQuorumReplicaCount: () => 2,
      waitForTablePartitionMetadata: async () => {},
      provisionInitialTablePartition: async () => {},
      startMergeReplicationOnSourcePartition: async () => {},
      listTablePartitionRows: () => store.partitionIds()
        .map((id) => store.partitionRow(id)),
      listPartitionServiceRows: () => [],
      deliverReplicaRemoval: async () => ({status: 'completed'}),
      readCommittedGroupMembers: async () => [],
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
        const sqlQueryEngine = Object.assign(
          Object.create(SQLQueryEngine.prototype),
          {
            queryExecutor: {
              findPartitionService: () => ({address: addressOf()}),
            },
            messageRouter: router,
          },
        );
        const adapter = new ManagedMergeTopologyAdapter({sqlQueryEngine});
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
      systemTableCache: new SystemTableCache(),
      dbPath: ':memory:',
      deferElection: true,
    }));
    await target.initialize();
    try {
      await turnChainValue(target.raft.campaign());
      await resumeFixtureParticipantAdmission(target);
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
    const source = await buildSource(t, []);
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
    t.ok(await workflow.reserveSourceMirrorCustody(family, SOURCE, startMetadata,
      source.tableId, source.tableName));
    await replicateSourceMirrorRetentionCustody(source, metadata, {family, barrierIndex: 0});
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

test('a stopped split replays the same durable checkpoint when the final child route returns', async (t) => {
  const columns = [{name: 'id', type: 'TEXT', primaryKey: true}];
  const source = await admittedMirrorSource(t, SOURCE, columns);
  const plan = splitMetadata();
  const [left, right] = plan.targetPartitionIds;
  const target = await admittedMirrorSource(t, left, columns);
  await resumeFixtureParticipantAdmission(source);
  await resumeFixtureParticipantAdmission(target);
  const {workflow, store, metadata} = await registerRealStartAuthorization(source,
    'split', plan, {children: plan.targetPartitionIds.map((partition_id) => ({partition_id, partition_version: 2}))});
  const project = () => source.systemTableCache.applySystemTableChange(
    'tables', 'UPDATE', store.tablesRow());
  project();
  for (const id of plan.targetPartitionIds) {
    source.systemTableCache.applySystemTableChange('partitions', 'INSERT', store.partitionRow(id));
  }
  let routeRestored = false;
  let denied = 0;
  workflow.resolveSplitChildLeaderRoutingEvidence = (id) => {
    const finalCheck = store.tablesRow().partition_transition_state === PARTITION_TRANSITION_STATE.SPLIT_CATCHUP;
    const routable = routeRestored || id !== right || !finalCheck;
    if (!routable) denied++;
    return {leaderNodeId: 'node-a', routableNodeIds: routable ? ['node-a'] : []};
  };
  let snapshots = 0;
  const openSnapshot = source.openSplitSnapshotDatabase.bind(source);
  source.openSplitSnapshotDatabase = () => { snapshots++; return openSnapshot(); };
  let releasedAfterReplay = false;
  const replayed = [];
  source.sqlQueryEngine.queryExecutor = {executeOnPartition: async (id, sql, params, _r, _p, _g, options) => {
    t.equal(id, left, 'post-checkpoint write is routed to its actual child');
    t.equal(readDurableMirrorRetentionCustodyIn(source.db)?.workflowFenceToken,
      metadata.workflowFenceToken, 'pin still held at replay delivery');
    const result = await target.executeQuery(sql, params, options);
    replayed.push(result.success);
    return result;
  }};
  store.observers.push(() => {
    const raw = parsePartitionTransition(store.tablesRow())?.metadata;
    if (raw?.mirrorCustodyGrants?.some((g) =>
      g.partitionId === SOURCE && g.fence === metadata.workflowFenceToken && g.release)) {
      releasedAfterReplay ||= replayed.length === 1 &&
        readDurableMirrorRetentionCustodyIn(source.db)?.workflowFenceToken === metadata.workflowFenceToken;
    }
  });
  const start = () => source.handleStartSplitReplication({tableId: source.tableId,
    tableName: source.tableName, transitionMetadata: metadata});
  t.equal((await start()).success, true);
  await source.splitReplicationRun;
  const stopped = source.splitReplication;
  t.equal(stopped.quiesced, true);
  t.ok(denied > 0, 'readiness refused inside the final cutover turn');
  t.equal(recordSnapshot(store).sourceStatus, SPLIT_ACK_STATUS.CATCHUP_READY);
  t.equal(recordSnapshot(store).state, PARTITION_TRANSITION_STATE.SPLIT_CATCHUP);
  t.equal(readDurableMirrorRetentionCustodyIn(source.db)?.workflowFenceToken, metadata.workflowFenceToken);
  t.equal((await source.executeQuery('INSERT INTO users (id) VALUES (?)', ['a'],
    {entryId: 'write-during-final-route-refusal'})).success, true);
  t.same(target.db.prepare('SELECT id FROM users').all(), []);
  const gate = deferred();
  const read = workflow.readAuthoritativeWorkflowRecord.bind(workflow);
  let heldReads = 0;
  workflow.readAuthoritativeWorkflowRecord = async (...args) => {
    heldReads++;
    await gate.promise;
    return read(...args);
  };
  routeRestored = true;
  project();
  redriveFailedMirrorRelease(source);
  await turns(3);
  const cadenceStarted = Boolean(stopped.resumePromise);
  const duplicate = start();
  gate.resolve();
  t.equal(cadenceStarted, true, 'ordinary recovery already claimed the stopped worker');
  t.equal((await duplicate).success, true);
  await source.splitReplicationRun;
  t.ok(heldReads > 0);
  t.same(replayed, [true], 'one resumed worker delivered the retained write');
  t.same(target.db.prepare('SELECT id FROM users').all(), [{id: 'a'}]);
  t.equal(readDurableMirrorRetentionCustodyIn(source.db), null, 'terminal cleanup committed release');
  t.equal(releasedAfterReplay, true, 'committed terminal grant authorized release after child delivery');
  t.equal(snapshots, 1, 'same-fence continuation did not take another snapshot');
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
  const source = await buildSource(t, events, snapshotGate);
  let starts = 0;
  let acceptedMetadata = null;
  const router = {async deliver(_address, message) {
    starts += 1;
    acceptedMetadata = message.transitionMetadata;
    await source.handleStartSplitReplication(message);
    throw Object.assign(new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT),
      {code: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE});
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
  const resumedSource = await buildSource(t, resumedEvents, resumedGate);
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

  t.equal(await workflow.confirmSplitReplicationStart(acceptedMetadata, 'tbl-users', 'users',
    {requireExecutable: true}), false, 'lost local ACK cannot authorize work after durable cancellation');

  const terminalEvents = [];
  const terminalSource = await buildSource(t, terminalEvents);
  terminalSource.sqlQueryEngine = {managedSplitWorkflow: workflow};
  const resurrected = await terminalSource.handleStartSplitReplication({
    tableId: 'tbl-users', tableName: 'users',
    transitionMetadata: acceptedMetadata,
  });
  t.equal(resurrected.success, false,
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
  const source = await buildSource(t, events);
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
  const source = await buildSource(t, events, snapshotGate);
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
  t.equal(alteredResponse?.success, false,
    'same attempt and fence cannot authorize a different split key');
  t.equal(exactResponse?.success, true,
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
      const source = await buildSource(t, events);
      const decisions = ['attempt_mismatch', 'invalid_transition'];
      const owner = kind === 'split' ? {
        reserveSourceMirrorCustody: sourceMirrorReservationFixture(),
        acknowledgeSourceParticipant: async () => ({
          result: decisions.shift(), splitCutoverApplied: false,
        }),
      } : {
        reserveSourceMirrorCustody: sourceMirrorReservationFixture(),
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

      t.equal(stale.success, false,
        `${kind}: stale durable authorization is refused`);
      t.equal(mismatched.success, false,
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
      reserveSourceMirrorCustody: sourceMirrorReservationFixture(),
        acknowledgeSourceParticipant: async (_workflowId, ack) => {
        await authorizationGate.promise;
        return {result: 'accepted', splitCutoverApplied:
          ack.status === 'catchup_ready'};
      },
    } : {
      reserveSourceMirrorCustody: sourceMirrorReservationFixture(),
        acknowledgeMergeSourceParticipant: async (_workflowId, ack) => {
        await authorizationGate.promise;
        return {result: 'accepted', mergeCutoverApplied:
          ack.status === 'catchup_ready'};
      },
    };
    const source = await buildSource(t, events);
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
      {success: true},
      {success: true},
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
    const restarted = await buildSource(t, restartedEvents);
    const duplicateOwner = kind === 'split' ? {
      reserveSourceMirrorCustody: sourceMirrorReservationFixture(),
        acknowledgeSourceParticipant: async () => ({result: 'duplicate',
        splitCutoverApplied: false}),
    } : {
      reserveSourceMirrorCustody: sourceMirrorReservationFixture(),
        acknowledgeMergeSourceParticipant: async () => ({result: 'duplicate',
        mergeCutoverApplied: false}),
    };
    restarted.sqlQueryEngine = kind === 'split' ?
      {managedSplitWorkflow: duplicateOwner} :
      {managedMergeWorkflow: duplicateOwner};
    const recovered = await start(restarted, {transitionMetadata: metadata});
    await restarted[runField];
    t.equal(recovered.success, true,
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
  const source = await buildSource(t, events, predecessorGate);
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
  t.equal(premature.success, false,
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
  t.equal(continuation.success, true,
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
  const source = await buildSource(t, events);
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
  t.equal(refusedSplit.success, false,
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
  t.equal(splitResponse.success, true,
    'a different durable workflow is admitted despite reset attempt numbers');
  t.equal(source.splitReplication.terminal, true,
    'the replacement split reaches a terminal execution boundary');
  t.equal(source.splitReplication.quiesced, true,
    'the replacement split explicitly quiesces before another family starts');

  t.equal(readDurableMirrorRetentionCustodyIn(source.db)?.workflowId, split.metadata.workflowId,
    'a failed local run still owes its original grant');
  await split.workflow.persistExecutionFailure(split.metadata.workflowId, new Error('split cancelled'));
  const pendingClear = await rejectionOf(() => split.workflow.workflowCoordinator.clearWorkflowRecord(
    split.metadata.workflowId, new Set([PARTITION_TRANSITION_STATE.FAILED])));
  t.equal(pendingClear?.refusal?.reason, 'source-mirror-release-pending',
    'the exact terminal record still holds the predecessor until release');
  await reconcileFailedMirrorCustody(source);
  t.equal(readDurableMirrorRetentionCustodyIn(source.db), null, 'split release committed');
  t.same(split.store.metadata().mirrorCustodyGrants, [], 'split release acknowledged');
  await split.workflow.workflowCoordinator.clearWorkflowRecord(split.metadata.workflowId,
    new Set([PARTITION_TRANSITION_STATE.FAILED]));

  source.backfillMergeSnapshot = async () => {
    events.push('merge-successor-snapshot');
    throw new Error('finish the merge successor');
  };
  const merge = await registerRealStartAuthorization(source, 'merge',
    mergeMetadata({workflowId: 'merge-after-finished-split',
      workflowAttempt: 0, workflowFenceToken: 0}), {recordStore: split.store});
  t.ok(merge.metadata.workflowAttempt > split.metadata.workflowAttempt,
    'registration mints the next attempt from the same table generation');
  const mergeResponse = await source.handleStartMergeReplication({
    tableId: 'tbl-users', tableName: 'users',
    transitionMetadata: merge.metadata,
  });
  await source.mergeReplicationRun;
  t.equal(mergeResponse.success, true,
    'a real merge record authorizes work after the split handle quiesces');
  t.equal(source.splitReplication, null,
    'accepted cross-family START consumes the terminal split predecessor');

  await merge.workflow.runSerializedOwnerStep(SOURCE, async () => {});
  t.equal(recordSnapshot(merge.store).state, PARTITION_TRANSITION_STATE.FAILED,
    'the merge failure acknowledgement reached its durable abort');
  await reconcileFailedMirrorCustody(source);
  t.equal(readDurableMirrorRetentionCustodyIn(source.db), null, 'merge release committed');
  t.same(merge.store.metadata().mirrorCustodyGrants, [], 'merge release acknowledged');
  await merge.workflow.workflowCoordinator.clearWorkflowRecord(merge.metadata.workflowId,
    new Set([PARTITION_TRANSITION_STATE.FAILED]));

  source.applySplitSnapshotBatch = async () => {
    events.push('split-after-merge-snapshot');
    throw new Error('finish the reverse-family successor');
  };
  const reverseSplit = await registerRealStartAuthorization(source, 'split',
    splitMetadata({workflowId: 'split-after-finished-merge',
      workflowAttempt: 0, workflowFenceToken: 0}), {recordStore: split.store});
  const reverseResponse = await source.handleStartSplitReplication({
    tableId: 'tbl-users', tableName: 'users',
    transitionMetadata: reverseSplit.metadata,
  });
  await source.splitReplicationRun;
  t.equal(reverseResponse.success, true,
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
      const source = await buildSource(t, events);
      const owner = kind === 'split' ? {
        reserveSourceMirrorCustody: sourceMirrorReservationFixture(),
        acknowledgeSourceParticipant: async () => {
          await authorizationGate.promise;
          return {result: 'accepted', splitCutoverApplied: false};
        },
      } : {
        reserveSourceMirrorCustody: sourceMirrorReservationFixture(),
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
      t.equal(response.success, false,
        `${kind}: shutdown refuses the accepted-but-unstarted handler`);
      t.equal(duplicateResponse.success, false,
        `${kind}: the joined duplicate observes the same lifecycle refusal`);
      t.same(events, [], `${kind}: shutdown reaches no physical work`);
      t.equal(source[kind === 'split' ? 'splitReplication' :
        'mergeReplication'], null, `${kind}: provisional handle is removed`);
      t.equal(source[runField], null,
        `${kind}: no worker promise is installed after shutdown`);
    }
  });
