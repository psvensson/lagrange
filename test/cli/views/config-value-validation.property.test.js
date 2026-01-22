/**
 * Property Test: Config View Value Validation
 * Property 44: For any config value edit, the validation should accept values
 * matching the expected type and reject values that don't match.
 *
 * **Validates: Requirements 30.5**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {ConfigView, CONFIG_TYPES} from '../../../src/cli/views/config-view.js';

test('Property 44: Config View Value Validation', async (t) => {
  await t.test('valid string values are accepted', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 0, maxLength: 100}),
        (value) => {
          const view = new ConfigView();
          const result = view.validateValue(value, 'string');
          return result.valid === true && result.parsedValue === value.trim();
        },
      ),
      {numRuns: 10},
    );
    t.pass('valid string values are accepted');
  });

  await t.test('valid integer values are accepted as numbers', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: -1000000, max: 1000000}),
        (num) => {
          const view = new ConfigView();
          const result = view.validateValue(String(num), 'number');
          return result.valid === true && result.parsedValue === num;
        },
      ),
      {numRuns: 10},
    );
    t.pass('valid integer values are accepted as numbers');
  });

  await t.test('valid float values are accepted as numbers', async (t) => {
    fc.assert(
      fc.property(
        fc.float({min: -1000, max: 1000, noNaN: true}),
        (num) => {
          const view = new ConfigView();
          const result = view.validateValue(String(num), 'number');
          // Float parsing may have precision differences
          return result.valid === true && typeof result.parsedValue === 'number';
        },
      ),
      {numRuns: 10},
    );
    t.pass('valid float values are accepted as numbers');
  });

  await t.test('non-numeric strings are rejected for number type', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20}).filter((s) => {
          // Filter to strings that are not valid numbers
          const trimmed = s.trim();
          return trimmed !== '' && isNaN(Number(trimmed));
        }),
        (value) => {
          const view = new ConfigView();
          const result = view.validateValue(value, 'number');
          return result.valid === false && typeof result.error === 'string';
        },
      ),
      {numRuns: 10},
    );
    t.pass('non-numeric strings are rejected for number type');
  });

  await t.test('boolean true values are accepted', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom('true', 'TRUE', 'True', 'yes', 'YES', 'Yes', '1'),
        (value) => {
          const view = new ConfigView();
          const result = view.validateValue(value, 'boolean');
          return result.valid === true && result.parsedValue === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('boolean true values are accepted');
  });

  await t.test('boolean false values are accepted', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom('false', 'FALSE', 'False', 'no', 'NO', 'No', '0'),
        (value) => {
          const view = new ConfigView();
          const result = view.validateValue(value, 'boolean');
          return result.valid === true && result.parsedValue === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('boolean false values are accepted');
  });

  await t.test('invalid boolean strings are rejected', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20}).filter((s) => {
          const lower = s.trim().toLowerCase();
          const validBooleans = ['true', 'false', 'yes', 'no', '1', '0'];
          return !validBooleans.includes(lower);
        }),
        (value) => {
          const view = new ConfigView();
          const result = view.validateValue(value, 'boolean');
          return result.valid === false && typeof result.error === 'string';
        },
      ),
      {numRuns: 10},
    );
    t.pass('invalid boolean strings are rejected');
  });

  await t.test('valid JSON objects are accepted', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          a: fc.integer(),
          b: fc.string({maxLength: 10}),
        }),
        (obj) => {
          const view = new ConfigView();
          const jsonStr = JSON.stringify(obj);
          const result = view.validateValue(jsonStr, 'json');
          return result.valid === true &&
                     JSON.stringify(result.parsedValue) === jsonStr;
        },
      ),
      {numRuns: 10},
    );
    t.pass('valid JSON objects are accepted');
  });

  await t.test('valid JSON arrays are accepted', async (t) => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), {minLength: 0, maxLength: 5}),
        (arr) => {
          const view = new ConfigView();
          const jsonStr = JSON.stringify(arr);
          const result = view.validateValue(jsonStr, 'json');
          return result.valid === true &&
                     JSON.stringify(result.parsedValue) === jsonStr;
        },
      ),
      {numRuns: 10},
    );
    t.pass('valid JSON arrays are accepted');
  });

  await t.test('invalid JSON strings are rejected', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '{invalid}',
          '{a: 1}', // Missing quotes around key
          '{"a": }', // Missing value
          '[1, 2,]', // Trailing comma
          'undefined',
        ),
        (value) => {
          const view = new ConfigView();
          const result = view.validateValue(value, 'json');
          return result.valid === false && typeof result.error === 'string';
        },
      ),
      {numRuns: 10},
    );
    t.pass('invalid JSON strings are rejected');
  });

  await t.test('null values are accepted for all types', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CONFIG_TYPES),
        (type) => {
          const view = new ConfigView();
          const result = view.validateValue(null, type);
          return result.valid === true && result.parsedValue === null;
        },
      ),
      {numRuns: 10},
    );
    t.pass('null values are accepted for all types');
  });

  await t.test('prepareEdit validates type correctly', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CONFIG_TYPES),
        fc.integer({min: 1, max: 100}),
        (type, num) => {
          const view = new ConfigView();
          view.setData([
            {config_key: 'test_config', config_value: 0, value_type: type, requires_restart: false},
          ]);

          // For number type, integer string should be valid
          // For other types, behavior varies
          const result = view.prepareEdit('test_config', String(num));

          if (type === 'number') {
            return result.success === true && result.newValue === num;
          } else if (type === 'string') {
            return result.success === true && result.newValue === String(num);
          } else if (type === 'boolean') {
            // Only '1' is valid for boolean
            if (num === 1) {
              return result.success === true && result.newValue === true;
            }
            return result.success === false;
          } else if (type === 'json') {
            // Plain number is valid JSON
            return result.success === true && result.newValue === num;
          }
          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('prepareEdit validates type correctly');
  });

  await t.test('validation is consistent across multiple calls', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 0, maxLength: 50}),
        fc.constantFrom(...CONFIG_TYPES),
        (value, type) => {
          const view = new ConfigView();
          const result1 = view.validateValue(value, type);
          const result2 = view.validateValue(value, type);

          // Same input should produce same result
          return result1.valid === result2.valid;
        },
      ),
      {numRuns: 10},
    );
    t.pass('validation is consistent across multiple calls');
  });

  await t.test('empty string handling varies by type', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CONFIG_TYPES),
        (type) => {
          const view = new ConfigView();
          const result = view.validateValue('', type);

          if (type === 'string') {
            // Empty string is valid for string type
            return result.valid === true && result.parsedValue === '';
          } else if (type === 'number' || type === 'json') {
            // Empty string is invalid for number and json
            return result.valid === false;
          } else if (type === 'boolean') {
            // Empty string is invalid for boolean
            return result.valid === false;
          }
          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('empty string handling varies by type');
  });

  await t.test('whitespace-only strings are trimmed for string type', async (t) => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n'), {minLength: 1, maxLength: 10}),
        (whitespace) => {
          const view = new ConfigView();
          const result = view.validateValue(whitespace, 'string');
          return result.valid === true && result.parsedValue === '';
        },
      ),
      {numRuns: 10},
    );
    t.pass('whitespace-only strings are trimmed for string type');
  });
});
