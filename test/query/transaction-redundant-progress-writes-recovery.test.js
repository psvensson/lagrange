/**
 * Quest transaction-redundant-progress-writes, recovery regression net.
 * Written against the unchanged tree and green there; each must stay green
 * after the ACTIVE participant row is removed, so every assertion names only
 * durable facts both trees produce. (The live in-doubt sweep witness of
 * stage 0 belonged to the deferred PREPARED-status removal; it is kept as
 * text in evidence/deferred-prepared-status-removal.md.)
 *
 * A coordinator stops (a hold that is never released) during a statement or
 * the COMMIT of a write transaction; a new coordinator over the same durable rows
 * recovers it through the production startup path. Each case ends in
 * exactly one consistent outcome: every participant applied one decision,
 * the recorded one, and no participant session is left open.
 *
 * World: test/query/transaction-progress-write-witness-support.js.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  isDecisionWrite,
  isManifestFreezeWrite,
  nthParticipantRowWrite,
  participantDeliveryOf,
  runBeginNotDeliveredCrashScenario,
  runCrashScenario,
} from './transaction-progress-write-witness-support.js';

const TWO_TABLES = Object.freeze(['users', 'orders']);
const RECOVERED_ONCE = Object.freeze({totalRecovered: 1, resumed: 1,
  failed: 0});

function settledAs(decision) {
  const participantStatus = decision === 'COMMIT' ? 'COMMITTED' :
    'ROLLED_BACK';
  return {
    replay: RECOVERED_ONCE,
    decision,
    status: participantStatus,
    participantRowStatuses: [participantStatus, participantStatus],
    participantDecisions: [[decision], [decision]],
    orphanedSessions: [],
    violations: [],
  };
}

for (const withoutParticipantRows of [false, true]) {
  test('restart after the manifest append and before PREPARE ' +
    `(${withoutParticipantRows ? 'no participant row exists' :
      'participant rows as written'}): past the deadline recovery records ` +
    'one bound ROLLBACK for every manifest member', async () => {
    const facts = await runCrashScenario({tables: TWO_TABLES,
      mutationHold: isManifestFreezeWrite, pastDeadline: true,
      withoutParticipantRows});
    assert.deepEqual({stopped: facts.stopped, writes: facts.writes,
      participantSetState: facts.atStop.participantSetState,
      decision: facts.atStop.decision,
      manifestMembers: facts.atStop.manifestMembers}, {
      stopped: true, writes: [true, true], participantSetState: 'OPEN',
      decision: null, manifestMembers: 2,
    });
    if (withoutParticipantRows) {
      assert.deepEqual(facts.atStop.participantRows, []);
    }
    assert.deepEqual(facts.recovery, settledAs('ROLLBACK'));
  });
}

test('restart after the PREPARE evidence and before the decision: past the ' +
  'deadline recovery commits every participant once, bound to its digest',
async () => {
  const facts = await runCrashScenario({tables: TWO_TABLES,
    mutationHold: isDecisionWrite, pastDeadline: true});
  assert.deepEqual({stopped: facts.stopped,
    participantSetState: facts.atStop.participantSetState,
    decision: facts.atStop.decision,
    participantRows: facts.atStop.participantRows}, {
    stopped: true, participantSetState: 'FROZEN', decision: null,
    participantRows: [{status: 'PREPARED', hasDigest: true},
      {status: 'PREPARED', hasDigest: true}],
  });
  assert.deepEqual(facts.recovery, settledAs('COMMIT'));
});

test('restart with PREPARE evidence retained for one participant only: ' +
  'past the deadline recovery rolls both back', async () => {
  const facts = await runCrashScenario({tables: TWO_TABLES,
    mutationHold: nthParticipantRowWrite('PREPARED', 2), pastDeadline: true});
  assert.equal(facts.stopped, true);
  assert.equal(facts.atStop.participantSetState, 'FROZEN');
  assert.equal(facts.atStop.participantRows.filter((row) =>
    row.status === 'PREPARED' && row.hasDigest).length, 1);
  assert.deepEqual(facts.recovery, settledAs('ROLLBACK'));
});

test('restart after the decision and before participant COMMIT: recovery ' +
  'drives the recorded COMMIT to every participant exactly once', async () => {
  const facts = await runCrashScenario({tables: TWO_TABLES,
    deliveryHold: participantDeliveryOf('COMMIT')});
  assert.deepEqual({stopped: facts.stopped,
    participantSetState: facts.atStop.participantSetState,
    decision: facts.atStop.decision}, {
    stopped: true, participantSetState: 'FROZEN', decision: 'COMMIT',
  });
  assert.deepEqual(facts.recovery, settledAs('COMMIT'));
});

test('restart after the manifest append and before the participant BEGIN ' +
  'is delivered: past the deadline the never-begun member receives one ' +
  'bound ROLLBACK (its tombstone)', async () => {
  const facts = await runBeginNotDeliveredCrashScenario({tables: TWO_TABLES});
  assert.deepEqual({stopped: facts.stopped, atStop: facts.atStop,
    begins: facts.begins}, {
    stopped: true,
    atStop: {participantSetState: 'OPEN', decision: null, manifestMembers: 1},
    begins: [0],
  });
  assert.deepEqual(facts.recovery, {
    replay: RECOVERED_ONCE,
    decision: 'ROLLBACK',
    status: 'ROLLED_BACK',
    participantRowStatuses: ['ROLLED_BACK'],
    participantDecisions: [['ROLLBACK']],
    orphanedSessions: [],
    violations: [],
  });
});
