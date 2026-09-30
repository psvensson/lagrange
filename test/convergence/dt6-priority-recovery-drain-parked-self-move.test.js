import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REBALANCER_DEFAULT} from '../../src/rebalancer/rebalancer-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED} from '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {
  FORMATION_READINESS_BUDGET_MS,
  HEAD_CRITICAL_CHECK_DELAY_MS,
  HEAD_MAX_CONCURRENT_ADDS,
  SELF_MOVE_ACTIVE_AFTER_ACK_MS,
  SELF_MOVE_CREATE_ACK_MS,
  SELF_MOVE_IN_FLIGHT_REASON,
  SELF_MOVE_TERMINAL_AFTER_ACTIVE_MS,
  SELF_MOVE_WAITING_REASON,
  TARGET_READY_AT_MS,
} from './operation-ledger-self-move-hold-engagement-witness-fixture.js';
import {
  admittedWithin,
  refusalsWithin,
} from './operation-ledger-self-move-hold-fairness-witness-fixture.js';
import {
  DISPATCH_LANE,
  DRAIN_FIRST_SWEEP_AT_MS,
  DRAIN_SWEEP_INTERVAL_MS,
  runParkedSelfMoveDrainScenario,
} from './priority-recovery-drain-parked-self-move-witness-fixture.js';

// Deterministic witness for GCP runs 2026-08-30T04-49-12 and 07-06-30:
// the target's own priority-recovery drain stale-FAILED the ledger self-move
// it had parked at the IDLE_ONLY census behind live incumbents (age 33.6 s /
// 39.8 s, ownerState local_owner), costing a re-plan and a successor. The
// scenario, its run-cited instants and the honest real/modeled scope are
// documented in priority-recovery-drain-parked-self-move-witness-fixture.js;
// each test below is one quest receipt
// (scripts/quest-evidence-priority-recovery-drain-parked-self-move-progress.js).

const {
  DISPATCH_RETRY_DELAY_MS,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
} = OPERATION_WORKFLOW_OWNER_SHARED;
const {
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION,
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE,
} = OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED;
const HEAD_DISPATCH_RETRY_DELAY_MS = 250;
const HEAD_PENDING_TIMEOUT_MS = 30_000;
const HEAD_TIMEOUT_CHECK_INTERVAL_MS = 1_000;
// control-plane/priority-recovery-completion.js completion state the run's
// settle carried (completionState converged).
const COMPLETION_CONVERGED = 'converged';
// operation-workflow-ledger-self-move-park-evidence.js typed members
// (OPERATION_LEDGER_SELF_MOVE_PARK_EVIDENCE_STATE / _PARK_KIND), spelled
// here so the witness still loads on HEAD, where the module does not exist.
const PARK_EVIDENCE_FRESH = 'fresh';
const PARK_EVIDENCE_EXPIRED = 'expired';
const PARK_EVIDENCE_ABSENT = 'absent';
const PARK_KIND_WAITING_FOR_INCUMBENT = 'waiting_for_incumbent';
// operation-workflow-dispatch-ledger-self-move-gate.js
// OPERATION_LEDGER_SELF_MOVE_HOLD_ENGAGEMENT.ENGAGED and
// rebalance-coordinator-ledger-interlock-hold-state.js hold phase.
const ENGAGEMENT_ENGAGED = 'engaged';
const HOLD_PHASE_ENGAGED = 'engaged';
// Cadence tolerance: one dispatch retry plus the drive's clock granularity.
const CADENCE_MULTIPLIER = 2;
const SINGLE_SELF_MOVE = 1;
const SINGLE_ENGAGEMENT = 1;
const NO_SWEEPS = 0;
const NO_PARKS = 0;
const NO_REFUSALS = 0;
const NO_ADMISSIONS = 0;
const NONE_IN_FLIGHT = 0;
const FIRST_INDEX = 0;
const NEXT_INDEX = 1;

