import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';

import {
  SYSTEM_TABLE_NAME,
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  WASM_OPERATIONS_SCHEMA,
} from '../../src/bootstrap/system-table-runtime-schema-definitions.js';
import {
  RUNTIME_KIND,
  UNIFIED_SERVICE_TYPE,
  WASM_OPERATION_STATE,
} from '../../src/constants/index.js';
import {
  bindDeploymentArtifact,
  buildBindingRow,
  canonicalJson,
  normalizeDeploymentBinding,
  projectBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  buildActivatedRequestBindingServiceDefinition,
  buildLegacyActivatedRequestBindingServiceDefinition,
  buildRequestBindingServiceDefinition,
} from
  '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {WasmComponentDriver} from
  '../../src/runtime/wasm-component-driver.js';

const COMPONENT_BYTES = Buffer.from(
  'AGFzbQ0AAQABwQEAYXNtAQAAAAEPAmAEf39/fwF/YAJ/fwF/AwMCAAEFAwEAAQcaAw' +
  'ZtZW1vcnkCAAdyZWFsbG9jAAADcnVuAAEKDAIFAEGACAsEAEEACwtnAQBBAAthCAAA' +
  'AFkAAAB7InN0YXR1cyI6MjAxLCJoZWFkZXJzIjpbWyJ4LWNlbGwtc291cmNlIiwiY2' +
  '9tcG9uZW50Il1dLCJib2R5IjoiaGVsbG8gZnJvbSBnZW51aW5lIGNlbGwifQAJBG5h' +
  'bWUAAgFtAgQBAAAABiADAAIBAAZtZW1vcnkAAAEAB3JlYWxsb2MAAAEAA3J1bgcOAU' +
  'ABB3JlcXVlc3RzAHMICwEAAAEDAwAEAAAACwkBAANydW4BAAAAWA5jb21wb25lbnQt' +
  'bmFtZQEWAAACAAdyZWFsbG9jAQhydW4tY29yZQEIAAIBAANtZW0BBgARAQABbQEGAB' +
  'IBAAFpAQcBAQADcnVuAQwDAQAIcnVuLXR5cGU=',
  'base64',
);
const ARTIFACT_DIGEST = `sha256:${'a'.repeat(64)}`;
const PACKAGE_ID = `service-package-${'b'.repeat(64)}`;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const ARTIFACT_MEDIA_TYPE = 'application/wasm';
const ARTIFACT_REF = 'registry.example.test/acme/routing-cell:1.0.0';
const ARTIFACT_TYPE = 'oci';
const REQUEST_INTERFACE = 'request_v1';
const REQUEST_EXPORT = 'run';
const ROUTING_CELL_NAME = 'routing-cell';
const ROUTING_CELL_VERSION = '1.0.0';
const LEGACY_BINDING_CELL_SHAPE = Object.freeze({
  max_learners: 4,
  min_learners: 1,
  voters: 5,
});
const JOURNAL_SQL_PREFIX = Object.freeze({
  INSERT: 'INSERT',
  SELECT: 'SELECT',
  UPDATE: 'UPDATE',
});
const JOURNAL_PARAM_INDEX = Object.freeze({
  COMMAND: 2,
  CREATED_AT: 7,
  ERROR: 6,
  IDEMPOTENCY_KEY: 3,
  OPERATION_ID: 0,
  RESULT: 5,
  STATE: 4,
  TENANT_ID: 1,
  UPDATED_AT: 8,
});
const UNIQUE_IDEMPOTENCY_CONFLICT = 'unique idempotency conflict';
const COMPLETION_JOURNAL_FAILURE =
  'injected completion journal failure';
const UNSUPPORTED_JOURNAL_SQL = 'unsupported journal SQL';
const SQLITE_MEMORY_DATABASE = ':memory:';
const SQLITE_INDEX_KIND = 'index';
const WASM_OPERATIONS_PROOF_PARTITION =
  'wasm-operations-routing-proof-p1';
const WASM_OPERATIONS_PROOF_REPLICA =
  'wasm-operations-routing-proof-p1-r1';
const WASM_OPERATIONS_IDENTITY_INDEX =
  'uidx_wasm_ops_tenant_idempotency';
