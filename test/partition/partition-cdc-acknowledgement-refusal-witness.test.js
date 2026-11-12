// CDC delivery finding F1 (2026-11-11): a terminally refused acknowledgement
// must not hold the source lane for the rest of its leadership tenure.
// Real rs-raft `services` partition leader (unknown-outcome-surface fixture,
// cdc mode): real write path, CDC owed-work admission, ledger, obligation
// lane, CDC_DELIVERED proposal, commit and application (the refusal is the
// partition's own committed judgement). The fault is injected at the storage
// port: the lane's owed read (SELECT_OWED_AFTER) reports a wrong event key for
// one owed row, so the acknowledgement the lane builds names an identity the
// ledger does not hold at that position (POSITION_MISMATCH at apply).
// Substitutes (ports): a source message group that commits every range, an
// empty sender cache (no target groups).
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES, SERVICE_STATUS} from '../../src/constants/index.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {PARTITION_SERVICE_CDC} from '../../src/partition/partition-service-constants.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND, PARTITION_CDC_OBLIGATION_FAILURE_CODE as CODE,
  PARTITION_CDC_OBLIGATION_LOG_MSG as LOG_MSG, PARTITION_CDC_OBLIGATION_SQL as SQL} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations, readOwedCdcObligations} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {ACKNOWLEDGEMENT_REFUSAL_LOG_MSG as REFUSAL_LOG_MSG,
  ACKNOWLEDGEMENT_REFUSAL_OUTCOME as REFUSAL_OUTCOME} from
  '../../src/partition/partition-cdc-acknowledgement-refusal.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL as REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {createDurableSourceMessageGroupService, createTopologyCache} from
  '../topology/cdc-group-propagation-service-harness.js';
import {waitFor, withSurface} from '../query/unknown-outcome-surface-fixture.js';

const SOURCE_GROUP = 'ack-refusal-source-group';
const SOURCE_NODE = 'uo-node';
const FILLER = 'ack-refusal-filler';
const FILL_BATCH = 64;
const LANE_BUDGET_MS = 30000;
const CORRUPT_KEY = 'storage-fault-wrong-event-key';

function emptySenderCache() {
  return createTopologyCache();
}

function attachLane(partition) {
  const source = createDurableSourceMessageGroupService(SOURCE_GROUP);
  const topology = new CDCGroupPropagationService({nodeId: SOURCE_NODE,
    systemTableCache: emptySenderCache(), messageRouter: {deliver: async () => {
      throw new Error('no target group exists');
    }},
    latencyTreeService: {getRoutingOrder: () => []}, deliveryRetryMaxAttempts: 1});
  topology.initialize();
  topology.start();
  const selection = () => ({ready: true, service: source});
  const subscriber = buildPartitionCdcPropagationSubscriber({tableName: TABLES.SERVICES,
    resolveOperationalMessageGroupSelection: selection,
    resolveOperationalMessageGroupSelectionAsync: async () => selection(),
    buildMessageGroupOwnerNotReadyError: () => new Error('not ready'),
    propagatePartitionCDCEvent: (_selected, events, context) =>
      topology.propagateCDCEvent({events, sourceMessageGroupService: source,
        deliveryContext: context}),
  });
  return {topology, subscribe: () => partition.subscribeToCDCWithHandshake(subscriber,
    {subscriberId: 'ack-refusal-propagation',
      role: PARTITION_SERVICE_CDC.SUBSCRIBER_ROLE_PROPAGATION})};
}

const fillerUpdate = (partition, stamp, entryId) => partition.executeQuery(
  `UPDATE ${TABLES.SERVICES} SET updated_at = ? WHERE service_id = ?`, [stamp, FILLER],
  {entryId});

async function fillToCapacity(partition) {
  let stamp = 1;
  while (countCdcObligations(partition.db).owed < BOUND.OWED_MAX_EVENTS) {
    const missing = BOUND.OWED_MAX_EVENTS - countCdcObligations(partition.db).owed;
    const answers = await Promise.all(Array.from({length: Math.min(FILL_BATCH, missing)}, () => {
      stamp += 1;
      return fillerUpdate(partition, stamp, `fill-${stamp}`);
    }));
    assert.equal(answers.every((answer) => answer.success === true), true, 'fill commits');
  }
}

// The storage-port fault: the owed read reports `eventKey` wrong for the row
// at `position` while the fault is on.
function injectOwedReadFault(partition, position) {
  const fault = {on: true, served: 0};
  const {db} = partition;
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const statement = prepare(sql);
    if (sql !== SQL.SELECT_OWED_AFTER) return statement;
    return {all: (...args) => statement.all(...args).map((row) => {
      if (!fault.on || Number(row.log_index) !== position.logIndex ||
          Number(row.ordinal) !== position.ordinal) return row;
      fault.served += 1;
      return {...row, event_key: CORRUPT_KEY};
    })};
  };
  return fault;
}

function captureErrors(partition, onLine) {
  const lines = [];
  for (const level of ['warn', 'error']) {
    const original = partition.logger[level].bind(partition.logger);
    partition.logger[level] = (message, context) => {
      lines.push({level, message, context});
      onLine?.(message, context);
      return original(message, context);
    };
  }
  return lines;
}

