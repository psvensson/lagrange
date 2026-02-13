/**
 * Tests for strategy selector — default chooser, validated hints,
 * and EXPLAIN diagnostic output.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.3
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  chooseDefaultStrategy,
  validateHint,
  selectStrategy,
  formatExplainDiagnostic,
} from '../../src/query/strategy-selector.js';
import {
  STRATEGY,
  STRATEGY_REASON,
  DEFAULT_BROADCAST_THRESHOLD_BYTES,
  STRATEGY_INPUT_FIELD as SIF,
  HINT_FIELD,
  STRATEGY_DECISION_FIELD as SDF,
  STRATEGY_ERROR_MSG,
  VALID_STRATEGIES,
} from '../../src/query/strategy-constants.js';
import {
  LOOKUP_ACCESS_PATH,
} from '../../src/query/distributed-context-constants.js';

// ─── chooseDefaultStrategy ───────────────────────────────────

test('chooseDefaultStrategy - broadcast when side <= threshold',
  (t) => {
    const result = chooseDefaultStrategy({
      [SIF.SIDE_SIZE_BYTES]: 100,
      [SIF.INNER_ACCESS_PATH]: null,
    });
    t.equal(result.strategy, STRATEGY.BROADCAST);
    t.equal(
      result.reason,
      STRATEGY_REASON.SIDE_BELOW_BROADCAST_THRESHOLD,
    );
    t.end();
  });

test('chooseDefaultStrategy - broadcast at exact threshold',
  (t) => {
    const result = chooseDefaultStrategy({
      [SIF.SIDE_SIZE_BYTES]: DEFAULT_BROADCAST_THRESHOLD_BYTES,
      [SIF.INNER_ACCESS_PATH]: null,
    });
    t.equal(result.strategy, STRATEGY.BROADCAST);
    t.end();
  });

test('chooseDefaultStrategy - broadcast at zero bytes', (t) => {
  const result = chooseDefaultStrategy({
    [SIF.SIDE_SIZE_BYTES]: 0,
    [SIF.INNER_ACCESS_PATH]: null,
  });
  t.equal(result.strategy, STRATEGY.BROADCAST);
  t.end();
});

test('chooseDefaultStrategy - lookup when above threshold with pk',
  (t) => {
    const result = chooseDefaultStrategy({
      [SIF.SIDE_SIZE_BYTES]: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
      [SIF.INNER_ACCESS_PATH]: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
    });
    t.equal(result.strategy, STRATEGY.LOOKUP);
    t.equal(
      result.reason,
      STRATEGY_REASON.INNER_KEY_BOUNDED_LOOKUP,
    );
    t.end();
  });

test('chooseDefaultStrategy - lookup with unique index', (t) => {
  const result = chooseDefaultStrategy({
    [SIF.SIDE_SIZE_BYTES]: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
    [SIF.INNER_ACCESS_PATH]: LOOKUP_ACCESS_PATH.UNIQUE_INDEX,
  });
  t.equal(result.strategy, STRATEGY.LOOKUP);
  t.end();
});

test('chooseDefaultStrategy - lookup with bounded index', (t) => {
  const result = chooseDefaultStrategy({
    [SIF.SIDE_SIZE_BYTES]: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
    [SIF.INNER_ACCESS_PATH]: LOOKUP_ACCESS_PATH.BOUNDED_INDEX,
  });
  t.equal(result.strategy, STRATEGY.LOOKUP);
  t.end();
});

test('chooseDefaultStrategy - emit/shuffle when above threshold ' +
  'and no key access', (t) => {
  const result = chooseDefaultStrategy({
    [SIF.SIDE_SIZE_BYTES]: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
    [SIF.INNER_ACCESS_PATH]: null,
  });
  t.equal(result.strategy, STRATEGY.EMIT_SHUFFLE);
  t.equal(result.reason, STRATEGY_REASON.DEFAULT_EMIT_SHUFFLE);
  t.end();
});

test('chooseDefaultStrategy - custom threshold override', (t) => {
  const result = chooseDefaultStrategy({
    [SIF.SIDE_SIZE_BYTES]: 500,
    [SIF.INNER_ACCESS_PATH]: null,
    [SIF.BROADCAST_THRESHOLD_BYTES]: 200,
  });
  // 500 > 200, no key access → emit/shuffle
  t.equal(result.strategy, STRATEGY.EMIT_SHUFFLE);
  t.end();
});

test('chooseDefaultStrategy - throws on missing sideSizeBytes',
  (t) => {
    t.throws(
      () => chooseDefaultStrategy({[SIF.INNER_ACCESS_PATH]: null}),
      {message: STRATEGY_ERROR_MSG.SIDE_SIZE_REQUIRED},
    );
    t.end();
  });

test('chooseDefaultStrategy - throws on negative sideSizeBytes',
  (t) => {
    t.throws(
      () => chooseDefaultStrategy({
        [SIF.SIDE_SIZE_BYTES]: -1,
        [SIF.INNER_ACCESS_PATH]: null,
      }),
      {message: STRATEGY_ERROR_MSG.SIDE_SIZE_MUST_BE_NUMBER},
    );
    t.end();
  });

test('chooseDefaultStrategy - throws on non-number sideSizeBytes',
  (t) => {
    t.throws(
      () => chooseDefaultStrategy({
        [SIF.SIDE_SIZE_BYTES]: 'big',
        [SIF.INNER_ACCESS_PATH]: null,
      }),
      {message: STRATEGY_ERROR_MSG.SIDE_SIZE_MUST_BE_NUMBER},
    );
    t.end();
  });

// ─── validateHint ────────────────────────────────────────────

test('validateHint - accepts broadcast when within threshold',
  (t) => {
    const result = validateHint(STRATEGY.BROADCAST, {
      [SIF.SIDE_SIZE_BYTES]: 100,
      [SIF.INNER_ACCESS_PATH]: null,
    });
    t.ok(result.valid);
    t.equal(result.error, null);
    t.end();
  });

test('validateHint - rejects broadcast when above threshold',
  (t) => {
    const result = validateHint(STRATEGY.BROADCAST, {
      [SIF.SIDE_SIZE_BYTES]: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
      [SIF.INNER_ACCESS_PATH]: null,
    });
    t.notOk(result.valid);
    t.equal(
      result.error,
      STRATEGY_ERROR_MSG.HINT_BROADCAST_EXCEEDS_THRESHOLD,
    );
    t.end();
  });

test('validateHint - accepts lookup with pk access', (t) => {
  const result = validateHint(STRATEGY.LOOKUP, {
    [SIF.SIDE_SIZE_BYTES]: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
    [SIF.INNER_ACCESS_PATH]: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
  });
  t.ok(result.valid);
  t.end();
});

test('validateHint - rejects lookup without key access', (t) => {
  const result = validateHint(STRATEGY.LOOKUP, {
    [SIF.SIDE_SIZE_BYTES]: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
    [SIF.INNER_ACCESS_PATH]: null,
  });
  t.notOk(result.valid);
  t.equal(
    result.error,
    STRATEGY_ERROR_MSG.HINT_LOOKUP_NO_KEY_ACCESS,
  );
  t.end();
});

test('validateHint - accepts emit/shuffle always', (t) => {
  const result = validateHint(STRATEGY.EMIT_SHUFFLE, {
    [SIF.SIDE_SIZE_BYTES]: 0,
    [SIF.INNER_ACCESS_PATH]: null,
  });
  t.ok(result.valid);
  t.end();
});

test('validateHint - rejects invalid strategy string', (t) => {
  const result = validateHint('hash_join', {
    [SIF.SIDE_SIZE_BYTES]: 100,
    [SIF.INNER_ACCESS_PATH]: null,
  });
  t.notOk(result.valid);
  t.equal(
    result.error,
    STRATEGY_ERROR_MSG.INVALID_STRATEGY_HINT,
  );
  t.end();
});

// ─── selectStrategy ──────────────────────────────────────────

test('selectStrategy - default broadcast without hints', (t) => {
  const decision = selectStrategy({
    [SIF.SIDE_SIZE_BYTES]: 100,
    [SIF.INNER_ACCESS_PATH]: null,
  });
  t.equal(decision[SDF.STRATEGY], STRATEGY.BROADCAST);
  t.equal(decision[SDF.HINT_APPLIED], false);
  t.ok(Object.isFrozen(decision));
  t.ok(Object.isFrozen(decision[SDF.INPUT]));
  t.end();
});

test('selectStrategy - default lookup without hints', (t) => {
  const decision = selectStrategy({
    [SIF.SIDE_SIZE_BYTES]: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
    [SIF.INNER_ACCESS_PATH]: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
  });
  t.equal(decision[SDF.STRATEGY], STRATEGY.LOOKUP);
  t.equal(decision[SDF.HINT_APPLIED], false);
  t.end();
});

test('selectStrategy - default emit/shuffle without hints',
  (t) => {
    const decision = selectStrategy({
      [SIF.SIDE_SIZE_BYTES]: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
      [SIF.INNER_ACCESS_PATH]: null,
    });
    t.equal(decision[SDF.STRATEGY], STRATEGY.EMIT_SHUFFLE);
    t.equal(decision[SDF.HINT_APPLIED], false);
    t.end();
  });

test('selectStrategy - hint overrides to emit/shuffle', (t) => {
  // Default would be broadcast, but hint says emit_shuffle
  const decision = selectStrategy(
    {
      [SIF.SIDE_SIZE_BYTES]: 100,
      [SIF.INNER_ACCESS_PATH]: null,
    },
    {[HINT_FIELD.STRATEGY]: STRATEGY.EMIT_SHUFFLE},
  );
  t.equal(decision[SDF.STRATEGY], STRATEGY.EMIT_SHUFFLE);
  t.equal(decision[SDF.HINT_APPLIED], true);
  t.equal(
    decision[SDF.REASON],
    STRATEGY_REASON.USER_HINT_EMIT_SHUFFLE,
  );
  t.end();
});

test('selectStrategy - hint overrides to broadcast', (t) => {
  const decision = selectStrategy(
    {
      [SIF.SIDE_SIZE_BYTES]: 100,
      [SIF.INNER_ACCESS_PATH]: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
    },
    {[HINT_FIELD.STRATEGY]: STRATEGY.BROADCAST},
  );
  t.equal(decision[SDF.STRATEGY], STRATEGY.BROADCAST);
  t.equal(decision[SDF.HINT_APPLIED], true);
  t.equal(
    decision[SDF.REASON],
    STRATEGY_REASON.USER_HINT_BROADCAST,
  );
  t.end();
});

test('selectStrategy - hint overrides to lookup', (t) => {
  const decision = selectStrategy(
    {
      [SIF.SIDE_SIZE_BYTES]: 100,
      [SIF.INNER_ACCESS_PATH]: LOOKUP_ACCESS_PATH.UNIQUE_INDEX,
    },
    {[HINT_FIELD.STRATEGY]: STRATEGY.LOOKUP},
  );
  t.equal(decision[SDF.STRATEGY], STRATEGY.LOOKUP);
  t.equal(decision[SDF.HINT_APPLIED], true);
  t.equal(
    decision[SDF.REASON],
    STRATEGY_REASON.USER_HINT_LOOKUP,
  );
  t.end();
});

test('selectStrategy - throws on invalid hint', (t) => {
  t.throws(
    () => selectStrategy(
      {
        [SIF.SIDE_SIZE_BYTES]: 100,
        [SIF.INNER_ACCESS_PATH]: null,
      },
      {[HINT_FIELD.STRATEGY]: 'merge_join'},
    ),
    {message: STRATEGY_ERROR_MSG.INVALID_STRATEGY_HINT},
  );
  t.end();
});

test('selectStrategy - throws on broadcast hint above threshold',
  (t) => {
    t.throws(
      () => selectStrategy(
        {
          [SIF.SIDE_SIZE_BYTES]:
            DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
          [SIF.INNER_ACCESS_PATH]: null,
        },
        {[HINT_FIELD.STRATEGY]: STRATEGY.BROADCAST},
      ),
      {
        message:
          STRATEGY_ERROR_MSG.HINT_BROADCAST_EXCEEDS_THRESHOLD,
      },
    );
    t.end();
  });

test('selectStrategy - throws on lookup hint without key access',
  (t) => {
    t.throws(
      () => selectStrategy(
        {
          [SIF.SIDE_SIZE_BYTES]:
            DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
          [SIF.INNER_ACCESS_PATH]: null,
        },
        {[HINT_FIELD.STRATEGY]: STRATEGY.LOOKUP},
      ),
      {message: STRATEGY_ERROR_MSG.HINT_LOOKUP_NO_KEY_ACCESS},
    );
    t.end();
  });

test('selectStrategy - null hints treated as no hint', (t) => {
  const decision = selectStrategy(
    {
      [SIF.SIDE_SIZE_BYTES]: 100,
      [SIF.INNER_ACCESS_PATH]: null,
    },
    null,
  );
  t.equal(decision[SDF.STRATEGY], STRATEGY.BROADCAST);
  t.equal(decision[SDF.HINT_APPLIED], false);
  t.end();
});

test('selectStrategy - empty hints object treated as no hint',
  (t) => {
    const decision = selectStrategy(
      {
        [SIF.SIDE_SIZE_BYTES]: 100,
        [SIF.INNER_ACCESS_PATH]: null,
      },
      {},
    );
    t.equal(decision[SDF.STRATEGY], STRATEGY.BROADCAST);
    t.equal(decision[SDF.HINT_APPLIED], false);
    t.end();
  });

// ─── formatExplainDiagnostic ─────────────────────────────────

test('formatExplainDiagnostic - includes all fields', (t) => {
  const decision = selectStrategy({
    [SIF.SIDE_SIZE_BYTES]: 100,
    [SIF.INNER_ACCESS_PATH]: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
  });
  const diag = formatExplainDiagnostic(decision);

  t.equal(diag.strategy, STRATEGY.BROADCAST);
  t.equal(
    diag.reason,
    STRATEGY_REASON.SIDE_BELOW_BROADCAST_THRESHOLD,
  );
  t.equal(diag.hintApplied, false);
  t.equal(diag.sideSizeBytes, 100);
  t.equal(
    diag.innerAccessPath,
    LOOKUP_ACCESS_PATH.PRIMARY_KEY,
  );
  t.equal(
    diag.broadcastThresholdBytes,
    DEFAULT_BROADCAST_THRESHOLD_BYTES,
  );
  t.ok(Object.isFrozen(diag));
  t.end();
});

test('formatExplainDiagnostic - with hint applied', (t) => {
  const decision = selectStrategy(
    {
      [SIF.SIDE_SIZE_BYTES]: 100,
      [SIF.INNER_ACCESS_PATH]: null,
    },
    {[HINT_FIELD.STRATEGY]: STRATEGY.EMIT_SHUFFLE},
  );
  const diag = formatExplainDiagnostic(decision);

  t.equal(diag.strategy, STRATEGY.EMIT_SHUFFLE);
  t.equal(diag.hintApplied, true);
  t.equal(diag.innerAccessPath, null);
  t.end();
});

// ─── VALID_STRATEGIES ────────────────────────────────────────

test('VALID_STRATEGIES - contains all three strategies', (t) => {
  t.equal(VALID_STRATEGIES.size, 3);
  t.ok(VALID_STRATEGIES.has(STRATEGY.BROADCAST));
  t.ok(VALID_STRATEGIES.has(STRATEGY.LOOKUP));
  t.ok(VALID_STRATEGIES.has(STRATEGY.EMIT_SHUFFLE));
  t.end();
});

// ─── Property-based tests ────────────────────────────────────

test('PBT: small side always chooses broadcast', (t) => {
  /**
   * **Validates: Requirements 6.1**
   */
  fc.assert(
    fc.property(
      fc.integer({min: 0, max: DEFAULT_BROADCAST_THRESHOLD_BYTES}),
      (sideSize) => {
        const result = chooseDefaultStrategy({
          [SIF.SIDE_SIZE_BYTES]: sideSize,
          [SIF.INNER_ACCESS_PATH]: null,
        });
        return result.strategy === STRATEGY.BROADCAST;
      },
    ),
    {numRuns: 10},
  );
  t.pass('small side always broadcast');
  t.end();
});

