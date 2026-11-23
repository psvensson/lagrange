/**
 * Test adapters implementing the canonical QueryExecutor.executeOnPartition contract
 * so standalone and fixture-backed IndexService tests traverse the exact same
 * distributed partition execution path and leader requirements as production.
 */

import {
  LEADER_READ_REQUEST_FIELD,
  LEADER_REQUIRED_READ,
} from '../../src/control-plane/control-plane-owner-fact-read-contract.js';
import {
  decodePartitionResponseRows,
} from '../../src/query/query-executor-partition-request-builders.js';
import {GLOBAL_INDEX_ERROR_CODE} from '../../src/index-management/index-constants.js';

const REFUSAL_LAYER_ADAPTER = 'PARTITION_EXECUTOR_TEST_ADAPTER';
const LEADER_REQUIREMENT_ERROR_CODE = 'LEADER_REQUIREMENT_MISSING';
const NOT_LEADER_ERROR_CODE = 'NOT_LEADER';

function isLeaderService(service) {
  if (!service || typeof service !== 'object') return false;
  if (service.role === 'leader' || service.state === 'leader') return true;
  if (service.raftRole === 'leader' || service.raftNode?.role === 'leader') return true;
  const checkLeader = service.isLeader;
  return typeof checkLeader === 'function' ? Boolean(checkLeader.call(service)) : false;
}

function unwrapPartitionServiceContainer(source) {
  if (!source) return null;
  const resolved = typeof source === 'function' ? source() : source;
  const getServices = resolved?.getPartitionServices;
  if (typeof getServices === 'function') {
    return getServices.call(resolved);
  }
  return resolved;
}

function collectMatchingServices(source, partitionId) {
  const container = unwrapPartitionServiceContainer(source);
  if (!container) return [];
  if (container instanceof Map) {
    const direct = container.get(partitionId);
    if (Array.isArray(direct)) return direct;
    if (direct && typeof direct === 'object') return [direct];
    const matches = [];
    for (const candidate of container.values()) {
      const candidateId = candidate?.partitionId || candidate?.getPartitionId?.();
      if (candidateId === partitionId) matches.push(candidate);
    }
    return matches;
  }
  if (Array.isArray(container)) {
    return container.filter(
      (candidate) => (candidate?.partitionId || candidate?.getPartitionId?.()) === partitionId,
    );
  }
  if (typeof container === 'object') {
    if (Object.hasOwn(container, partitionId)) {
      const entry = container[partitionId];
      if (Array.isArray(entry)) return entry;
      if (entry && typeof entry === 'object') return [entry];
    }
    const candidateId = container.partitionId || container.getPartitionId?.();
    if (candidateId === partitionId) return [container];
    return Object.values(container).filter(
      (candidate) => (candidate?.partitionId || candidate?.getPartitionId?.()) === partitionId,
    );
  }
  return [];
}

function validateUniformLeaderContract(forRead, preferLeader, deliveryOptions, enforceContract) {
  if (!enforceContract) return null;
  if (preferLeader !== true || deliveryOptions?.requireLeader !== true) {
    return {
      success: false,
      errorCode: LEADER_REQUIREMENT_ERROR_CODE,
      failureCode: LEADER_REQUIREMENT_ERROR_CODE,
      refusalLayer: REFUSAL_LAYER_ADAPTER,
      error: `Partition ${forRead ? 'read' : 'write'} must require leader (preferLeader=true, ` +
        'deliveryOptions.requireLeader=true)',
    };
  }
  return null;
}

function extractSqliteHandle(entry) {
  if (!entry) return null;
  if (entry.db && typeof entry.db.prepare === 'function') return entry.db;
  if (typeof entry.prepare === 'function') return entry;
  return null;
}

function lookupDatabaseEntry(databasesByPartition, partitionId) {
  if (!databasesByPartition) return null;
  if (databasesByPartition instanceof Map) {
    return databasesByPartition.get(partitionId) || null;
  }
  if (typeof databasesByPartition === 'object' && Object.hasOwn(databasesByPartition, partitionId)) {
    return databasesByPartition[partitionId];
  }
  return null;
}

/**
 * Create a PartitionService-backed partitionExecutor adapter matching QueryExecutor.executeOnPartition.
 * @param {Map|Array|Object|Function} partitionServicesSource - PartitionService collection or provider.
 * @param {Object} [options] - Adapter options.
 * @param {boolean} [options.enforceLeaderContract=true] - Fail if caller omits leader requirements.
 * @return {Object} Executor with executeOnPartition and recorded calls.
 */