const LEGACY_WASM_OPERATIONS_IDENTITY_INDEX =
  'idx_wasm_ops_idempotency';
const SQLITE_INDEX_SQL =
  'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?';
const LEGACY_WASM_OPERATIONS_SCHEMA = Object.freeze({
  ...WASM_OPERATIONS_SCHEMA,
  indices: Object.freeze([
    ...WASM_OPERATIONS_SCHEMA.indices.filter(
      (index) => index.name !== WASM_OPERATIONS_IDENTITY_INDEX,
    ),
    Object.freeze({
      columns: Object.freeze(['tenant_id', 'idempotency_key']),
      name: LEGACY_WASM_OPERATIONS_IDENTITY_INDEX,
    }),
  ]),
});
const COMPONENT_RESPONSE = Object.freeze({
  body: 'hello from genuine cell',
  headers: Object.freeze([
    Object.freeze(['x-cell-source', 'component']),
  ]),
  status: 201,
});

function sha256(value) {
  return `sha256:${createHash(HASH_ALGORITHM)
    .update(value)
    .digest(HASH_ENCODING)}`;
}

function createManifest() {
  return {
    artifact: {
      digest: ARTIFACT_DIGEST,
      media_type: ARTIFACT_MEDIA_TYPE,
      ref: ARTIFACT_REF,
      type: ARTIFACT_TYPE,
    },
    capabilities: [],
    exports: [{
      interface: REQUEST_INTERFACE,
      name: REQUEST_EXPORT,
    }],
    name: ROUTING_CELL_NAME,
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
    schema_version: 3,
    version: ROUTING_CELL_VERSION,
  };
}

function manifestDigest(manifest) {
  return sha256(canonicalJson(manifest));
}

function createArtifact() {
  const manifest = createManifest();
  return {
    artifactDigest: ARTIFACT_DIGEST,
    bytes: COMPONENT_BYTES,
    manifest,
    manifestDigest: manifestDigest(manifest),
    packageId: PACKAGE_ID,
    payloadDigest: sha256(COMPONENT_BYTES),
  };
}

function createBindingDeclaration(
  artifact,
  overrides = {},
) {
  const input = {
    budgets: {
      context_bytes: 4_096,
      cpu_time_ms: 100,
      input_bytes: 16_384,
      memory_bytes: 64 * 1024 * 1024,
      output_bytes: 4_096,
      wall_time_ms: 1_000,
    },
    name: overrides.name || 'routing-cell',
    schema_version: 2,
    source: {
      kind: 'request',
      method: overrides.method || 'POST',
      path: overrides.path || '/cell',
    },
    target: {
      export_name: 'run',
      manifest_digest: artifact.manifestDigest,
      package_id: artifact.packageId,
    },
  };
  const declaration = bindDeploymentArtifact(
    normalizeDeploymentBinding(input),
    artifact,
  );
  if (!overrides.legacy) return declaration;
  return Object.freeze({
    ...declaration,
    contexts: [],
    elasticity: LEGACY_BINDING_CELL_SHAPE,
    schema_version: 0,
  });
}

function createDeploymentRows(overrides = {}) {
  const artifact = createArtifact();
  const declaration = createBindingDeclaration(artifact, overrides);
  const bindingRow = buildBindingRow(
    declaration,
    {
      principal: 'app-user',
      roles: ['application'],
      tenantId: 'tenant-a',
    },
    overrides.createdAt || 1,
  );
  const binding = projectBinding(bindingRow);
  const compiled = buildRequestBindingServiceDefinition(bindingRow, artifact);
  const definition = overrides.legacy ?
    buildLegacyActivatedRequestBindingServiceDefinition(compiled, binding) :
    buildActivatedRequestBindingServiceDefinition(compiled, binding);
  return {artifact, binding, bindingRow, declaration, definition};
}

class MutableSystemTableCache {
  constructor(rows) {
    this.tables = new Map([
      [
        SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
        new Map([[rows.bindingRow.binding_version_id, rows.bindingRow]]),
      ],
      [
        SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
        new Map([[rows.definition.service_id, rows.definition]]),
      ],
      [SYSTEM_TABLE_NAME.SERVICES, new Map()],
    ]);
  }

