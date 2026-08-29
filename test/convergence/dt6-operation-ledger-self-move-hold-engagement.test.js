import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REBALANCER_DEFAULT} from '../../src/rebalancer/rebalancer-constants.js';
import {
  DEPENDENTS_PLANNED_AT_MS,
  FORMATION_READINESS_BUDGET_MS,
  HEAD_CRITICAL_CHECK_DELAY_MS,
  HEAD_MAX_CONCURRENT_ADDS,
  PRIORITY_ADD_BUDGET_LIMIT,
  PRIORITY_RETRY_DELAY_MS,
  QUORUM_CONCENTRATED_REASON,
  SELF_MOVE_ACTIVE_AFTER_ACK_MS,
  SELF_MOVE_CREATE_ACK_MS,
  SELF_MOVE_IN_FLIGHT_REASON,
  SELF_MOVE_TERMINAL_AFTER_ACTIVE_MS,
  SELF_MOVE_WAITING_REASON,
  runSelfMovePlannedBeforeAddsScenario,
} from './operation-ledger-self-move-hold-engagement-witness-fixture.js';

// Deterministic witness for the GCP streak on 675d6b512 (five-node formation,
// 60 s certification window): the replica_operations ledger self-move's DEFER
// hold engaged at createOperation and excluded every dependent priority ADD
// while the target-owned self-move waited for its target to be READY. The
// cure engages the hold at dispatch admissibility. The scenario, its
// run-cited numbers and the honest real/modeled scope are documented in
// operation-ledger-self-move-hold-engagement-witness-fixture.js; each test
// below is one quest receipt
// (scripts/quest-evidence-operation-ledger-self-move-hold-engagement.js).

const FIRST_INDEX = 0;
const NO_REFUSALS = 0;
const NONE_IN_FLIGHT = 0;
const SINGLE_OPERATION = 1;

function describeDependents(dependents) {
  return dependents
    .map((dependent) =>
      `${dependent.tableId}: r0 admitted=${dependent.firstRound.admittedAtMs} ` +
        `created=${dependent.firstRound.createdAtMs} ` +
        `sent=${dependent.firstRound.sentAtMs} ` +
        `acked=${dependent.firstRound.ackedAtMs} ` +
        `completed=${dependent.firstRound.completedAtMs}; ` +
        `r1 admitted=${dependent.secondRound.admittedAtMs} ` +
        `completed=${dependent.secondRound.completedAtMs}; ` +
        `refusals=${JSON.stringify(dependent.refusals)}`,
    )
    .join(' | ');
}

function describeSelfMove(m) {
  return `self-move: admissible=${m.selfMove.dispatchAdmissibleAtMs} ` +
    `firstAttempt=${m.selfMove.firstDispatchAttemptAtMs} ` +
    `sent=${m.selfMove.sentAtMs} ` +
    `(dependents in flight ${m.selfMove.dependentsInFlightAtSend}) ` +
    `acked=${m.selfMove.ackedAtMs} terminal=${m.selfMove.terminalAtMs}; ` +
    `parks=${JSON.stringify(m.selfMove.parks)}; ` +
    `ledger add created=${m.ledger.addCreatedAtMs} ` +
    `completed=${m.ledger.addCompletedAtMs}, remove created=` +
    `${m.ledger.removeCreatedAtMs} completed=${m.ledger.removeCompletedAtMs} ` +
    `refusals=${JSON.stringify(m.ledger.removeRefusals)}; ` +
    `READY=${m.startupAuthorityReadyAtMs}`;
}

function refusalsWithin(dependents, fromMs, toMs) {
  return dependents.flatMap((dependent) =>
    dependent.refusals
      .filter((refusal) => refusal.atMs >= fromMs && refusal.atMs < toMs)
      .map((refusal) => ({tableId: dependent.tableId, ...refusal})),
  );
}

function admittedInstantsOf(dependents) {
  return dependents.flatMap((dependent) =>
    [dependent.firstRound, dependent.secondRound]
      .filter((round) => round.admittedAtMs !== null)
      .map((round) => ({tableId: dependent.tableId, atMs: round.admittedAtMs})),
  );
}

