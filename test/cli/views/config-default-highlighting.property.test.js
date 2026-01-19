/**
 * Property Test: Config Default Highlighting
 * Property 45: For any config entry where value differs from default_value,
 * the row should have warning styling applied.
 *
 * **Validates: Requirements 30.7**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {ConfigView, CONFIG_TYPES} from '../../../src/cli/views/config-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

/**
 * Generate a config value based on type
 */
const configValueArb = (type) => {
  switch (type) {
  case 'string':
    return fc.string({minLength: 0, maxLength: 50});
  case 'number':
    return fc.integer({min: -1000, max: 1000});
  case 'boolean':
    return fc.boolean();
  case 'json':
    return fc.record({
      a: fc.integer(),
      b: fc.string({maxLength: 10}),
    });
  default:
    return fc.string({minLength: 0, maxLength: 50});
  }
};

/**
 * Generate a valid config record
 */
const configArb = fc.record({
  key: fc.string({minLength: 1, maxLength: 30}).filter((s) => s.trim().length > 0),
  type: fc.constantFrom(...CONFIG_TYPES),
  requires_restart: fc.boolean(),
  pending_restart: fc.boolean(),
  updated_at: fc.integer({min: 1000000000000, max: 2000000000000}),
}).chain((base) => {
  return fc.record({
    ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, fc.constant(v)])),
    value: configValueArb(base.type),
    default_value: configValueArb(base.type),
  });
});

/**
 * Generate a config record where value equals default_value
 */
const configWithMatchingDefaultArb = fc.record({
  key: fc.string({minLength: 1, maxLength: 30}).filter((s) => s.trim().length > 0),
  type: fc.constantFrom(...CONFIG_TYPES),
  requires_restart: fc.constant(false),
  pending_restart: fc.constant(false),
  updated_at: fc.integer({min: 1000000000000, max: 2000000000000}),
}).chain((base) => {
  return configValueArb(base.type).map((value) => ({
    ...base,
    value,
    default_value: value, // Same as value
  }));
});

/**
 * Generate a config record where value differs from default_value
 */
const configWithDifferentDefaultArb = fc.record({
  key: fc.string({minLength: 1, maxLength: 30}).filter((s) => s.trim().length > 0),
  type: fc.constantFrom('string', 'number'), // Use types where we can guarantee difference
  requires_restart: fc.constant(false),
  pending_restart: fc.constant(false),
  updated_at: fc.integer({min: 1000000000000, max: 2000000000000}),
}).chain((base) => {
  if (base.type === 'number') {
    return fc.tuple(
      fc.integer({min: 0, max: 100}),
      fc.integer({min: 101, max: 200}),
    ).map(([value, defaultValue]) => ({
      ...base,
      value,
      default_value: defaultValue,
    }));
  } else {
    return fc.tuple(
      fc.string({minLength: 1, maxLength: 10}),
      fc.string({minLength: 11, maxLength: 20}),
    ).map(([value, defaultValue]) => ({
      ...base,
      value,
      default_value: defaultValue,
    }));
  }
});

