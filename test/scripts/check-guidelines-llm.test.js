import {test} from '../../src/test-helpers/tap.js';
import {
  filterViolations,
  isFalsePositivePattern,
} from '../../scripts/check-guidelines-llm.js';

const DATE_NOW_FALSE_POSITIVE = {
  title: 'Magic literal from Date.now()',
  description: 'This flags Date.now() as a raw numeric literal in runtime code.',
  suggestedFix: 'Replace Date.now() with a shared constant.',
};

const FILE_LOCAL_CONSTANT_FALSE_POSITIVE = {
  title: 'Magic number in retry configuration',
  description: 'A file-local constant defines the retry delay for this module.',
  suggestedFix: 'Move the file-local constant into a shared constants module.',
};

const TEST_INFRA_FALSE_POSITIVE = {
  title: 'Swallowed cleanup error in test teardown',
  description: 'afterEach cleanup logs the error and continues in the test.',
  suggestedFix: 'Rethrow the cleanup error from the test.',
};

const REAL_RUNTIME_VIOLATION = {
  title: 'Magic literal in runtime branch',
  description: 'Runtime logic returns an inline ready-state label from executable code.',
  suggestedFix: 'Move the inline runtime value into a named owner.',
  ruleReference: 'system guidelines.md §4.1 Constants, Not Literals',
};

const SPECULATIVE_VIOLATION = {
  title: 'Potential parallel owner concern',
  description: 'This likely introduces a duplicate owner path.',
  suggestedFix: 'Search the codebase to verify the ownership boundary.',
  ruleReference: 'system guidelines.md §3.2 Owner Paths',
};

const TEST_FILE_CONSTANTS_VIOLATION = {
  title: 'Magic string in test fixture',
  description: 'Test setup uses a raw string literal.',
  suggestedFix: 'Move the literal into a shared constants module.',
  ruleReference: 'system guidelines.md §4.1 Constants, Not Literals',
};

test('isFalsePositivePattern ignores Date.now language primitive reports', async (t) => {
  t.equal(isFalsePositivePattern(DATE_NOW_FALSE_POSITIVE), true);
});

test('isFalsePositivePattern ignores file-local constant owner reports', async (t) => {
  t.equal(isFalsePositivePattern(FILE_LOCAL_CONSTANT_FALSE_POSITIVE), true);
});

test('isFalsePositivePattern ignores standard test cleanup reports', async (t) => {
  t.equal(isFalsePositivePattern(TEST_INFRA_FALSE_POSITIVE), true);
});

test('isFalsePositivePattern keeps concrete runtime violations', async (t) => {
  t.equal(isFalsePositivePattern(REAL_RUNTIME_VIOLATION), false);
});

test('filterViolations removes speculative and false-positive violations', async (t) => {
  const filtered = filterViolations(
    'src/runtime/state-owner.js',
    [
      DATE_NOW_FALSE_POSITIVE,
      SPECULATIVE_VIOLATION,
      REAL_RUNTIME_VIOLATION,
    ],
  );

  t.same(filtered, [REAL_RUNTIME_VIOLATION]);
});

test('filterViolations suppresses constants-only findings in test files', async (t) => {
  const filtered = filterViolations(
    'test/runtime/state-owner.test.js',
    [TEST_FILE_CONSTANTS_VIOLATION],
  );

  t.equal(filtered.length, 0);
});
