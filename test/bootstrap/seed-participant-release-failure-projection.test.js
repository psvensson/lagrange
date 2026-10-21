import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {createBootstrapServiceSeedWorkflowMethods} from
  '../../src/bootstrap/bootstrap-service-seed-workflow.js';
import {resolveAutoRejoinStartupDecision} from '../../src/bootstrap/rejoin-hints.js';
import {createParticipantReleaseAuthorizationOwner} from
  '../../src/node/participant-release-authorization-owner.js';
import {releaseAnswer} from
  '../../src/partition/partition-participant-release-contract.js';
import {
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_CUTOVER_BOUND as BOUND,
  PARTICIPANT_RELEASE_ACTION,
  PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_TRIGGER,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const NODE_ID = 'seed-release-diagnostic-node';
const NODE_ADDRESS = 'ws://seed-release-diagnostic:9191';
const PARTITION_ID = 'seed-release-diagnostic-p1';
const TEST_BUDGET_MS = 5;
const FAILURE_PREFIX = 'Seed participant release failed: ';

function scriptedTimeSource(values) {
  let reads = 0;
  return {
    now() {
      const value = values[Math.min(reads, values.length - 1)];
      reads += 1;
      if (value instanceof Error) throw value;
      return value;
    },
    reads: () => reads,
  };
}

async function createSeedReleaseHost({timeSource, reply, budgetMs = TEST_BUDGET_MS}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-release-projection-'));
  const startup = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
  });
  const delivered = [];
  const handler = {nodeId: NODE_ID, timeSource, messageRouter: null};
  handler.participantReleaseAuthorizationOwner =
    createParticipantReleaseAuthorizationOwner(handler);
  handler.messageRouter = {
    async deliver(_address, request) {
      const answer = await reply(request, delivered.length);
      delivered.push({request, answer});
      return {acknowledged: true, [PARTICIPANT_RELEASE_RESULT_FIELD]: answer};
    },
  };
  const delays = [];
  const workflow = Object.assign(
    Object.create(createBootstrapServiceSeedWorkflowMethods()),
    {
      nodeService: {getTimeSource: () => timeSource},
      config: {leadershipWaitTimeoutMs: budgetMs},
      partitionServices: new Map([[PARTITION_ID, {
        partitionId: PARTITION_ID,
        tableName: 'seed_release_diagnostic',
      }]]),
      replicaHandler: handler,
      membershipOwnerOutcome: startup.membershipOwnerOutcome,
      async sleep(delayMs) {
        delays.push(delayMs);
        timeSource.advance?.(delayMs);
      },
    },
  );
  return {dataDir, delays, delivered, workflow,
    assertReleaseRequests() {
      assert.ok(delivered.length > 0, 'the actual release client must reach its route');
      const first = delivered[0].request;
      assert.match(first.targetBuildDigest, /^[a-f0-9]{64}$/u);
      for (const {request} of delivered) {
        assert.equal(request.action, PARTICIPANT_RELEASE_ACTION.RELEASE);
        assert.equal(request.trigger, PARTICIPANT_RELEASE_TRIGGER.FRESH_SEED);
        assert.equal(request.partitionId, PARTITION_ID);
        assert.equal(request.targetBuildDigest, first.targetBuildDigest);
        assert.equal(request.authorization, first.authorization,
          're-drive retains the original authorization object');
        assert.equal(request.deadlineAtMs, first.deadlineAtMs,
          'every actual delivery retains the one seed deadline');
        assert.equal(handler.participantReleaseAuthorizationOwner.validates(
          request.authorization,
          {partitionId: request.partitionId,
            targetBuildDigest: request.targetBuildDigest},
        ), true, 'the actual authorization owner accepts the captured seed token');
      }
    }};
}

function removeHost(host) {
  fs.rmSync(host.dataDir, {recursive: true, force: true});
}

async function seedReleaseFailureOf(host) {
  let failure = null;
  try {
    await host.workflow.releaseSeedParticipantCohorts();
  } catch (error) {
    failure = error;
  }
  assert.notEqual(failure, null, 'the focused workflow must retain its typed failure');
  assert.ok(failure.message.startsWith(FAILURE_PREFIX), failure.message);
  host.assertReleaseRequests();
  return JSON.parse(failure.message.slice(FAILURE_PREFIX.length));
}

