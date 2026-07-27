import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {after, before, describe, it} from 'node:test';
import {promisify} from 'node:util';

import {
  WasiComponentCellRuntime,
} from '../../src/runtime/wasi-component-cell-runtime.js';

const execFileAsync = promisify(execFile);
const SOURCE = new URL(
  '../../examples/service-data-affinity/' +
    'movielens-public-grouped-reduce-component.wat',
  import.meta.url,
);
const TABLES = Object.freeze([
  {context: 'table:ratings', read: true, slot: 0, write: false},
  {context: 'table:movies', read: false, slot: 1, write: true},
  {context: 'table:scores', read: false, slot: 2, write: true},
]);
const CANONICAL_DIGEST =
  'sha256:06416e597f82b7342361e41163890c81036900f418ad91315590814211dca490';
const CANONICAL_VERSION = 'movielens-public-request-workload-v1';
const canonicalBody = (offset) =>
  `{"datasetDigest":"${CANONICAL_DIGEST}",` +
  `"resultKeyOffset":${offset},` +
  `"workloadVersion":"${CANONICAL_VERSION}"}`;
const validRequest = (offset) =>
  `{"body":${canonicalBody(offset)},"method":"POST"}`;
const HOSTILE_REQUESTS = Object.freeze([
  '{"body":{},"method":"POST"}',
  `{"body":{"datasetDigest":"${CANONICAL_DIGEST}",` +
    `"workloadVersion":"${CANONICAL_VERSION}"},"method":"POST"}`,
  validRequest('"0"'),
  validRequest('00'),
  validRequest(-10),
  validRequest(1.5),
  validRequest(2_147_483_640),
  `{"body":{"datasetDigest":"${CANONICAL_DIGEST}",` +
    '"nested":{"resultKeyOffset":10},"resultKeyOffset":0,' +
    `"workloadVersion":"${CANONICAL_VERSION}"},"method":"POST"}`,
  `{"body":{"datasetDigest":"${CANONICAL_DIGEST}",` +
    '"nested":{"resultKeyOffset":10},' +
    `"workloadVersion":"${CANONICAL_VERSION}"},"method":"POST"}`,
  `{"body":{"datasetDigest":"${CANONICAL_DIGEST}",` +
    '"resultKeyOffset":0,"resultKeyOffset":10,' +
    `"workloadVersion":"${CANONICAL_VERSION}"},"method":"POST"}`,
  `{"body":${canonicalBody(0).slice(0, -1)},` +
    '"trailingExtra":true},"method":"POST"}',
  '{"body":{"datasetDigest":"sha256:wrong",' +
    `"datasetDigest":"${CANONICAL_DIGEST}","resultKeyOffset":0,` +
    `"workloadVersion":"${CANONICAL_VERSION}"},"method":"POST"}`,
  `{"body":{"datasetDigest":"${CANONICAL_DIGEST}",` +
    '"resultKeyOffset":0,"workloadVersion":"wrong",' +
    `"workloadVersion":"${CANONICAL_VERSION}"},"method":"POST"}`,
  `{"nested":{"body":${canonicalBody(0)}},"method":"POST"}`,
  '{"body":{"datasetDigest":"sha256:wrong","resultKeyOffset":0,' +
    `"workloadVersion":"${CANONICAL_VERSION}"},"method":"POST"}`,
  `{"body":{"datasetDigest":"${CANONICAL_DIGEST}",` +
    '"resultKeyOffset":0,"workloadVersion":"wrong"},"method":"POST"}',
]);
let temporaryRoot;
let componentBytes;

function cell(serviceId, options = {}) {
  return {
    budgets: {
      context_bytes:
        options.contextBytes ?? 16 * 1_024 * 1_024,
      cpu_time_ms: 60_000,
      input_bytes: 4_096,
      memory_bytes: 64 * 1_024 * 1_024,
      output_bytes: 4_096,
      wall_time_ms: 60_000,
    },
    bytes: componentBytes,
    capabilities: [],
    exportName: 'run',
    serviceId,
  };
}

function snapshots() {
  return [{
    context: 'table:ratings',
    rows: [{key: 0, value: 0}],
  }];
}

async function invoke(runtime, serviceId, request, effects) {
  return runtime.invoke(
    serviceId,
    [request],
    async () => snapshots(),
    async (writes) => effects.push(...writes),
    () => {},
    {tables: TABLES},
  );
}

before(async () => {
  temporaryRoot = await mkdtemp(
    path.join(tmpdir(), 'lagrange-movielens-component-test-'),
  );
  const output = path.join(temporaryRoot, 'component.wasm');
  await execFileAsync('wasm-tools', [
    'parse',
    SOURCE.pathname,
    '-o',
    output,
  ]);
  componentBytes = await readFile(output);
});

