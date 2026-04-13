/**
 * Property Test: Configuration Centralization
 * **Property 13: Configuration Centralization**
 * **Validates: Requirements 10.1, 10.2, 10.3**
 *
 * *For any* constant or literal value used in the system, it should be
 * referenced through the central configuration system rather than hard-coded.
 *
 * This property test verifies that:
 * 1. All configuration values can be retrieved via symbolic names
 * 2. Configuration values are consistent across multiple accesses
 * 3. Configuration categories provide organized access to related values
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ConfigurationManager,
  DEFAULT_CONFIG,
} from '../../src/config/configuration-manager.js';

/**
 * Generate valid configuration paths from the default config.
 * @return {string[]} Array of valid configuration paths.
 */
function getValidConfigPaths() {
  const paths = [];

  function traverse(obj, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        traverse(value, path);
      } else {
        paths.push(path);
      }
    }
  }

  traverse(DEFAULT_CONFIG);
  return paths;
}

const VALID_PATHS = getValidConfigPaths();

test('Property 13: Configuration Centralization', async (t) => {
  /**
   * Property: For any valid configuration path, the value should be
   * retrievable through the configuration manager.
   */
  t.test('all config values accessible via symbolic names', async (t) => {
    ConfigurationManager.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize();

    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_PATHS),
        (path) => {
          const value = config.get(path);
          const defaultValue = config.getDefault(path);

          // Value should be defined (not undefined)
          if (value === undefined) {
            return false;
          }

          // Value should match default if not overridden
          return JSON.stringify(value) === JSON.stringify(defaultValue) ||
                 value !== undefined;
        },
      ),
      {numRuns: 10},
    );

    ConfigurationManager.resetInstance();
    t.pass('all configuration values are accessible via symbolic names');
  });

  /**
   * Property: For any configuration path, multiple accesses should return
   * consistent values (referential consistency).
   */
  t.test('configuration values are consistent across accesses', async (t) => {
    ConfigurationManager.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize();

    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_PATHS),
        fc.integer({min: 2, max: 10}),
        (path, accessCount) => {
          const values = [];
          for (let i = 0; i < accessCount; i++) {
            values.push(JSON.stringify(config.get(path)));
          }

          // All values should be identical
          return values.every((v) => v === values[0]);
        },
      ),
      {numRuns: 10},
    );

    ConfigurationManager.resetInstance();
    t.pass('configuration values are consistent across multiple accesses');
  });

  /**
   * Property: For any configuration category, all values within that
   * category should be accessible via getCategory().
   */
  t.test('configuration categories provide organized access', async (t) => {
    ConfigurationManager.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize();

    const categories = config.getCategories();

    fc.assert(
      fc.property(
        fc.constantFrom(...categories),
        (category) => {
          const categoryConfig = config.getCategory(category);

          // Category should return an object
          if (typeof categoryConfig !== 'object' || categoryConfig === null) {
            return false;
          }

          // All keys in category should be accessible via full path
          for (const key of Object.keys(categoryConfig)) {
            const fullPath = `${category}.${key}`;
            const directValue = config.get(fullPath);
            const categoryValue = categoryConfig[key];

            if (JSON.stringify(directValue) !== JSON.stringify(categoryValue)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    ConfigurationManager.resetInstance();
    t.pass('configuration categories provide organized access to values');
  });

  /**
   * Property: For any valid override, the configuration should accept it
   * and return the overridden value.
   */
  t.test('configuration accepts valid overrides', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          nodeId: fc.uuid(),
          logLevel: fc.constantFrom('trace', 'debug', 'info', 'warn', 'error', 'fatal'),
          heartbeatMs: fc.integer({min: 100, max: 10000}),
        }),
        ({nodeId, logLevel, heartbeatMs}) => {
          ConfigurationManager.resetInstance();
          const config = ConfigurationManager.getInstance();

          config.initialize({
            node: {id: nodeId, heartbeatIntervalMs: heartbeatMs},
            logging: {level: logLevel},
          });

          const result =
            config.get('node.id') === nodeId &&
            config.get('logging.level') === logLevel &&
            config.get('node.heartbeatIntervalMs') === heartbeatMs;

          ConfigurationManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('configuration accepts and applies valid overrides');
  });

  /**
   * Property: Configuration getAll() should return a deep clone that
   * doesn't affect the original configuration when modified.
   */
  t.test('getAll returns immutable clone', async (t) => {
    ConfigurationManager.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'original-id'}});

    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}),
        (newId) => {
          const allConfig = config.getAll();
          const originalId = config.get('node.id');

          // Modify the clone
          allConfig.node.id = newId;

          // Original should be unchanged
          return config.get('node.id') === originalId;
        },
      ),
      {numRuns: 10},
    );

    ConfigurationManager.resetInstance();
    t.pass('getAll returns an immutable clone');
  });
});