test('PBT: large side with key access chooses lookup', (t) => {
  /**
   * **Validates: Requirements 6.2**
   */
  const accessPaths = [
    LOOKUP_ACCESS_PATH.PRIMARY_KEY,
    LOOKUP_ACCESS_PATH.UNIQUE_INDEX,
    LOOKUP_ACCESS_PATH.BOUNDED_INDEX,
  ];
  fc.assert(
    fc.property(
      fc.integer({
        min: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
        max: DEFAULT_BROADCAST_THRESHOLD_BYTES + 100000,
      }),
      fc.constantFrom(...accessPaths),
      (sideSize, accessPath) => {
        const result = chooseDefaultStrategy({
          [SIF.SIDE_SIZE_BYTES]: sideSize,
          [SIF.INNER_ACCESS_PATH]: accessPath,
        });
        return result.strategy === STRATEGY.LOOKUP;
      },
    ),
    {numRuns: 10},
  );
  t.pass('large side with key access always lookup');
  t.end();
});

test('PBT: large side without key access chooses emit/shuffle',
  (t) => {
    /**
     * **Validates: Requirements 6.3**
     */
    fc.assert(
      fc.property(
        fc.integer({
          min: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
          max: DEFAULT_BROADCAST_THRESHOLD_BYTES + 100000,
        }),
        (sideSize) => {
          const result = chooseDefaultStrategy({
            [SIF.SIDE_SIZE_BYTES]: sideSize,
            [SIF.INNER_ACCESS_PATH]: null,
          });
          return result.strategy === STRATEGY.EMIT_SHUFFLE;
        },
      ),
      {numRuns: 10},
    );
    t.pass('large side without key access always emit/shuffle');
    t.end();
  });