after(async () => {
  await rm(temporaryRoot, {force: true, recursive: true});
});

describe('MovieLens public request component request validation', () => {
  it('rejects malformed offsets before committing any table effect',
    async () => {
      for (let index = 0; index < HOSTILE_REQUESTS.length; index += 1) {
        const serviceId = `hostile-${index}`;
        const runtime = new WasiComponentCellRuntime();
        const effects = [];
        await runtime.start(cell(serviceId));
        await assert.rejects(
          invoke(runtime, serviceId, HOSTILE_REQUESTS[index], effects),
          /invocation failed|unreachable/u,
        );
        assert.deepEqual(effects, []);
        assert.equal(runtime.witness(serviceId), null);
        await runtime.stop(serviceId);
      }
    });

  it('rejects an oversized request before component invocation', async () => {
    const serviceId = 'oversized';
    const runtime = new WasiComponentCellRuntime();
    const effects = [];
    await runtime.start(cell(serviceId));
    await assert.rejects(
      invoke(
        runtime,
        serviceId,
        `{"body":{"datasetDigest":"${CANONICAL_DIGEST}",` +
          `"padding":"${'x'.repeat(4_096)}","resultKeyOffset":0,` +
          `"workloadVersion":"${CANONICAL_VERSION}"}}`,
        effects,
      ),
      /input_bytes budget exhausted/u,
    );
    assert.deepEqual(effects, []);
    assert.equal(runtime.witness(serviceId), null);
  });

  it('uses one generation for two valid disjoint operation ranges',
    async () => {
      const serviceId = 'valid-distinct';
      const runtime = new WasiComponentCellRuntime();
      const effects = [];
      await runtime.start(cell(serviceId));
      await invoke(
        runtime,
        serviceId,
        validRequest(0),
        effects,
      );
      await invoke(
        runtime,
        serviceId,
        validRequest(10),
        effects,
      );
      const movieKeys = effects
        .filter((effect) => effect.context === 'table:movies')
        .map((effect) => effect.key);
      assert.deepEqual(movieKeys, [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      ]);
      assert.equal(runtime.witness(serviceId).componentInvocationCount, 2);
      await runtime.stop(serviceId);
    });

  it('admits only one invocation before any asynchronous budget work',
    async () => {
      const serviceId = 'concurrent-single-winner';
      const runtime = new WasiComponentCellRuntime();
      const effects = [];
      const requireInputBudget =
        runtime.requireInputBudget.bind(runtime);
      let budgetCalls = 0;
      let releaseFirstBudget;
      const firstBudget = new Promise((resolve) => {
        releaseFirstBudget = resolve;
      });
      runtime.requireInputBudget = async (...args) => {
        budgetCalls += 1;
        if (budgetCalls === 1) await firstBudget;
        return requireInputBudget(...args);
      };
      await runtime.start(cell(serviceId));
      const first = runtime.invoke(
        serviceId,
        [validRequest(0)],
        async () => snapshots(),
        async (writes) => effects.push(...writes),
        () => {},
        {tables: TABLES},
      );
      const second = invoke(
        runtime,
        serviceId,
        validRequest(10),
        effects,
      );
      try {
        assert.equal(
          budgetCalls,
          1,
          'the busy gate must reject before a second budget check',
        );
        await assert.rejects(
          second,
          (error) => {
            assert.equal(
              error.code,
              'request_cell_concurrent_invocation',
            );
            return true;
          },
        );
      } finally {
        releaseFirstBudget();
      }
      await first;
      assert.equal(runtime.witness(serviceId).componentInvocationCount, 1);
      await runtime.stop(serviceId);
    });

  it('enforces the worker row-index predicate before component dispatch',
    async () => {
      const serviceId = 'context-row-bound';
      const contextBytes = 128;
      const runtime = new WasiComponentCellRuntime();
      const effects = [];
      const tableReads = [{
        context: 'table:ratings',
        rows: [
          {key: 0, value: 0},
          {key: 1, value: 1},
        ],
      }];
      let componentInvocations = 0;
      assert.equal(
        Buffer.byteLength(JSON.stringify(tableReads)) < contextBytes,
        true,
      );
      await runtime.start(cell(serviceId, {contextBytes}));
      await assert.rejects(
        runtime.invoke(
          serviceId,
          [validRequest(0)],
          async () => tableReads,
          async (writes) => effects.push(...writes),
          () => {},
          {
            beforeComponentInvoke() {
              componentInvocations += 1;
            },
            tables: TABLES,
          },
        ),
        (error) => {
          assert.equal(error.code, 'request_cell_budget_exhausted');
          assert.match(error.message, /context_bytes budget exhausted/u);
          return true;
        },
      );
      assert.equal(componentInvocations, 0);
      assert.deepEqual(effects, []);
      assert.equal(runtime.witness(serviceId), null);
    });
});
