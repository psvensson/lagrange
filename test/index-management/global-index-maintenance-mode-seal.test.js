/**
 * Unit tests verifying C1 (global-index-maintenance-mode-seal) invariants
 * and GlobalIndexCatalogContract enforcement under Mode A (synchronous non-unique
 * TX1 index maintenance in Release 0.3.2; global uniqueness deferred to 1.0).
 */

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import * as nodeTest from 'node:test';
import {
  checkGlobalIndexMaintenanceModeSeal,
} from '../../scripts/checks/global-index-maintenance-mode-seal-guard.js';
import {
  GLOBAL_INDEX_ERROR_MSG,
  GLOBAL_INDEX_SQL_STATE,
  GLOBAL_INDEX_STATE,
  assertSupportedGlobalIndexDefinition,
  assertValidGlobalIndexStateTransition,
  createGlobalIndexRecord,
  isReadableByPlanner,
  isValidGlobalIndexStateTransition,
  maintainsOnWrite,
  normalizeGlobalIndexRecord,
} from '../../src/index-management/global-index-catalog-contract.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';

const describe = typeof global.describe === 'function' ?
  global.describe :
  nodeTest.describe;
const it = typeof global.it === 'function' ?
  global.it :
  nodeTest.it;

describe('C1: Global index maintenance mode seal guard', () => {
  it('passes all markdown spec reconciliation and code contract checks in-process', () => {
    const result = checkGlobalIndexMaintenanceModeSeal();
    assert.equal(
      result.metric,
      0,
      `Seal guard reported failures: ${result.failures.join(', ')}`,
    );
    assert.equal(result.failures.length, 0);
  });

  it('exits 0 and outputs metric=0 when invoked as a standalone CLI guard', () => {
    const stdout = execFileSync(
      process.execPath,
      ['scripts/checks/global-index-maintenance-mode-seal-guard.js'],
      {encoding: 'utf8'},
    );
    assert.match(stdout, /^metric=0\s*$/);
  });
});

describe('C1: Mode A non-unique GSI admission and 1.0 uniqueness deferral', () => {
  it('admits non-unique global index definitions', () => {
    assert.doesNotThrow(() => {
      assertSupportedGlobalIndexDefinition({
        isGlobal: true,
        isUnique: false,
        columnNames: ['tenant_id', 'created_at'],
      });
    });

    const record = createGlobalIndexRecord({
      tableName: 'orders',
      indexName: 'idx_orders_tenant_created',
      columnNames: ['tenant_id', 'created_at'],
      isGlobal: 1,
      isUnique: 0,
    });

    assert.equal(record.table_name, 'orders');
    assert.equal(record.index_name, 'idx_orders_tenant_created');
    assert.equal(record.is_global, 1);
    assert.equal(record.is_unique, 0);
    assert.equal(record.state, GLOBAL_INDEX_STATE.CREATING);
  });

  it('rejects cross-partition CREATE UNIQUE GLOBAL INDEX with 0A000 / UNSUPPORTED_SQL_FEATURE', () => {
    assert.throws(
      () => {
        assertSupportedGlobalIndexDefinition({
          isGlobal: true,
          isUnique: true,
          columnNames: ['email'],
        });
      },
      (err) => {
        assert.equal(err.code, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE);
        assert.equal(err.sqlState, GLOBAL_INDEX_SQL_STATE.FEATURE_NOT_SUPPORTED);
        assert.equal(err.sqlState, '0A000');
        assert.equal(
          err.message,
          GLOBAL_INDEX_ERROR_MSG.CROSS_PARTITION_UNIQUE_DEFERRED,
        );
        return true;
      },
    );

    assert.throws(
      () => {
        createGlobalIndexRecord({
          tableName: 'users',
          indexName: 'idx_users_email_uniq',
          columnNames: ['email'],
          isGlobal: 1,
          isUnique: 1,
        });
      },
      (err) => {
        assert.equal(err.code, QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE);
        assert.equal(err.sqlState, GLOBAL_INDEX_SQL_STATE.FEATURE_NOT_SUPPORTED);
        return true;
      },
    );
  });

  it('does not reject local unique indexes under the global index assertion', () => {
    assert.doesNotThrow(() => {
      assertSupportedGlobalIndexDefinition({
        isGlobal: false,
        isUnique: true,
        columnNames: ['local_key'],
      });
    });
  });
});