function assertSelfMoveLifecycleObserved(m) {
  assert.ok(
    m.selfMove.dispatchAdmissibleAtMs !== null &&
      m.selfMove.sentAtMs !== null &&
      m.selfMove.terminalAtMs !== null,
    `the self-move was dispatched by its owner and reached terminal (${
      describeSelfMove(m)
    })`,
  );
}

test(
  'self-move-exclusion-once-live-preserved: from the instant the self-move ' +
    'is dispatch-admissible until its terminal every dependent admission is ' +
    'refused with operation_ledger_self_move_in_flight and none is admitted',
  async () => {
    const m = await runSelfMovePlannedBeforeAddsScenario();
    assertSelfMoveLifecycleObserved(m);
    const liveWindowRefusals = refusalsWithin(
      m.dependents,
      m.selfMove.dispatchAdmissibleAtMs,
      m.selfMove.terminalAtMs,
    );
    assert.ok(
      liveWindowRefusals.length > NO_REFUSALS,
      'dependent admission was probed while the self-move was live ' +
        `(${describeDependents(m.dependents)})`,
    );
    assert.deepEqual(
      [...new Set(liveWindowRefusals.map((refusal) => refusal.reason))],
      [SELF_MOVE_IN_FLIGHT_REASON],
      'every dependent attempt while the self-move was live was refused ' +
        `only with ${SELF_MOVE_IN_FLIGHT_REASON} (${JSON.stringify(
          liveWindowRefusals,
        )})`,
    );
    const admittedWhileLive = admittedInstantsOf(m.dependents).filter(
      (created) =>
        created.atMs >= m.selfMove.dispatchAdmissibleAtMs &&
        created.atMs < m.selfMove.terminalAtMs,
    );
    assert.deepEqual(
      admittedWhileLive,
      [],
      'no dependent was admitted between the self-move becoming ' +
        `dispatch-admissible and its terminal (${describeSelfMove(m)})`,
    );
  },
);

test(
  'idle-only-admission-preserved: the self-move is never dispatched while a ' +
    'dependent is in flight; with dependents live at its dispatch attempt it ' +
    'waits as operation_ledger_self_move_waiting_for_idle_ledger',
  async () => {
    const m = await runSelfMovePlannedBeforeAddsScenario();
    assertSelfMoveLifecycleObserved(m);
    assert.equal(
      m.selfMove.dependentsInFlightAtSend,
      NONE_IN_FLIGHT,
      'no dependent ADD row was non-terminal when CREATE_REPLICA was sent ' +
        `(${describeSelfMove(m)})`,
    );
    for (const dependent of m.dependents) {
      for (const round of [dependent.firstRound, dependent.secondRound]) {
        assert.ok(
          round.admittedAtMs === null ||
            round.completedAtMs === null ||
            round.completedAtMs <= m.selfMove.sentAtMs ||
            round.admittedAtMs >= m.selfMove.terminalAtMs,
          `${dependent.tableId}: no dependent lifetime overlaps the ` +
            `self-move's dispatched lifetime (${describeDependents(
              m.dependents,
            )}; ${describeSelfMove(m)})`,
        );
      }
    }
    const dependentsLiveAtFirstAttempt = m.dependents.some(
      (dependent) =>
        dependent.firstRound.admittedAtMs !== null &&
        dependent.firstRound.admittedAtMs <=
          m.selfMove.firstDispatchAttemptAtMs &&
        (dependent.firstRound.completedAtMs === null ||
          dependent.firstRound.completedAtMs >
            m.selfMove.firstDispatchAttemptAtMs),
    );
    if (dependentsLiveAtFirstAttempt) {
      assert.ok(
        m.selfMove.parks.some(
          (park) =>
            park.reason === SELF_MOVE_WAITING_REASON &&
            park.dependentsInFlight > NONE_IN_FLIGHT,
        ),
        'with dependents in flight the owner parked the self-move as ' +
          `${SELF_MOVE_WAITING_REASON} (${describeSelfMove(m)})`,
      );
    }
  },
);

