import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  registerBuiltInMetaServiceDefinitions,
  META_SERVICE_DEFINITION_REGISTRATION_ERROR,
} from '../../../src/bootstrap/shared/meta-service-definition-registration.js';
import {META_SERVICE_ID} from '../../../src/constants/index.js';
import {RUNTIME_KIND} from '../../../src/constants/runtime.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../../src/bootstrap/system-table-schemas-constants.js';
import {
  WASM_SERVICE_PROTOCOL,
} from '../../../src/wasm-service/wasm-service-constants.js';

describe('registerBuiltInMetaServiceDefinitions', () => {
  it('should throw when upsertRow is not a function', async () => {
    await assert.rejects(
      () => registerBuiltInMetaServiceDefinitions({}),
      {message: META_SERVICE_DEFINITION_REGISTRATION_ERROR.UPSERT_REQUIRED},
    );
  });

  it('should register all three built-in service definitions', async () => {
    const rows = [];
    const ids = await registerBuiltInMetaServiceDefinitions({
      upsertRow: async (tableName, row) => {
        rows.push({tableName, row});
      },
    });

    assert.equal(ids.length, 3);
    assert.ok(ids.includes(META_SERVICE_ID.WASM_META));
    assert.ok(ids.includes(META_SERVICE_ID.ADMIN_META));
    assert.ok(ids.includes(META_SERVICE_ID.POSTGRES_WIRE));
  });

  it('should upsert all rows to service_definitions table', async () => {
    const rows = [];
    await registerBuiltInMetaServiceDefinitions({
      upsertRow: async (tableName, row) => {
        rows.push({tableName, row});
      },
    });

    assert.equal(rows.length, 3);
    for (const {tableName} of rows) {
      assert.equal(tableName, SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS);
    }
  });

  it('should include sys-postgres-wire with correct fields', async () => {
    const rows = [];
    await registerBuiltInMetaServiceDefinitions({
      upsertRow: async (_tableName, row) => {
        rows.push(row);
      },
    });

    const pgRow = rows.find(
      (r) => r.service_id === META_SERVICE_ID.POSTGRES_WIRE
    );
    assert.ok(pgRow, 'sys-postgres-wire row must be present');
    assert.equal(pgRow.runtime_kind, RUNTIME_KIND.NATIVE_JS);
    assert.equal(pgRow.runtime_ref, 'postgres-wire-runtime');
    assert.equal(pgRow.protocol, WASM_SERVICE_PROTOCOL.POSTGRESQL);
  });

  it('should write through SQL/CDC upsertRow callback only', async () => {
    let callCount = 0;
    await registerBuiltInMetaServiceDefinitions({
      upsertRow: async () => {
        callCount++;
      },
    });

    assert.equal(callCount, 3);
  });
});
