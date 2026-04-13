/**
 * Partition Callback Dispatcher
 *
 * Resolves target partitions from a callback select query and constructs
 * per-partition batches. Reuses the existing PartitionResolver and
 * QueryExecutor — no duplicate partition resolution logic.
 *
 * Ownership: partition batch preparation for partition_callback mode.
 * Callback invocation is handled downstream by Callback_Execution_Host
 * (wired in task 13.3).
 *
 * Requirements: 5.2, 14.2
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { LoggingService } from '../../logging/logging-service.js';
import { ADAPTER_ERROR_MSG, ADAPTER_LOG_MSG } from '../sql-adapter-constants.js';
import { QUERY_AST_TYPE } from '../query-constants.js';
const SUBSYSTEM = stryMutAct_9fa48("110048") ? "" : (stryCov_9fa48("110048"), 'partition-callback-dispatcher');

/**
 * Dispatches a partition_callback SqlRequest by resolving target
 * partitions from the select statement and executing per-partition
 * queries to produce batched results.
 */
class PartitionCallbackDispatcher {
  /**
   * @param {object} deps
   * @param {object} deps.sqlParser - SQL parser (has .parse(sql))
   * @param {object} deps.partitionResolver - PartitionResolver instance
   * @param {object} deps.queryExecutor - QueryExecutor instance
   * @param {Function} deps.getTablePartitions - fn(tableName) => []
   * @param {Function} deps.isSystemTable - fn(tableName) => boolean
   */
  constructor(deps) {
    if (stryMutAct_9fa48("110049")) {
      {}
    } else {
      stryCov_9fa48("110049");
      this.sqlParser = deps.sqlParser;
      this.partitionResolver = deps.partitionResolver;
      this.queryExecutor = deps.queryExecutor;
      this.getTablePartitions = deps.getTablePartitions;
      this.isSystemTable = deps.isSystemTable;
      this.logger = this.initLogger();
    }
  }

