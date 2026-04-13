import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import fc from 'fast-check';
import {
  discoverScenarios,
  filterScenarios,
  DEFAULT_SCENARIOS_DIR,
} from '../scenario-discovery.js';

describe('scenario-discovery', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `scenario-disc-test-${randomUUID()}`);
    await mkdir(tempDir, {recursive: true});
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({type: 'module'}),
    );
  });

  afterEach(async () => {
    try {
      await rm(tempDir, {recursive: true, force: true});
    } catch (_e) {
      // best-effort cleanup
    }
  });

  describe('discoverScenarios', () => {
    it('discovers JS files in the given directory', async () => {
      await writeFile(join(tempDir, 'alpha.js'), 'export function run() {}');
      await writeFile(join(tempDir, 'beta.js'), 'export function run() {}');

      const scenarios = await discoverScenarios(tempDir);

      assert.equal(scenarios.length, 2);
      assert.equal(scenarios[0].name, 'alpha');
      assert.equal(scenarios[1].name, 'beta');
    });

    it('ignores non-JS files', async () => {
      await writeFile(join(tempDir, 'readme.md'), '# readme');
      await writeFile(join(tempDir, 'data.json'), '{}');
      await writeFile(join(tempDir, 'scenario.js'), 'export function run() {}');

      const scenarios = await discoverScenarios(tempDir);

      assert.equal(scenarios.length, 1);
      assert.equal(scenarios[0].name, 'scenario');
    });

    it('returns empty array for empty directory', async () => {
      const scenarios = await discoverScenarios(tempDir);
      assert.deepEqual(scenarios, []);
    });

    it('returns results sorted by name', async () => {
      await writeFile(join(tempDir, 'zebra.js'), 'export function run() {}');
      await writeFile(join(tempDir, 'alpha.js'), 'export function run() {}');
      await writeFile(join(tempDir, 'middle.js'), 'export function run() {}');

      const scenarios = await discoverScenarios(tempDir);

      assert.equal(scenarios[0].name, 'alpha');
      assert.equal(scenarios[1].name, 'middle');
      assert.equal(scenarios[2].name, 'zebra');
    });

    it('includes full path in each scenario entry', async () => {
      await writeFile(
        join(tempDir, 'test-scenario.js'),
        'export function run() {}',
      );

      const scenarios = await discoverScenarios(tempDir);

      assert.equal(scenarios[0].path, join(tempDir, 'test-scenario.js'));
    });

    it('uses DEFAULT_SCENARIOS_DIR when no argument provided', () => {
      assert.equal(DEFAULT_SCENARIOS_DIR, 'test/distributed/scenarios');
    });

    it('strips .js extension from scenario name', async () => {
      await writeFile(
        join(tempDir, 'node-failure-rebalance.js'),
        'export function run() {}',
      );

      const scenarios = await discoverScenarios(tempDir);

      assert.equal(scenarios[0].name, 'node-failure-rebalance');
    });

    it('ignores JS modules that do not export run', async () => {
      await writeFile(join(tempDir, 'helper.js'), 'export const value = 1;');
      await writeFile(join(tempDir, 'scenario.js'), 'export function run() {}');

      const scenarios = await discoverScenarios(tempDir);

      assert.equal(scenarios.length, 1);
      assert.equal(scenarios[0].name, 'scenario');
    });
  });

  describe('filterScenarios', () => {
    const scenarios = [
      {name: 'node-failure-rebalance', path: '/a/node-failure-rebalance.js'},
      {name: 'network-partition', path: '/a/network-partition.js'},
      {name: 'rolling-restart', path: '/a/rolling-restart.js'},
      {name: 'node-join-under-load', path: '/a/node-join-under-load.js'},
    ];

    it('returns all scenarios when filter is empty string', () => {
      const result = filterScenarios(scenarios, '');
      assert.equal(result.length, scenarios.length);
    });

    it('returns all scenarios when filter is null', () => {
      const result = filterScenarios(scenarios, null);
      assert.equal(result.length, scenarios.length);
    });

    it('returns all scenarios when filter is undefined', () => {
      const result = filterScenarios(scenarios, undefined);
      assert.equal(result.length, scenarios.length);
    });

    it('filters by substring match', () => {
      const result = filterScenarios(scenarios, 'node');
      assert.equal(result.length, 2);
      assert.equal(result[0].name, 'node-failure-rebalance');
      assert.equal(result[1].name, 'node-join-under-load');
    });

    it('returns exact match', () => {
      const result = filterScenarios(scenarios, 'rolling-restart');
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'rolling-restart');
    });

    it('returns empty array when no match', () => {
      const result = filterScenarios(scenarios, 'nonexistent');
      assert.deepEqual(result, []);
    });
  });

  describe('Property 13: Scenario Discovery', () => {
    /**
     * **Validates: Requirements 9.1**
     *
      * For any directory containing N runnable JavaScript files,
      * discoverScenarios SHALL discover exactly N scenarios.
      */
    it('discovers exactly N scenarios for N runnable JS files', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({min: 0, max: 8}),
          async (n) => {
            const dir = join(tempDir, `prop13-${randomUUID()}`);
            await mkdir(dir, {recursive: true});

            for (let i = 0; i < n; i++) {
              await writeFile(
                join(dir, `scenario-${i}.js`),
                'export function run() {}',
              );
            }
            // Add a non-JS file to ensure it's excluded
            await writeFile(join(dir, 'readme.md'), '# ignore');

            const scenarios = await discoverScenarios(dir);
            assert.equal(scenarios.length, n);
          },
        ),
        {numRuns: 10},
      );
    });
  });

  describe('Property 14: Scenario Filtering', () => {
    /**
     * **Validates: Requirements 9.2**
     *
     * For any set of discovered scenarios and a filter value,
     * filterScenarios SHALL return only scenarios whose name
     * includes the filter string.
     */
    it('returns only scenarios whose name includes the filter', () => {
      const nameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/);

      fc.assert(
        fc.property(
          fc.array(nameArb, {minLength: 1, maxLength: 10}),
          fc.oneof(nameArb, fc.constant('')),
          (names, filter) => {
            const scenarios = names.map((name) => ({
              name,
              path: `/scenarios/${name}.js`,
            }));

            const result = filterScenarios(scenarios, filter);

            if (!filter) {
              assert.equal(result.length, scenarios.length);
            } else {
              for (const s of result) {
                assert.ok(
                  s.name.includes(filter),
                  `${s.name} should include filter "${filter}"`,
                );
              }
              const expected = scenarios.filter(
                (s) => s.name.includes(filter),
              );
              assert.equal(result.length, expected.length);
            }
          },
        ),
        {numRuns: 10},
      );
    });
  });
});