function blockedDrainFixture() {
  return {
    generation: {
      nodeId: NODE_ID,
      ownerIncarnation: 1,
      replicaId: 'seed-release-r1',
      lifecycleIncarnation: 2,
      runtimeGeneration: 3,
      connectionGeneration: 4,
      admissionGeneration: 5,
    },
    work: {
      sqliteTransactionOpen: false,
      participantStaging: false,
      participantPrepared: 0,
      proposals: 1,
      pendingOutcomes: 1,
      appliedIndex: 6,
      commitIndex: 6,
      lastIndex: 7,
    },
  };
}

test('seed release workflow preserves first owner observations beside actual client deadline',
  async () => {
    const clock = new VirtualTimeSource({startMs: 1000});
    const blockedDrain = blockedDrainFixture();
    const joinedAttempt = {
      originalTrigger: PARTICIPANT_RELEASE_TRIGGER.FRESH_SEED,
      clockState: 'upstream-measured-observation',
      joinAgeMs: 2,
      terminalAgeMs: 3,
    };
    const host = await createSeedReleaseHost({timeSource: clock,
      reply: (request) => releaseAnswer(OUTCOME.DRAIN_PENDING, request, {
        retryAfterMs: TEST_BUDGET_MS,
        blockedDrain,
        joinedAttempt,
      })});
    try {
      const failure = await seedReleaseFailureOf(host);
      assert.equal(host.delivered.length, 1,
        'the second actual client request expires before another delivery');
      assert.deepEqual(host.delays, [TEST_BUDGET_MS]);
      assert.equal(Object.isFrozen(host.delivered[0].answer), true,
        'the first refusal is the actual frozen release-contract answer');
      assert.deepEqual(failure.answer, releaseAnswer(OUTCOME.UNAVAILABLE, {
        partitionId: PARTITION_ID,
        action: PARTICIPANT_RELEASE_ACTION.RELEASE,
      }, {missingFact: 'release_deadline', owner: NODE_ID}));
      assert.equal(failure.seedRelease?.ordinal, 1);
      assert.equal(failure.seedRelease?.total, 1);
      assert.equal(failure.seedRelease?.completed, 0);
      assert.equal(failure.seedRelease?.attemptCount, 2);
      assert.equal(failure.seedRelease?.budgetMs, TEST_BUDGET_MS);
      assert.equal(failure.seedRelease?.elapsedMs, TEST_BUDGET_MS);
      assert.equal(failure.seedRelease?.remainingMs, 0);
      assert.equal(typeof failure.seedRelease?.clockState, 'string');
      assert.notEqual(failure.seedRelease.clockState.length, 0);
      assert.deepEqual(failure.seedRelease?.firstBlockedDrain, blockedDrain);
      assert.deepEqual(failure.seedRelease?.firstJoinedAttempt, joinedAttempt);
    } finally {
      removeHost(host);
    }

    let successAnswer = null;
    const successHost = await createSeedReleaseHost({
      timeSource: new VirtualTimeSource({startMs: 2000}),
      reply: (request) => {
        successAnswer = releaseAnswer(OUTCOME.CUT_OVER, request);
        return successAnswer;
      },
    });
    try {
      await successHost.workflow.releaseSeedParticipantCohorts();
      successHost.assertReleaseRequests();
      assert.equal(successHost.delivered.length, 1);
      assert.equal(Object.hasOwn(successAnswer, 'seedRelease'), false);
      assert.equal(Object.hasOwn(successAnswer, 'blockedDrain'), false);
      assert.equal(Object.hasOwn(successAnswer, 'joinedAttempt'), false,
        'a healthy release answer carries no failure diagnostic');
    } finally {
      removeHost(successHost);
    }
  });

