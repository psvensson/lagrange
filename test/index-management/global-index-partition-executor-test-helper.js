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
const STALE_PARTITION_VERSION_CODE = 'STALE_PARTITION_VERSION';

function adapterFailure(errorCode, error) {
  return {
    success: false,
    errorCode,
    failureCode: errorCode,
    refusalLayer: REFUSAL_LAYER_ADAPTER,
    error,
  };
}

function getCandidatePartitionId(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  if (candidate.partitionId) return candidate.partitionId;
  const getId = candidate.getPartitionId;
  return typeof getId === 'function' ? getId.call(candidate) : null;
}

function isLeaderService(service) {
  if (!service || typeof service !== 'object') return false;
  const role = service.role || service.state || service.raftRole || service.raftNode?.role;
  if (role === 'leader') return true;
  const checkLeader = service.isLeader;
  return typeof checkLeader === 'function' ? Boolean(checkLeader.call(service)) : false;
}

function unwrapPartitionServiceContainer(source) {
  if (!source) return null;
  const resolved = typeof source === 'function' ? source() : source;
  const getServices = resolved?.getPartitionServices;
  return typeof getServices === 'function' ? getServices.call(resolved) : resolved;
}

function normalizeEntryList(entry) {
  if (Array.isArray(entry)) return entry;
  return entry && typeof entry === 'object' ? [entry] : [];
}

function filterByPartitionId(candidates, partitionId) {
  return candidates.filter((candidate) => getCandidatePartitionId(candidate) === partitionId);
}

function collectMatchingServices(source, partitionId) {
  const container = unwrapPartitionServiceContainer(source);
  if (!container) return [];
  if (container instanceof Map) {
    const direct = normalizeEntryList(container.get(partitionId));
    if (direct.length > 0) return direct;
    return filterByPartitionId([...container.values()], partitionId);
  }
  if (Array.isArray(container)) {
    return filterByPartitionId(container, partitionId);
  }
  if (typeof container === 'object') {
    if (Object.hasOwn(container, partitionId)) {
      return normalizeEntryList(container[partitionId]);
    }
    if (getCandidatePartitionId(container) === partitionId) return [container];
    return filterByPartitionId(Object.values(container), partitionId);
  }
  return [];
}

function recordAndValidateExecutorCall(calls, call, enforceContract) {
  calls.push(call);
  if (!enforceContract) return null;
  if (call.preferLeader !== true || call.deliveryOptions.requireLeader !== true) {
    return adapterFailure(
      LEADER_REQUIREMENT_ERROR_CODE,
      `Partition ${call.forRead ? 'read' : 'write'} must require leader ` +
        '(preferLeader=true, deliveryOptions.requireLeader=true)',
    );
  }
  return null;
}

function normalizeExecutorCall(
  partitionId,
  sql,
  params,
  forRead,
  preferLeader,
  preferSameLatencyGroup,
  deliveryOptions,
) {
  const normalizedOptions = deliveryOptions && typeof deliveryOptions === 'object' ?
    {...deliveryOptions} :
    {};
  return {
    partitionId,
    sql,
    params: Array.isArray(params) ? params : [],
    forRead: Boolean(forRead),
    preferLeader,
    preferSameLatencyGroup,
    deliveryOptions: normalizedOptions,
  };
}

function buildRemotePartitionRequest(call) {
  const {sql, params, forRead, deliveryOptions} = call;
  const request = {
    sql,
    params,
    readonly: forRead,
    readOnly: forRead,
  };
  if (forRead) {
    request[LEADER_READ_REQUEST_FIELD] = LEADER_REQUIRED_READ;
  }
  if (deliveryOptions.tableName) {
    request.tableName = deliveryOptions.tableName;
  }
  if (deliveryOptions.expectedPartitionVersion !== undefined &&
      deliveryOptions.expectedPartitionVersion !== null) {
    request.expectedPartitionVersion = deliveryOptions.expectedPartitionVersion;
  }
  return request;
}

function resolveLeaderHandleRemoteQuery(partitionServicesSource, partitionId) {
  const services = collectMatchingServices(partitionServicesSource, partitionId);
  if (services.length === 0) {
    return {
      failure: adapterFailure(
        GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        `Partition service unavailable: ${partitionId}`,
      ),
    };
  }
  const leader = services.find(isLeaderService) || null;
  if (!leader) {
    return {
      failure: adapterFailure(
        NOT_LEADER_ERROR_CODE,
        `No leader available for partition ${partitionId}`,
      ),
    };
  }
  const handleRemoteQuery = leader.handleRemoteQuery;
  if (typeof handleRemoteQuery !== 'function') {
    return {
      failure: adapterFailure(
        GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        `Leader for ${partitionId} cannot handle remote queries`,
      ),
    };
  }
  return {leader, handleRemoteQuery};
}

function extractSqliteHandle(entry) {
  if (!entry) return null;
  const nestedPrepare = entry.db?.prepare;
  if (typeof nestedPrepare === 'function') return entry.db;
  const directPrepare = entry.prepare;
  return typeof directPrepare === 'function' ? entry : null;
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

function executeSqliteStatement(db, call, validateWriteVersion) {
  if (!call.forRead && validateWriteVersion) {
    const versionErr = validateWriteVersion(
      call.partitionId,
      call.deliveryOptions.expectedPartitionVersion,
    );
    if (versionErr) {
      return adapterFailure(STALE_PARTITION_VERSION_CODE, versionErr);
    }
  }
  const stmt = db.prepare(call.sql);
  if (call.forRead) {
    return {success: true, rows: stmt.all(...call.params)};
  }
  const info = stmt.run(...call.params);
  return {
    success: true,
    changes: info.changes ?? 0,
    lastInsertRowid: info.lastInsertRowid ?? null,
  };
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
    const call = normalizeExecutorCall(
      partitionId, sql, params, forRead, preferLeader, preferSameLatencyGroup, deliveryOptions,
    );
    const contractFailure = recordAndValidateExecutorCall(calls, call, enforceLeaderContract);
    if (contractFailure) return contractFailure;

    const resolved = resolveLeaderHandleRemoteQuery(partitionServicesSource, partitionId);
    if (resolved.failure) return resolved.failure;

    const rawResult = await resolved.handleRemoteQuery.call(
      resolved.leader,
      buildRemotePartitionRequest(call),
    );
    if (!rawResult || rawResult.success !== true) {
      return rawResult || adapterFailure(
        GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        `Empty remote query response for ${partitionId}`,
      );
    }
    return {
      ...rawResult,
      rows: decodePartitionResponseRows(rawResult).rows,
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
    const call = normalizeExecutorCall(
      partitionId, sql, params, forRead, preferLeader, preferSameLatencyGroup, deliveryOptions,
    );
    const contractFailure = recordAndValidateExecutorCall(calls, call, enforceLeaderContract);
    if (contractFailure) return contractFailure;

    if (!isLeaderFn(partitionId)) {
      return adapterFailure(NOT_LEADER_ERROR_CODE, `Partition ${partitionId} is not leader`);
    }
    const db = extractSqliteHandle(lookupDatabaseEntry(databasesByPartition, partitionId));
    if (!db) {
      return adapterFailure(
        GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
        `Partition database unavailable: ${partitionId}`,
      );
    }
    return executeSqliteStatement(db, call, validateWriteVersion);
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
