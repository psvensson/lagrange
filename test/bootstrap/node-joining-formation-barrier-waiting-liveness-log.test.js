import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  JOINER_1_NODE_ID,
  JOINER_NODE_IDS,
  SEED_NODE_ID,
  buildFormationBarrierOwner,
  buildFormationCache,
  buildOwnerDerivedStartupAuthoritySnapshot,
  initializeEnvironment,
  resetEnvironment,
} from '../convergence/formation-barrier-test-fixture.js';
import {
  JOINING_DEFAULT,
  JOINING_LOG_MSG,
} from '../../src/bootstrap/node-joining-constants.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  FORMATION_RELEASE_HANDOFF_STATE,
} from '../../src/control-plane/formation-release-handoff-contract.js';

// Deterministic witness for the joiner-waiting-liveness-log quest: during the
// five-node GCP formation runs a joiner legitimately waiting on the
// operation-ledger formation barrier (for the seed's formation-release
// handoff / the priority-recovery drain) printed nothing for tens of seconds,
// so the live log could not tell a stall from an honest wait. The cure is a
// typed still-waiting line emitted by the REAL joining owner
// (NodeJoiningOperationLedgerFormationReadiness.awaitOperationLedgerFormationBarrier)
// on the EXISTING liveness-refresh cadence only, naming the owner's own
// unsatisfied gate and the elapsed ms, plus a rate-limited debug line when the
// gate's evidence advances while it stays unsatisfied. The line is a
// projection of the owner's existing barrier snapshot: no second readiness
// authority, no new timer, no budget change, and the READY instant is
// identical with and without it.
//
// The file uses raw node:test so each top-level scenario is independently
// selectable with --test-name-pattern by its anchored name;
// scripts/quest-evidence-joiner-waiting-liveness-log.js re-runs one scenario
// per receipt.
//
// HONEST SCOPE (real vs modeled):
//   - REAL: the joining owner's barrier loop, its snapshot projection, cohort
//     engagement, liveness-refresh cadence and release decision, over a real
//     SystemTableCache formation shape and the owner-derived startup
//     authority of the fixture.
//   - MODELED: the readiness owner's startup-authority answer over virtual
//     time (ready at startedAt + WAIT_MS; optionally advancing evidence),
//     the virtual clock, the log sink and the liveness publication sink.

// HEAD values of the joining cadence and budgets; the cure must not move them.
const HEAD_FORMATION_DISCOVERY_MS = 5000;
const HEAD_FORMATION_POLL_MS = 500;
const HEAD_FORMATION_TIMEOUT_MS = 120000;
const HEAD_HEARTBEAT_INTERVAL_MS = 5000;

const START_AT = 1000;
const WAIT_MS = 30000;
const LIVENESS_TICKS_IN_WAIT = WAIT_MS / HEAD_HEARTBEAT_INTERVAL_MS;
const HANDOFF_GENERATION = 7;
const SILENT_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});
const EVIDENCE_MODE = Object.freeze({
  STATIC: 'static',
  ADVANCING: 'advancing',
});
const BARRIER_STATE_WAITING_AUTHORITY = 'waiting_for_startup_authority';
const BARRIER_STATE_SATISFIED = 'ledger_spread_satisfied';
const STARTUP_AUTHORITY_STATE_READY = 'ready';
const STARTUP_AUTHORITY_STATE_RECOVERY_PENDING = 'recovery_pending';
const LOG_LEVEL = Object.freeze({DEBUG: 'debug', INFO: 'info'});
const NOT_READY_REASON_CODES = Object.freeze([
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
]);
const REQUIRED_COHORT = Object.freeze([SEED_NODE_ID, ...JOINER_NODE_IDS]);

function pendingCohortAt({now, evidenceMode}) {
  if (evidenceMode === EVIDENCE_MODE.STATIC) {
    return [...JOINER_NODE_IDS];
  }
  // The pending cohort shrinks and refills every poll: evidence that advances
  // on every 500 ms poll while the gate stays unsatisfied.
  const pollIndex = Math.floor((now - START_AT) / HEAD_FORMATION_POLL_MS);
  return JOINER_NODE_IDS.slice(0, pollIndex % JOINER_NODE_IDS.length);
}

