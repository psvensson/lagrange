import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  SD_COL,
  SERVICE_DEFINITION_COLUMN_LIST,
  serializeServiceDefinition,
  deserializeServiceDefinition,
} from '../../src/wasm-service/wasm-service-models.js';
import {
  RUNTIME_KIND,
  RUNTIME_FIELD,
} from '../../src/constants/runtime.js';
import {SERVICE_PROFILE} from '../../src/constants/service.js';
import {
  SERVICE_DEFINITIONS_SCHEMA,
  COLUMN_TYPE,
} from '../../src/bootstrap/system-table-schemas-constants.js';


const NUM_RUNS = 10;

/**
 * Backward-compatible serialization tests for service definitions
 * with unified runtime fields.
 *
 * Validates: Requirements 5.3, 5.5, 14.1
 */

// --- Arbitraries ---

const runtimeKindArb = fc.constantFrom(
  RUNTIME_KIND.NATIVE_JS,
  RUNTIME_KIND.WASM_COMPONENT,
  RUNTIME_KIND.OCI_CONTAINER,
);

const serviceProfileArb = fc.constantFrom(
  SERVICE_PROFILE.DEFAULT,
  SERVICE_PROFILE.SQL_ENGINE,
);

const runtimeRefArb = fc.oneof(
  fc.constant(null),
  fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/),
);

const runtimeConfigArb = fc.oneof(
  fc.constant(null),
  fc.dictionary(
    fc.stringMatching(/^[a-z]{1,8}$/),
    fc.oneof(fc.integer(), fc.boolean(), fc.string()),
    {minKeys: 0, maxKeys: 3},
  ).map((obj) => JSON.stringify(obj)),
);

const handlerFunctionIdArb = fc.oneof(
  fc.constant(null),
  fc.stringMatching(/^func-[a-z0-9]{1,12}$/),
);

const timestampArb = fc.integer({min: 1700000000000, max: 1800000000000});

/**
 * Arbitrary for a full service definition with runtime fields.
 */
const fullDefinitionArb = fc.record({
  serviceId: fc.stringMatching(/^svc-[a-z0-9]{1,8}$/),
  serviceName: fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
  handlerFunctionId: handlerFunctionIdArb,
  serviceProfile: serviceProfileArb,
  readConsistency: fc.constantFrom('strong', 'leader_only', 'eventual'),
  writeConsistency: fc.constantFrom('strong', 'async'),
  replicaCount: fc.constantFrom(3, 5, 7),
  protocol: fc.constant('websocket'),
  resourceBudget: fc.record({
    cpuTimeLimitMs: fc.integer({min: 100, max: 30000}),
    memoryLimitBytes: fc.integer({min: 1024, max: 268435456}),
    sessionSizeLimitBytes: fc.integer({min: 1024, max: 10485760}),
    serviceSizeLimitBytes: fc.integer({min: 1024, max: 524288000}),
  }),
  safetyIntervalMs: fc.integer({min: 100, max: 5000}),
  runtimeKind: runtimeKindArb,
  runtimeRef: runtimeRefArb,
  runtimeConfig: runtimeConfigArb,
  status: fc.constantFrom('active', 'inactive'),
  createdAt: timestampArb,
  updatedAt: timestampArb,
});

// --- Schema verification tests ---