test('Property 45: Config Default Highlighting', async (t) => {
  await t.test('configs with matching default return NORMAL status', async (t) => {
    fc.assert(
      fc.property(
        configWithMatchingDefaultArb,
        (config) => {
          const view = new ConfigView();
          return view.getRowStatus(config) === ROW_STATUS.NORMAL;
        },
      ),
      {numRuns: 10},
    );
    t.pass('configs with matching default return NORMAL status');
  });

  await t.test('configs with different default return WARNING status', async (t) => {
    fc.assert(
      fc.property(
        configWithDifferentDefaultArb,
        (config) => {
          const view = new ConfigView();
          return view.getRowStatus(config) === ROW_STATUS.WARNING;
        },
      ),
      {numRuns: 10},
    );
    t.pass('configs with different default return WARNING status');
  });

  await t.test('isDifferentFromDefault returns false for matching values', async (t) => {
    fc.assert(
      fc.property(
        configWithMatchingDefaultArb,
        (config) => {
          const view = new ConfigView();
          return view.isDifferentFromDefault(config) === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('isDifferentFromDefault returns false for matching values');
  });

  await t.test('isDifferentFromDefault returns true for different values', async (t) => {
    fc.assert(
      fc.property(
        configWithDifferentDefaultArb,
        (config) => {
          const view = new ConfigView();
          return view.isDifferentFromDefault(config) === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('isDifferentFromDefault returns true for different values');
  });

  await t.test('configs without default_value property return NORMAL', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          key: fc.string({minLength: 1, maxLength: 30}).filter((s) => s.trim().length > 0),
          value: fc.integer(),
          type: fc.constant('number'),
          requires_restart: fc.constant(false),
          pending_restart: fc.constant(false),
        }),
        (config) => {
          const view = new ConfigView();
          // Config without default_value should be considered normal
          return view.getRowStatus(config) === ROW_STATUS.NORMAL;
        },
      ),
      {numRuns: 10},
    );
    t.pass('configs without default_value property return NORMAL');
  });

  await t.test('pending_restart configs return WARNING regardless of default', async (t) => {
    fc.assert(
      fc.property(
        configWithMatchingDefaultArb.map((config) => ({
          ...config,
          requires_restart: true,
          pending_restart: true,
        })),
        (config) => {
          const view = new ConfigView();
          return view.getRowStatus(config) === ROW_STATUS.WARNING;
        },
      ),
      {numRuns: 10},
    );
    t.pass('pending_restart configs return WARNING regardless of default');
  });

  await t.test('rendered rows have correct status based on default comparison', async (t) => {
    fc.assert(
      fc.property(
        fc.array(configArb, {minLength: 1, maxLength: 5}),
        (configs) => {
          // Ensure unique keys
          const uniqueConfigs = [];
          const seenKeys = new Set();
          for (const config of configs) {
            if (!seenKeys.has(config.key)) {
              seenKeys.add(config.key);
              uniqueConfigs.push(config);
            }
          }

          const view = new ConfigView();
          view.setData(uniqueConfigs);
          const rendered = view.render();

          // Each row's status should match the expected highlighting
          return rendered.rows.every((row) => {
            const config = row.item;
            const expectedWarning =
                  (config.requires_restart && config.pending_restart) ||
                  view.isDifferentFromDefault(config);

            if (expectedWarning) {
              return row.status === ROW_STATUS.WARNING;
            } else {
              return row.status === ROW_STATUS.NORMAL;
            }
          });
        },
      ),
      {numRuns: 10},
    );
    t.pass('rendered rows have correct status based on default comparison');
  });

  await t.test('null value vs non-null default returns WARNING', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          key: fc.string({minLength: 1, maxLength: 30}).filter((s) => s.trim().length > 0),
          value: fc.constant(null),
          default_value: fc.integer({min: 1, max: 100}),
          type: fc.constant('number'),
          requires_restart: fc.constant(false),
          pending_restart: fc.constant(false),
        }),
        (config) => {
          const view = new ConfigView();
          return view.getRowStatus(config) === ROW_STATUS.WARNING;
        },
      ),
      {numRuns: 10},
    );
    t.pass('null value vs non-null default returns WARNING');
  });

  await t.test('non-null value vs null default returns WARNING', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          key: fc.string({minLength: 1, maxLength: 30}).filter((s) => s.trim().length > 0),
          value: fc.integer({min: 1, max: 100}),
          default_value: fc.constant(null),
          type: fc.constant('number'),
          requires_restart: fc.constant(false),
          pending_restart: fc.constant(false),
        }),
        (config) => {
          const view = new ConfigView();
          return view.getRowStatus(config) === ROW_STATUS.WARNING;
        },
      ),
      {numRuns: 10},
    );
    t.pass('non-null value vs null default returns WARNING');
  });

  await t.test('both null value and default returns NORMAL', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          key: fc.string({minLength: 1, maxLength: 30}).filter((s) => s.trim().length > 0),
          value: fc.constant(null),
          default_value: fc.constant(null),
          type: fc.constant('string'),
          requires_restart: fc.constant(false),
          pending_restart: fc.constant(false),
        }),
        (config) => {
          const view = new ConfigView();
          return view.getRowStatus(config) === ROW_STATUS.NORMAL;
        },
      ),
      {numRuns: 10},
    );
    t.pass('both null value and default returns NORMAL');
  });
});