test('seed release workflow retains its first projections across distinct refusals',
  async () => {
    const clock = new VirtualTimeSource({startMs: 3000});
    const firstBlockedDrain = blockedDrainFixture();
    const secondBlockedDrain = {
      ...blockedDrainFixture(),
      work: {...blockedDrainFixture().work, proposals: 2},
    };
    const firstJoinedAttempt = {originalTrigger: PARTICIPANT_RELEASE_TRIGGER.FRESH_SEED,
      clockState: 'first-owner-observation', joinAgeMs: 1, terminalAgeMs: 2};
    const secondJoinedAttempt = {originalTrigger: PARTICIPANT_RELEASE_TRIGGER.FRESH_SEED,
      clockState: 'second-owner-observation', joinAgeMs: 3, terminalAgeMs: 4};
    const host = await createSeedReleaseHost({timeSource: clock,
      reply: (request, index) => releaseAnswer(OUTCOME.DRAIN_PENDING, request, {
        retryAfterMs: index === 0 ? 1 : TEST_BUDGET_MS - 1,
        blockedDrain: index === 0 ? firstBlockedDrain : secondBlockedDrain,
        joinedAttempt: index === 0 ? firstJoinedAttempt : secondJoinedAttempt,
      })});
    try {
      const failure = await seedReleaseFailureOf(host);
      assert.equal(host.delivered.length, 2);
      assert.deepEqual(host.delays, [1, TEST_BUDGET_MS - 1]);
      assert.equal(host.delivered.every(({answer}) => Object.isFrozen(answer)), true);
      assert.deepEqual(host.delivered[0].answer.blockedDrain, firstBlockedDrain);
      assert.deepEqual(host.delivered[0].answer.joinedAttempt, firstJoinedAttempt);
      assert.deepEqual(host.delivered[1].answer.blockedDrain, secondBlockedDrain);
      assert.deepEqual(host.delivered[1].answer.joinedAttempt, secondJoinedAttempt);
      assert.equal(failure.answer.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(failure.answer.missingFact, 'release_deadline');
      assert.equal(failure.seedRelease?.attemptCount, 3);
      assert.deepEqual(failure.seedRelease?.firstBlockedDrain, firstBlockedDrain);
      assert.deepEqual(failure.seedRelease?.firstJoinedAttempt, firstJoinedAttempt);
      assert.notDeepEqual(failure.seedRelease?.firstBlockedDrain, secondBlockedDrain);
      assert.notDeepEqual(failure.seedRelease?.firstJoinedAttempt, secondJoinedAttempt);
    } finally {
      removeHost(host);
    }
  });

async function observeTerminalClock(clockValues) {
  const timeSource = scriptedTimeSource(clockValues);
  const host = await createSeedReleaseHost({timeSource,
    reply: (request) => releaseAnswer(OUTCOME.UNAVAILABLE, request, {
      missingFact: 'focused_owner_refusal',
    })});
  try {
    const failure = await seedReleaseFailureOf(host);
    assert.equal(host.delivered.length, 1);
    assert.equal(host.delays.length, 0);
    assert.deepEqual(failure.answer, host.delivered[0].answer,
      'terminal observation cannot replace or reinterpret the owner refusal');
    assert.equal(failure.seedRelease?.ordinal, 1);
    assert.equal(failure.seedRelease?.total, 1);
    assert.equal(failure.seedRelease?.completed, 0);
    assert.equal(failure.seedRelease?.attemptCount, 1);
    assert.equal(failure.seedRelease?.firstBlockedDrain, null);
    assert.equal(failure.seedRelease?.firstJoinedAttempt, null);
    assert.equal(typeof failure.seedRelease?.clockState, 'string');
    assert.notEqual(failure.seedRelease.clockState.length, 0);
    return {projection: failure.seedRelease, reads: timeSource.reads()};
  } finally {
    removeHost(host);
  }
}

test('seed release workflow types terminal clock faults without changing refusal', async () => {
  const measured = await observeTerminalClock([100, 100, 102]);
  assert.equal(measured.reads, 3,
    'seed start, client timeout, and terminal observation are each read once');
  assert.equal(measured.projection.budgetMs, TEST_BUDGET_MS);
  assert.equal(measured.projection.elapsedMs, 2);
  assert.equal(measured.projection.remainingMs, 3);

  const unsafeTerminalValues = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1.5,
    -0,
    Number.MAX_SAFE_INTEGER + 1,
    '102',
  ];
  let unsafeState = null;
  for (const terminal of unsafeTerminalValues) {
    const observed = await observeTerminalClock([100, 100, terminal]);
    unsafeState ??= observed.projection.clockState;
    assert.equal(observed.projection.clockState, unsafeState);
    assert.equal(observed.projection.budgetMs, TEST_BUDGET_MS);
    assert.equal(observed.projection.elapsedMs, null);
    assert.equal(observed.projection.remainingMs, null);
  }
  assert.notEqual(unsafeState, measured.projection.clockState);

  const overflow = await observeTerminalClock([
    -Number.MAX_SAFE_INTEGER,
    -Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  ]);
  assert.equal(overflow.projection.clockState, unsafeState,
    'unsafe derived spend shares the typed unsafe state');
  assert.equal(overflow.projection.elapsedMs, null);
  assert.equal(overflow.projection.remainingMs, null);

  const backward = await observeTerminalClock([100, 100, 99]);
  assert.notEqual(backward.projection.clockState, measured.projection.clockState);
  assert.notEqual(backward.projection.clockState, unsafeState);
  assert.equal(backward.projection.elapsedMs, null);
  assert.equal(backward.projection.remainingMs, null);

  const unsafeBackwardTimeSource = scriptedTimeSource([
    Number.MAX_SAFE_INTEGER,
    -Number.MAX_SAFE_INTEGER,
  ]);
  const unsafeBackwardHost = await createSeedReleaseHost({
    timeSource: unsafeBackwardTimeSource,
    reply: (request) => releaseAnswer(OUTCOME.UNAVAILABLE, request,
      {missingFact: 'unsafe-backward-owner-refusal'}),
  });
  try {
    const failure = await seedReleaseFailureOf(unsafeBackwardHost);
    assert.deepEqual(failure.answer, unsafeBackwardHost.delivered[0].answer);
    assert.equal(failure.seedRelease?.clockState, unsafeState,
      'unsafe derived spend takes precedence over the same backward observation');
    assert.equal(failure.seedRelease?.budgetMs, TEST_BUDGET_MS);
    assert.equal(failure.seedRelease?.elapsedMs, null);
    assert.equal(failure.seedRelease?.remainingMs, null);
  } finally {
    removeHost(unsafeBackwardHost);
  }

  const unavailable = await observeTerminalClock([
    100,
    100,
    new Error('terminal seed clock unavailable'),
  ]);
  assert.notEqual(unavailable.projection.clockState, measured.projection.clockState);
  assert.notEqual(unavailable.projection.clockState, unsafeState);
  assert.notEqual(unavailable.projection.clockState, backward.projection.clockState);
  assert.equal(unavailable.projection.elapsedMs, null);
  assert.equal(unavailable.projection.remainingMs, null);

  const invalidBudgetTimeSource = scriptedTimeSource([100, 101]);
  const invalidBudgetHost = await createSeedReleaseHost({
    timeSource: invalidBudgetTimeSource,
    budgetMs: 1.5,
    reply: (request) => releaseAnswer(OUTCOME.UNAVAILABLE, request,
      {missingFact: 'configured-budget-owner-refusal'}),
  });
  try {
    const failure = await seedReleaseFailureOf(invalidBudgetHost);
    assert.equal(invalidBudgetHost.delivered.length, 1,
      'an invalid diagnostic budget still preserves the actual owner refusal');
    assert.deepEqual(failure.answer, invalidBudgetHost.delivered[0].answer);
    assert.equal(failure.seedRelease?.attemptCount, 1);
    assert.equal(failure.seedRelease?.budgetMs, null);
    assert.equal(failure.seedRelease?.elapsedMs, null);
    assert.equal(failure.seedRelease?.remainingMs, null);
    assert.equal(invalidBudgetTimeSource.reads(), 2,
      'only the seed start and terminal diagnostic observations read the owner clock');
  } finally {
    removeHost(invalidBudgetHost);
  }
});