describe('service_definitions schema runtime columns', () => {
  /**
   * Validates: Requirements 5.5
   */
  const cols = SERVICE_DEFINITIONS_SCHEMA.columns;
  const colByName = (name) => cols.find((c) => c.name === name);

  it('should include runtime_kind column as TEXT', () => {
    const col = colByName(RUNTIME_FIELD.RUNTIME_KIND);
    assert.ok(col, 'runtime_kind column must exist');
    assert.equal(col.type, COLUMN_TYPE.TEXT);
  });

  it('should include runtime_ref column as TEXT', () => {
    const col = colByName(RUNTIME_FIELD.RUNTIME_REF);
    assert.ok(col, 'runtime_ref column must exist');
    assert.equal(col.type, COLUMN_TYPE.TEXT);
  });

  it('should include runtime_config column as TEXT', () => {
    const col = colByName(RUNTIME_FIELD.RUNTIME_CONFIG);
    assert.ok(col, 'runtime_config column must exist');
    assert.equal(col.type, COLUMN_TYPE.TEXT);
  });

  it('should allow null for runtime_kind (backward compat)', () => {
    const col = colByName(RUNTIME_FIELD.RUNTIME_KIND);
    assert.ok(!col.notNull, 'runtime_kind must be nullable');
  });

  it('should allow null for runtime_ref (backward compat)', () => {
    const col = colByName(RUNTIME_FIELD.RUNTIME_REF);
    assert.ok(!col.notNull, 'runtime_ref must be nullable');
  });

  it('should allow null for runtime_config (backward compat)', () => {
    const col = colByName(RUNTIME_FIELD.RUNTIME_CONFIG);
    assert.ok(!col.notNull, 'runtime_config must be nullable');
  });

  it('should have runtime_kind index', () => {
    const idx = SERVICE_DEFINITIONS_SCHEMA.indices.find(
      (i) => i.columns.includes(RUNTIME_FIELD.RUNTIME_KIND),
    );
    assert.ok(idx, 'runtime_kind index must exist');
  });

  it('should have SD_COL entries matching schema column names', () => {
    assert.equal(SD_COL.RUNTIME_KIND, RUNTIME_FIELD.RUNTIME_KIND);
    assert.equal(SD_COL.RUNTIME_REF, RUNTIME_FIELD.RUNTIME_REF);
    assert.equal(SD_COL.RUNTIME_CONFIG, RUNTIME_FIELD.RUNTIME_CONFIG);
  });

  it('should include non-null service_profile with default', () => {
    const col = colByName(SD_COL.SERVICE_PROFILE);
    assert.ok(col, 'service_profile column must exist');
    assert.equal(col.notNull, true);
    assert.equal(col.defaultValue, '\'default\'');
  });

  it('should allow null handler_function_id', () => {
    const col = colByName(SD_COL.HANDLER_FUNCTION_ID);
    assert.ok(col, 'handler_function_id column must exist');
    assert.ok(!col.notNull, 'handler_function_id must be nullable');
  });

  it('should keep schema columns in canonical model order', () => {
    const schemaOrder = cols.map((col) => col.name);
    assert.deepEqual(
      schemaOrder,
      SERVICE_DEFINITION_COLUMN_LIST,
    );
  });
});


// --- Explicit runtime serialization tests ---

