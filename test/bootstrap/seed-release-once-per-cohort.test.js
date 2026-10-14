// Seed owns one ordered release INTENT per actual partition cohort. The
// participant cutover owner, not this test, owns authentic replica census and
// control validation. Fake delivery here proves only seed intent multiplicity.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createBootstrapServiceSeedWorkflowMethods} from
  '../../src/bootstrap/bootstrap-service-seed-workflow.js';
import {TABLES} from '../../src/constants/tables.js';
import {RealTimeSource} from '../../src/time/time-source.js';
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
  });


test('held control wave joins every started child and never admits another wave after refusal',
  async () => {
    const clock = new RealTimeSource();
    const services = new Map();
    const dependentIds = Array.from({length: 9}, (_, i) =>
      'seed-wave-dependent-' + String(i).padStart(2, '0') + '-p1');
    for (const partitionId of [CONTROL, ...dependentIds]) {
      for (let i = 1; i <= 3; i += 1) {
        const replica = localReplica(partitionId,
          partitionId === CONTROL ? TABLES.SQL_TRANSACTIONS : TABLES.CONTEXTS,
          partitionId + '-r' + i);
        services.set(replica.replicaId, replica);
      }
    }
    const state = {active: 0, settled: 0, requests: [], waveCompleted: false};
    const token = Object.freeze(Object.create(null));
    const waveToken = Object.freeze(Object.create(null));
    const owner = {
      partitionServices: services,
      nodeService: {getTimeSource: () => clock},
      config: {leadershipWaitTimeoutMs: SHARED_BUDGET_MS},
      replicaHandler: {
        nodeId: 'seed-wave-failure-ordinal',
        timeSource: clock,
        participantReleaseAuthorizationOwner: {
          authorizeFreshSeed() {
            return token;
          },
        },
        participantReleaseRecovery: {
          async withFreshSeedControlWave(options, execute) {
            assert.deepEqual(options.partitionIds, dependentIds);
            const result = await execute(waveToken);
            state.waveCompleted = true;
            return result;
          },
        },
        messageRouter: {
          deliver(_address, payload) {
            state.requests.push({partitionId: payload.partitionId,
              deadline: payload.deadlineAtMs});
            if (payload.partitionId !== CONTROL) state.active += 1;
            return new Promise((resolve) => {
              setTimeout(() => {
                if (payload.partitionId !== CONTROL) state.active -= 1;
                state.settled += 1;
                resolve({acknowledged: true, deliveryState: 'delivered',
                  [PARTICIPANT_RELEASE_RESULT_FIELD]: {
                    outcome: payload.partitionId === dependentIds[0] ?
                      OUTCOME.UNAVAILABLE : OUTCOME.CUT_OVER,
                  }});
              }, payload.partitionId === dependentIds[0] ? 2 : 20);
            });
          },
        },
      },
      sleep() {
        throw new Error('a terminal release refusal must not be retried');
      },
    };
    let failure = null;
    try {
      await createBootstrapServiceSeedWorkflowMethods()
        .releaseSeedParticipantCohorts.call(owner);
    } catch (error) {
      failure = error;
    }
    assert.ok(failure instanceof Error, 'first dependent failure cannot be hidden');
    assert.ok(failure.message.startsWith('Seed participant release failed: '),
      failure.message);
    const answer = JSON.parse(failure.message.slice('Seed participant release failed: '.length));
    assert.equal(answer.partitionId, dependentIds[0]);
    assert.equal(answer.answer.outcome, OUTCOME.UNAVAILABLE);
    assert.equal(answer.seedRelease.ordinal, 2,
      'control and first dependent are the deterministic ordered prefix');
    assert.equal(answer.seedRelease.completed, 1);
    assert.equal(state.waveCompleted, false,
      'a failed wave cannot be reported as completed');
    assert.equal(state.active, 0,
      'all admitted promises must settle before the wave returns failure');
    assert.equal(state.settled, state.requests.length,
      'no started dependent release escapes the canonical allSettled join');
    assert.deepEqual(state.requests.map((record) => record.partitionId),
      [CONTROL, ...dependentIds.slice(0, 4)],
      'the failure does not admit any second wave of independent partitions');
    assert.equal(new Set(state.requests.map((record) => record.deadline)).size, 1,
      'the original shared deadline is never renewed for a child');
  });
