/**
 * Property-based tests for admin-mutation-guard.
 *
 * **Validates: Requirements 2.5, 6.3, 13.5**
 *
 * Properties verified:
 * P1: Known meta-service actions are ALWAYS allowed regardless
 *     of guard mode.
 * P2: Unknown actions in reject mode are NEVER allowed.
 * P3: Unknown actions in warn mode are ALWAYS allowed with a
 *     deprecation warning.
 * P4: guardedAdaptAdminAction in reject mode blocks any
 *     unknown action before it reaches the adapter.
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  guardMutation,
  MUTATION_GUARD_MODE,
  MUTATION_GUARD_ERROR_MSG,
  MUTATION_GUARD_ERROR_CODE,
} from '../../src/admin/admin-mutation-guard.js';
import {
  ADMIN_META_ACTION,
} from '../../src/admin/admin-meta-command-handlers.js';
import {WASM_META_ACTION} from '../../src/constants/index.js';
import {DEPRECATION_WARNING} from
  '../../src/admin/admin-deprecation.js';
import {
  guardedAdaptAdminAction,
} from '../../src/admin/admin-api-adapter.js';

/**
 * All known meta-service action strings.
 * @type {string[]}
 */
const ALL_KNOWN_ACTIONS = [
  ...Object.values(ADMIN_META_ACTION),
  ...Object.values(WASM_META_ACTION),
];

/**
 * Arbitrary that produces only known meta-service actions.
 */
const knownActionArb = fc.constantFrom(...ALL_KNOWN_ACTIONS);

/**
 * Arbitrary that produces strings guaranteed to NOT be
 * known actions. Filters out any collision with the known set.
 */
const unknownActionArb = fc.string({minLength: 1})
  .filter((s) => !ALL_KNOWN_ACTIONS.includes(s));

/**
 * Arbitrary for valid guard modes.
 */
const guardModeArb = fc.constantFrom(
  MUTATION_GUARD_MODE.WARN,
  MUTATION_GUARD_MODE.REJECT,
);

describe('admin-mutation-guard property-based tests', () => {
  it('P1: known actions are always allowed in any mode', () => {
    fc.assert(
      fc.property(
        knownActionArb,
        guardModeArb,
        (action, mode) => {
          const result = guardMutation(action, mode);
          assert.equal(result.allowed, true);
          assert.equal(result.error, undefined);
          assert.equal(result.code, undefined);
        },
      ),
      {numRuns: 10},
    );
  });

  it('P2: unknown actions in reject mode are never allowed',
    () => {
      fc.assert(
        fc.property(
          unknownActionArb,
          (action) => {
            const result = guardMutation(
              action, MUTATION_GUARD_MODE.REJECT,
            );
            assert.equal(result.allowed, false);
            assert.equal(result.error,
              MUTATION_GUARD_ERROR_MSG.BYPASS_REJECTED);
            assert.equal(result.code,
              MUTATION_GUARD_ERROR_CODE.BYPASS_REJECTED);
          },
        ),
        {numRuns: 10},
      );
    });

  it('P3: unknown actions in warn mode are allowed with'
    + ' deprecation warning', () => {
    fc.assert(
      fc.property(
        unknownActionArb,
        (action) => {
          const result = guardMutation(
            action, MUTATION_GUARD_MODE.WARN,
          );
          assert.equal(result.allowed, true);
          assert.equal(result.warning,
            DEPRECATION_WARNING.DIRECT_MUTATION);
        },
      ),
      {numRuns: 10},
    );
  });

  it('P4: guardedAdaptAdminAction blocks unknown actions in'
    + ' reject mode before adapter dispatch', () => {
    fc.assert(
      fc.property(
        unknownActionArb,
        (action) => {
          const result = guardedAdaptAdminAction(
            action, {}, null, MUTATION_GUARD_MODE.REJECT,
          );
          assert.equal(result.success, false);
          assert.equal(result.code,
            MUTATION_GUARD_ERROR_CODE.BYPASS_REJECTED);
          // Guard blocks — adapter never runs, so no
          // UNKNOWN_ACTION code
          assert.notEqual(result.code, 'UNKNOWN_ACTION');
        },
      ),
      {numRuns: 10},
    );
  });
});
