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

function createSchedulingFixture() {
  const events = [];
  const leadership = createDeferred();
  let shuttingDown = false;
  const replicas = [
    createReplica('ordinary-a-r1', 'ordinary-a', events),
    ...REQUIRED_PARTITION_IDS.map((partitionId, index) =>
      createReplica(`required-${index + 1}-r1`, partitionId, events)),
    createReplica('ordinary-b-r1', 'ordinary-b', events),
  ];
  const phase = new SeedPartitionsPhase({
    delegates: {
      getLogger: () => ({info() {}, debug() {}}),
      getNodeId: () => 'seed-a',
      getMessageGroupReplicas: () => [],
      getPartitionReplicas: () => replicas,
      getPartitionsCreated: () => replicas.length,
      getRegistrationRequiredLeaderPartitionIds: () =>
        [...REQUIRED_PARTITION_IDS],
      async waitForRegistrationRequiredPartitionLeadership() {
        events.push('wait:registration-required');
        return leadership.promise;
      },
      isShuttingDown: () => shuttingDown,
    },
  });
  return {
    events,
    leadership,
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
      'start:required-1-r1',
      'start:required-2-r1',
      'start:required-3-r1',
      'start:required-4-r1',
      'wait:registration-required',
    ], 'unrelated election work stays held while the direct-write cut elects');

    fixture.leadership.resolve();
    await scheduling;
    t.same(fixture.events, [
      'start:required-1-r1',
      'start:required-2-r1',
      'start:required-3-r1',
      'start:required-4-r1',
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

test('registration owns the exact dependency cut and spends its gate once',
  async (t) => {
    const waits = [];
    const phase = new SeedRegistrationPhase({
      delegates: {
        async waitForPartitionLeadership(options) {
          waits.push([...options.partitionIds]);
        },
      },
    });

    t.same(phase.getRequiredLeaderPartitionIds(), REQUIRED_PARTITION_IDS,
      'the registration owner publishes its four direct-write dependencies');
    await phase.waitForRequiredPartitionLeadership();
    await phase.waitForRequiredPartitionLeadership();
    t.same(waits, [REQUIRED_PARTITION_IDS],
      'partitions and registration transfer one existing wait budget');
  });