function authorityAt({baseAuthority, now, evidenceMode}) {
  const ready = now >= START_AT + WAIT_MS;
  return Object.freeze({
    ...baseAuthority,
    authorityAvailable: true,
    state: ready ?
      STARTUP_AUTHORITY_STATE_READY :
      STARTUP_AUTHORITY_STATE_RECOVERY_PENDING,
    ready,
    priorityRecoveryReasonCodes: ready ? [] : [...NOT_READY_REASON_CODES],
    formationReleaseHandoff: Object.freeze({
      state: FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
      generation: HANDOFF_GENERATION,
      releaseAuthorized: ready,
      requiredCohort: [...REQUIRED_COHORT],
      pendingNodeIds: ready ? [] : pendingCohortAt({now, evidenceMode}),
    }),
  });
}

function recordingLogger(clock, lines) {
  const record = (level) => (message, details) => {
    lines.push({level, message, details, at: clock.now});
  };
  return {
    debug: record(LOG_LEVEL.DEBUG),
    info: record(LOG_LEVEL.INFO),
    warn: record('warn'),
    error: record('error'),
  };
}

/**
 * Drive the REAL barrier loop through one honest wait on a virtual clock.
 * @param {Object} options
 * @return {Promise<Object>}
 */
async function driveHonestWait({
  evidenceMode = EVIDENCE_MODE.STATIC,
  logger = null,
} = {}) {
  initializeEnvironment();
  try {
    const clock = {now: START_AT};
    const lines = [];
    const livenessAt = [];
    const {startupAuthority: baseAuthority} =
      buildOwnerDerivedStartupAuthoritySnapshot();
    const owner = buildFormationBarrierOwner({
      cache: buildFormationCache(),
      now: () => clock.now,
      sleep: async (delayMs) => {
        clock.now += delayMs;
      },
    });
    owner.config = {
      priorityPlacementFormationDiscoveryMs:
        JOINING_DEFAULT.priorityPlacementFormationDiscoveryMs,
      priorityPlacementFormationPollMs:
        JOINING_DEFAULT.priorityPlacementFormationPollMs,
      priorityPlacementFormationTimeoutMs:
        JOINING_DEFAULT.priorityPlacementFormationTimeoutMs,
      heartbeatIntervalMs: JOINING_DEFAULT.heartbeatIntervalMs,
    };
    owner.logger = logger || recordingLogger(clock, lines);
    owner.rebalanceCoordinator.controlPlaneReadinessService
      .getStartupAuthoritySnapshotSync = () =>
        authorityAt({baseAuthority, now: clock.now, evidenceMode});
    owner.sendControlPlaneNodeStateUpdate = async (publication) => {
      livenessAt.push(publication.heartbeatAt);
    };

    await owner.awaitOperationLedgerFormationBarrier();
    const readyAt = clock.now;

    // A second pass with the gate already satisfied on its first poll.
    const linesBeforeSecondPass = lines.length;
    await owner.awaitOperationLedgerFormationBarrier();
    const satisfiedPassLines = lines.slice(linesBeforeSecondPass);
    lines.length = linesBeforeSecondPass;

    return {readyAt, lines, livenessAt, satisfiedPassLines};
  } finally {
    resetEnvironment();
  }
}

function stillWaitingLines(lines) {
  return lines.filter((line) =>
    line.message ===
      JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER_STILL_WAITING);
}

function evidenceAdvanceLines(lines) {
  return lines.filter((line) =>
    line.message ===
      JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER_EVIDENCE_ADVANCED);
}

function stateLines(lines) {
  return lines.filter((line) =>
    line.message === JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER);
}

// The wait-progress fields every line carries besides the gate evidence.
const WAIT_PROGRESS_FIELDS = Object.freeze([
  'nodeId',
  'state',
  'elapsedMs',
  'waitingSinceMs',
  'timeoutRemainingMs',
  'livenessRefreshMs',
]);

function evidenceOf(details) {
  return JSON.stringify(Object.fromEntries(
    Object.entries(details).filter(([key]) =>
      !WAIT_PROGRESS_FIELDS.includes(key)),
  ));
}

function expectedLivenessInstants() {
  return Array.from(
    {length: LIVENESS_TICKS_IN_WAIT},
    (_unused, index) => START_AT + index * HEAD_HEARTBEAT_INTERVAL_MS,
  );
}

