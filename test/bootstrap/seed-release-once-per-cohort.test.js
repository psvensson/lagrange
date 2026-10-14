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

test('seed refuses an acknowledged CUT_OVER delivered after the single absolute deadline',
  {timeout: 10000}, async () => {
    const clock = new VirtualTimeSource({startMs: 1000});
    const entry = localReplica(CONTROL, TABLES.SQL_TRANSACTIONS, 'late-control-r1');
    const partitionServices = new Map([[entry.replicaId, entry]]);
    const entered = Promise.withResolvers();
    const heldReply = Promise.withResolvers();
    const calls = [];
    const owner = {
      partitionServices,
      nodeService: {getTimeSource: () => clock},
      config: {leadershipWaitTimeoutMs: SHARED_BUDGET_MS},
      replicaHandler: {
        nodeId: 'seed-absolute-deadline-test',
        timeSource: clock,
        participantReleaseAuthorizationOwner: {
          authorizeFreshSeed() {
            return Object.freeze({kind: 'test-only-authorization'});
          },
        },
        messageRouter: {
          deliver(_address, request, options) {
            calls.push({request, options});
            entered.resolve();
            return heldReply.promise;
          },
        },
      },
      sleep() {
        throw new Error('valid late CUT_OVER has no eligible retry');
      },
    };
    const release = createBootstrapServiceSeedWorkflowMethods()
      .releaseSeedParticipantCohorts.call(owner);
    await entered.promise;
    assert.equal(calls.length, 1,
      'an actual partition release request was admitted before the deadline');
    assert.equal(calls[0].request.deadlineAtMs, 2000,
      'the original seed owner captured one absolute 1000ms budget');
    assert.equal(calls[0].options.timeoutMs, SHARED_BUDGET_MS);
    // One already-admitted callback finishes after the deadline; it must not
    // turn the seed traffic-ready state green even if its durable work succeeded.
    clock.advance(SHARED_BUDGET_MS + 1);
    heldReply.resolve({acknowledged: true, deliveryState: 'delivered',
      [PARTICIPANT_RELEASE_RESULT_FIELD]: {outcome: OUTCOME.CUT_OVER}});
    await assert.rejects(release, /Seed participant release failed:/u,
      'an expired caller cannot accept a late positive release answer');
    assert.equal(calls.length, 1,
      'no new release or renewed timeout follows an expired positive answer');
  });
