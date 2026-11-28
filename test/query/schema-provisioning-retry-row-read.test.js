// A schema job retry reads its durable row before acting. A recovery-partition
// retry reads it only while this node leads that partition; a node that is not
// the leader leaves the job to discovery, which inventories every new
// leadership tenure. The real owner, repository and discovery; durable
// storage, the leader set and timer delivery are the seams.
import {test} from '../../src/test-helpers/tap.js';
import {canonicalizeSchemaProvisioningIntent} from
  '../../src/query/schema-provisioning-intent.js';
import {SCHEMA_PROVISIONING_REASON} from
  '../../src/query/schema-provisioning-job-constants.js';
import {createGateway, createService, createServeRefreshClock} from
  './schema-provisioning-job-test-support.js';

const LEASE_MS = 2000;
const RETRY_DUE_MS = 5000;

function retryAst() {
  return {
    tableName: 'retry_row_reads',
    columns: [{name: 'k', dataType: {name: 'TEXT'}, primaryKey: true}],
    primaryKey: ['k'],
    ifNotExists: false,
  };
}

async function settle() {
  for (let turn = 0; turn < 20; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function createRetryWorld(t) {
  const gateway = createGateway();
  const clock = createServeRefreshClock();
  const service = createService(gateway, [], {
    now: () => clock.now,
    schemaProvisioningLeaseMs: LEASE_MS,
    schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
    schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout,
  });
  t.teardown(() => service.shutdown());
  const owner = service.schemaProvisioningJobOwner;
  const leader = owner.recoveryLeaders()[0];
  const leadership = {leading: true};
  owner.recoveryLeaders = () => (leadership.leading ? [leader] : []);
  const intent = canonicalizeSchemaProvisioningIntent(retryAst());
  await owner.insertOrAttach(intent);
  const runs = [];
  owner.runJob = async (runIntent) => {
    runs.push(runIntent.workflowId);
    return {};
  };
  const removeDurableRow = () => {
    for (const key of [...gateway.rows.keys()]) {
      if (key.startsWith('schema_operations:')) gateway.rows.delete(key);
    }
  };
  return {service, owner, clock, leader, leadership, intent, runs, removeDurableRow,
    recoveryIntent: {...intent, recoveryPartitionId: leader.partitionId}};
}

const executor = async () => ({});
const isRetryArmed = (owner, intent) => owner.retryTimersByWorkflowId.has(intent.workflowId);

async function fireRetry(world, intent) {
  world.owner.scheduleRetry(intent, executor);
  await world.clock.advance(RETRY_DUE_MS);
  await settle();
}

test('a recovery retry that finds its row on the leader runs the job', async (t) => {
  const world = await createRetryWorld(t);
  await fireRetry(world, world.recoveryIntent);
  t.same(world.runs, [world.intent.workflowId]);
  t.equal(isRetryArmed(world.owner, world.intent), false);
});

test('a recovery retry whose row is absent on the leader retries again', async (t) => {
  const world = await createRetryWorld(t);
  world.removeDurableRow();
  await fireRetry(world, world.recoveryIntent);
  t.same(world.runs, []);
  t.equal(isRetryArmed(world.owner, world.intent), true);
});

test('a retry without a recovery partition whose row is absent retries again', async (t) => {
  const world = await createRetryWorld(t);
  world.removeDurableRow();
  await fireRetry(world, world.intent);
  t.same(world.runs, []);
  t.equal(isRetryArmed(world.owner, world.intent), true);
});

test('a recovery retry on a node that is not the leader leaves the job', async (t) => {
  const world = await createRetryWorld(t);
  world.leadership.leading = false;
  await fireRetry(world, world.recoveryIntent);
  t.same(world.runs, []);
  t.equal(isRetryArmed(world.owner, world.intent), false);
});

test('an absent row read while leading retries once more; the next read off the lead ends it',
  async (t) => {
    const world = await createRetryWorld(t);
    world.removeDurableRow();
    await fireRetry(world, world.recoveryIntent);
    t.equal(isRetryArmed(world.owner, world.intent), true, 'absent while leading: one more retry');
    world.leadership.leading = false;
    await world.clock.advance(RETRY_DUE_MS);
    await settle();
    t.same(world.runs, []);
    t.equal(isRetryArmed(world.owner, world.intent), false, 'not the leader at the next read');
  });

test('a contended job reconciles by the state of its row read', async (t) => {
  const found = await createRetryWorld(t);
  const foundOutcome = await found.owner.reconcileContendedJob(found.recoveryIntent, executor);
  t.ok(foundOutcome.reasonCodes.includes(SCHEMA_PROVISIONING_REASON.ACTIVE_OWNER));
  t.equal(isRetryArmed(found.owner, found.intent), true);

  const absent = await createRetryWorld(t);
  absent.removeDurableRow();
  const absentOutcome = await absent.owner.reconcileContendedJob(absent.recoveryIntent, executor);
  t.notOk(absentOutcome.reasonCodes.includes(SCHEMA_PROVISIONING_REASON.ACTIVE_OWNER));
  t.equal(isRetryArmed(absent.owner, absent.intent), true);

  const follower = await createRetryWorld(t);
  follower.leadership.leading = false;
  const followerOutcome = await follower.owner.reconcileContendedJob(
    follower.recoveryIntent, executor);
  t.notOk(followerOutcome.reasonCodes.includes(SCHEMA_PROVISIONING_REASON.ACTIVE_OWNER));
  t.equal(isRetryArmed(follower.owner, follower.intent), false);
});

test('a node that becomes the leader after its retry left the job resumes it by discovery',
  async (t) => {
    const world = await createRetryWorld(t);
    world.leadership.leading = false;
    await world.service.resumeDurableProvisioningJobs();
    await settle();
    await fireRetry(world, world.recoveryIntent);
    t.same(world.runs, [], 'the retry on a follower leaves the job');
    t.equal(isRetryArmed(world.owner, world.intent), false);

    world.leader.leadershipTenure = {};
    world.leadership.leading = true;
    await world.clock.advance(LEASE_MS);
    await settle();
    t.same(world.runs, [world.intent.workflowId],
      'the next discovery inventories the new tenure and resumes the job');
  });
