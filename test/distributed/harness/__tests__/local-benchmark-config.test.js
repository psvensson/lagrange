import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {parseConfig} from '../config-parser.js';
import {calculateMinimumPreloadBudgetMs} from '../postgres-baseline-config.js';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(THIS_DIR, '../../../..');
const LOCAL_BENCHMARK_3NODE_CONFIG = resolve(
  REPO_ROOT,
  'test/distributed/config/local-benchmark-3node.json',
);
const LOCAL_BENCHMARK_7NODE_CONFIG = resolve(
  REPO_ROOT,
  'test/distributed/config/local-benchmark-7node.json',
);
const LOCAL_BENCHMARK_7NODE_PARTITION_SPLIT_CONFIG = resolve(
  REPO_ROOT,
  'test/distributed/config/local-benchmark-7node-partition-split.json',
);

describe('local benchmark configs', () => {
  it(
    '3-node preload gate budget exceeds learner promotion floor',
    async () => {
      const parsedConfig = await parseConfig(LOCAL_BENCHMARK_3NODE_CONFIG);
      const benchmarkConfig = parsedConfig.benchmark;
      const minimumBudgetMs =
        calculateMinimumPreloadBudgetMs(benchmarkConfig);

      assert.ok(
        benchmarkConfig.readyTimeoutMs >= minimumBudgetMs,
        'expected 3-node ready timeout to exceed learner promotion delay ' +
          'plus preload stable window and one poll interval; got ' +
          benchmarkConfig.readyTimeoutMs + 'ms, need at least ' +
          minimumBudgetMs + 'ms',
      );
      assert.ok(
        benchmarkConfig.quiescentTimeoutMs >= minimumBudgetMs,
        'expected 3-node quiescent timeout to exceed learner promotion delay ' +
          'plus preload stable window and one poll interval; got ' +
          benchmarkConfig.quiescentTimeoutMs + 'ms, need at least ' +
          minimumBudgetMs + 'ms',
      );
      assert.ok(
        Number.isInteger(benchmarkConfig.quiescentNoProgressTimeoutMs) &&
          benchmarkConfig.quiescentNoProgressTimeoutMs > 0 &&
          benchmarkConfig.quiescentNoProgressTimeoutMs <
            benchmarkConfig.quiescentTimeoutMs,
        'expected 3-node config to set an explicit no-progress timeout ' +
          'shorter than the total quiescent timeout',
      );
    },
  );

  it(
    '7-node preload gate budget exceeds learner promotion floor',
    async () => {
      const parsedConfig = await parseConfig(LOCAL_BENCHMARK_7NODE_CONFIG);
      const benchmarkConfig = parsedConfig.benchmark;
      const minimumBudgetMs =
        calculateMinimumPreloadBudgetMs(benchmarkConfig);

      assert.ok(benchmarkConfig.readyTimeoutMs >= minimumBudgetMs);
      assert.ok(benchmarkConfig.quiescentTimeoutMs >= minimumBudgetMs);
      assert.ok(
        Number.isInteger(benchmarkConfig.quiescentNoProgressTimeoutMs) &&
          benchmarkConfig.quiescentNoProgressTimeoutMs > 0 &&
          benchmarkConfig.quiescentNoProgressTimeoutMs <
            benchmarkConfig.quiescentTimeoutMs,
      );
    },
  );

  it(
    '7-node partition split benchmark config sets startup partition overrides',
    async () => {
      const parsedConfig = await parseConfig(
        LOCAL_BENCHMARK_7NODE_PARTITION_SPLIT_CONFIG,
      );

      assert.deepEqual(parsedConfig.partition, {
        evaluationIntervalMs: 60000,
      });
      assert.equal(parsedConfig.benchmark.clients, 7);
      assert.equal(parsedConfig.benchmark.loadDuration, '150s');
      assert.equal(
        parsedConfig.benchmark.tableName,
        'benchmark_partition_split_events',
      );
    },
  );
});
