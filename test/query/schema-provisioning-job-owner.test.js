import {
  createGateway, createService, createSchemaWireClient, createServeRefreshFixture,
  serveRefreshPublication,
} from './schema-provisioning-job-test-support.js';
import {test} from '../../src/test-helpers/tap.js';
import {TableCreationService} from '../../src/query/table-creation-service.js';
import {OWNER_CONTRACT_STATE} from
  '../../src/control-plane/owner-contract-outcome.js';
import {SCHEMA_PROVISIONING_ERROR_CODE} from
  '../../src/query/schema-provisioning-job-constants.js';
import {canonicalizeSchemaProvisioningIntent} from
  '../../src/query/schema-provisioning-intent.js';
import {createTimeoutBudget} from
  '../../src/control-plane/timeout-budget.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schema-shared-constants.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {PG_BACKEND_MSG, PG_ERROR_CODE} from
  '../../src/runtime/pgwire-protocol-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {SCHEMA_PROVISIONING_DEFAULT} from
  '../../src/query/schema-provisioning-job-constants.js';

function createAst(extraColumn = null) {
  return {
    tableName: 'users',
    columns: [
      {name: 'id', dataType: {name: 'TEXT'}, primaryKey: true},
      ...(extraColumn ? [extraColumn] : []),
    ],
    primaryKey: ['id'],
    ifNotExists: false,
  };
}

function createNotNullDefaultAst() {
  return createAst({
    name: 'source_snapshot_json',
    dataType: {name: 'TEXT'},
    notNull: true,
    defaultValue: {type: 'literal', value: '{}', sqlType: 'TEXT'},
  });
}

test('provisioning target selection projects one committed serve answer',
  async (t) => {
    const gateway = createGateway();
    const first = createServeRefreshFixture(t, gateway);
    first.state.nodes[2].ready_lease_expires_at = 900;
    await first.readiness.readServeEligibility();
    const earlier = first.readiness.answerServeCohort();

    const second = createServeRefreshFixture(t, gateway);
    second.state.nodes[1].ready_lease_expires_at = 900;
    second.state.nodes[2].ready_lease_expires_at = 900;
    second.state.publications = [serveRefreshPublication(4)];
    await second.readiness.readServeEligibility();
    const later = second.readiness.answerServeCohort();
    t.same(earlier.eligibleNodeIds, ['serve-a', 'serve-b']);
    t.same(later.eligibleNodeIds, ['serve-a']);

    let answers = 0;
    first.readiness.answerServeCohort = () => ++answers === 1 ? earlier : later;
    const result = await first.engine.waitForProvisionTargetNodeIds({
      partitionId: 'adjacent-cohorts', requiredReplicaCount: 3,
      failOnTimeout: false,
    });
    t.equal(answers, 1, 'synchronous selection reads the owner once');
    t.same(result.epoch, earlier.epoch, 'target IDs and epoch describe one answer');
    t.same(result.nodeIds, earlier.eligibleNodeIds);
    t.equal(result.contractState, OWNER_CONTRACT_STATE.UNDER_REPLICATED);
  });

test('public CREATE reports a real missing quorum without inventing a reason',
  async (t) => {
    const gateway = createGateway();
    const {clock, cache, state, readiness, engine} =
      createServeRefreshFixture(t, gateway);
    state.nodes = state.nodes.slice(0, 1);
    state.publications = [serveRefreshPublication(3, ['serve-a'])];
    await readiness.readServeEligibility();
    const observed = readiness.answerServeCohort();
    t.same(observed.eligibleNodeIds, ['serve-a']);
    t.same(observed.answers['serve-a'].reasons, []);

    const {answer, attempts} = await queryInitialPartition(t, gateway, {
      clock, cache, engine,
    });
    assertQuorumRefusal(t, answer, answer.outcome.detail);
    t.equal(attempts.length, 0, 'one target cannot reach founding');
    t.same(answer.outcome.reasons, [], 'the owner supplied no denial reason');
    t.same(answer.outcome.reasonCodes, []);
    t.same(answer.outcome.detail.epoch, observed.epoch);
    t.same(answer.outcome.detail.nodeReasons, {});
    t.same(answer.outcome.detail.candidateTargetNodeIds, ['serve-a']);
    t.equal(answer.outcome.detail.requiredReplicaCount, 3);
    t.equal(answer.outcome.detail.quorumReplicaCount, 2);
    t.equal(answer.outcome.detail.jobId, answer.outcome.jobId);
    t.match(answer.outcome.detail.partitionId, /-p1$/);
  });

test('public CREATE rechecks serve freshness after admission prechecks',
  async (t) => {
    const gateway = createGateway();
    const {clock, cache, state, readiness, engine} =
      createServeRefreshFixture(t, gateway);
    state.nodes[1].ready_lease_expires_at = 1100;
    state.nodes[2].ready_lease_expires_at = 1100;
    await readiness.readServeEligibility();
    t.same(readiness.answerServeCohort().eligibleNodeIds,
      ['serve-a', 'serve-b', 'serve-c']);

    const prechecked = [];
    const {answer, attempts} = await queryInitialPartition(t, gateway, {
      clock, cache, engine,
      async checkProvisioningAdmission({nodeId}) {
        prechecked.push(nodeId);
        clock.now = 1200;
        return {allowed: true};
      },
    });
    t.ok(prechecked.length > 0, 'the initial cohort reaches awaited admission');
    t.equal(attempts.length, 0, 'stale approvals cannot reach founding');
    if (answer.outcome.detail) {
      assertQuorumRefusal(t, answer, answer.outcome.detail);
      t.same(answer.outcome.detail.reasons, ['unavailable_stale']);
      t.same(answer.outcome.reasonCodes, answer.outcome.detail.reasons);
      t.same(answer.outcome.detail.nodeReasons['serve-b'], ['unavailable_stale']);
      t.same(answer.outcome.detail.nodeReasons['serve-c'], ['unavailable_stale']);
      t.same(answer.outcome.detail.candidateTargetNodeIds, ['serve-a']);
      t.equal(answer.outcome.detail.quorumReplicaCount, 2);
      t.equal(answer.outcome.detail.jobId, answer.outcome.jobId);
    } else {
      t.fail('the refusal carries the latest committed serve observation');
    }
  });

