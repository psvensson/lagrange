// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  registerFailureClass,
  getFailureClass,
  getOpenFailureClasses,
  markReproduced,
  markClosed,
  clearRegistry,
  validateClosureEvidence,
} from '../../src/control-plane/failure-class-registry.js';
import {
  CLOSURE_VALIDATION_REASON,
  FAILURE_CLASS,
  FAILURE_CLASS_STATUS,
} from '../../src/control-plane/failure-class-constants.js';
import {
  INVARIANT_ID,
} from '../../src/invariants/invariant-catalog.js';

// ── Suite-local fixture constants ──────────────────────────────────
const FIXTURE_TEST_ID_LEADER =
  'invariant-engine.dual-leader-repro';
const FIXTURE_TEST_ID_STEP =
  'monotonic-workflow.backward-step-repro';
const FIXTURE_DESC_DUAL_LEADER =
  'Two leaders observed for same partition during rebalance';
const FIXTURE_DESC_BACKWARD =
  'Backward workflow step transition under node churn';
const FIXTURE_DESC_STALE =
  'Stale claim overwrites newer transition';
const FIXTURE_DESC_ORPHAN =
  'In-flight operation without owner key after leader change';

// ═══════════════════════════════════════════════════════════════════
// 1. Registration
// ═══════════════════════════════════════════════════════════════════

test('registerFailureClass creates a frozen entry with open status',
  async (t) => {
    t.teardown(() => clearRegistry());

    const entry = registerFailureClass({
      failureClassId: FAILURE_CLASS.DUAL_LEADER,
      invariantId: INVARIANT_ID.LEADER_UNIQUENESS,
      description: FIXTURE_DESC_DUAL_LEADER,
    });

    t.equal(entry.failureClassId, FAILURE_CLASS.DUAL_LEADER);
    t.equal(entry.invariantId, INVARIANT_ID.LEADER_UNIQUENESS);
    t.equal(entry.deterministicTestId, null);
    t.equal(entry.status, FAILURE_CLASS_STATUS.OPEN);
    t.equal(entry.description, FIXTURE_DESC_DUAL_LEADER);
    t.ok(Object.isFrozen(entry));
  });

test('registerFailureClass sets reproduced when test id provided',
  async (t) => {
    t.teardown(() => clearRegistry());

    const entry = registerFailureClass({
      failureClassId: FAILURE_CLASS.BACKWARD_STEP,
      deterministicTestId: FIXTURE_TEST_ID_STEP,
      description: FIXTURE_DESC_BACKWARD,
    });

    t.equal(entry.status, FAILURE_CLASS_STATUS.REPRODUCED);
    t.equal(entry.deterministicTestId, FIXTURE_TEST_ID_STEP);
    t.equal(entry.invariantId, null);
  });

test('registerFailureClass throws on missing failureClassId',
  async (t) => {
    t.teardown(() => clearRegistry());

    t.throws(() => registerFailureClass({}), {
      message:
        'failureClassId is required and must be a non-empty string',
    });
    t.throws(() => registerFailureClass({failureClassId: ''}), {
      message:
        'failureClassId is required and must be a non-empty string',
    });
  });

test('registerFailureClass replaces existing entry with same id',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.DUAL_LEADER,
      description: FIXTURE_DESC_DUAL_LEADER,
    });
    const replaced = registerFailureClass({
      failureClassId: FAILURE_CLASS.DUAL_LEADER,
      deterministicTestId: FIXTURE_TEST_ID_LEADER,
      description: FIXTURE_DESC_DUAL_LEADER,
    });

    t.equal(replaced.status, FAILURE_CLASS_STATUS.REPRODUCED);
    t.equal(replaced.deterministicTestId, FIXTURE_TEST_ID_LEADER);
  });

// ═══════════════════════════════════════════════════════════════════
// 2. Lookup
// ═══════════════════════════════════════════════════════════════════

test('getFailureClass returns entry by id', async (t) => {
  t.teardown(() => clearRegistry());

  registerFailureClass({
    failureClassId: FAILURE_CLASS.STALE_CLAIM,
    description: FIXTURE_DESC_STALE,
  });

  const entry = getFailureClass(FAILURE_CLASS.STALE_CLAIM);
  t.ok(entry);
  t.equal(entry.failureClassId, FAILURE_CLASS.STALE_CLAIM);
});