  get(tableName, key) {
    return this.tables.get(tableName)?.get(key) || null;
  }

  getAll(tableName) {
    return [...(this.tables.get(tableName)?.values() || [])];
  }

  set(tableName, key, row) {
    this.tables.get(tableName).set(key, row);
  }

  delete(tableName, key) {
    this.tables.get(tableName).delete(key);
  }
}

function journalRowFromParams(params) {
  return {
    command: params[JOURNAL_PARAM_INDEX.COMMAND],
    created_at: params[JOURNAL_PARAM_INDEX.CREATED_AT],
    error: params[JOURNAL_PARAM_INDEX.ERROR],
    idempotency_key: params[JOURNAL_PARAM_INDEX.IDEMPOTENCY_KEY],
    operation_id: params[JOURNAL_PARAM_INDEX.OPERATION_ID],
    result: params[JOURNAL_PARAM_INDEX.RESULT],
    state: params[JOURNAL_PARAM_INDEX.STATE],
    tenant_id: params[JOURNAL_PARAM_INDEX.TENANT_ID],
    updated_at: params[JOURNAL_PARAM_INDEX.UPDATED_AT],
  };
}

class MemoryInvocationJournal {
  constructor() {
    this.completionFailuresRemaining = 0;
    this.rows = new Map();
  }

  failNextCompletion() {
    this.completionFailuresRemaining += 1;
  }

  executeSelect(params) {
    const row = [...this.rows.values()].find(
      (candidate) =>
        candidate.tenant_id === params[0] &&
        candidate.idempotency_key === params[1],
    );
    return {rows: row ? [{...row}] : [], success: true};
  }

  executeInsert(params) {
    const row = journalRowFromParams(params);
    const conflict = [...this.rows.values()].some(
      (candidate) =>
        candidate.tenant_id === row.tenant_id &&
        candidate.idempotency_key === row.idempotency_key,
    );
    if (conflict) {
      return {error: UNIQUE_IDEMPOTENCY_CONFLICT, success: false};
    }
    this.rows.set(row.operation_id, row);
    return {changes: 1, success: true};
  }

  executeUpdate(params) {
    if (
      params[0] === WASM_OPERATION_STATE.COMPLETED &&
      this.completionFailuresRemaining > 0
    ) {
      this.completionFailuresRemaining -= 1;
      return {error: COMPLETION_JOURNAL_FAILURE, success: false};
    }
    const operationId = params.at(-2);
    const fromState = params.at(-1);
    const row = this.rows.get(operationId);
    if (!row || row.state !== fromState) {
      return {changes: 0, success: true};
    }
    row.state = params[0];
    row.updated_at = params[1];
    if (row.state === WASM_OPERATION_STATE.COMPLETED) {
      row.result = params[2];
    } else if (
      row.state === WASM_OPERATION_STATE.FAILED ||
      row.state === WASM_OPERATION_STATE.CANCELLED
    ) {
      row.error = params[2];
    }
    return {changes: 1, success: true};
  }

  async execute(sql, params) {
    if (sql.startsWith(JOURNAL_SQL_PREFIX.SELECT)) {
      return this.executeSelect(params);
    }
    if (sql.startsWith(JOURNAL_SQL_PREFIX.INSERT)) {
      return this.executeInsert(params);
    }
    if (sql.startsWith(JOURNAL_SQL_PREFIX.UPDATE)) {
      return this.executeUpdate(params);
    }
    return {error: UNSUPPORTED_JOURNAL_SQL, success: false};
  }

  createExecutor() {
    const execute = (sql, params) => this.execute(sql, params);
    execute.executeInternal = execute;
    execute.executeRequest = async () => ({rows: [], success: true});
    execute.getRuntimeAccessPolicy = async () => ({
      policy: {tables: []},
      status: 'resolved',
    });
    return execute;
  }
}

