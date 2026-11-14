// Real source ledger/subscriber and topology owners, controlled recipient
// semantics and projection changes. Native commit/publication proof is separate.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {isIssuedBootIncarnation} from '../../src/bootstrap/boot-incarnation-contract.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {
  PARTITION_CDC_COMMAND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_REASON,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  createDurableSourceMessageGroupService,
  createGroupRow,
  createMessageGroupServiceRow,
  deliveredEventsOf,
  setupConfig,
  teardownConfig,
} from '../topology/cdc-group-propagation-service-harness.js';
import {RESPONSE, SOURCE_GROUP, SOURCE_NODE, TARGET_GROUP, TARGET_NODE,
  addRequiredGroup, assertDebtWithoutAck, omitTarget, topologyProgressFixture} from
  '../test-helpers/cdc-topology-progress-fixture.js';
import {
  applyCommitted,
  committedQueryOf,
  settleTicks,
  shutdownAll,
  startLeader,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(() => setupConfig(LATENCY_PROPAGATION_MODE.SAFE));
afterEach(teardownConfig);

async function coverFirstBranchAndExpireOther(f) {
  f.expireOther = true;
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual(f.subscriberCalls, [0, 1]);
  assert.equal(f.targetCalls.length, 1);
  assert.equal(f.sourceCalls.length, 1);
  assertDebtWithoutAck(f);
  f.expireOther = false;
}

const replacements = [
  ['address', (f) => {
    f.projection.services[0][COLUMN.ADDRESS] = 'repaired/message-group/target';
  }],
  ['coordinator', (f) => {
    f.projection.services[0][COLUMN.NODE_ID] = 'replacement-node';
  }],
  ['service identity', (f) => {
    f.projection.services[0][COLUMN.SERVICE_ID] = 'replacement-service';
  }],
  ['same-text service birth', (f) => {
    f.projection.services[0][COLUMN.CREATED_AT] += 1;
  }],
  ['same-text creation attempt', (f) => {
    f.projection.services[0].create_attempt_token = 'replacement-birth-attempt';
  }],
  ['node boot incarnation', (f) => {
    f.projection.nodes.get(TARGET_NODE)[COLUMN.BOOT_INCARNATION] = 2;
    assert.equal(isIssuedBootIncarnation(
      f.projection.nodes.get(TARGET_NODE)[COLUMN.BOOT_INCARNATION]), true);
  }],
];

for (const [name, replace] of replacements) {
  test(`source topology owner reobserves covered branch after ${name} replacement`, async (t) => {
    const f = await topologyProgressFixture(t);
    await coverFirstBranchAndExpireOther(f);
    replace(f);
    f.targetMode = RESPONSE.UNKNOWN;
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(f.targetCalls.length, 2, 'the old weak tag cannot skip the replacement route');
    assert.equal(f.sourceCalls.length, 1, 'the existing native source fact is still reusable');
    assertDebtWithoutAck(f);
    f.targetMode = RESPONSE.WEAK;
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL,
      'a new observation from the selected route permits only weak scan release');
    assertDebtWithoutAck(f);
  });
}

test('source topology owner reuses an unchanged covered prefix across response budgets', async (t) => {
  const f = await topologyProgressFixture(t);
  await coverFirstBranchAndExpireOther(f);
  assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
  assert.deepEqual(f.subscriberCalls, [0, 1, 1]);
  assert.equal(f.sourceCalls.length, 1);
  assert.equal(f.targetCalls.length, 1);
  assert.equal(f.leader.cdcDelivery.obligationLane.currentObligation, null);
  assertDebtWithoutAck(f);
});

test('source topology owner observes a new group before consuming a previously covered branch',
  async (t) => {
    const f = await topologyProgressFixture(t);
    await coverFirstBranchAndExpireOther(f);
    const added = addRequiredGroup(f);
    f.targetMode = RESPONSE.UNKNOWN;
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.ok(f.targetCalls.some((call) => call.groupId === added[COLUMN.GROUP_ID]));
    assert.equal(f.sourceCalls.length, 1, 'native historical fact survives set expansion');
    assertDebtWithoutAck(f);
    f.targetMode = RESPONSE.WEAK;
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
    assertDebtWithoutAck(f);
  });