test(
  'quorum-concentrated-deferral-preserved: after the self-move terminal, ' +
    'while the ledger quorum stays concentrated and spreadable, dependent ' +
    'admission defers as operation_ledger_quorum_concentrated',
  async () => {
    const m = await runSelfMovePlannedBeforeAddsScenario();
    assertSelfMoveLifecycleObserved(m);
    assert.ok(
      m.ledger.addCompletedAtMs !== null &&
        m.ledger.removeCompletedAtMs !== null,
      `the ledger spread ADD and surplus REMOVE completed (${describeSelfMove(m)})`,
    );
    const concentratedWindowRefusals = refusalsWithin(
      m.dependents,
      m.selfMove.terminalAtMs,
      m.ledger.removeCompletedAtMs,
    );
    assert.ok(
      concentratedWindowRefusals.some(
        (refusal) => refusal.reason === QUORUM_CONCENTRATED_REASON,
      ),
      'at least one dependent attempt after the terminal was deferred as ' +
        `${QUORUM_CONCENTRATED_REASON} (${JSON.stringify(
          concentratedWindowRefusals,
        )})`,
    );
    const foreignReasons = concentratedWindowRefusals.filter(
      (refusal) =>
        refusal.reason !== QUORUM_CONCENTRATED_REASON &&
        refusal.reason !== SELF_MOVE_IN_FLIGHT_REASON,
    );
    assert.deepEqual(
      foreignReasons,
      [],
      'between the terminal and the surplus REMOVE completion dependents ' +
        'were deferred only by the quorum-spread hold or the REMOVE ' +
        `self-move (${JSON.stringify(concentratedWindowRefusals)})`,
    );
    const admittedWhileConcentrated = admittedInstantsOf(m.dependents).filter(
      (created) =>
        created.atMs >= m.selfMove.terminalAtMs &&
        created.atMs < m.ledger.removeCompletedAtMs,
    );
    assert.deepEqual(
      admittedWhileConcentrated,
      [],
      'no dependent was admitted while the ledger quorum was concentrated ' +
        `(${describeSelfMove(m)})`,
    );
  },
);

test(
  'dependents-admitted-before-self-move-dispatch-admissible: the four ' +
    'dependent priority ADDs planned 3.5 s after the self-move are admitted ' +
    'before its target is READY, and the self-move dispatches only after ' +
    'they drain',
  async () => {
    const m = await runSelfMovePlannedBeforeAddsScenario();
    assertSelfMoveLifecycleObserved(m);
    for (const dependent of m.dependents) {
      assert.ok(
        dependent.firstRound.admittedAtMs !== null &&
          dependent.firstRound.admittedAtMs < m.selfMove.dispatchAdmissibleAtMs,
        `${dependent.tableId}: first spread ADD admitted before the ` +
          `self-move was dispatch-admissible at ${
            m.selfMove.dispatchAdmissibleAtMs
          } ms (${describeDependents(m.dependents)})`,
      );
      assert.equal(
        dependent.refusals.filter(
          (refusal) => refusal.atMs < m.selfMove.dispatchAdmissibleAtMs,
        ).length,
        NO_REFUSALS,
        `${dependent.tableId}: never refused before the self-move was ` +
          `dispatch-admissible (${describeDependents(m.dependents)})`,
      );
      assert.ok(
        dependent.firstRound.completedAtMs !== null &&
          dependent.firstRound.completedAtMs <= m.selfMove.sentAtMs,
        `${dependent.tableId}: completed before the self-move was sent ` +
          `(IDLE_ONLY at dispatch; ${describeSelfMove(m)})`,
      );
    }
    assert.ok(
      m.exempt.createdAtMs !== null &&
        m.exempt.createdAtMs < m.selfMove.dispatchAdmissibleAtMs,
      `the exempt emergency ADD was admitted at ${m.exempt.createdAtMs} ms`,
    );
  },
);