function describeSelfMove(m) {
  return `self-move: parks=${m.extras.parks.length} sent=${m.selfMove.sentAtMs} ` +
    `acked=${m.selfMove.ackedAtMs} terminal=${m.selfMove.terminalAtMs} ` +
    `claim=${JSON.stringify(m.extras.claim)} failure=${JSON.stringify(
      m.extras.failure,
    )}; sweeps=${JSON.stringify(
      m.extras.targetSweeps.map((sweep) => [
        sweep.atMs,
        sweep.snapshot.state,
        sweep.snapshot.ownerState,
        sweep.evidence.state,
        sweep.evidence.ageMs,
        sweep.rowAfter?.step,
      ]),
    )}; READY=${m.startupAuthorityReadyAtMs}`;
}

function assertSweepsObserved(m) {
  assert.ok(
    m.extras.targetSweeps.length > NO_SWEEPS &&
      m.extras.targetSweeps[FIRST_INDEX].atMs === DRAIN_FIRST_SWEEP_AT_MS,
    `the target's drain swept A from ${DRAIN_FIRST_SWEEP_AT_MS} ms (${
      describeSelfMove(m)
    })`,
  );
}

function assertParkedLaneRecovering(sweep, m) {
  assert.deepEqual(
    [
      sweep.snapshot.state,
      sweep.snapshot.action,
      sweep.snapshot.ownerState,
      sweep.snapshot.ownerAction,
      sweep.entered,
      sweep.rowAfter?.step,
    ],
    [
      PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.RECOVERING_DISPATCH_PARKED,
      OPERATION_LIFECYCLE_ACTION.NOOP,
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.LOCAL_LANE_PARKED,
      PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.SKIP_LOCAL_PARKED_LANE,
      false,
      WORKFLOW_STEP.PENDING,
    ],
    `the sweep at ${sweep.atMs} ms classified the parked self-move ` +
      'recovering (NOOP, local lane parked, lifecycle skipped, row PENDING) ' +
      `(${JSON.stringify(sweep)}; ${describeSelfMove(m)})`,
  );
}

test(
  'parked-local-self-move-with-fresh-park-evidence-is-recovering: every ' +
    'drain sweep of the locally-owned self-move parked behind a live ' +
    'incumbent reads fresh waiting_for_incumbent park evidence and settles ' +
    'recovering_dispatch_parked, never stale',
  async () => {
    const m = await runParkedSelfMoveDrainScenario();
    assertSweepsObserved(m);
    const incumbentId = m.extras.parks[FIRST_INDEX]?.evidence
      ?.incumbentOperationIds?.[FIRST_INDEX];
    for (const sweep of m.extras.targetSweeps) {
      assert.deepEqual(
        [sweep.snapshot.completionState, sweep.snapshot.sourceState],
        [
          COMPLETION_CONVERGED,
          PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE
            .RETIREMENT_UNPROVEN_STALE,
        ],
        `the sweep at ${sweep.atMs} ms saw the run's shape (completion ` +
          'converged, source retirement_unproven_stale: a stale pre-sync ' +
          `REPLACE by the step-age rule) (${JSON.stringify(sweep)})`,
      );
      assert.ok(
        sweep.evidence.state === PARK_EVIDENCE_FRESH &&
          sweep.evidence.kind === PARK_KIND_WAITING_FOR_INCUMBENT &&
          typeof incumbentId === 'string' &&
          sweep.evidence.incumbentOperationIds.includes(incumbentId) &&
          sweep.evidence.ageMs < sweep.evidence.boundMs &&
          sweep.evidence.ageMs <= CADENCE_MULTIPLIER * DISPATCH_RETRY_DELAY_MS &&
          sweep.evidence.boundMs === m.extras.pendingTimeoutMs,
        `the sweep at ${sweep.atMs} ms read fresh park evidence (kind ` +
          `${PARK_KIND_WAITING_FOR_INCUMBENT}, the census incumbent, age ` +
          'within one dispatch cadence, bound = the PENDING step budget) ' +
          `(${JSON.stringify(sweep.evidence)})`,
      );
      assertParkedLaneRecovering(sweep, m);
    }
  },
);

