/**
 * Tests for LiveQueryService - Core live query functionality.
 * Requirements: 33.1, 33.4, 33.16
 */

import {test} from 'tap';
import {
  LiveQueryService,
  compilePredicate,
  extractPartitionKeyValue,
  canonicalizePredicate,
  parseLiveSelect,
  // evaluateExpression imported for potential future use
} from '../../src/live-query/live-query-service.js';

test('parseLiveSelect - parses LIVE SELECT statements', async (t) => {
  const result = parseLiveSelect('LIVE SELECT * FROM orders WHERE id = 1');

  t.equal(result.isLive, true, 'should detect LIVE prefix');
  t.equal(result.sql, 'SELECT * FROM orders WHERE id = 1', 'should extract SELECT');
});

test('parseLiveSelect - handles regular SELECT', async (t) => {
  const result = parseLiveSelect('SELECT * FROM orders');

  t.equal(result.isLive, false, 'should not be live');
  t.equal(result.sql, 'SELECT * FROM orders', 'should preserve SQL');
});

test('parseLiveSelect - throws on invalid LIVE statement', async (t) => {
  t.throws(() => {
    parseLiveSelect('LIVE UPDATE orders SET x = 1');
  }, /LIVE must be followed by SELECT/);
});

test('compilePredicate - returns true for null WHERE', async (t) => {
  const predicate = compilePredicate(null);
  t.equal(predicate({}), true, 'should match all rows');
  t.equal(predicate({id: 1}), true, 'should match any row');
});

test('compilePredicate - handles equality', async (t) => {
  const whereClause = {
    type: 'binary',
    operator: '=',
    left: {type: 'column_ref', column: 'status'},
    right: {type: 'literal', value: 'active'},
  };

  const predicate = compilePredicate(whereClause);

  t.equal(predicate({status: 'active'}), true, 'should match');
  t.equal(predicate({status: 'inactive'}), false, 'should not match');
});

test('compilePredicate - handles AND', async (t) => {
  const whereClause = {
    type: 'binary',
    operator: 'AND',
    left: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'status'},
      right: {type: 'literal', value: 'active'},
    },
    right: {
      type: 'binary',
      operator: '>',
      left: {type: 'column_ref', column: 'count'},
      right: {type: 'literal', value: 5},
    },
  };

  const predicate = compilePredicate(whereClause);

  t.equal(predicate({status: 'active', count: 10}), true, 'both true');
  t.equal(predicate({status: 'active', count: 3}), false, 'second false');
  t.equal(predicate({status: 'inactive', count: 10}), false, 'first false');
});


test('compilePredicate - handles OR', async (t) => {
  const whereClause = {
    type: 'binary',
    operator: 'OR',
    left: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'status'},
      right: {type: 'literal', value: 'active'},
    },
    right: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'status'},
      right: {type: 'literal', value: 'pending'},
    },
  };

  const predicate = compilePredicate(whereClause);

  t.equal(predicate({status: 'active'}), true, 'first matches');
  t.equal(predicate({status: 'pending'}), true, 'second matches');
  t.equal(predicate({status: 'inactive'}), false, 'neither matches');
});

test('compilePredicate - handles NOT', async (t) => {
  const whereClause = {
    type: 'unary',
    operator: 'NOT',
    operand: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'deleted'},
      right: {type: 'literal', value: true},
    },
  };

  const predicate = compilePredicate(whereClause);

  t.equal(predicate({deleted: false}), true, 'NOT true = false');
  t.equal(predicate({deleted: true}), false, 'NOT false = true');
});

test('compilePredicate - handles IN', async (t) => {
  const whereClause = {
    type: 'in',
    expression: {type: 'column_ref', column: 'status'},
    values: [
      {type: 'literal', value: 'active'},
      {type: 'literal', value: 'pending'},
    ],
  };

  const predicate = compilePredicate(whereClause);

  t.equal(predicate({status: 'active'}), true, 'in list');
  t.equal(predicate({status: 'pending'}), true, 'in list');
  t.equal(predicate({status: 'deleted'}), false, 'not in list');
});

test('compilePredicate - handles BETWEEN', async (t) => {
  const whereClause = {
    type: 'between',
    expression: {type: 'column_ref', column: 'age'},
    low: {type: 'literal', value: 18},
    high: {type: 'literal', value: 65},
  };

  const predicate = compilePredicate(whereClause);

  t.equal(predicate({age: 30}), true, 'in range');
  t.equal(predicate({age: 18}), true, 'at low bound');
  t.equal(predicate({age: 65}), true, 'at high bound');
  t.equal(predicate({age: 17}), false, 'below range');
  t.equal(predicate({age: 66}), false, 'above range');
});

test('compilePredicate - handles LIKE', async (t) => {
  const whereClause = {
    type: 'like',
    expression: {type: 'column_ref', column: 'name'},
    pattern: {type: 'literal', value: 'John%'},
  };

  const predicate = compilePredicate(whereClause);

  t.equal(predicate({name: 'John'}), true, 'exact prefix');
  t.equal(predicate({name: 'Johnny'}), true, 'prefix match');
  t.equal(predicate({name: 'Jane'}), false, 'no match');
});