test('still-waiting-line-on-liveness-cadence: the real joining owner emits ' +
  'one typed still-waiting line per existing liveness-refresh tick during a ' +
  '30 s honest wait, naming its own unsatisfied gate and the elapsed ms',
async () => {
  const {readyAt, lines, livenessAt} = await driveHonestWait();
  const waiting = stillWaitingLines(lines);

  assert.equal(readyAt, START_AT + WAIT_MS);
  assert.deepEqual(
    waiting.map((line) => line.details.elapsedMs),
    expectedLivenessInstants().map((at) => at - START_AT),
    'one line per liveness-refresh tick: elapsed 0, 5000, ..., 25000 ms',
  );
  assert.deepEqual(
    waiting.map((line) => line.at),
    livenessAt,
    'the still-waiting line rides the exact liveness publication instants',
  );
  for (const line of waiting) {
    assert.equal(line.level, LOG_LEVEL.INFO);
    assert.equal(line.details.nodeId, JOINER_1_NODE_ID);
    assert.equal(line.details.state, BARRIER_STATE_WAITING_AUTHORITY,
      'the typed wait reason is the owner\'s own unsatisfied gate');
    assert.equal(line.details.waitingSinceMs, START_AT);
    assert.equal(line.details.elapsedMs, line.at - START_AT);
    assert.equal(line.details.timeoutRemainingMs,
      HEAD_FORMATION_TIMEOUT_MS - line.details.elapsedMs);
    assert.equal(line.details.livenessRefreshMs, HEAD_HEARTBEAT_INTERVAL_MS);
    assert.equal(line.details.startupAuthorityReady, false);
    assert.equal(line.details.startupAuthorityState,
      STARTUP_AUTHORITY_STATE_RECOVERY_PENDING);
    assert.deepEqual([...line.details.startupAuthorityRecoveryReasonCodes],
      [...NOT_READY_REASON_CODES]);
    assert.equal(line.details.formationReleaseHandoffState,
      FORMATION_RELEASE_HANDOFF_STATE.ACTIVE);
    assert.equal(line.details.formationReleaseHandoffGeneration,
      HANDOFF_GENERATION);
    assert.equal(line.details.formationReleaseHandoffReleaseAuthorized, false);
    assert.deepEqual([...line.details.formationReleaseHandoffPendingNodeIds],
      [...JOINER_NODE_IDS]);
    assert.equal(line.details.candidateNodeCount, REQUIRED_COHORT.length);
  }
});

test('no-line-once-gate-satisfied: no still-waiting line at or after the ' +
  'READY instant, and none at all when the gate is satisfied on the first poll',
async () => {
  const {readyAt, lines, satisfiedPassLines} = await driveHonestWait();

  assert.equal(readyAt, START_AT + WAIT_MS);
  assert.ok(stillWaitingLines(lines).length > 0 ||
    stateLines(lines).length > 0, 'the drive produced barrier lines');
  assert.deepEqual(
    lines.filter((line) => line.at >= readyAt).map((line) => line.message),
    [JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER],
    'the only line at the READY instant is the ledger_spread_satisfied state change',
  );
  assert.equal(stillWaitingLines(satisfiedPassLines).length, 0);
  assert.equal(evidenceAdvanceLines(satisfiedPassLines).length, 0);
  assert.deepEqual(
    satisfiedPassLines.map((line) => line.details.state),
    [BARRIER_STATE_SATISFIED],
  );
});

