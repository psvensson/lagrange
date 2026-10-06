/**
 * Stateful SERVICES/PARTITIONS fixture for lifecycle-owner tests.
 *
 * Durable state and the CDC projection are deliberately separate. Mutations
 * apply through the same INSERT-only / full-predicate UPDATE and DELETE
 * contract as the production gateway; projection is an independently
 * controllable consequence rather than mutation authority.
 */
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';

const DEFAULT_NODE_ID = 'test-node';

function firstTruthy(...values) {
  return values.find(Boolean);
}

function firstDefined(...values) {
  const value = values.find(
    (candidate) => candidate !== null && candidate !== undefined,
  );
  return value === undefined ? values.at(-1) : value;
}

function cloneRow(row) {
  return row ? structuredClone(row) : null;
}

function rowKey(tableName, row) {
  return tableName === TABLES.SERVICES ? row?.service_id : row?.partition_id;
}

function predicateMatches(row, whereClause = {}) {
  return Boolean(row) && Object.entries(whereClause).every(
    ([field, value]) => row[field] === value,
  );
}

function appliedMutationResult(applied) {
  return {
    success: true,
    outcome: applied ? 'applied' : 'observed_state_changed',
    partitionResult: {affectedRows: applied ? 1 : 0},
  };
}

function handledFixtureResult(handled, result = null) {
  return {handled, result};
}

function resolveDeleteResultOnly(deleteBehavior) {
  return deleteBehavior?.resultOnly === true ?
    handledFixtureResult(true, deleteBehavior.result) :
    handledFixtureResult(false);
}

function resolveMutationBehaviorBeforeApply(behavior) {
  if (behavior?.unavailable === true) {
    throw behavior.error || new Error('fixture mutation unavailable');
  }
  return behavior?.zeroRow === true ?
    handledFixtureResult(true, appliedMutationResult(false)) :
    handledFixtureResult(false);
}

async function resolveDeleteBehaviorAfterApply(
  deleteBehavior,
  durable,
  mutation,
  applied,
) {
  await deleteBehavior?.afterApply?.(durable, mutation, applied);
  if (deleteBehavior?.throwAfterApply === true) {
    throw new Error('fixture delete acknowledgement lost');
  }
  return deleteBehavior?.result ?
    handledFixtureResult(true, deleteBehavior.result) :
    handledFixtureResult(false);
}

function throwLostMutationAcknowledgement(behavior) {
  if (behavior?.lostAcknowledgement !== true) return;
  throw behavior.error || new Error('fixture mutation acknowledgement lost');
}