class SqliteInvocationJournal {
  constructor() {
    this.insertOperationIds = [];
    this.partition = new PartitionService({
      dbPath: SQLITE_MEMORY_DATABASE,
      partitionId: WASM_OPERATIONS_PROOF_PARTITION,
      replicaId: WASM_OPERATIONS_PROOF_REPLICA,
      replicaIds: [WASM_OPERATIONS_PROOF_REPLICA],
      schema: LEGACY_WASM_OPERATIONS_SCHEMA,
      tableId: WASM_OPERATIONS_SCHEMA.tableName,
      tableName: WASM_OPERATIONS_SCHEMA.tableName,
    });
    this.partition.db = new Database(SQLITE_MEMORY_DATABASE);
    this.partition.db.exec(
      generateCreateTableSQL(LEGACY_WASM_OPERATIONS_SCHEMA),
    );
    const legacyIndexStatements =
      generateCreateIndexSQL(LEGACY_WASM_OPERATIONS_SCHEMA);
    for (const indexSql of legacyIndexStatements) {
      this.partition.db.exec(indexSql);
    }
    this.partition.createTable();
  }

  async execute(sql, params) {
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    try {
      const statement = this.partition.db.prepare(sqliteSql);
      if (sql.startsWith(JOURNAL_SQL_PREFIX.SELECT)) {
        return {rows: statement.all(...params), success: true};
      }
      if (sql.startsWith(JOURNAL_SQL_PREFIX.INSERT)) {
        this.insertOperationIds.push(
          params[JOURNAL_PARAM_INDEX.OPERATION_ID],
        );
      }
      const result = statement.run(...params);
      return {affectedRows: result.changes, success: true};
    } catch (error) {
      return {affectedRows: 0, error: error.message, success: false};
    }
  }

  createExecutor() {
    const execute = (sql, params) => this.execute(sql, params);
    execute.executeInternal = execute;
    execute.executeRequest = async () => ({rows: [], success: true});
    execute.getRuntimeAccessPolicy = async () => ({
      policy: {tables: []},
      status: 'resolved',
    });
    return execute;
  }

  getIdentityIndexSql() {
    return this.partition.db.prepare(
      SQLITE_INDEX_SQL,
    ).get(
      SQLITE_INDEX_KIND,
      WASM_OPERATIONS_IDENTITY_INDEX,
    )?.sql || null;
  }

  getInsertOperationIds() {
    return [...this.insertOperationIds];
  }

  getLegacyIdentityIndexSql() {
    return this.partition.db.prepare(
      SQLITE_INDEX_SQL,
    ).get(
      SQLITE_INDEX_KIND,
      LEGACY_WASM_OPERATIONS_IDENTITY_INDEX,
    )?.sql || null;
  }

  close() {
    this.partition.db.close();
  }
}

function createReplicaHandle(definition, replicaId, nodeId) {
  return {
    ...definition,
    entityId: definition.service_id,
    nodeId,
    replicaId,
    serviceId: replicaId,
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
  };
}

function createActualRow(definition, replicaId, nodeId) {
  return {
    created_at: Date.now(),
    node_id: nodeId,
    service_id: replicaId,
    service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    status: ReplicaStatus.ACTIVE,
    updated_at: Date.now(),
    definition_id: definition.service_id,
  };
}

function createRuntime(rows, journal, replicaId, nodeId) {
  const cellRuntime = new WasiComponentCellRuntime();
  const driver = new WasmComponentDriver({
    artifactLoader: async () => rows.artifact,
    componentRuntime: cellRuntime,
  });
  let componentInvocationCount = 0;
  const driverInvoke = driver.invoke.bind(driver);
  driver.invoke = async (...args) => {
    componentInvocationCount += 1;
    return driverInvoke(...args);
  };
  const registry = new RuntimeDriverRegistry();
  registry.register(driver);
  registry.freeze();
  const lifecycle = new ServiceRuntimeLifecycle(registry);
  lifecycle.setQueryExecutorFactory(
    () => journal.createExecutor(),
  );
  lifecycle.setStateProjectionWriter(async () => {});
  const replicaHandle = createReplicaHandle(
    rows.definition,
    replicaId,
    nodeId,
  );
  return {
    cellRuntime,
    driver,
    get componentInvocationCount() {
      return componentInvocationCount;
    },
    lifecycle,
    replicaHandle,
  };
}

export {
  COMPONENT_RESPONSE,
  MemoryInvocationJournal,
  MutableSystemTableCache,
  SqliteInvocationJournal,
  createActualRow,
  createDeploymentRows,
  createRuntime,
};
