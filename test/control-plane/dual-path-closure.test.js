import {test} from '../../src/test-helpers/tap.js';
import {
  buildCleanConcernEntry,
  buildDefaultConcernRegistry,
  buildViolation,
  verifyConcern,
  verifyClosureState,
} from '../../src/control-plane/dual-path-closure.js';
import {
  CLOSURE_STATUS,
  CONCERN,
  VIOLATION_TYPE,
} from '../../src/control-plane/dual-path-closure-constants.js';

// ── Suite-local fixture constants ──────────────────────────────────
const FIXTURE_OWNER_RECONCILE_QUEUE = 'owner-key-reconcile-queue';
const FIXTURE_OWNER_REBALANCE_COORD = 'rebalance-coordinator';
const FIXTURE_OWNER_SPLIT_COORD = 'split-coordinator';
const FIXTURE_LEGACY_POLLING = 'legacy-polling-loop';
const FIXTURE_LEGACY_DIRECT = 'legacy-direct-handler';
const FIXTURE_TOGGLE_USE_OLD_DISPATCH = 'use_old_dispatch';
const FIXTURE_TOGGLE_ENABLE_LEGACY = 'enable_legacy_rebalance';
const FIXTURE_DETAIL_MSG = 'test detail';
const EXPECTED_CONCERN_COUNT = 3;

// ═══════════════════════════════════════════════════════════════════
// 1. Constants integrity
// ═══════════════════════════════════════════════════════════════════

test('CONCERN enum contains all three control-plane concerns',
  async (t) => {
    t.equal(CONCERN.DISPATCH, 'dispatch');
    t.equal(CONCERN.REBALANCE, 'rebalance');
    t.equal(CONCERN.SPLIT, 'split');
    t.ok(Object.isFrozen(CONCERN));
  });

test('VIOLATION_TYPE enum contains all violation types',
  async (t) => {
    t.equal(
      VIOLATION_TYPE.DUPLICATE_PROGRESSION,
      'duplicate_progression',
    );
    t.equal(VIOLATION_TYPE.ACTIVE_TOGGLE, 'active_toggle');
    t.equal(VIOLATION_TYPE.LEGACY_BRANCH, 'legacy_branch');
    t.ok(Object.isFrozen(VIOLATION_TYPE));
  });

test('CLOSURE_STATUS enum contains clean and violations_found',
  async (t) => {
    t.equal(CLOSURE_STATUS.CLEAN, 'clean');
    t.equal(CLOSURE_STATUS.VIOLATIONS_FOUND, 'violations_found');
    t.ok(Object.isFrozen(CLOSURE_STATUS));
  });

// ═══════════════════════════════════════════════════════════════════
// 2. buildViolation
// ═══════════════════════════════════════════════════════════════════

test('buildViolation creates frozen result with all fields',
  async (t) => {
    const result = buildViolation({
      concern: CONCERN.DISPATCH,
      violationType: VIOLATION_TYPE.ACTIVE_TOGGLE,
      detail: FIXTURE_DETAIL_MSG,
    });

    t.equal(result.concern, CONCERN.DISPATCH);
    t.equal(result.violationType, VIOLATION_TYPE.ACTIVE_TOGGLE);
    t.equal(result.detail, FIXTURE_DETAIL_MSG);
    t.ok(Object.isFrozen(result));
  });

test('buildViolation defaults detail to null for non-string',
  async (t) => {
    const result = buildViolation({
      concern: CONCERN.REBALANCE,
      violationType: VIOLATION_TYPE.LEGACY_BRANCH,
      detail: undefined,
    });

    t.equal(result.detail, null);
  });

// ═══════════════════════════════════════════════════════════════════
// 3. verifyConcern
// ═══════════════════════════════════════════════════════════════════

test('verifyConcern returns empty array for clean single-owner',
  async (t) => {
    const entry = {
      concern: CONCERN.DISPATCH,
      ownerPaths: [FIXTURE_OWNER_RECONCILE_QUEUE],
      activeToggles: [],
      legacyBranches: [],
    };

    const violations = verifyConcern(entry);
    t.equal(violations.length, 0);
  });

