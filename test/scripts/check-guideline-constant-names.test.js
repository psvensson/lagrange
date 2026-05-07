import {test} from '../../src/test-helpers/tap.js';
import {
  OPAQUE_LOCAL_CONSTANT_NAME_PATTERN,
  collectOpaqueConstantNameViolationsFromSource,
} from '../../scripts/check-guideline-constant-names.js';

const TEST_FILE_PATH = '/repo/src/runtime/owner.js';
const TEST_OPAQUE_STRING_NAME = 'LOCAL_STR_MX5FT';
const TEST_OPAQUE_NUMBER_NAME = 'LOCAL_NUM_90';
const TEST_SEMANTIC_STRING_NAME = 'LOCAL_STR_READY_STATE';
const TEST_SEMANTIC_NUMBER_NAME = 'LOCAL_NUM_RETRY_LIMIT';

test('opaque constant-name pattern distinguishes generated tokens from semantic names',
  (t) => {
    t.equal(
      OPAQUE_LOCAL_CONSTANT_NAME_PATTERN.test(TEST_OPAQUE_STRING_NAME),
      true,
    );
    t.equal(
      OPAQUE_LOCAL_CONSTANT_NAME_PATTERN.test(TEST_OPAQUE_NUMBER_NAME),
      true,
    );
    t.equal(
      OPAQUE_LOCAL_CONSTANT_NAME_PATTERN.test(TEST_SEMANTIC_STRING_NAME),
      false,
    );
    t.equal(
      OPAQUE_LOCAL_CONSTANT_NAME_PATTERN.test(TEST_SEMANTIC_NUMBER_NAME),
      false,
    );
    t.end();
  });

test('constant-name guard flags opaque generated local constants', (t) => {
  const violations = collectOpaqueConstantNameViolationsFromSource(
    [
      `const ${TEST_OPAQUE_STRING_NAME} = 'failed';`,
      `const ${TEST_SEMANTIC_STRING_NAME} = 'ready';`,
      `const ${TEST_OPAQUE_NUMBER_NAME} = 90;`,
      `const ${TEST_SEMANTIC_NUMBER_NAME} = 3;`,
    ].join('\n'),
    TEST_FILE_PATH,
  );

  t.same(
    violations.map((violation) => violation.value),
    [
      TEST_OPAQUE_STRING_NAME,
      TEST_OPAQUE_NUMBER_NAME,
    ],
  );
  t.equal(violations[0].kind, 'opaque_generated_constant_name');
  t.end();
});
