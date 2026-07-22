import {TABLES} from '../../constants/index.js';
import {
  readAuthoritativeControlPlaneRows,
} from '../control-plane-system-table-gateway.js';
import {
  FAILURE_FIELDS,
  FAILURE_IDENTITY_FIELDS,
  INSTALLATION_FIELDS,
  INSTALLATION_INTENT_FIELDS,
  PACKAGE_FIELDS,
  PACKAGE_IDENTITY_FIELDS,
  REVISION_FIELDS,
  REVISION_IDENTITY_FIELDS,
  ROLLOUT_FIELDS,
  ROLLOUT_TRANSITIONS,
  SERVICE_INSTALL_CATALOG_ERROR_CODE,
  SERVICE_INSTALL_CATALOG_MESSAGE,
  SERVICE_INSTALL_CATALOG_OWNER_NAME,
  SERVICE_INSTALL_CATALOG_PATH,
  SERVICE_INSTALL_DESIRED_STATE,
  SERVICE_INSTALL_FAILURE_CODE,
  SERVICE_INSTALL_FAILURE_PHASE,
  SERVICE_INSTALL_ROLLOUT_STATE,
  ServiceInstallCatalogError,
  assertInstallationRecord,
  assertShape,
  buildPackageRow,
  canonicalJson,
  deepFreeze,
  fail,
  isPlainObject,
  projectFailure,
  projectInstallation,
  projectBindableArtifact,
  projectPackage,
  projectRevision,
  requireEnum,
  requireDigest,
  requireEligiblePackageIds,
  requireIdentifier,
  sameFields,
  sha256Json,
} from './service-install-catalog-contract.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const CATALOG_MUTATION_OPERATION_UPDATE = 'update';
const CATALOG_INSTALLATION_CAS_FIELDS = Object.freeze([
  'rollout_state',
  'updated_at',
]);
const CATALOG_PRIMARY_KEY_FIELD = Object.freeze({
  FAILURE: 'failure_id',
  INSTALLATION: 'installation_id',
  PACKAGE: 'package_id',
  REVISION: 'revision_id',
});
const CATALOG_RESOURCE_KIND = Object.freeze({
  FAILURE: 'failure',
  INSTALLATION: 'installation',
  OPERATION: 'operation',
  PACKAGE: 'package',
  REVISION: 'revision',
});

function catalogResourceKey(kind, id) {
  return `${kind}:${id}`;
}

function mutationAffectedRows(result) {
  const value = Number(
    result?.partitionResult?.affectedRows ?? result?.affectedRows,
  );
  return Number.isFinite(value) ? value : null;
}

class CatalogTableOwner extends SystemMetadataOwnerBase {
  constructor(options, tableName, ownerName) {
    super(options);
    this.tableName = tableName;
    this.ownerName = ownerName;
  }

  getTableName() {
    return this.tableName;
  }

  getOwnerName() {
    return this.ownerName;
  }

  async updateWhere(whereClause, data, options = {}) {
    return this.executeMutation(
      CATALOG_MUTATION_OPERATION_UPDATE,
      {primaryKeyValue: whereClause[this.getPrimaryKeyField()], data},
      options,
      (mutationOptions) => this.requireGateway().updateSystemTableRow(
        this.getTableName(),
        whereClause,
        data,
        mutationOptions,
      ),
    );
  }
}

class ServiceInstallCatalogOwner {
  constructor(options = {}) {
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.resourceSerialGates = new Map();
    this.packageRows = new CatalogTableOwner(
      options,
      TABLES.SERVICE_PACKAGES,
      SERVICE_INSTALL_CATALOG_OWNER_NAME.PACKAGES,
    );
    this.revisionRows = new CatalogTableOwner(
      options,
      TABLES.SERVICE_REVISIONS,
      SERVICE_INSTALL_CATALOG_OWNER_NAME.REVISIONS,
    );
    this.installationRows = new CatalogTableOwner(
      options,
      TABLES.SERVICE_INSTALLATIONS,
      SERVICE_INSTALL_CATALOG_OWNER_NAME.INSTALLATIONS,
    );
    this.failureRows = new CatalogTableOwner(
      options,
      TABLES.SERVICE_INSTALL_FAILURES,
      SERVICE_INSTALL_CATALOG_OWNER_NAME.FAILURES,
    );
  }

