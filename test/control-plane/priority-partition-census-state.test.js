// The census state a publication row's priority summary states, at its
// owner (membership-publication-priority-partition-summary.js) and at the
// producers and readers that consume it: the candidate derivation, the row
// builder, the owner's refresh change, the one spread rule and the serve
// decision.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {PRIORITY_CONTROL_PLANE_TABLE_IDS} from
  '../../src/bootstrap/system-partition-classification.js';
import {CONTROL_PLANE_READINESS_DIMENSION as DIMENSION,
  CONTROL_PLANE_READINESS_REASON} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {ControlPlanePublicationsOwner} from
  '../../src/control-plane/owners/control-plane-publications-owner.js';
import {ServeEligibilityOwner, isServeEligibilityAnswerEligible} from
  '../../src/control-plane/serve-eligibility-owner.js';
import {requestOwedPriorityCensus} from
  '../../src/control-plane/membership-publication-coordinator-reconcile-helpers.js';
import {
  PRIORITY_PARTITION_CENSUS_STATE,
  arePriorityPartitionSummariesEqual,
  normalizePriorityPartitionSummary,
  readPriorityPartitionCensusState,
  statePriorityPartitionSummary,
} from '../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  buildMembershipPublicationRow,
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-planning-evidence.js';
import {
  membershipPublicationRefreshChange,
} from '../../src/control-plane/membership-publication-row-changes.js';
import {
  resolvePrioritySpreadPending,
} from '../../src/control-plane/publication-recovery-priority-spread.js';
import {
  hasPriorityRecoverySpreadGap,
} from '../../src/control-plane/priority-recovery-planning-intent.js';
import {normalizeControlPlanePublicationRow} from
  '../../src/control-plane/system-row-normalizers.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {
  MEMBERSHIP_PUBLICATION_READ_PROFILE,
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
} from '../../src/control-plane/membership-publication-row-contract.js';
import {
  SeedMap,
  createRecordingReconcileQueue,
} from '../helpers/recording-reconcile-queue.js';
import {createPublicationStore} from './publication-owner-test-support.js';

const {DERIVED, NOT_DERIVED, ABSENT} = PRIORITY_PARTITION_CENSUS_STATE;
const NODES = Object.freeze(['node-1', 'node-2', 'node-3']);
const CENSUS = Object.freeze({
  satisfied: true,
  requiredDistinctNodeCount: 3,
  readyEligibleNodeCount: 3,
  totalPriorityPartitionCount: 6,
  missingPartitionIds: [],
  blockedPartitions: [],
});

function durableRow(overrides = {}) {
  return {
    publication_id: 'publication-7',
    publication_kind: 'cluster_membership',
    publication_epoch: 7,
    publication_revision: 3,
    publisher_node_id: 'node-1',
    published_active_node_ids: JSON.stringify(NODES),
    required_ack_node_ids: JSON.stringify(NODES),
    acknowledged_node_ids: JSON.stringify(NODES),
    priority_partition_summary: JSON.stringify(CENSUS),
    membership_lifecycle_summary: JSON.stringify(
      {lifecycleState: 'published_active'}),
    transition_history: '[]',
    status: 'PUBLISHED',
    updated_at: 1000,
    ...overrides,
  };
}

test('the census state reader names derived, not derived and absent', () => {
  assert.equal(readPriorityPartitionCensusState(CENSUS), DERIVED);
  assert.equal(readPriorityPartitionCensusState(
    statePriorityPartitionSummary(null)), NOT_DERIVED);
  for (const absent of [null, undefined, '', 0, [], 'not_derived']) {
    assert.equal(readPriorityPartitionCensusState(absent), ABSENT);
  }
  assert.equal(statePriorityPartitionSummary(CENSUS), CENSUS,
    'a derived census is stated as it is');
});

test('a NOT_DERIVED summary survives the row codec and normalization, and never equals a census', () => {
  const stated = statePriorityPartitionSummary(undefined);
  const decoded = normalizeControlPlanePublicationRow(durableRow({
    priority_partition_summary: JSON.stringify(stated),
  })).priorityPartitionSummary;
  assert.equal(readPriorityPartitionCensusState(decoded), NOT_DERIVED);
  const normalized = normalizePriorityPartitionSummary(decoded);
  assert.equal(readPriorityPartitionCensusState(normalized), NOT_DERIVED);
  assert.equal(normalized.satisfied, false);
  assert.equal(arePriorityPartitionSummariesEqual(stated, decoded), true);
  // The census a derivation could produce with the same counts is not it.
  assert.equal(arePriorityPartitionSummariesEqual(stated, {
    satisfied: false,
    requiredDistinctNodeCount: 0,
    readyEligibleNodeCount: 0,
    totalPriorityPartitionCount: 0,
    missingPartitionIds: [],
    blockedPartitions: [],
  }), false);
});

