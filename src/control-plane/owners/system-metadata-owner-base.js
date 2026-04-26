import {
  getSystemCachePrimaryKeyField,
} from '../../cache/system-cache-key-descriptor.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
} from '../control-plane-error-classification.js';
import {
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  readAuthoritativeControlPlaneRows,
  readProjectionControlPlaneRows,
} from '../control-plane-system-table-gateway.js';
import {
  createSystemMetadataGatewayRequiredError,
} from '../system-metadata-access-error.js';
import {runRetryableControlPlaneWrite} from
  '../../bootstrap/shared/retryable-control-plane-write.js';
import {
  NUM,
  TYPEOF,
} from '../../constants/index.js';

function unwrapRowReadResult(result) {
  if (Array.isArray(result)) {
    return result[0] || null;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows[0] || null;
  }
  if (result && typeof result === 'object') {
    return result;
  }
  return null;
}

function cloneParticipantFailures(resultOrError) {
  const participantFailures = Array.isArray(resultOrError?.participantFailures) ?
    resultOrError.participantFailures
      .filter((entry) => entry && typeof entry === TYPEOF.OBJECT)
      .map((entry) => ({...entry})) :
    [];
  const firstFailedParticipant =
    resultOrError?.firstFailedParticipant &&
    typeof resultOrError.firstFailedParticipant === TYPEOF.OBJECT ?
      {...resultOrError.firstFailedParticipant} :
      (participantFailures.length > NUM.ZERO ?
        participantFailures[NUM.ZERO] :
        null);
  return {
    participantFailures,
    firstFailedParticipant,
  };
}

function applySystemMetadataMutationErrorMetadata(
  error,
  resultOrError,
  metadata = {},
) {
  const errorCode = getControlPlaneErrorCode(resultOrError);
  if (typeof errorCode === TYPEOF.STRING && errorCode.length > NUM.ZERO) {
    error.errorCode = errorCode;
    if (typeof error.code !== TYPEOF.STRING || error.code.length === NUM.ZERO) {
      error.code = errorCode;
    }
  }
  const retryAfterMs = getControlPlaneRetryAfterMs(resultOrError);
  if (retryAfterMs > NUM.ZERO) {
    error.retryAfterMs = retryAfterMs;
  }
  if (resultOrError?.deferRetry === true || retryAfterMs > NUM.ZERO) {
    error.deferRetry = true;
  }
  if (typeof resultOrError?.pressureAction === TYPEOF.STRING &&
      resultOrError.pressureAction.length > NUM.ZERO) {
    error.pressureAction = resultOrError.pressureAction;
  }
  if (typeof resultOrError?.pressureReason === TYPEOF.STRING &&
      resultOrError.pressureReason.length > NUM.ZERO) {
    error.pressureReason = resultOrError.pressureReason;
  }
  if (resultOrError?.pressureSummary &&
      typeof resultOrError.pressureSummary === TYPEOF.OBJECT) {
    error.pressureSummary = {...resultOrError.pressureSummary};
  }
  if (typeof resultOrError?.reasonCode === TYPEOF.STRING &&
      resultOrError.reasonCode.length > NUM.ZERO) {
    error.reasonCode = resultOrError.reasonCode;
  }
  if (typeof resultOrError?.participationKind === TYPEOF.STRING &&
      resultOrError.participationKind.length > NUM.ZERO) {
    error.participationKind = resultOrError.participationKind;
  }
  if (typeof resultOrError?.outcome === TYPEOF.STRING &&
      resultOrError.outcome.length > NUM.ZERO) {
    error.outcome = resultOrError.outcome;
  }
  if (typeof resultOrError?.backpressured === TYPEOF.BOOLEAN) {
    error.backpressured = resultOrError.backpressured;
  }
  const {participantFailures, firstFailedParticipant} =
    cloneParticipantFailures(resultOrError);
  if (participantFailures.length > NUM.ZERO) {
    error.participantFailures = participantFailures;
  }
  if (firstFailedParticipant) {
    error.firstFailedParticipant = firstFailedParticipant;
  }
  if (resultOrError?.cause) {
    error.cause = resultOrError.cause;
  }
  if (typeof metadata.tableName === TYPEOF.STRING &&
      metadata.tableName.length > NUM.ZERO) {
    error.tableName = metadata.tableName;
  }
  if (typeof metadata.ownerName === TYPEOF.STRING &&
      metadata.ownerName.length > NUM.ZERO) {
    error.ownerName = metadata.ownerName;
  }
  if (typeof metadata.operation === TYPEOF.STRING &&
      metadata.operation.length > NUM.ZERO) {
    error.operation = metadata.operation;
  }
  return error;
}

