// W-HID-1 (handler-identity cluster finding F1): a retiring partition
// incarnation never takes a Raft envelope it drops.
//
// Property. Between the start of a partition's shutdown (consensus closed,
// raft port released) and the retirement of its exact transport handler, a
// Raft envelope delivered to the still-registered handler is refused by the
// handler itself, so the sender's router reports the delivery FAILED with
// reasonCode handler_failed (never DELIVERED) and no step reaches a port.
// Before that window the same envelope is DELIVERED and stepped once.
//
// The real entry path: MessageRouter.deliver (LOCAL) into the partition's
// registered transport handler. Substituted: the consensus port (the
// controllable port) and the retirement lane of the replica's lifecycle owner,
// held open so the window is observable; the lane's contract (it runs the
// exact retirement) is kept.
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE as REASON,
  TRANSPORT_DELIVERY_OUTCOME_STATE as STATE,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  ControllableConsensusPort,
  createControllablePartitionService,
} from './partition-service-test-support.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {transportFactsOf} from '../transport/router-envelope-witness-fixture.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'whid1-node';
const PARTITION_ID = 'whid1-p1';
const REPLICA_ID = 'whid1-p1-r1';

function raftEnvelope() {
  return {protocol: 'raft-rs', groupId: PARTITION_ID, from: '101', to: '202',
    message: {msgType: 3, from: '101', to: '202', term: '1', logTerm: '0',
      index: '0', commit: '0', entries: []}};
}

const outcomeOf = (delivery) => ({deliveryState: transportFactsOf(delivery).deliveryState,
  reasonCode: transportFactsOf(delivery).reasonCode});

async function until(t, condition) {
  for (let poll = 0; poll < 2000 && !condition(); poll += 1) await managedSleep(t, 5);
  if (!condition()) throw new Error('W-HID-1: the retirement window never opened');
}

test('W-HID-1 a retiring partition refuses the Raft envelope it would drop',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
    LoggingService.getInstance().initialize({level: 'fatal'});
    t.teardown(() => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    });
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: NODE_ID});
    await router.initialize({startServer: false});
    t.teardown(() => router.shutdown());
    const port = new ControllableConsensusPort();
    const partition = createControllablePartitionService({
      partitionId: PARTITION_ID, tableId: 'whid1', tableName: 'whid1',
      replicaId: REPLICA_ID, replicaIds: [REPLICA_ID], peerAddresses: [],
      nodeId: NODE_ID, transport: router, dbPath: ':memory:', deferElection: true,
    }, port);
    await partition.initialize();
    const address = partition.unifiedAddress;
    const open = await router.deliver(address, raftEnvelope());
    t.same(outcomeOf(open), {deliveryState: STATE.DELIVERED, reasonCode: null},
      'an open partition takes the envelope');
    t.equal(port.steps.length, 1, 'and steps it once');

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let entered = false;
    partition.resolveHandlerRetirementLane = () => ({
      async retireReplicaHandler(_replicaId, retire) {
        entered = true;
        await gate;
        retire();
      },
    });
    const shutdown = partition.shutdown();
    await until(t, () => entered);
    t.equal(typeof router.getRegisteredHandler(address), 'function',
      'inside the window the handler is still registered');
    const retiring = await router.deliver(address, raftEnvelope());
    t.same(outcomeOf(retiring), {deliveryState: STATE.FAILED,
      reasonCode: REASON.HANDLER_FAILED},
    'the retiring incarnation refuses the envelope: the sender sees FAILED');
    t.equal(port.steps.length, 1, 'no step reached a port inside the window');
    release();
    await shutdown;
    t.equal(router.getRegisteredHandler(address), null,
      'the exact handler is retired once the lane runs');
  });