test('verifyConcern detects duplicate progression paths',
  async (t) => {
    const entry = {
      concern: CONCERN.DISPATCH,
      ownerPaths: [
        FIXTURE_OWNER_RECONCILE_QUEUE,
        FIXTURE_LEGACY_POLLING,
      ],
      activeToggles: [],
      legacyBranches: [],
    };

    const violations = verifyConcern(entry);
    t.equal(violations.length, 1);
    t.equal(
      violations[0].violationType,
      VIOLATION_TYPE.DUPLICATE_PROGRESSION,
    );
    t.equal(violations[0].concern, CONCERN.DISPATCH);
    t.ok(violations[0].detail.includes(FIXTURE_OWNER_RECONCILE_QUEUE));
    t.ok(violations[0].detail.includes(FIXTURE_LEGACY_POLLING));
  });

test('verifyConcern detects active toggles', async (t) => {
  const entry = {
    concern: CONCERN.REBALANCE,
    ownerPaths: [FIXTURE_OWNER_REBALANCE_COORD],
    activeToggles: [FIXTURE_TOGGLE_ENABLE_LEGACY],
    legacyBranches: [],
  };

  const violations = verifyConcern(entry);
  t.equal(violations.length, 1);
  t.equal(violations[0].violationType, VIOLATION_TYPE.ACTIVE_TOGGLE);
  t.equal(violations[0].detail, FIXTURE_TOGGLE_ENABLE_LEGACY);
});

test('verifyConcern detects legacy branches', async (t) => {
  const entry = {
    concern: CONCERN.SPLIT,
    ownerPaths: [FIXTURE_OWNER_SPLIT_COORD],
    activeToggles: [],
    legacyBranches: [FIXTURE_LEGACY_DIRECT],
  };

  const violations = verifyConcern(entry);
  t.equal(violations.length, 1);
  t.equal(
    violations[0].violationType,
    VIOLATION_TYPE.LEGACY_BRANCH,
  );
  t.equal(violations[0].detail, FIXTURE_LEGACY_DIRECT);
});

test('verifyConcern accumulates multiple violation types',
  async (t) => {
    const entry = {
      concern: CONCERN.DISPATCH,
      ownerPaths: [
        FIXTURE_OWNER_RECONCILE_QUEUE,
        FIXTURE_LEGACY_POLLING,
      ],
      activeToggles: [FIXTURE_TOGGLE_USE_OLD_DISPATCH],
      legacyBranches: [FIXTURE_LEGACY_DIRECT],
    };

    const violations = verifyConcern(entry);
    t.equal(violations.length, 3);

    const types = violations.map((v) => v.violationType);
    t.ok(types.includes(VIOLATION_TYPE.DUPLICATE_PROGRESSION));
    t.ok(types.includes(VIOLATION_TYPE.ACTIVE_TOGGLE));
    t.ok(types.includes(VIOLATION_TYPE.LEGACY_BRANCH));
  });

test('verifyConcern handles null input gracefully', async (t) => {
  const violations = verifyConcern(null);
  t.equal(violations.length, 0);
});

test('verifyConcern handles empty ownerPaths as clean',
  async (t) => {
    const entry = {
      concern: CONCERN.DISPATCH,
      ownerPaths: [],
      activeToggles: [],
      legacyBranches: [],
    };

    const violations = verifyConcern(entry);
    t.equal(violations.length, 0);
  });

// ═══════════════════════════════════════════════════════════════════
// 4. verifyClosureState
// ═══════════════════════════════════════════════════════════════════

test('verifyClosureState returns clean when all concerns pass',
  async (t) => {
    const entries = [
      buildCleanConcernEntry(
        CONCERN.DISPATCH, FIXTURE_OWNER_RECONCILE_QUEUE,
      ),
      buildCleanConcernEntry(
        CONCERN.REBALANCE, FIXTURE_OWNER_REBALANCE_COORD,
      ),
      buildCleanConcernEntry(
        CONCERN.SPLIT, FIXTURE_OWNER_SPLIT_COORD,
      ),
    ];

    const result = verifyClosureState(entries);
    t.equal(result.status, CLOSURE_STATUS.CLEAN);
    t.equal(result.violations.length, 0);
    t.equal(result.totalConcerns, EXPECTED_CONCERN_COUNT);
    t.equal(result.cleanConcerns, EXPECTED_CONCERN_COUNT);
    t.ok(Object.isFrozen(result));
    t.ok(Object.isFrozen(result.violations));
  });