  getOwnerName() {
    return SERVICE_INSTALL_CATALOG_OWNER_NAME.CATALOG;
  }

  getGateway() {
    return this.packageRows.getGateway();
  }

  getSystemTableCache() {
    return this.packageRows.getSystemTableCache();
  }

  timestamp() {
    const value = this.now();
    if (!Number.isSafeInteger(value) || value < 0) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD,
        SERVICE_INSTALL_CATALOG_PATH.NOW,
        SERVICE_INSTALL_CATALOG_MESSAGE.CLOCK_INVALID);
    }
    return value;
  }

  nextTimestamp(row) {
    const timestamp = this.timestamp();
    const previous = row?.updated_at;
    if (!Number.isSafeInteger(previous) || previous < 0) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
        SERVICE_INSTALL_CATALOG_PATH.INSTALLATION,
        SERVICE_INSTALL_CATALOG_MESSAGE.INSTALLATION_STATE_CORRUPT);
    }
    const next = Math.max(timestamp, previous + 1);
    if (!Number.isSafeInteger(next)) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
        SERVICE_INSTALL_CATALOG_PATH.INSTALLATION,
        SERVICE_INSTALL_CATALOG_MESSAGE.INSTALLATION_STATE_CORRUPT);
    }
    return next;
  }

  async runSerialized(resourceKeys, operation) {
    const keys = [...new Set(resourceKeys)].sort();
    const predecessors = keys
      .map((key) => this.resourceSerialGates.get(key))
      .filter(Boolean);
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    for (const key of keys) this.resourceSerialGates.set(key, gate);
    await Promise.all(predecessors);
    try {
      return await operation();
    } finally {
      release();
      for (const key of keys) {
        if (this.resourceSerialGates.get(key) === gate) {
          this.resourceSerialGates.delete(key);
        }
      }
    }
  }

  async readRow(owner, primaryKey, primaryKeyField) {
    const row = await owner.readByPrimaryKey(primaryKey);
    if (row === null) return null;
    if (!isPlainObject(row) || row[primaryKeyField] !== primaryKey) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
        SERVICE_INSTALL_CATALOG_PATH.GATEWAY,
        SERVICE_INSTALL_CATALOG_MESSAGE.GATEWAY_READ_INVALID);
    }
    return row;
  }

  async readInstallationByOperationId(operationId) {
    const result = await readAuthoritativeControlPlaneRows(
      this.installationRows.requireGateway(),
      TABLES.SERVICE_INSTALLATIONS,
      'SELECT * FROM service_installations WHERE operation_id = ?',
      [operationId],
      {owner: this.getOwnerName()},
    );
    if (result?.success === false) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
        SERVICE_INSTALL_CATALOG_PATH.GATEWAY,
        SERVICE_INSTALL_CATALOG_MESSAGE.GATEWAY_OPERATION_LOOKUP_FAILED);
    }
    const rows = Array.isArray(result) ? result : result?.rows;
    if (!Array.isArray(rows) || rows.length > 1) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
        SERVICE_INSTALL_CATALOG_PATH.GATEWAY,
        SERVICE_INSTALL_CATALOG_MESSAGE.GATEWAY_OPERATION_LOOKUP_INVALID);
    }
    return rows[0] || null;
  }

  async getInstallationByOperationId(operationId) {
    const id = requireIdentifier(operationId, '/operationId');
    const row = await this.readInstallationByOperationId(id);
    if (row === null) return null;
    if (!isPlainObject(row) || row.operation_id !== id) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
        SERVICE_INSTALL_CATALOG_PATH.GATEWAY,
        SERVICE_INSTALL_CATALOG_MESSAGE.GATEWAY_OPERATION_LOOKUP_INVALID);
    }
    return projectInstallation(row);
  }

  async listInstallations() {
    const result = await this.installationRows.listRows();
    if (result?.success === false) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
        SERVICE_INSTALL_CATALOG_PATH.GATEWAY,
        SERVICE_INSTALL_CATALOG_MESSAGE.GATEWAY_READ_INVALID);
    }
    const rows = Array.isArray(result) ? result : result?.rows;
    if (!Array.isArray(rows)) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
        SERVICE_INSTALL_CATALOG_PATH.GATEWAY,
        SERVICE_INSTALL_CATALOG_MESSAGE.GATEWAY_READ_INVALID);
    }
    for (const row of rows) {
      assertInstallationRecord(row);
      if (!Number.isSafeInteger(row.created_at) || row.created_at < 0 ||
          typeof row.installation_id !== 'string') {
        fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
          SERVICE_INSTALL_CATALOG_PATH.INSTALLATION,
          SERVICE_INSTALL_CATALOG_MESSAGE.INSTALLATION_STATE_CORRUPT);
      }
    }
    return deepFreeze([...rows]
      .sort((left, right) => left.created_at - right.created_at ||
        left.installation_id.localeCompare(right.installation_id))
      .map(projectInstallation));
  }

  async getPackage(packageId) {
    const id = requireIdentifier(packageId, '/packageId');
    const row = await this.readRow(
      this.packageRows, id, CATALOG_PRIMARY_KEY_FIELD.PACKAGE);
    return row ? projectPackage(row) : null;
  }

  async getBindableArtifact(packageId, manifestDigest) {
    const id = requireIdentifier(packageId, '/packageId');
    const digest = requireDigest(
      manifestDigest, SERVICE_INSTALL_CATALOG_PATH.PACKAGE_MANIFEST_DIGEST);
    const row = await this.readRow(
      this.packageRows, id, CATALOG_PRIMARY_KEY_FIELD.PACKAGE);
    return row ? projectBindableArtifact(row, digest) : null;
  }

  async resolveUniqueBindableArtifactByDigest(
    artifactDigest,
    eligiblePackageIds,
  ) {
    const digest = requireDigest(
      artifactDigest, SERVICE_INSTALL_CATALOG_PATH.ARTIFACT_DIGEST);
    const eligible = requireEligiblePackageIds(eligiblePackageIds);
    const result = await readAuthoritativeControlPlaneRows(
      this.packageRows.requireGateway(),
      TABLES.SERVICE_PACKAGES,
      'SELECT * FROM service_packages WHERE artifact_digest = ?',
      [digest],
      {owner: this.getOwnerName()},
    );
    if (result?.success === false) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
        SERVICE_INSTALL_CATALOG_PATH.GATEWAY,
        SERVICE_INSTALL_CATALOG_MESSAGE.GATEWAY_READ_INVALID);
    }
    const authoritativeRows = Array.isArray(result) ? result : result?.rows;
    if (!Array.isArray(authoritativeRows)) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
        SERVICE_INSTALL_CATALOG_PATH.GATEWAY,
        SERVICE_INSTALL_CATALOG_MESSAGE.GATEWAY_READ_INVALID);
    }
    for (const row of authoritativeRows) {
      if (!isPlainObject(row) || row.artifact_digest !== digest) {
        fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
          SERVICE_INSTALL_CATALOG_PATH.GATEWAY,
          SERVICE_INSTALL_CATALOG_MESSAGE.GATEWAY_READ_INVALID);
      }
      projectPackage(row);
    }
    const rows = authoritativeRows.filter((row) =>
      eligible.has(row.package_id));
    if (rows.length > 1) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.AMBIGUOUS_ARTIFACT_DIGEST,
        SERVICE_INSTALL_CATALOG_PATH.ARTIFACT_DIGEST,
        SERVICE_INSTALL_CATALOG_MESSAGE.ARTIFACT_DIGEST_AMBIGUOUS);
    }
    return rows[0] ? projectBindableArtifact(rows[0]) : null;
  }

  async recordPackage(request = {}, options = {}) {
    assertShape(request, PACKAGE_FIELDS, SERVICE_INSTALL_CATALOG_PATH.PACKAGE);
    const row = buildPackageRow(request, this.timestamp());
    return this.runSerialized([
      catalogResourceKey(CATALOG_RESOURCE_KIND.PACKAGE, row.package_id),
    ], () => this.recordImmutableRow({
      owner: this.packageRows,
      row,
      primaryKey: row.package_id,
      primaryKeyField: CATALOG_PRIMARY_KEY_FIELD.PACKAGE,
      identityFields: PACKAGE_IDENTITY_FIELDS,
      conflictCode: SERVICE_INSTALL_CATALOG_ERROR_CODE.PACKAGE_CONFLICT,
      conflictPath: SERVICE_INSTALL_CATALOG_PATH.PACKAGE_ID,
      conflictMessage: SERVICE_INSTALL_CATALOG_MESSAGE.PACKAGE_IMMUTABLE,
      project: projectPackage,
      options,
    }));
  }

  async recordImmutableRow(contract) {
    const existing = await this.readRow(
      contract.owner,
      contract.primaryKey,
      contract.primaryKeyField,
    );
    if (existing) return this.resolveImmutableRow(existing, contract);
    try {
      await contract.owner.insertRow(contract.row, contract.options);
      return contract.project(contract.row);
    } catch (error) {
      const concurrent = await this.readRow(
        contract.owner,
        contract.primaryKey,
        contract.primaryKeyField,
      );
      if (!concurrent) throw error;
      return this.resolveImmutableRow(concurrent, contract);
    }
  }

  resolveImmutableRow(existing, contract) {
    if (!sameFields(existing, contract.row, contract.identityFields)) {
      fail(contract.conflictCode, contract.conflictPath,
        contract.conflictMessage);
    }
    return contract.project(existing);
  }

  async getRevision(revisionId) {
    const id = requireIdentifier(revisionId, '/revisionId');
    const row = await this.readRow(
      this.revisionRows, id, CATALOG_PRIMARY_KEY_FIELD.REVISION);
    return row ? projectRevision(row) : null;
  }

  async recordRevision(request = {}, options = {}) {
    assertShape(request, REVISION_FIELDS, SERVICE_INSTALL_CATALOG_PATH.REVISION);
    const revisionId = requireIdentifier(
      request.revisionId, '/revision/revisionId');
    const packageId = requireIdentifier(request.packageId, '/revision/packageId');
    return this.runSerialized([
      catalogResourceKey(CATALOG_RESOURCE_KIND.PACKAGE, packageId),
      catalogResourceKey(CATALOG_RESOURCE_KIND.REVISION, revisionId),
    ], () => this.recordRevisionSerialized(
      {revisionId, packageId, config: request.config},
      options,
    ));
  }

  async recordRevisionSerialized(request, options) {
    const packageRow = await this.readRow(
      this.packageRows,
      request.packageId,
      CATALOG_PRIMARY_KEY_FIELD.PACKAGE,
    );
    if (!packageRow) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.PACKAGE_NOT_FOUND,
        SERVICE_INSTALL_CATALOG_PATH.REVISION_PACKAGE_ID,
        SERVICE_INSTALL_CATALOG_MESSAGE.PACKAGE_MISSING);
    }
    const normalizedConfig = canonicalJson(
      request.config ?? {}, '/revision/config');
    const row = {
      revision_id: request.revisionId,
      package_id: request.packageId,
      artifact_digest: packageRow.artifact_digest,
      config_digest: sha256Json(normalizedConfig),
      normalized_config: normalizedConfig,
      created_at: this.timestamp(),
    };
    return this.recordImmutableRow({
      owner: this.revisionRows,
      row,
      primaryKey: row.revision_id,
      primaryKeyField: CATALOG_PRIMARY_KEY_FIELD.REVISION,
      identityFields: REVISION_IDENTITY_FIELDS,
      conflictCode: SERVICE_INSTALL_CATALOG_ERROR_CODE.REVISION_CONFLICT,
      conflictPath: SERVICE_INSTALL_CATALOG_PATH.REVISION_ID,
      conflictMessage: SERVICE_INSTALL_CATALOG_MESSAGE.REVISION_IMMUTABLE,
      project: projectRevision,
      options,
    });
  }

  async getInstallation(installationId) {
    const id = requireIdentifier(installationId, '/installationId');
    const row = await this.readRow(
      this.installationRows, id, CATALOG_PRIMARY_KEY_FIELD.INSTALLATION);
    return row ? projectInstallation(row) : null;
  }

  async requestInstallation(request = {}, options = {}) {
    assertShape(
      request,
      INSTALLATION_FIELDS,
      SERVICE_INSTALL_CATALOG_PATH.INSTALLATION,
    );
    const installationId = requireIdentifier(
      request.installationId, '/installation/installationId');
    const revisionId = requireIdentifier(
      request.revisionId, '/installation/revisionId');
    const serviceDefinitionId = requireIdentifier(
      request.serviceDefinitionId, '/installation/serviceDefinitionId');
    const operationId = requireIdentifier(
      request.operationId, '/installation/operationId');
    const desiredState = requireEnum(
      request.desiredState, SERVICE_INSTALL_DESIRED_STATE,
      '/installation/desiredState');
    const normalized = {
      installationId,
      revisionId,
      serviceDefinitionId,
      operationId,
      desiredState,
    };
    return this.runSerialized([
      catalogResourceKey(CATALOG_RESOURCE_KIND.INSTALLATION, installationId),
      catalogResourceKey(CATALOG_RESOURCE_KIND.OPERATION, operationId),
      catalogResourceKey(CATALOG_RESOURCE_KIND.REVISION, revisionId),
    ], () => this.requestInstallationSerialized(normalized, options));
  }

  async requestInstallationSerialized(request, options) {
    const revision = await this.readRow(
      this.revisionRows,
      request.revisionId,
      CATALOG_PRIMARY_KEY_FIELD.REVISION,
    );
    if (!revision) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.REVISION_NOT_FOUND,
        SERVICE_INSTALL_CATALOG_PATH.INSTALLATION_REVISION_ID,
        SERVICE_INSTALL_CATALOG_MESSAGE.REVISION_MISSING);
    }
    const timestamp = this.timestamp();
    const row = {
      installation_id: request.installationId,
      revision_id: request.revisionId,
      service_definition_id: request.serviceDefinitionId,
      desired_state: request.desiredState,
      rollout_state: SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING,
      operation_id: request.operationId,
      latest_failure_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const existing = await this.readInstallationReplayRows(row);
    const replay = this.resolveInstallationReplay(row, existing);
    if (replay) return replay;
    try {
      await this.installationRows.insertRow(row, options);
      return projectInstallation(row);
    } catch (error) {
      const concurrent = await this.readInstallationReplayRows(row);
      const concurrentReplay = this.resolveInstallationReplay(row, concurrent);
      if (concurrentReplay) return concurrentReplay;
      throw error;
    }
  }

  async readInstallationReplayRows(row) {
    const [operationRow, installationRow] = await Promise.all([
      this.readInstallationByOperationId(row.operation_id),
      this.readRow(
        this.installationRows,
        row.installation_id,
        CATALOG_PRIMARY_KEY_FIELD.INSTALLATION,
      ),
    ]);
    return {operationRow, installationRow};
  }

  resolveInstallationReplay(row, existing) {
    if (existing.operationRow &&
        existing.operationRow.installation_id !== row.installation_id) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.OPERATION_CONFLICT,
        SERVICE_INSTALL_CATALOG_PATH.INSTALLATION_OPERATION_ID,
        SERVICE_INSTALL_CATALOG_MESSAGE.OPERATION_CONFLICT);
    }
    const replay = existing.installationRow || existing.operationRow;
    if (!replay) return null;
    if (!sameFields(replay, row, INSTALLATION_INTENT_FIELDS)) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INSTALLATION_CONFLICT,
        SERVICE_INSTALL_CATALOG_PATH.INSTALLATION_ID,
        SERVICE_INSTALL_CATALOG_MESSAGE.INSTALLATION_IMMUTABLE);
    }
    return projectInstallation(replay);
  }

  async recordRolloutOutcome(request = {}, options = {}) {
    assertShape(request, ROLLOUT_FIELDS, SERVICE_INSTALL_CATALOG_PATH.ROLLOUT);
    const installationId = requireIdentifier(
      request.installationId, '/rollout/installationId');
    const rolloutState = requireEnum(
      request.rolloutState, SERVICE_INSTALL_ROLLOUT_STATE,
      '/rollout/rolloutState');
    if (rolloutState === SERVICE_INSTALL_ROLLOUT_STATE.FAILED) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD,
        SERVICE_INSTALL_CATALOG_PATH.ROLLOUT_STATE,
        SERVICE_INSTALL_CATALOG_MESSAGE.FAILURE_REQUIRES_RECORD);
    }
    return this.runSerialized([
      catalogResourceKey(CATALOG_RESOURCE_KIND.INSTALLATION, installationId),
    ], () => this.recordRolloutOutcomeSerialized(
      installationId,
      rolloutState,
      options,
    ));
  }

  async recordRolloutOutcomeSerialized(installationId, rolloutState, options) {
    const row = await this.readRow(
      this.installationRows,
      installationId,
      CATALOG_PRIMARY_KEY_FIELD.INSTALLATION,
    );
    if (!row) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INSTALLATION_NOT_FOUND,
        SERVICE_INSTALL_CATALOG_PATH.ROLLOUT_INSTALLATION_ID,
        SERVICE_INSTALL_CATALOG_MESSAGE.INSTALLATION_MISSING);
    }
    assertInstallationRecord(row);
    if (row.rollout_state === rolloutState) return projectInstallation(row);
    if (!ROLLOUT_TRANSITIONS[row.rollout_state].includes(rolloutState)) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_TRANSITION,
        SERVICE_INSTALL_CATALOG_PATH.ROLLOUT_STATE,
        SERVICE_INSTALL_CATALOG_MESSAGE.ROLLOUT_TRANSITION_INVALID);
    }
    const updated = {
      ...row,
      rollout_state: rolloutState,
      updated_at: this.nextTimestamp(row),
    };
    const concurrent = await this.updateInstallationWithCas(
      row,
      {rollout_state: updated.rollout_state, updated_at: updated.updated_at},
      options,
    );
    if (concurrent) {
      assertInstallationRecord(concurrent);
      if (concurrent.rollout_state === rolloutState) {
        return projectInstallation(concurrent);
      }
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CONCURRENT_MODIFICATION,
        SERVICE_INSTALL_CATALOG_PATH.ROLLOUT_STATE,
        SERVICE_INSTALL_CATALOG_MESSAGE.CONCURRENT_INSTALLATION_UPDATE);
    }
    return projectInstallation(updated);
  }

  async updateInstallationWithCas(row, data, options) {
    let result;
    try {
      result = await this.installationRows.updateWhere(
        {
          installation_id: row.installation_id,
          rollout_state: row.rollout_state,
          updated_at: row.updated_at,
        },
        data,
        options,
      );
    } catch (error) {
      const afterError = await this.readRow(
        this.installationRows,
        row.installation_id,
        CATALOG_PRIMARY_KEY_FIELD.INSTALLATION,
      );
      if (!afterError || sameFields(
        afterError,
        row,
        CATALOG_INSTALLATION_CAS_FIELDS,
      )) {
        throw error;
      }
      return afterError;
    }
    const affectedRows = mutationAffectedRows(result);
    if (affectedRows === 1) return null;
    if (affectedRows !== 0) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD,
        SERVICE_INSTALL_CATALOG_PATH.GATEWAY,
        SERVICE_INSTALL_CATALOG_MESSAGE.GATEWAY_WRITE_INVALID);
    }
    const concurrent = await this.readRow(
      this.installationRows,
      row.installation_id,
      CATALOG_PRIMARY_KEY_FIELD.INSTALLATION,
    );
    if (!concurrent) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INSTALLATION_NOT_FOUND,
        SERVICE_INSTALL_CATALOG_PATH.ROLLOUT_INSTALLATION_ID,
        SERVICE_INSTALL_CATALOG_MESSAGE.INSTALLATION_MISSING);
    }
    return concurrent;
  }

  async getFailure(failureId) {
    const id = requireIdentifier(failureId, '/failureId');
    const row = await this.readRow(
      this.failureRows, id, CATALOG_PRIMARY_KEY_FIELD.FAILURE);
    return row ? projectFailure(row) : null;
  }

  async recordFailure(request = {}, options = {}) {
    assertShape(request, FAILURE_FIELDS, SERVICE_INSTALL_CATALOG_PATH.FAILURE);
    const failureId = requireIdentifier(request.failureId, '/failure/failureId');
    const installationId = requireIdentifier(
      request.installationId, '/failure/installationId');
    const failureCode = requireEnum(
      request.failureCode, SERVICE_INSTALL_FAILURE_CODE,
      '/failure/failureCode');
    const failurePhase = requireEnum(
      request.failurePhase, SERVICE_INSTALL_FAILURE_PHASE,
      '/failure/failurePhase');
    if (typeof request.retryable !== 'boolean') {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD,
        SERVICE_INSTALL_CATALOG_PATH.FAILURE_RETRYABLE,
        SERVICE_INSTALL_CATALOG_MESSAGE.RETRYABLE_BOOLEAN);
    }
    const normalized = {
      failureId,
      installationId,
      failureCode,
      failurePhase,
      retryable: request.retryable,
    };
    return this.runSerialized([
      catalogResourceKey(CATALOG_RESOURCE_KIND.FAILURE, failureId),
      catalogResourceKey(CATALOG_RESOURCE_KIND.INSTALLATION, installationId),
    ], () => this.recordFailureSerialized(normalized, options));
  }

  async recordFailureSerialized(request, options) {
    const installation = await this.readRow(
      this.installationRows,
      request.installationId,
      CATALOG_PRIMARY_KEY_FIELD.INSTALLATION,
    );
    if (!installation) {
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.INSTALLATION_NOT_FOUND,
        SERVICE_INSTALL_CATALOG_PATH.FAILURE_INSTALLATION_ID,
        SERVICE_INSTALL_CATALOG_MESSAGE.INSTALLATION_MISSING);
    }
    const row = {
      failure_id: request.failureId,
      installation_id: request.installationId,
      revision_id: installation.revision_id,
      failure_code: request.failureCode,
      failure_phase: request.failurePhase,
      retryable: request.retryable ? 1 : 0,
      occurred_at: this.timestamp(),
    };
    const failureContract = {
      owner: this.failureRows,
      row,
      primaryKey: row.failure_id,
      primaryKeyField: CATALOG_PRIMARY_KEY_FIELD.FAILURE,
      identityFields: FAILURE_IDENTITY_FIELDS,
      conflictCode: SERVICE_INSTALL_CATALOG_ERROR_CODE.FAILURE_CONFLICT,
      conflictPath: SERVICE_INSTALL_CATALOG_PATH.FAILURE_ID,
      conflictMessage: SERVICE_INSTALL_CATALOG_MESSAGE.FAILURE_IMMUTABLE,
      project: projectFailure,
      options,
    };
    const existingFailure = await this.readRow(
      this.failureRows,
      request.failureId,
      CATALOG_PRIMARY_KEY_FIELD.FAILURE,
    );
    const failure = existingFailure ?
      this.resolveImmutableRow(existingFailure, failureContract) :
      await this.recordImmutableRow(failureContract);
    if (existingFailure && installation.latest_failure_id !== null) {
      return deepFreeze({
        failure,
        installation: projectInstallation(installation),
      });
    }
    const updated = {
      ...installation,
      rollout_state: SERVICE_INSTALL_ROLLOUT_STATE.FAILED,
      latest_failure_id: request.failureId,
      updated_at: this.nextTimestamp(installation),
    };
    const concurrent = await this.updateInstallationWithCas(
      installation,
      {
        rollout_state: updated.rollout_state,
        latest_failure_id: updated.latest_failure_id,
        updated_at: updated.updated_at,
      },
      options,
    );
    if (concurrent) {
      assertInstallationRecord(concurrent);
      if (concurrent.rollout_state === SERVICE_INSTALL_ROLLOUT_STATE.FAILED &&
          concurrent.latest_failure_id === request.failureId) {
        return deepFreeze({
          failure,
          installation: projectInstallation(concurrent),
        });
      }
      fail(SERVICE_INSTALL_CATALOG_ERROR_CODE.CONCURRENT_MODIFICATION,
        SERVICE_INSTALL_CATALOG_PATH.FAILURE_INSTALLATION_ID,
        SERVICE_INSTALL_CATALOG_MESSAGE.CONCURRENT_INSTALLATION_UPDATE);
    }
    return deepFreeze({
      failure,
      installation: projectInstallation(updated),
    });
  }
}

export {
  SERVICE_INSTALL_CATALOG_ERROR_CODE,
  SERVICE_INSTALL_DESIRED_STATE,
  SERVICE_INSTALL_FAILURE_CODE,
  SERVICE_INSTALL_FAILURE_PHASE,
  SERVICE_INSTALL_ROLLOUT_STATE,
  ServiceInstallCatalogError,
  ServiceInstallCatalogOwner,
};