test('evidence-advance-debug-rate-limited: evidence that changes on every ' +
  'poll while the gate stays unsatisfied yields debug lines rate-limited to ' +
  'one per liveness-refresh window', async () => {
  const {readyAt, lines} = await driveHonestWait({
    evidenceMode: EVIDENCE_MODE.ADVANCING,
  });
  const advances = evidenceAdvanceLines(lines);

  assert.equal(readyAt, START_AT + WAIT_MS);
  assert.ok(advances.length > 0, 'advancing evidence is reported');
  assert.ok(advances.length <= LIVENESS_TICKS_IN_WAIT,
    'at most one evidence-advance line per liveness-refresh window');
  assert.deepEqual(
    advances.map((line) => line.details.elapsedMs),
    [5500, 10500, 15500, 20500, 25500],
    'the first advance after each liveness window is reported, the rest are ' +
      'coalesced',
  );
  for (const [index, line] of advances.entries()) {
    assert.equal(line.level, LOG_LEVEL.DEBUG);
    assert.equal(line.details.state, BARRIER_STATE_WAITING_AUTHORITY);
    assert.equal(line.details.elapsedMs, line.at - START_AT);
    if (index > 0) {
      assert.ok(line.at - advances[index - 1].at >= HEAD_HEARTBEAT_INTERVAL_MS,
        'never two evidence-advance lines closer than one liveness window');
    }
    const previous = lines.filter((candidate) =>
      candidate.at < line.at && candidate.level !== 'warn');
    assert.notEqual(
      evidenceOf(line.details),
      evidenceOf(previous[previous.length - 1].details),
      'each evidence-advance line carries evidence different from the last ' +
        'logged line',
    );
  }
  assert.equal(stillWaitingLines(lines).length, LIVENESS_TICKS_IN_WAIT,
    'advancing evidence does not add or remove still-waiting lines');
});

test('no-evidence-advance-without-change: static evidence for the whole ' +
  'wait emits no evidence-advance line', async () => {
  const {lines} = await driveHonestWait({evidenceMode: EVIDENCE_MODE.STATIC});
  assert.equal(evidenceAdvanceLines(lines).length, 0);
});

test('ready-instant-unchanged: the barrier releases on the exact poll at ' +
  'which the readiness owner\'s authority becomes ready, with the recording ' +
  'logger and with a silent logger alike', async () => {
  const recorded = await driveHonestWait();
  const silent = await driveHonestWait({logger: SILENT_LOGGER});
  const advancing = await driveHonestWait({
    evidenceMode: EVIDENCE_MODE.ADVANCING,
  });

  assert.equal(recorded.readyAt, START_AT + WAIT_MS);
  assert.equal(silent.readyAt, recorded.readyAt);
  assert.equal(advancing.readyAt, recorded.readyAt);
  assert.deepEqual(silent.livenessAt, recorded.livenessAt);
  assert.deepEqual(
    stateLines(recorded.lines).map((line) => line.details.state),
    [BARRIER_STATE_WAITING_AUTHORITY, BARRIER_STATE_SATISFIED],
    'the state-change lines are unchanged: one engagement, one release',
  );
  assert.equal(stateLines(recorded.lines)[1].at, recorded.readyAt);
});

test('budgets-and-cadence-unchanged: the joining cadence and budgets are the ' +
  'HEAD values and the liveness publications land on the HEAD instants',
async () => {
  assert.equal(JOINING_DEFAULT.priorityPlacementFormationDiscoveryMs,
    HEAD_FORMATION_DISCOVERY_MS);
  assert.equal(JOINING_DEFAULT.priorityPlacementFormationPollMs,
    HEAD_FORMATION_POLL_MS);
  assert.equal(JOINING_DEFAULT.priorityPlacementFormationTimeoutMs,
    HEAD_FORMATION_TIMEOUT_MS);
  assert.equal(JOINING_DEFAULT.heartbeatIntervalMs,
    HEAD_HEARTBEAT_INTERVAL_MS);

  const expected = expectedLivenessInstants();
  const staticDrive = await driveHonestWait();
  const advancingDrive = await driveHonestWait({
    evidenceMode: EVIDENCE_MODE.ADVANCING,
  });
  assert.deepEqual(staticDrive.livenessAt, expected);
  assert.deepEqual(advancingDrive.livenessAt, expected);
  assert.equal(staticDrive.readyAt, START_AT + WAIT_MS);
  assert.equal(advancingDrive.readyAt, START_AT + WAIT_MS);
});

test('witness-deterministic: two identical virtual-clock drives produce the ' +
  'identical log line sequence, liveness instants and READY instant',
async () => {
  const first = await driveHonestWait({evidenceMode: EVIDENCE_MODE.ADVANCING});
  const second = await driveHonestWait({
    evidenceMode: EVIDENCE_MODE.ADVANCING,
  });
  assert.equal(first.readyAt, second.readyAt);
  assert.deepEqual(first.livenessAt, second.livenessAt);
  assert.equal(JSON.stringify(first.lines), JSON.stringify(second.lines));
});
