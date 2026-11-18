// Real source ledger/subscriber and topology owners, controlled recipient
// semantics and projection changes. Native commit/publication proof is separate.
// Under recipient isolation each leaf of a propagation (the source group, each
// target group) and each other subscriber is a recipient with its own volatile
// cursor: a committed receipt is a fact of its recipient and survives route
// replacement; a recipient without one is shipped again, alone; the row is
// acknowledged only when every currently required recipient confirmed it.
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
  PARTITION_CDC_RECIPIENT_STATE as RECIPIENT_STATE,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  createDurableSourceMessageGroupService,
  createGroupRow,
  createMessageGroupServiceRow,
  createTopologyCache,
  setupConfig,
  teardownConfig,
} from '../topology/cdc-group-propagation-service-harness.js';
import {RESPONSE, SOURCE_GROUP, SOURCE_NODE, TARGET_GROUP, TARGET_NODE,
  addRequiredGroup, assertDebtWithoutAck, omitTarget, putGroup, targetService,
  topologyProgressFixture, updateNode, updateTargetService} from
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

// The source group and the other subscriber commit; the target group does not
// answer with a receipt: it alone is held.
async function commitAllButTheTarget(f) {
  f.targetMode = RESPONSE.UNKNOWN;
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual([...f.subscriberCalls].sort(), [0, 0, 1],
    'the source group, the target group and the other subscriber were each shipped once');
  assert.equal(f.targetCalls.length, 1);
  assert.equal(f.sourceCalls.length, 1);
  assertDebtWithoutAck(f);
}

const replacements = [
  ['address', (f) => {
    updateTargetService(f, {[COLUMN.ADDRESS]: 'repaired/message-group/target'});
  }],
  ['coordinator', (f) => {
    updateTargetService(f, {[COLUMN.NODE_ID]: 'replacement-node'});
  }],
  ['service identity', (f) => {
    updateTargetService(f, {[COLUMN.SERVICE_ID]: 'replacement-service'});
  }],
  ['same-text service birth', (f) => {
    updateTargetService(f, {[COLUMN.CREATED_AT]: targetService(f)[COLUMN.CREATED_AT] + 1});
  }],
  ['same-text creation attempt', (f) => {
    updateTargetService(f, {create_attempt_token: 'replacement-birth-attempt'});
  }],
  ['node boot incarnation', (f) => {
    updateNode(f, TARGET_NODE, {[COLUMN.BOOT_INCARNATION]: 2});
    assert.equal(isIssuedBootIncarnation(
      f.projection.cache.get(TABLES.NODES, TARGET_NODE)[COLUMN.BOOT_INCARNATION]), true);
  }],
];

for (const [name, replace] of replacements) {
  test(`an unconfirmed target is shipped again after ${name} replacement; committed ` +
    'recipients are not', async (t) => {
    const f = await topologyProgressFixture(t);
    await commitAllButTheTarget(f);
    replace(f);
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(f.targetCalls.length, 2, 'the unconfirmed target is shipped again');
    assert.equal(f.sourceCalls.length, 1, 'the source group keeps its committed receipt');
    assert.equal(f.subscriberCalls.filter((index) => index === 1).length, 1,
      'the other subscriber keeps its committed receipt');
    assertDebtWithoutAck(f);
    f.targetMode = RESPONSE.WEAK;
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL,
      'a weak answer from the selected route moves no cursor and acknowledges nothing');
    assert.equal(f.sourceCalls.length, 1);
    assertDebtWithoutAck(f);
  });
}

test('a recipient that committed is not shipped again while another is unconfirmed', async (t) => {
  const f = await topologyProgressFixture(t);
  await commitAllButTheTarget(f);
  f.targetMode = RESPONSE.WEAK;
  assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
  assert.deepEqual([...f.subscriberCalls].sort(), [0, 0, 0, 1],
    'only the target recipient was shipped again');
  assert.equal(f.sourceCalls.length, 1);
  assert.equal(f.targetCalls.length, 2);
  assertDebtWithoutAck(f);
});

test('a newly required group is shipped and holds the frontier; committed recipients keep ' +
  'their receipts', async (t) => {
  const f = await topologyProgressFixture(t);
  await commitAllButTheTarget(f);
  const added = addRequiredGroup(f);
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.ok(f.targetCalls.some((call) => call.groupId === added[COLUMN.GROUP_ID]));
  assert.equal(f.sourceCalls.length, 1, 'the source group\'s receipt survives set expansion');
  assertDebtWithoutAck(f);
  f.targetMode = RESPONSE.WEAK;
  assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
  assertDebtWithoutAck(f);
});

test('the frontier observes requirements again before it acknowledges: a group required ' +
  'while the last recipient answered is shipped first', async (t) => {
  const f = await topologyProgressFixture(t);
  f.targetMode = RESPONSE.NATIVE;
  f.duringOther = () => {
    addRequiredGroup(f);
    f.duringOther = null;
  };
  const pendingAtNewGroup = [];
  f.duringTarget = () => {
    if (f.targetCalls.at(-1).groupId === 'progress-group-c') {
      pendingAtNewGroup.push(
        f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements);
    }
  };
  assert.equal((await f.drive()).state, DRIVE.DRAINED);
  assert.deepEqual(f.targetCalls.map((call) => call.groupId).sort(),
    [TARGET_GROUP, 'progress-group-c']);
  assert.deepEqual(pendingAtNewGroup, [0],
    'nothing was acknowledged before the newly required group was shipped');
  assert.equal(f.sourceCalls.length, 1);
  assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 1,
    'only the now-complete native set makes the still-owed row ACK-eligible');
});

