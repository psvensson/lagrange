// Durable schema-job recovery discovery: paged recovery scans of the leading
// shard, retained discovery while storage is unavailable, lease takeover of a
// stale executing CREATE, and shutdown during a scan.
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {
  createAst, createGateway, createService, createServeRefreshClock,
} from './schema-provisioning-job-test-support.js';
import {test} from '../../src/test-helpers/tap.js';
import {OWNER_CONTRACT_STATE} from
  '../../src/control-plane/owner-contract-outcome.js';
import {SCHEMA_PROVISIONING_ERROR_CODE} from
  '../../src/query/schema-provisioning-job-constants.js';
import {canonicalizeSchemaProvisioningIntent} from
  '../../src/query/schema-provisioning-intent.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {TABLES} from '../../src/constants/index.js';

test('unavailable leader pages retain discovery until storage returns', async (t) => {
  const gateway = createGateway();
  const clock = createServeRefreshClock();
  const calls = [];
  const service = createService(gateway, calls, {
    schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
    schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout,
  });
  t.teardown(() => service.shutdown());
  const owner = service.schemaProvisioningJobOwner;
  await owner.insertOrAttach(canonicalizeSchemaProvisioningIntent(createAst()));
  const read = gateway.readRows.bind(gateway);
  let available = false;
  gateway.readRows = (...args) => available ? read(...args) : {rows: null};
  await t.rejects(service.resumeDurableProvisioningJobs(),
    {code: SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE});
  t.equal(calls.length, 0);
  available = true;
  await clock.advance(owner.retryAfterMs);
  t.equal(calls.length, 1);
  await service.shutdown();
  t.equal(clock.timers.filter((timer) => !timer.cleared).length, 0);
});

