import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REBALANCER_DEFAULT} from '../../src/rebalancer/rebalancer-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  FORMATION_READINESS_BUDGET_MS,
  HEAD_CRITICAL_CHECK_DELAY_MS,
  HEAD_MAX_CONCURRENT_ADDS,
  PRIORITY_RETRY_DELAY_MS,
  QUORUM_CONCENTRATED_REASON,
  SELF_MOVE_ACTIVE_AFTER_ACK_MS,
  SELF_MOVE_CREATE_ACK_MS,
  SELF_MOVE_IN_FLIGHT_REASON,
  SELF_MOVE_TERMINAL_AFTER_ACTIVE_MS,
  SELF_MOVE_WAITING_REASON,
  TARGET_READY_AT_MS,
  runSelfMovePlannedBeforeAddsScenario,
} from './operation-ledger-self-move-hold-engagement-witness-fixture.js';
import {
  CENSUS_OUTCOME,
  CENSUS_READ_FAILS_AT_MS,
  CENSUS_RETRY_CADENCE_MULTIPLIER,
  SELF_MOVE_SENDING_BOUND_MS,
  admittedWithin,
  refusalsWithin,
  runDependentsStreamAfterRegistrationScenario,
} from './operation-ledger-self-move-hold-fairness-witness-fixture.js';

// Deterministic witness for the GCP streak on 4bc6c1d25 (five-node
// formation, 60 s certification window; runs 23-51-32 and 23-58-17 spread
// at 66 s / 83 s, run 23-51-32 admitted a duplicate ledger self-move). The
// scenario, its run-cited numbers and the honest real/modeled scope are
// documented in operation-ledger-self-move-hold-fairness-witness-fixture.js;
// each test below is one quest receipt
// (scripts/quest-evidence-operation-ledger-self-move-hold-fairness.js).

const {DISPATCH_RETRY_DELAY_MS} = OPERATION_WORKFLOW_OWNER_SHARED;
const HEAD_DISPATCH_RETRY_DELAY_MS = 250;
const HEAD_INCOMPLETE_READ_BACKOFF_FLOOR_MS = 250;
const HEAD_INCOMPLETE_READ_BACKOFF_CEILING_MS = 5_000;
const SINGLE_SELF_MOVE = 1;
const SINGLE_FAILURE = 1;
const NO_ADMISSIONS = 0;
const NONE_IN_FLIGHT = 0;
const NO_REFUSALS = 0;
const NO_RELEASES = 0;
const FIRST_INDEX = 0;
const NEXT_INDEX = 1;
// rebalance-coordinator-ledger-interlock-hold-state.js hold phases.
const HOLD_PHASE_REGISTERED = 'registered';
const HOLD_PHASE_ENGAGED = 'engaged';

function describeSelfMove(m) {
  return `self-move: admissible=${m.selfMove.dispatchAdmissibleAtMs} ` +
    `sent=${m.selfMove.sentAtMs} (dependents in flight ` +
    `${m.selfMove.dependentsInFlightAtSend}) acked=${m.selfMove.ackedAtMs} ` +
    `terminal=${m.selfMove.terminalAtMs}; parks=${m.selfMove.parks.length}; ` +
    `READY=${m.startupAuthorityReadyAtMs}; exempt r0 completed=` +
    `${m.exempt.completedAtMs} r1 admitted=${m.exempt.secondRound?.admittedAtMs}`;
}

function describeDependents(dependents) {
  return dependents
    .map((dependent) =>
      `${dependent.tableId}: r0 admitted=${dependent.firstRound.admittedAtMs} ` +
        `completed=${dependent.firstRound.completedAtMs}; r1 admitted=` +
        `${dependent.secondRound.admittedAtMs}; refusals=${JSON.stringify(
          dependent.refusals,
        )}`,
    )
    .join(' | ');
}

function assertSelfMoveLifecycleObserved(m) {
  assert.ok(
    m.selfMove.sentAtMs !== null && m.selfMove.terminalAtMs !== null,
    `the self-move was dispatched and reached terminal (${describeSelfMove(m)})`,
  );
}

