import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REBALANCER_DEFAULT} from '../../src/rebalancer/rebalancer-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {
  FORMATION_READINESS_BUDGET_MS,
  HEAD_CRITICAL_CHECK_DELAY_MS,
  HEAD_MAX_CONCURRENT_ADDS,
  PRIORITY_RETRY_DELAY_MS,
  SELF_MOVE_IN_FLIGHT_REASON,
  SELF_MOVE_WAITING_REASON,
} from './operation-ledger-self-move-hold-engagement-witness-fixture.js';
import {
  CENSUS_RETRY_CADENCE_MULTIPLIER,
  DRAIN_SETTLES_HOLDER_AT_MS,
  HOLDER_PROBE,
  HOLD_NOT_ENGAGED_MESSAGE_PREFIX,
  LOCAL_SETTLEMENT_AT_MS,
  STALE_CLAIM_REDRIVE_AT_MS,
  SUCCESSOR_PLANNED_AT_MS,
  admittedWithin,
  refusalsWithin,
  runClaimRefusedThenLocalSettlementScenario,
  runFailedHolderDoesNotStarveSuccessorScenario,
  runLiveSendingHolderProbeScenario,
} from './operation-ledger-self-move-hold-fairness-witness-fixture.js';

// Deterministic witness for GCP run 2026-08-30T04-49-12 (forensics
// barrier-not-released.md): on the dispatching node the ledger self-move
// interlock's HELD_BY_OTHER was a memory, never a read, so the re-planned
// REPLACE 4f30c060 parked held_by_other 41 times behind the drain-failed
// 691efb46 whose FAILED row already existed. The scenarios, their run-cited
// instants and the honest real/modeled scope are documented in
// operation-ledger-self-move-hold-fairness-witness-fixture.js; each test
// below is one quest receipt
// (scripts/quest-evidence-operation-ledger-self-move-holder-release-on-engagement.js).

const {DISPATCH_RETRY_DELAY_MS} = OPERATION_WORKFLOW_OWNER_SHARED;
const HEAD_DISPATCH_RETRY_DELAY_MS = 250;
const HEAD_PENDING_TIMEOUT_MS = 30_000;
const HEAD_INCOMPLETE_READ_BACKOFF_FLOOR_MS = 250;
const HEAD_INCOMPLETE_READ_BACKOFF_CEILING_MS = 5_000;
// operation-workflow-transition-orchestration.js
// buildPriorityDispatchClaimRetryableError (the run's claim message).
const CLAIM_PRESSURE_MESSAGE_FRAGMENT = 'control_plane_pressure_degraded';
// operation-workflow-dispatch-ledger-self-move-gate.js
// OPERATION_LEDGER_SELF_MOVE_HOLD_ENGAGEMENT members.
const ENGAGEMENT_ENGAGED = 'engaged';
const ENGAGEMENT_HELD_BY_OTHER = 'held_by_other';
// rebalance-coordinator-ledger-interlock-hold-state.js hold phases and the
// operation-ledger-hold-policy.js hold action a terminal holder resolves to.
const HOLD_PHASE_NONE = 'none';
const HOLD_PHASE_ENGAGED = 'engaged';
const HOLD_ACTION_RELEASE = 'release';
const SINGLE_READ = 1;
const SINGLE_ATTEMPT = 1;
const NO_READS = 0;
const NO_PARKS = 0;
const NO_RELEASES = 0;
const NO_ADMISSIONS = 0;
const NONE_IN_FLIGHT = 0;
const FIRST_INDEX = 0;
const NEXT_INDEX = 1;
const UNRESOLVED_READ_PROBES = Object.freeze([
  HOLDER_PROBE.EMPTY_READ,
  HOLDER_PROBE.FAILED_READ,
]);

function describeSuccessor(m) {
  const successor = m.extras.successor;
  return `successor ${successor.operationId}: planned=${successor.plannedAtMs} ` +
    `created=${successor.createdAtMs} sent=${m.selfMove.sentAtMs} ` +
    `terminal=${m.selfMove.terminalAtMs} READY=${m.startupAuthorityReadyAtMs}; ` +
    `parks=${successor.parks.length} (first ${JSON.stringify(
      successor.parks[FIRST_INDEX] || null,
    )}); refusals=${JSON.stringify(successor.refusals)}`;
}