test('an admission precheck can reuse a healthy majority at a newer epoch',
  async (t) => {
    const gateway = createGateway();
    const {state, readiness, engine} = createServeRefreshFixture(t, gateway);
    state.nodes[2].ready_lease_expires_at = 900;
    await readiness.readServeEligibility();
    const checked = [];
    engine.rebalanceCoordinator = {
      async checkProvisioningAdmission({nodeId}) {
        checked.push(nodeId);
        if (checked.length === 1) {
          state.publications = [serveRefreshPublication(4)];
          await readiness.readServeEligibility();
        }
        return {allowed: true};
      },
    };
    const result = await engine.waitForProvisionTargetNodeIds({
      partitionId: 'healthy-majority', requiredReplicaCount: 3,
    });
    t.equal(result.contractState, OWNER_CONTRACT_STATE.UNDER_REPLICATED);
    t.same(result.nodeIds, ['serve-a', 'serve-b']);
    t.same(checked, result.nodeIds, 'a newer epoch does not repeat admission');
    t.equal(result.epoch?.publicationEpoch, 4, 'success uses the checked fresh cohort');
  });

async function queryInitialPartition(t, gateway, fixture) {
  const {clock, cache, engine, checkProvisioningAdmission} = fixture;
  const attempts = [];
  engine.rebalanceCoordinator = {
    checkProvisioningAdmission,
    async createOperation(operation) {
      attempts.push(operation);
      throw new Error('unexpected CREATE operation for an unavailable cohort');
    },
    async executeOperation() {
      throw new Error('unexpected replica dispatch for an unavailable cohort');
    },
  };
  const service = createService(gateway, [], {
    systemCache: cache, now: () => clock.now,
    schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
    schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout,
    partitionProvisioner: (context) => engine.provisionInitialTablePartition(context),
  });
  const query = createSchemaWireClient(t, service, gateway, engine);
  return {answer: await query(), attempts};
}

for (const {replicaCount, members, targetNodeIds, expected} of [
  {replicaCount: 3, members: ['serve-e', 'serve-b', 'serve-a', 'serve-d', 'serve-c'],
    expected: ['serve-a', 'serve-b', 'serve-c']},
  {members: ['serve-c', 'serve-a', 'serve-b'], expected: ['serve-a']},
  {replicaCount: 3, members: ['serve-c', 'serve-a', 'serve-b'],
    targetNodeIds: ['serve-c', 'serve-a'], expected: ['serve-c', 'serve-a']},
  {replicaCount: 2, members: ['serve-a', 'serve-b', 'serve-c'],
    targetNodeIds: ['serve-c', 'serve-a', 'serve-b'], expected: ['serve-c', 'serve-a']},
]) {
  test(`founding uses the ordered requested width (RF ${replicaCount ?? 1}, ` +
    `explicit: ${Boolean(targetNodeIds)})`, async (t) => {
    const fixture = createServeRefreshFixture(t, createGateway());
    const {state, readiness, engine} = fixture;
    state.nodes = members.map((nodeId) => ({
      ...state.nodes[0], node_id: nodeId,
    }));
    state.publications = [serveRefreshPublication(3, members)];
    await readiness.readServeEligibility();
    t.equal(readiness.answerServeCohort().eligibleNodeIds.length, members.length);

    const native = captureFoundingAdmission(engine);
    await t.rejects(engine.provisionInitialTablePartition({
      partitionId: 'width-probe-p1', replicaCount, targetNodeIds,
      assertProvisioningOwnership: async () => native.events.push('ownership'),
    }), {message: 'the founding admission reached the native boundary'});

    t.same(native.checked, expected, 'admission reaches only the required healthy targets');
    t.same(native.proposals[0]?.moves.map(({targetNodeId}) => targetNodeId), expected);
    t.same(native.events, [...expected, 'ownership', 'found'],
      'the job fence is checked after admission and before FOUND');
    t.equal(native.proposals.length, 1);
  });
}

test('founding checks the next eligible target after a pre-effect refusal',
  async (t) => {
    const {state, readiness, engine} = createServeRefreshFixture(t, createGateway());
    const members = ['serve-a', 'serve-b', 'serve-c', 'serve-d'];
    state.nodes.push({...state.nodes[0], node_id: 'serve-d'});
    state.publications = [serveRefreshPublication(3, members)];
    await readiness.readServeEligibility();
    const native = captureFoundingAdmission(engine, (nodeId) => ({
      allowed: nodeId !== 'serve-a',
    }));
    await t.rejects(engine.provisionInitialTablePartition({
      partitionId: 'alternate-probe-p1', replicaCount: 3,
    }), {message: 'the founding admission reached the native boundary'});
    t.same(native.checked, members);
    t.same(native.proposals[0]?.moves.map(({targetNodeId}) => targetNodeId),
      ['serve-b', 'serve-c', 'serve-d']);
    t.equal(native.proposals.length, 1, 'an unknown native reply never selects a second set');
  });

test('founding rechecks the cohort after the schema ownership fence',
  async (t) => {
    const {state, clock, readiness, engine} =
      createServeRefreshFixture(t, createGateway());
    state.nodes[2].ready_lease_expires_at = 1100;
    await readiness.readServeEligibility();
    const native = captureFoundingAdmission(engine);
    await t.rejects(engine.provisionInitialTablePartition({
      partitionId: 'ownership-probe-p1', replicaCount: 3,
      async assertProvisioningOwnership() {
        native.events.push('ownership');
        clock.now = 1200;
      },
    }), {message: 'the founding admission reached the native boundary'});
    t.same(native.events, ['serve-a', 'serve-b', 'serve-c', 'ownership', 'found']);
    t.same(native.proposals[0]?.moves.map(({targetNodeId}) => targetNodeId),
      ['serve-a', 'serve-b'], 'founding retains only the still-affirmed majority');
  });

test('admission outlasting the parent deadline cannot found a healthy cohort',
  async (t) => {
    const {clock, engine, readiness} =
      createServeRefreshFixture(t, createGateway());
    await readiness.readServeEligibility();
    engine.nowFn = () => clock.now;
    const native = captureFoundingAdmission(engine, () => {
      clock.now += 50;
      return {allowed: true};
    });
    const timeoutBudget = createTimeoutBudget({
      configuredBudgetMs: 20, now: engine.nowFn,
    });
    await t.rejects(engine.provisionInitialTablePartition({
      partitionId: 'deadline-probe-p1', replicaCount: 3, timeoutBudget,
      assertProvisioningOwnership: async () => native.events.push('ownership'),
    }), {errorCode: 'TIMEOUT'});
    t.same(readiness.answerServeCohort().eligibleNodeIds,
      ['serve-a', 'serve-b', 'serve-c'], 'lease time and job budget are independent');
    t.same(native.checked, ['serve-a'], 'later prechecks cannot start after the budget');
    t.same(native.proposals, [], 'a spent budget cannot reach the founding owner');
  });