async function atCapacity(gateway, partition) {
  const now = Date.now();
  await gateway.insertSystemTableRow(TABLES.SERVICES, {service_id: FILLER,
    service_type: 'partition', node_id: SOURCE_NODE, status: SERVICE_STATUS.ACTIVE,
    created_at: now, updated_at: now});
  await fillToCapacity(partition);
  const refused = await fillerUpdate(partition, 1, 'ordinary-at-capacity');
  assert.equal(refused.failureCode, REFUSAL.CDC_CAPACITY, 'at capacity an ordinary write is refused');
  return readOwedCdcObligations(partition.db, {limit: 1})[0];
}

test('F1 a terminally refused acknowledgement (a transient fault at the storage port made the ' +
  'lane name a wrong identity) is re-derived from the committed ledger within the tenure: ' +
  'owed depth returns below the cap and an ordinary write commits, with no leader change',
async () => {
  await withSurface([TABLES.SERVICES], async ({gateway, of}) => {
    const {partition} = of(TABLES.SERVICES);
    const head = await atCapacity(gateway, partition);
    const tenure = partition.leadershipTenure;
    const fault = injectOwedReadFault(partition, head);
    // The fault is transient: it ends when the partition refused what it caused.
    const lines = captureErrors(partition, (message, context) => {
      if (message === LOG_MSG.ACKNOWLEDGEMENTS_REFUSED &&
          context?.failureCode === CODE.POSITION_MISMATCH) fault.on = false;
    });
    const lane = attachLane(partition);
    try {
      await lane.subscribe();
      // Every owed row, the refused batch's included, is delivered and
      // reclaimed (a held lane keeps at least that batch owed for the tenure
      // and refills to the cap with the next writes).
      const drained = await waitFor(() => countCdcObligations(partition.db).owed === 0,
        LANE_BUDGET_MS);
      assert.equal(fault.served > 0, true, 'the fault reached the lane');
      assert.equal(lines.some(({message, context}) =>
        message === LOG_MSG.ACKNOWLEDGEMENTS_REFUSED &&
        context?.failureCode === CODE.POSITION_MISMATCH && context?.proposed === true), true,
      'the partition refused the acknowledgement terminally (committed judgement)');
      assert.equal(drained, true, 'every owed row was delivered within the tenure');
      assert.equal(partition.leadershipTenure, tenure, 'no leader change');
      const resumed = await fillerUpdate(partition, 2, 'ordinary-after-refusal');
      assert.equal(resumed.success, true, 'an ordinary write commits');
      const diagnostics = partition.cdcDelivery.getCdcObligationDiagnostics();
      assert.deepEqual({held: diagnostics.held, quarantined: diagnostics.quarantined},
        {held: null, quarantined: []}, 'nothing stays held or quarantined');
    } finally {
      lane.topology.stop();
    }
  }, {cdc: true});
});

test('F1 a refusal that recurs for an identity the lane re-read from the ledger itself (the ' +
  'ledger contradicts its own owed read: a persistent storage fault) quarantines exactly that ' +
  'position: it stays owed and named, the rest drains below the cap and an ordinary write ' +
  'commits, with no leader change', async () => {
  await withSurface([TABLES.SERVICES], async ({gateway, of}) => {
    const {partition} = of(TABLES.SERVICES);
    const head = await atCapacity(gateway, partition);
    const tenure = partition.leadershipTenure;
    const fault = injectOwedReadFault(partition, head);
    const lines = captureErrors(partition);
    const lane = attachLane(partition);
    try {
      await lane.subscribe();
      const quarantined = await waitFor(() =>
        partition.cdcDelivery.getCdcObligationDiagnostics().quarantined.length > 0,
      LANE_BUDGET_MS);
      assert.equal(quarantined, true, 'the recurring refusal is quarantined');
      const drained = await waitFor(() =>
        countCdcObligations(partition.db).owed < BOUND.OWED_MAX_EVENTS, LANE_BUDGET_MS);
      assert.equal(drained, true, 'owed depth returned below the cap');
      assert.equal(partition.leadershipTenure, tenure, 'no leader change');
      const resumed = await fillerUpdate(partition, 2, 'ordinary-after-quarantine');
      assert.equal(resumed.success, true, 'an ordinary write commits');
      const diagnostics = partition.cdcDelivery.getCdcObligationDiagnostics();
      assert.equal(diagnostics.held, null, 'the lane is not held');
      assert.deepEqual(diagnostics.quarantined.map(({logIndex, ordinal, failureCode}) =>
        ({logIndex, ordinal, failureCode})),
      [{logIndex: head.logIndex, ordinal: head.ordinal, failureCode: CODE.POSITION_MISMATCH}],
      'exactly the contradicted position is quarantined');
      fault.on = false;
      assert.equal(readOwedCdcObligations(partition.db, {limit: 1})[0]?.eventKey, head.eventKey,
        'the quarantined row stays owed: nothing is marked delivered without its identity');
      assert.equal(lines.filter(({level, message}) => level === 'error' &&
        message === REFUSAL_LOG_MSG[REFUSAL_OUTCOME.QUARANTINED]).length, 1,
      'the quarantine is raised once, as an error');
    } finally {
      lane.topology.stop();
    }
  }, {cdc: true});
});