function successorEngagements(m) {
  return m.extras.engagements.filter(
    (attempt) => attempt.operationId === m.extras.successor.operationId,
  );
}

function heldByOtherParks(m) {
  return m.extras.successor.parks.filter((park) =>
    String(park.errorMessage).startsWith(HOLD_NOT_ENGAGED_MESSAGE_PREFIX),
  );
}

function probeOf(m, probe) {
  return m.extras.probes.find((observation) => observation.probe === probe);
}

function assertDrainSettledPredecessor(m) {
  const settlement = m.extras.drainSettlement;
  assert.ok(
    settlement !== null &&
      settlement.committed === true &&
      settlement.row?.step === WORKFLOW_STEP.FAILED &&
      settlement.atMs === DRAIN_SETTLES_HOLDER_AT_MS,
    'the target\'s drain settled the predecessor FAILED at ' +
      `${DRAIN_SETTLES_HOLDER_AT_MS} ms (${JSON.stringify(settlement)})`,
  );
}

function assertStaleClaimRetainedPredecessor(m) {
  const staleClaim = m.extras.staleClaim;
  assert.ok(
    staleClaim !== null &&
      staleClaim.atMs === STALE_CLAIM_REDRIVE_AT_MS &&
      String(staleClaim.error).includes(CLAIM_PRESSURE_MESSAGE_FRAGMENT) &&
      staleClaim.row?.step === WORKFLOW_STEP.FAILED &&
      staleClaim.holderAfter.operationId !== null,
    'the predecessor\'s stale claim attempt engaged the target\'s hold and ' +
      'was refused against its FAILED row with the run\'s message, the ' +
      `holder id retained (${JSON.stringify(staleClaim)})`,
  );
  return staleClaim.holderAfter.operationId;
}

function assertPredecessorFailedBeforeSuccessor(m) {
  assertDrainSettledPredecessor(m);
  const predecessorId = assertStaleClaimRetainedPredecessor(m);
  const successor = m.extras.successor;
  assert.ok(
    successor.createdAtMs === SUCCESSOR_PLANNED_AT_MS &&
      successor.operationId !== null &&
      successor.operationId !== predecessorId,
    'the seed re-planned the REPLACE as a distinct successor at ' +
      `${SUCCESSOR_PLANNED_AT_MS} ms (${describeSuccessor(m)})`,
  );
  return predecessorId;
}

test(
  'engagement-resolves-stale-holder-through-lifecycle-read: the successor\'s ' +
    'first engagement on the dispatching node resolves the retained ' +
    'drain-failed holder through exactly one lifecycle read (RELEASE) and ' +
    'engages',
  async () => {
    const m = await runFailedHolderDoesNotStarveSuccessorScenario();
    const predecessorId = assertPredecessorFailedBeforeSuccessor(m);
    const first = successorEngagements(m)[FIRST_INDEX];
    assert.ok(
      first !== undefined && first.holderBefore.operationId === predecessorId,
      'the successor reached the engagement point while the drain-failed ' +
        `predecessor was the retained holder (${JSON.stringify(first)})`,
    );
    assert.equal(
      first.engagement,
      ENGAGEMENT_ENGAGED,
      'the first engagement of the successor engaged instead of ' +
        `held_by_other (${JSON.stringify(first)})`,
    );
    assert.deepEqual(
      first.interlockReads.map((read) => [read.operationId, read.action]),
      [[predecessorId, HOLD_ACTION_RELEASE]],
      'the engagement resolved the holder through exactly one lifecycle ' +
        `read of the holder that released it (${JSON.stringify(first)})`,
    );
    assert.deepEqual(
      first.holderAfter,
      {operationId: m.extras.successor.operationId, phase: HOLD_PHASE_ENGAGED},
      `the successor is the engaged holder after engagement (${JSON.stringify(
        first,
      )})`,
    );
    assert.equal(
      m.extras.interlockReads.length,
      SINGLE_READ,
      'the dispatching node issued no lifecycle read beyond that one ' +
        `(${JSON.stringify(m.extras.interlockReads)})`,
    );
  },
);