test('explicit prechecks stop when their shared attempt deadline expires',
  async (t) => {
    const {clock, engine} = createServeRefreshFixture(t, createGateway());
    engine.nowFn = () => clock.now;
    const native = captureFoundingAdmission(engine, () => {
      clock.now += 50;
      return {allowed: true};
    });
    await t.rejects(engine.provisionInitialTablePartition({
      partitionId: 'explicit-deadline-p1', replicaCount: 2,
      targetNodeIds: ['serve-c', 'serve-a', 'serve-b'],
      timeoutBudget: createTimeoutBudget({configuredBudgetMs: 20, now: engine.nowFn}),
    }), {errorCode: 'TIMEOUT'});
    t.same(native.checked, ['serve-c']);
    t.same(native.proposals, []);
  });

for (const explicit of [false, true]) {
  test(`unknown admission cannot advance to another target (explicit: ${explicit})`,
    async (t) => {
      const {engine, readiness} = createServeRefreshFixture(t, createGateway());
      await readiness.readServeEligibility();
      const native = captureFoundingAdmission(engine, (nodeId) =>
        nodeId === 'serve-a' ? {} : {allowed: true});
      await t.rejects(engine.provisionInitialTablePartition({
        partitionId: 'admission-unknown-p1', replicaCount: 2,
        ...(explicit ? {targetNodeIds: ['serve-a', 'serve-b', 'serve-c']} : {}),
      }), {code: QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE});
      t.same(native.checked, ['serve-a']);
      t.same(native.proposals, []);
    });
}

for (const explicit of [false, true]) {
  test(`cancelled prechecks cannot examine another target (explicit: ${explicit})`,
    async (t) => {
      const {engine, readiness} = createServeRefreshFixture(t, createGateway());
      await readiness.readServeEligibility();
      const cancellationToken = new CancellationToken();
      const native = captureFoundingAdmission(engine, () => {
        cancellationToken.cancel('provisioning test cancelled');
        return {allowed: true};
      });
      await t.rejects(engine.provisionInitialTablePartition({
        partitionId: 'cancelled-admission-p1', replicaCount: 2,
        cancellationToken,
        ...(explicit ? {targetNodeIds: ['serve-a', 'serve-b', 'serve-c']} : {}),
      }), {message: 'provisioning test cancelled'});
      t.same(native.checked, ['serve-a']);
      t.same(native.proposals, []);
    });
}

function captureFoundingAdmission(engine, precheck = () => ({allowed: true})) {
  const events = [];
  const checked = [];
  const proposals = [];
  engine.rebalanceCoordinator = {
    placementAdmissionEnabled: true,
    resolveFormationLatchEpochForPlacement: () => 7,
    async checkProvisioningAdmission({nodeId}) {
      checked.push(nodeId);
      events.push(nodeId);
      return precheck(nodeId);
    },
    async admitPlacementStatement({statement}) {
      proposals.push(statement);
      events.push('found');
      throw new Error('the founding admission reached the native boundary');
    },
    async createOperation() {
      throw new Error('founding must submit the native statement');
    },
    async executeOperation() {
      throw new Error('the witness pauses before native materialization');
    },
  };
  return {events, checked, proposals};
}

// Real public SQL -> schema custody -> provisioning cohort -> readiness owner
// -> SystemTableCache source events. Storage and native replica dispatch are
// the explicit seams; no test supplies a serve decision or a retry outcome.
for (const heldReadFails of [false, true]) {
  test('CREATE retains one job across regressed serve reads and an in-flight ' +
    `source wake (held read fails: ${heldReadFails})`, async (t) => {
    const gateway = createGateway();
    const {clock, cache, state, readiness, engine} =
      createServeRefreshFixture(t, gateway);
    const nativeDispatches = [];
    const service = createService(gateway, [], {
      systemCache: cache, now: () => clock.now,
      schemaProvisioningRetrySetTimeoutFn: clock.setTimeout,
      schemaProvisioningRetryClearTimeoutFn: clock.clearTimeout,
      async partitionProvisioner(context) {
        const cohort = await engine.waitForProvisionTargetNodeIds({
          ...context, requiredReplicaCount: context.replicaCount,
          maxWaitMs: SCHEMA_PROVISIONING_DEFAULT.RETRY_AFTER_MS});
        nativeDispatches.push({partitionId: context.partitionId,
          nodeIds: cohort.nodeIds, epoch: cohort.epoch});
        return {resolvedReplicaCount: cohort.nodeIds.length,
          routableReplicaCount: cohort.nodeIds.length,
          fullReplicaCountConverged: true,
          contractState: OWNER_CONTRACT_STATE.READY,
          nextAction: 'proceed', epoch: cohort.epoch};
      },
    });
    const query = createSchemaWireClient(t, service, gateway, engine);
    await readiness.readServeEligibility();
    t.equal(readiness.answerServeCohort().epoch.publicationEpoch, 3);
    state.publications = [serveRefreshPublication(4)];
    cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
      'INSERT', serveRefreshPublication(5));
    await new Promise((resolve) => setImmediate(resolve));
    const first = await query();
    assertQuorumRefusal(t, first, first.outcome.detail);
    const jobKey = `schema_operations:${first.outcome.jobId}`;
    t.equal(gateway.rows.get(jobKey)?.status, 'PENDING');
    t.equal(nativeDispatches.length, 0, 'regressed committed epoch cannot dispatch');
    t.equal(readiness.answerServeCohort().reason, 'unavailable_stale');

    const beforeIdle = state.reads;
    await clock.advance(100);
    t.equal(state.reads, beforeIdle,
      'a regressed read creates no 100ms polling obligation');
    t.equal(nativeDispatches.length, 0);
    t.equal(gateway.rows.get(jobKey)?.attempt_count, 1,
      'the existing schema retry has not elapsed');

    let release;
    state.hold = new Promise((resolve) => {
      release = resolve;
    });
    state.fail = heldReadFails;
    const heldRead = readiness.readServeEligibility();
    const beforeWake = state.reads;
    state.nodes = state.nodes.map((row) => ({...row,
      ready_lease_expires_at: 21000}));
    state.publications = [serveRefreshPublication(5)];
    state.fail = false;
    // A real accepted cache apply arrives while the prior committed read is
    // held. Lease extension does not revoke, but must retain its wake.
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', state.nodes[0]);
    await new Promise((resolve) => setImmediate(resolve));
    state.hold = null;
    release();
    await heldRead;
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(state.reads, beforeWake + 2,
      'exactly one successor read consumes the source event before any timer');
    t.equal(state.maxActiveReads, 2,
      'only the two tables of one committed refresh overlap');
    t.equal(readiness.answerServeCohort().state, 'ready');
    t.equal(readiness.answerServeCohort().epoch?.publicationEpoch, 5);
    t.equal(nativeDispatches.length, 0, 'refresh cannot act as a schema worker');

    await clock.advance(SCHEMA_PROVISIONING_DEFAULT.RETRY_AFTER_MS - 100);
    for (let turn = 0; turn < 100; turn += 1) {
      if (gateway.rows.get(jobKey)?.status === 'SUCCEEDED') break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    t.equal(gateway.rows.get(jobKey)?.status, 'SUCCEEDED',
      'the existing schema retry completes the retained intent');
    t.equal(nativeDispatches.length, 1);
    t.same(nativeDispatches[0]?.nodeIds, ['serve-a', 'serve-b', 'serve-c']);
    t.equal(nativeDispatches[0]?.epoch?.publicationEpoch, 5);
    t.equal(service.schemaProvisioningJobOwner.retryTimersByWorkflowId.size, 0);
    t.equal(gateway.writes.filter((write) => write.tableName === 'tables' &&
      String(write.operation).toUpperCase() === 'INSERT').length, 1);
    const replay = await query();
    t.equal(replay.outcome.jobId, first.outcome.jobId);
    t.equal(replay.outcome.contractState, OWNER_CONTRACT_STATE.READY);
    t.ok(replay.messages.some((message) =>
      message[0] === PG_BACKEND_MSG.COMMAND_COMPLETE));
    t.equal(nativeDispatches.length, 1, 'terminal replay does not dispatch again');
  });
}

