import {test} from '../../src/test-helpers/tap.js';
import {
  buildGateResult,
  evaluateAllPhases,
  evaluatePhase,
  getMigrationPhaseOrder,
  getPhaseGates,
  getPhaseRollbackNotes,
} from '../../src/control-plane/phase-exit-criteria.js';
import {
  EXIT_GATE,
  MIGRATION_PHASE,
  MIGRATION_PHASE_ORDER,
  PHASE_EXIT_GATES,
  PHASE_ROLLBACK_NOTES,
  PHASE_STATUS,
} from '../../src/control-plane/phase-exit-constants.js';

// ── Suite-local fixture constants ──────────────────────────────────
const FIXTURE_DETAIL_MSG = 'all handlers verified';
const FIXTURE_UNKNOWN_PHASE = 'nonexistent_phase';
const EXPECTED_PHASE_COUNT = 5;
const EXPECTED_GATES_PER_PHASE = 2;

// ═══════════════════════════════════════════════════════════════════
// 1. Constants integrity
// ═══════════════════════════════════════════════════════════════════

test('MIGRATION_PHASE_ORDER contains all phases in sequence',
  async (t) => {
    t.equal(MIGRATION_PHASE_ORDER.length, EXPECTED_PHASE_COUNT);
    t.equal(
      MIGRATION_PHASE_ORDER[0],
      MIGRATION_PHASE.QUEUE_OWNER_PATH,
    );
    t.equal(
      MIGRATION_PHASE_ORDER[4],
      MIGRATION_PHASE.DUAL_PATH_REMOVAL,
    );
    t.ok(Object.isFrozen(MIGRATION_PHASE_ORDER));
  });

test('every phase has exit gates defined', async (t) => {
  for (const phaseId of MIGRATION_PHASE_ORDER) {
    const gates = PHASE_EXIT_GATES[phaseId];
    t.ok(gates, `${phaseId} has exit gates`);
    t.ok(gates.length > 0, `${phaseId} has at least one gate`);
    for (const gate of gates) {
      t.ok(gate.gateId, `${phaseId} gate has gateId`);
      t.ok(gate.description, `${phaseId} gate has description`);
    }
  }
});

test('every phase has rollback notes defined', async (t) => {
  for (const phaseId of MIGRATION_PHASE_ORDER) {
    const notes = PHASE_ROLLBACK_NOTES[phaseId];
    t.ok(notes, `${phaseId} has rollback notes`);
    t.ok(notes.description, `${phaseId} rollback has description`);
    t.ok(notes.risks, `${phaseId} rollback has risks`);
  }
});

