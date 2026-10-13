import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {RaftRole} from '../../src/partition/partition-service.js';
import {
  LEADER_DURABILITY_CONSEQUENCE_OUTCOME,
  createPartitionServiceDurabilityFitnessMethods,
} from '../../src/partition/partition-service-durability-fitness.js';
import {
  clearFixtureSingletons,
  onFixtureLeader,
  resetFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';

// The current durability-fitness owner observes one signal: an open SQLite
// transaction on the partition connection. Current TX1 staging never creates
// that state across requests. These deterministic service-shaped fixtures
// drive the owner with the signal it actually consumes; they do not recreate
// the retired session engine or claim that a current participant opened it.
const START_MS = 9_000_000;
const LEGAL_HOLD_MS = 60_000;
const TICK_MS = 1_000;
const STRIKE_LIMIT = 3;
const SUCCESSORLESS_FALLBACK_MS = 15_000;

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

function createFitnessFixture({solo = false} = {}) {
  const events = [];
  const errors = [];
  let successorViable = false;
  const service = {
    db: {open: true, inTransaction: false},
    partitionId: 'durability-fitness-p1',
    replicaId: 'durability-fitness-r1',
    replicaIds: solo ? ['durability-fitness-r1'] :
      ['durability-fitness-r1', 'durability-fitness-r2'],
    role: RaftRole.LEADER,
    raft: {readStatus: () => ({peerCount: solo ? 0 : 1})},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error(message, context) {
        errors.push({message, context});
      },
    },
  };
  Object.assign(service, createPartitionServiceDurabilityFitnessMethods());
  service.setLeaderDurabilityUnfitHook((evidence) => events.push(evidence));
  service.setLeaderDurabilitySuccessorProbe(() => successorViable);
  return {
    errors,
    events,
    service,
    setSuccessorViable(value) {
      successorViable = value;
    },
  };
}

function beginObservedHold(service, startMs = START_MS) {
  service.db.inTransaction = true;
  return service.enforceLeaderDurabilityFitness(startMs);
}

function endObservedHold(service, nowMs) {
  service.db.inTransaction = false;
  return service.enforceLeaderDurabilityFitness(nowMs);
}

function driveTicks(service, fromMs, count) {
  const observations = [];
  for (let index = 0; index < count; index += 1) {
    observations.push(service.enforceLeaderDurabilityFitness(
      fromMs + index * TICK_MS));
  }
  return observations;
}

function driveToUnfit(service) {
  beginObservedHold(service);
  return driveTicks(service, START_MS + LEGAL_HOLD_MS, STRIKE_LIMIT);
}

test('current PartitionService assembly retains the fitness owner and its cadence',
  () => onFixtureLeader(async (leader) => {
    assert.equal(typeof leader.enforceLeaderDurabilityFitness, 'function');
    assert.equal(typeof leader.startPreparedStateHoldTimeoutSweep, 'function');
    assert.equal(typeof leader.runSnapshotCadenceTick, 'function');
    assert.notEqual(leader.preparedStateHoldTimer, null,
      'the live service starts the shared participant/fitness cadence');
    assert.deepEqual(leader.enforceLeaderDurabilityFitness(START_MS), {
      fit: true,
      stuck: false,
      heldMs: 0,
    });
  }));

test('held connection crosses the real policy bound and surfaces typed unsupported ' +
  'candidacy and demotion consequences', () => {
  const fixture = createFitnessFixture();
  fixture.setSuccessorViable(true);

  assert.deepEqual(beginObservedHold(fixture.service), {
    fit: true,
    stuck: false,
    heldMs: 0,
  });
  const legal = driveTicks(fixture.service,
    START_MS + TICK_MS, LEGAL_HOLD_MS / TICK_MS - 1);
  assert.equal(legal.every((observation) => observation.fit === true), true,
    'every tick strictly inside the policy window stays fit');
  assert.equal(fixture.events.length, 0);
  assert.equal(fixture.errors.length, 0);

  const strikes = driveTicks(fixture.service,
    START_MS + LEGAL_HOLD_MS, STRIKE_LIMIT);
  assert.deepEqual(strikes.map((observation) => observation.fit),
    [true, true, false]);
  assert.equal(fixture.service.isLeaderDurabilityUnfit, true);
  assert.equal(fixture.errors[0]?.context?.event, 'wait_bound_spent',
    'the injected bad state is reported as a spent production bound');
  assert.deepEqual(fixture.events[0], {
    partitionId: fixture.service.partitionId,
    replicaId: fixture.service.replicaId,
    reason: 'leader_durability_unfit_transaction_hold',
    strikes: STRIKE_LIMIT,
    role: RaftRole.LEADER,
    successorViable: true,
    heldMs: LEGAL_HOLD_MS + (STRIKE_LIMIT - 1) * TICK_MS,
    candidacyDeferral:
      LEADER_DURABILITY_CONSEQUENCE_OUTCOME.CANDIDACY_DEFERRAL_UNSUPPORTED,
    demotion: LEADER_DURABILITY_CONSEQUENCE_OUTCOME.DEMOTION_UNSUPPORTED,
  });

  const recovered = endObservedHold(fixture.service,
    START_MS + LEGAL_HOLD_MS + STRIKE_LIMIT * TICK_MS);
  assert.equal(recovered.fit, true);
  assert.equal(fixture.service.isLeaderDurabilityUnfit, false);
});