test('getFailureClass returns null for unknown id', async (t) => {
  t.teardown(() => clearRegistry());

  t.equal(getFailureClass('nonexistent'), null);
});

test('getFailureClass returns null for invalid input', async (t) => {
  t.teardown(() => clearRegistry());

  t.equal(getFailureClass(''), null);
  t.equal(getFailureClass(null), null);
  t.equal(getFailureClass(undefined), null);
});

// ═══════════════════════════════════════════════════════════════════
// 3. Status transitions
// ═══════════════════════════════════════════════════════════════════

test('markReproduced transitions open entry to reproduced',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.ORPHAN_OPERATION,
      description: FIXTURE_DESC_ORPHAN,
    });

    const updated = markReproduced(
      FAILURE_CLASS.ORPHAN_OPERATION,
      FIXTURE_TEST_ID_LEADER,
    );

    t.equal(updated.status, FAILURE_CLASS_STATUS.REPRODUCED);
    t.equal(updated.deterministicTestId, FIXTURE_TEST_ID_LEADER);
    t.ok(Object.isFrozen(updated));

    const fetched = getFailureClass(FAILURE_CLASS.ORPHAN_OPERATION);
    t.equal(fetched.status, FAILURE_CLASS_STATUS.REPRODUCED);
  });

test('markReproduced throws on unknown failure class', async (t) => {
  t.teardown(() => clearRegistry());

  t.throws(() => markReproduced('nonexistent', FIXTURE_TEST_ID_LEADER), {
    message: 'Failure class not found: nonexistent',
  });
});

test('markReproduced throws on empty deterministicTestId',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.DUAL_LEADER,
      description: FIXTURE_DESC_DUAL_LEADER,
    });

    t.throws(
      () => markReproduced(FAILURE_CLASS.DUAL_LEADER, ''),
      {
        message:
        'deterministicTestId is required and must be a ' +
        'non-empty string',
      },
    );
  });

test('markClosed transitions reproduced entry to closed',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.BACKWARD_STEP,
      deterministicTestId: FIXTURE_TEST_ID_STEP,
      description: FIXTURE_DESC_BACKWARD,
    });

    const updated = markClosed(FAILURE_CLASS.BACKWARD_STEP);

    t.equal(updated.status, FAILURE_CLASS_STATUS.CLOSED);
    t.ok(Object.isFrozen(updated));

    const fetched = getFailureClass(FAILURE_CLASS.BACKWARD_STEP);
    t.equal(fetched.status, FAILURE_CLASS_STATUS.CLOSED);
  });

test('markClosed throws on unknown failure class', async (t) => {
  t.teardown(() => clearRegistry());

  t.throws(() => markClosed('nonexistent'), {
    message: 'Failure class not found: nonexistent',
  });
});

test('markClosed throws when class is not in reproduced status',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.CDC_DIVERGENCE,
      description: 'CDC divergence without repro',
    });

    t.throws(() => markClosed(FAILURE_CLASS.CDC_DIVERGENCE), {
      message:
        'Cannot close a failure class that is not in reproduced ' +
        'status',
    });
  });

// ═══════════════════════════════════════════════════════════════════
// 4. Open classes tracking
// ═══════════════════════════════════════════════════════════════════

test('getOpenFailureClasses returns only open entries',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.DUAL_LEADER,
      description: FIXTURE_DESC_DUAL_LEADER,
    });
    registerFailureClass({
      failureClassId: FAILURE_CLASS.BACKWARD_STEP,
      deterministicTestId: FIXTURE_TEST_ID_STEP,
      description: FIXTURE_DESC_BACKWARD,
    });
    registerFailureClass({
      failureClassId: FAILURE_CLASS.STALE_CLAIM,
      description: FIXTURE_DESC_STALE,
    });

    const open = getOpenFailureClasses();

    t.equal(open.length, 2);
    t.ok(Object.isFrozen(open));

    const ids = open.map((e) => e.failureClassId);
    t.ok(ids.includes(FAILURE_CLASS.DUAL_LEADER));
    t.ok(ids.includes(FAILURE_CLASS.STALE_CLAIM));
    t.notOk(ids.includes(FAILURE_CLASS.BACKWARD_STEP));
  });

test('getOpenFailureClasses returns empty array when none open',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.DUAL_LEADER,
      deterministicTestId: FIXTURE_TEST_ID_LEADER,
      description: FIXTURE_DESC_DUAL_LEADER,
    });

    const open = getOpenFailureClasses();
    t.equal(open.length, 0);
    t.ok(Object.isFrozen(open));
  });

