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
  createStatedRoutingTree,
  createTopologyCache,
  deliveredEventsOf,
  setupConfig,
  teardownConfig,
} from '../topology/cdc-group-propagation-service-harness.js';
import {RESPONSE, SOURCE_GROUP, SOURCE_NODE, TARGET_GROUP, TARGET_NODE, TARGET_SERVICE,
  addRequiredGroup, assertDebtWithoutAck, omitTarget, topologyProgressFixture} from
  '../test-helpers/cdc-topology-progress-fixture.js';
import {
  CDC_TABLE,
  applyCommitted,
  committedQueryOf,
  settleTicks,
  shutdownAll,
  startLeader,
} from '../test-helpers/participant-transaction-fixture.js';
import {primeShipWindow} from '../test-helpers/partition-cdc-lane-fixture.js';

beforeEach(() => setupConfig(LATENCY_PROPAGATION_MODE.SAFE));
afterEach(teardownConfig);

// One foreground attempt per wave, here only: these witnesses count the leaf
// calls of each lane drive and script the recipients' answers per call, so
// each drive is one wave attempt. The wave's own retries are witnessed in
// cdc-group-propagation-foreground-boundary and -wave-lifecycle.
const ONE_ATTEMPT_PER_DRIVE = 1;

async function oneAttemptFixture(t) {
  const f = await topologyProgressFixture(t);
  f.topology.deliveryRetryMaxAttempts = ONE_ATTEMPT_PER_DRIVE;
  return f;
}

async function coverFirstBranchAndExpireOther(f) {
  f.expireOther = true;
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual(f.subscriberCalls, [0, 1]);
  assert.equal(f.targetCalls.length, 1);
  assert.equal(f.sourceCalls.length, 1);
  assertDebtWithoutAck(f);
  f.expireOther = false;
}

// Each replacement is written through the projection's cache owner.
const replacements = [
  ['address', (f) => {
    f.projection.updateService(TARGET_SERVICE,
      {[COLUMN.ADDRESS]: 'repaired/message-group/target'});
  }],
  ['coordinator', (f) => {
    f.projection.updateService(TARGET_SERVICE, {[COLUMN.NODE_ID]: 'replacement-node'});
  }],
  ['service identity', (f) => {
    f.projection.renameService(TARGET_SERVICE, 'replacement-service');
  }],
  ['same-text service birth', (f) => {
    f.projection.updateService(TARGET_SERVICE, {[COLUMN.CREATED_AT]:
      f.projection.service(TARGET_SERVICE)[COLUMN.CREATED_AT] + 1});
  }],
  ['same-text creation attempt', (f) => {
    f.projection.updateService(TARGET_SERVICE,
      {create_attempt_token: 'replacement-birth-attempt'});
  }],
  ['node boot incarnation', (f) => {
    f.projection.updateNode(TARGET_NODE, {[COLUMN.BOOT_INCARNATION]: 2});
    assert.equal(isIssuedBootIncarnation(
      f.projection.node(TARGET_NODE)[COLUMN.BOOT_INCARNATION]), true);
  }],
];

