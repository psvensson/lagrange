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

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_UNKNOWN_OWNER = 'unknown-owner';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_UPSERT = 'upsert';
const LOCAL_STR_INSERT = 'insert';
const LOCAL_STR_UPDATE = 'update';
const LOCAL_STR_DELETE = 'delete';

function unwrapRowReadResult(result) {
  if (Array.isArray(result)) {
    return result[0] || null;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows[0] || null;
  }
  if (result && typeof result === LOCAL_STR_OBJECT) {
    return result;
  }
  return null;
}

function cloneParticipantFailures(resultOrError) {
  const participantFailures = Array.isArray(resultOrError?.participantFailures) ?
    resultOrError.participantFailures
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({...entry})) :
    [];
  const firstFailedParticipant =
    resultOrError?.firstFailedParticipant &&
    typeof resultOrError.firstFailedParticipant === 'object' ?
      {...resultOrError.firstFailedParticipant} :
      (participantFailures.length > 0 ?
        participantFailures[0] :
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
  if (typeof errorCode === 'string' && errorCode.length > 0) {
    error.errorCode = errorCode;
    if (typeof error.code !== 'string' || error.code.length === 0) {
      error.code = errorCode;
    }
  }
  const retryAfterMs = getControlPlaneRetryAfterMs(resultOrError);
  if (retryAfterMs > 0) {
    error.retryAfterMs = retryAfterMs;
  }
  if (resultOrError?.deferRetry === true || retryAfterMs > 0) {
    error.deferRetry = true;
  }
  if (typeof resultOrError?.pressureAction === 'string' &&
      resultOrError.pressureAction.length > 0) {
    error.pressureAction = resultOrError.pressureAction;
  }
  if (typeof resultOrError?.pressureReason === 'string' &&
      resultOrError.pressureReason.length > 0) {
    error.pressureReason = resultOrError.pressureReason;
  }
  if (resultOrError?.pressureSummary &&
      typeof resultOrError.pressureSummary === 'object') {
    error.pressureSummary = {...resultOrError.pressureSummary};
  }
  if (typeof resultOrError?.reasonCode === 'string' &&
      resultOrError.reasonCode.length > 0) {
    error.reasonCode = resultOrError.reasonCode;
  }
  if (typeof resultOrError?.participationKind === 'string' &&
      resultOrError.participationKind.length > 0) {
    error.participationKind = resultOrError.participationKind;
  }
  if (typeof resultOrError?.outcome === 'string' &&
      resultOrError.outcome.length > 0) {
    error.outcome = resultOrError.outcome;
  }
  if (typeof resultOrError?.backpressured === 'boolean') {
    error.backpressured = resultOrError.backpressured;
  }
  const {participantFailures, firstFailedParticipant} =
    cloneParticipantFailures(resultOrError);
  if (participantFailures.length > 0) {
    error.participantFailures = participantFailures;
  }
  if (firstFailedParticipant) {
    error.firstFailedParticipant = firstFailedParticipant;
  }
  if (resultOrError?.cause) {
    error.cause = resultOrError.cause;
  }
  if (typeof metadata.tableName === 'string' &&
      metadata.tableName.length > 0) {
    error.tableName = metadata.tableName;
  }
  if (typeof metadata.ownerName === 'string' &&
      metadata.ownerName.length > 0) {
    error.ownerName = metadata.ownerName;
  }
  if (typeof metadata.operation === 'string' &&
      metadata.operation.length > 0) {
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
    typeof resultOrError?.error === 'string' &&
      resultOrError.error.length > 0 ?
      resultOrError.error :
      (
        typeof resultOrError?.message === 'string' &&
        resultOrError.message.length > 0 ?
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
  if (!error.message || error.message.length === 0) {
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
    return this.constructor.OWNER_NAME || LOCAL_STR_UNKNOWN_OWNER;
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
      if (typeof systemTableCache?.getAll !== LOCAL_STR_FUNCTION) {
        return [];
      }
      return systemTableCache.getAll(tableName) || [];
    }, options);
  }

  async filterCachedRows(cachePredicate, options = {}) {
    const tableName = this.getTableName();
    return this.executeCacheRead((systemTableCache) => {
      if (!systemTableCache || typeof cachePredicate !== LOCAL_STR_FUNCTION) {
        return [];
      }
      if (typeof systemTableCache.filter === LOCAL_STR_FUNCTION) {
        return systemTableCache.filter(tableName, cachePredicate) || [];
      }
      if (typeof systemTableCache.getAll !== LOCAL_STR_FUNCTION) {
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
    if (timeoutMs !== null && timeoutMs >= 0) {
      retryOptions.timeoutMs = timeoutMs;
    }
    const baseDelayMs = Number.isFinite(options.controlPlaneWriteRetryBaseDelayMs) ?
      Math.floor(options.controlPlaneWriteRetryBaseDelayMs) :
      (Number.isFinite(this.controlPlaneWriteRetryBaseDelayMs) ?
        Math.floor(this.controlPlaneWriteRetryBaseDelayMs) :
        null);
    if (baseDelayMs !== null && baseDelayMs > 0) {
      retryOptions.baseDelayMs = baseDelayMs;
    }
    const maxDelayMs = Number.isFinite(options.controlPlaneWriteRetryMaxDelayMs) ?
      Math.floor(options.controlPlaneWriteRetryMaxDelayMs) :
      (Number.isFinite(this.controlPlaneWriteRetryMaxDelayMs) ?
        Math.floor(this.controlPlaneWriteRetryMaxDelayMs) :
        null);
    if (maxDelayMs !== null && maxDelayMs > 0) {
      retryOptions.maxDelayMs = maxDelayMs;
    }
    const now =
      typeof options.controlPlaneWriteRetryNow === 'function' ?
        options.controlPlaneWriteRetryNow :
        this.controlPlaneWriteRetryNow;
    if (typeof now === 'function') {
      retryOptions.now = now;
    }
    const sleep =
      typeof options.controlPlaneWriteRetrySleep === 'function' ?
        options.controlPlaneWriteRetrySleep :
        this.controlPlaneWriteRetrySleep;
    if (typeof sleep === 'function') {
      retryOptions.sleep = sleep;
    }
    if (typeof options.controlPlaneWriteRetryOnRetry === 'function') {
      retryOptions.onRetry = options.controlPlaneWriteRetryOnRetry;
    }
    return retryOptions;
  }

  buildMutationOptions(operation, payload = {}, options = {}) {
    const mutationOptions = {
      ...options,
      owner:
        typeof options.owner === 'string' && options.owner.length > 0 ?
          options.owner :
          this.getOwnerName(),
    };
    if (operation !== LOCAL_STR_UPSERT) {
      return mutationOptions;
    }
    if (typeof mutationOptions.coalescingKey === 'string' &&
        mutationOptions.coalescingKey.length > 0) {
      return mutationOptions;
    }
    if (mutationOptions.mergePolicy &&
        mutationOptions.mergePolicy !== CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE) {
      return mutationOptions;
    }
    const primaryKeyField = this.getPrimaryKeyField();
    const primaryKeyValue = payload?.row?.[primaryKeyField];
    if (typeof primaryKeyValue === 'undefined' || primaryKeyValue === null) {
      return mutationOptions;
    }
    const normalizedPrimaryKey =
      typeof primaryKeyValue === 'string' ?
        primaryKeyValue.trim() :
        String(primaryKeyValue);
    if (normalizedPrimaryKey.length === 0) {
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
      LOCAL_STR_INSERT,
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
      LOCAL_STR_UPSERT,
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
      LOCAL_STR_UPDATE,
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
      LOCAL_STR_DELETE,
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
