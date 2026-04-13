/**
 * Integration tests for DB.call workloads covering lookup,
 * emit/shuffle, and broadcast patterns.
 *
 * Wires WasmCallAdapter + CallbackStageExecutor + distributed
 * movement primitives (lookup, emit, broadcast) together with
 * strategy selection to verify end-to-end DB.call behavior.
 *
 * Requirements: 4.1, 5.1, 6.1, 6.2, 6.3
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {WasmCallAdapter} from '../../src/query/wasm-call-adapter.js';
import {
  CallbackStageExecutor,
  groupRowsByPartition,
} from '../../src/query/callback/callback-stage-executor.js';
import {executeLookup} from '../../src/query/lookup-primitive.js';
import {ShuffleBuffer} from '../../src/query/emit-primitive.js';
import {BroadcastStore} from '../../src/query/broadcast-primitive.js';
import {
  selectStrategy,
} from '../../src/query/strategy-selector.js';
import {isSqlRequest} from '../../src/query/sql-request.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  EXECUTION_MODE,
} from '../../src/query/sql-adapter-constants.js';
import {
  STAGE_STATE,
  STAGE_RESULT_FIELD as SF,
  PARTITION_BATCH_FIELD as PBF,
} from '../../src/query/callback/callback-stage-constants.js';
import {
  LOOKUP_ACCESS_PATH,
  LOOKUP_KEY_FIELD,
  LOOKUP_RESULT_FIELD as LRF,
  BROADCAST_FIELD,
} from '../../src/query/distributed/distributed-context-constants.js';
import {
  STRATEGY,
} from '../../src/query/strategy-constants.js';

// Initialize configuration for tests
const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

// ---------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------

const VALID_CALLBACK = Object.freeze({
  moduleRef: 'orders-score-v3',
  exportName: 'run_batch',
});

/**
 * Create a mock SqlCore that returns partition-tagged rows.
 * The mock simulates a SELECT that returns rows from two
 * partitions so the executor can group them into batches.
 *
 * @param {Array<Object>} rows - Rows to return from executeQuery.
 * @return {Object} Mock SqlCore with calls tracking.
 */
function createMockSqlCore(rows) {
  const calls = [];
  const mock = {
    calls,
    async executeQuery(sql, params, options) {
      calls.push({sql, params, options});
      return {success: true, rows, affectedRows: 0};
    },
    async executeRequest(sqlRequest) {
      const result = await mock.executeQuery(
        sqlRequest.statement,
        sqlRequest.parameters,
        {sessionId: sqlRequest.sessionId},
      );
      result.executionMode = sqlRequest.executionMode;
      return result;
    },
  };
  return mock;
}

/**
 * Build partition batches from flat rows for the executor.
 * @param {Array<Object>} rows - Rows with partitionId field.
 * @return {Array<Object>} Partition batch objects.
 */
function buildBatches(rows) {
  return groupRowsByPartition(rows, PBF.PARTITION_ID);
}

/**
 * Create a context factory that injects real primitives
 * (lookup, emit, broadcast) into the callback context.
 *
 * @param {Object} opts - Primitive instances.
 * @param {Object} [opts.lookupStore] - Map of table→partition→rows.
 * @param {ShuffleBuffer} [opts.shuffleBuffer] - Emit buffer.
 * @param {BroadcastStore} [opts.broadcastStore] - Broadcast store.
 * @return {Object} Context factory with createContext method.
 */
function createContextFactory(opts = {}) {
  const {lookupStore, shuffleBuffer, broadcastStore} = opts;

  return {
    createContext(partitionId) {
      return {
        partitionId,

        async lookup(table, keys) {
          if (!lookupStore) return {rows: []};
          return executeLookup({
            table,
            keys,
            accessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
            partitionResolver: (key) => {
              const partitions = lookupStore.get(table);
              if (!partitions) return 'unknown';
              for (const [pid] of partitions) {
                if (partitions.get(pid)?.some(
                  (r) => r[key[LOOKUP_KEY_FIELD.COLUMN]] ===
                    key[LOOKUP_KEY_FIELD.VALUE],
                )) {
                  return pid;
                }
              }
              return 'default';
            },
            fetchFn: async (pid, tbl, _keys) => {
              const partitions = lookupStore.get(tbl);
              if (!partitions) return [];
              return partitions.get(pid) || [];
            },
          });
        },

        async emit(key, value) {
          if (!shuffleBuffer) return;
          return shuffleBuffer.emit(key, value);
        },

        async broadcast(ref, dataset) {
          if (!broadcastStore) return;
          return broadcastStore.broadcast(ref, dataset);
        },

        async useBroadcast(ref) {
          if (!broadcastStore) return {rows: []};
          return broadcastStore.useBroadcast(ref);
        },
      };
    },
  };
}

