/**
 * Property Test: Size Formatting Round Trip
 * Property 31: For any non-negative size value in bytes, formatting it to a
 * string and then parsing the numeric part should yield a value within 10%
 * of the original (to account for unit conversion and rounding).
 *
 * **Validates: Requirements 4.8**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {TablesView, SIZE_UNITS} from '../../../src/cli/views/tables-view.js';

/**
 * Parse a formatted size string back to bytes
 * @param {string} formatted - Formatted size string (e.g., "1.5 MB")
 * @return {number|null} Size in bytes or null if unparseable
 */
function parseFormattedSize(formatted) {
  if (formatted === 'N/A') return null;

  const match = formatted.match(/^([\d.]+)\s*(\w+)$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2];

  const unitIndex = SIZE_UNITS.indexOf(unit);
  if (unitIndex === -1) return null;

  return value * Math.pow(1024, unitIndex);
}

test('Property 31: Size Formatting Round Trip', async (t) => {
  await t.test('formatted size parses back within 10% of original',
    async (t) => {
      fc.assert(
        fc.property(
          fc.integer({min: 1, max: 1099511627776}), // 1 byte to 1 TB
          (bytes) => {
            const view = new TablesView();
            const formatted = view.formatSize(bytes);
            const parsed = parseFormattedSize(formatted);

            if (parsed === null) return false;

            // Allow 10% tolerance for rounding
            const tolerance = bytes * 0.1;
            const diff = Math.abs(parsed - bytes);

            return diff <= tolerance;
          },
        ),
        {numRuns: 10},
      );
      t.pass('formatted size parses back within 10% of original');
    });

  await t.test('zero bytes formats correctly', async (t) => {
    const view = new TablesView();
    const formatted = view.formatSize(0);

    t.equal(formatted, '0 B');
  });

  await t.test('null/undefined returns N/A', async (t) => {
    const view = new TablesView();

    t.equal(view.formatSize(null), 'N/A');
    t.equal(view.formatSize(undefined), 'N/A');
  });

  await t.test('formatted string contains valid unit', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 0, max: 1099511627776}),
        (bytes) => {
          const view = new TablesView();
          const formatted = view.formatSize(bytes);

          if (formatted === 'N/A') return true;

          // Check that the unit is valid
          return SIZE_UNITS.some((unit) => formatted.endsWith(unit));
        },
      ),
      {numRuns: 10},
    );
    t.pass('formatted string contains valid unit');
  });

  await t.test('larger values use larger units', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1024, max: 1048576}), // 1 KB to 1 MB
        (bytes) => {
          const view = new TablesView();
          const formatted = view.formatSize(bytes);

          // Should not be in bytes for values >= 1024
          return !formatted.endsWith(' B') || bytes < 1024;
        },
      ),
      {numRuns: 10},
    );
    t.pass('larger values use larger units');
  });

  await t.test('numeric part is reasonable', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 1099511627776}),
        (bytes) => {
          const view = new TablesView();
          const formatted = view.formatSize(bytes);

          const match = formatted.match(/^([\d.]+)/);
          if (!match) return false;

          const numericPart = parseFloat(match[1]);

          // Numeric part should be between 0 and 1024
          // (since we use 1024-based units)
          // Allow up to 1024 for edge cases at unit boundaries
          return numericPart >= 0 && numericPart <= 1024;
        },
      ),
      {numRuns: 10},
    );
    t.pass('numeric part is reasonable');
  });

  await t.test('formatting is deterministic', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 0, max: 1099511627776}),
        (bytes) => {
          const view = new TablesView();

          const formatted1 = view.formatSize(bytes);
          const formatted2 = view.formatSize(bytes);

          return formatted1 === formatted2;
        },
      ),
      {numRuns: 10},
    );
    t.pass('formatting is deterministic');
  });

  await t.test('specific size boundaries format correctly', async (t) => {
    const view = new TablesView();

    // Test exact boundaries
    t.equal(view.formatSize(1), '1.0 B');
    t.equal(view.formatSize(1024), '1.0 KB');
    t.equal(view.formatSize(1048576), '1.0 MB');
    t.equal(view.formatSize(1073741824), '1.0 GB');
    t.equal(view.formatSize(1099511627776), '1.0 TB');
  });

  await t.test('fractional values format with one decimal', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 1099511627776}),
        (bytes) => {
          const view = new TablesView();
          const formatted = view.formatSize(bytes);

          // Should have exactly one decimal place
          const match = formatted.match(/^(\d+)\.(\d+)/);
          if (!match) return true; // Integer values are okay

          return match[2].length === 1;
        },
      ),
      {numRuns: 10},
    );
    t.pass('fractional values format with one decimal');
  });
});