test(
  'local-terminal-settlement-clears-own-registration: the holder\'s own ' +
    'drain-stale failOperation on the dispatching node clears its retained ' +
    'registration at the commit; the successor then engages without a read',
  async () => {
    const m = await runClaimRefusedThenLocalSettlementScenario();
    const settlement = m.extras.localSettlement;
    assert.ok(
      settlement !== null &&
        settlement.atMs === LOCAL_SETTLEMENT_AT_MS &&
        settlement.committed === true &&
        settlement.row?.step === WORKFLOW_STEP.FAILED &&
        settlement.ageMs >= m.extras.pendingTimeoutMs,
      'the target\'s drain settled the live predecessor FAILED at ' +
        `${LOCAL_SETTLEMENT_AT_MS} ms, past PENDING_TIMEOUT_MS (${JSON.stringify(
          settlement,
        )})`,
    );
    assert.ok(
      settlement.holderBefore.operationId !== null &&
        m.extras.refusedClaimWrites > NO_PARKS,
      'the predecessor was the retained holder after its refused claims ' +
        `(${JSON.stringify(settlement)}; refused writes ${
          m.extras.refusedClaimWrites
        })`,
    );
    assert.deepEqual(
      settlement.holderAfter,
      {operationId: null, phase: HOLD_PHASE_NONE},
      'the holder\'s own committed terminal cleared its registration ' +
        `(${JSON.stringify(settlement)})`,
    );
    const first = successorEngagements(m)[FIRST_INDEX];
    assert.ok(
      first !== undefined &&
        first.engagement === ENGAGEMENT_ENGAGED &&
        first.holderBefore.operationId === null &&
        first.interlockReads.length === NO_READS,
      'the successor engaged on its first attempt against no holder, ' +
        `without a lifecycle read (${JSON.stringify(first)})`,
    );
    assert.equal(
      m.selfMove.sentAtMs,
      m.extras.successor.createdAtMs,
      `the successor was sent at its first attempt (${describeSuccessor(m)})`,
    );
  },
);

test(
  'successor-claims-first-attempt-after-predecessor-terminal: the ' +
    're-planned REPLACE is SENDING on its first engagement attempt after ' +
    'the predecessor\'s terminal row, never parks held_by_other, and the ' +
    'spread is satisfied inside the 60 s window',
  async () => {
    const m = await runFailedHolderDoesNotStarveSuccessorScenario();
    assertPredecessorFailedBeforeSuccessor(m);
    assert.deepEqual(
      heldByOtherParks(m),
      [],
      `the successor never parked held_by_other (${describeSuccessor(m)})`,
    );
    assert.equal(
      successorEngagements(m).length,
      SINGLE_ATTEMPT,
      `the successor engaged exactly once (${JSON.stringify(
        successorEngagements(m),
      )})`,
    );
    assert.equal(
      m.selfMove.sentAtMs,
      m.extras.successor.createdAtMs,
      'the successor claimed SENDING on its first attempt, at its creation ' +
        `instant (${describeSuccessor(m)})`,
    );
    assert.ok(
      m.startupAuthorityReadyAtMs !== null &&
        m.startupAuthorityReadyAtMs <= FORMATION_READINESS_BUDGET_MS,
      `the ledger spread was satisfied within ${FORMATION_READINESS_BUDGET_MS} ` +
        `ms of the predecessor's creation (${describeSuccessor(m)})`,
    );
  },
);