test('source final aggregation reobserves requirements after the last subscriber returns',
  async (t) => {
    const f = await topologyProgressFixture(t);
    f.targetMode = RESPONSE.NATIVE;
    f.duringOther = () => {
      addRequiredGroup(f);
      f.duringOther = null;
    };
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.deepEqual(f.targetCalls.map((call) => call.groupId), [TARGET_GROUP]);
    assertDebtWithoutAck(f);
    assert.equal((await f.drive()).state, DRIVE.DRAINED);
    assert.deepEqual(f.targetCalls.map((call) => call.groupId), [TARGET_GROUP, 'progress-group-c']);
    assert.equal(f.sourceCalls.length, 1);
    assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 1,
      'only the now-complete native set makes the still-owed row ACK-eligible');
  });

test('topology owner cannot install a weak result from the route replaced during its await',
  async (t) => {
    const f = await topologyProgressFixture(t);
    f.duringTarget = () => {
      f.projection.services[0][COLUMN.ADDRESS] = 'new-route/message-group/target';
      f.duringTarget = null;
    };
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(f.targetCalls.length, 1);
    assertDebtWithoutAck(f);
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
    assert.equal(f.targetCalls[1].address, 'new-route/message-group/target');
    assertDebtWithoutAck(f);
  });

test('topology projection omission preserves a captured owed group until it actually answers',
  async (t) => {
    const f = await topologyProgressFixture(t);
    f.targetMode = RESPONSE.UNKNOWN;
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    omitTarget(f);
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.deepEqual(f.targetCalls.map((call) => call.groupId), [TARGET_GROUP, TARGET_GROUP]);
    assertDebtWithoutAck(f);
    f.targetMode = RESPONSE.NATIVE;
    assert.equal((await f.drive()).state, DRIVE.DRAINED);
    assert.deepEqual(f.targetCalls.map((call) => call.groupId),
      [TARGET_GROUP, TARGET_GROUP, TARGET_GROUP]);
    assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 1);
  });

test('grouped source contradiction refuses before effects even with another fallback reason',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.GROUPED);
    const f = await topologyProgressFixture(t);
    f.targetMode = RESPONSE.NATIVE;
    f.projection.nodes.get(SOURCE_NODE)[COLUMN.LATENCY_GROUP_ID] = 'contradictory-source';
    f.projection.groups.push(createGroupRow('contradictory-source', SOURCE_NODE),
      createGroupRow(TARGET_GROUP, null));
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(f.sourceCalls.length, 0);
    assert.equal(f.targetCalls.length, 0);
    assertDebtWithoutAck(f);
    f.projection.nodes.get(SOURCE_NODE)[COLUMN.LATENCY_GROUP_ID] = SOURCE_GROUP;
    f.projection.groups[0][COLUMN.GROUP_ID] = SOURCE_GROUP;
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER,
      'missing coordinator node retains target group debt instead of bypassing grouped routing');
    assert.equal(f.sourceCalls.length, 1);
    assert.equal(f.targetCalls.length, 0);
    assertDebtWithoutAck(f);
    f.projection.groups[1][COLUMN.COORDINATOR_NODE_ID] = TARGET_NODE;
    assert.equal((await f.drive()).state, DRIVE.DRAINED,
      'restoring coordinator node drains retained grouped obligation');
    assert.equal(f.sourceCalls.length, 1);
    assert.equal(f.targetCalls.length, 1);
  });