test('every reader of the spread rule holds on a NOT_DERIVED summary', () => {
  const stated = statePriorityPartitionSummary(null);
  assert.equal(hasPriorityRecoverySpreadGap(stated), true);
  assert.equal(
    resolvePrioritySpreadPending({priorityPartitionSummary: stated}), true);
  assert.equal(
    resolvePrioritySpreadPending({priorityPartitionSummary: CENSUS}), false);
});

test('a candidate planned without census inputs asks for no summary refresh, and the row admitted from it states NOT_DERIVED', async () => {
  const latest = normalizeControlPlanePublicationRow(durableRow());
  const planning = {
    latestPublicationRow: latest,
    latestPublishedPublicationRow: latest,
    requiredAckNodeIds: [...NODES],
    acknowledgedNodeIds: [...NODES],
    nodeRows: [],
    nodeEndpointRows: [],
    serviceRows: [],
    partitionRows: [],
    replicaOperationRows: [],
    readinessEntries: [],
    publisherNodeId: 'node-1',
    nowMs: 2000,
  };
  const unchanged = deriveMembershipPublicationCandidate({
    ...planning,
    publishedActiveNodeIds: [...NODES],
  });
  assert.equal(unchanged.changed, false);
  assert.equal(
    readPriorityPartitionCensusState(unchanged.priorityPartitionSummary),
    ABSENT, 'the candidate derived no census');
  assert.equal(unchanged.priorityPartitionSummaryChanged, false,
    'only a derived census moves the latest row\'s summary');

  const nextEpoch = deriveMembershipPublicationCandidate({
    ...planning,
    publishedActiveNodeIds: ['node-1', 'node-2'],
    requiredAckNodeIds: ['node-1', 'node-2'],
    acknowledgedNodeIds: ['node-1', 'node-2'],
  });
  assert.equal(nextEpoch.changed, true);
  assert.equal(nextEpoch.publicationEpoch, 8);
  const admitted = await admitThroughOwner(buildMembershipPublicationRow({
    candidate: nextEpoch, nowMs: 2000}));
  assert.equal(
    readPriorityPartitionCensusState(admitted.priority_partition_summary),
    NOT_DERIVED,
    'the new epoch never inherits the previous epoch\'s census and never carries no summary');
});

// The owner's admission of a candidate row, over the real publications owner
// and a row store: the durable row it admitted.
async function admitThroughOwner(row) {
  const store = createPublicationStore();
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: 'node-1',
    controlPlanePublicationsOwner: store.owner,
    systemTableCache: {getAll: () => []},
    logger: {debug() {}, info() {}, warn() {}, error() {},
      logConsoleOnly() {}},
  });
  try {
    const write = await coordinator.admitPublicationRow(row);
    assert.equal(write.outcome, 'COMMITTED');
    return normalizeDurableSummary(store.row(row.publication_id));
  } finally {
    coordinator.stopOwnerMembershipDriver();
  }
}

function normalizeDurableSummary(storedRow) {
  return {
    ...storedRow,
    priority_partition_summary:
      normalizeControlPlanePublicationRow(storedRow).priorityPartitionSummary,
  };
}

test('the owner\'s admission never admits a row without a summary, and admits a derived census as it is', async () => {
  const withoutCensus = await admitThroughOwner(buildMembershipPublicationRow({
    candidate: {
      publicationEpoch: 8,
      publishedActiveNodeIds: [...NODES],
      requiredAckNodeIds: [...NODES],
      acknowledgedNodeIds: [],
    },
    nowMs: 2000,
  }));
  assert.equal(
    readPriorityPartitionCensusState(withoutCensus.priority_partition_summary),
    NOT_DERIVED);
  const withCensus = await admitThroughOwner(buildMembershipPublicationRow({
    candidate: {
      publicationEpoch: 8,
      publishedActiveNodeIds: [...NODES],
      requiredAckNodeIds: [...NODES],
      acknowledgedNodeIds: [],
      priorityPartitionSummary: CENSUS,
    },
    nowMs: 2000,
  }));
  assert.deepEqual(withCensus.priority_partition_summary, CENSUS);
});