test(
  'live-holder-still-refuses-and-unresolved-reads-hold: a live PENDING or ' +
    'SENDING holder still refuses a second self-move at the engagement ' +
    'point, and an empty or failed read of the holder holds',
  async () => {
    const m = await runClaimRefusedThenLocalSettlementScenario();
    const live = probeOf(m, HOLDER_PROBE.LIVE_PENDING_HOLDER);
    assert.ok(
      live !== undefined &&
        live.holderRow?.step === WORKFLOW_STEP.PENDING &&
        live.engagement === ENGAGEMENT_HELD_BY_OTHER &&
        live.holderAfter.operationId === live.holderBefore.operationId,
      'a live PENDING holder refused the candidate and was retained ' +
        `(${JSON.stringify(live)})`,
    );
    for (const probe of UNRESOLVED_READ_PROBES) {
      const observation = probeOf(m, probe);
      assert.ok(
        observation !== undefined &&
          observation.engagement === ENGAGEMENT_HELD_BY_OTHER &&
          observation.holderAfter.operationId ===
            observation.holderBefore.operationId,
        `an unresolved (${probe}) read of the holder held and retained it ` +
          `(${JSON.stringify(observation)})`,
      );
    }
    const sending = await runLiveSendingHolderProbeScenario();
    const sendingProbe = probeOf(sending, HOLDER_PROBE.LIVE_SENDING_HOLDER);
    assert.ok(
      sendingProbe !== undefined &&
        sendingProbe.holderRow?.step === WORKFLOW_STEP.SENDING &&
        sendingProbe.engagement === ENGAGEMENT_HELD_BY_OTHER &&
        sendingProbe.holderAfter.operationId ===
          sendingProbe.holderBefore.operationId,
      'a live SENDING holder refused the candidate and was retained ' +
        `(${JSON.stringify(sendingProbe)})`,
    );
  },
);

test(
  'terminal-only-release-preserved: the holder\'s age past ' +
    'PENDING_TIMEOUT_MS, an orphan reservation reconcile, a foreign ' +
    'terminal row and another operation\'s terminal never release it',
  async () => {
    const m = await runClaimRefusedThenLocalSettlementScenario();
    const aged = probeOf(m, HOLDER_PROBE.LIVE_PENDING_HOLDER);
    assert.ok(
      aged !== undefined &&
        aged.holderAgeMs >= m.extras.pendingTimeoutMs &&
        aged.engagement === ENGAGEMENT_HELD_BY_OTHER &&
        aged.holderAfter.operationId === aged.holderBefore.operationId,
      `the holder aged past PENDING_TIMEOUT_MS (${m.extras.pendingTimeoutMs} ` +
        `ms) still refused and was retained (${JSON.stringify(aged)})`,
    );
    const reconcile = probeOf(m, HOLDER_PROBE.RESERVATION_RECONCILE);
    assert.ok(
      reconcile !== undefined &&
        reconcile.orphansReleased > NO_RELEASES &&
        reconcile.holderAfter.operationId === reconcile.holderBefore.operationId,
      'the target\'s reservation reconciliation released the holder\'s ' +
        `reservation as an orphan without releasing the hold (${JSON.stringify(
          reconcile,
        )})`,
    );
    const foreign = probeOf(m, HOLDER_PROBE.FOREIGN_TERMINAL_ROW);
    assert.ok(
      foreign !== undefined &&
        foreign.engagement === ENGAGEMENT_HELD_BY_OTHER &&
        foreign.holderAfter.operationId === foreign.holderBefore.operationId,
      'a positive terminal row of another operation held and retained the ' +
        `holder (${JSON.stringify(foreign)})`,
    );
    const afterExemptTerminal = refusalsWithin(
      m.dependents,
      m.exempt.completedAtMs,
      LOCAL_SETTLEMENT_AT_MS,
    );
    assert.ok(
      afterExemptTerminal.length > NO_PARKS &&
        afterExemptTerminal.every(
          (refusal) => refusal.reason === SELF_MOVE_IN_FLIGHT_REASON,
        ),
      'the seed\'s live holder survived the exempt ADD\'s terminal ' +
        `(dependents still refused ${SELF_MOVE_IN_FLIGHT_REASON}: ${
          JSON.stringify(afterExemptTerminal)
        })`,
    );
  },
);