test(
  'no-stale-fail-while-park-evidence-fresh: the parked self-move is never ' +
    'settled fail_priority_recovery_drain_stale while its lane parks, ' +
    'reaches its own terminal and the joiners are READY inside 60 s',
  async () => {
    const m = await runParkedSelfMoveDrainScenario();
    assertSweepsObserved(m);
    assert.equal(
      m.extras.failure,
      null,
      `no failOperation of the self-move on the target (${describeSelfMove(m)})`,
    );
    assert.deepEqual(
      m.extras.targetSweeps.filter(
        (sweep) =>
          sweep.snapshot.action ===
          OPERATION_LIFECYCLE_ACTION.FAIL_PRIORITY_RECOVERY_DRAIN_STALE,
      ),
      [],
      `no sweep produced the stale FAIL action (${describeSelfMove(m)})`,
    );
    assert.ok(
      m.selfMove.sentAtMs !== null && m.selfMove.terminalAtMs !== null,
      `the self-move was sent and reached its own terminal (${describeSelfMove(m)})`,
    );
    assert.ok(
      m.startupAuthorityReadyAtMs !== null &&
        m.startupAuthorityReadyAtMs <= FORMATION_READINESS_BUDGET_MS,
      `startup authority READY within ${FORMATION_READINESS_BUDGET_MS} ms ` +
        `(observed ${m.startupAuthorityReadyAtMs} ms; ${describeSelfMove(m)})`,
    );
  },
);

test(
  'self-move-claims-on-incumbent-terminal-without-successor: the self-move ' +
    'claims SENDING through the existing engagement within one dispatch ' +
    'cadence of the incumbent\'s terminal; no re-plan, no successor',
  async () => {
    const m = await runParkedSelfMoveDrainScenario();
    assertSweepsObserved(m);
    const claim = m.extras.claim;
    assert.ok(
      claim !== null &&
        claim.incumbentCompletedAtMs !== null &&
        claim.atMs >= claim.incumbentCompletedAtMs &&
        claim.atMs - claim.incumbentCompletedAtMs <=
          CADENCE_MULTIPLIER * DISPATCH_RETRY_DELAY_MS &&
        claim.atMs === m.selfMove.sentAtMs,
      'the self-move claimed SENDING within ' +
        `${CADENCE_MULTIPLIER} x DISPATCH_RETRY_DELAY_MS of the incumbent's ` +
        `terminal (${JSON.stringify(claim)}; ${describeSelfMove(m)})`,
    );
    const engagedForSelfMove = m.extras.engagements.filter(
      (engagement) =>
        engagement.engagement === ENGAGEMENT_ENGAGED &&
        engagement.operationId === m.extras.ledgerSelfMoveIds[FIRST_INDEX],
    );
    assert.equal(
      engagedForSelfMove.length,
      SINGLE_ENGAGEMENT,
      'the claim went through exactly one ENGAGED engagement of the ' +
        `target's hold (${JSON.stringify(m.extras.engagements)})`,
    );
    assert.equal(
      m.extras.holderAtSend?.phase,
      HOLD_PHASE_ENGAGED,
      `the hold was engaged at send (${JSON.stringify(m.extras.holderAtSend)})`,
    );
    assert.equal(
      m.extras.ledgerSelfMoveIds.length,
      SINGLE_SELF_MOVE,
      'exactly one ledger self-move row ever existed: no successor was ' +
        `planned (${JSON.stringify(m.extras.ledgerSelfMoveIds)})`,
    );
  },
);