// ---------------------------------------------------------------
// Req 4.1: DB.call builds request and executor runs on batches
// ---------------------------------------------------------------

test('integration: DB.call adapter + executor runs callback per partition',
  async (t) => {
    const rows = [
      {[PBF.PARTITION_ID]: 'p1', id: 'a1', total: 10},
      {[PBF.PARTITION_ID]: 'p1', id: 'a2', total: 20},
      {[PBF.PARTITION_ID]: 'p2', id: 'z1', total: 30},
    ];

    const sqlCore = createMockSqlCore(rows);
    const adapter = new WasmCallAdapter({sqlCore});

    // Step 1: adapter builds PARTITION_CALLBACK request
    const adapterResult = await adapter.call(
      'SELECT * FROM orders',
      VALID_CALLBACK,
    );
    t.equal(adapterResult.executionMode,
      EXECUTION_MODE.PARTITION_CALLBACK);
    t.ok(isSqlRequest(adapter.buildRequest(
      'SELECT * FROM orders', VALID_CALLBACK,
    )));

    // Step 2: group returned rows into partition batches
    const batches = buildBatches(adapterResult.rows);
    t.equal(batches.length, 2);

    // Step 3: executor runs callback once per batch
    const invocations = [];
    const executor = new CallbackStageExecutor({
      callback: async (ctx, batch, _opts) => {
        invocations.push({
          partitionId: ctx.partitionId,
          rowCount: batch[PBF.ROW_COUNT],
        });
        return batch[PBF.ROWS];
      },
    });

    const stageResult = await executor.execute(batches);
    t.equal(stageResult[SF.STATE], STAGE_STATE.COMPLETED);
    t.equal(stageResult.totalPartitions, 2);
    t.equal(invocations.length, 2);

    const p1Inv = invocations.find((i) => i.partitionId === 'p1');
    const p2Inv = invocations.find((i) => i.partitionId === 'p2');
    t.equal(p1Inv.rowCount, 2);
    t.equal(p2Inv.rowCount, 1);

    t.end();
  });

// ---------------------------------------------------------------
// Req 5.1 + 6.2: Lookup pattern — callback uses ctx.lookup
// ---------------------------------------------------------------

test('integration: lookup pattern — callback fetches related data',
  async (t) => {
    // Simulate orders partitioned across p1/p2
    const orderRows = [
      {[PBF.PARTITION_ID]: 'p1', orderId: 'o1', customerId: 'c1'},
      {[PBF.PARTITION_ID]: 'p2', orderId: 'o2', customerId: 'c2'},
    ];

    // Simulate customers table for lookup
    const customerStore = new Map();
    customerStore.set('customers', new Map([
      ['default', [
        {id: 'c1', name: 'Alice'},
        {id: 'c2', name: 'Bob'},
      ]],
    ]));

    const contextFactory = createContextFactory({
      lookupStore: customerStore,
    });

    const enrichedResults = [];
    const executor = new CallbackStageExecutor({
      callback: async (ctx, batch, _opts) => {
        const keys = batch[PBF.ROWS].map((row) => ({
          [LOOKUP_KEY_FIELD.COLUMN]: 'id',
          [LOOKUP_KEY_FIELD.VALUE]: row.customerId,
        }));

        const lookupResult = await ctx.lookup('customers', keys);
        const customerMap = new Map();
        for (const row of lookupResult[LRF.ROWS]) {
          customerMap.set(row.id, row.name);
        }

        const enriched = batch[PBF.ROWS].map((row) => ({
          ...row,
          customerName: customerMap.get(row.customerId) || null,
        }));
        enrichedResults.push(...enriched);
        return enriched;
      },
      contextFactory,
    });

    const batches = buildBatches(orderRows);
    const stageResult = await executor.execute(batches);

    t.equal(stageResult[SF.STATE], STAGE_STATE.COMPLETED);
    t.equal(enrichedResults.length, 2);
    t.equal(enrichedResults[0].customerName, 'Alice');
    t.equal(enrichedResults[1].customerName, 'Bob');

    t.end();
  });