test(
  'idle-only-and-exclusion-preserved: the predecessor parks waiting for ' +
    'the idle ledger while incumbents are in flight, and once the ' +
    'successor is registered every dependent is refused ' +
    'operation_ledger_self_move_in_flight until its terminal',
  async () => {
    const m = await runFailedHolderDoesNotStarveSuccessorScenario();
    assertPredecessorFailedBeforeSuccessor(m);
    assert.ok(
      m.selfMove.parks.some(
        (park) =>
          park.reason === SELF_MOVE_WAITING_REASON &&
          park.dependentsInFlight > NONE_IN_FLIGHT &&
          park.atMs < DRAIN_SETTLES_HOLDER_AT_MS,
      ),
      'with incumbents in flight the target parked the predecessor as ' +
        `${SELF_MOVE_WAITING_REASON} (${m.selfMove.parks.length} parks)`,
    );
    const windowEndMs =
      m.selfMove.terminalAtMs ?? FORMATION_READINESS_BUDGET_MS;
    const refusals = refusalsWithin(
      m.dependents,
      m.extras.successor.createdAtMs,
      windowEndMs,
    );
    assert.ok(
      refusals.length > NO_PARKS &&
        refusals.every((refusal) => refusal.reason === SELF_MOVE_IN_FLIGHT_REASON),
      'every dependent planned while the successor was registered was ' +
        `refused ${SELF_MOVE_IN_FLIGHT_REASON} (${JSON.stringify(refusals)})`,
    );
    assert.equal(
      admittedWithin(m.dependents, m.extras.successor.createdAtMs, windowEndMs)
        .length,
      NO_ADMISSIONS,
      'no dependent was admitted between the successor\'s registration and ' +
        'its terminal',
    );
  },
);

test(
  'budgets-and-cadence-unchanged: maxConcurrentAdds, CRITICAL_CHECK_DELAY_MS, ' +
    'DISPATCH_RETRY_DELAY_MS, PENDING_TIMEOUT_MS, the incomplete-read ' +
    'backoff bounds, the drain\'s stale age and the park/retry cadences are ' +
    'the HEAD values',
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
    assert.equal(
      REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS,
      HEAD_PENDING_TIMEOUT_MS,
      'REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS is unchanged',
    );
    const m = await runFailedHolderDoesNotStarveSuccessorScenario();
    assert.deepEqual(
      m.extras.census.backoffBounds,
      {
        floorMs: HEAD_INCOMPLETE_READ_BACKOFF_FLOOR_MS,
        ceilingMs: HEAD_INCOMPLETE_READ_BACKOFF_CEILING_MS,
      },
      'the repository\'s incomplete-read backoff floor/ceiling are unchanged',
    );
    assert.equal(
      m.extras.pendingTimeoutMs,
      HEAD_PENDING_TIMEOUT_MS,
      'the real target coordinator runs with the unchanged PENDING_TIMEOUT_MS',
    );
    assert.ok(
      m.extras.drainSettlement?.ageMs >= m.extras.pendingTimeoutMs,
      'the drain settled the predecessor stale only past PENDING_TIMEOUT_MS ' +
        `(${JSON.stringify(m.extras.drainSettlement)})`,
    );
    const {parks} = m.selfMove;
    for (let index = NEXT_INDEX; index < parks.length; index += NEXT_INDEX) {
      const gapMs = parks[index].atMs - parks[index - NEXT_INDEX].atMs;
      assert.ok(
        gapMs <= CENSUS_RETRY_CADENCE_MULTIPLIER * DISPATCH_RETRY_DELAY_MS,
        'each parked re-drive of the predecessor follows the previous park ' +
          `within ${CENSUS_RETRY_CADENCE_MULTIPLIER} x DISPATCH_RETRY_DELAY_MS ` +
          `(gap ${gapMs} ms at ${parks[index].atMs} ms)`,
      );
    }
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
  'witness-deterministic: the holder-release drive is deterministic across runs',
  async () => {
    const a = await runFailedHolderDoesNotStarveSuccessorScenario();
    const b = await runFailedHolderDoesNotStarveSuccessorScenario();
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
