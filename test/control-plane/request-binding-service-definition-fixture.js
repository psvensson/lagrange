// Shared controlled durable gateway and actual catalog/Binding/definition producer.
// Persistence is an in-memory boundary; semantic decisions use production owners.
import {SYSTEM_TABLE_SCHEMAS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {createSystemMetadataOwners} from '../../src/control-plane/owners/index.js';
import {deriveTenantPackageId} from
  '../../src/control-plane/owners/service-install-catalog-contract.js';

const TENANT_ID = 'tenant-a';
const ARTIFACT_DIGEST = `sha256:${'a'.repeat(64)}`;
const SECURITY_CONTEXT = Object.freeze({
  tenantId: TENANT_ID,
  principal: 'alice',
  roles: Object.freeze(['deployer']),
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class DurableGateway {
  constructor() {
    this.storage = new Map(SYSTEM_TABLE_SCHEMAS.map(
      (schema) => [schema.tableName, new Map()],
    ));
    this.writes = [];
    this.lostInsertResponses = new Set();
    this.lostUpdateResponses = new Set();
  }

  schema(tableName) {
    return SYSTEM_TABLE_SCHEMAS.find(
      (schema) => schema.tableName === tableName,
    );
  }

  primaryKey(tableName) {
    const schema = this.schema(tableName);
    return schema.primaryKey?.[0] ||
      schema.columns.find((column) => column.primaryKey)?.name;
  }

  rows(tableName) {
    return this.storage.get(tableName);
  }

  async readAuthoritativeRows(tableName, sql, params) {
    const rows = [...this.rows(tableName).values()];
    const field = / WHERE ([a-z_]+) = \?$/u.exec(sql)?.[1];
    const selected = field ?
      rows.filter((row) => row[field] === params[0]) : rows;
    return {success: true, rows: clone(selected)};
  }

  async insertSystemTableRow(tableName, row) {
    const table = this.rows(tableName);
    const key = row[this.primaryKey(tableName)];
    if (table.has(key)) return {success: false, error: 'duplicate key'};
    table.set(key, clone(row));
    this.writes.push({operation: 'insert', tableName, row: clone(row)});
    if (this.lostInsertResponses.delete(tableName)) {
      throw new Error('insert response lost after durable apply');
    }
    return {success: true, affectedRows: 1};
  }

  async upsertSystemTableRow(tableName, row) {
    this.rows(tableName).set(
      row[this.primaryKey(tableName)], clone(row),
    );
    this.writes.push({operation: 'upsert', tableName, row: clone(row)});
    return {success: true, affectedRows: 1};
  }

  async updateSystemTableRow(tableName, whereClause, data) {
    const table = this.rows(tableName);
    const key = whereClause[this.primaryKey(tableName)];
    const existing = table.get(key);
    if (!existing) return {success: true, affectedRows: 0};
    const row = {...existing, ...clone(data)};
    table.set(key, row);
    this.writes.push({
      operation: 'update',
      tableName,
      row: clone(row),
    });
    if (this.lostUpdateResponses.delete(tableName)) {
      throw new Error('update response lost after durable apply');
    }
    return {success: true, affectedRows: 1};
  }

  loseNextInsertResponse(tableName) {
    this.lostInsertResponses.add(tableName);
  }

  loseNextUpdateResponse(tableName) {
    this.lostUpdateResponses.add(tableName);
  }
}

function manifest() {
  return {
    schema_version: 3,
    name: 'orders-service',
    version: '1.0.0',
    capabilities: ['network.client', 'clock.read'],
    exports: [{
      name: 'request-handler',
      interface: 'request_v1',
    }],
    artifact: {
      type: 'oci',
      ref: 'registry.example.test/acme/orders:1.0.0',
      digest: ARTIFACT_DIGEST,
      media_type: 'application/vnd.oci.image.manifest.v1+json',
    },
    runtime: {
      kind: 'oci_container',
      entrypoint: 'server',
      runtime_options: {memoryLimitMb: 128, networkPolicy: 'isolated'},
    },
  };
}

function resolvedArtifact() {
  return {
    status: 'resolved',
    artifact: {
      digest: ARTIFACT_DIGEST,
      payloadMediaType: 'application/vnd.oci.image.manifest.v1+json',
      signature: {status: 'verified', keyId: 'publisher-main'},
    },
  };
}

function bindingInput(package_, overrides = {}) {
  return {
    schema_version: 2,
    name: 'orders-api',
    target: {
      package_id: package_.packageId,
      manifest_digest: package_.manifestDigest,
      export_name: 'request-handler',
    },
    source: {kind: 'request', method: 'POST', path: '/orders'},
    budgets: {
      cpu_time_ms: 100,
      wall_time_ms: 1000,
      memory_bytes: 1048576,
      input_bytes: 4096,
      output_bytes: 8192,
      context_bytes: 16384,
    },
    ...overrides,
  };
}

async function createRequestBindingFixture(options = {}) {
  const gateway = new DurableGateway();
  const owners = createSystemMetadataOwners({
    controlPlaneSystemTableGateway: gateway,
    now: () => 1000,
  });
  const value = manifest();
  const packageId = deriveTenantPackageId(value, TENANT_ID);
  const package_ = await owners.serviceInstallCatalogOwner.recordPackage({
    packageId,
    manifest: value,
    resolvedArtifact: resolvedArtifact(),
  });
  const binding = await owners.deploymentBindingOwner.createBinding(
    bindingInput(package_), SECURITY_CONTEXT,
  );
  const bindingRow = gateway.rows(TABLES.SERVICE_BINDINGS)
    .get(binding.bindingVersionId);
  if (options.loseDesiredInsertResponse) {
    gateway.loseNextInsertResponse(TABLES.SERVICE_DEFINITIONS);
  }
  if (options.loseActivationUpdateResponse) {
    gateway.loseNextUpdateResponse(TABLES.SERVICE_DEFINITIONS);
  }
  return {binding, bindingRow, gateway, owners, package_};
}

export {createRequestBindingFixture, bindingInput, clone,
  TENANT_ID, ARTIFACT_DIGEST, SECURITY_CONTEXT};
