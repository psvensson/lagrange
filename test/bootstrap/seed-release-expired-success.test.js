// Exact deadline semantics of the existing seed-release owner: a typed
// CUT_OVER reply arriving after the original absolute deadline cannot grant
// startup TRAFFIC_READY. This is a deterministic clock seam, not a performance
// benchmark or fabricated membership/authorization approval.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createBootstrapServiceSeedWorkflowMethods} from
  '../../src/bootstrap/bootstrap-service-seed-workflow.js';
import {TABLES} from '../../src/constants/tables.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING_FACT,
  PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_TYPE} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';

const CONTROL = 'sql_transactions-p1';
const BUDGET_MS = 1000;

function ownerWithDeliveryAdvance(advanceMs, acceptedPartitions = [CONTROL]) {
  const timeSource = new VirtualTimeSource({startMs: 12000});
  const events = [];
  const replica = {partitionId: CONTROL,
    tableName: TABLES.SQL_TRANSACTIONS, replicaId: 'seed-deadline-control-r1'};
  const token = Object.freeze({kind: 'test-only-authority'});
  const owner = {
    partitionServices: new Map([[replica.replicaId, replica]]),
    nodeService: {getTimeSource: () => timeSource},
    config: {leadershipWaitTimeoutMs: BUDGET_MS,
      seedParticipantReleaseBudgetMs: BUDGET_MS},
    replicaHandler: {
      nodeId: 'seed-expired-success-test',
      timeSource,
      participantReleaseAuthorizationOwner: {
        authorizeFreshSeed() {
          return token;
        },
      },
      messageRouter: {
        deliver(_address, payload, deliveryOptions) {
          events.push({kind: 'delivered', atMs: timeSource.now(),
            deadlineAtMs: payload.deadlineAtMs,
            timeoutMs: deliveryOptions.timeoutMs,
            payload});
          if (payload.type !== PARTICIPANT_RELEASE_TYPE ||
              !acceptedPartitions.includes(payload.partitionId)) {
            throw new Error('The original control release route was not exercised');
          }
          timeSource.advance(advanceMs);
          return Promise.resolve({acknowledged: true,
            deliveryState: 'delivered',
            [PARTICIPANT_RELEASE_RESULT_FIELD]: {outcome: OUTCOME.CUT_OVER}});
        },
      },
    },
    sleep() {
      throw new Error('An accepted direct reply never requests a retry timer');
    },
  };
  return {owner, timeSource, events};
}

test('expired typed control CUT_OVER reply cannot complete seed release',
  async () => {
    const {owner, timeSource, events} = ownerWithDeliveryAdvance(BUDGET_MS + 1);
    await assert.rejects(() =>
      createBootstrapServiceSeedWorkflowMethods()
        .releaseSeedParticipantCohorts.call(owner), (error) => {
      assert.equal(error instanceof Error, true);
      assert.match(error.message, /^Seed participant release failed: /u);
      const diagnostic = JSON.parse(error.message.slice(
        'Seed participant release failed: '.length));
      assert.equal(diagnostic.partitionId, CONTROL);
      assert.equal(diagnostic.answer.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(diagnostic.answer.missingFact, MISSING_FACT.RELEASE_DEADLINE);
      assert.equal(diagnostic.seedRelease.completed, 0);
      assert.equal(diagnostic.seedRelease.total, 1);
      assert.equal(diagnostic.seedRelease.budgetMs, BUDGET_MS);
      return true;
    });
    assert.equal(timeSource.now(), 13001);
    assert.equal(events.length, 1,
      'one original release routed, no artificially retried work');
    assert.equal(events[0].deadlineAtMs, 13000);
    assert.equal(events[0].timeoutMs, BUDGET_MS);
  });

test('typed control reply completed inside the shared deadline is accepted',
  async () => {
    const {owner, timeSource, events} = ownerWithDeliveryAdvance(BUDGET_MS - 1);
    await createBootstrapServiceSeedWorkflowMethods()
      .releaseSeedParticipantCohorts.call(owner);
    assert.equal(timeSource.now(), 12999);
    assert.equal(events.length, 1);
    assert.equal(events[0].deadlineAtMs, 13000);
    assert.equal(events[0].timeoutMs, BUDGET_MS);
  });

test('expired successful control-wave END cannot complete seed startup readiness',
  async () => {
    const dependent = {partitionId: 'artifact_payloads-p1',
      tableName: TABLES.ARTIFACT_PAYLOADS,
      replicaId: 'seed-deadline-payloads-r1'};
    const {owner, timeSource, events} = ownerWithDeliveryAdvance(0,
      [CONTROL, dependent.partitionId]);
    owner.partitionServices.set(dependent.replicaId, dependent);
    let waveStarted = false;
    let waveReturnedAfterDeadline = false;
    owner.replicaHandler.participantReleaseRecovery = {
      async withFreshSeedControlWave(options, execute) {
        waveStarted = true;
        assert.deepEqual(options.partitionIds, [dependent.partitionId]);
        assert.equal(options.deadlineAtMs, 13000);
        await execute(Object.freeze(Object.create(null)));
        assert.equal(events.length, 2,
          'both real seed partition intents have already been answered');
        timeSource.advance(BUDGET_MS + 1);
        waveReturnedAfterDeadline = true;
      },
    };
    await assert.rejects(() =>
      createBootstrapServiceSeedWorkflowMethods()
        .releaseSeedParticipantCohorts.call(owner),
    /Seed participant control wave END deadline expired/u);
    assert.equal(waveStarted, true, 'the original control wave owner was called');
    assert.equal(waveReturnedAfterDeadline, true,
      'the slow success path, not a refused or skipped control wave, engaged');
    assert.equal(timeSource.now(), 13001);
    assert.deepEqual(events.map((entry) => entry.payload.partitionId),
      [CONTROL, dependent.partitionId],
      'original one-per-partition intents remain unchanged');
    assert.ok(events.every((entry) => entry.deadlineAtMs === 13000),
      'every original request retains one absolute deadline');
  });