async function withSeedHost(host, body) {
  let primary;
  let failed = false;
  try {
    await body();
  } catch (error) {
    primary = error;
    failed = true;
  }
  try {
    removeHost(host);
  } catch (cleanup) {
    if (failed) throw new AggregateError([primary, cleanup], 'body and fixture cleanup failed');
    throw cleanup;
  }
  if (failed) throw primary;
}

test('seed completion preserves wait preparation at the original deadline', async () => {
  // Reads: seed start, client timeout, delay guard, wait preparation,
  // loop continuation, final client timeout, terminal diagnostic.
  const timeSource = scriptedTimeSource([100, 100, 100, 105, 105, 105, 105]);
  const host = await createSeedReleaseHost({timeSource,
    reply: (request) => releaseAnswer(OUTCOME.DRAIN_PENDING, request,
      {retryAfterMs: 1})});
  await withSeedHost(host, async () => {
    const failure = await seedReleaseFailureOf(host);
    assert.deepEqual(host.delays, [0], 'seed retains its zero-wait preparation race');
    assert.equal(timeSource.reads(), 7, 'clock reads retain original order');
    assert.equal(host.delivered.length, 1);
    assert.equal(failure.seedRelease.attemptCount, 2,
      'the final client call at D refuses before delivery');
    assert.equal(failure.answer.missingFact, 'release_deadline');
  });
});