function assertSilentLaneStaleFailsAtEvidenceExpiry(silent) {
  const silencedAtMs = silent.extras.laneSilencedAtMs;
  const expiryAtMs = silencedAtMs + silent.extras.pendingTimeoutMs;
  const freshSweeps = silent.extras.targetSweeps.filter(
    (sweep) => sweep.atMs < expiryAtMs,
  );
  assert.ok(
    freshSweeps.length > NO_SWEEPS,
    `sweeps ran while the silent lane's evidence was fresh (${
      describeSelfMove(silent)
    })`,
  );
  for (const sweep of freshSweeps) {
    assert.equal(
      sweep.evidence.state,
      PARK_EVIDENCE_FRESH,
      `park evidence still fresh at ${sweep.atMs} ms (${JSON.stringify(sweep)})`,
    );
    assertParkedLaneRecovering(sweep, silent);
  }
  const expiredSweep = silent.extras.targetSweeps.find(
    (sweep) => sweep.atMs >= expiryAtMs,
  );
  assert.deepEqual(
    [
      expiredSweep?.atMs,
      expiredSweep?.evidence.state,
      expiredSweep?.evidence.ageMs >= expiredSweep?.evidence.boundMs,
      expiredSweep?.snapshot.action,
      expiredSweep?.rowAfter?.step,
      silent.extras.failure?.atMs,
    ],
    [
      expiryAtMs,
      PARK_EVIDENCE_EXPIRED,
      true,
      OPERATION_LIFECYCLE_ACTION.FAIL_PRIORITY_RECOVERY_DRAIN_STALE,
      WORKFLOW_STEP.FAILED,
      expiryAtMs,
    ],
    `the lane silent since ${silencedAtMs} ms was stale-failed on the ` +
      `first sweep at ${expiryAtMs} ms, its last park a full ` +
      `PENDING_TIMEOUT_MS old (${JSON.stringify(expiredSweep)}; ${
        describeSelfMove(silent)
      })`,
  );
}

test(
  'parked-self-move-without-park-evidence-still-stale-fails: a PENDING ' +
    'self-move whose lane never parked stale-fails at its step timeout, and ' +
    'a lane silent since its first park stale-fails on the first sweep ' +
    'after its last park is a full PENDING_TIMEOUT_MS old',
  async () => {
    const neverRan = await runParkedSelfMoveDrainScenario({
      dispatchLane: DISPATCH_LANE.NEVER_RAN,
    });
    assertSweepsObserved(neverRan);
    const firstSweep = neverRan.extras.targetSweeps[FIRST_INDEX];
    assert.deepEqual(
      [
        neverRan.extras.parks.length,
        firstSweep.evidence.state,
        firstSweep.snapshot.state,
        firstSweep.snapshot.action,
        firstSweep.snapshot.ownerState,
        firstSweep.rowAfter?.step,
        neverRan.extras.failure?.error,
      ],
      [
        NO_PARKS,
        PARK_EVIDENCE_ABSENT,
        PRIORITY_RECOVERY_OPERATION_DRAIN_STATE
          .STALE_WITHOUT_RETIREMENT_EVIDENCE,
        OPERATION_LIFECYCLE_ACTION.FAIL_PRIORITY_RECOVERY_DRAIN_STALE,
        PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.LOCAL_OWNER,
        WORKFLOW_STEP.FAILED,
        OPERATION_WORKFLOW_OWNER_LITERAL
          .PRIORITY_RECOVERY_DRAIN_STALE_WITHOUT_RETIREMENT_EVIDENCE,
      ],
      'without park evidence the first sweep past PENDING_TIMEOUT_MS ' +
        'settled the self-move fail_priority_recovery_drain_stale exactly ' +
        `as the run did (${describeSelfMove(neverRan)})`,
    );
    const silent = await runParkedSelfMoveDrainScenario({
      dispatchLane: DISPATCH_LANE.SILENT_AFTER_FIRST_PARK,
    });
    assertSweepsObserved(silent);
    assertSilentLaneStaleFailsAtEvidenceExpiry(silent);
  },
);