test(
  'registered-self-move-engages-on-target-ready-lease: once the target ' +
    'holds a READY lease on the dispatch dimension (bootstrap-exempt while ' +
    'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING) the registered holder is ' +
    'ENGAGED for admission',
  async () => {
    const m = await runDependentsStreamAfterRegistrationScenario();
    assertSelfMoveLifecycleObserved(m);
    const probesBeforeReady = m.dependents.map(
      (dependent) => dependent.firstRound,
    );
    for (const round of probesBeforeReady) {
      assert.ok(
        round.admittedAtMs !== null && round.admittedAtMs < TARGET_READY_AT_MS,
        'a dependent planned before the target READY lease is admitted ' +
          `under the registered holder (${describeDependents(m.dependents)})`,
      );
    }
    assert.equal(
      refusalsWithin(m.dependents, FIRST_INDEX, TARGET_READY_AT_MS).length,
      NO_REFUSALS,
      'no dependent is refused while the holder is only registered ' +
        `(${describeDependents(m.dependents)})`,
    );
    const firstProbeAfterReady = refusalsWithin(
      m.dependents,
      TARGET_READY_AT_MS,
      m.selfMove.sentAtMs,
    )[FIRST_INDEX];
    assert.ok(
      firstProbeAfterReady !== undefined,
      'dependent admission was probed between the target READY lease and ' +
        `the self-move claim (${describeDependents(m.dependents)})`,
    );
    assert.equal(
      firstProbeAfterReady.holderPhase,
      HOLD_PHASE_ENGAGED,
      'the seed\'s holder is ENGAGED at the first admission probe after the ' +
        `target READY lease, before the durable claim (${JSON.stringify(
          firstProbeAfterReady,
        )}; ${describeSelfMove(m)})`,
    );
    assert.equal(
      m.extras.targetReadinessAtEngagement?.dimensions?.[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ],
      false,
      'the target was still PRIORITY_CONTROL_PLANE_RECOVERY_PENDING ' +
        '(controlPlaneRecoveryEligible false) at engagement: the READY ' +
        'lease on the dispatch dimension, not recovery eligibility, engages ' +
        `the hold (${JSON.stringify(m.extras.targetReadinessAtEngagement)})`,
    );
  },
);

test(
  'newer-dependents-refused-after-engagement: every dependent planned after ' +
    'engagement is refused operation_ledger_self_move_in_flight until the ' +
    'self-move terminal while the exempt emergency re-plan admits',
  async () => {
    const m = await runDependentsStreamAfterRegistrationScenario();
    assertSelfMoveLifecycleObserved(m);
    const engagedWindowRefusals = refusalsWithin(
      m.dependents,
      TARGET_READY_AT_MS,
      m.selfMove.terminalAtMs,
    );
    assert.ok(
      engagedWindowRefusals.length > NO_REFUSALS,
      'dependents were re-planned while the self-move was engaged ' +
        `(${describeDependents(m.dependents)})`,
    );
    assert.deepEqual(
      [...new Set(engagedWindowRefusals.map((refusal) => refusal.reason))],
      [SELF_MOVE_IN_FLIGHT_REASON],
      'every dependent planned after engagement was refused only by the ' +
        `engaged self-move hold (${JSON.stringify(engagedWindowRefusals)})`,
    );
    assert.deepEqual(
      [...new Set(engagedWindowRefusals.map((refusal) => refusal.holderPhase))],
      [HOLD_PHASE_ENGAGED],
      'the holder was ENGAGED at every refusal after the target READY lease ' +
        `(${JSON.stringify(engagedWindowRefusals)})`,
    );
    assert.deepEqual(
      admittedWithin(m.dependents, TARGET_READY_AT_MS, m.selfMove.terminalAtMs),
      [],
      'no dependent was admitted between engagement and the self-move ' +
        `terminal (${describeDependents(m.dependents)})`,
    );
    assert.ok(
      m.exempt.secondRound?.admittedAtMs !== null &&
        m.exempt.secondRound.refusals.length === NO_REFUSALS,
      'the exempt emergency re-plan (control_plane_publications) admits ' +
        'regardless of the engaged hold, per the EXEMPT row of the hold ' +
        `relation (${JSON.stringify(m.exempt.secondRound)})`,
    );
  },
);