test('full CDC continuation path across competing tables, held recipient, tenure replacement, recipient native commit, and source acknowledgement',
  async (t) => {
    const clock = new VirtualTimeSource({startMs: 1000});
    const services = await startLeader({
      tableName: TABLES.SERVICES,
      partitionId: 'services-p1',
      replicaId: 'services-p1-r1',
      timeSource: clock,
    });
    const partitions = await startLeader({
      tableName: TABLES.PARTITIONS,
      partitionId: 'partitions-p1',
      replicaId: 'partitions-p1-r1',
      timeSource: clock,
    });
    const nodes = await startLeader({
      tableName: TABLES.NODES,
      partitionId: 'nodes-p1',
      replicaId: 'nodes-p1-r1',
      timeSource: clock,
    });

    let heldDeliverRelease = null;
    const recipientDeliveries = [];
    const nodesMap = new Map([
      [SOURCE_NODE, {[COLUMN.NODE_ID]: SOURCE_NODE, [COLUMN.LATENCY_GROUP_ID]: SOURCE_GROUP}],
      [TARGET_NODE, {[COLUMN.NODE_ID]: TARGET_NODE, [COLUMN.BOOT_INCARNATION]: 1}],
    ]);
    const targetServiceRow = {
      ...createMessageGroupServiceRow(
        `${TARGET_GROUP}-r1`,
        TARGET_NODE,
        `${TARGET_NODE}/message-group/${TARGET_GROUP}-r1`,
        RAFT_ROLE.LEADER,
        TARGET_GROUP,
      ),
      [COLUMN.REPLICA_ID]: `${TARGET_GROUP}-r1`,
      [COLUMN.CREATED_AT]: 100,
      create_attempt_token: `${TARGET_GROUP}-birth-1`,
    };
    const cache = {
      get: (table, key) => table === TABLES.NODES ? nodesMap.get(key) ?? null : null,
      getAll: () => [],
      filter: (table, predicate) =>
        table === TABLES.SERVICES ? [targetServiceRow].filter(predicate) : [],
    };
    const sourceGroup = createDurableSourceMessageGroupService(SOURCE_GROUP);
    const router = {
      deliver: async (address, payload, options) => {
        if (heldDeliverRelease !== null) {
          await new Promise((resolve) => {
            heldDeliverRelease = resolve;
          });
        }
        const delivered = deliveredEventsOf(payload);
        recipientDeliveries.push({
          address,
          tableName: delivered[0].tableName,
          eventKey: delivered[0].eventKey,
          targetNodeId: options.targetNodeId,
        });
        return buildDeliveryEnvelope(
          {acknowledged: true},
          buildCommittedCdcOutcome(delivered, payload.targetGroupId, {index: 21, term: 3}),
        );
      },
    };
    const topology = new CDCGroupPropagationService({
      nodeId: SOURCE_NODE,
      systemTableCache: cache,
      messageRouter: router,
      latencyTreeService: {getRoutingOrder: () => [SOURCE_GROUP, TARGET_GROUP]},
      nowFn: () => clock.now(),
      deliveryRetryMaxAttempts: 1,
    });
    topology.initialize();
    topology.start();
    t.after(async () => {
      topology.stop();
      await shutdownAll(services.leader, partitions.leader, nodes.leader);
    });

    const installPartitionPipeline = async ({leader, proposed}, tableName, rowId) => {
      leader.controllablePort.setProposeHandler(async (entry) => {
        proposed.push({...entry});
        applyCommitted(leader, entry);
      });
      leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
      const selection = () => ({ready: true, service: sourceGroup});
      const subscriber = buildPartitionCdcPropagationSubscriber({
        tableName,
        resolveOperationalMessageGroupSelection: selection,
        resolveOperationalMessageGroupSelectionAsync: async () => selection(),
        buildMessageGroupOwnerNotReadyError: () => new Error('not ready'),
        propagatePartitionCDCEvent: (_selected, events, context) =>
          topology.propagateCDCEvent({
            events,
            sourceMessageGroupService: sourceGroup,
            deliveryContext: context,
          }),
      });
      await leader.subscribeToCDCWithHandshake(subscriber, {
        subscriberId: `contend-${tableName}`,
      });
      const command = committedQueryOf(
        `${tableName}-${rowId}`,
        `INSERT INTO ${tableName} (id, value) VALUES (?, ?)`,
      );
      command.params = [rowId, `val-${rowId}`];
      command.timestamp = new HLCTimestamp(1000, 0, `src-${tableName}`).toString();
      assert.equal(applyCommitted(leader, command), null);
      leader.controllablePort.setRole(RAFT_ROLE.LEADER);
      await settleTicks();
      assert.deepEqual(countCdcObligations(leader.db), {owed: 1, delivered: 0});
    };

    await installPartitionPipeline(services, TABLES.SERVICES, 'svc-1');
    await installPartitionPipeline(partitions, TABLES.PARTITIONS, 'part-1');
    await installPartitionPipeline(nodes, TABLES.NODES, 'node-1');

    // 1. Hold SERVICES wave 1 at the recipient while PARTITIONS and NODES contend.
    heldDeliverRelease = () => {};
    const servicesDrivePromise = services.leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    await settleTicks();
    assert.notEqual(topology.activeDurablePropagation, null, 'SERVICES holds the shared slot');

    const partitionsHeld = await partitions.leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    assert.equal(partitionsHeld.state, DRIVE.HELD_BY_SUBSCRIBER);

    const nodesHeld = await nodes.leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    assert.equal(nodesHeld.state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.deepEqual(topology.waitingDurableSliceTables, [TABLES.PARTITIONS, TABLES.NODES]);
    assert.equal(
      nodes.leader.cdcDelivery.obligationLane.retryTimer.delayMs,
      10,
      'contending NODES lane initially arms 10ms busy retry delay',
    );

    // 2. Replace PARTITIONS leadership tenure while queued at head of FIFO contender queue:
    // PARTITIONS must be evicted from waitingDurableSliceTables, leaving NODES at the head.
    partitions.leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
    const partitionsSteppedDown = await partitions.leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    assert.equal(partitionsSteppedDown.state, DRIVE.NOT_LEADER);
    assert.deepEqual(
      topology.waitingDurableSliceTables,
      [TABLES.NODES],
      'tenure replacement on PARTITIONS evicts it and promotes NODES to FIFO head',
    );

    // 3. Release the held recipient for SERVICES wave 1:
    // SERVICES completes recipient commit + cleanup, waking NODES to a 1ms retry timer,
    // and flushes its own source CDC_DELIVERED acknowledgement.
    const releaseRecipient = heldDeliverRelease;
    heldDeliverRelease = null;
    releaseRecipient();
    const servicesDriveOutcome = await servicesDrivePromise;
    assert.equal(servicesDriveOutcome.state, DRIVE.DRAINED);
    await settleTicks();
    assert.equal(
      nodes.leader.cdcDelivery.obligationLane.retryTimer.delayMs,
      1,
      'SERVICES cleanup wake shortens head contender NODES retry timer to 1ms',
    );

    await services.leader.cdcDelivery.flushCdcAcknowledgements(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    await settleTicks();
    assert.equal(
      services.proposed.some((cmd) => cmd.type === PARTITION_CDC_COMMAND.DELIVERED),
      true,
      'SERVICES proposes source CDC_DELIVERED acknowledgement',
    );
    assert.deepEqual(
      countCdcObligations(services.leader.db),
      {owed: 0, delivered: 1},
      'SERVICES source obligation is acknowledged in the ledger',
    );

    // 4. Advance clock by 1ms: NODES wakes up automatically from its 1ms timer,
    // delivers to the recipient, receives native commit receipt, and acknowledges at source.
    clock.advance(1);
    await settleTicks();
    assert.deepEqual(
      recipientDeliveries.map((entry) => entry.tableName),
      [TABLES.SERVICES, TABLES.NODES],
      'NODES delivers to recipient immediately on its 1ms slice-turn wake',
    );
    await nodes.leader.cdcDelivery.flushCdcAcknowledgements(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    await settleTicks();
    assert.equal(
      nodes.proposed.some((cmd) => cmd.type === PARTITION_CDC_COMMAND.DELIVERED),
      true,
      'NODES proposes source CDC_DELIVERED acknowledgement after wake-up delivery',
    );
    assert.deepEqual(
      countCdcObligations(nodes.leader.db),
      {owed: 0, delivered: 1},
      'NODES source obligation is acknowledged in the ledger',
    );
  });