for (const [name, replace] of replacements) {
  test(`source topology owner reobserves covered branch after ${name} replacement`, async (t) => {
    const f = await oneAttemptFixture(t);
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
  const f = await oneAttemptFixture(t);
  await coverFirstBranchAndExpireOther(f);
  assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
  assert.deepEqual(f.subscriberCalls, [0, 1, 1]);
  assert.equal(f.sourceCalls.length, 1);
  assert.equal(f.targetCalls.length, 1);
  assert.equal(f.leader.cdcDelivery.obligationLane.currentObligation, null);
  assertDebtWithoutAck(f);
});

// Range shipping (quest cdc-obligation-range-shipping, design decision 2): the
// leaf coverage that pins a range may live in a branch's topology progress
// only (the source leaf holds a native receipt, the target does not, so the
// subscriber branch itself is still uncovered).
test('source topology owner presents a range whose source leaf is covered again unchanged ' +
  'after more rows were committed and the scan restarted', async (t) => {
  const f = await oneAttemptFixture(t);
  primeShipWindow(f, 8);
  f.targetMode = RESPONSE.UNKNOWN;
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(f.sourceCalls.length, 1);
  assert.equal(f.targetCalls.length, 1);
  const [firstRange] = f.sourceCalls;
  assert.equal(firstRange.length, 1);
  // A second source row is committed while the subscribers hold, and a
  // handshake below the range restarts the idle scan: an unpinned composition
  // would now take both rows.
  f.ready = false;
  const command = committedQueryOf('topology-progress-source-row-later',
    `INSERT INTO ${CDC_TABLE} (id, value) VALUES (?, ?)`);
  command.params = ['B', 'later-source-body'];
  command.timestamp = new HLCTimestamp(1001, 0, 'topology-progress-component').toString();
  assert.equal(applyCommitted(f.leader, command), null);
  await settleTicks();
  f.leader.cdcDelivery.acknowledgeHydratedObligationsThrough(1);
  assert.equal(f.leader.cdcDelivery.obligationLane.scan, null, 'the idle scan restarted');
  f.ready = true;
  f.targetMode = RESPONSE.NATIVE;
  await f.drive();
  assert.deepEqual(f.sourceCalls.map((keys) => keys.length), [1, 1],
    'the covered source leaf is not applied the first range again; the later row is its ' +
    'own range');
  assert.deepEqual(f.sourceCalls[0], firstRange);
  assert.notDeepEqual(f.sourceCalls[1], firstRange);
  assert.deepEqual(f.targetCalls.map((call) => call.eventKeys),
    [firstRange, firstRange, f.sourceCalls[1]],
    'the uncovered target is presented the identical range, then the later row');
});

test('source topology owner observes a new group before consuming a previously covered branch',
  async (t) => {
    const f = await oneAttemptFixture(t);
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
    const f = await oneAttemptFixture(t);
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
    const f = await oneAttemptFixture(t);
    f.duringTarget = () => {
      f.projection.updateService(TARGET_SERVICE,
        {[COLUMN.ADDRESS]: 'new-route/message-group/target'});
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
    const f = await oneAttemptFixture(t);
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
    const f = await oneAttemptFixture(t);
    f.targetMode = RESPONSE.NATIVE;
    f.projection.updateNode(SOURCE_NODE, {[COLUMN.LATENCY_GROUP_ID]: 'contradictory-source'});
    f.projection.putGroup(createGroupRow('contradictory-source', SOURCE_NODE));
    f.projection.putGroup(createGroupRow(TARGET_GROUP, null));
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(f.sourceCalls.length, 0);
    assert.equal(f.targetCalls.length, 0);
    assertDebtWithoutAck(f);
    f.projection.updateNode(SOURCE_NODE, {[COLUMN.LATENCY_GROUP_ID]: SOURCE_GROUP});
    f.projection.renameGroup('contradictory-source', SOURCE_GROUP);
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER,
      'missing coordinator node retains target group debt instead of bypassing grouped routing');
    assert.equal(f.sourceCalls.length, 1);
    assert.equal(f.targetCalls.length, 0);
    assertDebtWithoutAck(f);
    f.projection.updateGroup(TARGET_GROUP, {[COLUMN.COORDINATOR_NODE_ID]: TARGET_NODE});
    assert.equal((await f.drive()).state, DRIVE.DRAINED,
      'restoring coordinator node drains retained grouped obligation');
    assert.equal(f.sourceCalls.length, 1);
    assert.equal(f.targetCalls.length, 1);
  });

test('full CDC continuation path across overlapping tables, held recipient, tenure replacement, recipient native commit, and source acknowledgement',
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
    const cache = createTopologyCache({nodes: [...nodesMap.values()],
      services: [targetServiceRow]});
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
      latencyTreeService: createStatedRoutingTree([SOURCE_GROUP, TARGET_GROUP]),
      nowFn: () => clock.now(),
      deliveryRetryMaxAttempts: ONE_ATTEMPT_PER_DRIVE,
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

    // 1. Hold the SERVICES wave at the recipient. NODES is admitted and
    // delivered while it is in flight; PARTITIONS steps down before it drives.
    heldDeliverRelease = () => {};
    const servicesDrivePromise = services.leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    await settleTicks();
    assert.equal(topology.inFlightDurableWaves.size, 1, 'the SERVICES wave is in flight');

    partitions.leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
    const partitionsSteppedDown = await partitions.leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    assert.equal(partitionsSteppedDown.state, DRIVE.NOT_LEADER);
    assert.deepEqual(countCdcObligations(partitions.leader.db), {owed: 1, delivered: 0},
      'the stepped-down PARTITIONS lane keeps its debt');

    const releaseServices = heldDeliverRelease;
    heldDeliverRelease = null;
    const nodesDrive = await nodes.leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
    );
    assert.equal(nodesDrive.state, DRIVE.DRAINED,
      'NODES is delivered while the SERVICES wave is held');
    assert.deepEqual(recipientDeliveries.map((entry) => entry.tableName), [TABLES.NODES]);

    // 2. Release the held recipient: SERVICES commits, then both lanes
    // acknowledge their rows at the source.
    releaseServices();
    const servicesDriveOutcome = await servicesDrivePromise;
    assert.equal(servicesDriveOutcome.state, DRIVE.DRAINED);
    assert.deepEqual(recipientDeliveries.map((entry) => entry.tableName),
      [TABLES.NODES, TABLES.SERVICES]);
    for (const lane of [services, nodes]) {
      await lane.leader.cdcDelivery.flushCdcAcknowledgements(
        PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY,
      );
    }
    await settleTicks();
    for (const lane of [services, nodes]) {
      assert.equal(lane.proposed.some((cmd) => cmd.type === PARTITION_CDC_COMMAND.DELIVERED),
        true, 'the source proposes its CDC_DELIVERED acknowledgement');
      assert.deepEqual(countCdcObligations(lane.leader.db), {owed: 0, delivered: 1},
        'the source obligation is acknowledged in the ledger');
    }
    assert.equal(topology.inFlightDurableWaves.size, 0, 'no wave is left in flight');
  });