test('integration: lookup strategy selected for key-bounded access',
  (t) => {
    // Side dataset is large (above broadcast threshold) but
    // inner access is key-bounded → lookup strategy
    const decision = selectStrategy({
      sideSizeBytes: 1024 * 1024,
      innerAccessPath: LOOKUP_ACCESS_PATH.PRIMARY_KEY,
    });

    t.equal(decision.strategy, STRATEGY.LOOKUP);
    t.equal(decision.hintApplied, false);
    t.end();
  });

// ---------------------------------------------------------------
// Req 5.1 + 6.3: Emit/shuffle pattern — callback uses ctx.emit
// ---------------------------------------------------------------

test('integration: emit/shuffle pattern — callback emits keyed records',
  async (t) => {
    const orderRows = [
      {[PBF.PARTITION_ID]: 'p1', orderId: 'o1', region: 'us'},
      {[PBF.PARTITION_ID]: 'p1', orderId: 'o2', region: 'eu'},
      {[PBF.PARTITION_ID]: 'p2', orderId: 'o3', region: 'us'},
    ];

    const shuffleBuffer = new ShuffleBuffer({maxBytes: 1024 * 1024});
    const contextFactory = createContextFactory({shuffleBuffer});

    const executor = new CallbackStageExecutor({
      callback: async (ctx, batch, _opts) => {
        for (const row of batch[PBF.ROWS]) {
          const key = row.region;
          const value = new Uint8Array(
            Buffer.from(JSON.stringify(row)),
          );
          await ctx.emit(key, value);
        }
        return batch[PBF.ROWS];
      },
      contextFactory,
    });

    const batches = buildBatches(orderRows);
    const stageResult = await executor.execute(batches);

    t.equal(stageResult[SF.STATE], STAGE_STATE.COMPLETED);
    t.equal(stageResult.totalPartitions, 2);

    // Verify shuffle buffer received all emitted records
    const drained = shuffleBuffer.drain();
    t.equal(drained.length, 3);

    // Verify records have keys matching regions
    const keys = drained.map((r) => r.key);
    t.ok(keys.includes('us'));
    t.ok(keys.includes('eu'));

    t.end();
  });

test('integration: emit/shuffle strategy selected as default fallback',
  (t) => {
    // Side dataset is large and no key-bounded access → emit/shuffle
    const decision = selectStrategy({
      sideSizeBytes: 1024 * 1024,
      innerAccessPath: null,
    });

    t.equal(decision.strategy, STRATEGY.EMIT_SHUFFLE);
    t.equal(decision.hintApplied, false);
    t.end();
  });

// ---------------------------------------------------------------
// Req 5.1 + 6.1: Broadcast pattern — callback uses broadcast
// ---------------------------------------------------------------

test('integration: broadcast pattern — callback publishes and reads',
  async (t) => {
    const orderRows = [
      {[PBF.PARTITION_ID]: 'p1', orderId: 'o1', statusCode: 1},
      {[PBF.PARTITION_ID]: 'p2', orderId: 'o2', statusCode: 2},
    ];

    const broadcastStore = new BroadcastStore();
    const contextFactory = createContextFactory({broadcastStore});

    // Pre-publish a small reference dataset via broadcast
    broadcastStore.broadcast('status-labels', {
      [BROADCAST_FIELD.VERSION]: 1,
      labels: {1: 'pending', 2: 'shipped'},
    });

    const enrichedResults = [];
    const executor = new CallbackStageExecutor({
      callback: async (ctx, batch, _opts) => {
        // Use the broadcast dataset for local join
        const view = await ctx.useBroadcast('status-labels');
        const labels = view[BROADCAST_FIELD.PAYLOAD].labels;

        const enriched = batch[PBF.ROWS].map((row) => ({
          ...row,
          statusLabel: labels[row.statusCode] || 'unknown',
        }));
        enrichedResults.push(...enriched);
        return enriched;
      },
      contextFactory,
    });

    const batches = buildBatches(orderRows);
    const stageResult = await executor.execute(batches);

    t.equal(stageResult[SF.STATE], STAGE_STATE.COMPLETED);
    t.equal(enrichedResults.length, 2);
    t.equal(enrichedResults[0].statusLabel, 'pending');
    t.equal(enrichedResults[1].statusLabel, 'shipped');

    t.end();
  });