test(
  'incumbents-drain-then-self-move-claims: the self-move claims as soon as ' +
    'the incumbents admitted before engagement drain (SENDING by +32 s) and ' +
    'the joiners are READY inside the 60 s budget',
  async () => {
    const m = await runDependentsStreamAfterRegistrationScenario();
    assertSelfMoveLifecycleObserved(m);
    const lastIncumbentCompletionMs = Math.max(
      m.exempt.completedAtMs,
      ...m.dependents.map((dependent) => dependent.firstRound.completedAtMs),
    );
    assert.ok(
      m.selfMove.sentAtMs >= lastIncumbentCompletionMs,
      'the self-move was sent only after every incumbent admitted before ' +
        `engagement completed at ${lastIncumbentCompletionMs} ms (${
          describeSelfMove(m)
        })`,
    );
    assert.equal(
      m.selfMove.dependentsInFlightAtSend,
      NONE_IN_FLIGHT,
      `no dependent ADD row was non-terminal at send (${describeSelfMove(m)})`,
    );
    assert.ok(
      m.selfMove.sentAtMs <= SELF_MOVE_SENDING_BOUND_MS,
      `the self-move is SENDING by ${SELF_MOVE_SENDING_BOUND_MS} ms (observed ` +
        `${m.selfMove.sentAtMs} ms; ${describeSelfMove(m)})`,
    );
    assert.ok(
      m.startupAuthorityReadyAtMs !== null &&
        m.startupAuthorityReadyAtMs <= FORMATION_READINESS_BUDGET_MS,
      `startup authority READY within ${FORMATION_READINESS_BUDGET_MS} ms of ` +
        `the self-move creation (observed ${m.startupAuthorityReadyAtMs} ms; ` +
        `${describeSelfMove(m)})`,
    );
  },
);

test(
  'single-non-terminal-ledger-self-move: the orphan-reservation release on ' +
    'a null point read and a non-holder terminal row never release the ' +
    'held self-move nor admit a second ledger self-move',
  async () => {
    const m = await runDependentsStreamAfterRegistrationScenario();
    assertSelfMoveLifecycleObserved(m);
    assert.ok(
      m.extras.reconcile !== null &&
        m.extras.reconcile.orphansReleased > NO_RELEASES,
      'the real reservation reconciliation released the self-move\'s ' +
        `reservation as an orphan on the null point read (${JSON.stringify(
          m.extras.reconcile,
        )})`,
    );
    assert.ok(
      m.extras.reconcile.atMs < m.selfMove.terminalAtMs,
      'the injected sequence ran while the held self-move was non-terminal ' +
        `(${JSON.stringify(m.extras.reconcile)}; ${describeSelfMove(m)})`,
    );
    assert.equal(
      m.extras.secondSelfMove.admittedAtMs,
      null,
      'the second ledger REPLACE planned after the orphan release and the ' +
        `non-holder terminal read was not admitted (${JSON.stringify(
          m.extras.secondSelfMove,
        )})`,
    );
    assert.deepEqual(
      m.extras.secondSelfMove.refusals.map((refusal) => refusal.reason),
      [SELF_MOVE_WAITING_REASON],
      'the second self-move was refused by the interlock as ' +
        `${SELF_MOVE_WAITING_REASON} (${JSON.stringify(m.extras.secondSelfMove)})`,
    );
    assert.equal(
      m.extras.maxNonTerminalLedgerSelfMoves,
      SINGLE_SELF_MOVE,
      'at most one ledger self-move was non-terminal at any sampled instant ' +
        `(observed ${m.extras.maxNonTerminalLedgerSelfMoves})`,
    );
    assert.notEqual(
      m.extras.secondSelfMove.holderPhaseAfter,
      HOLD_PHASE_REGISTERED,
      'the held self-move was not released back to a registered second ' +
        `holder (${JSON.stringify(m.extras.secondSelfMove)})`,
    );
  },
);

