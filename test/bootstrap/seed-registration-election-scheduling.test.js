import {test} from '../../src/test-helpers/tap.js';
import {SeedPartitionsPhase} from
  '../../src/bootstrap/phases/seed-partitions-phase.js';
import {SeedRegistrationPhase} from
  '../../src/bootstrap/phases/seed-registration-phase.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const REQUIRED_PARTITION_IDS = Object.freeze([
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.TABLES],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.MESSAGE_GROUPS],
]);
const REQUIRED_REPLICA_COUNT = 3;

function requiredReplicaStartEvents() {
  return REQUIRED_PARTITION_IDS.flatMap((_partitionId, partitionIndex) =>
    Array.from({length: REQUIRED_REPLICA_COUNT}, (_unused, replicaIndex) =>
      `start:required-${partitionIndex + 1}-r${replicaIndex + 1}`));
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  // The frozen predecessor does not yet observe this gate. Keep the red
  // witness focused on the missing scheduling contract instead of reporting
  // an unrelated unhandled-rejection process failure.
  promise.catch(() => {});
  return {promise, resolve, reject};
}

function createReplica(replicaId, partitionId, events) {
  return {
    replicaId,
    partitionId,
    startElection() {
      events.push(`start:${replicaId}`);
    },
  };
}

function createSchedulingFixture(options = {}) {
  const events = [];
  const leadership = createDeferred();
  const messageGroupLeadership = options.messageGroupLeadership || null;
  let shuttingDown = false;
  const replicas = [
    createReplica('ordinary-a-r1', 'ordinary-a', events),
    ...REQUIRED_PARTITION_IDS.flatMap((partitionId, partitionIndex) =>
      Array.from({length: REQUIRED_REPLICA_COUNT}, (_unused, replicaIndex) =>
        createReplica(
          `required-${partitionIndex + 1}-r${replicaIndex + 1}`,
          partitionId,
          events,
        ))),
    createReplica('ordinary-b-r1', 'ordinary-b', events),
  ];
  const messageGroupReplicas = messageGroupLeadership ? [{
    startElection() {
      events.push('start:message-group-r1');
    },
  }] : [];
  const phase = new SeedPartitionsPhase({
    delegates: {
      getLogger: () => ({info() {}, debug() {}}),
      getNodeId: () => 'seed-a',
      getMessageGroupReplicas: () => messageGroupReplicas,
      async waitForMessageGroupLeadership() {
        events.push('wait:message-group');
        return messageGroupLeadership?.promise;
      },
      getPartitionReplicas: () => replicas,
      getPartitionsCreated: () => replicas.length,
      getRegistrationRequiredLeaderPartitionIds: () =>
        [...REQUIRED_PARTITION_IDS],
      async waitForPartitionLeadership(options) {
        const requested = [...options.partitionIds].sort();
        const required = [...REQUIRED_PARTITION_IDS].sort();
        if (requested.join(',') !== required.join(',')) {
          throw new Error('scheduler changed the registration dependency cut');
        }
        events.push('wait:registration-required');
        return leadership.promise;
      },
      isShuttingDown: () => shuttingDown,
    },
  });
  return {
    events,
    leadership,
    messageGroupLeadership,
    phase,
    setShuttingDown(value) {
      shuttingDown = value;
    },
  };
}

test('seed elections start the registration dependency cohort before the remainder',
  async (t) => {
    const fixture = createSchedulingFixture();
    const scheduling = fixture.phase.startDeferredBootstrapReplicaElections();

    await Promise.resolve();
    t.same(fixture.events, [
      ...requiredReplicaStartEvents(),
      'wait:registration-required',
    ], 'unrelated election work stays held while the direct-write cut elects');

    fixture.leadership.resolve();
    await scheduling;
    t.same(fixture.events, [
      ...requiredReplicaStartEvents(),
      'wait:registration-required',
      'start:ordinary-a-r1',
      'start:ordinary-b-r1',
    ], 'each dependency and remaining replica starts once');
  });

test('dependency failure releases the remaining elections before propagating',
  async (t) => {
    const fixture = createSchedulingFixture();
    const expected = new Error('registration dependency did not elect');
    const scheduling = fixture.phase.startDeferredBootstrapReplicaElections();

    await Promise.resolve();
    fixture.leadership.reject(expected);
    await t.rejects(scheduling, expected,
      'the dependency failure remains the bootstrap outcome');
    t.same(fixture.events.slice(-2), [
      'start:ordinary-a-r1',
      'start:ordinary-b-r1',
    ], 'an active bootstrap does not strand the remaining cohort');
  });

test('shutdown during the dependency wait does not restart stopped work',
  async (t) => {
    const fixture = createSchedulingFixture();
    const expected = new Error('bootstrap stopped');
    const scheduling = fixture.phase.startDeferredBootstrapReplicaElections();

    await Promise.resolve();
    fixture.setShuttingDown(true);
    fixture.leadership.reject(expected);
    await t.rejects(scheduling, expected,
      'the interrupted dependency wait stays visible');
    t.equal(fixture.events.some((event) => event.includes('ordinary')), false,
      'shutdown cleanup remains the only owner of the unstarted cohort');
  });

test('shutdown during message-group leadership starts no partition election',
  async (t) => {
    const messageGroupLeadership = createDeferred();
    const fixture = createSchedulingFixture({messageGroupLeadership});
    const scheduling = fixture.phase.startDeferredBootstrapReplicaElections();

    await Promise.resolve();
    t.same(fixture.events, [
      'start:message-group-r1',
      'wait:message-group',
    ], 'partition elections remain behind message-group leadership');
    fixture.setShuttingDown(true);
    messageGroupLeadership.resolve();
    await scheduling;
    t.equal(fixture.events.some((event) => event.startsWith('start:required-') ||
      event.startsWith('start:ordinary-')), false,
    'cleanup remains the only owner after shutdown crosses the held wait');
    t.equal(fixture.events.includes('wait:registration-required'), false,
      'shutdown spends no partition leadership budget');
  });

test('registration owns the exact dependency cut and spends its gate once',
  async (t) => {
    let waitTurns = 0;
    const partitionServices = new Map(REQUIRED_PARTITION_IDS.map(
      (partitionId) => [partitionId, {partitionId, isLeader: false}],
    ));
    const partitionsPhase = new SeedPartitionsPhase({
      delegates: {
        getLogger: () => ({debug() {}}),
        getConfig: () => ({leadershipWaitTimeoutMs: 100,
          leadershipWaitInitialDelayMs: 1}),
        getNodeId: () => 'seed-a',
        getPartitionServices: () => partitionServices,
        async sleep() {
          waitTurns += 1;
          for (const service of partitionServices.values()) {
            service.isLeader = true;
          }
        },
      },
    });
    const phase = new SeedRegistrationPhase({delegates: {
      waitForPartitionLeadership: (options) =>
        partitionsPhase.waitForPartitionLeadership(options),
    }});

    t.same(phase.getRequiredLeaderPartitionIds(), REQUIRED_PARTITION_IDS,
      'the registration owner publishes its four direct-write dependencies');
    await phase.waitForRequiredPartitionLeadership();
    await phase.waitForRequiredPartitionLeadership();
    t.equal(waitTurns, 1,
      'both consumers reuse the partition owner\'s one existing wait budget');
    t.notOk(Object.hasOwn(phase, 'requiredPartitionLeadershipSatisfied'),
      'registration keeps no duplicate satisfaction authority');
  });