test('compilePredicate - handles IS NULL', async (t) => {
  const whereClause = {
    type: 'binary',
    operator: 'IS NULL',
    left: {type: 'column_ref', column: 'deleted_at'},
    right: {type: 'literal', value: null},
  };

  const predicate = compilePredicate(whereClause);

  t.equal(predicate({deleted_at: null}), true, 'is null');
  t.equal(predicate({deleted_at: '2024-01-01'}), false, 'not null');
});

test('extractPartitionKeyValue - extracts equality value', async (t) => {
  const whereClause = {
    type: 'binary',
    operator: '=',
    left: {type: 'column_ref', column: 'customer_id'},
    right: {type: 'literal', value: 123},
  };

  const value = extractPartitionKeyValue(whereClause, 'customer_id');
  t.equal(value, 123, 'should extract value');
});

test('extractPartitionKeyValue - extracts from AND', async (t) => {
  const whereClause = {
    type: 'binary',
    operator: 'AND',
    left: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'customer_id'},
      right: {type: 'literal', value: 456},
    },
    right: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'status'},
      right: {type: 'literal', value: 'active'},
    },
  };

  const value = extractPartitionKeyValue(whereClause, 'customer_id');
  t.equal(value, 456, 'should extract from AND');
});

test('extractPartitionKeyValue - extracts IN values', async (t) => {
  const whereClause = {
    type: 'in',
    expression: {type: 'column_ref', column: 'id'},
    values: [
      {type: 'literal', value: 1},
      {type: 'literal', value: 2},
      {type: 'literal', value: 3},
    ],
  };

  const value = extractPartitionKeyValue(whereClause, 'id');
  t.same(value, [1, 2, 3], 'should extract IN values');
});

test('extractPartitionKeyValue - returns null for non-key column', async (t) => {
  const whereClause = {
    type: 'binary',
    operator: '=',
    left: {type: 'column_ref', column: 'status'},
    right: {type: 'literal', value: 'active'},
  };

  const value = extractPartitionKeyValue(whereClause, 'customer_id');
  t.equal(value, null, 'should return null');
});

test('canonicalizePredicate - produces consistent output', async (t) => {
  const where1 = {
    type: 'binary',
    operator: '=',
    left: {type: 'column_ref', column: 'id'},
    right: {type: 'literal', value: 1},
  };

  const where2 = {
    right: {value: 1, type: 'literal'},
    left: {column: 'id', type: 'column_ref'},
    type: 'binary',
    operator: '=',
  };

  const sig1 = canonicalizePredicate(where1);
  const sig2 = canonicalizePredicate(where2);

  t.equal(sig1, sig2, 'should produce same signature');
});

test('LiveQueryService - creates with parsed query', async (t) => {
  const parsedQuery = {
    type: 'SELECT',
    from: {name: 'orders'},
    where: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'id'},
      right: {type: 'literal', value: 1},
    },
  };

  const service = new LiveQueryService({parsedQuery});

  t.ok(service.queryId, 'should have queryId');
  t.equal(service.table, 'orders', 'should extract table');
  t.ok(service.predicate, 'should have predicate');
});

test('LiveQueryService - evaluates predicate', async (t) => {
  const parsedQuery = {
    type: 'SELECT',
    from: {name: 'orders'},
    where: {
      type: 'binary',
      operator: '>',
      left: {type: 'column_ref', column: 'amount'},
      right: {type: 'literal', value: 100},
    },
  };

  const service = new LiveQueryService({parsedQuery});

  t.equal(service.evaluatePredicate({amount: 150}), true, 'matches');
  t.equal(service.evaluatePredicate({amount: 50}), false, 'does not match');
});

test('LiveQueryService - renews subscription', async (t) => {
  const service = new LiveQueryService({
    parsedQuery: {from: {name: 'test'}},
  });

  const before = service.lastRenewal;
  await new Promise((r) => setTimeout(r, 10));

  const result = service.renew('cursor-123');

  t.ok(service.lastRenewal > before, 'should update lastRenewal');
  t.equal(service.lastSeenHLC, 'cursor-123', 'should update cursor');
  t.ok(result.expiresAt > Date.now(), 'should have future expiry');
});

test('LiveQueryService - detects expiration', async (t) => {
  const service = new LiveQueryService({
    parsedQuery: {from: {name: 'test'}},
  });

  // Set TTL to very short
  service.ttlMs = 10;
  service.lastRenewal = Date.now() - 100;

  t.equal(service.isExpired(), true, 'should be expired');
});

test('LiveQueryService - gets query signature', async (t) => {
  const parsedQuery = {
    from: {name: 'orders'},
    where: {
      type: 'binary',
      operator: '=',
      left: {type: 'column_ref', column: 'id'},
      right: {type: 'literal', value: 1},
    },
  };

  const service = new LiveQueryService({parsedQuery});
  const sig = service.getQuerySignature();

  t.ok(sig.startsWith('orders:'), 'should include table');
  t.ok(sig.length > 10, 'should have predicate hash');
});
