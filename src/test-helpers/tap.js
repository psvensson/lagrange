/**
 * Shared tap exports for repository tests.
 *
 * This module intentionally keeps tap runtime behavior unmodified so child test
 * output is parsed consistently by the tap CLI.
 */

// tap exits non-zero on incomplete coverage by default. Our repo uses coverage
// as a signal (reporting), but not as a hard gate in `npm test`.
if (!process.env.TAP_ALLOW_INCOMPLETE_COVERAGE) {
  process.env.TAP_ALLOW_INCOMPLETE_COVERAGE = '1';
}

const tap = await import('tap');
const t = tap.default ?? tap;

export const test = t.test.bind(t);
export const beforeEach = t.beforeEach?.bind(t);
export const afterEach = t.afterEach?.bind(t);
export default t;