function buildSystemMetadataMutationError(
  resultOrError,
  metadata = {},
  fallbackMessage = null,
) {
  const message =
    typeof resultOrError?.error === TYPEOF.STRING &&
      resultOrError.error.length > NUM.ZERO ?
      resultOrError.error :
      (
        typeof resultOrError?.message === TYPEOF.STRING &&
        resultOrError.message.length > NUM.ZERO ?
          resultOrError.message :
          (
            fallbackMessage ||
            `${metadata.ownerName || 'system-metadata-owner'} ` +
              `${metadata.operation || 'mutation'} failed`
          )
      );
  const error =
    resultOrError instanceof Error ?
      resultOrError :
      new Error(message);
  if (!error.message || error.message.length === NUM.ZERO) {
    error.message = message;
  }
  return applySystemMetadataMutationErrorMetadata(
    error,
    resultOrError,
    metadata,
  );
}

class SystemMetadataOwnerBase {
  constructor(options = {}) {
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.systemTableCache = options.systemTableCache || null;
    this.controlPlaneWriteRetryTimeoutMs =
      options.controlPlaneWriteRetryTimeoutMs;
    this.controlPlaneWriteRetryBaseDelayMs =
      options.controlPlaneWriteRetryBaseDelayMs;
    this.controlPlaneWriteRetryMaxDelayMs =
      options.controlPlaneWriteRetryMaxDelayMs;
    this.controlPlaneWriteRetryNow =
      options.controlPlaneWriteRetryNow || null;
    this.controlPlaneWriteRetrySleep =
      options.controlPlaneWriteRetrySleep || null;
  }

  getOwnerName() {
    return this.constructor.OWNER_NAME || 'unknown-owner';
  }

  getTableName() {
    return this.constructor.TABLE_NAME || null;
  }

  getGateway() {
    return this.controlPlaneSystemTableGateway || null;
  }

  getSystemTableCache() {
    return this.systemTableCache || null;
  }