test(
  'remote-owner-drain-rule-unchanged: the seed\'s (non-owner) drain holds no ' +
    'park evidence, wakes the available remote owner and never settles the ' +
    'parked self-move',
  async () => {
    const m = await runParkedSelfMoveDrainScenario();
    const seedSweep = m.extras.seedSweep;
    assert.ok(
      seedSweep !== null &&
        seedSweep.atMs === DRAIN_FIRST_SWEEP_AT_MS &&
        seedSweep.evidence.state !== PARK_EVIDENCE_FRESH &&
        seedSweep.snapshot.action === OPERATION_LIFECYCLE_ACTION.NOOP &&
        seedSweep.snapshot.ownerState ===
          PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE
            .REMOTE_REARM_REQUIRED &&
        seedSweep.snapshot.ownerAction ===
          PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.WAKE_REMOTE_OWNER &&
        seedSweep.woken === true &&
        seedSweep.entered === false,
      'the seed\'s drain woke the remote owner (no fresh park evidence of ' +
        `its own, NOOP, lifecycle skipped) (${JSON.stringify(seedSweep)})`,
    );
  },
);

test(
  'idle-only-exclusion-and-terminal-release-preserved: the self-move parks ' +
    'waiting_for_idle_ledger while incumbents are in flight, dependents are ' +
    'refused only by the engaged hold until its terminal, and the hold is ' +
    'engaged from the claim through the terminal',
  async () => {
    const m = await runParkedSelfMoveDrainScenario();
    assert.ok(
      m.selfMove.parks.some(
        (park) =>
          park.reason === SELF_MOVE_WAITING_REASON &&
          park.dependentsInFlight > NONE_IN_FLIGHT,
      ),
      'with incumbents in flight the owner parked the self-move as ' +
        `${SELF_MOVE_WAITING_REASON} (${describeSelfMove(m)})`,
    );
    assert.ok(
      m.selfMove.sentAtMs >= m.exempt.completedAtMs &&
        m.selfMove.dependentsInFlightAtSend === NONE_IN_FLIGHT,
      'IDLE_ONLY at dispatch: sent only after the incumbent completed at ' +
        `${m.exempt.completedAtMs} ms with no dependent row non-terminal (${
          describeSelfMove(m)
        })`,
    );
    const engagedWindowRefusals = refusalsWithin(
      m.dependents,
      TARGET_READY_AT_MS,
      m.selfMove.terminalAtMs,
    );
    assert.ok(
      engagedWindowRefusals.length > NO_REFUSALS &&
        engagedWindowRefusals.every(
          (refusal) => refusal.reason === SELF_MOVE_IN_FLIGHT_REASON,
        ),
      'every dependent re-planned between engagement and the self-move ' +
        `terminal was refused ${SELF_MOVE_IN_FLIGHT_REASON} (${JSON.stringify(
          engagedWindowRefusals,
        )})`,
    );
    assert.equal(
      admittedWithin(m.dependents, TARGET_READY_AT_MS, m.selfMove.terminalAtMs)
        .length,
      NO_ADMISSIONS,
      'no dependent was admitted between engagement and the terminal',
    );
    assert.ok(
      m.extras.holderAtSend?.phase === HOLD_PHASE_ENGAGED &&
        m.extras.holderAtTerminal?.phase === HOLD_PHASE_ENGAGED &&
        m.extras.holderAtTerminal.operationId ===
          m.extras.ledgerSelfMoveIds[FIRST_INDEX],
      'the target\'s hold stayed engaged for the self-move from the claim ' +
        `through its terminal instant (${JSON.stringify({
          atSend: m.extras.holderAtSend,
          atTerminal: m.extras.holderAtTerminal,
        })})`,
    );
    assert.ok(
      m.dependents.every(
        (dependent) =>
          dependent.secondRound.admittedAtMs !== null &&
          dependent.secondRound.admittedAtMs >= m.selfMove.terminalAtMs,
      ),
      'the dependents\' second spread round was admitted only after the ' +
        `self-move terminal (${JSON.stringify(
          m.dependents.map((dependent) => dependent.secondRound.admittedAtMs),
        )})`,
    );
  },
);