function assertQuorumRefusal(t, answer, refusal) {
  const {outcome, messages} = answer;
  t.equal(outcome.success, false, 'below quorum cannot complete CREATE');
  t.equal(outcome.contractState, OWNER_CONTRACT_STATE.DEFERRED);
  t.equal(outcome.nextAction, 'retry');
  t.equal(outcome.errorCode, QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE);
  t.same(outcome.epoch, refusal.epoch, 'current observation epoch survives');
  t.same(outcome.reasons, refusal.reasons, 'current refusal reasons survive');
  t.equal(outcome.retryAfterMs, refusal.retryAfterMs);
  t.same(outcome.detail, refusal, 'structured detail matches the observation');
  t.equal(messages.length, 1);
  t.equal(messages[0]?.[0], PG_BACKEND_MSG.ERROR_RESPONSE);
  t.ok(messages[0]?.includes(Buffer.from(PG_ERROR_CODE.CANNOT_CONNECT_NOW)),
    'public SQL maps the typed refusal to 57P03');
  t.ok(messages[0]?.includes(Buffer.from(JSON.stringify(refusal))),
    'the wire carries the current epoch, reasons and retry delay');
  t.notOk(messages.some((message) =>
    message[0] === PG_BACKEND_MSG.COMMAND_COMPLETE));
}