test(
  'failed-census-retries-on-dispatch-cadence: a failed cluster-wide idle ' +
    'census re-reads within the dispatch-retry cadence, not the ' +
    'incomplete-read backoff',
  async () => {
    const m = await runDependentsStreamAfterRegistrationScenario();
    const attempts = m.extras.census.attempts;
    const failedIndex = attempts.findIndex(
      (attempt) => attempt.outcome === CENSUS_OUTCOME.FAILED,
    );
    assert.ok(
      failedIndex >= FIRST_INDEX &&
        attempts[failedIndex].atMs >= CENSUS_READ_FAILS_AT_MS,
      `one census read failed at/after ${CENSUS_READ_FAILS_AT_MS} ms (${
        JSON.stringify(attempts)
      })`,
    );
    assert.equal(
      attempts.filter((attempt) => attempt.outcome === CENSUS_OUTCOME.FAILED)
        .length,
      SINGLE_FAILURE,
      'exactly one census read failed',
    );
    const failed = attempts[failedIndex];
    assert.ok(
      failed.retryAfterMs > CENSUS_RETRY_CADENCE_MULTIPLIER * DISPATCH_RETRY_DELAY_MS,
      'the failed read carried the repository\'s incomplete-read backoff ' +
        `hint (${failed.retryAfterMs} ms), larger than the dispatch cadence`,
    );
    const next = attempts[failedIndex + NEXT_INDEX];
    assert.ok(
      next !== undefined,
      `the census was re-read after the failure (${JSON.stringify(attempts)})`,
    );
    assert.ok(
      next.atMs - failed.atMs <=
        CENSUS_RETRY_CADENCE_MULTIPLIER * DISPATCH_RETRY_DELAY_MS,
      `the re-read followed within ${CENSUS_RETRY_CADENCE_MULTIPLIER} x ` +
        `DISPATCH_RETRY_DELAY_MS (${DISPATCH_RETRY_DELAY_MS} ms) of the ` +
        `failure (observed ${next.atMs - failed.atMs} ms; ${JSON.stringify(
          {failed, next},
        )})`,
    );
  },
);

test(
  'exclusion-and-idle-only-preserved: dependents are refused only by the ' +
    'engaged hold, the self-move parks waiting_for_idle_ledger while ' +
    'incumbents are in flight, and quorum_concentrated still refuses',
  async () => {
    const m = await runDependentsStreamAfterRegistrationScenario({
      withDuplicateSelfMoveInjection: false,
    });
    assertSelfMoveLifecycleObserved(m);
    const liveWindowRefusals = refusalsWithin(
      m.dependents,
      m.selfMove.sentAtMs,
      m.selfMove.terminalAtMs,
    );
    assert.deepEqual(
      liveWindowRefusals.filter(
        (refusal) => refusal.reason !== SELF_MOVE_IN_FLIGHT_REASON,
      ),
      [],
      'while the self-move is live every dependent refusal is ' +
        `${SELF_MOVE_IN_FLIGHT_REASON} (${JSON.stringify(liveWindowRefusals)})`,
    );
    assert.equal(
      admittedWithin(m.dependents, m.selfMove.sentAtMs, m.selfMove.terminalAtMs)
        .length,
      NO_ADMISSIONS,
      'no dependent was admitted while the self-move was live',
    );
    assert.ok(
      m.selfMove.parks.some(
        (park) =>
          park.reason === SELF_MOVE_WAITING_REASON &&
          park.dependentsInFlight > NONE_IN_FLIGHT,
      ),
      'with incumbents in flight the owner parked the self-move as ' +
        `${SELF_MOVE_WAITING_REASON} (${describeSelfMove(m)})`,
    );
    assert.equal(
      m.selfMove.dependentsInFlightAtSend,
      NONE_IN_FLIGHT,
      'IDLE_ONLY at dispatch: no dependent row was non-terminal at send',
    );
    const base = await runSelfMovePlannedBeforeAddsScenario();
    const concentratedWindowRefusals = refusalsWithin(
      base.dependents,
      base.selfMove.terminalAtMs,
      base.ledger.removeCompletedAtMs,
    );
    assert.ok(
      concentratedWindowRefusals.some(
        (refusal) => refusal.reason === QUORUM_CONCENTRATED_REASON,
      ),
      'the quorum-spread hold still defers dependents as ' +
        `${QUORUM_CONCENTRATED_REASON} while the ledger is concentrated (${
          JSON.stringify(concentratedWindowRefusals)
        })`,
    );
  },
);