test('the owner\'s refresh never replaces a derived census with NOT_DERIVED, and states NOT_DERIVED on a row that has no summary', () => {
  const offered = statePriorityPartitionSummary(null);
  const lifecycle = {lifecycleState: 'published_active',
    projectedServingNodeIds: [...NODES]};
  const overCensus = membershipPublicationRefreshChange({
    priorityPartitionSummary: offered,
    membershipLifecycleSummary: lifecycle,
    acknowledgedNodeIds: [...NODES],
    now: () => 2000,
  })(durableRow());
  assert.deepEqual(
    normalizePriorityPartitionSummary(
      normalizeControlPlanePublicationRow(overCensus).priorityPartitionSummary),
    normalizePriorityPartitionSummary(CENSUS),
    'the durable census stands');

  const overAbsent = membershipPublicationRefreshChange({
    priorityPartitionSummary: offered,
    membershipLifecycleSummary: lifecycle,
    acknowledgedNodeIds: [...NODES],
    now: () => 2000,
  })(durableRow({priority_partition_summary: null}));
  assert.equal(readPriorityPartitionCensusState(
    normalizeControlPlanePublicationRow(overAbsent).priorityPartitionSummary),
  NOT_DERIVED);

  const derivedOverNotDerived = membershipPublicationRefreshChange({
    priorityPartitionSummary: CENSUS,
    membershipLifecycleSummary: lifecycle,
    acknowledgedNodeIds: [...NODES],
    now: () => 2000,
  })(durableRow({priority_partition_summary: JSON.stringify(offered)}));
  assert.equal(readPriorityPartitionCensusState(
    normalizeControlPlanePublicationRow(derivedOverNotDerived)
      .priorityPartitionSummary), DERIVED);
  assert.equal(
    normalizeControlPlanePublicationRow(derivedOverNotDerived)
      .priorityPartitionSummary.satisfied, true);
});

// The owner driver's tick on the publications leader, with the planning
// snapshot it would read (the planning evidence is not under test): what it
// asks its queue for.
async function driverRequestsFor(latestPublicationRow) {
  const enqueued = [];
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: 'node-1',
    reconcileQueue: createRecordingReconcileQueue(
      {pending: new SeedMap(), enqueued}),
    systemTableCache: {getAll: () => [], get: () => null},
    cdcIntegrationService: {canWriteSystemTableLocally: () => true},
    resolveIsControlPlanePublicationsWriteLeader: () => true,
    now: () => 5000,
    logger: {debug() {}, info() {}, warn() {}, error() {},
      logConsoleOnly() {}},
  });
  coordinator.readPublicationPlanningSnapshot = async () => ({
    latestPublicationRow,
    latestPublishedPublicationRow: latestPublicationRow,
    nodeRows: [],
    readinessByNodeId: {},
  });
  try {
    await coordinator.driveOwnerMembershipReconcile();
  } finally {
    coordinator.stopOwnerMembershipDriver();
  }
  return enqueued;
}

test('the owner driver asks for a full reconcile while the latest durable census is absent or NOT_DERIVED, and for nothing once derived', async () => {
  const notDerived = await driverRequestsFor(durableRow({
    priority_partition_summary:
      JSON.stringify(statePriorityPartitionSummary(null)),
  }));
  assert.deepEqual(notDerived.map((entry) => entry.reason),
    ['priority_census_not_derived']);
  const [request] = notDerived;
  assert.equal(request.context.readSource,
    MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
    'the full reconcile reads the durable owner');
  assert.equal(request.context.publicationActiveGateHandoff, undefined,
    'no handoff: the reconcile reads the census inputs');
  assert.equal(request.context.allowEmptyPreloadedRows, undefined);
  assert.equal(request.context.serviceRows, undefined);

  assert.deepEqual(await driverRequestsFor(durableRow()), [],
    'a derived census owes nothing');
  assert.deepEqual(
    (await driverRequestsFor(durableRow({priority_partition_summary: null})))
      .map((entry) => entry.reason),
    ['priority_census_not_derived'], 'a retained absent census is also owed');
});

const RESTART_NOW_MS = 5000;
const RESTART_LEASE_END_MS = 20000;
const SERVE_READ_TIMEOUT_MS = 1000;
const RESTART_TEST_TIMEOUT_MS = 3000;
const QUIET_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}, error() {},
  logConsoleOnly() {}});