test('a weak answer moves no cursor whatever route carried it; the next delivery uses the ' +
  'route that replaced it', async (t) => {
  const f = await topologyProgressFixture(t);
  f.duringTarget = () => {
    updateTargetService(f, {[COLUMN.ADDRESS]: 'new-route/message-group/target'});
    f.duringTarget = null;
  };
  assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
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
    updateNode(f, SOURCE_NODE, {[COLUMN.LATENCY_GROUP_ID]: 'contradictory-source'});
    putGroup(f, createGroupRow('contradictory-source', SOURCE_NODE));
    putGroup(f, createGroupRow(TARGET_GROUP, null));
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(f.sourceCalls.length, 0);
    assert.equal(f.targetCalls.length, 0);
    assertDebtWithoutAck(f);
    updateNode(f, SOURCE_NODE, {[COLUMN.LATENCY_GROUP_ID]: SOURCE_GROUP});
    putGroup(f, {...createGroupRow('contradictory-source', SOURCE_NODE),
      [COLUMN.GROUP_ID]: SOURCE_GROUP}, 'contradictory-source');
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER,
      'missing coordinator node retains target group debt instead of bypassing grouped routing');
    assert.equal(f.sourceCalls.length, 1);
    assert.equal(f.targetCalls.length, 0);
    assertDebtWithoutAck(f);
    putGroup(f, createGroupRow(TARGET_GROUP, TARGET_NODE));
    assert.equal((await f.drive()).state, DRIVE.DRAINED,
      'restoring coordinator node drains retained grouped obligation');
    assert.equal(f.sourceCalls.length, 1);
    assert.equal(f.targetCalls.length, 1);
  });

// Recipient isolation across tables on real lanes (the lab's Run B: one
// services event stuck at one recipient froze every table). Three partition
// leaders share one topology service and one target group. The target does
// not answer for SERVICES; PARTITIONS and NODES are delivered, acknowledged
// and delivered in their ledgers with no virtual time elapsed. Before, the
// held SERVICES wave owned the node-wide slot and the other tables were
// refused until it was released.
const HELD_RECIPIENT_ACROSS_TABLES = 'a recipient held for one table delays no other table: ' +
  'full path through tenure replacement, native commit and source acknowledgement';
test(HELD_RECIPIENT_ACROSS_TABLES,
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

    const heldReleases = [];
    const heldTables = new Set();
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
    const cache = createTopologyCache({nodes: [...nodesMap.values()],
      services: [targetServiceRow]});
    const sourceGroup = createDurableSourceMessageGroupService(SOURCE_GROUP);
    const router = {
      deliver: async (address, payload, options) => {
        if (heldTables.has(payload.events[0].tableName)) {
          await new Promise((resolve) => heldReleases.push(resolve));
        }
        recipientDeliveries.push({
          address,
          tableName: payload.events[0].tableName,
          eventKey: payload.events[0].eventKey,
          targetNodeId: options.targetNodeId,
        });
        return buildDeliveryEnvelope(
          {acknowledged: true},
          buildCommittedCdcOutcome(payload.events, payload.targetGroupId, {index: 21, term: 3}),
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

    // 1. Hold the SERVICES delivery at the target while PARTITIONS and NODES drive.
    heldTables.add(TABLES.SERVICES);
    const servicesDrivePromise = services.leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    await settleTicks();
    const startedAt = clock.now();
    assert.equal(topology.getStats().activeDurableDeliveries, 1,
      'the SERVICES delivery to the target is in flight, unanswered');
    const servicesRecipients = services.leader.cdcDelivery.getCdcObligationDiagnostics().recipients;
    assert.deepEqual(servicesRecipients.map((recipient) => [recipient.groupId, recipient.state]),
      [[SOURCE_GROUP, RECIPIENT_STATE.CONFIRMED],
        [TARGET_GROUP, RECIPIENT_STATE.SUBSCRIBER_UNCONFIRMED]],
      'the source group confirmed; the target is the named unconfirmed recipient');

    const partitionsDrive = await partitions.leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    assert.equal(partitionsDrive.state, DRIVE.DRAINED, 'PARTITIONS is not delayed');
    const nodesDrive = await nodes.leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    assert.equal(nodesDrive.state, DRIVE.DRAINED, 'NODES is not delayed');
    assert.deepEqual(
      recipientDeliveries.map((entry) => entry.tableName),
      [TABLES.PARTITIONS, TABLES.NODES],
      'both tables reached the target while the SERVICES delivery is still unanswered',
    );
    assert.equal(clock.now(), startedAt, 'no virtual time elapsed');

    // 2. PARTITIONS and NODES acknowledge at their sources.
    for (const table of [partitions, nodes]) {
      await table.leader.cdcDelivery.flushCdcAcknowledgements(
        PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
      );
      await settleTicks();
      assert.equal(table.proposed.some((cmd) => cmd.type === PARTITION_CDC_COMMAND.DELIVERED),
        true);
      assert.deepEqual(countCdcObligations(table.leader.db), {owed: 0, delivered: 1});
    }
    assert.deepEqual(countCdcObligations(services.leader.db), {owed: 1, delivered: 0},
      'SERVICES stays owed: its target has not confirmed');

    // 3. A PARTITIONS tenure replacement changes nothing for the other tables.
    partitions.leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
    const partitionsSteppedDown = await partitions.leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    assert.equal(partitionsSteppedDown.state, DRIVE.NOT_LEADER);

    // 4. The target answers for SERVICES: native commit, then source acknowledgement.
    heldTables.clear();
    for (const release of heldReleases.splice(0)) release();
    const servicesDriveOutcome = await servicesDrivePromise;
    assert.equal(servicesDriveOutcome.state, DRIVE.DRAINED);
    assert.equal(topology.getStats().activeDurableDeliveries, 0);
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
    assert.equal(clock.now(), startedAt, 'the whole path needed no timer');
  });
