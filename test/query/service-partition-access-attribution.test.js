/**
 * Guard tests for the service↔partition access attribution feed
 * (quest: service-partition-access-attribution, epic:
 * solve/epics/service-data-affinity-placement.md).
 *
 * Proves the production A[service][partition] feed end-to-end:
 *  1. The accumulator records/drains/merges (delta semantics with a
 *     publish-failure restore path).
 *  2. The SQL engine records (issuingServiceId, partition, read) on
 *     successful SELECTs — and never records for statements without an
 *     issuing service (external SQL clients unaffected).
 *  3. Write statements record (issuingServiceId, partition, write).
 *  4. The publisher drains deltas into one CDC-propagated
 *     service_partition_access row per (node, service) via the
 *     control-plane gateway with heartbeat-pattern options, restores
 *     counts on failure, and its timer lifecycle is shutdown-aware.
 *  5. The system table is registered end-to-end: schema, bootstrap
 *     partition/replica ids, CDC propagation class, cache key.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  SERVICE_PARTITION_ACCESS_COL as SPA_COL,
  SERVICE_PARTITION_ACCESS_KIND,
  TABLES,
} from '../../src/constants/index.js';
import {
  ServicePartitionAccessMetrics,
} from '../../src/query/service-partition-access-metrics.js';
import {
  ServicePartitionAccessPublisher,
} from '../../src/query/service-partition-access-publisher.js';
import {
  SERVICE_PARTITION_ACCESS_SCHEMA,
} from '../../src/bootstrap/system-table-runtime-schema-definitions.js';
import {
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  SYSTEM_TABLE_SCHEMAS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  SYSTEM_CACHE_KEY_DESCRIPTOR,
} from '../../src/cache/system-cache-key-descriptor.js';
import {
  CDC_PROPAGATED_TABLES,
} from '../../src/cache/cdc-table-policy.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
} from './sql-query-engine-test-support.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

const SVC_ID = 'svc-attr';
const NODE_ID = 'node-attr';

function buildEngine() {
  const tables = [{table_name: 'orders', table_id: 'orders'}];
  const partitions = [{
    partition_id: 'orders-p1',
    table_name: 'orders',
    status: 'active',
  }];
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache(tables, partitions, null),
    messageRouter: createMockMessageRouter(),
    nodeId: NODE_ID,
    runtimeAccessPolicyOwner: {
      async authorizeStatement() {
        return {decision: 'allowed'};
      },
    },
  });
  return engine;
}

test('accumulator: record, drain, merge-on-failure semantics', (t) => {
  const metrics = new ServicePartitionAccessMetrics();
  t.equal(metrics.hasData(), false, 'starts empty');

  metrics.record(SVC_ID, ['p1', 'p2'], SERVICE_PARTITION_ACCESS_KIND.READ);
  metrics.record(SVC_ID, ['p1'], SERVICE_PARTITION_ACCESS_KIND.WRITE);
  metrics.record(SVC_ID, ['p1'], SERVICE_PARTITION_ACCESS_KIND.READ);
  metrics.record('', ['p1'], SERVICE_PARTITION_ACCESS_KIND.READ);
  metrics.record(SVC_ID, ['p3'], 'bogus-kind');
  t.equal(metrics.hasData(), true, 'has pending counts');

  const drained = metrics.snapshotAndReset();
  t.same(drained, {
    [SVC_ID]: {
      p1: {
        [SERVICE_PARTITION_ACCESS_KIND.READ]: 2,
        [SERVICE_PARTITION_ACCESS_KIND.WRITE]: 1,
      },
      p2: {
        [SERVICE_PARTITION_ACCESS_KIND.READ]: 1,
        [SERVICE_PARTITION_ACCESS_KIND.WRITE]: 0,
      },
    },
  }, 'drain returns exact delta counts; invalid records ignored');
  t.equal(metrics.hasData(), false, 'drain resets the accumulator');

  metrics.record(SVC_ID, ['p1'], SERVICE_PARTITION_ACCESS_KIND.READ);
  metrics.merge(drained);
  const merged = metrics.snapshotAndReset();
  t.equal(
    merged[SVC_ID].p1[SERVICE_PARTITION_ACCESS_KIND.READ],
    3,
    'merge restores drained counts additively (publish-failure path)',
  );

  t.end();
});

test('engine records reads for issuing services only', async (t) => {
  const engine = buildEngine();
  engine.queryExecutor = {
    executeSelect: async () => ({
      success: true,
      results: [],
      rows: [],
      partitions: ['orders-p1', 'joined-p7'],
    }),
  };

  await engine.executeQuery('SELECT * FROM orders', [], {
    issuingServiceId: SVC_ID,
  });
  await engine.executeQuery('SELECT * FROM orders', []);
  await engine.executeQuery('SELECT * FROM orders', [], {
    sessionId: 'pg-session-1',
  });

  const drained = engine.servicePartitionAccessMetrics.snapshotAndReset();
  t.same(Object.keys(drained), [SVC_ID],
    'only the issuing-service statement is attributed');
  t.same(drained[SVC_ID], {
    'orders-p1': {
      [SERVICE_PARTITION_ACCESS_KIND.READ]: 1,
      [SERVICE_PARTITION_ACCESS_KIND.WRITE]: 0,
    },
    'joined-p7': {
      [SERVICE_PARTITION_ACCESS_KIND.READ]: 1,
      [SERVICE_PARTITION_ACCESS_KIND.WRITE]: 0,
    },
  }, 'the executed partition set (including join fanout) is attributed');
  t.ok(engine.servicePartitionAccessPublisher.timer,
    'the publisher lazily armed on first recorded access');
  await engine.shutdown();
  t.equal(engine.servicePartitionAccessPublisher.timer, null,
    'engine shutdown stops the publisher timer');
  t.end();
});

test('engine does not record failed selects', async (t) => {
  const engine = buildEngine();
  engine.queryExecutor = {
    executeSelect: async () => ({
      success: false,
      error: 'boom',
      partitions: ['orders-p1'],
    }),
  };
  await engine.executeQuery('SELECT * FROM orders', [], {
    issuingServiceId: SVC_ID,
  });
  t.equal(engine.servicePartitionAccessMetrics.hasData(), false,
    'failed selects are not attributed');
  t.end();
});

test('write statements record write attribution', async (t) => {
  const engine = buildEngine();
  const recorded = [];
  engine.recordServicePartitionAccess = (queryOptions, partitionIds, kind) => {
    recorded.push({queryOptions, partitionIds, kind});
  };
  engine.distributedWriteCoordinator = {
    createWritePlan: () => ({
      operationId: 'op-1',
      idempotencyKey: 'idem-1',
      partitionStatements: new Map([['orders-p1', {}]]),
    }),
    executePlan: async () => ({success: true, affectedRows: 1}),
  };

  const result = await engine.executeQuery(
    'INSERT INTO orders (id) VALUES (1)',
    [],
    {issuingServiceId: SVC_ID},
  );
  t.equal(result.success, true, 'insert succeeds through the stubbed plan');
  t.equal(recorded.length, 1, 'insert recorded one attribution call');
  t.same(recorded[0].partitionIds, ['orders-p1'],
    'the write-plan partitions are attributed');
  t.equal(recorded[0].kind, SERVICE_PARTITION_ACCESS_KIND.WRITE,
    'attributed as a write');
  t.equal(recorded[0].queryOptions.issuingServiceId, SVC_ID,
    'the issuing service flows to the recorder');
  t.end();
});

test('publisher drains deltas into per-(node,service) gateway upserts',
  async (t) => {
    const metrics = new ServicePartitionAccessMetrics();
    const upserts = [];
    let failNext = false;
    const gateway = {
      upsertSystemTableRow: async (tableName, row, options) => {
        if (failNext) {
          failNext = false;
          throw new Error('gateway unavailable');
        }
        upserts.push({tableName, row, options});
        return {success: true};
      },
    };
    let nowMs = 1000;
    const publisher = new ServicePartitionAccessPublisher({
      nodeId: NODE_ID,
      metrics,
      getGateway: () => gateway,
      getLogger: () => null,
      now: () => nowMs,
    });

    const empty = await publisher.publishOnce();
    t.same(empty, {published: 0, failed: 0},
      'no counts means no gateway writes');

    metrics.record(SVC_ID, ['p1'], SERVICE_PARTITION_ACCESS_KIND.READ);
    metrics.record(SVC_ID, ['p1'], SERVICE_PARTITION_ACCESS_KIND.WRITE);
    nowMs = 4000;
    const first = await publisher.publishOnce();
    t.same(first, {published: 1, failed: 0}, 'one row per service published');
    t.equal(upserts[0].tableName, TABLES.SERVICE_PARTITION_ACCESS,
      'row targets the attribution system table');
    t.equal(
      upserts[0].row[SPA_COL.ACCESS_ID],
      `${NODE_ID}:${SVC_ID}`,
      'row is keyed (node, service)',
    );
    t.same(JSON.parse(upserts[0].row[SPA_COL.ACCESS_JSON]), {
      p1: {
        [SERVICE_PARTITION_ACCESS_KIND.READ]: 1,
        [SERVICE_PARTITION_ACCESS_KIND.WRITE]: 1,
      },
    }, 'access_json carries the drained delta counts');
    t.equal(upserts[0].row[SPA_COL.WINDOW_STARTED_AT], 1000,
      'window start is the previous flush time');
    t.equal(upserts[0].row[SPA_COL.PUBLISHED_AT], 4000,
      'published_at is the flush time');
    t.ok(upserts[0].options.coalescingKey.includes(SVC_ID),
      'writes are coalesced per (node, service)');
    t.equal(metrics.hasData(), false, 'publish drains the accumulator');

    metrics.record(SVC_ID, ['p2'], SERVICE_PARTITION_ACCESS_KIND.READ);
    failNext = true;
    const failed = await publisher.publishOnce();
    t.same(failed, {published: 0, failed: 1}, 'gateway failure is counted');
    t.equal(metrics.hasData(), true,
      'failed rows merge their counts back for the next flush');
    const retried = await publisher.publishOnce();
    t.same(retried, {published: 1, failed: 0}, 'restored counts republish');
    t.same(JSON.parse(upserts[1].row[SPA_COL.ACCESS_JSON]), {
      p2: {
        [SERVICE_PARTITION_ACCESS_KIND.READ]: 1,
        [SERVICE_PARTITION_ACCESS_KIND.WRITE]: 0,
      },
    }, 'the restored delta survives the failure intact');

    publisher.start();
    const timer = publisher.timer;
    t.ok(timer, 'start arms the interval');
    publisher.start();
    t.equal(publisher.timer, timer, 'start is idempotent');
    publisher.stop();
    t.equal(publisher.timer, null, 'stop clears the interval');
    publisher.start();
    t.equal(publisher.timer, null,
      'stop is terminal: a record during node drain cannot re-arm');
    t.end();
  });

test('publisher merges back deltas the gateway rejects by RESOLVING ' +
  '(readiness-deferred / superseded), and is single-flight', async (t) => {
  const metrics = new ServicePartitionAccessMetrics();
  const outcomes = [];
  let resolveBlocked;
  const gateway = {
    upsertSystemTableRow: async () => {
      const outcome = outcomes.shift();
      if (outcome === 'block') {
        return new Promise((resolve) => {
          resolveBlocked = () => resolve({success: true});
        });
      }
      return outcome;
    },
  };
  const publisher = new ServicePartitionAccessPublisher({
    nodeId: NODE_ID,
    metrics,
    getGateway: () => gateway,
    getLogger: () => null,
    now: () => 1000,
  });

  metrics.record(SVC_ID, ['p1'], SERVICE_PARTITION_ACCESS_KIND.READ);
  outcomes.push({success: false, outcome: 'mutation_readiness_deferred'});
  const deferred = await publisher.publishOnce();
  t.same(deferred, {published: 0, failed: 1},
    'a resolved success:false outcome counts as a failure');
  t.equal(metrics.hasData(), true,
    'readiness-deferred deltas survive to the next flush');

  outcomes.push({success: true, superseded: true});
  const superseded = await publisher.publishOnce();
  t.same(superseded, {published: 0, failed: 1},
    'a superseded no-op outcome counts as a failure');
  t.equal(metrics.hasData(), true,
    'superseded deltas survive to the next flush');

  outcomes.push('block');
  const inFlight = publisher.publishOnce();
  metrics.record(SVC_ID, ['p2'], SERVICE_PARTITION_ACCESS_KIND.READ);
  const overlapped = await publisher.publishOnce();
  t.same(overlapped, {published: 0, failed: 0},
    'an overlapping flush is skipped while one is in flight ' +
      '(no self-supersede under a slow gateway)');
  resolveBlocked();
  const blocked = await inFlight;
  t.same(blocked, {published: 1, failed: 0}, 'the slow flush completes');
  t.equal(metrics.hasData(), true,
    'the overlapped delta stays queued for the next flush');
  t.end();
});

test('service_partition_access system table is registered end-to-end', (t) => {
  t.ok(
    SYSTEM_TABLE_SCHEMAS.includes(SERVICE_PARTITION_ACCESS_SCHEMA),
    'schema is in the bootstrap creation list',
  );
  t.equal(
    INITIAL_PARTITION_IDS[TABLES.SERVICE_PARTITION_ACCESS],
    'service_partition_access-p1',
    'bootstrap partition id assigned',
  );
  t.equal(
    INITIAL_REPLICA_IDS[TABLES.SERVICE_PARTITION_ACCESS].length,
    3,
    'bootstrap replica ids assigned',
  );
  t.ok(
    CDC_PROPAGATED_TABLES.includes(TABLES.SERVICE_PARTITION_ACCESS),
    'table is CDC-propagated into every node cache (PLACEMENT class)',
  );
  t.equal(
    SYSTEM_CACHE_KEY_DESCRIPTOR[TABLES.SERVICE_PARTITION_ACCESS],
    SPA_COL.ACCESS_ID,
    'cache key descriptor derives access_id from the schema',
  );
  t.end();
});
