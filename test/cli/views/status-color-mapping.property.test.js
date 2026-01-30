/**
 * Property Test: Status Color Mapping
 * Property 13: For any entity status value, the color mapping should be
 * deterministic: 'active' → green, warning conditions → yellow, 'failed' → red.
 *
 * **Validates: Requirements 17.1**
 */

import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {BaseView, ROW_STATUS, STATUS_COLORS} from
  '../../../src/cli/core/base-view.js';

test('Property 13: Status Color Mapping', async (t) => {
  await t.test('STATUS_COLORS has correct mappings', async (t) => {
    // Verify the color constants are correct
    t.equal(STATUS_COLORS.normal, 'white', 'normal maps to white');
    t.equal(STATUS_COLORS.warning, 'yellow', 'warning maps to yellow');
    t.equal(STATUS_COLORS.error, 'red', 'error maps to red');
    t.equal(STATUS_COLORS.changed, 'cyan', 'changed maps to cyan');
  });

  await t.test('styleRow applies normal color for normal status', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.string({minLength: 1, maxLength: 10}), {
          minLength: 1,
          maxLength: 5,
        }),
        (rowValues) => {
          const view = new BaseView();
          const styled = view.styleRow(rowValues, ROW_STATUS.NORMAL,
            false, false);

          // All cells should have white color
          return styled.every((cell) =>
            cell.includes('white') || cell.includes(STATUS_COLORS.normal));
        },
      ),
      {numRuns: 10},
    );
    t.pass('styleRow applies normal color for normal status');
  });

  await t.test('styleRow applies warning color for warning status', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.string({minLength: 1, maxLength: 10}), {
          minLength: 1,
          maxLength: 5,
        }),
        (rowValues) => {
          const view = new BaseView();
          const styled = view.styleRow(rowValues, ROW_STATUS.WARNING,
            false, false);

          // All cells should have yellow color
          return styled.every((cell) =>
            cell.includes('yellow') || cell.includes(STATUS_COLORS.warning));
        },
      ),
      {numRuns: 10},
    );
    t.pass('styleRow applies warning color for warning status');
  });

  await t.test('styleRow applies error color for error status', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.string({minLength: 1, maxLength: 10}), {
          minLength: 1,
          maxLength: 5,
        }),
        (rowValues) => {
          const view = new BaseView();
          const styled = view.styleRow(rowValues, ROW_STATUS.ERROR,
            false, false);

          // All cells should have red color
          return styled.every((cell) =>
            cell.includes('red') || cell.includes(STATUS_COLORS.error));
        },
      ),
      {numRuns: 10},
    );
    t.pass('styleRow applies error color for error status');
  });

  await t.test('styleRow applies changed color when isChanged is true',
    async (t) => {
      fc.assert(
        fc.property(
          fc.array(fc.string({minLength: 1, maxLength: 10}), {
            minLength: 1,
            maxLength: 5,
          }),
          fc.constantFrom(ROW_STATUS.NORMAL, ROW_STATUS.WARNING,
            ROW_STATUS.ERROR),
          (rowValues, status) => {
            const view = new BaseView();
            const styled = view.styleRow(rowValues, status, true, false);

            // Changed rows should have cyan color regardless of status
            return styled.every((cell) =>
              cell.includes('cyan') ||
                    cell.includes(STATUS_COLORS.changed));
          },
        ),
        {numRuns: 10},
      );
      t.pass('styleRow applies changed color when isChanged is true');
    });

  await t.test('styleRow applies inverse for selected rows', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.string({minLength: 1, maxLength: 10}), {
          minLength: 1,
          maxLength: 5,
        }),
        fc.constantFrom(ROW_STATUS.NORMAL, ROW_STATUS.WARNING,
          ROW_STATUS.ERROR),
        (rowValues, status) => {
          const view = new BaseView();
          const styled = view.styleRow(rowValues, status, false, true);

          // Selected rows should have inverse styling
          return styled.every((cell) => cell.includes('inverse'));
        },
      ),
      {numRuns: 10},
    );
    t.pass('styleRow applies inverse for selected rows');
  });

  await t.test('color mapping is deterministic', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.string({minLength: 1, maxLength: 10}), {
          minLength: 1,
          maxLength: 5,
        }),
        fc.constantFrom(ROW_STATUS.NORMAL, ROW_STATUS.WARNING,
          ROW_STATUS.ERROR),
        fc.boolean(),
        fc.boolean(),
        (rowValues, status, isChanged, isSelected) => {
          const view = new BaseView();

          // Call styleRow twice with same inputs
          const styled1 = view.styleRow(rowValues, status, isChanged,
            isSelected);
          const styled2 = view.styleRow(rowValues, status, isChanged,
            isSelected);

          // Results should be identical
          if (styled1.length !== styled2.length) return false;

          for (let i = 0; i < styled1.length; i++) {
            if (styled1[i] !== styled2[i]) return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('color mapping is deterministic');
  });

  await t.test('ROW_STATUS constants are correct', async (t) => {
    t.equal(ROW_STATUS.NORMAL, 'normal');
    t.equal(ROW_STATUS.WARNING, 'warning');
    t.equal(ROW_STATUS.ERROR, 'error');
  });

  await t.test('all row values are styled', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.string({minLength: 1, maxLength: 10}), {
          minLength: 1,
          maxLength: 5,
        }),
        fc.constantFrom(ROW_STATUS.NORMAL, ROW_STATUS.WARNING,
          ROW_STATUS.ERROR),
        (rowValues, status) => {
          const view = new BaseView();
          const styled = view.styleRow(rowValues, status, false, false);

          // Output should have same length as input
          if (styled.length !== rowValues.length) return false;

          // Each cell should have styling tags
          return styled.every((cell) =>
            cell.includes('{') && cell.includes('}'));
        },
      ),
      {numRuns: 10},
    );
    t.pass('all row values are styled');
  });
});