test('verifyClosureState detects violations across concerns',
  async (t) => {
    const entries = [
      {
        concern: CONCERN.DISPATCH,
        ownerPaths: [
          FIXTURE_OWNER_RECONCILE_QUEUE,
          FIXTURE_LEGACY_POLLING,
        ],
        activeToggles: [],
        legacyBranches: [],
      },
      buildCleanConcernEntry(
        CONCERN.REBALANCE, FIXTURE_OWNER_REBALANCE_COORD,
      ),
      buildCleanConcernEntry(
        CONCERN.SPLIT, FIXTURE_OWNER_SPLIT_COORD,
      ),
    ];

    const result = verifyClosureState(entries);
    t.equal(result.status, CLOSURE_STATUS.VIOLATIONS_FOUND);
    t.equal(result.violations.length, 1);
    t.equal(result.totalConcerns, EXPECTED_CONCERN_COUNT);
    t.equal(result.cleanConcerns, 2);
  });

test('verifyClosureState handles null input gracefully',
  async (t) => {
    const result = verifyClosureState(null);
    t.equal(result.status, CLOSURE_STATUS.CLEAN);
    t.equal(result.violations.length, 0);
    t.equal(result.totalConcerns, 0);
    t.equal(result.cleanConcerns, 0);
  });

test('verifyClosureState handles empty array', async (t) => {
  const result = verifyClosureState([]);
  t.equal(result.status, CLOSURE_STATUS.CLEAN);
  t.equal(result.totalConcerns, 0);
});

// ═══════════════════════════════════════════════════════════════════
// 5. buildCleanConcernEntry
// ═══════════════════════════════════════════════════════════════════

test('buildCleanConcernEntry creates frozen entry with one path',
  async (t) => {
    const entry = buildCleanConcernEntry(
      CONCERN.DISPATCH,
      FIXTURE_OWNER_RECONCILE_QUEUE,
    );

    t.equal(entry.concern, CONCERN.DISPATCH);
    t.same(entry.ownerPaths, [FIXTURE_OWNER_RECONCILE_QUEUE]);
    t.same(entry.activeToggles, []);
    t.same(entry.legacyBranches, []);
    t.ok(Object.isFrozen(entry));
    t.ok(Object.isFrozen(entry.ownerPaths));
    t.ok(Object.isFrozen(entry.activeToggles));
    t.ok(Object.isFrozen(entry.legacyBranches));
  });

test('buildCleanConcernEntry handles empty ownerPath',
  async (t) => {
    const entry = buildCleanConcernEntry(CONCERN.SPLIT, '');
    t.same(entry.ownerPaths, []);
  });

// ═══════════════════════════════════════════════════════════════════
// 6. buildDefaultConcernRegistry
// ═══════════════════════════════════════════════════════════════════

test('buildDefaultConcernRegistry creates all three concerns',
  async (t) => {
    const registry = buildDefaultConcernRegistry({
      [CONCERN.DISPATCH]: FIXTURE_OWNER_RECONCILE_QUEUE,
      [CONCERN.REBALANCE]: FIXTURE_OWNER_REBALANCE_COORD,
      [CONCERN.SPLIT]: FIXTURE_OWNER_SPLIT_COORD,
    });

    t.equal(registry.length, EXPECTED_CONCERN_COUNT);
    t.equal(registry[0].concern, CONCERN.DISPATCH);
    t.equal(registry[1].concern, CONCERN.REBALANCE);
    t.equal(registry[2].concern, CONCERN.SPLIT);
    t.ok(Object.isFrozen(registry));
  });

test('buildDefaultConcernRegistry verifies clean with closure',
  async (t) => {
    const registry = buildDefaultConcernRegistry({
      [CONCERN.DISPATCH]: FIXTURE_OWNER_RECONCILE_QUEUE,
      [CONCERN.REBALANCE]: FIXTURE_OWNER_REBALANCE_COORD,
      [CONCERN.SPLIT]: FIXTURE_OWNER_SPLIT_COORD,
    });

    const result = verifyClosureState(registry);
    t.equal(result.status, CLOSURE_STATUS.CLEAN);
    t.equal(result.cleanConcerns, EXPECTED_CONCERN_COUNT);
  });

test('buildDefaultConcernRegistry handles null input',
  async (t) => {
    const registry = buildDefaultConcernRegistry(null);
    t.equal(registry.length, EXPECTED_CONCERN_COUNT);
    for (const entry of registry) {
      t.same(entry.ownerPaths, []);
    }
  });