test('integration: broadcast publishes within callback context',
  async (t) => {
    const rows = [
      {[PBF.PARTITION_ID]: 'p1', id: 'a1'},
    ];

    const broadcastStore = new BroadcastStore();
    const contextFactory = createContextFactory({broadcastStore});

    const executor = new CallbackStageExecutor({
      callback: async (ctx, batch, _opts) => {
        // Callback publishes a broadcast dataset
        await ctx.broadcast('computed-ref', {
          [BROADCAST_FIELD.VERSION]: 1,
          data: batch[PBF.ROWS],
        });
        return batch[PBF.ROWS];
      },
      contextFactory,
    });

    const batches = buildBatches(rows);
    await executor.execute(batches);

    // Verify the broadcast was stored
    t.ok(broadcastStore.has('computed-ref'));
    const view = broadcastStore.useBroadcast('computed-ref');
    t.equal(view[BROADCAST_FIELD.VERSION], 1);
    t.equal(view[BROADCAST_FIELD.PAYLOAD].data.length, 1);

    t.end();
  });

test('integration: broadcast strategy selected for small side dataset',
  (t) => {
    // Side dataset is small → broadcast strategy
    const decision = selectStrategy({
      sideSizeBytes: 100,
      innerAccessPath: null,
    });

    t.equal(decision.strategy, STRATEGY.BROADCAST);
    t.equal(decision.hintApplied, false);
    t.end();
  });

// ---------------------------------------------------------------
// Strategy selection integrates with adapter request flow
// ---------------------------------------------------------------

test('integration: strategy decision flows with adapter request',
  async (t) => {
    const rows = [
      {[PBF.PARTITION_ID]: 'p1', id: 'a1', amount: 50},
      {[PBF.PARTITION_ID]: 'p2', id: 'z1', amount: 200},
    ];

    const sqlCore = createMockSqlCore(rows);
    const adapter = new WasmCallAdapter({sqlCore});

    // Build request with hints
    const request = adapter.buildRequest(
      'SELECT * FROM orders',
      VALID_CALLBACK,
      {hints: {strategy: STRATEGY.LOOKUP}},
    );

    t.ok(isSqlRequest(request));
    t.equal(request.hints.strategy, STRATEGY.LOOKUP);

    // Strategy selector validates the hint against input
    const decision = selectStrategy(
      {
        sideSizeBytes: 1024 * 1024,
        innerAccessPath: LOOKUP_ACCESS_PATH.UNIQUE_INDEX,
      },
      request.hints,
    );

    t.equal(decision.strategy, STRATEGY.LOOKUP);
    t.equal(decision.hintApplied, true);

    t.end();
  });

// ---------------------------------------------------------------
// End-to-end: adapter → executor → primitive wiring
// ---------------------------------------------------------------

