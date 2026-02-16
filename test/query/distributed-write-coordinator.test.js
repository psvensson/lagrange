import {test} from '../../src/test-helpers/tap.js';
import {DistributedWriteCoordinator} from '../../src/query/distributed-write-coordinator.js';
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