  setControlPlaneSystemTableGateway(controlPlaneSystemTableGateway) {
    this.controlPlaneSystemTableGateway =
      controlPlaneSystemTableGateway || null;
    return this;
  }

  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache || null;
    return this;
  }

  getPrimaryKeyField() {
    return getSystemCachePrimaryKeyField(this.getTableName());
  }

  requireGateway() {
    const gateway = this.getGateway();
    if (gateway) {
      return gateway;
    }
    throw createSystemMetadataGatewayRequiredError({
      ownerName: this.getOwnerName(),
      tableName: this.getTableName(),
    });
  }

  buildSelectAllSql() {
    return `SELECT * FROM ${this.getTableName()}`;
  }

  buildSelectByPrimaryKeySql() {
    return `${this.buildSelectAllSql()} WHERE ${this.getPrimaryKeyField()} = ?`;
  }

  async executeCacheRead(readFromCache, options = {}) {
    const cacheAwareOptions =
      typeof options.systemTableCache === 'undefined' &&
        this.getSystemTableCache() ?
        {
          ...options,
          systemTableCache: this.getSystemTableCache(),
        } :
        options;
    return readProjectionControlPlaneRows(this.requireGateway(),
      this.getTableName(), {
        ...cacheAwareOptions,
        owner: this.getOwnerName(),
        readFromCache,
      });
  }

  async readCachedByPrimaryKey(primaryKeyValue, options = {}) {
    const tableName = this.getTableName();
    const result = await this.executeCacheRead((systemTableCache) => {
      if (!systemTableCache) {
        return [];
      }
      if (typeof systemTableCache.get === 'function') {
        const row = systemTableCache.get(tableName, primaryKeyValue);
        return row ? [row] : [];
      }
      if (typeof systemTableCache.getAll !== 'function') {
        return [];
      }
      return (systemTableCache.getAll(tableName) || []).filter((row) => {
        return row?.[this.getPrimaryKeyField()] === primaryKeyValue;
      });
    }, options);
    return unwrapRowReadResult(result);
  }

  async listCachedRows(options = {}) {
    const tableName = this.getTableName();
    return this.executeCacheRead((systemTableCache) => {
      if (typeof systemTableCache?.getAll !== 'function') {
        return [];
      }
      return systemTableCache.getAll(tableName) || [];
    }, options);
  }

  async filterCachedRows(cachePredicate, options = {}) {
    const tableName = this.getTableName();
    return this.executeCacheRead((systemTableCache) => {
      if (!systemTableCache || typeof cachePredicate !== 'function') {
        return [];
      }
      if (typeof systemTableCache.filter === 'function') {
        return systemTableCache.filter(tableName, cachePredicate) || [];
      }
      if (typeof systemTableCache.getAll !== 'function') {
        return [];
      }
      return (systemTableCache.getAll(tableName) || []).filter(cachePredicate);
    }, options);
  }

  async readByPrimaryKey(primaryKeyValue, options = {}) {
    const result = await readAuthoritativeControlPlaneRows(
      this.requireGateway(),
      this.getTableName(),
      this.buildSelectByPrimaryKeySql(),
      [primaryKeyValue],
      {
        ...options,
        owner: this.getOwnerName(),
      },
    );
    return unwrapRowReadResult(result);
  }

  async listRows(options = {}) {
    return readAuthoritativeControlPlaneRows(
      this.requireGateway(),
      this.getTableName(),
      this.buildSelectAllSql(),
      [],
      {
        ...options,
        owner: this.getOwnerName(),
      },
    );
  }

  getControlPlaneWriteRetryOptions(options = {}) {
    const retryOptions = {};
    const timeoutMs = Number.isFinite(options.controlPlaneWriteRetryTimeoutMs) ?
      Math.floor(options.controlPlaneWriteRetryTimeoutMs) :
      (Number.isFinite(this.controlPlaneWriteRetryTimeoutMs) ?
        Math.floor(this.controlPlaneWriteRetryTimeoutMs) :
        null);
    if (timeoutMs !== null && timeoutMs >= NUM.ZERO) {
      retryOptions.timeoutMs = timeoutMs;
    }
    const baseDelayMs = Number.isFinite(options.controlPlaneWriteRetryBaseDelayMs) ?
      Math.floor(options.controlPlaneWriteRetryBaseDelayMs) :
      (Number.isFinite(this.controlPlaneWriteRetryBaseDelayMs) ?
        Math.floor(this.controlPlaneWriteRetryBaseDelayMs) :
        null);
    if (baseDelayMs !== null && baseDelayMs > NUM.ZERO) {
      retryOptions.baseDelayMs = baseDelayMs;
    }
    const maxDelayMs = Number.isFinite(options.controlPlaneWriteRetryMaxDelayMs) ?
      Math.floor(options.controlPlaneWriteRetryMaxDelayMs) :
      (Number.isFinite(this.controlPlaneWriteRetryMaxDelayMs) ?
        Math.floor(this.controlPlaneWriteRetryMaxDelayMs) :
        null);
    if (maxDelayMs !== null && maxDelayMs > NUM.ZERO) {
      retryOptions.maxDelayMs = maxDelayMs;
    }
    const now =
      typeof options.controlPlaneWriteRetryNow === TYPEOF.FUNCTION ?
        options.controlPlaneWriteRetryNow :
        this.controlPlaneWriteRetryNow;
    if (typeof now === TYPEOF.FUNCTION) {
      retryOptions.now = now;
    }
    const sleep =
      typeof options.controlPlaneWriteRetrySleep === TYPEOF.FUNCTION ?
        options.controlPlaneWriteRetrySleep :
        this.controlPlaneWriteRetrySleep;
    if (typeof sleep === TYPEOF.FUNCTION) {
      retryOptions.sleep = sleep;
    }
    if (typeof options.controlPlaneWriteRetryOnRetry === TYPEOF.FUNCTION) {
      retryOptions.onRetry = options.controlPlaneWriteRetryOnRetry;
    }
    return retryOptions;
  }

  buildMutationOptions(operation, payload = {}, options = {}) {
    const mutationOptions = {
      ...options,
      owner:
        typeof options.owner === TYPEOF.STRING && options.owner.length > NUM.ZERO ?
          options.owner :
          this.getOwnerName(),
    };
    if (operation !== 'upsert') {
      return mutationOptions;
    }
    if (typeof mutationOptions.coalescingKey === TYPEOF.STRING &&
        mutationOptions.coalescingKey.length > NUM.ZERO) {
      return mutationOptions;
    }
    if (mutationOptions.mergePolicy &&
        mutationOptions.mergePolicy !== CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE) {
      return mutationOptions;
    }
    const primaryKeyField = this.getPrimaryKeyField();
    const primaryKeyValue = payload?.row?.[primaryKeyField];
    if (typeof primaryKeyValue === TYPEOF.UNDEFINED || primaryKeyValue === null) {
      return mutationOptions;
    }
    const normalizedPrimaryKey =
      typeof primaryKeyValue === TYPEOF.STRING ?
        primaryKeyValue.trim() :
        String(primaryKeyValue);
    if (normalizedPrimaryKey.length === NUM.ZERO) {
      return mutationOptions;
    }
    return {
      ...mutationOptions,
      coalescingKey:
        `system-metadata:${this.getTableName()}:${normalizedPrimaryKey}`,
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    };
  }

  async executeMutation(operation, payload, options = {}, executor) {
    const mutationOptions = this.buildMutationOptions(
      operation,
      payload,
      options,
    );
    const retryOptions = this.getControlPlaneWriteRetryOptions(options);
    const metadata = {
      ownerName: this.getOwnerName(),
      tableName: this.getTableName(),
      operation,
    };
    try {
      const result = await runRetryableControlPlaneWrite(
        () => executor(mutationOptions),
        retryOptions,
      );
      if (result?.success === false) {
        throw buildSystemMetadataMutationError(
          result,
          metadata,
        );
      }
      return result;
    } catch (error) {
      throw buildSystemMetadataMutationError(
        error,
        metadata,
      );
    }
  }

  async insertRow(row, options = {}) {
    return this.executeMutation(
      'insert',
      {row},
      options,
      (mutationOptions) => this.requireGateway().insertSystemTableRow(
        this.getTableName(),
        row,
        mutationOptions,
      ),
    );
  }

  async upsertRow(row, options = {}) {
    return this.executeMutation(
      'upsert',
      {row},
      options,
      (mutationOptions) => this.requireGateway().upsertSystemTableRow(
        this.getTableName(),
        row,
        mutationOptions,
      ),
    );
  }

  async updateByPrimaryKey(primaryKeyValue, data, options = {}) {
    return this.executeMutation(
      'update',
      {primaryKeyValue, data},
      options,
      (mutationOptions) => this.requireGateway().updateSystemTableRow(
        this.getTableName(),
        {[this.getPrimaryKeyField()]: primaryKeyValue},
        data,
        mutationOptions,
      ),
    );
  }

  async deleteByPrimaryKey(primaryKeyValue, options = {}) {
    return this.executeMutation(
      'delete',
      {primaryKeyValue},
      options,
      (mutationOptions) => this.requireGateway().deleteSystemTableRow(
        this.getTableName(),
        {[this.getPrimaryKeyField()]: primaryKeyValue},
        mutationOptions,
      ),
    );
  }
}

export {
  buildSystemMetadataMutationError,
  SystemMetadataOwnerBase,
  unwrapRowReadResult,
};