test('closing the signal resets pending strikes and a later hold starts fresh', () => {
  const {events, service} = createFitnessFixture();
  beginObservedHold(service);
  const firstStrike = service.enforceLeaderDurabilityFitness(
    START_MS + LEGAL_HOLD_MS);
  assert.equal(firstStrike.pendingStrikes, 1);
  assert.equal(endObservedHold(service, START_MS + LEGAL_HOLD_MS + TICK_MS).fit,
    true);

  const secondStart = START_MS + LEGAL_HOLD_MS + 2 * TICK_MS;
  beginObservedHold(service, secondStart);
  const secondHold = driveTicks(service, secondStart + LEGAL_HOLD_MS,
    STRIKE_LIMIT - 1);
  assert.deepEqual(secondHold.map((observation) => observation.pendingStrikes),
    [1, 2]);
  assert.equal(events.length, 0,
    'strikes from two separate holds never combine');
});

test('SOLO stays loud and unfit without invoking an impossible handoff', () => {
  const {errors, events, service} = createFitnessFixture({solo: true});
  driveToUnfit(service);
  driveTicks(service,
    START_MS + LEGAL_HOLD_MS + STRIKE_LIMIT * TICK_MS,
    SUCCESSORLESS_FALLBACK_MS / TICK_MS + 5);

  assert.equal(service.isLeaderDurabilityUnfit, true);
  assert.equal(errors[0]?.context?.event, 'wait_bound_spent');
  assert.equal(events.length, 0);
  assert.equal(service.role, RaftRole.LEADER);
});

test('multi-member successorless fallback surfaces typed demotion unavailability', () => {
  const {errors, events, service} = createFitnessFixture();
  const strikes = driveToUnfit(service);
  assert.equal(strikes.at(-1).fit, false);
  assert.equal(events.length, 0,
    'the successorless window does not invoke a handoff early');

  const firstUnfitMs = START_MS + LEGAL_HOLD_MS +
    (STRIKE_LIMIT - 1) * TICK_MS;
  service.enforceLeaderDurabilityFitness(
    firstUnfitMs + SUCCESSORLESS_FALLBACK_MS);
  assert.equal(errors.filter(({context}) =>
    context?.event === 'wait_bound_spent').length, 2,
  'both the held connection and successorless fallback are surfaced');
  assert.deepEqual(events[0], {
    partitionId: service.partitionId,
    replicaId: service.replicaId,
    reason: 'leader_durability_unfit_transaction_hold',
    strikes: STRIKE_LIMIT + 1,
    role: RaftRole.LEADER,
    successorViable: false,
    heldMs: LEGAL_HOLD_MS + (STRIKE_LIMIT - 1) * TICK_MS +
      SUCCESSORLESS_FALLBACK_MS,
    candidacyDeferral:
      LEADER_DURABILITY_CONSEQUENCE_OUTCOME.CANDIDACY_DEFERRAL_UNSUPPORTED,
    demotion: LEADER_DURABILITY_CONSEQUENCE_OUTCOME.DEMOTION_UNSUPPORTED,
  });
  assert.equal(service.role, RaftRole.LEADER,
    'the port does not silently pretend the unsupported demotion occurred');
});

test('a newly viable successor invokes the existing handoff on the next tick', () => {
  const fixture = createFitnessFixture();
  driveToUnfit(fixture.service);
  assert.equal(fixture.events.length, 0);

  fixture.setSuccessorViable(true);
  fixture.service.enforceLeaderDurabilityFitness(
    START_MS + LEGAL_HOLD_MS + STRIKE_LIMIT * TICK_MS);
  assert.equal(fixture.events.length, 1);
  assert.equal(fixture.events[0].successorViable, true);
  assert.equal(fixture.events[0].demotion,
    LEADER_DURABILITY_CONSEQUENCE_OUTCOME.DEMOTION_UNSUPPORTED);
});
