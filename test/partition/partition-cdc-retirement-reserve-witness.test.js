// Dead-recipient measure 1, end to end (owner ruling 2026-11-11): the real
// lifecycle owner of a message-group replica's retirement
// (MessageGroupServiceRowOwner, STOPPED transition) writes through the real
// control-plane gateway, CDC integration service, SQL engine, query executor
// and partition request to a real rs-raft `services` partition leader whose
// CDC ledger is at capacity; the real source lane of that partition then
// reads the committed retirement and detaches the dead group.
// Substitutes (ports): the recipients' answers (a source group that commits,
// a dead target group that never confirms), the sender's cache, and the
// lane's lifecycle read, which answers from the leader's own committed rows
// with a leader witness.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {unknownCdcAcceptance} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {PARTITION_SERVICE_CDC} from '../../src/partition/partition-service-constants.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND, PARTITION_CDC_RECIPIENT_DETACH_REASON,
  PARTITION_CDC_RECIPIENT_STATE as RECIPIENT_STATE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_CDC_ADMISSION_LOG_MSG} from
  '../../src/partition/partition-cdc-owed-admission.js';
import {CDC_ADMISSION_CLASS_FIELD, PARTITION_CDC_ADMISSION_CLASS as CLASS} from
  '../../src/partition/partition-cdc-admission-class.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL as REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {MessageGroupServiceRowOwner} from
  '../../src/message-group/message-group-service-row-owner.js';
import {createDurableSourceMessageGroupService, createMessageGroupServiceRow} from
  '../topology/cdc-group-propagation-service-harness.js';
import {selectRows, waitFor, withSurface} from '../query/unknown-outcome-surface-fixture.js';

const SOURCE_GROUP = 'retire-source-group';
const TARGET_GROUP = 'retire-dead-group';
const SOURCE_NODE = 'uo-node';
const TARGET_NODE = 'retire-dead-node';
const TARGET_REPLICA = `${TARGET_GROUP}-r1`;
const FILLER = 'retire-filler';
const FILL_BATCH = 64;
const LANE_BUDGET_MS = 30000;

// The leader's own committed rows, as the membership owner's leader-witnessed
// read answers them (the nodes and message_groups owners: the dead group's
// node is still active, and no group row exists, so only the replica row's
// retirement can make the group RETIRED).
function leaderLifecyclePort(surface) {
  const reads = [];
  return {reads, executeAuthoritativeSystemTableRead: async (tableName) => {
    reads.push(tableName);
    const rows = tableName === TABLES.SERVICES ?
      selectRows(surface.dbPath, `SELECT * FROM ${TABLES.SERVICES}`) :
      tableName === TABLES.NODES ?
        [{[COLUMN.NODE_ID]: TARGET_NODE, [COLUMN.STATUS]: 'active'}] : [];
    return {success: true, rows, readAuthorityWitness: {state: 'observed',
      partitionId: INITIAL_PARTITION_IDS[tableName], role: RAFT_ROLE.LEADER,
      servingNodeId: SOURCE_NODE, servingReplicaId: surface.partition.replicaId,
      observedAtMs: 1}};
  }};
}

// The sender's cache still names the dead group's replica as active (a stale
// projection): only the lifecycle owner's evidence may detach it.
function senderCache(targetRow) {
  const nodes = new Map([[SOURCE_NODE, {[COLUMN.NODE_ID]: SOURCE_NODE}],
    [TARGET_NODE, {[COLUMN.NODE_ID]: TARGET_NODE, [COLUMN.BOOT_INCARNATION]: 1}]]);
  const services = [targetRow];
  const listeners = new Set();
  return {
    get: (table, key) => table === TABLES.NODES ? nodes.get(key) ?? null : null,
    getAll: () => [],
    filter: (table, predicate) => table === TABLES.SERVICES ? services.filter(predicate) : [],
    onCacheChange: (listener) => listeners.add(listener),
    offCacheChange: (listener) => listeners.delete(listener),
  };
}