test('seed completion preserves reply delay validation, zero re-drive and NOT_LEADER cadence',
  async () => {
    for (const delay of [undefined, null, -1, 1.5, NaN, Infinity, '1']) {
      const clock = scriptedTimeSource([100, 100, 101]);
      const host = await createSeedReleaseHost({timeSource: clock,
        reply: (request) => releaseAnswer(OUTCOME.DRAIN_PENDING, request,
          {retryAfterMs: delay})});
      await withSeedHost(host, async () => {
        const failure = await seedReleaseFailureOf(host);
        assert.deepEqual(host.delays, [], `invalid delay ${String(delay)} never waits`);
        assert.equal(host.delivered.length, 1);
        assert.equal(failure.answer.outcome, OUTCOME.DRAIN_PENDING);
        assert.equal(clock.reads(), 3, 'invalid delay short-circuits the guard clock');
      });
    }
    for (const outcome of [OUTCOME.DRAIN_PENDING, OUTCOME.NOT_LEADER]) {
      const clock = new VirtualTimeSource({startMs: 1000});
      const host = await createSeedReleaseHost({timeSource: clock,
        budgetMs: BOUND.PAUSE_RETRY_AFTER_MS + 5,
        reply: (request, index) => releaseAnswer(index === 0 ? outcome : OUTCOME.CUT_OVER,
          request, {retryAfterMs: 0})});
      await withSeedHost(host, async () => {
        await host.workflow.releaseSeedParticipantCohorts();
        host.assertReleaseRequests();
        assert.equal(host.delivered.length, 2);
        assert.deepEqual(host.delays,
          [outcome === OUTCOME.NOT_LEADER ? BOUND.PAUSE_RETRY_AFTER_MS : 0]);
      });
    }
  });

test('seed completion propagates the original wait rejection without another request', async () => {
  const failure = new Error('seed wait owner refused');
  const host = await createSeedReleaseHost({
    timeSource: new VirtualTimeSource({startMs: 100}),
    reply: (request) => releaseAnswer(OUTCOME.DRAIN_PENDING, request, {retryAfterMs: 1}),
  });
  host.workflow.sleep = async () => {
    throw failure;
  };
  await withSeedHost(host, async () => {
    await assert.rejects(host.workflow.releaseSeedParticipantCohorts(),
      (error) => error === failure);
    host.assertReleaseRequests();
    assert.equal(host.delivered.length, 1);
  });
});


test('seed completion refuses a safe delay that exceeds the original remaining budget', async () => {
  const clock = scriptedTimeSource([100, 100, 100, 101]);
  const host = await createSeedReleaseHost({timeSource: clock,
    reply: (request) => releaseAnswer(OUTCOME.DRAIN_PENDING, request, {retryAfterMs: 6})});
  await withSeedHost(host, async () => {
    const failure = await seedReleaseFailureOf(host);
    assert.equal(failure.answer.outcome, OUTCOME.DRAIN_PENDING);
    assert.equal(failure.seedRelease.attemptCount, 1);
    assert.equal(host.delivered.length, 1);
    assert.deepEqual(host.delays, []);
    assert.equal(clock.reads(), 4, 'start, client, guard and terminal diagnostic only');
  });
});