for (const recreateOwner of [false, true]) {
  test('below-quorum schema work retains retry custody and wire refusal ' +
    `through recovery (recreate owner: ${recreateOwner})`, async (t) => {
    const gateway = createGateway();
    const timers = [];
    const provisionCalls = [];
    const now = {value: 100};
    let quorumAvailable = false;
    let refusal = {epoch: {publicationEpoch: 7},
      reasons: ['serve_cohort_below_quorum'], retryAfterMs: 125};
    const overrides = {
      now: () => now.value,
      schemaProvisioningLeaseMs: 1000,
      schemaProvisioningRetrySetTimeoutFn(callback, delayMs) {
        const timer = {callback, delayMs, cleared: false, unref() {}};
        timers.push(timer);
        return timer;
      },
      schemaProvisioningRetryClearTimeoutFn(timer) {
        timer.cleared = true;
      },
      async partitionProvisioner(context) {
        provisionCalls.push(context);
        if (!quorumAvailable) {
          throw Object.assign(new Error('Provisioning unavailable: no quorum'), {
            code: QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE,
            ...refusal,
            detail: {...refusal},
          });
        }
        return {
          resolvedReplicaCount: recreateOwner ? 2 : 3,
          routableReplicaCount: recreateOwner ? 2 : 3,
          fullReplicaCountConverged: !recreateOwner,
          contractState: recreateOwner ? OWNER_CONTRACT_STATE.UNDER_REPLICATED :
            OWNER_CONTRACT_STATE.READY,
          nextAction: 'proceed',
          epoch: {publicationEpoch: 9},
          missingReplicaCount: recreateOwner ? 1 : 0,
        };
      },
    };
    let service = createService(gateway, provisionCalls, overrides);
    let query = createSchemaWireClient(t, service, gateway);
    const first = await query();
    assertQuorumRefusal(t, first, refusal);
    const jobId = first.outcome.jobId;
    const jobKey = `schema_operations:${jobId}`;
    t.equal(gateway.rows.get(jobKey)?.status, 'PENDING',
      'temporary quorum loss must not poison the durable intent as FAILED');
    t.equal(timers.length, 1, 'one canonical retry is retained');
    if (gateway.rows.get(jobKey)?.status !== 'PENDING') return;

    if (recreateOwner) {
      service.shutdown();
      t.ok(timers[0].cleared, 'old owner disarms its retry');
      service = createService(gateway, provisionCalls, {...overrides,
        schemaProvisioningOwnerId: 'schema-worker-b'});
      query = createSchemaWireClient(t, service, gateway);
      const [retained] = await service.resumeDurableProvisioningJobs();
      t.equal(retained.contractState, OWNER_CONTRACT_STATE.PENDING);
      t.equal(provisionCalls.length, 1,
        'new owner cannot provision under the previous live lease');
      now.value = gateway.rows.get(jobKey).workflow_lease_expires_at + 1;
    }
    refusal = {epoch: {publicationEpoch: 8},
      reasons: ['committed_lease_unavailable'], retryAfterMs: 275};
    const second = await query();
    assertQuorumRefusal(t, second, refusal);
    t.equal(second.outcome.jobId, jobId, 'repeated CREATE attaches to one job');
    t.equal(gateway.rows.get(jobKey).status, 'PENDING');
    t.equal(gateway.rows.get(jobKey).workflow_owner_id,
      recreateOwner ? 'schema-worker-b' : 'schema-worker-a');
    t.equal(service.schemaProvisioningJobOwner.retryTimersByWorkflowId.size, 1);
    t.equal(provisionCalls.length, 2, 'latest refusal comes from a new attempt');

    quorumAvailable = true;
    timers.at(-1).callback();
    for (let turn = 0; turn < 100; turn += 1) {
      if (gateway.rows.get(jobKey).status === 'SUCCEEDED') break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    t.equal(gateway.rows.get(jobKey).status, 'SUCCEEDED',
      'canonical owner timer completes the intent without another CREATE');
    t.equal(gateway.rows.get(jobKey).attempt_count, 3);
    t.equal(provisionCalls.length, 3);
    t.equal(service.schemaProvisioningJobOwner.retryTimersByWorkflowId.size, 0);
    t.equal(gateway.writes.filter((write) => write.tableName === 'tables' &&
      String(write.operation).toUpperCase() === 'INSERT').length, 1,
    'metadata is created once');
    const replay = await query();
    t.equal(replay.outcome.jobId, jobId);
    t.equal(replay.outcome.contractState, recreateOwner ?
      OWNER_CONTRACT_STATE.UNDER_REPLICATED : OWNER_CONTRACT_STATE.READY);
    t.ok(replay.messages.some((message) =>
      message[0] === PG_BACKEND_MSG.COMMAND_COMPLETE));
    t.equal(provisionCalls.length, 3, 'terminal success is replayed');
  });
}

test('durable schema job atomically records intent and replays one terminal ' +
  'result', async (t) => {
  const gateway = createGateway();
  const provisionCalls = [];
  const service = createService(gateway, provisionCalls);

  const first = await service.createTable(createAst(), {namespace: 'tenant-a'});
  t.equal(first.contractState, OWNER_CONTRACT_STATE.READY);
  t.match(first.jobId, /^schema-job-/u);
  t.equal(provisionCalls.length, 1);
  t.equal(provisionCalls[0].schemaJobId, first.jobId);

  const tableRow = gateway.rows.get(`tables:${first.tableId}`);
  const partitionRow = gateway.rows.get(`partitions:${first.partitionId}`);
  const jobRow = gateway.rows.get(`schema_operations:${first.jobId}`);
  t.ok(tableRow, 'worker projects deterministic table metadata');
  t.equal(partitionRow.table_id, first.tableId);
  t.same(Object.keys(JSON.parse(jobRow.workflow_record)).sort(), [
    'enlistedParticipantCount',
    'participants',
    'transitionHistory',
  ], 'workflow_record contains only non-scalar participant/history state');

  const replay = await service.createTable(createAst(), {namespace: 'tenant-b'});
  t.equal(replay.jobId, first.jobId);
  t.equal(replay.tableId, first.tableId);
  t.equal(provisionCalls.length, 1,
    'cluster-global terminal replay does not provision twice');

  await t.rejects(
    service.createTable(createAst({
      name: 'email',
      dataType: {name: 'TEXT'},
    }), {namespace: 'tenant-a'}),
    {code: SCHEMA_PROVISIONING_ERROR_CODE.INTENT_CONFLICT},
    'same table identity with different semantic intent is a stable conflict',
  );
});

test('table creation shutdown cancels durable work and disarms retries',
  async (t) => {
    const gateway = createGateway();
    const retryTimers = [];
    const clearedTimers = [];
    const service = createService(gateway, [], {
      schemaProvisioningRetrySetTimeoutFn(callback, delayMs) {
        const timer = {callback, delayMs, unref() {}};
        retryTimers.push(timer);
        return timer;
      },
      schemaProvisioningRetryClearTimeoutFn(timer) {
        clearedTimers.push(timer);
      },
    });
    let executionOptions = null;
    let provisionCallCount = 0;
    service.executeCreateTableProvisioning = async (_ast, options) => {
      executionOptions = options;
      provisionCallCount += 1;
      return {
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: 'retry',
      };
    };

    const pending = await service.createTable(createAst());
    t.equal(pending.contractState, OWNER_CONTRACT_STATE.PENDING);
    t.equal(provisionCallCount, 1);
    t.equal(retryTimers.length, 1);
    t.equal(
      service.schemaProvisioningJobOwner.retryTimersByWorkflowId.size,
      1,
    );
    t.ok(executionOptions.cancellationToken);
    t.equal(executionOptions.cancellationToken.isCancelled(), false);

    await service.shutdown();

    t.equal(executionOptions.cancellationToken.isCancelled(), true);
    t.equal(service.schemaProvisioningJobOwner.shuttingDown, true);
    t.equal(
      service.schemaProvisioningJobOwner.retryTimersByWorkflowId.size,
      0,
    );
    t.same(clearedTimers, retryTimers);

    retryTimers[0].callback();
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(
      provisionCallCount,
      1,
      'a raced retry callback cannot restart provisioning after shutdown',
    );
  });

test('durable schema job resumes after crash immediately after intent insert',
  async (t) => {
    const gateway = createGateway();
    const firstCalls = [];
    const firstOwner = createService(gateway, firstCalls);
    const intent = await firstOwner.schemaProvisioningJobOwner.insertOrAttach(
      canonicalizeSchemaProvisioningIntent(
        createAst(),
        {namespace: 'tenant-b'},
      ),
    );
    t.equal(intent.created, true);
    t.equal(firstCalls.length, 0, 'crash point precedes all side effects');

    const resumedCalls = [];
    const resumedOwner = createService(gateway, resumedCalls);
    const [result] = await resumedOwner.resumeDurableProvisioningJobs();
    t.equal(result.contractState, OWNER_CONTRACT_STATE.READY,
      'READY activation resumes the authoritative nonterminal job');
    t.equal(resumedCalls.length, 1);
    t.equal(
      [...gateway.rows.values()].filter(
        (row) => row.table_identity_key === 'global.users',
      ).length,
      1,
      'restart attaches to the one atomic intent row',
    );
  });

test('durable schema recovery preserves NOT NULL DEFAULT metadata identity',
  async (t) => {
    const gateway = createGateway();
    const now = {value: 100};
    const firstCalls = [];
    const firstOwner = createService(gateway, firstCalls, {
      now: () => now.value,
      schemaProvisioningOwnerId: 'schema-worker-first',
      schemaProvisioningLeaseMs: 30,
      schemaProvisioningRetrySetTimeoutFn() {
        return {unref() {}};
      },
      schemaProvisioningRetryClearTimeoutFn() {},
      async partitionProvisioner(context) {
        firstCalls.push(context);
        return {
          resolvedReplicaCount: 1,
          routableReplicaCount: 1,
          fullReplicaCountConverged: false,
          contractState: OWNER_CONTRACT_STATE.PENDING,
          nextAction: 'retry',
        };
      },
    });

    const pending = await firstOwner.createTable(createNotNullDefaultAst());
    t.equal(pending.contractState, OWNER_CONTRACT_STATE.PENDING);
    t.equal(firstCalls.length, 1);

    const jobRow = gateway.rows.get(`schema_operations:${pending.jobId}`);
    const tableRow = gateway.rows.get(`tables:${jobRow.table_id}`);
    const projectedSchema = JSON.parse(tableRow.schema_definition);
    t.equal(projectedSchema.columns[1].notNull, true);
    t.equal(projectedSchema.columns[1].defaultValue, '\'{}\'');

    const recordedIntent = JSON.parse(jobRow.normalized_ddl);
    t.equal(recordedIntent.columns[1].nullable, false,
      'canonical intent records parser-AST NOT NULL semantics');

    now.value = 40000;
    const resumedCalls = [];
    const resumedOwner = createService(gateway, resumedCalls, {
      now: () => now.value,
      schemaProvisioningOwnerId: 'schema-worker-restart',
    });
    const [result] = await resumedOwner.resumeDurableProvisioningJobs();

    t.equal(result.contractState, OWNER_CONTRACT_STATE.READY,
      'fresh owner accepts metadata projected from the same durable intent');
    t.equal(result.jobId, pending.jobId);
    t.equal(result.tableId, jobRow.table_id);
    t.equal(resumedCalls.length, 1);
    t.equal(gateway.rows.get(`tables:${jobRow.table_id}`).table_id,
      jobRow.table_id, 'restart preserves the deterministic table identity');
  });

test('durable schema recovery preserves COLLATE and CHECK metadata identity',
  async (t) => {
    const gateway = createGateway();
    const now = {value: 100};
    const firstCalls = [];
    const firstOwner = createService(gateway, firstCalls, {
      now: () => now.value,
      schemaProvisioningOwnerId: 'schema-worker-first',
      schemaProvisioningLeaseMs: 30,
      schemaProvisioningRetrySetTimeoutFn() {
        return {unref() {}};
      },
      schemaProvisioningRetryClearTimeoutFn() {},
      async partitionProvisioner(context) {
        firstCalls.push(context);
        return {
          resolvedReplicaCount: 1,
          routableReplicaCount: 1,
          fullReplicaCountConverged: false,
          contractState: OWNER_CONTRACT_STATE.PENDING,
          nextAction: 'retry',
        };
      },
    });
    const parsedAst = new SQLParser(
      'CREATE TABLE accounts (id TEXT PRIMARY KEY, ' +
      'handle TEXT COLLATE NOCASE NOT NULL CHECK (handle <> \'\'), ' +
      'tier INTEGER DEFAULT 2.0, CHECK (tier >= 0))',
    ).parse();

    const pending = await firstOwner.createTable(parsedAst);
    t.equal(pending.contractState, OWNER_CONTRACT_STATE.PENDING);

    now.value = 40000;
    const resumedCalls = [];
    const resumedOwner = createService(gateway, resumedCalls, {
      now: () => now.value,
      schemaProvisioningOwnerId: 'schema-worker-restart',
    });
    const [result] = await resumedOwner.resumeDurableProvisioningJobs();
    t.equal(result.contractState, OWNER_CONTRACT_STATE.READY);
    const tableRow = gateway.rows.get(`tables:${result.tableId}`);
    const projectedSchema = JSON.parse(tableRow.schema_definition);
    t.equal(projectedSchema.columns[1].collation, 'NOCASE');
    t.equal(projectedSchema.columns[1].checkSql, '(handle <> \'\')');
    t.equal(projectedSchema.columns[2].defaultValue, '2.0');
    t.equal(projectedSchema.tableConstraints[0].checkSql, '(tier >= 0)');
  });

test('client deadline returns a stable job and retry survives stale worker ' +
  'completion', async (t) => {
  const gateway = createGateway();
  const now = {value: 100};
  let releaseStaleWorker;
  let markStaleWorkerStarted;
  const staleWorkerResult = new Promise((resolve) => {
    releaseStaleWorker = resolve;
  });
  const staleWorkerStarted = new Promise((resolve) => {
    markStaleWorkerStarted = resolve;
  });
  const first = createService(gateway, [], {
    now: () => now.value,
    setTimeoutFn: (callback) => {
      callback();
      return 1;
    },
    clearTimeoutFn() {},
    schemaProvisioningOwnerId: 'schema-worker-stale',
    partitionProvisioner: () => {
      markStaleWorkerStarted();
      return staleWorkerResult;
    },
  });
  const pending = await first.createTable(createAst(), {
    namespace: 'tenant-c',
    timeoutBudget: createTimeoutBudget({
      configuredBudgetMs: 10,
      now: () => now.value,
    }),
  });
  t.equal(pending.contractState, OWNER_CONTRACT_STATE.PENDING);
  t.equal(pending.provisioningDeadlineExpired, true);
  t.match(pending.jobId, /^schema-job-/u);
  await staleWorkerStarted;

  const activeContender = createService(gateway, [], {
    now: () => now.value,
    schemaProvisioningOwnerId: 'schema-worker-contender',
  });
  const activeOutcome = await activeContender.createTable(createAst(), {
    namespace: 'tenant-c',
  });
  t.equal(activeOutcome.contractState, OWNER_CONTRACT_STATE.PENDING);
  t.same(activeOutcome.reasonCodes, ['schema_provisioning_active_owner']);
  t.same(
    activeContender.schemaProvisioningJobOwner.workflowCoordinator
      .requireWorkflow(pending.jobId).reasonCodes,
    ['schema_metadata_projecting'],
    'claim rejection projects a reason without mutating recovered state',
  );

  now.value = 40000;
  const retryCalls = [];
  const retry = createService(gateway, retryCalls, {
    now: () => now.value,
    schemaProvisioningOwnerId: 'schema-worker-retry',
  });
  const completed = await retry.createTable(createAst(), {
    namespace: 'tenant-c',
  });
  t.equal(completed.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(completed.jobId, pending.jobId);
  t.equal(retryCalls.length, 1);

  releaseStaleWorker({
    resolvedReplicaCount: 3,
    routableReplicaCount: 3,
    fullReplicaCountConverged: true,
    contractState: 'ready',
    nextAction: 'proceed',
  });
  await new Promise((resolve) => setImmediate(resolve));
  const terminalReplay = await retry.createTable(createAst(), {
    namespace: 'tenant-c',
  });
  t.equal(terminalReplay.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(terminalReplay.jobId, pending.jobId,
    'stale completion cannot replace the higher-epoch terminal result');

  const staleProcessReplay = await first.createTable(createAst(), {
    namespace: 'tenant-c',
  });
  t.equal(staleProcessReplay.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(staleProcessReplay.jobId, pending.jobId,
    'the stale process refreshes the authoritative terminal row');
});

test('pending durable schema work renews its lease and self-retries until ' +
  'replicas converge', async (t) => {
  const gateway = createGateway();
  const now = {value: 100};
  const retryTimers = [];
  const provisionCalls = [];
  const service = createService(gateway, provisionCalls, {
    now: () => now.value,
    schemaProvisioningLeaseMs: 30,
    schemaProvisioningRetrySetTimeoutFn(callback, delayMs) {
      const timer = {
        callback,
        cleared: false,
        delayMs,
        unref() {},
      };
      retryTimers.push(timer);
      return timer;
    },
    schemaProvisioningRetryClearTimeoutFn(timer) {
      timer.cleared = true;
    },
    async partitionProvisioner(context) {
      provisionCalls.push(context);
      now.value += 100;
      if (provisionCalls.length === 1) {
        return {
          resolvedReplicaCount: 1,
          routableReplicaCount: 1,
          fullReplicaCountConverged: false,
          contractState: OWNER_CONTRACT_STATE.PENDING,
          nextAction: 'retry',
        };
      }
      if (provisionCalls.length === 2) {
        throw new Error(
          'Timed out waiting for partition leader service for partition p1',
        );
      }
      return {
        resolvedReplicaCount: 3,
        routableReplicaCount: 3,
        fullReplicaCountConverged: true,
        contractState: OWNER_CONTRACT_STATE.READY,
        nextAction: 'proceed',
      };
    },
  });

  const pending = await service.createTable(createAst());
  t.equal(pending.contractState, OWNER_CONTRACT_STATE.PENDING);
  t.equal(provisionCalls.length, 1);
  t.equal(retryTimers.length, 1);
  t.equal(retryTimers[0].delayMs, 1000);

  let jobRow = gateway.rows.get(`schema_operations:${pending.jobId}`);
  t.equal(jobRow.status, 'PENDING');
  t.equal(jobRow.current_step, 'RECONCILING_REPLICAS');
  t.ok(jobRow.workflow_lease_expires_at > now.value,
    'the owner renews a lease that expired inside provisioning before ' +
    'persisting PENDING');

  retryTimers[0].callback();
  for (let turn = 0;
    turn < 100 && retryTimers.length < 2;
    turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  t.equal(provisionCalls.length, 2);
  t.equal(retryTimers.length, 2,
    'emitted timed-out leader wait schedules another durable attempt');

  retryTimers[1].callback();
  for (let turn = 0; turn < 100; turn += 1) {
    jobRow = gateway.rows.get(`schema_operations:${pending.jobId}`);
    if (jobRow?.status === 'SUCCEEDED') break;
    await new Promise((resolve) => setImmediate(resolve));
  }

  t.equal(provisionCalls.length, 3);
  t.equal(jobRow.status, 'SUCCEEDED');
  t.equal(jobRow.attempt_count, 3);
  t.ok(jobRow.workflow_lease_expires_at > now.value,
    'terminal transition also renews ownership after a long executor pass');

  const replay = await service.createTable(createAst());
  t.equal(replay.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(replay.jobId, pending.jobId);
  t.equal(provisionCalls.length, 3,
    'terminal replay does not schedule a fourth attempt');
});

test('terminal provisioning failure is durable and replayed without new work',
  async (t) => {
    const gateway = createGateway();
    let attempts = 0;
    const service = createService(gateway, [], {
      partitionProvisioner: async () => {
        attempts += 1;
        const error = new Error('placement policy rejected schema');
        error.code = 'PLACEMENT_POLICY_REJECTED';
        throw error;
      },
    });
    const failed = await service.createTable(createAst());
    t.equal(failed.contractState, OWNER_CONTRACT_STATE.FAILED);
    t.equal(failed.errorCode, 'PLACEMENT_POLICY_REJECTED');
    t.equal(attempts, 1);

    const replay = await service.createTable(createAst());
    t.equal(replay.contractState, OWNER_CONTRACT_STATE.FAILED);
    t.equal(replay.jobId, failed.jobId);
    t.equal(attempts, 1, 'terminal failure replay does not execute again');
  });

test('pre-cutover table metadata conflicts instead of being overwritten',
  async (t) => {
    const gateway = createGateway();
    gateway.rows.set('tables:tbl-legacy-users', {
      table_id: 'tbl-legacy-users',
      table_name: 'users',
      schema_definition: JSON.stringify({
        columns: [{name: 'id', type: 'INTEGER', primaryKey: true}],
      }),
    });
    const service = createService(gateway, []);
    const failed = await service.createTable(createAst());
    t.equal(failed.contractState, OWNER_CONTRACT_STATE.FAILED);
    t.equal(
      failed.errorCode,
      SCHEMA_PROVISIONING_ERROR_CODE.INTENT_CONFLICT,
    );
    t.equal(gateway.rows.get('tables:tbl-legacy-users').table_id,
      'tbl-legacy-users');
    t.equal(
      gateway.writes.some((mutation) =>
        mutation.tableName === 'tables' &&
        String(mutation.operation).toUpperCase() === 'UPSERT'),
      false,
      'durable replay never replaces existing metadata',
    );
  });

test('CREATE fails closed when durable intent persistence is unavailable',
  async (t) => {
    const service = new TableCreationService({
      systemCache: {find: () => null, getAll: () => []},
      controlPlaneSystemTableGateway: {},
    });
    await t.rejects(
      service.createTable(createAst()),
      {code: SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE},
    );
  });

// Corrective 2c: client-visible DDL keeps same-node read-your-writes. The
// statement's answer waits at its own metadata positions; its content still
// comes from the commit and provisioning.
test('CREATE TABLE answers only once this node projects its own metadata',
  async (t) => {
    const gateway = createGateway();
    gateway.paused = true;
    const service = createService(gateway, []);
    let answered = false;
    const creating = service.createTable(createAst(), {namespace: 'tenant-a'})
      .then((result) => {
        answered = true;
        return result;
      });
    for (let turn = 0; turn < 50 && gateway.projectionWaits.length < 2;
      turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    t.same(gateway.projectionWaits.map((wait) => wait.position.tableName),
      ['tables', 'partitions'], 'it waits at both metadata positions');
    t.equal(gateway.projectionWaits[0].options.statement, 'CREATE TABLE');
    t.equal(answered, false, 'no answer before the projection holds them');
    for (const wait of gateway.projectionWaits) wait.resolve({});
    const result = await creating;
    t.equal(result.contractState, OWNER_CONTRACT_STATE.READY,
      'the answer is the commit and provisioning answer');
  });

test('a projection wait ended by disconnect answers CREATE TABLE typed ' +
  'unavailable; the metadata stays committed', async (t) => {
  const gateway = createGateway();
  gateway.paused = true;
  const service = createService(gateway, []);
  const controller = new AbortController();
  const creating = service.createTable(createAst(),
    {namespace: 'tenant-a', abortSignal: controller.signal})
    .then(() => null, (error) => error);
  for (let turn = 0; turn < 50 && gateway.projectionWaits.length < 2;
    turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  t.equal(gateway.projectionWaits[0].options.abortSignal, controller.signal,
    'the session signal reaches the wait');
  for (const wait of gateway.projectionWaits) {
    wait.reject(Object.assign(new Error('ended'),
      {code: 'client_disconnected'}));
  }
  const refusal = await creating;
  t.equal(refusal?.code, SCHEMA_PROVISIONING_ERROR_CODE.PROJECTION_UNAVAILABLE);
  t.equal(refusal?.projectionOutcome, 'client_disconnected');
  t.equal([...gateway.rows.keys()].filter((key) =>
    key.startsWith('tables:')).length, 1, 'the metadata stays committed');
});

test('a resumed job has no client and never waits for projection',
  async (t) => {
    const gateway = createGateway();
    gateway.paused = true;
    const service = createService(gateway, []);
    await service.executeDurableSchemaProvisioningJob(createAst(), {
      tableId: 'tbl-resumed', partitionId: 'tbl-resumed-p1',
      jobId: 'schema-job-resumed', ownerFenceToken: 1,
      assertOwnership: async () => {},
    });
    t.equal(gateway.projectionWaits.length, 0);
  });

test('durable job cannot succeed through detached metadata wiring',
  async (t) => {
    const gateway = createGateway();
    const submitMutation = gateway.submitMutation.bind(gateway);
    gateway.submitMutation = async (mutation) => {
      if (mutation.tableName !== 'schema_operations') {
        const error = new Error('metadata gateway detached');
        error.code = SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE;
        throw error;
      }
      return submitMutation(mutation);
    };
    const service = createService(gateway, [], {
      cdcIntegrationService: null,
    });
    const failed = await service.createTable(createAst());
    t.equal(failed.contractState, OWNER_CONTRACT_STATE.FAILED);
    t.equal(
      failed.errorCode,
      SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE,
    );
    t.equal(
      [...gateway.rows.keys()].some((key) => key.startsWith('tables:')),
      false,
    );
    t.equal(
      [...gateway.rows.keys()].some((key) => key.startsWith('partitions:')),
      false,
    );
  });

test('runtime recovery activation resumes durable schema jobs', async (t) => {
  let schemaResumes = 0;
  const engine = Object.create(SQLQueryEngine.prototype);
  engine.tableCreationService = {
    async resumeDurableProvisioningJobs() {
      schemaResumes += 1;
      return [];
    },
  };
  engine.logger = {warn() {}};
  engine.transactionCoordinator = {startRecoverySweep() {}};
  engine.recoverDistributedTransactionStateFromCache = () => {};
  engine.resumeRecoveredDistributedTransactions = async () => ({resumed: 0});

  await engine.activateDistributedTransactionRecovery();
  await new Promise((resolve) => setImmediate(resolve));
  t.equal(schemaResumes, 1,
    'actual READY recovery activation invokes schema replay');
});

test('every exact reserved name is rejected before durable intent with an empty ' +
  'catalog', async (t) => {
  const gateway = createGateway();
  const calls = [];
  const service = createService(gateway, calls);
  t.teardown(() => service.shutdown());
  for (const tableName of Object.values(SYSTEM_TABLE_NAME)) {
    await t.rejects(service.createTable({...createAst(), tableName}),
      {code: 'SYSTEM_TABLE_NAME_RESERVED'}, tableName);
  }
  t.equal(gateway.writes.length, 0, 'no intent or metadata mutation');
  t.equal(calls.length, 0, 'no physical provisioning');
});

test('reserved pending intent is refused by real durable resume before table ' +
  'metadata or provisioning', async (t) => {
  const gateway = createGateway();
  const service = createService(gateway, []);
  t.teardown(() => service.shutdown());
  await service.schemaProvisioningJobOwner.insertOrAttach(
    canonicalizeSchemaProvisioningIntent({...createAst(), tableName: 'logs'}));
  const calls = [];
  const resumed = createService(gateway, calls);
  t.teardown(() => resumed.shutdown());
  const [result] = await resumed.resumeDurableProvisioningJobs();
  t.equal(result.success, false);
  t.equal(result.errorCode, 'SYSTEM_TABLE_NAME_RESERVED');
  t.equal(calls.length, 0);
  t.ok(gateway.writes.every((mutation) =>
    mutation.tableName === 'schema_operations'),
  'only existing job failure state may be persisted');
});

test('Logs case survives schema job identity, metadata creation and restart',
  async (t) => {
    const gateway = createGateway();
    const first = createService(gateway, []);
    t.teardown(() => first.shutdown());
    const ast = new SQLParser('CREATE TABLE "Logs" (id TEXT PRIMARY KEY)').parse();
    const intent = canonicalizeSchemaProvisioningIntent(ast);
    t.equal(intent.tableIdentityKey, 'global.Logs');
    t.not(intent.jobId, canonicalizeSchemaProvisioningIntent({
      ...ast, tableName: 'logs',
    }).jobId, 'distinct logical names have distinct durable identity');
    await first.schemaProvisioningJobOwner.insertOrAttach(intent);
    const calls = [];
    const resumed = createService(gateway, calls);
    t.teardown(() => resumed.shutdown());
    const [result] = await resumed.resumeDurableProvisioningJobs();
    t.equal(result.success, true);
    t.equal(result.tableName, 'Logs');
    t.equal(calls.length, 1);
    t.equal(calls[0].tableName, 'Logs');
    t.equal(gateway.rows.get(`tables:${intent.tableId}`).table_name, 'Logs');
    t.equal((await resumed.findExistingTableRecord('Logs')).table_id,
      intent.tableId, 'authoritative catalog resolves exact name');
    t.equal(await resumed.findExistingTableRecord('logs'), null,
      'authoritative catalog does not resolve a case alias');
  });