test(
  'budgets-and-cadence-unchanged: maxConcurrentAdds, CRITICAL_CHECK_DELAY_MS, ' +
    'DISPATCH_RETRY_DELAY_MS, the incomplete-read backoff bounds, the 60 s ' +
    'budget and the self-move lifecycle latencies are the HEAD values',
  async () => {
    assert.equal(
      REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS,
      HEAD_MAX_CONCURRENT_ADDS,
      'REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS is unchanged',
    );
    assert.equal(
      REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS,
      HEAD_CRITICAL_CHECK_DELAY_MS,
      'REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS is unchanged',
    );
    assert.equal(
      DISPATCH_RETRY_DELAY_MS,
      HEAD_DISPATCH_RETRY_DELAY_MS,
      'DISPATCH_RETRY_DELAY_MS is unchanged',
    );
    const m = await runDependentsStreamAfterRegistrationScenario({
      withDuplicateSelfMoveInjection: false,
    });
    assertSelfMoveLifecycleObserved(m);
    assert.deepEqual(
      m.extras.census.backoffBounds,
      {
        floorMs: HEAD_INCOMPLETE_READ_BACKOFF_FLOOR_MS,
        ceilingMs: HEAD_INCOMPLETE_READ_BACKOFF_CEILING_MS,
      },
      'the repository\'s incomplete-read backoff floor/ceiling are unchanged',
    );
    assert.equal(
      m.budget.maxConcurrentAdds,
      HEAD_MAX_CONCURRENT_ADDS,
      'the real coordinator runs with the unchanged maxConcurrentAdds budget',
    );
    assert.equal(
      m.selfMove.terminalAtMs - m.selfMove.sentAtMs,
      SELF_MOVE_CREATE_ACK_MS +
        SELF_MOVE_ACTIVE_AFTER_ACK_MS +
        SELF_MOVE_TERMINAL_AFTER_ACTIVE_MS,
      'the self-move lifecycle from send to terminal is exactly the run\'s ' +
        'latency (no shortening, no sleeping)',
    );
    for (const dependent of m.dependents) {
      const {refusals} = dependent;
      for (let index = NEXT_INDEX; index < refusals.length; index += NEXT_INDEX) {
        const gapMs =
          refusals[index].atMs - refusals[index - NEXT_INDEX].resolvedAtMs;
        assert.ok(
          gapMs <= PRIORITY_RETRY_DELAY_MS,
          `${dependent.tableId}: each re-attempt follows the previous ` +
            'refusal within one unchanged priority retry cadence (gap ' +
            `${gapMs} ms at ${refusals[index].atMs} ms)`,
        );
      }
    }
  },
);

test(
  'witness-deterministic: the fairness drive is deterministic across runs',
  async () => {
    const a = await runDependentsStreamAfterRegistrationScenario();
    const b = await runDependentsStreamAfterRegistrationScenario();
    assert.deepEqual(
      a.events,
      b.events,
      'identical virtual drive -> identical admission/dispatch event sequence',
    );
    assert.equal(
      a.startupAuthorityReadyAtMs,
      b.startupAuthorityReadyAtMs,
      'identical READY instant across runs',
    );
  },
);