describe('explicit runtime serialization', () => {
  it('should preserve wasm handler through full serialize cycle', () => {
    const def = {
      serviceId: 'svc-wasm',
      serviceName: 'wasm-svc',
      handlerFunctionId: 'func-handler',
      runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      runtimeRef: 'func-handler',
      runtimeConfig: null,
    };
    const row = serializeServiceDefinition(def);
    const restored = deserializeServiceDefinition(row);
    assert.equal(restored.runtimeKind, RUNTIME_KIND.WASM_COMPONENT);
    assert.equal(restored.runtimeRef, 'func-handler');
    assert.equal(restored.handlerFunctionId, 'func-handler');
  });

  it('should reject rows missing explicit runtime_kind', () => {
    const row = {
      [SD_COL.SERVICE_ID]: 'svc-sql',
      [SD_COL.SERVICE_NAME]: 'sql-engine-svc',
      [SD_COL.SERVICE_PROFILE]: SERVICE_PROFILE.SQL_ENGINE,
      [SD_COL.HANDLER_FUNCTION_ID]: 'func-sql',
      [SD_COL.READ_CONSISTENCY]: 'leader_only',
      [SD_COL.WRITE_CONSISTENCY]: 'strong',
      [SD_COL.REPLICA_COUNT]: 3,
      [SD_COL.PROTOCOL]: 'websocket',
      [SD_COL.RESOURCE_BUDGET]: '{}',
      [SD_COL.SAFETY_INTERVAL_MS]: 500,
      [SD_COL.STATUS]: 'active',
      [SD_COL.CREATED_AT]: 1000,
      [SD_COL.UPDATED_AT]: 1000,
    };
    assert.throws(
      () => deserializeServiceDefinition(row),
      /runtime_kind/u,
    );
  });

  it('should preserve explicit runtime fields on deserialization', () => {
    const row = {
      [SD_COL.SERVICE_ID]: 'svc-explicit',
      [SD_COL.SERVICE_NAME]: 'explicit-rt',
      [SD_COL.SERVICE_PROFILE]: SERVICE_PROFILE.DEFAULT,
      [SD_COL.HANDLER_FUNCTION_ID]: 'func-old',
      [SD_COL.READ_CONSISTENCY]: 'strong',
      [SD_COL.WRITE_CONSISTENCY]: 'strong',
      [SD_COL.REPLICA_COUNT]: 3,
      [SD_COL.PROTOCOL]: 'websocket',
      [SD_COL.RESOURCE_BUDGET]: '{}',
      [SD_COL.SAFETY_INTERVAL_MS]: 500,
      [SD_COL.RUNTIME_KIND]: RUNTIME_KIND.OCI_CONTAINER,
      [SD_COL.RUNTIME_REF]: 'reg.io/img@sha256:abc123',
      [SD_COL.RUNTIME_CONFIG]: '{"cpu":2}',
      [SD_COL.STATUS]: 'active',
      [SD_COL.CREATED_AT]: 1000,
      [SD_COL.UPDATED_AT]: 1000,
    };
    const def = deserializeServiceDefinition(row);
    assert.equal(def.runtimeKind, RUNTIME_KIND.OCI_CONTAINER);
    assert.equal(def.runtimeRef, 'reg.io/img@sha256:abc123');
    assert.equal(def.runtimeConfig, '{"cpu":2}');
  });
});


// --- Property-based tests ---

describe('property: round-trip serialization', () => {
  /**
   * Validates: Requirements 5.3, 5.5, 14.1
   *
   * For any valid service definition with explicit runtime fields,
   * serialize -> deserialize must preserve all fields.
   */
  it('should preserve all fields through serialize/deserialize',
    () => {
      fc.assert(
        fc.property(fullDefinitionArb, (def) => {
          const row = serializeServiceDefinition(def);
          const restored = deserializeServiceDefinition(row);
          assert.equal(restored.serviceId, def.serviceId);
          assert.equal(restored.serviceName, def.serviceName);
          assert.equal(restored.readConsistency, def.readConsistency);
          assert.equal(
            restored.writeConsistency, def.writeConsistency,
          );
          assert.equal(restored.replicaCount, def.replicaCount);
          assert.equal(restored.protocol, def.protocol);
          assert.deepStrictEqual(
            restored.resourceBudget, def.resourceBudget,
          );
          assert.equal(
            restored.safetyIntervalMs, def.safetyIntervalMs,
          );
          assert.equal(restored.status, def.status);
          assert.equal(restored.createdAt, def.createdAt);
          assert.equal(restored.updatedAt, def.updatedAt);
          assert.equal(restored.runtimeKind, def.runtimeKind);
          assert.equal(restored.runtimeRef, def.runtimeRef);
          assert.equal(restored.runtimeConfig, def.runtimeConfig);
          assert.equal(restored.handlerFunctionId, def.handlerFunctionId);
        }),
        {numRuns: NUM_RUNS},
      );
    });

  it('should produce snake_case row keys for all runtime fields',
    () => {
      fc.assert(
        fc.property(fullDefinitionArb, (def) => {
          const row = serializeServiceDefinition(def);
          assert.ok(
            RUNTIME_FIELD.RUNTIME_KIND in row,
            'row must have runtime_kind key',
          );
          assert.ok(
            RUNTIME_FIELD.RUNTIME_REF in row,
            'row must have runtime_ref key',
          );
          assert.ok(
            RUNTIME_FIELD.RUNTIME_CONFIG in row,
            'row must have runtime_config key',
          );
        }),
        {numRuns: NUM_RUNS},
      );
    });
});
