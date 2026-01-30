/**
 * Property Test: Configuration Validation
 * Property 14: For any valid configuration object, parsing should succeed
 * and produce correct settings. For any invalid configuration, defaults
 * should be used for invalid fields.
 *
 * **Validates: Requirements 18.2, 18.4**
 */

import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ConfigManager} from '../../../src/cli/core/config-manager.js';

// Valid configuration values
const VALID_VIEWS = [
  'nodes', 'services', 'tables', 'partitions',
  'message_groups', 'sql', 'logs', 'config', 'contexts',
];
const VALID_COLOR_SCHEMES = ['default', 'monochrome'];

test('Property 14: Configuration Validation', async (t) => {
  await t.test('valid config values are accepted', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1000, max: 60000}),
        fc.constantFrom(...VALID_VIEWS),
        fc.constantFrom(...VALID_COLOR_SCHEMES),
        fc.boolean(),
        fc.integer({min: 1000, max: 30000}),
        (refreshInterval, defaultView, colorScheme, readOnly, cdcLag) => {
          const manager = new ConfigManager();

          // Validate individual fields
          const refreshResult = manager.validateField(
            'refresh_interval', refreshInterval,
          );
          const viewResult = manager.validateField(
            'default_view', defaultView,
          );
          const colorResult = manager.validateField(
            'color_scheme', colorScheme,
          );
          const readOnlyResult = manager.validateField(
            'read_only_mode', readOnly,
          );
          const cdcResult = manager.validateField(
            'cdc_lag_threshold', cdcLag,
          );

          return refreshResult.valid &&
                     viewResult.valid &&
                     colorResult.valid &&
                     readOnlyResult.valid &&
                     cdcResult.valid;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Valid config values are accepted');
  });

  await t.test('invalid refresh_interval uses default', async (t) => {
    fc.assert(
      fc.property(
        // Generate invalid refresh intervals (too small or too large)
        fc.oneof(
          fc.integer({min: -1000, max: 999}),
          fc.integer({min: 60001, max: 100000}),
        ),
        (invalidInterval) => {
          const manager = new ConfigManager();
          const defaultValue = manager.getDefault('refresh_interval');

          // Apply invalid CLI arg
          manager.applyCliArgs({refresh: invalidInterval});

          // Should use default and generate warning
          return manager.get('refresh_interval') === defaultValue &&
                     manager.hasWarnings();
        },
      ),
      {numRuns: 10},
    );
    t.pass('Invalid refresh_interval uses default');
  });

  await t.test('invalid default_view uses default', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20})
          .filter((s) => !VALID_VIEWS.includes(s)),
        (invalidView) => {
          const manager = new ConfigManager();
          const defaultValue = manager.getDefault('default_view');

          // Apply invalid CLI arg
          manager.applyCliArgs({view: invalidView});

          // Should use default and generate warning
          return manager.get('default_view') === defaultValue &&
                     manager.hasWarnings();
        },
      ),
      {numRuns: 10},
    );
    t.pass('Invalid default_view uses default');
  });

  await t.test('CLI args override file and env config', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1000, max: 60000}),
        fc.constantFrom(...VALID_VIEWS),
        (refreshInterval, view) => {
          const manager = new ConfigManager();

          // Apply CLI args
          manager.applyCliArgs({
            refresh: refreshInterval,
            view: view,
          });

          // CLI values should be applied
          return manager.get('refresh_interval') === refreshInterval &&
                     manager.get('default_view') === view;
        },
      ),
      {numRuns: 10},
    );
    t.pass('CLI args override file and env config');
  });

  await t.test('validateConfig returns errors for invalid fields', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 10})
          .filter((s) => !VALID_VIEWS.includes(s)),
        fc.string({minLength: 1, maxLength: 10})
          .filter((s) => !VALID_COLOR_SCHEMES.includes(s)),
        (invalidView, invalidColor) => {
          const manager = new ConfigManager();

          const result = manager.validateConfig({
            default_view: invalidView,
            color_scheme: invalidColor,
          });

          // Should be invalid with 2 errors
          return !result.valid && result.errors.length === 2;
        },
      ),
      {numRuns: 10},
    );
    t.pass('validateConfig returns errors for invalid fields');
  });

  await t.test('valid complete config passes validation', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1000, max: 60000}),
        fc.constantFrom(...VALID_VIEWS),
        fc.constantFrom(...VALID_COLOR_SCHEMES),
        fc.boolean(),
        fc.boolean(),
        (refreshInterval, view, colorScheme, cachePersist, readOnly) => {
          const manager = new ConfigManager();

          const config = {
            refresh_interval: refreshInterval,
            default_view: view,
            color_scheme: colorScheme,
            cache_persistence: cachePersist,
            read_only_mode: readOnly,
          };

          const result = manager.validateConfig(config);
          return result.valid && result.errors.length === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Valid complete config passes validation');
  });

  await t.test('non-number refresh_interval is rejected', async (t) => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.boolean(),
          fc.constant(null),
          fc.array(fc.integer()),
        ),
        (invalidValue) => {
          const manager = new ConfigManager();
          const result = manager.validateField('refresh_interval', invalidValue);
          return !result.valid;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Non-number refresh_interval is rejected');
  });

  await t.test('non-string view is rejected', async (t) => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.array(fc.string()),
        ),
        (invalidValue) => {
          const manager = new ConfigManager();
          const result = manager.validateField('default_view', invalidValue);
          return !result.valid;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Non-string view is rejected');
  });

  await t.test('non-boolean read_only_mode is rejected', async (t) => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.string(),
          fc.constant(null),
          fc.array(fc.boolean()),
        ),
        (invalidValue) => {
          const manager = new ConfigManager();
          const result = manager.validateField('read_only_mode', invalidValue);
          return !result.valid;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Non-boolean read_only_mode is rejected');
  });
});
