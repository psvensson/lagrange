// Seed owns one ordered release INTENT per actual partition cohort. The
// participant cutover owner, not this test, owns authentic replica census and
// control validation. Fake delivery here proves only seed intent multiplicity.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createBootstrapServiceSeedWorkflowMethods} from
  '../../src/bootstrap/bootstrap-service-seed-workflow.js';
import {TABLES} from '../../src/constants/tables.js';
import {RealTimeSource, VirtualTimeSource} from '../../src/time/time-source.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_CONTROL_WAVE_FIELD as WAVE_FIELD,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING_FACT,
  PARTICIPANT_RELEASE_RESULT_FIELD, PARTICIPANT_RELEASE_TYPE,
  PARTICIPANT_RELEASE_TRIGGER} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';

const CONTROL = 'sql_transactions-p1';
const PAYLOADS = 'artifact_payloads-p1';
const RESULTS = 'call_cell_reduce_results-p1';
const SHARED_BUDGET_MS = 1000;

function localReplica(partitionId, tableName, replicaId) {
  return {partitionId, tableName, replicaId};
}

test('seed issues one serialized real partition release intent, not one per replica',
  async () => {
    const services = new Map();
    const add = (id, table) => {
      for (let i = 1; i <= 3; i += 1) {
        const r = localReplica(id, table, `${id}-r${i}`);
        services.set(r.replicaId, r);
      }
    };
    // Insert in intentionally non-canonical order; order selection remains
    // the real seed owner, control first and then lexical partition ID.
    add(RESULTS, TABLES.CALL_CELL_REDUCE_RESULTS);
    add(PAYLOADS, TABLES.ARTIFACT_PAYLOADS);
    add(CONTROL, TABLES.SQL_TRANSACTIONS);

    const clock = new RealTimeSource();
    const startedAt = clock.now();
    const routed = [];
    const authorized = [];
    const token = Object.freeze({kind: 'test-only-authority-token'});
    const waveToken = Object.freeze(Object.create(null));
    const waves = [];
    const owner = {
      partitionServices: services,
      nodeService: {getTimeSource: () => clock},
      config: {leadershipWaitTimeoutMs: SHARED_BUDGET_MS},
      replicaHandler: {
        nodeId: 'seed-cohort-intent-fixture',
        timeSource: clock,
        participantReleaseAuthorizationOwner: {
          authorizeFreshSeed(request) {
            authorized.push(request.partitionId);
            assert.equal(request.targetBuildDigest.length, 64,
              'the real build measurement is available for fresh seed');
            return token;
          },
        },
        participantReleaseRecovery: {
          async withFreshSeedControlWave(options, execute) {
            waves.push(options);
            assert.deepEqual(options.partitionIds, [PAYLOADS, RESULTS],
              'seed submits the exact sorted dependent partition IDs, not replicas');
            assert.strictEqual(options.controlAuthorization, token);
            return execute(waveToken);
          },
        },
        messageRouter: {
          deliver(_address, payload, options) {
            routed.push(Object.freeze({payload, options}));
            return Promise.resolve({
              acknowledged: true, deliveryState: 'delivered',
              [PARTICIPANT_RELEASE_RESULT_FIELD]: {outcome: OUTCOME.CUT_OVER},
            });
          },
        },
      },
      sleep() {
        throw new Error('all normal fake-route releases succeed without a retry');
      },
    };
    const method = createBootstrapServiceSeedWorkflowMethods()
      .releaseSeedParticipantCohorts;
    await method.call(owner);

    const requested = routed.map(({payload}) => payload.partitionId);
    const expected = [CONTROL, PAYLOADS, RESULTS];
    assert.equal(services.size, 9,
      'the real seed registry still contains all three replicas per partition');
    assert.deepEqual(requested, expected,
      'the seed starts one full-cohort RELEASE for each distinct partition in order');
    assert.deepEqual(authorized, [CONTROL, CONTROL, PAYLOADS, RESULTS],
      'one ordinary control intent, one exact control-wave admission, and two child intents');
    assert.equal(waves.length, 1,
      'the seed requests exactly one canonical control-owner wave');
    const firstDeadline = routed[0]?.payload.deadlineAtMs;
    assert.ok(Number.isSafeInteger(firstDeadline) &&
      firstDeadline >= startedAt &&
      firstDeadline <= clock.now() + SHARED_BUDGET_MS,
    'the existing seed clock owns the one unextended absolute deadline');
    assert.equal(waves[0].deadlineAtMs, firstDeadline,
      'the wave and every dependent retain the original absolute seed deadline');
    assert.equal(waves[0].targetBuildDigest.length, 64);
    assert.equal(Object.hasOwn(routed[0].payload, WAVE_FIELD), false,
      'the first control release remains the ordinary full source');
    for (const {payload, options} of routed) {
      assert.equal(payload.type, PARTICIPANT_RELEASE_TYPE);
      assert.equal(payload.action, 'release');
      assert.equal(payload.trigger, PARTICIPANT_RELEASE_TRIGGER.FRESH_SEED);
      assert.equal(payload.authorization, token);
      if (payload.partitionId !== CONTROL) {
        assert.strictEqual(payload[WAVE_FIELD], waveToken,
          'dependent carries only the opaque correlation, not control permission');
      }
      assert.equal(payload.deadlineAtMs, firstDeadline,
        'all distinct cohorts share the original seed deadline');
      assert.ok(options.timeoutMs > 0 &&
        options.timeoutMs <= SHARED_BUDGET_MS);
    }

    // An explicitly scoped release budget must not alter leader-election
    // waiting, the partition-intent count, or the single shared deadline.
    owner.config.seedParticipantReleaseBudgetMs = 20000;
    routed.length = 0;
    authorized.length = 0;
    waves.length = 0;
    const separatedStartedAt = clock.now();
    await method.call(owner);
    assert.equal(owner.config.leadershipWaitTimeoutMs, SHARED_BUDGET_MS,
      'the original election wait stays one second');
    assert.deepEqual(routed.map(({payload}) => payload.partitionId), expected);
    assert.equal(waves.length, 1);
    const separatedDeadline = routed[0].payload.deadlineAtMs;
    assert.ok(separatedDeadline >= separatedStartedAt + 20000 &&
      separatedDeadline <= clock.now() + 20000,
    'a new release interval is measured exactly once by the original clock');
    assert.equal(waves[0].deadlineAtMs, separatedDeadline);
    for (const {payload, options} of routed) {
      assert.equal(payload.deadlineAtMs, separatedDeadline,
        'a separated budget does not renew any per-partition deadline');
      assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 5000,
        'individual delivery still has its original shorter request bound');
    }

    for (const invalidBudget of [null, 0, -1, '20000', 1.5,
      Number.MAX_SAFE_INTEGER + 1]) {
      owner.config.seedParticipantReleaseBudgetMs = invalidBudget;
      routed.length = 0;
      authorized.length = 0;
      waves.length = 0;
      await assert.rejects(() => method.call(owner),
        /Invalid seed participant release budget/u);
      assert.equal(routed.length, 0,
        'an invalid explicit budget must refuse before any release is sent');
      assert.equal(waves.length, 0,
        'invalid budget creates no control-wave permission');
      assert.equal(authorized.length, 0,
        'invalid budget requests no fresh-seed authority');
    }
  });