test('a stale executing CREATE takes over only after the durable winner lease expires', async (t) => {
  const gateway = createGateway();
  const timers = [];
  let now = 100;
  const started = Promise.withResolvers();
  const blocked = Promise.withResolvers();
  const winnerStarted = Promise.withResolvers();
  const winnerBlocked = Promise.withResolvers();
  const ready = {resolvedReplicaCount: 3, routableReplicaCount: 3, committedReplicaCount: 3,
    fullReplicaCountConverged: true, contractState: 'ready', nextAction: 'proceed'};
  let attempts = 0;
  const first = createService(gateway, [], {
    now: () => now, schemaProvisioningLeaseMs: 4000,
    schemaProvisioningRetrySetTimeoutFn(callback, delay) {
      const timer = {callback, delay};
      timers.push(timer);
      return timer;
    },
    schemaProvisioningRetryClearTimeoutFn() {},
    async partitionProvisioner() {
      if (++attempts === 1) {
        started.resolve();
        await blocked.promise;
      }
      return ready;
    },
  });
  const winner = createService(gateway, [], {
    now: () => now, schemaProvisioningOwnerId: 'departed-winner',
    schemaProvisioningLeaseMs: 4000,
    async partitionProvisioner() {
      winnerStarted.resolve();
      await winnerBlocked.promise;
      return ready;
    },
  });
  t.teardown(() => first.shutdown());
  t.teardown(() => winner.shutdown());
  const firstResult = first.createTable(createAst());
  await started.promise;
  now += 4001;
  const winnerResult = winner.createTable(createAst());
  await winnerStarted.promise;
  await winner.shutdown();
  blocked.resolve();
  const stale = await firstResult;
  const key = 'schema_operations:' + stale.jobId;
  const winning = gateway.rows.get(key);
  t.equal(winning.workflow_owner_id, 'departed-winner');
  t.equal(stale.contractState, OWNER_CONTRACT_STATE.PENDING);
  t.equal(timers.length, 1);
  t.equal(timers[0].delay, winning.workflow_lease_expires_at - now);
  now = winning.workflow_lease_expires_at;
  timers[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  const completed = gateway.rows.get(key);
  t.equal(completed.status, 'SUCCEEDED');
  t.equal(completed.workflow_fence_token, winning.workflow_fence_token + 1);
  t.equal(attempts, 2);
  winnerBlocked.resolve();
  await winnerResult;
  t.equal(gateway.rows.get(key).row_version, completed.row_version);
});

test('index continuation refuses malformed local leader evidence despite a retained intent', async (t) => {
  const service = createService(createGateway(), []);
  t.teardown(() => service.shutdown());
  const owner = service.schemaProvisioningJobOwner;
  await owner.insertOrAttach(canonicalizeSchemaProvisioningIntent(createAst()));
  owner.recoveryLeaders()[0].executeLocalQuery = async () => ({rows: []});
  const unavailable = {code: SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE};
  await t.rejects(owner.findSucceededGlobalIndexIntent('users', 1), unavailable);
});

for (const interruption of ['lost reply', 'expired lease', 'transient refusal']) {
  test(`discovered DDL reconciles the first claim after ${interruption}`, async (t) => {
    const gateway = createGateway();
    const clock = createServeRefreshClock();
    const provisioned = [];
    const service = createService(gateway, provisioned, {
      now: () => clock.now,
      schemaProvisioningLeaseMs: 4000,
      schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
      schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout,
    });
    t.teardown(() => service.shutdown());
    const intent = canonicalizeSchemaProvisioningIntent(createAst());
    await service.schemaProvisioningJobOwner.insertOrAttach(intent);

    const submit = gateway.submitMutation.bind(gateway);
    const read = gateway.readRows.bind(gateway);
    let interrupted = false;
    const reconciledFences = [];
    gateway.readRows = async (table, sql, params, options) => {
      const result = await read(table, sql, params, options);
      if (interrupted && table === TABLES.SCHEMA_OPERATIONS &&
          params[0] === intent.tableIdentityKey) {
        reconciledFences.push(result.rows[0].workflow_fence_token);
      }
      return result;
    };
    gateway.submitMutation = async (mutation, options) => {
      if (interrupted || mutation.tableName !== TABLES.SCHEMA_OPERATIONS) {
        return submit(mutation, options);
      }
      interrupted = true;
      if (interruption === 'transient refusal') {
        throw Object.assign(new Error('claim timed out'), {code: QUERY_ERROR_CODE.TIMEOUT});
      }
      const answer = await submit(mutation, options);
      if (interruption === 'lost reply') {
        throw Object.assign(new Error('claim reply unavailable'), {
          failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
        });
      }
      clock.now = mutation.data.workflow_lease_expires_at + 1;
      return answer;
    };

    const [pending] = await service.resumeDurableProvisioningJobs();
    const key = 'schema_operations:' + intent.jobId;
    const observed = gateway.rows.get(key);
    const expectedFence = interruption === 'transient refusal' ? 0 : 1;
    t.equal(pending.contractState, OWNER_CONTRACT_STATE.PENDING);
    t.same(reconciledFences, [expectedFence], 'rereads the committed claim after discovery');
    t.equal(observed.status, 'PENDING');
    t.equal(provisioned.length, 0);
    const owner = service.schemaProvisioningJobOwner;
    const retry = owner.retryTimersByWorkflowId.get(intent.workflowId).timerId;
    t.equal(owner.discoveryRetries.size, 1, 'one lease-period inventory wake');
    t.equal(clock.timers.filter((timer) => !timer.cleared).length, 2, 'inventory and per-job wake');
    await clock.advance(retry.at - clock.now);
    const completed = gateway.rows.get(key);
    t.equal(completed.status, 'SUCCEEDED');
    t.equal(completed.workflow_fence_token, expectedFence + 1);
    t.equal(provisioned.length, 1, 'retry completes without another CREATE or activation');
    t.equal(service.schemaProvisioningJobOwner.retryTimersByWorkflowId.size, 0);
  });
}

test('a committed claim rejection is propagated without scheduling takeover', async (t) => {
  const gateway = createGateway();
  const provisioned = [];
  const service = createService(gateway, provisioned);
  t.teardown(() => service.shutdown());
  const owner = service.schemaProvisioningJobOwner;
  const intent = canonicalizeSchemaProvisioningIntent(createAst());
  await owner.insertOrAttach(intent);
  const rejection = Object.assign(new Error('Message timeout in rejected statement'), {
    committed: true, outcome: 'statement_failed', failureCode: 'constraint_violation',
  });
  gateway.submitMutation = async () => {
    throw rejection;
  };
  await t.rejects(service.resumeDurableProvisioningJobs(), rejection);

  const second = createService(gateway, provisioned);
  t.teardown(() => second.shutdown());
  gateway.submitMutation = async () => ({
    success: false, error: rejection.message, committed: true, outcome: rejection.outcome,
    failureCode: rejection.failureCode,
  });
  await t.rejects(second.resumeDurableProvisioningJobs(), {
    message: rejection.message, committed: true, failureCode: rejection.failureCode,
  });
  t.equal(owner.retryTimersByWorkflowId.size, 0);
  t.same([...owner.discoveryRetries.keys()], [owner.readNonterminalRows],
    'only the regular inventory wake is armed');
  t.equal(provisioned.length, 0);
  t.equal(gateway.rows.get('schema_operations:' + intent.jobId).workflow_fence_token, 0);
});

test('READY owner discovers a CREATE accepted during its empty scan and waits for the remote lease', async (t) => {
  const gateway = createGateway();
  const clock = createServeRefreshClock();
  const timing = {
    now: () => clock.now, schemaProvisioningLeaseMs: 4000,
    schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
    schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout,
  };
  const calls = [];
  const survivor = createService(gateway, calls, {...timing, schemaProvisioningOwnerId: 'survivor',
    schemaProvisioningLeaseMs: 2000});
  const stalled = Promise.withResolvers();
  const entered = Promise.withResolvers();
  const original = createService(gateway, [], {...timing, schemaProvisioningOwnerId: 'original',
    async partitionProvisioner() {
      entered.resolve();
      await stalled.promise;
      return {resolvedReplicaCount: 3, routableReplicaCount: 3, committedReplicaCount: 3,
        fullReplicaCountConverged: true, contractState: 'ready', nextAction: 'proceed'};
    }});
  t.teardown(() => original.shutdown());
  t.teardown(() => survivor.shutdown());
  const read = gateway.readRows.bind(gateway);
  const snapshot = Promise.withResolvers();
  const deliver = Promise.withResolvers();
  let scans = 0;
  gateway.readRows = async (table, sql, params, options) => {
    const result = await read(table, sql, params, options);
    if (table === TABLES.SCHEMA_OPERATIONS && sql.includes('AS recovery_rowid') && params[0] === 'RUNNING' && ++scans === 1) {
      snapshot.resolve();
      await deliver.promise;
    }
    return result;
  };
  const activation = survivor.resumeDurableProvisioningJobs();
  await snapshot.promise;
  const duplicate = survivor.resumeDurableProvisioningJobs();
  const submitting = original.createTable(createAst());
  await entered.promise;
  const intent = canonicalizeSchemaProvisioningIntent(createAst());
  const key = 'schema_operations:' + intent.jobId;
  const held = {...gateway.rows.get(key)};
  deliver.resolve();
  await Promise.all([activation, duplicate]);
  t.equal(scans, 1, 'overlapping activations share the same empty snapshot');
  const wake = survivor.schemaProvisioningJobOwner.discoveryRetries.get(
    survivor.schemaProvisioningJobOwner.readNonterminalRows);
  await survivor.resumeDurableProvisioningJobs();
  t.equal(scans, 1, 'reactivation while armed waits for the same lease-period boundary');
  t.same(clock.timers.filter((timer) => !timer.cleared), [wake], 'one unchanged inventory wake');
  await clock.advance(2000);
  t.equal(scans, 2, 'same READY observer discovers the later accepted job');
  t.equal(survivor.schemaProvisioningJobOwner.retryTimersByWorkflowId.size, 1);
  await clock.advance(held.workflow_lease_expires_at - clock.now - 1);
  t.equal(calls.length, 0);
  await clock.advance(1);
  const completed = gateway.rows.get(key);
  t.equal(completed.status, 'SUCCEEDED');
  t.equal(calls.length, 1, 'discovery and lease timer coalesce to one execution');
  t.equal(completed.table_id, held.table_id);
  t.equal(completed.workflow_fence_token, held.workflow_fence_token + 1);
  stalled.resolve();
  await submitting;
});

test('shutdown during an authoritative recovery scan disarms later execution and discovery', async (t) => {
  const gateway = createGateway();
  const calls = [];
  const clock = createServeRefreshClock();
  const service = createService(gateway, calls, {
    now: () => clock.now, schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
    schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout,
  });
  const owner = service.schemaProvisioningJobOwner;
  await owner.insertOrAttach(canonicalizeSchemaProvisioningIntent(createAst()));
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const read = gateway.readRows.bind(gateway);
  gateway.readRows = async (table, sql, params, options) => {
    const result = await read(table, sql, params, options);
    if (table === TABLES.SCHEMA_OPERATIONS && sql.includes('AS recovery_rowid')) {
      entered.resolve();
      await release.promise;
    }
    return result;
  };
  const activation = service.resumeDurableProvisioningJobs();
  await entered.promise;
  await service.shutdown();
  release.resolve();
  await activation;
  t.equal(clock.timers.length, 0);
  t.equal(calls.length, 0);
});

test('one lease scan continues discovering independent work while a recovered job is running', async (t) => {
  const gateway = createGateway();
  const clock = createServeRefreshClock();
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  const attempts = [];
  const service = createService(gateway, [], {
    now: () => clock.now, schemaProvisioningLeaseMs: 2000,
    schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
    schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout,
    async partitionProvisioner(context) {
      attempts.push(context.tableName);
      if (context.tableName === 'users') {
        started.resolve();
        await release.promise;
      }
      return {resolvedReplicaCount: 3, routableReplicaCount: 3, committedReplicaCount: 3,
        fullReplicaCountConverged: true, contractState: 'ready', nextAction: 'proceed'};
    },
  });
  t.teardown(() => service.shutdown());
  const owner = service.schemaProvisioningJobOwner;
  await owner.insertOrAttach(canonicalizeSchemaProvisioningIntent(createAst()));
  const first = service.resumeDurableProvisioningJobs();
  await started.promise;
  const duplicate = service.resumeDurableProvisioningJobs();
  const other = canonicalizeSchemaProvisioningIntent({...createAst(), tableName: 'orders'});
  await owner.insertOrAttach(other);
  await clock.advance(2000);
  t.same(attempts, ['users', 'orders']);
  t.equal(gateway.rows.get('schema_operations:' + other.jobId).status, 'SUCCEEDED');
  t.equal(clock.timers.filter((timer) => !timer.cleared).length, 1);
  release.resolve();
  const [outcomes, shared] = await Promise.all([first, duplicate]);
  t.same(shared, outcomes);
  await clock.advance(2000);
  t.same(attempts, ['users', 'orders']);
  await service.shutdown();
  t.equal(clock.timers.filter((timer) => !timer.cleared).length, 0);
});

test('idle READY nodes only read indexed pages on the leading shard and a new tenure', async (t) => {
  const gateway = createGateway();
  const clock = createServeRefreshClock();
  const timing = {schemaProvisioningLeaseMs: 2000,
    schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
    schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout};
  const services = Array.from({length: 3}, () => createService(gateway, [], timing));
  t.teardown(() => Promise.all(services.map((service) => service.shutdown())));
  const owners = services.map((service) => service.schemaProvisioningJobOwner);
  const leaders = owners.map((owner) => owner.recoveryLeaders()[0]);
  let elected = 0;
  const counts = [0, 0, 0];
  for (const [i, owner] of owners.entries()) {
    owner.recoveryLeaders = () => elected === i ? [leaders[i]] : [];
    const read = leaders[i].executeLocalQuery.bind(leaders[i]);
    leaders[i].executeLocalQuery = (...args) => {
      counts[i]++; return read(...args);
    };
  }
  await Promise.all(services.map((service) => service.resumeDurableProvisioningJobs()));
  await clock.advance(2000);
  await clock.advance(2000);
  t.same(counts, [2, 0, 0], 'two empty status pages, then zero reads');
  elected = 2;
  await clock.advance(2000);
  t.same(counts, [2, 0, 2], 'a leader change inventories despite equal counters');
});
