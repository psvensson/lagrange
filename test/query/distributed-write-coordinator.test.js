import {test} from '../../src/test-helpers/tap.js';
import {DistributedWriteCoordinator} from '../../src/query/distributed/distributed-write-coordinator.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

function createTablePartitions() {
  return [
    {partition_id: 'p1', partition_key_start: null, partition_key_end: 'm'},
    {partition_id: 'p2', partition_key_start: 'm', partition_key_end: null},
  ];
}

function createInsertExecutor() {
  return {
    async executeInsert(partitionAst, _partitionId, params) {
      const rows = partitionAst.values.map((row) => {
        const idExpr = row[0];
        if (typeof idExpr.index === 'number') {
          return {id: params[idExpr.index]};
        }
        return {id: idExpr.value};
      });
      return {
        success: true,
        affectedRows: partitionAst.values.length,
        rows,
      };
    },
    async executeUpdate(_ast, partitionIds, _params) {
      return {
        success: true,
        affectedRows: 1,
        rows: [{partitionId: partitionIds[0]}],
      };
    },
    async executeDelete(_ast, _partitionIds, _params) {
      return {
        success: true,
        affectedRows: 1,
        rows: [],
      };
    },
  };
}

test('DistributedWriteCoordinator - routes multi-row INSERT to all partitions', async (t) => {
  const partitions = createTablePartitions();
  const coordinator = new DistributedWriteCoordinator({
    partitionResolver: {
      resolvePartitionForKey(_table, keyValue) {
        return String(keyValue) < 'm' ? 'p1' : 'p2';
      },
    },
    queryExecutor: createInsertExecutor(),
    getTablePartitions() {
      return partitions;
    },
    getTableInfo() {
      return {primaryKey: 'id'};
    },
  });

  const ast = new SQLParser(
    'INSERT INTO users (id, name) VALUES (?, ?), (?, ?) RETURNING id',
  ).parse();
  const params = ['alice', 'Alice', 'zack', 'Zack'];

  const plan = coordinator.createWritePlan(ast, params, {sessionId: 's1'});
  t.equal(plan.partitionStatements.size, 2);
  t.equal(plan.idempotencyKey, plan.operationId);

  const result = await coordinator.executePlan(plan, params);
  t.equal(result.success, true);
  t.equal(result.affectedRows, 2);
  t.same(result.partitions, ['p1', 'p2']);
  t.same(result.rows.map((row) => row.id).sort(), ['alice', 'zack']);
});

test('DistributedWriteCoordinator - surfaces participant failures', async (t) => {
  const coordinator = new DistributedWriteCoordinator({
    partitionResolver: {},
    queryExecutor: {
      async executeInsert() {
        return {success: true, affectedRows: 0, rows: []};
      },
      async executeUpdate(_ast, partitionIds, _params) {
        if (partitionIds[0] === 'p2') {
          return {success: false, error: 'update failed', affectedRows: 0, rows: []};
        }
        return {success: true, affectedRows: 1, rows: [{id: 1}]};
      },
      async executeDelete() {
        return {success: true, affectedRows: 0, rows: []};
      },
    },
    getTablePartitions() {
      return [];
    },
    getTableInfo() {
      return {primaryKey: 'id'};
    },
  });

  const ast = new SQLParser(
    'UPDATE users SET status = \'active\' WHERE id > 0 RETURNING id',
  ).parse();
  const plan = coordinator.createWritePlan(ast, [], {
    partitionIds: ['p1', 'p2'],
    idempotencyKey: 'explicit-key',
  });

  const result = await coordinator.executePlan(plan, []);
  t.equal(result.success, false);
  t.equal(result.idempotencyKey, 'explicit-key');
  t.same(result.failedPartitions, ['p2']);
  t.equal(result.affectedRows, 1);
  t.same(result.rows, [{id: 1}]);
});

test('DistributedWriteCoordinator - retries failed participant once', async (t) => {
  const attempts = new Map();
  const coordinator = new DistributedWriteCoordinator({
    partitionResolver: {},
    queryExecutor: {
      async executeInsert() {
        return {success: true, affectedRows: 0, rows: []};
      },
      async executeUpdate() {
        return {success: true, affectedRows: 0, rows: []};
      },
      async executeDelete(_ast, partitionIds, _params) {
        const partitionId = partitionIds[0];
        const attempt = (attempts.get(partitionId) || 0) + 1;
        attempts.set(partitionId, attempt);
        if (attempt === 1) {
          throw new Error('transient failure');
        }
        return {success: true, affectedRows: 1, rows: []};
      },
    },
    getTablePartitions() {
      return [];
    },
    getTableInfo() {
      return {primaryKey: 'id'};
    },
    maxRetries: 1,
  });

  const ast = new SQLParser('DELETE FROM users WHERE id = 1').parse();
  const plan = coordinator.createWritePlan(ast, [], {partitionIds: ['p1']});

  const result = await coordinator.executePlan(plan, []);
  t.equal(result.success, true);
  t.equal(result.affectedRows, 1);
  t.equal(attempts.get('p1'), 2);
});


// ---------------------------------------------------------------------------
// Task 1.3: Unit tests for parallel partition execution
// ---------------------------------------------------------------------------

/**
 * Helper: build a minimal write plan targeting the given partition IDs.
 */
function buildPlan(partitionIds, statementType = 'INSERT') {
  const partitionStatements = new Map();
  for (const id of partitionIds) {
    partitionStatements.set(id, {type: statementType, table: 't'});
  }
  return {
    statementType,
    partitionStatements,
    idempotencyKey: 'idem-1',
    operationId: 'op-1',
  };
}

