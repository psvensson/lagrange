/**
 * SqlQueryLoopRuntimeModule — lifecycle-capable native JS module that
 * periodically issues a configured SQL statement through the
 * service-scoped query executor injected by ServiceRuntimeLifecycle.
 *
 * This is the generic building block for deployed services whose job
 * is to QUERY the cluster (the service↔data affinity placement epic's
 * Tier-3 demo deploys it with the movielens top-10 SELECT): because
 * every statement runs through the injected executor, it carries
 * `issuingServiceId`, so read-locality routing and service↔partition
 * access attribution engage exactly as they would for any deployed
 * service.
 *
 * runtime_config (JSON): {
 *   sql: string,          // required, the statement to issue
 *   params?: Array,       // optional bind parameters
 *   intervalMs?: number,  // optional cadence, default 1000
 *   reduce?: {            // optional in-service reduction of the rows
 *     groupBy: string,    //   group rows by this column
 *     aggregate: string,  //   'avg' | 'sum' | 'count'
 *     valueColumn?: string, // aggregated column (avg/sum)
 *     limit: number,      //   keep the top-N groups by aggregate desc
 *   },
 *   resultTable?: string  // optional sink: each cycle the reduced
 *                         // top-N replaces the rows of this table
 *                         // (columns: rank INTEGER PRIMARY KEY,
 *                         // group_key, agg_value, computed_at) —
 *                         // written through the SAME service-scoped
 *                         // executor, so the service's output writes
 *                         // are attributed like its reads
 *   parallelReduce?: {    // optional cross-replica reduce mode
 *     shardSqlBySlot: Object, // stable leased slot -> disjoint SQL
 *     coordinationTable: string, // slot lease + atomic partial snapshot
 *     leaseMs: number,
 *     coordinatorSlot: number,
 *     resultId: string,
 *     resultSnapshotColumn: string // owner-published partial witness
 *   }
 * }
 *
 * The ordinary reduce runs inside each service replica. In
 * parallelReduce mode, each replica runs one disjoint group-key shard,
 * publishes only its partial top-N, and the configured coordinator
 * merges at most replicas×N candidates. The shard contract requires a
 * group key to occur in exactly one shard, making the bounded top-N
 * merge exact rather than approximate.
 *
 * The query loop is shutdown-aware: stop() cancels the pending sleep
 * timer AND wakes the awaited sleep so the loop exits promptly after
 * any in-flight statement resolves (awaited sleeps are never unref'd —
 * see testing-guidelines/harness.md).
 */