test('each phase has exactly two exit gates', async (t) => {
  for (const phaseId of MIGRATION_PHASE_ORDER) {
    const gates = PHASE_EXIT_GATES[phaseId];
    t.equal(
      gates.length,
      EXPECTED_GATES_PER_PHASE,
      `${phaseId} has ${EXPECTED_GATES_PER_PHASE} gates`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════
// 2. buildGateResult
// ═══════════════════════════════════════════════════════════════════

test('buildGateResult creates frozen result with passed true',
  async (t) => {
    const result = buildGateResult({
      gateId: EXIT_GATE.NO_DIRECT_PROGRESSION_IN_HANDLERS,
      passed: true,
      detail: FIXTURE_DETAIL_MSG,
    });

    t.equal(
      result.gateId,
      EXIT_GATE.NO_DIRECT_PROGRESSION_IN_HANDLERS,
    );
    t.equal(result.passed, true);
    t.equal(result.detail, FIXTURE_DETAIL_MSG);
    t.ok(Object.isFrozen(result));
  });

test('buildGateResult defaults detail to null', async (t) => {
  const result = buildGateResult({
    gateId: EXIT_GATE.SINGLE_INFLIGHT_PER_OWNER_KEY,
    passed: false,
  });

  t.equal(result.passed, false);
  t.equal(result.detail, null);
});

test('buildGateResult treats non-boolean passed as false',
  async (t) => {
    const result = buildGateResult({
      gateId: EXIT_GATE.TIMEOUT_CLASSES_EMITTED,
      passed: undefined,
    });
    t.equal(result.passed, false);
  });

// ═══════════════════════════════════════════════════════════════════
// 3. evaluatePhase
// ═══════════════════════════════════════════════════════════════════

test('evaluatePhase returns passed when all gates satisfied',
  async (t) => {
    const gateResults = new Map([
      [EXIT_GATE.NO_DIRECT_PROGRESSION_IN_HANDLERS, {
        passed: true,
        detail: FIXTURE_DETAIL_MSG,
      }],
      [EXIT_GATE.SINGLE_INFLIGHT_PER_OWNER_KEY, {passed: true}],
    ]);

    const result = evaluatePhase(
      MIGRATION_PHASE.QUEUE_OWNER_PATH,
      gateResults,
    );

    t.equal(result.phaseId, MIGRATION_PHASE.QUEUE_OWNER_PATH);
    t.equal(result.status, PHASE_STATUS.PASSED);
    t.equal(result.gates.length, EXPECTED_GATES_PER_PHASE);
    t.ok(result.gates[0].passed);
    t.ok(result.gates[1].passed);
    t.ok(result.rollbackNotes);
    t.ok(Object.isFrozen(result));
    t.ok(Object.isFrozen(result.gates));
  });

test('evaluatePhase returns failed when any gate not satisfied',
  async (t) => {
    const gateResults = new Map([
      [EXIT_GATE.NO_DIRECT_PROGRESSION_IN_HANDLERS, {passed: true}],
      // SINGLE_INFLIGHT_PER_OWNER_KEY missing → treated as failed
    ]);

    const result = evaluatePhase(
      MIGRATION_PHASE.QUEUE_OWNER_PATH,
      gateResults,
    );

    t.equal(result.status, PHASE_STATUS.FAILED);
    t.ok(result.gates[0].passed);
    t.notOk(result.gates[1].passed);
  });

test('evaluatePhase returns failed when gate explicitly fails',
  async (t) => {
    const gateResults = new Map([
      [EXIT_GATE.NO_ADHOC_MULTI_ROW_COMMITS, {passed: false}],
      [EXIT_GATE.WORKFLOW_HISTORY_MONOTONIC, {passed: true}],
    ]);

    const result = evaluatePhase(
      MIGRATION_PHASE.WORKFLOW_TRANSACTION,
      gateResults,
    );

    t.equal(result.status, PHASE_STATUS.FAILED);
  });

test('evaluatePhase returns unknown_phase for invalid phase id',
  async (t) => {
    const result = evaluatePhase(
      FIXTURE_UNKNOWN_PHASE,
      new Map(),
    );

    t.equal(result.status, PHASE_STATUS.UNKNOWN_PHASE);
    t.equal(result.gates.length, 0);
    t.equal(result.rollbackNotes, null);
  });

test('evaluatePhase includes rollback notes for valid phase',
  async (t) => {
    const result = evaluatePhase(
      MIGRATION_PHASE.TIMEOUT_INVARIANT,
      new Map(),
    );

    t.ok(result.rollbackNotes);
    t.ok(result.rollbackNotes.description);
    t.ok(result.rollbackNotes.risks);
  });

test('evaluatePhase handles non-Map gateResults gracefully',
  async (t) => {
    const result = evaluatePhase(
      MIGRATION_PHASE.QUEUE_OWNER_PATH,
      null,
    );

    t.equal(result.status, PHASE_STATUS.FAILED);
    t.equal(result.gates.length, EXPECTED_GATES_PER_PHASE);
    for (const gate of result.gates) {
      t.equal(gate.passed, false);
    }
  });

// ═══════════════════════════════════════════════════════════════════
// 4. evaluateAllPhases
// ═══════════════════════════════════════════════════════════════════

test('evaluateAllPhases returns all phases passed when all gates met',
  async (t) => {
    const allGates = new Map();
    for (const phaseId of MIGRATION_PHASE_ORDER) {
      const gates = PHASE_EXIT_GATES[phaseId];
      for (const gate of gates) {
        allGates.set(gate.gateId, {passed: true});
      }
    }

    const summary = evaluateAllPhases(allGates);

    t.equal(summary.totalPhases, EXPECTED_PHASE_COUNT);
    t.equal(summary.passedPhases, EXPECTED_PHASE_COUNT);
    t.equal(summary.failedPhases, 0);
    t.equal(summary.phases.length, EXPECTED_PHASE_COUNT);
    t.ok(Object.isFrozen(summary));
    t.ok(Object.isFrozen(summary.phases));

    for (const phase of summary.phases) {
      t.equal(phase.status, PHASE_STATUS.PASSED);
    }
  });

test('evaluateAllPhases counts failed phases correctly',
  async (t) => {
    // Only satisfy phase 1 gates
    const gateResults = new Map([
      [EXIT_GATE.NO_DIRECT_PROGRESSION_IN_HANDLERS, {passed: true}],
      [EXIT_GATE.SINGLE_INFLIGHT_PER_OWNER_KEY, {passed: true}],
    ]);

    const summary = evaluateAllPhases(gateResults);

    t.equal(summary.totalPhases, EXPECTED_PHASE_COUNT);
    t.equal(summary.passedPhases, 1);
    t.equal(summary.failedPhases, 4);
    t.equal(
      summary.phases[0].status,
      PHASE_STATUS.PASSED,
    );
    t.equal(
      summary.phases[1].status,
      PHASE_STATUS.FAILED,
    );
  });

test('evaluateAllPhases returns all failed with empty gate results',
  async (t) => {
    const summary = evaluateAllPhases(new Map());

    t.equal(summary.passedPhases, 0);
    t.equal(summary.failedPhases, EXPECTED_PHASE_COUNT);
  });

test('evaluateAllPhases handles null input gracefully', async (t) => {
  const summary = evaluateAllPhases(null);

  t.equal(summary.totalPhases, EXPECTED_PHASE_COUNT);
  t.equal(summary.passedPhases, 0);
  t.equal(summary.failedPhases, EXPECTED_PHASE_COUNT);
});

test('evaluateAllPhases preserves phase order', async (t) => {
  const summary = evaluateAllPhases(new Map());

  for (let i = 0; i < MIGRATION_PHASE_ORDER.length; i++) {
    t.equal(
      summary.phases[i].phaseId,
      MIGRATION_PHASE_ORDER[i],
    );
  }
});

// ═══════════════════════════════════════════════════════════════════
// 5. Accessor functions
// ═══════════════════════════════════════════════════════════════════

test('getPhaseGates returns gates for valid phase', async (t) => {
  const gates = getPhaseGates(MIGRATION_PHASE.QUEUE_OWNER_PATH);
  t.ok(gates);
  t.equal(gates.length, EXPECTED_GATES_PER_PHASE);
  t.equal(
    gates[0].gateId,
    EXIT_GATE.NO_DIRECT_PROGRESSION_IN_HANDLERS,
  );
});

test('getPhaseGates returns null for unknown phase', async (t) => {
  const gates = getPhaseGates(FIXTURE_UNKNOWN_PHASE);
  t.equal(gates, null);
});

test('getPhaseRollbackNotes returns notes for valid phase',
  async (t) => {
    const notes = getPhaseRollbackNotes(
      MIGRATION_PHASE.DUAL_PATH_REMOVAL,
    );
    t.ok(notes);
    t.ok(notes.description);
    t.ok(notes.risks);
  });

test('getPhaseRollbackNotes returns null for unknown phase',
  async (t) => {
    const notes = getPhaseRollbackNotes(FIXTURE_UNKNOWN_PHASE);
    t.equal(notes, null);
  });

test('getMigrationPhaseOrder returns frozen ordered array',
  async (t) => {
    const order = getMigrationPhaseOrder();
    t.ok(Object.isFrozen(order));
    t.equal(order.length, EXPECTED_PHASE_COUNT);
    t.same(order, MIGRATION_PHASE_ORDER);
  });