/**
 * Helper: create a coordinator with overridden executePartitionStatement.
 */
function createTestCoordinator(resultsByPartition) {
  const coordinator = new DistributedWriteCoordinator({
    partitionResolver: {},
    queryExecutor: {
      async executeInsert() {
        return {success: true, affectedRows: 0, rows: []};
      },
      async executeUpdate() {
        return {success: true, affectedRows: 0, rows: []};
      },
      async executeDelete() {
        return {success: true, affectedRows: 0, rows: []};
      },
    },
    getTablePartitions() {
      return [];
    },
    getTableInfo() {
      return {primaryKey: 'id'};
    },
    maxRetries: 0,
  });

  coordinator.executePartitionStatement =
    async (_type, _ast, partitionId, _params) => {
      const entry = resultsByPartition.get(partitionId);
      if (!entry) {
        return {success: true, affectedRows: 0, rows: [], attempts: 1};
      }
      if (entry.shouldThrow) {
        throw new Error(entry.error || 'unexpected');
      }
      return entry;
    };

  return coordinator;
}

test('executePlan - single-partition fast path executes directly', async (t) => {
  const resultsByPartition = new Map();
  resultsByPartition.set('p1', {
    success: true,
    affectedRows: 3,
    rows: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
    attempts: 1,
  });

  const coordinator = createTestCoordinator(resultsByPartition);
  const plan = buildPlan(['p1']);
  const result = await coordinator.executePlan(plan, []);

  t.equal(result.success, true);
  t.equal(result.affectedRows, 3);
  t.equal(result.rows.length, 3);
  t.same(result.partitions, ['p1']);
  t.equal(result.participantResults.length, 1);
  t.equal(result.participantResults[0].partitionId, 'p1');
});

test('executePlan - all partitions succeed aggregates totals', async (t) => {
  const resultsByPartition = new Map();
  resultsByPartition.set('p1', {
    success: true,
    affectedRows: 2,
    rows: [{id: 'r1'}],
    attempts: 1,
  });
  resultsByPartition.set('p2', {
    success: true,
    affectedRows: 5,
    rows: [{id: 'r2'}, {id: 'r3'}],
    attempts: 1,
  });
  resultsByPartition.set('p3', {
    success: true,
    affectedRows: 1,
    rows: [],
    attempts: 1,
  });

  const coordinator = createTestCoordinator(resultsByPartition);
  const plan = buildPlan(['p3', 'p1', 'p2']);
  const result = await coordinator.executePlan(plan, []);

  t.equal(result.success, true);
  t.equal(result.affectedRows, 8);
  t.equal(result.rows.length, 3);
  t.same(result.partitions, ['p1', 'p2', 'p3']);
});

test('executePlan - all partitions fail reports all failures', async (t) => {
  const resultsByPartition = new Map();
  resultsByPartition.set('p1', {
    success: false,
    error: 'disk full',
    attempts: 1,
  });
  resultsByPartition.set('p2', {
    success: false,
    error: 'timeout',
    attempts: 1,
  });

  const coordinator = createTestCoordinator(resultsByPartition);
  const plan = buildPlan(['p1', 'p2']);
  const result = await coordinator.executePlan(plan, []);

  t.equal(result.success, false);
  t.equal(result.affectedRows, 0);
  t.equal(result.rows.length, 0);
  t.same(result.failedPartitions.sort(), ['p1', 'p2']);
  t.equal(result.partitionErrors.length, 2);

  const errorMap = new Map(
    result.partitionErrors.map((e) => [e.partitionId, e.error]),
  );
  t.equal(errorMap.get('p1'), 'disk full');
  t.equal(errorMap.get('p2'), 'timeout');
});

test('executePlan - mixed success and failure collects all results',
  async (t) => {
    const resultsByPartition = new Map();
    resultsByPartition.set('p1', {
      success: true,
      affectedRows: 4,
      rows: [{id: 'x'}],
      attempts: 1,
    });
    resultsByPartition.set('p2', {
      success: false,
      error: 'leader unavailable',
      attempts: 1,
    });
    resultsByPartition.set('p3', {
      success: true,
      affectedRows: 2,
      rows: [],
      attempts: 1,
    });

    const coordinator = createTestCoordinator(resultsByPartition);
    const plan = buildPlan(['p1', 'p2', 'p3']);
    const result = await coordinator.executePlan(plan, []);

    t.equal(result.success, false);
    t.equal(result.affectedRows, 6);
    t.equal(result.rows.length, 1);
    t.same(result.failedPartitions, ['p2']);
    t.equal(result.partitionErrors.length, 1);
    t.equal(result.partitionErrors[0].error, 'leader unavailable');
  },
);

test('executePlan - rejected promises captured as failures', async (t) => {
  const resultsByPartition = new Map();
  resultsByPartition.set('p1', {
    success: true,
    affectedRows: 1,
    rows: [],
    attempts: 1,
  });
  resultsByPartition.set('p2', {
    shouldThrow: true,
    error: 'connection reset',
  });

  const coordinator = createTestCoordinator(resultsByPartition);
  const plan = buildPlan(['p1', 'p2']);
  const result = await coordinator.executePlan(plan, []);

  t.equal(result.success, false);
  t.equal(result.affectedRows, 1);

  const rejectedEntry = result.participantResults.find(
    (r) => r.partitionId === null,
  );
  t.ok(rejectedEntry, 'rejected promise produces a null-partitionId entry');
  t.equal(rejectedEntry.success, false);
  t.equal(rejectedEntry.error, 'connection reset');
});