test('seed must not claim readiness from a successful delivery observed after its deadline',
  async () => {
    // The router can return a valid already-completed commit after the caller's
    // absolute budget expires. We must NOT retroactively roll back its durable
    // result, but seed's bounded readiness report must refuse the late reply.
    // This fake clock advances only when the original delivery has engaged.
    const clock = new VirtualTimeSource({startMs: 100000});
    const budgetMs = 1000;
    const auth = Object.freeze({kind: 'fixture-fresh-seed'});
    const sent = [];
    const owner = {
      partitionServices: new Map([['control-r1',
        localReplica(CONTROL, TABLES.SQL_TRANSACTIONS, 'control-r1')]]),
      nodeService: {getTimeSource: () => clock},
      config: {leadershipWaitTimeoutMs: 1000,
        seedParticipantReleaseBudgetMs: budgetMs},
      replicaHandler: {
        nodeId: 'late-seed-reply-fixture',
        timeSource: clock,
        participantReleaseAuthorizationOwner: {
          authorizeFreshSeed() {
            return auth;
          },
        },
        messageRouter: {
          deliver(_address, request, options) {
            sent.push({request, options});
            assert.equal(request.partitionId, CONTROL,
              'the original control release actually entered the route');
            assert.equal(request.deadlineAtMs, 101000);
            assert.ok(options.timeoutMs > 0 && options.timeoutMs <= budgetMs);
            clock.advance(budgetMs + 1);
            return Promise.resolve({acknowledged: true,
              deliveryState: 'delivered',
              [PARTICIPANT_RELEASE_RESULT_FIELD]:
                {outcome: OUTCOME.CUT_OVER, releaseId: 'durably-finished-earlier'}});
          },
        },
      },
      sleep() {
        throw new Error('successful routing needs no retry');
      },
    };
    let resultError = null;
    try {
      await createBootstrapServiceSeedWorkflowMethods()
        .releaseSeedParticipantCohorts.call(owner);
    } catch (error) {
      resultError = error;
    }
    assert.equal(sent.length, 1,
      'the late typed delivery must be from the actual first release');
    assert.ok(resultError instanceof Error,
      'seed cannot declare a bounded successful release after deadline');
    assert.match(resultError.message, /^Seed participant release failed: /u);
    const failure = JSON.parse(resultError.message.replace(
      /^Seed participant release failed: /u, ''));
    assert.equal(failure.partitionId, CONTROL);
    assert.equal(failure.answer.outcome, OUTCOME.UNAVAILABLE,
      'an expired release reply must not satisfy seed readiness');
    assert.equal(failure.answer.missingFact, MISSING_FACT.RELEASE_DEADLINE);
    assert.equal(failure.seedRelease.budgetMs, budgetMs);
    assert.ok(clock.now() > 101000);
  });

test('seed still accepts a release reply received just before deadline', async () => {
  const clock = new VirtualTimeSource({startMs: 200000});
  const budgetMs = 1000;
  let delivered = 0;
  const owner = {
    partitionServices: new Map([['control',
      localReplica(CONTROL, TABLES.SQL_TRANSACTIONS, 'control')]]),
    nodeService: {getTimeSource: () => clock},
    config: {leadershipWaitTimeoutMs: budgetMs},
    replicaHandler: {
      nodeId: 'on-time-control',
      timeSource: clock,
      participantReleaseAuthorizationOwner: {
        authorizeFreshSeed() {return Object.freeze({kind: 'fixture'});},
      },
      messageRouter: {
        deliver(_address, request) {
          assert.equal(request.deadlineAtMs, 201000);
          delivered += 1;
          clock.advance(999);
          return Promise.resolve({acknowledged: true, deliveryState: 'delivered',
            [PARTICIPANT_RELEASE_RESULT_FIELD]: {outcome: OUTCOME.CUT_OVER}});
        },
      },
    },
  };
  await createBootstrapServiceSeedWorkflowMethods()
    .releaseSeedParticipantCohorts.call(owner);
  assert.equal(delivered, 1);
  assert.equal(clock.now(), 200999);
});
