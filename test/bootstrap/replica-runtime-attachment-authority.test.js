import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from
  '../../src/bootstrap/node-joining-service.js';
import {initializeTestEnvironment} from
  './node-joining-service-test-support.js';

function quietLogger() {
  return {
    debug() {},
    error() {},
    info() {},
    warn() {},
  };
}

test('join runtime attachment publishes neither local ACTIVE nor an ' +
  'unversioned lifecycle snapshot', (t) => {
  initializeTestEnvironment();
  const service = new NodeJoiningService({
    nodeId: 'joining-node-a',
    nodeAddress: 'ws://localhost:19101',
    seedNodeAddress: 'http://localhost:18101',
  });
  const localReplicas = [];
  let snapshotCount = 0;
  service.replicaHandler = {
    localServices: new Map(),
    setLocalReplica(replicaId, replica) {
      localReplicas.push({replicaId, replica});
    },
    replicaStateMachine: {
      registerReplicaSnapshot() {
        snapshotCount += 1;
      },
    },
  };
  const partition = {partitionId: 'p1'};

  service.trackJoinPartitionReplica('p1-r1', 'p1', partition);

  t.equal(service.replicaHandler.localServices.get('p1-r1'), partition,
    'join attaches the initialized runtime handler');
  t.equal(localReplicas.length, 1);
  t.notOk(Object.prototype.hasOwnProperty.call(
    localReplicas[0].replica,
    'status',
  ), 'runtime attachment does not publish local ACTIVE lifecycle state');
  t.equal(snapshotCount, 0,
    'later exact registered activation remains the only lifecycle owner');
  t.end();
});

test('seed handler attachment asserts the exact installed ACTIVE generation ' +
  'without publishing a second snapshot', async (t) => {
  initializeTestEnvironment();
  const service = new BootstrapService({
    nodeId: 'seed-node-a',
    nodeAddress: 'ws://localhost:19102',
    wsPort: 19102,
    config: {partitionDbPath: ':memory:'},
  });
  t.teardown(() => service.shutdown());
  service.logger = quietLogger();
  const partition = {partitionId: 'p1'};
  const partitions = new Map([['p1-r1', partition]]);
  let snapshotCount = 0;
  let transitionCount = 0;
  const stateMachine = {
    getState(replicaId) {
      return {
        replicaId,
        partitionId: 'p1',
        nodeId: 'seed-node-a',
        state: 'active',
        serviceId: replicaId,
        durableVersionColumn: 'state_entered_at',
        durableVersion: 101,
      };
    },
    getStateCounts() {
      return {active: 1};
    },
    registerReplicaSnapshot() {
      snapshotCount += 1;
      return true;
    },
    transition() {
      transitionCount += 1;
      return true;
    },
  };

  const summary = service.registerReplicasWithStateMachine(
    stateMachine,
    partitions,
  );

  t.equal(summary.registeredCount, 1);
  t.equal(summary.expectedPersistCount, 0);
  t.equal(snapshotCount, 0,
    'seed STOPPED to ACTIVE activation is not repeated during attachment');
  t.equal(transitionCount, 0,
    'ordinary lifecycle transitions are not reused by seed attachment');
});
