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
    assert.deepEqual(authorized, expected,
      'only the existing fresh-seed authorization owner is asked per cohort');
    const firstDeadline = routed[0]?.payload.deadlineAtMs;
    assert.ok(Number.isSafeInteger(firstDeadline) &&
      firstDeadline >= startedAt &&
      firstDeadline <= clock.now() + SHARED_BUDGET_MS,
    'the existing seed clock owns the one unextended absolute deadline');
    for (const {payload, options} of routed) {
      assert.equal(payload.type, PARTICIPANT_RELEASE_TYPE);
      assert.equal(payload.action, 'release');
      assert.equal(payload.trigger, PARTICIPANT_RELEASE_TRIGGER.FRESH_SEED);
      assert.equal(payload.authorization, token);
      assert.equal(payload.deadlineAtMs, firstDeadline,
        'all distinct cohorts share the original seed deadline');
      assert.ok(options.timeoutMs > 0 &&
        options.timeoutMs <= SHARED_BUDGET_MS);
    }
  });

test('independent seed partition intents overlap only after actual control release completes',
  async () => {
    const services = new Map();
    const groupNames = [
      {id: CONTROL, table: TABLES.SQL_TRANSACTIONS},
      {id: PAYLOADS, table: TABLES.ARTIFACT_PAYLOADS},
      {id: RESULTS, table: TABLES.CALL_CELL_REDUCE_RESULTS},
      {id: 'code-p1', table: TABLES.CODE},
      {id: 'contexts-p1', table: TABLES.CONTEXTS},
    ];
    for (const {id, table} of [...groupNames].reverse()) {
      for (let number = 3; number >= 1; number -= 1) {
        const r = localReplica(id, table, `${id}-r${number}`);
        services.set(r.replicaId, r);
      }
    }

    const clock = new RealTimeSource();
    const intents = [];
    const controller = {controlComplete: false, inFlight: 0, maximum: 0,
      settled: 0, activeAtFinish: 0};
    const token = Object.freeze({kind: 'test-only-authority-token'});
    const owner = {
      partitionServices: services,
      nodeService: {getTimeSource: () => clock},
      config: {leadershipWaitTimeoutMs: SHARED_BUDGET_MS},
      replicaHandler: {
        nodeId: 'seed-bounded-test',
        timeSource: clock,
        participantReleaseAuthorizationOwner: {
          authorizeFreshSeed() {
            return token;
          },
        },
        messageRouter: {
          deliver(_address, payload) {
            assert.equal(payload.action, 'release');
            intents.push({partition: payload.partitionId,
              deadline: payload.deadlineAtMs});
            if (payload.partitionId !== CONTROL) {
              assert.equal(controller.controlComplete, true,
                'no dependent seed cohort begins before control completes');
              controller.inFlight += 1;
              controller.maximum = Math.max(controller.maximum, controller.inFlight);
            }
            return new Promise((resolve) => {
              // A bounded test-only asynchronous transport exercises the
              // existing bootstrap orchestration without changing release
              // policy, retry, owner clock, or any real native runtime.
              setTimeout(() => {
                if (payload.partitionId === CONTROL) controller.controlComplete = true;
                else controller.inFlight -= 1;
                controller.settled += 1;
                resolve({acknowledged: true, deliveryState: 'delivered',
                  [PARTICIPANT_RELEASE_RESULT_FIELD]: {outcome: OUTCOME.CUT_OVER}});
              }, payload.partitionId === CONTROL ? 5 : 20);
            });
          },
        },
      },
      sleep() {
        throw new Error('successful fake responses should not cause retries');
      },
    };
    await createBootstrapServiceSeedWorkflowMethods()
      .releaseSeedParticipantCohorts.call(owner);
    controller.activeAtFinish = controller.inFlight;
    assert.equal(controller.activeAtFinish, 0,
      'seed awaits every admitted independent cohort before completing');
    assert.equal(controller.settled, groupNames.length,
      'one real request for each eligible distinct partition');
    assert.deepEqual(intents.map((item) => item.partition),
      [CONTROL, PAYLOADS, RESULTS, 'code-p1', 'contexts-p1'],
    'the seed begins by control then admits independent partitions in sorted order');
    assert.equal(new Set(intents.map((item) => item.deadline)).size, 1,
      'all independent cohorts share the unchanged original absolute deadline');
    assert.ok(controller.maximum >= 2,
      'at least two independent real release intents must be in flight together');
  });