import {
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from './runtime-driver.js';
import {
  acquireReduceSlot,
  isValidParallelReduceConfig,
  mergeDisjointPartialRows,
  publishPartialSnapshot,
  publishResultSnapshot,
  readSlotRows,
  releaseReduceSlot,
  resolveCompletePartialSnapshot,
  UNASSIGNED_SLOT_ID,
} from './sql-query-loop-parallel-reduce.js';

const SQL_QUERY_LOOP_RUNTIME_REF = 'sql-query-loop-runtime';

const SQL_QUERY_LOOP_CONFIG_FIELD = Object.freeze({
  SQL: 'sql',
  PARAMS: 'params',
  INTERVAL_MS: 'intervalMs',
  REDUCE: 'reduce',
  RESULT_TABLE: 'resultTable',
  PARALLEL_REDUCE: 'parallelReduce',
});

const SQL_QUERY_LOOP_AGGREGATE = Object.freeze({
  AVG: 'avg',
  SUM: 'sum',
  COUNT: 'count',
  CONFIDENCE_ADJUSTED_AVG: 'confidence_adjusted_avg',
});

const SQL_QUERY_LOOP_DEFAULT = Object.freeze({
  INTERVAL_MS: 1000,
});

const SQL_QUERY_LOOP_SQL = Object.freeze({
  VALUES_SEPARATOR: ', ',
});

const SQL_QUERY_LOOP_ERROR = Object.freeze({
  DEFINITION_REQUIRED: 'service definition is required',
  CONFIG_INVALID: 'sql-query-loop runtime_config invalid',
  SQL_REQUIRED: 'runtime_config.sql must be a non-empty string',
  PARAMS_INVALID: 'runtime_config.params must be an array when present',
  INTERVAL_INVALID:
    'runtime_config.intervalMs must be a positive number when present',
  REPLICA_CONTEXT_REQUIRED: 'replicaContext is required',
  SERVICE_ID_REQUIRED: 'replicaContext.serviceId is required',
  QUERY_EXECUTOR_REQUIRED:
    'replicaContext.queryExecutor is required (injected by ' +
    'ServiceRuntimeLifecycle when the SQL engine wires the factory)',
  INTERNAL_QUERY_EXECUTOR_REQUIRED:
    'parallel reduce requires queryExecutor.executeInternal for ' +
    'non-attributed coordination SQL',
  NOT_PREPARED: 'module has not been prepared for this service',
  REDUCE_INVALID:
    'runtime_config.reduce must contain groupBy, aggregate ' +
    'avg|sum|count|confidence_adjusted_avg, valueColumn when needed, ' +
    'limit > 0, and valid confidence parameters when present',
  RESULT_TABLE_INVALID:
    'runtime_config.resultTable must be a non-empty string and ' +
    'requires runtime_config.reduce',
  PARALLEL_REDUCE_INVALID:
    'runtime_config.parallelReduce must contain non-empty ' +
    'shardSqlBySlot, coordinationTable, resultId, resultSnapshotColumn, ' +
    'leaseMs, and a valid coordinatorSlot; it ' +
    'requires reduce and resultTable',
});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function hasValidReduceValueColumn(reduce) {
  return reduce.aggregate === SQL_QUERY_LOOP_AGGREGATE.COUNT ||
    isNonEmptyString(reduce.valueColumn);
}

function hasValidConfidenceParameters(reduce) {
  const priorWeightValid =
    Number.isFinite(reduce.priorWeight) && reduce.priorWeight > 0;
  const confidencePenaltyValid =
    Number.isFinite(reduce.confidencePenalty) &&
    reduce.confidencePenalty >= 0;
  return Number.isFinite(reduce.priorMean) &&
    priorWeightValid &&
    confidencePenaltyValid;
}

function isValidReduceShape(reduce) {
  if (!reduce || typeof reduce !== 'object') {
    return false;
  }
  if (!isNonEmptyString(reduce.groupBy) ||
      !Number.isInteger(reduce.limit) || reduce.limit <= 0) {
    return false;
  }
  if (!Object.values(SQL_QUERY_LOOP_AGGREGATE).includes(reduce.aggregate)) {
    return false;
  }
  if (!hasValidReduceValueColumn(reduce)) {
    return false;
  }
  if (reduce.aggregate !==
      SQL_QUERY_LOOP_AGGREGATE.CONFIDENCE_ADJUSTED_AVG) {
    return true;
  }
  return hasValidConfidenceParameters(reduce);
}

function validateReduceConfig(parsed) {
  const reduce = parsed[SQL_QUERY_LOOP_CONFIG_FIELD.REDUCE];
  const resultTable = parsed[SQL_QUERY_LOOP_CONFIG_FIELD.RESULT_TABLE];
  if (resultTable !== undefined &&
      (!isNonEmptyString(resultTable) || reduce === undefined)) {
    return SQL_QUERY_LOOP_ERROR.RESULT_TABLE_INVALID;
  }
  if (reduce !== undefined && !isValidReduceShape(reduce)) {
    return SQL_QUERY_LOOP_ERROR.REDUCE_INVALID;
  }
  const parallel = parsed[SQL_QUERY_LOOP_CONFIG_FIELD.PARALLEL_REDUCE];
  if (parallel === undefined) {
    return null;
  }
  return Boolean(reduce) &&
    isValidParallelReduceConfig(parallel, resultTable) ?
    null :
    SQL_QUERY_LOOP_ERROR.PARALLEL_REDUCE_INVALID;
}

// In-service reduction: group -> aggregate -> top-N descending.
function computeReduction(rows, reduce) {
  const groups = new Map();
  for (const row of rows) {
    const key = row?.[reduce.groupBy];
    if (key === undefined || key === null) {
      continue;
    }
    const entry = groups.get(key) || {count: 0, sum: 0};
    entry.count += 1;
    const value = Number(row?.[reduce.valueColumn]);
    if (Number.isFinite(value)) {
      entry.sum += value;
    }
    groups.set(key, entry);
  }
  const aggregateOf = (entry) => {
    if (reduce.aggregate === SQL_QUERY_LOOP_AGGREGATE.COUNT) {
      return entry.count;
    }
    if (reduce.aggregate === SQL_QUERY_LOOP_AGGREGATE.SUM) {
      return entry.sum;
    }
    const average = entry.count > 0 ? entry.sum / entry.count : 0;
    if (reduce.aggregate !==
        SQL_QUERY_LOOP_AGGREGATE.CONFIDENCE_ADJUSTED_AVG) {
      return average;
    }
    const bayesianMean =
      (entry.sum + reduce.priorMean * reduce.priorWeight) /
      (entry.count + reduce.priorWeight);
    return bayesianMean -
      reduce.confidencePenalty / Math.sqrt(entry.count);
  };
  return [...groups.entries()]
    .map(([key, entry]) => ({groupKey: key, aggValue: aggregateOf(entry)}))
    .sort(compareReducedRows)
    .slice(0, reduce.limit);
}

function compareReducedRows(left, right) {
  const aggregateOrder = right.aggValue - left.aggValue;
  if (aggregateOrder !== 0) {
    return aggregateOrder;
  }
  return String(left.groupKey).localeCompare(
    String(right.groupKey), undefined, {numeric: true},
  );
}

function sqlLiteral(value) {
  return typeof value === 'number' && Number.isFinite(value) ?
    String(value) :
    `'${String(value).replace(/'/g, '\'\'')}'`;
}

async function writeReducedRows(queryExecutor, resultTable, reduced) {
  await queryExecutor(`DELETE FROM ${resultTable}`, []);
  if (reduced.length === 0) {
    return;
  }
  const now = Date.now();
  const values = [];
  for (let rank = 0; rank < reduced.length; rank += 1) {
    const row = reduced[rank];
    values.push(
      `(${rank + 1}, ${sqlLiteral(row.groupKey)}, ` +
      `${sqlLiteral(row.aggValue)}, ${now})`);
  }
  await queryExecutor(
    `INSERT INTO ${resultTable} ` +
    '(rank, group_key, agg_value, computed_at) VALUES ' +
    values.join(SQL_QUERY_LOOP_SQL.VALUES_SEPARATOR),
    [],
  );
}

function parseRawRuntimeConfig(definition) {
  const raw = definition.runtimeConfig ?? definition.runtime_config;
  if (raw && typeof raw === 'string') {
    try {
      return {parsed: JSON.parse(raw)};
    } catch (_error) {
      return {error: SQL_QUERY_LOOP_ERROR.CONFIG_INVALID};
    }
  }
  if (raw && typeof raw === 'object') {
    return {parsed: raw};
  }
  return {parsed: {}};
}

function validateParsedConfig(parsed) {
  const sql = parsed[SQL_QUERY_LOOP_CONFIG_FIELD.SQL];
  if (typeof sql !== 'string' || sql.length === 0) {
    return SQL_QUERY_LOOP_ERROR.SQL_REQUIRED;
  }
  const params = parsed[SQL_QUERY_LOOP_CONFIG_FIELD.PARAMS];
  if (params !== undefined && !Array.isArray(params)) {
    return SQL_QUERY_LOOP_ERROR.PARAMS_INVALID;
  }
  const intervalMs = parsed[SQL_QUERY_LOOP_CONFIG_FIELD.INTERVAL_MS];
  if (
    intervalMs !== undefined &&
    (!Number.isFinite(intervalMs) || intervalMs <= 0)
  ) {
    return SQL_QUERY_LOOP_ERROR.INTERVAL_INVALID;
  }
  return validateReduceConfig(parsed);
}

function parseRuntimeConfig(definition) {
  const {parsed, error} = parseRawRuntimeConfig(definition);
  if (error) {
    return {valid: false, error};
  }
  const validationError = validateParsedConfig(parsed);
  if (validationError) {
    return {valid: false, error: validationError};
  }
  return {
    valid: true,
    config: {
      sql: parsed[SQL_QUERY_LOOP_CONFIG_FIELD.SQL],
      params: parsed[SQL_QUERY_LOOP_CONFIG_FIELD.PARAMS] || [],
      intervalMs: parsed[SQL_QUERY_LOOP_CONFIG_FIELD.INTERVAL_MS] ||
        SQL_QUERY_LOOP_DEFAULT.INTERVAL_MS,
      reduce: parsed[SQL_QUERY_LOOP_CONFIG_FIELD.REDUCE] || null,
      resultTable:
        parsed[SQL_QUERY_LOOP_CONFIG_FIELD.RESULT_TABLE] || null,
      parallelReduce:
        parsed[SQL_QUERY_LOOP_CONFIG_FIELD.PARALLEL_REDUCE] || null,
    },
  };
}

function resolveServiceId(contextLike) {
  return contextLike?.serviceId ?? contextLike?.service_id ?? null;
}

class SqlQueryLoopRuntimeModule {
  constructor() {
    /** @type {Map<string, Object>} Prepared config by serviceId */
    this._prepared = new Map();

    /** @type {Map<string, Object>} Running loop state by serviceId */
    this._running = new Map();
  }

  /**
   * Validate runtime config and prepare the module for a service.
   * @param {Object} definition - The service definition.
   * @param {Object} [_context] - Preparation context (unused).
   * @return {Promise<{status: string, error?: string}>}
   */
  async prepare(definition, _context) {
    if (!definition || typeof definition !== 'object') {
      return {
        status: PREPARE_STATUS.FAILED,
        error: SQL_QUERY_LOOP_ERROR.DEFINITION_REQUIRED,
      };
    }
    const parsed = parseRuntimeConfig(definition);
    if (!parsed.valid) {
      return {status: PREPARE_STATUS.FAILED, error: parsed.error};
    }
    const serviceId = resolveServiceId(definition);
    this._prepared.set(serviceId, {config: parsed.config});
    return {status: PREPARE_STATUS.READY};
  }

  /**
   * Start the query loop for a replica.
   * @param {Object} replicaContext - Must include {serviceId,
   *   queryExecutor}.
   * @return {Promise<{status: string, error?: string}>}
   */
  async start(replicaContext) {
    if (!replicaContext || typeof replicaContext !== 'object') {
      return {
        status: START_STATUS.FAILED,
        error: SQL_QUERY_LOOP_ERROR.REPLICA_CONTEXT_REQUIRED,
      };
    }
    const serviceId = resolveServiceId(replicaContext);
    if (!serviceId) {
      return {
        status: START_STATUS.FAILED,
        error: SQL_QUERY_LOOP_ERROR.SERVICE_ID_REQUIRED,
      };
    }
    const prepared = this._prepared.get(serviceId);
    if (!prepared) {
      return {
        status: START_STATUS.FAILED,
        error: SQL_QUERY_LOOP_ERROR.NOT_PREPARED,
      };
    }
    if (typeof replicaContext.queryExecutor !== 'function') {
      return {
        status: START_STATUS.FAILED,
        error: SQL_QUERY_LOOP_ERROR.QUERY_EXECUTOR_REQUIRED,
      };
    }
    if (prepared.config.parallelReduce &&
        typeof replicaContext.queryExecutor.executeInternal !== 'function') {
      return {
        status: START_STATUS.FAILED,
        error: SQL_QUERY_LOOP_ERROR.INTERNAL_QUERY_EXECUTOR_REQUIRED,
      };
    }
    const existing = this._running.get(serviceId);
    if (existing && !existing.stopped) {
      return {status: START_STATUS.RUNNING};
    }
    const state = {
      stopped: false,
      timer: null,
      wake: null,
      queriesIssued: 0,
      queryErrors: 0,
      lastError: null,
      lastReducedRows: 0,
      lastScannedRows: 0,
      partialRowsPublished: 0,
      mergeCandidates: 0,
      slotId: UNASSIGNED_SLOT_ID,
      queryExecutor: replicaContext.queryExecutor,
      coordinationExecutor:
        replicaContext.queryExecutor.executeInternal || null,
      config: prepared.config,
      serviceId,
      loopPromise: null,
    };
    this._running.set(serviceId, state);
    state.loopPromise = this.runQueryLoop(
      state,
      replicaContext.queryExecutor,
      {...prepared.config, serviceId},
    );
    return {status: START_STATUS.RUNNING};
  }

  /**
   * The shutdown-aware query loop.
   * @param {Object} state - Running state for one replica.
   * @param {Function} queryExecutor - Injected service-scoped executor.
   * @param {Object} config - Parsed runtime config.
   * @return {Promise<void>}
   * @private
   */
  async runQueryLoop(state, queryExecutor, config) {
    while (!state.stopped) {
      try {
        let executionSql = config.sql;
        if (config.parallelReduce) {
          const slot = await acquireReduceSlot(
            state.slotId,
            state.coordinationExecutor,
            config.parallelReduce,
            config.serviceId,
          );
          state.slotId = slot ?
            Number(slot.slot_id) :
            UNASSIGNED_SLOT_ID;
          if (!slot) {
            await this.waitForNextCycle(state, config.intervalMs);
            continue;
          }
          executionSql = config.parallelReduce
            .shardSqlBySlot[String(state.slotId)];
        }
        const result = await queryExecutor(
          executionSql, config.params,
        );
        if (result?.success === false) {
          state.queryErrors += 1;
          state.lastError = result.error ?? null;
        } else {
          state.queriesIssued += 1;
          await this.maybeReduceAndSink(
            state, queryExecutor, config, result,
          );
        }
      } catch (error) {
        state.queryErrors += 1;
        state.lastError = error?.message ?? null;
      }
      await this.waitForNextCycle(state, config.intervalMs);
    }
  }

  async waitForNextCycle(state, intervalMs) {
    if (state.stopped) {
      return;
    }
    await new Promise((resolve) => {
      state.wake = resolve;
      state.timer = setTimeout(resolve, intervalMs);
    });
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = false;
    }
    state.wake = false;
  }

  /**
   * Reduce the scanned rows in-service and replace the result table.
   * @param {Object} state - Running state for one replica.
   * @param {Function} queryExecutor - Injected service-scoped executor.
   * @param {Object} config - Parsed runtime config.
   * @param {Object} result - Successful scan result.
   * @return {Promise<void>}
   * @private
   */
  async maybeReduceAndSink(state, queryExecutor, config, result) {
    if (!config.reduce) {
      return;
    }
    const rows = result?.results || result?.rows || [];
    state.lastScannedRows = rows.length;
    const reduced = computeReduction(rows, config.reduce);
    state.lastReducedRows = reduced.length;
    if (config.parallelReduce) {
      await this.publishAndMergeParallelReduction(
        state, config, reduced,
      );
    } else if (config.resultTable && reduced.length > 0) {
      await writeReducedRows(queryExecutor, config.resultTable, reduced);
    }
  }

  async publishAndMergeParallelReduction(
    state, config, reduced,
  ) {
    const parallel = config.parallelReduce;
    await publishPartialSnapshot(
      state.coordinationExecutor,
      parallel,
      config.serviceId,
      state.slotId,
      reduced,
    );
    state.partialRowsPublished = reduced.length;
    if (state.slotId !== parallel.coordinatorSlot) {
      return;
    }
    const slotRows = await readSlotRows(
      state.coordinationExecutor, parallel.coordinationTable,
    );
    const snapshot = resolveCompletePartialSnapshot(
      slotRows, parallel, config.reduce.limit, Date.now(),
    );
    if (!snapshot.complete) {
      return;
    }
    state.mergeCandidates = snapshot.candidates.length;
    await publishResultSnapshot(
      state.coordinationExecutor,
      config.resultTable,
      parallel.resultId,
      snapshot.merged,
      parallel.resultSnapshotColumn,
      snapshot.witness,
    );
  }

  /**
   * Stop the query loop for a replica. Idempotent.
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<void>}
   */
  async stop(replicaContext) {
    const serviceId = resolveServiceId(replicaContext);
    if (!serviceId) {
      return;
    }
    const state = this._running.get(serviceId);
    if (state) {
      state.stopped = true;
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      if (state.wake) {
        state.wake();
        state.wake = null;
      }
      if (state.config.parallelReduce) {
        await releaseReduceSlot(
          state.slotId,
          state.coordinationExecutor,
          state.config.parallelReduce,
          serviceId,
        );
        state.slotId = UNASSIGNED_SLOT_ID;
      }
      this._running.delete(serviceId);
    }
    this._prepared.delete(serviceId);
  }

  /**
   * Report loop health and issue counters.
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, queriesIssued?: number,
   *   queryErrors?: number, lastError?: string}>}
   */
  async health(replicaContext) {
    const serviceId = resolveServiceId(replicaContext);
    const state = serviceId ? this._running.get(serviceId) : null;
    if (!state || state.stopped) {
      return {status: HEALTH_STATUS.UNHEALTHY};
    }
    return {
      status: HEALTH_STATUS.HEALTHY,
      queriesIssued: state.queriesIssued,
      queryErrors: state.queryErrors,
      lastError: state.lastError,
      lastReducedRows: state.lastReducedRows,
      lastScannedRows: state.lastScannedRows,
      partialRowsPublished: state.partialRowsPublished,
      mergeCandidates: state.mergeCandidates,
    };
  }
}

export {
  SQL_QUERY_LOOP_RUNTIME_REF,
  SqlQueryLoopRuntimeModule,
  computeReduction,
  mergeDisjointPartialRows,
};