test(
  'budgets-and-cadence-unchanged: maxConcurrentAdds, CRITICAL_CHECK_DELAY_MS, ' +
    'DISPATCH_RETRY_DELAY_MS, PENDING_TIMEOUT_MS, TIMEOUT_CHECK_INTERVAL_MS, ' +
    'the park and sweep cadences and the self-move lifecycle latencies are ' +
    'the HEAD values',
  async () => {
    assert.deepEqual(
      [
        REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS,
        REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS,
        DISPATCH_RETRY_DELAY_MS,
        REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS,
        REBALANCER_DEFAULT.COORDINATOR.TIMEOUT_CHECK_INTERVAL_MS,
        DRAIN_SWEEP_INTERVAL_MS,
      ],
      [
        HEAD_MAX_CONCURRENT_ADDS,
        HEAD_CRITICAL_CHECK_DELAY_MS,
        HEAD_DISPATCH_RETRY_DELAY_MS,
        HEAD_PENDING_TIMEOUT_MS,
        HEAD_TIMEOUT_CHECK_INTERVAL_MS,
        HEAD_TIMEOUT_CHECK_INTERVAL_MS,
      ],
      'the budgets and cadences are unchanged',
    );
    const m = await runParkedSelfMoveDrainScenario();
    assertSweepsObserved(m);
    assert.equal(
      m.extras.pendingTimeoutMs,
      HEAD_PENDING_TIMEOUT_MS,
      'the real target runs with the unchanged PENDING_TIMEOUT_MS',
    );
    assert.equal(
      m.budget.maxConcurrentAdds,
      HEAD_MAX_CONCURRENT_ADDS,
      'the real coordinator runs with the unchanged maxConcurrentAdds budget',
    );
    const {parks, targetSweeps} = m.extras;
    for (let index = NEXT_INDEX; index < parks.length; index += NEXT_INDEX) {
      const gapMs = parks[index].atMs - parks[index - NEXT_INDEX].atMs;
      assert.ok(
        gapMs <= CADENCE_MULTIPLIER * DISPATCH_RETRY_DELAY_MS,
        `each park re-drive follows within ${CADENCE_MULTIPLIER} x ` +
          `DISPATCH_RETRY_DELAY_MS (gap ${gapMs} ms at ${parks[index].atMs} ms)`,
      );
    }
    for (
      let index = NEXT_INDEX;
      index < targetSweeps.length;
      index += NEXT_INDEX
    ) {
      assert.equal(
        targetSweeps[index].atMs - targetSweeps[index - NEXT_INDEX].atMs,
        DRAIN_SWEEP_INTERVAL_MS,
        'the drain sweeps on the unchanged TIMEOUT_CHECK_INTERVAL_MS cadence',
      );
    }
    assert.equal(
      m.selfMove.terminalAtMs - m.selfMove.sentAtMs,
      SELF_MOVE_CREATE_ACK_MS +
        SELF_MOVE_ACTIVE_AFTER_ACK_MS +
        SELF_MOVE_TERMINAL_AFTER_ACTIVE_MS,
      'the self-move lifecycle from send to terminal is exactly the run\'s ' +
        'latency (no shortening, no sleeping)',
    );
  },
);

test(
  'witness-deterministic: the parked-self-move drain drive is deterministic ' +
    'across runs',
  async () => {
    const a = await runParkedSelfMoveDrainScenario();
    const b = await runParkedSelfMoveDrainScenario();
    assert.deepEqual(
      a.events,
      b.events,
      'identical virtual drive -> identical park/sweep/dispatch event sequence',
    );
    assert.equal(
      a.startupAuthorityReadyAtMs,
      b.startupAuthorityReadyAtMs,
      'identical READY instant across runs',
    );
  },
);