function retainedCensusRows() {
  const nodeRows = NODES.map((nodeId) => ({node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE, boot_incarnation: 1, connection_state: 'ready',
    ready_lease_expires_at: RESTART_LEASE_END_MS, last_heartbeat: RESTART_NOW_MS}));
  const partitionRows = [...PRIORITY_CONTROL_PLANE_TABLE_IDS].map((tableId) => ({
    partition_id: INITIAL_PARTITION_IDS[tableId], table_id: tableId,
    replica_count: NODES.length,
  }));
  const serviceRows = partitionRows.flatMap((partition) => NODES.map((nodeId, index) => ({
    service_id: `${partition.partition_id}-r${index + 1}`, node_id: nodeId,
    partition_id: partition.partition_id, service_type: SERVICE_TYPE.PARTITION,
    status: SERVICE_STATUS.ACTIVE, raft_role: index === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
    address: `${nodeId}/partition/${partition.partition_id}-r${index + 1}`,
  })));
  const endpoints = NODES.map((nodeId) => ({endpoint_id: `${nodeId}-ws`, node_id: nodeId,
    transport_type: 'ws', status: SERVICE_STATUS.ACTIVE, address: `ws://${nodeId}:8082`}));
  return new Map([[TABLES.NODES, nodeRows], [TABLES.PARTITIONS, partitionRows],
    [TABLES.SERVICES, serviceRows], [TABLES.NODE_ENDPOINTS, endpoints]]);
}