describe('C1: Mode A read visibility gates', () => {
  it('permits query planner selection strictly when state is READ_WRITE', () => {
    assert.equal(
      isReadableByPlanner(GLOBAL_INDEX_STATE.READ_WRITE),
      true,
      'READ_WRITE must be readable by query planner',
    );
  });

  it('forbids planner selection for all non-readable and transitional states', () => {
    const nonReadableStates = [
      GLOBAL_INDEX_STATE.CREATING,
      GLOBAL_INDEX_STATE.WRITE_ONLY,
      GLOBAL_INDEX_STATE.BACKFILLING,
      GLOBAL_INDEX_STATE.DROPPING,
      GLOBAL_INDEX_STATE.FAILED,
    ];

    for (const state of nonReadableStates) {
      assert.equal(
        isReadableByPlanner(state),
        false,
        `Index in state ${state} must not be readable by planner`,
      );
    }
  });
});

describe('C1: Mode A write maintenance gates', () => {
  it('enlists indexes in WRITE_ONLY, BACKFILLING, and READ_WRITE for synchronous TX1 writes', () => {
    const maintainingStates = [
      GLOBAL_INDEX_STATE.WRITE_ONLY,
      GLOBAL_INDEX_STATE.BACKFILLING,
      GLOBAL_INDEX_STATE.READ_WRITE,
    ];

    for (const state of maintainingStates) {
      assert.equal(
        maintainsOnWrite(state),
        true,
        `Index in state ${state} must be maintained synchronously on write`,
      );
    }
  });

  it('excludes CREATING, DROPPING, and FAILED from write maintenance', () => {
    const nonMaintainingStates = [
      GLOBAL_INDEX_STATE.CREATING,
      GLOBAL_INDEX_STATE.DROPPING,
      GLOBAL_INDEX_STATE.FAILED,
    ];

    for (const state of nonMaintainingStates) {
      assert.equal(
        maintainsOnWrite(state),
        false,
        `Index in state ${state} must not be maintained on write`,
      );
    }
  });
});

describe('C1: Mode A lifecycle state transitions', () => {
  it('allows forward happy-path transitions CREATING -> WRITE_ONLY -> BACKFILLING -> READ_WRITE', () => {
    assert.equal(
      isValidGlobalIndexStateTransition(
        GLOBAL_INDEX_STATE.CREATING,
        GLOBAL_INDEX_STATE.WRITE_ONLY,
      ),
      true,
    );
    assert.equal(
      isValidGlobalIndexStateTransition(
        GLOBAL_INDEX_STATE.WRITE_ONLY,
        GLOBAL_INDEX_STATE.BACKFILLING,
      ),
      true,
    );
    assert.equal(
      isValidGlobalIndexStateTransition(
        GLOBAL_INDEX_STATE.BACKFILLING,
        GLOBAL_INDEX_STATE.READ_WRITE,
      ),
      true,
    );
  });

  it('allows termination transitions to DROPPING and FAILED', () => {
    assert.equal(
      isValidGlobalIndexStateTransition(
        GLOBAL_INDEX_STATE.READ_WRITE,
        GLOBAL_INDEX_STATE.DROPPING,
      ),
      true,
    );
    assert.equal(
      isValidGlobalIndexStateTransition(
        GLOBAL_INDEX_STATE.BACKFILLING,
        GLOBAL_INDEX_STATE.FAILED,
      ),
      true,
    );
  });

  it('throws on illegal transitions and state regressions', () => {
    assert.equal(
      isValidGlobalIndexStateTransition(
        GLOBAL_INDEX_STATE.CREATING,
        GLOBAL_INDEX_STATE.READ_WRITE,
      ),
      false,
    );
    assert.throws(
      () => {
        assertValidGlobalIndexStateTransition(
          GLOBAL_INDEX_STATE.CREATING,
          GLOBAL_INDEX_STATE.READ_WRITE,
        );
      },
      /Invalid global index state transition/,
    );

    assert.equal(
      isValidGlobalIndexStateTransition(
        GLOBAL_INDEX_STATE.READ_WRITE,
        GLOBAL_INDEX_STATE.BACKFILLING,
      ),
      false,
    );
  });

  it('normalizes catalog records with expected fields and defaults', () => {
    const raw = {
      index_id: 'idx-123',
      table_id: 'tbl-456',
      table_name: 'orders',
      index_name: 'idx_orders_customer',
      column_names: JSON.stringify(['customer_id']),
      is_global: 1,
      is_unique: 0,
      state: GLOBAL_INDEX_STATE.READ_WRITE,
    };
    const normalized = normalizeGlobalIndexRecord(raw);
    assert.equal(normalized.indexId, 'idx-123');
    assert.equal(normalized.tableName, 'orders');
    assert.equal(normalized.indexName, 'idx_orders_customer');
    assert.deepEqual(normalized.columnNames, ['customer_id']);
    assert.equal(normalized.isGlobal, true);
    assert.equal(normalized.isUnique, false);
    assert.equal(normalized.state, GLOBAL_INDEX_STATE.READ_WRITE);
  });
});