function attachLane(partition, targetRow) {
  const source = createDurableSourceMessageGroupService(SOURCE_GROUP);
  const targetCalls = [];
  const router = {deliver: async (_address, payload) => {
    targetCalls.push(payload.targetGroupId);
    return buildDeliveryEnvelope({acknowledged: true}, unknownCdcAcceptance());
  }};
  const topology = new CDCGroupPropagationService({nodeId: SOURCE_NODE,
    systemTableCache: senderCache(targetRow), messageRouter: router,
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
  return {topology, targetCalls, source, subscribe: () => partition.subscribeToCDCWithHandshake(
    subscriber, {subscriberId: 'retire-propagation',
      role: PARTITION_SERVICE_CDC.SUBSCRIBER_ROLE_PROPAGATION})};
}

async function fillToCapacity(partition) {
  let stamp = 1;
  while (countCdcObligations(partition.db).owed < BOUND.OWED_MAX_EVENTS) {
    const missing = BOUND.OWED_MAX_EVENTS - countCdcObligations(partition.db).owed;
    const batch = Array.from({length: Math.min(FILL_BATCH, missing)}, () => {
      stamp += 1;
      return partition.executeQuery(
        `UPDATE ${TABLES.SERVICES} SET updated_at = ? WHERE service_id = ?`,
        [stamp, FILLER], {entryId: `fill-${stamp}`});
    });
    const answers = await Promise.all(batch);
    assert.equal(answers.every((answer) => answer.success === true), true, 'fill commits');
  }
}

function captureLogs(service) {
  const lines = [];
  const original = service.logger.info.bind(service.logger);
  service.logger.info = (message, context) => {
    lines.push({message, context});
    return original(message, context);
  };
  return lines;
}

const targetOf = (partition) => partition.cdcDelivery.getCdcObligationDiagnostics().recipients
  .find((recipient) => recipient.groupId === TARGET_GROUP);

test('a recipient-retirement write by its real lifecycle owner is admitted at CDC capacity ' +
  'through the retirement reserve and commits; the lane reads the leader-witnessed ' +
  'retirement, detaches the dead group, the ledger drains and ordinary writes resume - ' +
  'no restart, no manual step', async () => {
  await withSurface([TABLES.SERVICES], async ({gateway, of}) => {
    const surface = of(TABLES.SERVICES);
    const {partition} = surface;
    const now = Date.now();
    const targetRow = {...createMessageGroupServiceRow(TARGET_REPLICA, TARGET_NODE,
      `${TARGET_NODE}/message-group/${TARGET_REPLICA}`, RAFT_ROLE.LEADER, TARGET_GROUP),
    [COLUMN.REPLICA_ID]: TARGET_REPLICA, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CREATED_AT]: now, state_entered_at: now, [COLUMN.UPDATED_AT]: now};
    await gateway.insertSystemTableRow(TABLES.SERVICES, targetRow);
    await gateway.insertSystemTableRow(TABLES.SERVICES, {service_id: FILLER,
      service_type: 'partition', node_id: SOURCE_NODE, status: SERVICE_STATUS.ACTIVE,
      created_at: now, updated_at: now});
    const liveRow = selectRows(surface.dbPath,
      `SELECT * FROM ${TABLES.SERVICES} WHERE service_id = ?`, [TARGET_REPLICA])[0];

    // No propagation subscriber yet (NO_PROPAGATION_SUBSCRIBER): the ledger
    // fills to its capacity and ordinary writes are refused.
    await fillToCapacity(partition);
    const ordinary = await partition.executeQuery(
      `UPDATE ${TABLES.SERVICES} SET updated_at = ? WHERE service_id = ?`, [1, FILLER],
      {entryId: 'ordinary-at-capacity'});
    assert.equal(ordinary.failureCode, REFUSAL.CDC_CAPACITY,
      'an ordinary write is refused partition_write_cdc_capacity');

    // The replica's lifecycle owner retires it through the production write path.
    const logs = captureLogs(partition);
    const committed = [];
    const applyWrite = partition.applyWrite.bind(partition);
    partition.applyWrite = (entry, timings) => {
      committed.push(entry);
      return applyWrite(entry, timings);
    };
    const rowOwner = new MessageGroupServiceRowOwner({systemTableWriter: gateway});
    const stopped = await rowOwner.updateReplicaStatus({groupId: TARGET_GROUP,
      replicaId: TARGET_REPLICA, nodeId: TARGET_NODE, status: SERVICE_STATUS.STOPPED,
      registrationEvidence: liveRow});
    partition.applyWrite = applyWrite;
    assert.equal(stopped.status, SERVICE_STATUS.STOPPED, 'the retirement write committed');
    assert.equal(selectRows(surface.dbPath,
      `SELECT status FROM ${TABLES.SERVICES} WHERE service_id = ?`, [TARGET_REPLICA])[0]
      .status, SERVICE_STATUS.STOPPED);
    assert.equal(committed.some((entry) =>
      entry[CDC_ADMISSION_CLASS_FIELD] === CLASS.RECIPIENT_RETIREMENT), true,
    'the class reached the partition entry through every hop');
    assert.equal(countCdcObligations(partition.db).owed, BOUND.OWED_MAX_EVENTS + 1,
      'admitted from the reserve');
    assert.equal(logs.some((line) =>
      line.message === PARTITION_CDC_ADMISSION_LOG_MSG.RESERVE_USED &&
      line.context.tableName === TABLES.SERVICES &&
      line.context.admissionClass === CLASS.RECIPIENT_RETIREMENT), true);

    // The propagation subscriber attaches (its message group became ready):
    // the dead group holds the frontier until the lifecycle owner's evidence
    // detaches it.
    const lifecycle = leaderLifecyclePort(surface);
    partition.cdcIntegrationService = lifecycle;
    const lane = attachLane(partition, targetRow);
    try {
      await lane.subscribe();
      const detached = await waitFor(() => targetOf(partition)?.state === RECIPIENT_STATE.DETACHED,
        LANE_BUDGET_MS);
      assert.equal(detached, true, 'the dead group was detached');
      assert.equal(targetOf(partition).detachReason,
        PARTITION_CDC_RECIPIENT_DETACH_REASON.LIFECYCLE);
      assert.equal(lifecycle.reads.includes(TABLES.SERVICES), true);
      const drained = await waitFor(() =>
        countCdcObligations(partition.db).owed < BOUND.OWED_MAX_EVENTS, LANE_BUDGET_MS);
      assert.equal(drained, true, 'the frontier advanced and owed rows were reclaimed');
      const resumed = await partition.executeQuery(
        `UPDATE ${TABLES.SERVICES} SET updated_at = ? WHERE service_id = ?`, [2, FILLER],
        {entryId: 'ordinary-after-detach'});
      assert.equal(resumed.success, true, 'ordinary writes resume');
    } finally {
      lane.topology.stop();
    }
  }, {cdc: true});
});