// The real publications writer over its existing gateway-store fixture; only
// table/readiness inputs and the interval scheduler are controlled. Recreate
// both coordinator and writer over the retained row, then run the actual
// interval callback, queue, candidate derivation, guarded refresh and serve owner.
// This is a coordinator-restart component witness, not native crash acceptance.
function retainedCensusFixture(t, summary, {publicationPresent = true} = {}) {
  const store = createPublicationStore({rows: publicationPresent ? [durableRow({
    priority_partition_summary: summary === null ? null : JSON.stringify(summary),
  })] : []});
  const rows = retainedCensusRows();
  const requests = [];
  let readOutcome = 'available';
  const readPublicationRows = store.gateway.readAuthoritativeRows.bind(store.gateway);
  store.gateway.readAuthoritativeRows = async (...args) => {
    if (readOutcome === 'publication-malformed') return {success: true, rows: null};
    if (readOutcome === 'publication-missing-outcome') return {rows: store.rows()};
    if (readOutcome === 'publication-failed-with-rows') {
      return {success: false, rows: store.rows(), error: 'held publication source'};
    }
    return readPublicationRows(...args);
  };
  const readRows = async (tableName) => {
    if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
      return store.gateway.readAuthoritativeRows(tableName);
    }
    if (readOutcome === 'input-throw') throw new Error('held input owner');
    if (readOutcome === 'input-malformed-rows') return {success: true, rows: null};
    if (readOutcome === 'unavailable') return {success: false, error: 'held row source'};
    if (readOutcome === 'malformed') return {rows: null};
    return {success: true, rows: (rows.get(tableName) || []).map((row) => ({...row}))};
  };
  const options = {nodeId: NODES[0], now: () => RESTART_NOW_MS,
    logger: QUIET_LOGGER,
    systemTableCache: {getAll: (tableName) => rows.get(tableName) || [], get: () => null},
    authoritativeControlPlaneView: {
      canRead: () => readOutcome !== 'input-capability-unavailable', readRows,
    },
    cdcIntegrationService: {canWriteSystemTableLocally: () => true},
    resolveIsControlPlanePublicationsWriteLeader: () => true,
    controlPlaneReadinessService: {getAllNodeReadiness: async () => NODES.map((nodeId) => ({
      nodeId, dimensions: {[DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
        [DIMENSION.PROCESS_ALIVE]: true, [DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
        [DIMENSION.CONTROL_PLANE_WRITABLE]: true, [DIMENSION.REPAIR_ELIGIBLE]: true},
    }))},
  };
  const retired = new MembershipPublicationCoordinator({...options,
    controlPlanePublicationsOwner: store.owner});
  retired.stopOwnerMembershipDriver();
  const coordinator = new MembershipPublicationCoordinator({...options,
    controlPlanePublicationsOwner: new ControlPlanePublicationsOwner({
      controlPlaneSystemTableGateway: store.gateway, controlPlaneWriteRetryTimeoutMs: 0,
    })});
  coordinator.reconcileQueue.logger = QUIET_LOGGER;
  const enqueue = coordinator.reconcileQueue.enqueue.bind(coordinator.reconcileQueue);
  coordinator.reconcileQueue.enqueue = (ownerKey, reason, context, queueOptions) => {
    requests.push({reason, context});
    return enqueue(ownerKey, reason, context, queueOptions);
  };
  const serve = new ServeEligibilityOwner({readCommittedRows: readRows,
    now: () => RESTART_NOW_MS, readTimeoutMs: SERVE_READ_TIMEOUT_MS,
    setTimeout, clearTimeout, isNodeLoadReady: () => true});
  let periodicCallback;
  let currentDrive;
  const drive = coordinator.driveOwnerMembershipReconcile.bind(coordinator);
  coordinator.driveOwnerMembershipReconcile = () => {
    currentDrive = drive();
    return currentDrive;
  };
  coordinator.startOwnerMembershipDriver({setIntervalFn: (callback) => {
    periodicCallback = callback;
    return {unref() {}};
  }, clearIntervalFn() {}});
  const writeReached = Promise.withResolvers();
  const writeReleased = Promise.withResolvers();
  store.control.beforeWrite = async () => {
    store.control.beforeWrite = null;
    writeReached.resolve();
    await writeReleased.promise;
  };
  t.after(async () => {
    writeReleased.resolve();
    await coordinator.reconcileQueue.awaitCurrentWorkIdle();
    coordinator.stopOwnerMembershipDriver();
    serve.shutdown();
  });
  return {store, rows, coordinator, serve, requests, writeReached: writeReached.promise,
    releaseWrite: () => writeReleased.resolve(),
    setReadOutcome: (value) => {
      readOutcome = value;
      store.control.readsUnavailable = value === 'publication-unavailable';
    },
    tick: async () => {
      periodicCallback();
      await currentDrive;
    }};
}

async function assertServeCensusState(fixture, eligible, reason = null) {
  await fixture.serve.readServeEligibility();
  for (const nodeId of NODES) {
    const answer = fixture.serve.answer(nodeId);
    assert.equal(isServeEligibilityAnswerEligible(answer), eligible);
    if (reason !== null) assert.ok(answer.reasons.includes(reason), JSON.stringify(answer));
  }
}

test('the async publication read consumes its owner even when a plausible cache row exists',
  {timeout: scaleByMachineFactor(RESTART_TEST_TIMEOUT_MS)}, async (t) => {
    const f = retainedCensusFixture(t, null);
    let projectionReads = 0;
    f.store.gateway.readProjectionRows = async () => {
      projectionReads += 1;
      return [durableRow({publication_id: 'cached-publication-99', publication_epoch: 99})];
    };
    const observed = await f.coordinator.getLatestPublicationRow();
    assert.equal(observed.publicationId, 'publication-7');
    assert.equal(projectionReads, 0, 'a cache list cannot substitute for the async owner read');
    assert.equal(f.store.writes.length, 0);
  });

for (const outcome of ['input-capability-unavailable', 'input-malformed-rows',
  'input-throw', 'unavailable', 'malformed']) {
  test(`${outcome}: plausible cached inputs cannot certify a census; restored authority resumes`,
    {timeout: scaleByMachineFactor(RESTART_TEST_TIMEOUT_MS)}, async (t) => {
      const f = retainedCensusFixture(t, null);
      const before = f.store.row('publication-7');
      assert.equal(f.rows.get(TABLES.NODES).length, NODES.length,
        'the cache has a complete plausible membership, so refusal is not vacuous');
      f.setReadOutcome(outcome);
      await assert.rejects(f.coordinator.readPublicationPlanningSnapshot(),
        {code: 'AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE'});
      await f.tick();
      await f.coordinator.reconcileQueue.awaitCurrentWorkIdle();
      assert.deepEqual(f.requests, []);
      assert.equal(f.store.writes.length, 0);
      assert.deepEqual(f.store.row('publication-7'), before);
      await assertServeCensusState(f, false);
      f.setReadOutcome('available');
      await f.tick();
      await f.writeReached;
      assert.deepEqual(f.store.row('publication-7'), before);
      await assertServeCensusState(f, false, 'priority_spread_unstated');
      f.releaseWrite();
      await f.coordinator.reconcileQueue.awaitCurrentWorkIdle();
      const after = normalizeControlPlanePublicationRow(f.store.row('publication-7'));
      assert.equal(readPriorityPartitionCensusState(after.priorityPartitionSummary), DERIVED);
      await assertServeCensusState(f, true);
    });
}

for (const [state, summary] of [[ABSENT, null],
  [NOT_DERIVED, statePriorityPartitionSummary(null)]]) {
  test(`retained ${state} census: real periodic driver repairs through the owner before serve`,
    {timeout: scaleByMachineFactor(RESTART_TEST_TIMEOUT_MS)},
    async (t) => {
      const f = retainedCensusFixture(t, summary);
      const before = f.store.row('publication-7');
      const inputRows = JSON.stringify([...f.rows]);
      await assertServeCensusState(f, false, 'priority_spread_unstated');
      for (let tick = 0; tick < NODES.length; tick++) await f.tick();
      const censusRequests = f.requests.filter(({reason}) =>
        reason === 'priority_census_not_derived');
      assert.equal(censusRequests.length, NODES.length,
        'each real driver invocation must request the owed full census');
      assert.equal(f.requests.length, NODES.length,
        'no membership or acknowledgement handoff is needed');
      for (const {context} of censusRequests) {
        assert.equal(context.readSource,
          MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED);
        assert.equal(context.publicationActiveGateHandoff, undefined);
        assert.equal(context.serviceRows, undefined);
        assert.equal(context.allowEmptyPreloadedRows, undefined);
      }
      await f.writeReached;
      assert.deepEqual(f.store.row('publication-7'), before,
        'owner derivation cannot authorize serving before its guarded write lands');
      await assertServeCensusState(f, false, 'priority_spread_unstated');
      f.releaseWrite();
      await f.coordinator.reconcileQueue.awaitCurrentWorkIdle();
      const after = f.store.row('publication-7');
      const derived = normalizeControlPlanePublicationRow(after).priorityPartitionSummary;
      assert.equal(readPriorityPartitionCensusState(derived), DERIVED);
      assert.equal(derived.satisfied, true);
      assert.equal(derived.totalPriorityPartitionCount, PRIORITY_CONTROL_PLANE_TABLE_IDS.size);
      assert.equal(after.publication_epoch, before.publication_epoch);
      assert.equal(after.publication_id, before.publication_id);
      assert.deepEqual(after.published_active_node_ids, before.published_active_node_ids);
      assert.deepEqual(after.acknowledged_node_ids, before.acknowledged_node_ids);
      const lifecycleRefreshExpected = state === NOT_DERIVED;
      const expectedWrites = lifecycleRefreshExpected ? 2 : 1;
      assert.equal(f.store.writes.length, expectedWrites,
        'only NOT_DERIVED needs the existing recovery-to-steady lifecycle follow-up');
      assert.equal(f.store.landed.length, expectedWrites);
      const [censusRefresh, lifecycleRefresh] = f.store.landed
        .map(normalizeControlPlanePublicationRow);
      assert.deepEqual(censusRefresh.priorityPartitionSummary, derived,
        'the first guarded refresh lands the complete census');
      assert.equal(censusRefresh.membershipLifecycleSummary
        .projectionDiagnostics.recoveryEligibleProjectionEnabled, lifecycleRefreshExpected);
      if (lifecycleRefreshExpected) {
        assert.deepEqual(lifecycleRefresh.priorityPartitionSummary, derived,
          'the lifecycle follow-up preserves the derived census');
        assert.equal(lifecycleRefresh.membershipLifecycleSummary
          .projectionDiagnostics.recoveryEligibleProjectionEnabled, false);
      }
      assert.equal(f.requests.filter(({reason}) =>
        reason === 'priority_summary_refreshed').length, lifecycleRefreshExpected ? 1 : 0);
      for (const [index, write] of f.store.writes.entries()) {
        assert.equal(write.operation, 'update');
        assert.equal(write.tableName, TABLES.CONTROL_PLANE_PUBLICATIONS);
        assert.deepEqual(write.whereClause, {publication_id: before.publication_id,
          publication_revision: before.publication_revision + index});
        assert.equal(write.affectedRows, 1);
      }
      assert.equal(JSON.stringify([...f.rows]), inputRows, 'no unrelated table rows changed');
      await assertServeCensusState(f, true);
      const requestCount = f.requests.length;
      for (let tick = 0; tick < NODES.length; tick++) await f.tick();
      await f.coordinator.reconcileQueue.awaitCurrentWorkIdle();
      assert.equal(f.requests.length, requestCount, 'derived census stops the driver requests');
      assert.equal(f.store.writes.length, expectedWrites, 'repeated driver invocations are idempotent');
    });
}

test('retained ABSENT derives an unsatisfied census from deficient current rows and stays closed',
  {timeout: scaleByMachineFactor(RESTART_TEST_TIMEOUT_MS)},
  async (t) => {
    const f = retainedCensusFixture(t, null);
    const partitionId = INITIAL_PARTITION_IDS[TABLES.CONTROL_PLANE_PUBLICATIONS];
    f.rows.set(TABLES.SERVICES, f.rows.get(TABLES.SERVICES).filter((row) =>
      row.partition_id !== partitionId || row.node_id !== NODES[2]));
    const inputRows = JSON.stringify([...f.rows]);
    const before = f.store.row('publication-7');
    await assertServeCensusState(f, false, 'priority_spread_unstated');
    await f.tick();
    assert.deepEqual(f.requests.map(({reason}) => reason), ['priority_census_not_derived']);
    await f.writeReached;
    assert.deepEqual(f.store.row('publication-7'), before);
    await assertServeCensusState(f, false, 'priority_spread_unstated');
    f.releaseWrite();
    await f.coordinator.reconcileQueue.awaitCurrentWorkIdle();
    const after = normalizeControlPlanePublicationRow(f.store.row('publication-7'));
    assert.equal(readPriorityPartitionCensusState(after.priorityPartitionSummary), DERIVED);
    assert.equal(after.priorityPartitionSummary.satisfied, false);
    assert.ok(after.priorityPartitionSummary.blockedPartitions.some((partition) =>
      partition.partitionId === partitionId));
    assert.equal(f.store.writes.length, 1);
    assert.equal(f.store.landed.length, 1);
    assert.equal(JSON.stringify([...f.rows]), inputRows);
    await assertServeCensusState(f, false,
      CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING);
    for (let tick = 0; tick < NODES.length; tick++) await f.tick();
    await f.coordinator.reconcileQueue.awaitCurrentWorkIdle();
    assert.equal(f.requests.length, 1);
    assert.equal(f.store.writes.length, 1);
  });

test('absent and malformed publication identities are not a retained absent census', () => {
  const requests = [];
  const coordinator = {enqueueClusterMembershipReconcile: (...args) => requests.push(args)};
  for (const row of [null, undefined, {}, {success: false}, {success: true, rows: []},
    durableRow({publication_id: null, priority_partition_summary: null}),
    durableRow({publication_kind: 'other', priority_partition_summary: null}),
    durableRow({publication_epoch: null, priority_partition_summary: null}),
    durableRow({publication_id: null,
      priority_partition_summary: JSON.stringify(statePriorityPartitionSummary(null))}),
    durableRow({publication_kind: 'other',
      priority_partition_summary: JSON.stringify(statePriorityPartitionSummary(null))}),
    durableRow({publication_epoch: null,
      priority_partition_summary: JSON.stringify(statePriorityPartitionSummary(null))})]) {
    assert.equal(requestOwedPriorityCensus(coordinator, row, {}), false);
  }
  assert.deepEqual(requests, []);
});

test('unavailable or malformed authoritative input-table reads create no census request',
  {timeout: scaleByMachineFactor(RESTART_TEST_TIMEOUT_MS)},
  async (t) => {
    for (const outcome of ['unavailable', 'malformed']) {
      const f = retainedCensusFixture(t, null);
      f.setReadOutcome(outcome);
      for (let tick = 0; tick < NODES.length; tick++) await f.tick();
      await f.coordinator.reconcileQueue.awaitCurrentWorkIdle();
      assert.deepEqual(f.requests, [], 'an unanswered planning read creates no census request');
      assert.equal(f.store.writes.length, 0);
      await f.serve.readServeEligibility();
      for (const nodeId of NODES) {
        assert.equal(isServeEligibilityAnswerEligible(f.serve.answer(nodeId)), false);
      }
    }
  });

function publicationRowReaders(coordinator, options) {
  return [
    () => coordinator.getLatestPublicationRow(options),
    () => coordinator.getLatestPublishedPublicationRow(options),
    () => coordinator.getLatestClusterPublication(options),
    () => coordinator.getLatestPublishedClusterPublication(options),
    () => coordinator.getLatestPublicationForNode(NODES[0], options),
  ];
}

test('the direct authoritative owner answers successful empty publication history as absence',
  {timeout: scaleByMachineFactor(RESTART_TEST_TIMEOUT_MS)},
  async (t) => {
    const f = retainedCensusFixture(t, null, {publicationPresent: false});
    for (const readProfile of Object.values(MEMBERSHIP_PUBLICATION_READ_PROFILE)) {
      const options = {readProfile,
        readSource: MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED};
      assert.deepEqual(await f.coordinator.readTableRows(TABLES.CONTROL_PLANE_PUBLICATIONS,
        options), []);
      for (const read of publicationRowReaders(f.coordinator, options)) {
        assert.equal(await read(), null);
      }
    }
    const planning = await f.coordinator.readPublicationPlanningSnapshot();
    assert.equal(planning.latestPublicationRow, null);
    assert.equal(planning.latestPublishedPublicationRow, null);
    assert.deepEqual(f.requests, []);
    assert.equal(f.store.writes.length, 0);
    await assertServeCensusState(f, false);
  });

for (const outcome of ['publication-unavailable', 'publication-malformed',
  'publication-missing-outcome', 'publication-failed-with-rows']) {
  test(`${outcome}: direct reader refuses, real driver stays idle, restored source repairs`,
    {timeout: scaleByMachineFactor(RESTART_TEST_TIMEOUT_MS)},
    async (t) => {
      const f = retainedCensusFixture(t, null);
      const before = f.store.row('publication-7');
      f.setReadOutcome(outcome);
      for (const readProfile of Object.values(MEMBERSHIP_PUBLICATION_READ_PROFILE)) {
        const options = {readProfile,
          readSource: MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED};
        for (const read of publicationRowReaders(f.coordinator, options)) {
          await assert.rejects(read(), {code: 'AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE'});
        }
      }
      await assert.rejects(f.coordinator.readPublicationPlanningSnapshot(),
        {code: 'AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE'});
      await assert.rejects(f.coordinator.reconcileClusterMembership(),
        {code: 'AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE'});
      for (let tick = 0; tick < NODES.length; tick++) await f.tick();
      await f.coordinator.reconcileQueue.awaitCurrentWorkIdle();
      assert.deepEqual(f.requests, []);
      assert.equal(f.store.writes.length, 0);
      assert.deepEqual(f.store.row('publication-7'), before);
      await assertServeCensusState(f, false);

      f.setReadOutcome('available');
      await f.tick();
      assert.deepEqual(f.requests.map(({reason}) => reason), ['priority_census_not_derived']);
      await f.writeReached;
      assert.deepEqual(f.store.row('publication-7'), before);
      await assertServeCensusState(f, false, 'priority_spread_unstated');
      f.releaseWrite();
      await f.coordinator.reconcileQueue.awaitCurrentWorkIdle();
      const after = normalizeControlPlanePublicationRow(f.store.row('publication-7'));
      assert.equal(readPriorityPartitionCensusState(after.priorityPartitionSummary), DERIVED);
      assert.equal(after.priorityPartitionSummary.satisfied, true);
      await assertServeCensusState(f, true);
      const requestCount = f.requests.length;
      const writeCount = f.store.writes.length;
      for (let tick = 0; tick < NODES.length; tick++) await f.tick();
      await f.coordinator.reconcileQueue.awaitCurrentWorkIdle();
      assert.equal(f.requests.length, requestCount);
      assert.equal(f.store.writes.length, writeCount);
    });
}

for (const satisfied of [true, false]) {
  test(`DERIVED satisfied=${satisfied} keeps its existing driver and actual serve semantics`,
    {timeout: scaleByMachineFactor(RESTART_TEST_TIMEOUT_MS)},
    async (t) => {
      const summary = {...CENSUS, satisfied,
        missingPartitionIds: satisfied ? [] : ['control_plane_publications-p1'],
        blockedPartitions: satisfied ? [] : [{partitionId: 'control_plane_publications-p1',
          requiredDistinctNodeCount: NODES.length, readyDistinctNodeCount: 2,
          readyReplicaCount: 2, spreadGap: 1}]};
      const f = retainedCensusFixture(t, summary);
      const before = f.store.row('publication-7');
      for (let tick = 0; tick < NODES.length; tick++) await f.tick();
      await f.coordinator.reconcileQueue.awaitCurrentWorkIdle();
      assert.deepEqual(f.requests, []);
      assert.deepEqual(f.store.row('publication-7'), before);
      assert.equal(f.store.writes.length, 0);
      await assertServeCensusState(f, satisfied);
    });
}
