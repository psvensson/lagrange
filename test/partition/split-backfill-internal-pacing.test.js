import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';

const FOREGROUND_WRITE_BUDGET_MS = 15_000;
const PROPOSAL_COST_MS = 300;
const BACKFILL_BATCH_SIZE = 64;
const TABLE_SCHEMA = {
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'value', type: 'TEXT'},
  ],
};

function createSnapshotDb(rows) {
  return {
    prepare(sql) {
      if (sql.startsWith('PRAGMA table_info')) {
        return {
          all() {
            return [{name: 'id'}, {name: 'value'}];
          },
        };
      }
      return {
        iterate() {
          return rows[Symbol.iterator]();
        },
      };
    },
  };
}

function createPartition(partitionId = 'ratings-source') {
  return new PartitionService({
    partitionId,
    tableId: 'tbl-ratings',
    tableName: 'ratings',
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    schema: TABLE_SCHEMA,
    dbPath: ':memory:',
  });
}

async function settlePendingCdc(partition) {
  await Promise.all([...partition.pendingCDCEventDeliveries]);
}

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('split snapshot backfill reaches a foreground turn inside its original budget',
  async (t) => {
    const rows = Array.from({length: BACKFILL_BATCH_SIZE + 1}, (_, index) => ({
      id: index + 1,
      value: `rating-${index + 1}`,
    }));
    const source = createPartition();
    const left = createPartition('ratings-left');
    const right = createPartition('ratings-right');
    const children = new Map([
      ['ratings-left', left],
      ['ratings-right', right],
    ]);
    const childCdcEvents = [];
    const yieldElapsedMs = [];
    let elapsedMs = 0;
    let proposalCount = 0;
    let foregroundSubmissionCount = 0;
    let foregroundResult = null;

    try {
      await Promise.all([
        source.initialize(),
        left.initialize(),
        right.initialize(),
      ]);
      left.subscribeToCDC((event) => childCdcEvents.push(event));
      right.subscribeToCDC((event) => childCdcEvents.push(event));
      source.sqlQueryEngine = {
        queryExecutor: {
          async executeOnPartition(
            partitionId,
            sql,
            params,
            _forRead,
            _preferLeader,
            _preferSameLatencyGroup,
            executionOptions,
          ) {
            proposalCount += 1;
            elapsedMs += PROPOSAL_COST_MS;
            return children.get(partitionId).executeQuery(sql, params, {
              splitMirrorOrigin: executionOptions.splitMirrorOrigin,
            });
          },
        },
      };
      source.splitSnapshotBackfillYieldEveryRows = BACKFILL_BATCH_SIZE;
      source.yieldSplitBackfillTurn = async () => {
        yieldElapsedMs.push(elapsedMs);
        foregroundSubmissionCount += 1;
        if (elapsedMs > FOREGROUND_WRITE_BUDGET_MS) {
          foregroundResult = {success: false, error: 'foreground timeout'};
          return;
        }
        foregroundResult = await source.executeQuery(
          'INSERT INTO ratings (id, value) VALUES (?, ?)',
          [10_000, 'foreground'],
        );
      };

      await source.backfillSplitSnapshot(createSnapshotDb(rows), {
        primaryKeyColumn: 'id',
        splitKey: 33,
        targetPartitionIds: ['ratings-left', 'ratings-right'],
      });
      await Promise.all([settlePendingCdc(left), settlePendingCdc(right)]);

      t.equal(proposalCount, 3, '65 rows require three routed child proposals');
      t.equal(foregroundSubmissionCount, 1, 'client submits the write once');
      t.equal(foregroundResult?.success, true);
      t.ok(yieldElapsedMs[0] <= FOREGROUND_WRITE_BUDGET_MS);
      t.same(
        source.db.prepare('SELECT id, value FROM ratings').all(),
        [{id: 10_000, value: 'foreground'}],
        'the foreground write commits exactly once',
      );
      t.same(
        left.db.prepare('SELECT id FROM ratings ORDER BY id').all()
          .map((row) => row.id),
        rows.slice(0, 32).map((row) => row.id),
      );
      t.same(
        right.db.prepare('SELECT id FROM ratings ORDER BY id').all()
          .map((row) => row.id),
        rows.slice(32).map((row) => row.id),
      );
      t.equal(
        childCdcEvents.length,
        0,
        'physical snapshot copies must not publish logical CDC events',
      );

      await source.routeSplitMirroredWrite(
        'ratings-left',
        'INSERT OR REPLACE INTO ratings (id, value) VALUES (?, ?)',
        [1, 'live-update'],
      );
      await settlePendingCdc(left);
      t.equal(childCdcEvents.length, 1, 'live mirrors retain CDC delivery');
      t.same(childCdcEvents[0].data.id, 1);
      t.same(childCdcEvents[0].data.value, 'live-update');
    } finally {
      await Promise.all([
        source.shutdown(),
        left.shutdown(),
        right.shutdown(),
      ]);
    }
  });

test('split snapshot backfill stops after a stuck internal batch', async (t) => {
  const partition = createPartition();
  let proposalCount = 0;
  let elapsedMs = 0;

  partition.splitSnapshotBackfillYieldEveryRows = BACKFILL_BATCH_SIZE;
  partition.sqlQueryEngine = {
    queryExecutor: {
      async executeOnPartition() {
        proposalCount += 1;
        elapsedMs += FOREGROUND_WRITE_BUDGET_MS;
        return {success: false, error: 'child proposal stayed stuck'};
      },
    },
  };

  await t.rejects(
    partition.backfillSplitSnapshot(
      createSnapshotDb([{id: 1, value: 'rating-1'}]),
      {
        primaryKeyColumn: 'id',
        splitKey: 33,
        targetPartitionIds: ['ratings-left', 'ratings-right'],
      },
    ),
    {message: 'child proposal stayed stuck'},
  );
  t.equal(proposalCount, 1, 'backfill must not restart a fresh timeout budget');
  t.equal(elapsedMs, FOREGROUND_WRITE_BUDGET_MS);
});