function createPartitionServiceExecutorAdapter(partitionServicesSource, options = {}) {
  const enforceLeaderContract = options.enforceLeaderContract !== false;
  const calls = [];

  async function executeOnPartition(
    partitionId,
    sql,
    params = [],
    forRead = true,
    preferLeader = true,
    preferSameLatencyGroup = false,
    deliveryOptions = {},
  ) {
    const normalizedParams = Array.isArray(params) ? params : [];
    const normalizedOptions = deliveryOptions && typeof deliveryOptions === 'object' ?
      deliveryOptions :
      {};
    calls.push({
      partitionId,
      sql,
      params: normalizedParams,
      forRead: Boolean(forRead),
      preferLeader,
      preferSameLatencyGroup,
      deliveryOptions: {...normalizedOptions},
    });
    const contractFailure = validateUniformLeaderContract(
      forRead, preferLeader, normalizedOptions, enforceLeaderContract,
    );
    if (contractFailure) return contractFailure;

    const services = collectMatchingServices(partitionServicesSource, partitionId);
    if (services.length === 0) {
      return {
        success: false,
        errorCode: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        failureCode: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        refusalLayer: REFUSAL_LAYER_ADAPTER,
        error: `Partition service unavailable: ${partitionId}`,
      };
    }

    const leader = services.find(isLeaderService) || null;
    if (!leader) {
      return {
        success: false,
        errorCode: NOT_LEADER_ERROR_CODE,
        failureCode: NOT_LEADER_ERROR_CODE,
        refusalLayer: REFUSAL_LAYER_ADAPTER,
        error: `No leader available for partition ${partitionId}`,
      };
    }

    const handleRemoteQuery = leader.handleRemoteQuery;
    if (typeof handleRemoteQuery !== 'function') {
      return {
        success: false,
        errorCode: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        failureCode: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        refusalLayer: REFUSAL_LAYER_ADAPTER,
        error: `Leader for ${partitionId} cannot handle remote queries`,
      };
    }

    const request = {
      sql,
      params: normalizedParams,
      readonly: Boolean(forRead),
      readOnly: Boolean(forRead),
      ...(forRead ? {[LEADER_READ_REQUEST_FIELD]: LEADER_REQUIRED_READ} : {}),
      ...(normalizedOptions.tableName ? {tableName: normalizedOptions.tableName} : {}),
      ...(normalizedOptions.expectedPartitionVersion !== undefined &&
          normalizedOptions.expectedPartitionVersion !== null ?
        {expectedPartitionVersion: normalizedOptions.expectedPartitionVersion} :
        {}),
    };
    const rawResult = await handleRemoteQuery.call(leader, request);
    if (!rawResult || rawResult.success !== true) {
      return rawResult || {
        success: false,
        errorCode: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        failureCode: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        refusalLayer: REFUSAL_LAYER_ADAPTER,
        error: `Empty remote query response for ${partitionId}`,
      };
    }
    return {
      ...rawResult,
      rows: decodePartitionResponseRows(rawResult),
    };
  }

  return {
    executeOnPartition,
    calls,
  };
}

/**
 * Create a SQLite-backed partitionExecutor adapter matching QueryExecutor.executeOnPartition.
 * @param {Map<string, Object>|Object} databasesByPartition - Map or record of SQLite handles by partitionId.
 * @param {Object} [options] - Adapter options.
 * @param {Function} [options.isLeader] - Optional predicate (partitionId) => boolean.
 * @param {Function} [options.validateWriteVersion] - Optional (partitionId, expectedPartitionVersion) => string|null error.
 * @param {boolean} [options.enforceLeaderContract=true] - Fail if caller omits leader requirements.
 * @return {Object} Executor with executeOnPartition and recorded calls.
 */
function createSqlitePartitionExecutorAdapter(databasesByPartition, options = {}) {
  const enforceLeaderContract = options.enforceLeaderContract !== false;
  const isLeaderFn = typeof options.isLeader === 'function' ? options.isLeader : () => true;
  const validateWriteVersion = typeof options.validateWriteVersion === 'function' ?
    options.validateWriteVersion :
    null;
  const calls = [];

  async function executeOnPartition(
    partitionId,
    sql,
    params = [],
    forRead = true,
    preferLeader = true,
    preferSameLatencyGroup = false,
    deliveryOptions = {},
  ) {
    const normalizedParams = Array.isArray(params) ? params : [];
    const normalizedOptions = deliveryOptions && typeof deliveryOptions === 'object' ?
      deliveryOptions :
      {};
    calls.push({
      partitionId,
      sql,
      params: normalizedParams,
      forRead: Boolean(forRead),
      preferLeader,
      preferSameLatencyGroup,
      deliveryOptions: {...normalizedOptions},
    });
    const contractFailure = validateUniformLeaderContract(
      forRead, preferLeader, normalizedOptions, enforceLeaderContract,
    );
    if (contractFailure) return contractFailure;

    if (!isLeaderFn(partitionId)) {
      return {
        success: false,
        errorCode: NOT_LEADER_ERROR_CODE,
        failureCode: NOT_LEADER_ERROR_CODE,
        refusalLayer: REFUSAL_LAYER_ADAPTER,
        error: `Partition ${partitionId} is not leader`,
      };
    }

    const db = extractSqliteHandle(lookupDatabaseEntry(databasesByPartition, partitionId));
    if (!db) {
      return {
        success: false,
        errorCode: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        failureCode: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        refusalLayer: REFUSAL_LAYER_ADAPTER,
        error: `Partition database unavailable: ${partitionId}`,
      };
    }

    if (!forRead && validateWriteVersion) {
      const versionErr = validateWriteVersion(
        partitionId,
        normalizedOptions.expectedPartitionVersion,
      );
      if (versionErr) {
        return {
          success: false,
          errorCode: 'STALE_PARTITION_VERSION',
          failureCode: 'STALE_PARTITION_VERSION',
          refusalLayer: REFUSAL_LAYER_ADAPTER,
          error: versionErr,
        };
      }
    }

    const stmt = db.prepare(sql);
    if (forRead) {
      const rows = stmt.all(...normalizedParams);
      return {success: true, rows};
    }
    const info = stmt.run(...normalizedParams);
    return {
      success: true,
      changes: info.changes ?? 0,
      lastInsertRowid: info.lastInsertRowid ?? null,
    };
  }

  return {
    executeOnPartition,
    calls,
  };
}

export {
  createPartitionServiceExecutorAdapter,
  createSqlitePartitionExecutorAdapter,
};