// ═══════════════════════════════════════════════════════════════════
// 5. Classes without deterministic test IDs remain open
// ═══════════════════════════════════════════════════════════════════

test('class without deterministicTestId stays open and cannot close',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.TIMEOUT_BOUNDARY,
      invariantId: INVARIANT_ID.MONOTONIC_STEPS,
      description: 'Timeout boundary hit without repro',
    });

    const entry = getFailureClass(FAILURE_CLASS.TIMEOUT_BOUNDARY);
    t.equal(entry.status, FAILURE_CLASS_STATUS.OPEN);
    t.equal(entry.deterministicTestId, null);

    t.throws(() => markClosed(FAILURE_CLASS.TIMEOUT_BOUNDARY), {
      message:
        'Cannot close a failure class that is not in reproduced ' +
        'status',
    });

    const stillOpen = getOpenFailureClasses();
    t.ok(
      stillOpen.some(
        (e) => e.failureClassId === FAILURE_CLASS.TIMEOUT_BOUNDARY,
      ),
    );
  });

// ═══════════════════════════════════════════════════════════════════
// 6. Closure evidence validation
// ═══════════════════════════════════════════════════════════════════

test('validateClosureEvidence returns valid for reproduced class',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.DUAL_LEADER,
      deterministicTestId: FIXTURE_TEST_ID_LEADER,
      description: FIXTURE_DESC_DUAL_LEADER,
    });

    const result = validateClosureEvidence(FAILURE_CLASS.DUAL_LEADER);

    t.equal(result.valid, true);
    t.equal(result.reason, CLOSURE_VALIDATION_REASON.VALID);
    t.equal(result.failureClassId, FAILURE_CLASS.DUAL_LEADER);
    t.ok(Object.isFrozen(result));
  });

test('validateClosureEvidence returns valid for closed class',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.BACKWARD_STEP,
      deterministicTestId: FIXTURE_TEST_ID_STEP,
      description: FIXTURE_DESC_BACKWARD,
    });
    markClosed(FAILURE_CLASS.BACKWARD_STEP);

    const result = validateClosureEvidence(
      FAILURE_CLASS.BACKWARD_STEP,
    );

    t.equal(result.valid, true);
    t.equal(result.reason, CLOSURE_VALIDATION_REASON.VALID);
    t.equal(result.failureClassId, FAILURE_CLASS.BACKWARD_STEP);
  });

test('validateClosureEvidence rejects harness-only evidence',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.STALE_CLAIM,
      description: FIXTURE_DESC_STALE,
    });

    const result = validateClosureEvidence(
      FAILURE_CLASS.STALE_CLAIM,
    );

    t.equal(result.valid, false);
    t.equal(
      result.reason,
      CLOSURE_VALIDATION_REASON.HARNESS_ONLY_EVIDENCE,
    );
    t.equal(result.failureClassId, FAILURE_CLASS.STALE_CLAIM);
    t.ok(Object.isFrozen(result));
  });

test('validateClosureEvidence rejects unknown failure class',
  async (t) => {
    t.teardown(() => clearRegistry());

    const result = validateClosureEvidence('nonexistent');

    t.equal(result.valid, false);
    t.equal(
      result.reason,
      CLOSURE_VALIDATION_REASON.UNKNOWN_FAILURE_CLASS,
    );
    t.equal(result.failureClassId, 'nonexistent');
    t.ok(Object.isFrozen(result));
  });

test('markClosed prevents harness-only closure (no test id)',
  async (t) => {
    t.teardown(() => clearRegistry());

    registerFailureClass({
      failureClassId: FAILURE_CLASS.ORPHAN_OPERATION,
      description: FIXTURE_DESC_ORPHAN,
    });

    // Validation rejects harness-only evidence
    const validation = validateClosureEvidence(
      FAILURE_CLASS.ORPHAN_OPERATION,
    );
    t.equal(validation.valid, false);
    t.equal(
      validation.reason,
      CLOSURE_VALIDATION_REASON.HARNESS_ONLY_EVIDENCE,
    );

    // markClosed also rejects because status is open, not reproduced
    t.throws(
      () => markClosed(FAILURE_CLASS.ORPHAN_OPERATION),
      {
        message:
          'Cannot close a failure class that is not in ' +
          'reproduced status',
      },
    );
  });