  /**
   * Initialize logger with fallback to console.
   * @return {object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("110050")) {
      {}
    } else {
      stryCov_9fa48("110050");
      try {
        if (stryMutAct_9fa48("110051")) {
          {}
        } else {
          stryCov_9fa48("110051");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("110053") ? false : stryMutAct_9fa48("110052") ? true : (stryCov_9fa48("110052", "110053"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("110054")) {
              {}
            } else {
              stryCov_9fa48("110054");
              return loggingService.forSubsystem(SUBSYSTEM);
            }
          }
        }
      } catch (logErr) {
        if (stryMutAct_9fa48("110055")) {
          {}
        } else {
          stryCov_9fa48("110055");
          console.warn(ADAPTER_LOG_MSG.LOGGING_INIT_FAILED, logErr);
        }
      }
      return console;
    }
  }

  /**
   * Resolve partitions and build per-partition row batches for a
   * partition_callback SqlRequest.
   *
   * @param {object} sqlRequest - Canonical SqlRequest with
   *   executionMode = partition_callback
   * @returns {Promise<object>} Result with per-partition batches:
   *   { success, batches: [{partitionId, rows}, ...],
   *     callbackModuleRef, callbackExport, executionMode }
   */
  async dispatch(sqlRequest) {
    if (stryMutAct_9fa48("110056")) {
      {}
    } else {
      stryCov_9fa48("110056");
      const {
        statement,
        parameters,
        callbackModuleRef,
        callbackExport
      } = sqlRequest;

      // 1. Parse the select statement into an AST
      const ast = this.sqlParser.parse(statement);
      const astType = stryMutAct_9fa48("110057") ? String(ast?.type || '').toLowerCase() : (stryCov_9fa48("110057"), String(stryMutAct_9fa48("110060") ? ast?.type && '' : stryMutAct_9fa48("110059") ? false : stryMutAct_9fa48("110058") ? true : (stryCov_9fa48("110058", "110059", "110060"), (stryMutAct_9fa48("110061") ? ast.type : (stryCov_9fa48("110061"), ast?.type)) || (stryMutAct_9fa48("110062") ? "Stryker was here!" : (stryCov_9fa48("110062"), '')))).toUpperCase());
      if (stryMutAct_9fa48("110065") ? astType === QUERY_AST_TYPE.SELECT : stryMutAct_9fa48("110064") ? false : stryMutAct_9fa48("110063") ? true : (stryCov_9fa48("110063", "110064", "110065"), astType !== QUERY_AST_TYPE.SELECT)) {
        if (stryMutAct_9fa48("110066")) {
          {}
        } else {
          stryCov_9fa48("110066");
          throw new Error(ADAPTER_ERROR_MSG.PARTITION_CALLBACK_SELECT_ONLY);
        }
      }
      if (stryMutAct_9fa48("110069") ? (!ast || !ast.from) && !ast.from.name : stryMutAct_9fa48("110068") ? false : stryMutAct_9fa48("110067") ? true : (stryCov_9fa48("110067", "110068", "110069"), (stryMutAct_9fa48("110071") ? !ast && !ast.from : stryMutAct_9fa48("110070") ? false : (stryCov_9fa48("110070", "110071"), (stryMutAct_9fa48("110072") ? ast : (stryCov_9fa48("110072"), !ast)) || (stryMutAct_9fa48("110073") ? ast.from : (stryCov_9fa48("110073"), !ast.from)))) || (stryMutAct_9fa48("110074") ? ast.from.name : (stryCov_9fa48("110074"), !ast.from.name)))) {
        if (stryMutAct_9fa48("110075")) {
          {}
        } else {
          stryCov_9fa48("110075");
          throw new Error(ADAPTER_ERROR_MSG.PARTITION_CALLBACK_NO_TABLE);
        }
      }
      const tableName = ast.from.name;

      // 2. Get all partitions for the table (reuses engine helper)
      const partitions = this.getTablePartitions(tableName);
      if (stryMutAct_9fa48("110078") ? partitions.length !== 0 : stryMutAct_9fa48("110077") ? false : stryMutAct_9fa48("110076") ? true : (stryCov_9fa48("110076", "110077", "110078"), partitions.length === 0)) {
        if (stryMutAct_9fa48("110079")) {
          {}
        } else {
          stryCov_9fa48("110079");
          throw new Error(ADAPTER_ERROR_MSG.PARTITION_CALLBACK_NO_PARTITIONS);
        }
      }

      // 3. Resolve which partitions the WHERE clause targets
      const partitionIds = this.partitionResolver.resolvePartitions(tableName, ast.where, partitions);
      this.logger.debug(ADAPTER_LOG_MSG.PARTITION_CALLBACK_RESOLVED, stryMutAct_9fa48("110080") ? {} : (stryCov_9fa48("110080"), {
        tableName,
        totalPartitions: partitions.length,
        targetPartitions: partitionIds.length,
        callbackModuleRef
      }));

      // 4. Build SQL from AST and execute per-partition via QueryExecutor
      const preferLeader = this.isSystemTable(tableName);
      const sql = this.queryExecutor.buildSelectSQL(ast);
      const perPartitionResults = await Promise.all(partitionIds.map(stryMutAct_9fa48("110081") ? () => undefined : (stryCov_9fa48("110081"), partitionId => this.queryExecutor.executeOnPartition(partitionId, sql, parameters, stryMutAct_9fa48("110082") ? false : (stryCov_9fa48("110082"), true),
      // forRead
      preferLeader))));

      // 5. Construct per-partition batches (only successful partitions)
      const batches = stryMutAct_9fa48("110083") ? ["Stryker was here"] : (stryCov_9fa48("110083"), []);
      for (const result of perPartitionResults) {
        if (stryMutAct_9fa48("110084")) {
          {}
        } else {
          stryCov_9fa48("110084");
          if (stryMutAct_9fa48("110086") ? false : stryMutAct_9fa48("110085") ? true : (stryCov_9fa48("110085", "110086"), result.success)) {
            if (stryMutAct_9fa48("110087")) {
              {}
            } else {
              stryCov_9fa48("110087");
              batches.push(stryMutAct_9fa48("110088") ? {} : (stryCov_9fa48("110088"), {
                partitionId: result.partitionId,
                rows: result.rows
              }));
            }
          }
        }
      }
      this.logger.debug(ADAPTER_LOG_MSG.PARTITION_CALLBACK_BATCHED, stryMutAct_9fa48("110089") ? {} : (stryCov_9fa48("110089"), {
        totalBatches: batches.length,
        totalRows: batches.reduce(stryMutAct_9fa48("110090") ? () => undefined : (stryCov_9fa48("110090"), (sum, b) => stryMutAct_9fa48("110091") ? sum - b.rows.length : (stryCov_9fa48("110091"), sum + b.rows.length)), 0),
        callbackModuleRef,
        callbackExport
      }));
      return stryMutAct_9fa48("110092") ? {} : (stryCov_9fa48("110092"), {
        success: stryMutAct_9fa48("110093") ? false : (stryCov_9fa48("110093"), true),
        batches,
        callbackModuleRef,
        callbackExport
      });
    }
  }
}
export { PartitionCallbackDispatcher };