test(
  'dependents-acked-within-contract-bound: the dependent ADDs are ' +
    'acknowledged within their planning instant plus one priority retry ' +
    'cadence plus one measured single-operation latency',
  async () => {
    const m = await runSelfMovePlannedBeforeAddsScenario();
    assert.ok(
      m.dependents.length + SINGLE_OPERATION <= PRIORITY_ADD_BUDGET_LIMIT,
      `${m.dependents.length} dependents plus the exempt ADD fit the ` +
        `priority add budget of ${PRIORITY_ADD_BUDGET_LIMIT}`,
    );
    const acked = m.dependents.filter(
      (dependent) => dependent.firstRound.ackedAtMs !== null,
    );
    assert.equal(
      acked.length,
      m.dependents.length,
      `every dependent ADD is dispatched and acknowledged (${describeDependents(
        m.dependents,
      )})`,
    );
    const ackedAt = acked
      .map((dependent) => dependent.firstRound.ackedAtMs)
      .sort((left, right) => left - right);
    const firstAckMs = ackedAt[FIRST_INDEX];
    const lastAckMs = ackedAt[ackedAt.length - SINGLE_OPERATION];
    // Contract bound (same derivation as the sibling cadence witness, anchored
    // on the planning instant since nothing may hold the dependents before
    // the self-move is dispatch-admissible): every dependent is admitted
    // concurrently within the budget on its first attempt or within one retry
    // cadence, so the last acknowledgement lands within one operation's own
    // admission+dispatch latency plus one priority retry cadence. The single
    // operation latency is measured in this same run on the exempt emergency
    // ADD planned at the same instant, which no ledger hold may ever defer.
    assert.ok(
      m.exempt.ackedAtMs !== null,
      `the exempt ADD was acknowledged (created ${m.exempt.createdAtMs} ms)`,
    );
    const singleOperationLatencyMs = m.exempt.ackedAtMs - DEPENDENTS_PLANNED_AT_MS;
    const boundMs =
      DEPENDENTS_PLANNED_AT_MS + PRIORITY_RETRY_DELAY_MS + singleOperationLatencyMs;
    assert.ok(
      lastAckMs <= boundMs,
      `the last dependent ADD is acknowledged within the bound ${boundMs} ms ` +
        `(observed ${lastAckMs} ms; first ack ${firstAckMs} ms; exempt ack ` +
        `${m.exempt.ackedAtMs} ms; ${describeDependents(m.dependents)})`,
    );
  },
);

test(
  'joiners-ready-within-60s-budget: the joiners\' startup authority reaches ' +
    'READY within the formation certification budget, on the last spread ' +
    'completion it depends on',
  async () => {
    const m = await runSelfMovePlannedBeforeAddsScenario();
    assert.ok(
      m.startupAuthorityReadyAtMs !== null,
      'the owner-derived startup authority reaches READY ' +
        `(state ${m.startupAuthority?.state}, reasons ${JSON.stringify(
          m.startupAuthority?.priorityRecoveryReasonCodes,
        )}; ${describeSelfMove(m)})`,
    );
    assert.ok(
      m.startupAuthorityReadyAtMs <= FORMATION_READINESS_BUDGET_MS,
      `startup authority READY within ${FORMATION_READINESS_BUDGET_MS} ms of ` +
        `the self-move creation (observed ${m.startupAuthorityReadyAtMs} ms; ` +
        `${describeSelfMove(m)}; ${describeDependents(m.dependents)})`,
    );
    const lastRequiredCompletionMs = Math.max(
      m.ledger.addCompletedAtMs,
      m.exempt.completedAtMs,
      ...m.dependents.map((dependent) => dependent.firstRound.completedAtMs),
    );
    assert.equal(
      m.startupAuthorityReadyAtMs,
      lastRequiredCompletionMs,
      'READY follows the last required spread completion immediately ' +
        `(${describeSelfMove(m)})`,
    );
  },
);

test(
  'budgets-and-cadence-unchanged: maxConcurrentAdds, CRITICAL_CHECK_DELAY_MS ' +
    'and the self-move lifecycle latencies are the HEAD values; refusals ' +
    'keep the unchanged priority retry cadence',
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
    const m = await runSelfMovePlannedBeforeAddsScenario();
    assertSelfMoveLifecycleObserved(m);
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
      for (let index = SINGLE_OPERATION; index < refusals.length; index += 1) {
        const gapMs =
          refusals[index].atMs - refusals[index - SINGLE_OPERATION].resolvedAtMs;
        assert.ok(
          gapMs <= PRIORITY_RETRY_DELAY_MS,
          `${dependent.tableId}: each re-attempt follows the previous ` +
            'refusal within one unchanged priority retry cadence (gap ' +
            `${gapMs} ms at ${refusals[index].atMs} ms; the completion wake ` +
            'may only shorten it)',
        );
      }
    }
  },
);

test(
  'witness-deterministic: the formation drive is deterministic across runs',
  async () => {
    const a = await runSelfMovePlannedBeforeAddsScenario();
    const b = await runSelfMovePlannedBeforeAddsScenario();
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