function createLifecycleServiceRow(options = {}) {
  const replicaId = firstTruthy(
    options.replicaId,
    options.serviceId,
    'replica-1',
  );
  const serviceId = firstTruthy(options.serviceId, replicaId);
  const partitionId = firstTruthy(options.partitionId, 'partition-1');
  const nodeId = firstTruthy(options.nodeId, DEFAULT_NODE_ID);
  const createdAt = firstDefined(options.createdAt, options.version, 1);
  const stateEnteredAt = firstDefined(
    options.stateEnteredAt,
    options.version,
    createdAt,
  );
  const updatedAt = firstDefined(options.updatedAt, stateEnteredAt);
  return {
    service_id: serviceId,
    service_type: firstTruthy(options.serviceType, SERVICE_TYPE.PARTITION),
    node_id: nodeId,
    partition_id: partitionId,
    group_id: firstDefined(options.groupId, null),
    replica_id: firstDefined(options.replicaIdentity, replicaId),
    raft_role: firstDefined(options.raftRole, null),
    status: firstTruthy(options.status, 'active'),
    state_entered_at: stateEnteredAt,
    previous_state: firstDefined(options.previousState, null),
    address: firstTruthy(
      options.address,
      `${nodeId}/partition/${replicaId}`,
    ),
    cleanup_token: firstDefined(options.cleanupToken, null),
    create_attempt_token: firstDefined(options.createAttemptToken, null),
    trigger_reason: firstDefined(options.triggerReason, null),
    error_message: firstDefined(options.errorMessage, null),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function createPartitionRow(options = {}) {
  const partitionId = options.partitionId || 'partition-1';
  return {
    partition_id: partitionId,
    table_id: options.tableId || 'table-1',
    leader_node_id: options.leaderNodeId ?? options.nodeId ?? DEFAULT_NODE_ID,
    status: options.status || 'active',
    created_at: options.createdAt ?? 1,
    updated_at: options.updatedAt ?? options.createdAt ?? 1,
  };
}

function createCanonicalLifecycleServiceRow(sourceRow, index = 0) {
  const version = firstDefined(
    sourceRow.state_entered_at,
    sourceRow.updated_at,
    sourceRow.created_at,
    index + 1,
  );
  const cleanupMarker =
    sourceRow.service_type === SERVICE_TYPE.PARTITION_CLEANUP;
  const defaultReplicaId = cleanupMarker ? null : sourceRow.service_id;
  const defaultAddress = cleanupMarker ? null :
    `${firstTruthy(sourceRow.node_id, DEFAULT_NODE_ID)}/partition/` +
      `${sourceRow.service_id}`;
  return {
    ...sourceRow,
    ...(sourceRow.service_type === SERVICE_TYPE.PARTITION ?
      {group_id: firstDefined(sourceRow.group_id, null)} : {}),
    replica_id: firstDefined(sourceRow.replica_id, defaultReplicaId),
    address: firstDefined(sourceRow.address, defaultAddress),
    created_at: firstDefined(sourceRow.created_at, version),
    state_entered_at: version,
    updated_at: firstDefined(sourceRow.updated_at, version),
  };
}

function normalizeFixtureRow(tableName, sourceRow, index, options) {
  if (tableName !== TABLES.SERVICES ||
      options.preserveRowsExactly === true) {
    return sourceRow;
  }
  return createCanonicalLifecycleServiceRow(sourceRow, index);
}

function createFixtureTableMap(tableName, sourceRows, options) {
  return new Map(sourceRows.map((sourceRow, index) => {
    const row = normalizeFixtureRow(tableName, sourceRow, index, options);
    return [rowKey(tableName, row), cloneRow(row)];
  }));
}

function createTableMaps(rows = {}, options = {}) {
  return {
    [TABLES.SERVICES]: createFixtureTableMap(
      TABLES.SERVICES,
      rows[TABLES.SERVICES] || [],
      options,
    ),
    [TABLES.PARTITIONS]: createFixtureTableMap(
      TABLES.PARTITIONS,
      rows[TABLES.PARTITIONS] || [],
      options,
    ),
  };
}

function selectRows(tableName, sql, params, durable) {
  let rows = [...(durable[tableName]?.values() || [])];
  const positionalEqualityColumns = [...String(sql).matchAll(
    /\b([a-z][a-z0-9_]*)\s*=\s*\?(?!\d)/giu,
  )].map((match) => match[1].toLowerCase());
  if (positionalEqualityColumns.length > 0) {
    rows = rows.filter((row) => positionalEqualityColumns.every(
      (column, index) => row[column] === params[index],
    ));
  }
  return rows.map(cloneRow);
}

function createLifecycleStateStore(options = {}) {
  const initialRows = {
    [TABLES.SERVICES]: options.services || [],
    [TABLES.PARTITIONS]: options.partitions || [],
  };
  const durable = createTableMaps(initialRows, options);
  const projection = createTableMaps(initialRows, options);
  const mutations = [];
  const authoritativeReads = [];
  let projectionLagged = options.projectionLagged === true;
  let authoritativeReadAvailable = true;
  let beforeMutation = null;
  let beforeAuthoritativeRead = null;
  let nextMutationBehavior = null;
  let applyThenLoseAcknowledgementStatus = null;
  let nextDeleteBehavior = null;

  function projectMutation(mutation) {
    if (projectionLagged) return;
    const table = projection[mutation.tableName];
    const key = rowKey(
      mutation.tableName,
      mutation.row || mutation.whereClause || {},
    );
    if (mutation.operation === 'delete') {
      table.delete(key);
      return;
    }
    const durableRow = durable[mutation.tableName].get(key);
    if (durableRow) table.set(key, cloneRow(durableRow));
  }

  function applyMutation(mutation) {
    const table = durable[mutation.tableName];
    if (!table) return false;
    const identity = mutation.row || mutation.whereClause || {};
    const key = rowKey(mutation.tableName, identity);
    const current = table.get(key) || null;
    if (mutation.operation === 'insert') {
      if (current) return false;
      table.set(key, cloneRow(mutation.row));
      return true;
    }
    if (mutation.operation === 'upsert') {
      throw new Error('SERVICES lifecycle fixture forbids generic upsert');
    }
    if (!predicateMatches(current, mutation.whereClause)) return false;
    if (mutation.operation === 'delete') {
      table.delete(key);
    } else if (mutation.operation === 'update') {
      table.set(key, {...current, ...cloneRow(mutation.data)});
    } else {
      return false;
    }
    return true;
  }

  function takeDeleteBehavior(mutation) {
    if (mutation.operation !== 'delete') return null;
    const behavior = nextDeleteBehavior;
    nextDeleteBehavior = null;
    return behavior;
  }

  function takeMutationBehavior() {
    const behavior = nextMutationBehavior;
    nextMutationBehavior = null;
    return behavior;
  }

  function throwsLostAppliedAcknowledgement(mutation, applied) {
    const losesAcknowledgement = applied &&
      mutation.tableName === TABLES.SERVICES &&
      mutation.data?.status === applyThenLoseAcknowledgementStatus;
    if (losesAcknowledgement) applyThenLoseAcknowledgementStatus = null;
    return losesAcknowledgement;
  }

  async function submitMutation(mutation) {
    mutations.push(cloneRow(mutation));
    await beforeMutation?.(mutation, durable);
    const deleteBehavior = takeDeleteBehavior(mutation);
    const deleteResultOnly = resolveDeleteResultOnly(deleteBehavior);
    if (deleteResultOnly.handled) return deleteResultOnly.result;
    const behavior = takeMutationBehavior();
    const preApply = resolveMutationBehaviorBeforeApply(behavior);
    if (preApply.handled) return preApply.result;
    const applied = applyMutation(mutation);
    projectMutation(mutation);
    const postDelete = await resolveDeleteBehaviorAfterApply(
      deleteBehavior,
      durable,
      mutation,
      applied,
    );
    if (postDelete.handled) return postDelete.result;
    if (throwsLostAppliedAcknowledgement(mutation, applied)) {
      throw new Error('ack-lost-after-durable-apply');
    }
    throwLostMutationAcknowledgement(behavior);
    return behavior?.result || appliedMutationResult(applied);
  }

  async function readAuthoritativeRows(tableName, sql, params = [], readOptions = {}) {
    authoritativeReads.push({tableName, sql, params: cloneRow(params),
      options: cloneRow(readOptions)});
    await beforeAuthoritativeRead?.(tableName, params, durable);
    if (!authoritativeReadAvailable) {
      return {success: false, error: 'fixture authoritative read unavailable'};
    }
    return {success: true, rows: selectRows(tableName, sql, params, durable)};
  }

  const gateway = {
    submitMutation,
    readAuthoritativeRows,
    executeAuthoritativeSystemTableRead: readAuthoritativeRows,
    insertSystemTableRow(tableName, row) {
      return submitMutation({operation: 'insert', tableName, row});
    },
    updateSystemTableRow(tableName, whereClause, data) {
      return submitMutation({operation: 'update', tableName, whereClause, data});
    },
    deleteSystemTableRow(tableName, whereClause) {
      return submitMutation({operation: 'delete', tableName, whereClause});
    },
  };
  const cache = {
    get(tableName, key) {
      return cloneRow(projection[tableName]?.get(key));
    },
    filter(tableName, predicate = () => true) {
      return [...(projection[tableName]?.values() || [])]
        .map(cloneRow)
        .filter(predicate);
    },
    getAll(tableName) {
      return [...(projection[tableName]?.values() || [])].map(cloneRow);
    },
  };

  return {
    authoritativeReads,
    cache,
    durable,
    gateway,
    mutations,
    projection,
    adapters: Object.freeze({
      submitMutation,
      insertSystemTableRow: gateway.insertSystemTableRow.bind(gateway),
      updateSystemTableRow: gateway.updateSystemTableRow.bind(gateway),
      deleteSystemTableRow: gateway.deleteSystemTableRow.bind(gateway),
      readAuthoritativeRows,
      executeAuthoritativeSystemTableRead: readAuthoritativeRows,
    }),
    durableRow(tableName, key) {
      return cloneRow(durable[tableName]?.get(key));
    },
    project(tableName, row) {
      projection[tableName].set(rowKey(tableName, row), cloneRow(row));
    },
    removeProjection(tableName, key) {
      projection[tableName].delete(key);
    },
    flushProjection() {
      for (const tableName of [TABLES.SERVICES, TABLES.PARTITIONS]) {
        projection[tableName] = new Map(
          [...durable[tableName]].map(([key, row]) => [key, cloneRow(row)]),
        );
      }
    },
    setProjectionLagged(value = true) {
      projectionLagged = value === true;
    },
    setAuthoritativeReadAvailable(value = true) {
      authoritativeReadAvailable = value === true;
    },
    setBeforeMutation(hook) {
      beforeMutation = hook;
    },
    setBeforeAuthoritativeRead(hook) {
      beforeAuthoritativeRead = hook;
    },
    setNextMutationBehavior(behavior) {
      nextMutationBehavior = behavior;
    },
    setApplyThenThrowStatus(status) {
      applyThenLoseAcknowledgementStatus = status;
    },
    setNextDeleteBehavior(behavior) {
      nextDeleteBehavior = behavior;
    },
  };
}

function createRecordedMutationCall(type, tableName, whereClause, data) {
  return {
    type,
    operation: type,
    tableName,
    ...(whereClause ? {whereClause: cloneRow(whereClause)} : {}),
    ...(data ? {data: cloneRow(data)} : {}),
    timestamp: Date.now(),
  };
}

function mutationAffectedRows(result) {
  return firstDefined(
    result?.partitionResult?.affectedRows,
    result?.affectedRows,
    0,
  );
}

function mutationProjectionData(type, whereClause, data) {
  if (type === 'update') return {...whereClause, ...data};
  return type === 'delete' ? whereClause : data;
}

function projectRecordedMutation(options, call, whereClause, data, result) {
  if (!options.projectionCache || mutationAffectedRows(result) <= 0) return;
  options.projectionCache.applySystemTableChange(
    call.tableName,
    call.type.toUpperCase(),
    mutationProjectionData(call.type, whereClause, data),
  );
}

function createLifecycleCdcService(options = {}) {
  const store = options.store || createLifecycleStateStore(options);
  const calls = [];
  async function recordAndRun(type, tableName, whereClause, data, operation) {
    const call = createRecordedMutationCall(
      type,
      tableName,
      whereClause,
      data,
    );
    calls.push(call);
    options.onMutation?.(call);
    const result = await operation();
    projectRecordedMutation(options, call, whereClause, data, result);
    return result;
  }
  return {
    calls,
    operations: calls,
    store,
    executeAuthoritativeSystemTableRead:
      store.adapters.executeAuthoritativeSystemTableRead,
    readAuthoritativeRows: store.adapters.readAuthoritativeRows,
    insertSystemTableRow(tableName, row) {
      return recordAndRun('insert', tableName, null, row, () =>
        store.adapters.insertSystemTableRow(tableName, row));
    },
    updateSystemTableRow(tableName, whereClause, data) {
      return recordAndRun('update', tableName, whereClause, data, () =>
        store.adapters.updateSystemTableRow(tableName, whereClause, data));
    },
    deleteSystemTableRow(tableName, whereClause) {
      return recordAndRun('delete', tableName, whereClause, null, () =>
        store.adapters.deleteSystemTableRow(tableName, whereClause));
    },
    async upsertSystemTableRow(tableName) {
      throw new Error(`Fixture forbids generic ${tableName} upsert`);
    },
    reset() {
      calls.length = 0;
    },
  };
}

function createLifecycleCdcServiceForCache(cache, options = {}) {
  const readRows = (tableName) => {
    if (typeof cache?.getAll === 'function') {
      return cache.getAll(tableName) || [];
    }
    return cache?.filter?.(tableName, () => true) || [];
  };
  return createLifecycleCdcService({
    ...options,
    services: options.services || readRows(TABLES.SERVICES),
    partitions: options.partitions || readRows(TABLES.PARTITIONS),
    projectionCache: cache,
  });
}

function readCacheRows(cache, tableName) {
  if (typeof cache?.getAll === 'function') {
    return cache.getAll(tableName) || [];
  }
  return cache?.filter?.(tableName, () => true) || [];
}

function projectGatewayMutation(cache, mutation, result) {
  if (!cache || mutationAffectedRows(result) <= 0) return;
  const operation = mutation.operation.toUpperCase();
  const data = mutation.operation === 'insert' ? mutation.row :
    mutationProjectionData(
      mutation.operation,
      mutation.whereClause,
      mutation.data,
    );
  cache.applySystemTableChange(mutation.tableName, operation, data);
}

function createLifecycleControlPlaneGatewayForCache(cache, options = {}) {
  const store = options.store || createLifecycleStateStore({
    services: readCacheRows(cache, TABLES.SERVICES),
    partitions: readCacheRows(cache, TABLES.PARTITIONS),
  });
  return {
    store,
    readAuthoritativeRows: store.adapters.readAuthoritativeRows,
    async submitMutation(mutation, mutationOptions = {}) {
      await options.beforeMutation?.(mutation, mutationOptions, store);
      const result = await store.adapters.submitMutation(mutation);
      projectGatewayMutation(cache, mutation, result);
      await options.afterMutation?.(mutation, result, store);
      return result;
    },
  };
}

function createReplicaLifecycleStateMachineFixture(
  overrides = {},
  options = {},
) {
  const store = options.store || createLifecycleStateStore(options);
  return {
    getState() {
      return null;
    },
    async observeAuthoritativeReplicaLifecycle(replicaId) {
      return {
        available: true,
        row: store.durableRow(TABLES.SERVICES, replicaId),
      };
    },
    ...overrides,
  };
}

export {
  appliedMutationResult,
  cloneRow,
  createCanonicalLifecycleServiceRow,
  createLifecycleServiceRow,
  createLifecycleStateStore,
  createLifecycleCdcService,
  createLifecycleCdcServiceForCache,
  createLifecycleControlPlaneGatewayForCache,
  createReplicaLifecycleStateMachineFixture,
  createPartitionRow,
};
