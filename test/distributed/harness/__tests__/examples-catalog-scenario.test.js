import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {run} from '../../scenarios/examples-catalog.js';

const OUTPUT_PREFIX = 'examples-catalog-scenario-';

function buildCallbackRows(callbackModuleRef) {
  if (callbackModuleRef.includes('01-basic-iterator')) {
    return [{ok: true}];
  }
  if (callbackModuleRef.includes('02-stage-batching')) {
    return [{stageBatchSize: 2}];
  }
  if (callbackModuleRef.includes('03-plan-reduce-by-key')) {
    return [{status: 'active'}];
  }
  if (callbackModuleRef.includes('04-nested-bounded-call')) {
    return [{configRowsSeen: 0}];
  }
  if (callbackModuleRef.includes('05-guardrail-failure')) {
    return [{ok: true, error: 'blocked unbounded nested call'}];
  }
  if (callbackModuleRef.includes('06-wasm-remote-replica')) {
    return [{
      artifactEnvelopeExecuted: true,
      remotePartitionReplica: true,
    }];
  }
  return [];
}

describe('examples-catalog scenario', () => {
  it('executes shared runner and returns artifact payload', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), OUTPUT_PREFIX));

    try {
      const cluster = {
        _config: {outputDir},
        _scenarioOverrides: {
          examplesCatalog: {
            expectedNodeCount: 1,
            localReplicaRouting: false,
          },
        },
        getNodes: () => [{
          query: async () => ({ok: true}),
          partitionCallback: async (payload) => ({
            hostResult: {
              partitionResults: [{
                rows: buildCallbackRows(payload.callbackModuleRef),
              }],
            },
          }),
        }],
      };

      const result = await run(cluster);

      assert.equal(result.exampleResults.total, 6);
      assert.equal(result.exampleResults.passed, 6);
      assert.equal(result.exampleResults.failed, 0);
      assert.equal(result.exampleResults.requiredFailed, 0);
      assert.equal(Array.isArray(result.examples), true);
      assert.equal(result.examples.length, 6);

      const artifact = JSON.parse(
        await readFile(result.artifactPath, 'utf8'),
      );
      assert.equal(artifact.summary.total, 6);
      assert.equal(artifact.summary.failed, 0);
    } finally {
      await rm(outputDir, {recursive: true, force: true});
    }
  });

  it('fails when no active nodes are available', async () => {
    const cluster = {
      getNodes: () => [],
    };

    await assert.rejects(
      run(cluster),
      /requires at least one active node/,
    );
  });

  it('routes to the seed when the seed is the only replica host', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), OUTPUT_PREFIX));
    let seedPartitionCalls = 0;
    let joinerPartitionCalls = 0;

    const partitionsByTableSql = /FROM partitions WHERE table_name/;
    const servicesSql = /FROM services/;

    try {
      // Every table's only replica host is the seed: partition p0 is
      // served by seed-node. The resolved replica host must be the
      // FIRST candidate even though it is the seed — the pre-fix
      // inversion demoted it behind every non-seed node.
      const seedNode = {
        id: 'seed-node',
        query: async (sql) => {
          if (partitionsByTableSql.test(String(sql))) {
            return {rows: [{partition_id: 'p0'}]};
          }
          if (servicesSql.test(String(sql))) {
            return {rows: [{
              partition_id: 'p0',
              node_id: 'seed-node',
              status: 'active',
            }]};
          }
          return {rows: []};
        },
        partitionCallback: async (payload) => {
          seedPartitionCalls += 1;
          return {
            hostResult: {
              partitionResults: [{
                rows: buildCallbackRows(payload.callbackModuleRef),
              }],
            },
          };
        },
      };
      const joinerNode = {
        id: 'joiner-node',
        query: async () => ({rows: []}),
        partitionCallback: async () => {
          joinerPartitionCalls += 1;
          throw new Error('joiner does not host the replica');
        },
      };
      const cluster = {
        _config: {outputDir},
        _scenarioOverrides: {
          examplesCatalog: {
            expectedNodeCount: 2,
            localReplicaRouting: true,
          },
        },
        getNodes: () => [seedNode, joinerNode],
      };

      const result = await run(cluster);
      assert.equal(result.exampleResults.requiredFailed, 0);
      assert.ok(seedPartitionCalls > 0,
        'resolved replica host (the seed) serves the callbacks');
      assert.equal(joinerPartitionCalls, 0,
        'non-replica nodes are not tried before the resolved host');
    } finally {
      await rm(outputDir, {recursive: true, force: true});
    }
  });

  it('prefers non-seed callback routes when the seed is degraded', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), OUTPUT_PREFIX));
    let seedPartitionCalls = 0;

    try {
      const seedNode = {
        id: 'seed-node',
        query: async () => ({rows: []}),
        partitionCallback: async () => {
          seedPartitionCalls += 1;
          throw new Error('seed callback unavailable');
        },
      };
      const joinerNode = {
        id: 'joiner-node',
        query: async () => ({ok: true, rows: []}),
        partitionCallback: async (payload) => ({
          hostResult: {
            partitionResults: [{
              rows: buildCallbackRows(payload.callbackModuleRef),
            }],
          },
        }),
      };
      const cluster = {
        _config: {outputDir},
        _scenarioOverrides: {
          examplesCatalog: {
            expectedNodeCount: 2,
            localReplicaRouting: true,
          },
        },
        getNodes: () => [seedNode, joinerNode],
      };

      const result = await run(cluster);
      assert.equal(result.exampleResults.requiredFailed, 0);
      assert.equal(seedPartitionCalls, 0);
    } finally {
      await rm(outputDir, {recursive: true, force: true});
    }
  });
});