test('integration: full pipeline — adapter + executor + emit + lookup',
  async (t) => {
    // Simulate: DB.call selects orders, callback emits by region
    // and looks up customer names
    const orderRows = [
      {
        [PBF.PARTITION_ID]: 'p1',
        orderId: 'o1',
        customerId: 'c1',
        region: 'us',
      },
      {
        [PBF.PARTITION_ID]: 'p2',
        orderId: 'o2',
        customerId: 'c2',
        region: 'eu',
      },
    ];

    const sqlCore = createMockSqlCore(orderRows);
    const adapter = new WasmCallAdapter({sqlCore});

    // Step 1: adapter call
    const adapterResult = await adapter.call(
      'SELECT * FROM orders',
      VALID_CALLBACK,
    );
    t.equal(adapterResult.executionMode,
      EXECUTION_MODE.PARTITION_CALLBACK);

    // Step 2: set up primitives
    const shuffleBuffer = new ShuffleBuffer({maxBytes: 1024 * 1024});
    const customerStore = new Map();
    customerStore.set('customers', new Map([
      ['default', [
        {id: 'c1', name: 'Alice'},
        {id: 'c2', name: 'Bob'},
      ]],
    ]));

    const contextFactory = createContextFactory({
      lookupStore: customerStore,
      shuffleBuffer,
    });

    // Step 3: executor runs callback with both primitives
    const finalResults = [];
    const executor = new CallbackStageExecutor({
      callback: async (ctx, batch, _opts) => {
        const results = [];
        for (const row of batch[PBF.ROWS]) {
          // Emit by region for shuffle
          const value = new Uint8Array(
            Buffer.from(JSON.stringify({orderId: row.orderId})),
          );
          await ctx.emit(row.region, value);

          // Lookup customer name
          const lookupResult = await ctx.lookup('customers', [
            {
              [LOOKUP_KEY_FIELD.COLUMN]: 'id',
              [LOOKUP_KEY_FIELD.VALUE]: row.customerId,
            },
          ]);

          const customer = lookupResult[LRF.ROWS].find(
            (r) => r.id === row.customerId,
          );
          results.push({
            orderId: row.orderId,
            customerName: customer?.name || null,
          });
        }
        finalResults.push(...results);
        return results;
      },
      contextFactory,
    });

    const batches = buildBatches(adapterResult.rows);
    const stageResult = await executor.execute(batches);

    t.equal(stageResult[SF.STATE], STAGE_STATE.COMPLETED);
    t.equal(stageResult.totalPartitions, 2);
    t.equal(finalResults.length, 2);

    // Verify lookup enrichment
    const o1 = finalResults.find((r) => r.orderId === 'o1');
    const o2 = finalResults.find((r) => r.orderId === 'o2');
    t.equal(o1.customerName, 'Alice');
    t.equal(o2.customerName, 'Bob');

    // Verify emit records in shuffle buffer
    const drained = shuffleBuffer.drain();
    t.equal(drained.length, 2);

    t.end();
  });

test('integration: full pipeline — adapter + executor + broadcast join',
  async (t) => {
    const orderRows = [
      {[PBF.PARTITION_ID]: 'p1', orderId: 'o1', categoryId: 'cat-a'},
      {[PBF.PARTITION_ID]: 'p1', orderId: 'o2', categoryId: 'cat-b'},
      {[PBF.PARTITION_ID]: 'p2', orderId: 'o3', categoryId: 'cat-a'},
    ];

    const sqlCore = createMockSqlCore(orderRows);
    const adapter = new WasmCallAdapter({sqlCore});

    const adapterResult = await adapter.call(
      'SELECT * FROM orders',
      VALID_CALLBACK,
    );

    // Small reference dataset → broadcast strategy
    const decision = selectStrategy({
      sideSizeBytes: 64,
      innerAccessPath: null,
    });
    t.equal(decision.strategy, STRATEGY.BROADCAST);

    const broadcastStore = new BroadcastStore();
    broadcastStore.broadcast('categories', {
      [BROADCAST_FIELD.VERSION]: 1,
      data: {'cat-a': 'Electronics', 'cat-b': 'Books'},
    });

    const contextFactory = createContextFactory({broadcastStore});

    const finalResults = [];
    const executor = new CallbackStageExecutor({
      callback: async (ctx, batch, _opts) => {
        const view = await ctx.useBroadcast('categories');
        const categories = view[BROADCAST_FIELD.PAYLOAD].data;

        const enriched = batch[PBF.ROWS].map((row) => ({
          orderId: row.orderId,
          category: categories[row.categoryId] || 'unknown',
        }));
        finalResults.push(...enriched);
        return enriched;
      },
      contextFactory,
    });

    const batches = buildBatches(adapterResult.rows);
    const stageResult = await executor.execute(batches);

    t.equal(stageResult[SF.STATE], STAGE_STATE.COMPLETED);
    t.equal(finalResults.length, 3);

    const o1 = finalResults.find((r) => r.orderId === 'o1');
    const o2 = finalResults.find((r) => r.orderId === 'o2');
    const o3 = finalResults.find((r) => r.orderId === 'o3');
    t.equal(o1.category, 'Electronics');
    t.equal(o2.category, 'Books');
    t.equal(o3.category, 'Electronics');

    t.end();
  });