test('PBT: selectStrategy always returns a valid strategy',
  (t) => {
    /**
     * **Validates: Requirements 6.1, 6.2, 6.3**
     */
    const accessPaths = [
      null,
      LOOKUP_ACCESS_PATH.PRIMARY_KEY,
      LOOKUP_ACCESS_PATH.UNIQUE_INDEX,
      LOOKUP_ACCESS_PATH.BOUNDED_INDEX,
    ];
    fc.assert(
      fc.property(
        fc.integer({min: 0, max: 1000000}),
        fc.constantFrom(...accessPaths),
        (sideSize, accessPath) => {
          const decision = selectStrategy({
            [SIF.SIDE_SIZE_BYTES]: sideSize,
            [SIF.INNER_ACCESS_PATH]: accessPath,
          });
          return VALID_STRATEGIES.has(decision[SDF.STRATEGY]) &&
            typeof decision[SDF.REASON] === 'string' &&
            decision[SDF.HINT_APPLIED] === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('selectStrategy always returns valid strategy');
    t.end();
  });


// ─── Additional coverage for Req 6.1 boundary ───────────────

test('chooseDefaultStrategy - emit/shuffle with unknown access ' +
  'path string', (t) => {
  const result = chooseDefaultStrategy({
    [SIF.SIDE_SIZE_BYTES]: DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
    [SIF.INNER_ACCESS_PATH]: 'full_scan',
  });
  t.equal(result.strategy, STRATEGY.EMIT_SHUFFLE);
  t.equal(result.reason, STRATEGY_REASON.DEFAULT_EMIT_SHUFFLE);
  t.end();
});

test('chooseDefaultStrategy - broadcast wins over lookup when ' +
  'side is small even with key access', (t) => {
  const result = chooseDefaultStrategy({
    [SIF.SIDE_SIZE_BYTES]: 10,
    [SIF.INNER_ACCESS_PATH]: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
  });
  t.equal(result.strategy, STRATEGY.BROADCAST);
  t.end();
});

test('selectStrategy - hint lookup with bounded index', (t) => {
  const decision = selectStrategy(
    {
      [SIF.SIDE_SIZE_BYTES]:
        DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
      [SIF.INNER_ACCESS_PATH]:
        LOOKUP_ACCESS_PATH.BOUNDED_INDEX,
    },
    {[HINT_FIELD.STRATEGY]: STRATEGY.LOOKUP},
  );
  t.equal(decision[SDF.STRATEGY], STRATEGY.LOOKUP);
  t.equal(decision[SDF.HINT_APPLIED], true);
  t.equal(
    decision[SDF.REASON],
    STRATEGY_REASON.USER_HINT_LOOKUP,
  );
  t.end();
});

test('validateHint - rejects lookup with unknown access path',
  (t) => {
    const result = validateHint(STRATEGY.LOOKUP, {
      [SIF.SIDE_SIZE_BYTES]:
        DEFAULT_BROADCAST_THRESHOLD_BYTES + 1,
      [SIF.INNER_ACCESS_PATH]: 'full_scan',
    });
    t.notOk(result.valid);
    t.equal(
      result.error,
      STRATEGY_ERROR_MSG.HINT_LOOKUP_NO_KEY_ACCESS,
    );
    t.end();
  });

// ─── PBT: broadcast threshold boundary (Req 6.1) ────────────

test('PBT: side at exact threshold always broadcast', (t) => {
  /**
   * **Validates: Requirements 6.1**
   */
  fc.assert(
    fc.property(
      fc.constantFrom(
        null,
        LOOKUP_ACCESS_PATH.PRIMARY_KEY,
        LOOKUP_ACCESS_PATH.UNIQUE_INDEX,
        LOOKUP_ACCESS_PATH.BOUNDED_INDEX,
      ),
      (accessPath) => {
        const result = chooseDefaultStrategy({
          [SIF.SIDE_SIZE_BYTES]:
            DEFAULT_BROADCAST_THRESHOLD_BYTES,
          [SIF.INNER_ACCESS_PATH]: accessPath,
        });
        return result.strategy === STRATEGY.BROADCAST;
      },
    ),
    {numRuns: 10},
  );
  t.pass('side at exact threshold always broadcast');
  t.end();
});
