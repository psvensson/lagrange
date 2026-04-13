/**
 * Callback_Execution_Host — single invocation surface for
 * partition callback execution.
 *
 * This is the ONLY callback invocation path. No parallel
 * callback executor is allowed outside this host.
 *
 * Contract:
 * 1. Validate callback descriptor and runtime selection
 * 2. Invoke callback for each partition batch using the
 *    selected runtime driver
 * 3. Apply budget/cancellation checks before and after
 *    each batch invocation
 * 4. Attach lineage IDs and consult dedupe registry on
 *    retries
 * 5. Return structured per-partition batch results
 *
 * Requirements: 1.3, 14.2, 14.3
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
import { NUM, TIME_MS, TYPEOF, METRICS_LOG_TAG } from '../../constants/index.js';
import { LoggingService } from '../../logging/logging-service.js';
import { ADAPTER_ERROR_MSG, ADAPTER_LOG_MSG, CALLBACK_RUNTIME_KIND } from '../sql-adapter-constants.js';
import { STAGE_STATE, STAGE_RESULT_FIELD as SF, CALLBACK_TELEMETRY_EVENT as CTE, CALLBACK_TELEMETRY_FIELD as CTF, CALLBACK_HOST_ARTIFACT_TYPE, CALLBACK_BATCH_ARTIFACT_TYPE, BYTE_ESTIMATE_MULTIPLIER } from './callback-stage-constants.js';
import { buildCallbackContext } from './callback-context.js';
import { DebugEmitter } from '../../debug/debug-emitter.js';
import { DEBUG_TRACE_SOURCE } from '../../debug/debug-constants.js';
const SUBSYSTEM = stryMutAct_9fa48("109270") ? "" : (stryCov_9fa48("109270"), 'callback-execution-host');

/**
 * Set of runtime kinds supported for callback execution.
 * oci_container is feature-gated and rejected by default.
 * @type {Set<string>}
 */
const SUPPORTED_RUNTIME_KINDS = new Set(stryMutAct_9fa48("109271") ? [] : (stryCov_9fa48("109271"), [CALLBACK_RUNTIME_KIND.NATIVE_JS, CALLBACK_RUNTIME_KIND.WASM_COMPONENT, CALLBACK_RUNTIME_KIND.OCI_CONTAINER]));

/**
 * Validate a callback descriptor has required fields.
 *
 * @param {object} descriptor - Callback descriptor.
 * @throws {Error} If descriptor is invalid.
 */
function validateDescriptor(descriptor) {
  if (stryMutAct_9fa48("109272")) {
    {}
  } else {
    stryCov_9fa48("109272");
    if (stryMutAct_9fa48("109275") ? false : stryMutAct_9fa48("109274") ? true : stryMutAct_9fa48("109273") ? descriptor : (stryCov_9fa48("109273", "109274", "109275"), !descriptor)) {
      if (stryMutAct_9fa48("109276")) {
        {}
      } else {
        stryCov_9fa48("109276");
        throw new Error(ADAPTER_ERROR_MSG.CALLBACK_HOST_DESCRIPTOR_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("109279") ? false : stryMutAct_9fa48("109278") ? true : stryMutAct_9fa48("109277") ? descriptor.callbackModuleRef : (stryCov_9fa48("109277", "109278", "109279"), !descriptor.callbackModuleRef)) {
      if (stryMutAct_9fa48("109280")) {
        {}
      } else {
        stryCov_9fa48("109280");
        throw new Error(ADAPTER_ERROR_MSG.CALLBACK_HOST_MODULE_REF_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("109283") ? false : stryMutAct_9fa48("109282") ? true : stryMutAct_9fa48("109281") ? descriptor.callbackExport : (stryCov_9fa48("109281", "109282", "109283"), !descriptor.callbackExport)) {
      if (stryMutAct_9fa48("109284")) {
        {}
      } else {
        stryCov_9fa48("109284");
        throw new Error(ADAPTER_ERROR_MSG.CALLBACK_HOST_EXPORT_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("109287") ? false : stryMutAct_9fa48("109286") ? true : stryMutAct_9fa48("109285") ? descriptor.runtimeKind : (stryCov_9fa48("109285", "109286", "109287"), !descriptor.runtimeKind)) {
      if (stryMutAct_9fa48("109288")) {
        {}
      } else {
        stryCov_9fa48("109288");
        throw new Error(ADAPTER_ERROR_MSG.CALLBACK_HOST_RUNTIME_KIND_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("109291") ? false : stryMutAct_9fa48("109290") ? true : stryMutAct_9fa48("109289") ? SUPPORTED_RUNTIME_KINDS.has(descriptor.runtimeKind) : (stryCov_9fa48("109289", "109290", "109291"), !SUPPORTED_RUNTIME_KINDS.has(descriptor.runtimeKind))) {
      if (stryMutAct_9fa48("109292")) {
        {}
      } else {
        stryCov_9fa48("109292");
        throw new Error(stryMutAct_9fa48("109293") ? ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME - descriptor.runtimeKind : (stryCov_9fa48("109293"), ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME + descriptor.runtimeKind));
      }
    }
  }
}

/**
 * Callback_Execution_Host — the single callback invocation
 * surface for partition_callback execution mode.
 *
 * Reuses runtime-driver ownership for callback invocation
 * instead of creating a parallel callback engine.
 */
class CallbackExecutionHost {
  /**
   * @param {object} deps
   * @param {object} [deps.budgetEnforcer] - BudgetEnforcer
   *   instance for pre/post invocation budget checks.
   * @param {object} [deps.lineageTracker] - LineageTracker
   *   instance for attaching lineage IDs.
   * @param {object} [deps.dedupeRegistry] - DedupeRegistry
   *   instance for retry deduplication.
   * @param {object} [deps.cancellationToken] - Token for
   *   cooperative cancellation and timeout propagation.
   * @param {number} [deps.stageIndex=0] - Stage index for
   *   lineage ID generation.
   * @param {object} [deps.runtimeDriverRegistry] - Registry
   *   mapping runtime kinds to driver instances.
   * @param {import('../execution-context.js').ExecutionContext}
   *   [deps.executionContext] - Parent execution context for
   *   building bounded callback contexts with primitives and
   *   nested-call guardrails (Requirement 14.4).
   * @param {import('../plan-diagnostics.js').PlanDiagnostics}
   *   [deps.planDiagnostics] - Optional diagnostics collector
   *   for nested call classification decisions.
   * @param {Function} [deps.onTelemetry] - Telemetry callback
   *   invoked with per-batch and aggregate telemetry events.
   *   Follows the same onTelemetry pattern used by lookup,
   *   emit, and broadcast primitives.
   */
  constructor(deps = {}) {
    if (stryMutAct_9fa48("109294")) {
      {}
    } else {
      stryCov_9fa48("109294");
      this.budgetEnforcer = stryMutAct_9fa48("109297") ? deps.budgetEnforcer && null : stryMutAct_9fa48("109296") ? false : stryMutAct_9fa48("109295") ? true : (stryCov_9fa48("109295", "109296", "109297"), deps.budgetEnforcer || null);
      this.lineageTracker = stryMutAct_9fa48("109300") ? deps.lineageTracker && null : stryMutAct_9fa48("109299") ? false : stryMutAct_9fa48("109298") ? true : (stryCov_9fa48("109298", "109299", "109300"), deps.lineageTracker || null);
      this.dedupeRegistry = stryMutAct_9fa48("109303") ? deps.dedupeRegistry && null : stryMutAct_9fa48("109302") ? false : stryMutAct_9fa48("109301") ? true : (stryCov_9fa48("109301", "109302", "109303"), deps.dedupeRegistry || null);
      this.cancellationToken = stryMutAct_9fa48("109306") ? deps.cancellationToken && null : stryMutAct_9fa48("109305") ? false : stryMutAct_9fa48("109304") ? true : (stryCov_9fa48("109304", "109305", "109306"), deps.cancellationToken || null);
      this.stageIndex = stryMutAct_9fa48("109307") ? deps.stageIndex && NUM.ZERO : (stryCov_9fa48("109307"), deps.stageIndex ?? NUM.ZERO);
      this.runtimeDriverRegistry = stryMutAct_9fa48("109310") ? deps.runtimeDriverRegistry && null : stryMutAct_9fa48("109309") ? false : stryMutAct_9fa48("109308") ? true : (stryCov_9fa48("109308", "109309", "109310"), deps.runtimeDriverRegistry || null);
      this.executionContext = stryMutAct_9fa48("109313") ? deps.executionContext && null : stryMutAct_9fa48("109312") ? false : stryMutAct_9fa48("109311") ? true : (stryCov_9fa48("109311", "109312", "109313"), deps.executionContext || null);
      this.planDiagnostics = stryMutAct_9fa48("109316") ? deps.planDiagnostics && null : stryMutAct_9fa48("109315") ? false : stryMutAct_9fa48("109314") ? true : (stryCov_9fa48("109314", "109315", "109316"), deps.planDiagnostics || null);
      this.onTelemetry = stryMutAct_9fa48("109319") ? deps.onTelemetry && null : stryMutAct_9fa48("109318") ? false : stryMutAct_9fa48("109317") ? true : (stryCov_9fa48("109317", "109318", "109319"), deps.onTelemetry || null);
      this.debugSessionResolver = stryMutAct_9fa48("109322") ? deps.debugSessionResolver && null : stryMutAct_9fa48("109321") ? false : stryMutAct_9fa48("109320") ? true : (stryCov_9fa48("109320", "109321", "109322"), deps.debugSessionResolver || null);
      this.traceCollector = stryMutAct_9fa48("109325") ? deps.traceCollector && null : stryMutAct_9fa48("109324") ? false : stryMutAct_9fa48("109323") ? true : (stryCov_9fa48("109323", "109324", "109325"), deps.traceCollector || null);
      this.nodeId = stryMutAct_9fa48("109328") ? deps.nodeId && null : stryMutAct_9fa48("109327") ? false : stryMutAct_9fa48("109326") ? true : (stryCov_9fa48("109326", "109327", "109328"), deps.nodeId || null);
      this.serviceDefinitionId = stryMutAct_9fa48("109331") ? deps.serviceDefinitionId && null : stryMutAct_9fa48("109330") ? false : stryMutAct_9fa48("109329") ? true : (stryCov_9fa48("109329", "109330", "109331"), deps.serviceDefinitionId || null);
      this.replicaId = stryMutAct_9fa48("109334") ? deps.replicaId && null : stryMutAct_9fa48("109333") ? false : stryMutAct_9fa48("109332") ? true : (stryCov_9fa48("109332", "109333", "109334"), deps.replicaId || null);
      this.logger = this._initLogger();
    }
  }

  /**
   * Initialize logger with fallback to console.
   * @return {object} Logger instance.
   * @private
   */
  _initLogger() {
    if (stryMutAct_9fa48("109335")) {
      {}
    } else {
      stryCov_9fa48("109335");
      try {
        if (stryMutAct_9fa48("109336")) {
          {}
        } else {
          stryCov_9fa48("109336");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("109338") ? false : stryMutAct_9fa48("109337") ? true : (stryCov_9fa48("109337", "109338"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("109339")) {
              {}
            } else {
              stryCov_9fa48("109339");
              return loggingService.forSubsystem(SUBSYSTEM);
            }
          }
        }
      } catch (logErr) {
        if (stryMutAct_9fa48("109340")) {
          {}
        } else {
          stryCov_9fa48("109340");
          console.warn(ADAPTER_LOG_MSG.CALLBACK_HOST_INIT_LOGGER_FAILED, logErr);
        }
      }
      return console;
    }
  }

  /**
   * Execute callback on each partition batch through the
   * single invocation contract.
   *
   * @param {Array<object>} batches - Per-partition batches,
   *   each with {partitionId, rows}.
   * @param {object} descriptor - Callback descriptor:
   *   {callbackModuleRef, callbackExport, runtimeKind}.
   * @param {object} [options] - Execution options forwarded
   *   to the runtime driver.
   * @return {Promise<object>} Aggregated result with
   *   per-partition results, state, and counts.
   */
  async execute(batches, descriptor, options = {}) {
    if (stryMutAct_9fa48("109341")) {
      {}
    } else {
      stryCov_9fa48("109341");
      // 1. Validate inputs
      if (stryMutAct_9fa48("109344") ? !batches && !Array.isArray(batches) : stryMutAct_9fa48("109343") ? false : stryMutAct_9fa48("109342") ? true : (stryCov_9fa48("109342", "109343", "109344"), (stryMutAct_9fa48("109345") ? batches : (stryCov_9fa48("109345"), !batches)) || (stryMutAct_9fa48("109346") ? Array.isArray(batches) : (stryCov_9fa48("109346"), !Array.isArray(batches))))) {
        if (stryMutAct_9fa48("109347")) {
          {}
        } else {
          stryCov_9fa48("109347");
          throw new Error(ADAPTER_ERROR_MSG.CALLBACK_HOST_BATCHES_REQUIRED);
        }
      }
      validateDescriptor(descriptor);

      // 2. Check cancellation before starting
      if (stryMutAct_9fa48("109349") ? false : stryMutAct_9fa48("109348") ? true : (stryCov_9fa48("109348", "109349"), this._isCancelled())) {
        if (stryMutAct_9fa48("109350")) {
          {}
        } else {
          stryCov_9fa48("109350");
          const cancelResult = this._buildCancelledResult(batches);
          this._emitTelemetry(stryMutAct_9fa48("109351") ? {} : (stryCov_9fa48("109351"), {
            [CTF.EVENT_TYPE]: CTE.CANCELLED,
            [CTF.TOTAL_BATCHES]: NUM.ZERO,
            [CTF.TOTAL_ROWS]: NUM.ZERO,
            [CTF.TOTAL_BYTES]: NUM.ZERO,
            [CTF.TOTAL_DURATION_MS]: NUM.ZERO,
            [CTF.STATE]: STAGE_STATE.CANCELLED
          }));
          return cancelResult;
        }
      }

      // 3. Check budget before starting
      this._checkBudget();
      this.logger.debug(ADAPTER_LOG_MSG.CALLBACK_HOST_EXECUTING, stryMutAct_9fa48("109352") ? {} : (stryCov_9fa48("109352"), {
        batchCount: batches.length,
        callbackModuleRef: descriptor.callbackModuleRef,
        callbackExport: descriptor.callbackExport,
        runtimeKind: descriptor.runtimeKind
      }));

      // 4. Process each batch sequentially
      const partitionResults = stryMutAct_9fa48("109353") ? ["Stryker was here"] : (stryCov_9fa48("109353"), []);
      let hasFailure = stryMutAct_9fa48("109354") ? true : (stryCov_9fa48("109354"), false);
      let wasCancelled = stryMutAct_9fa48("109355") ? true : (stryCov_9fa48("109355"), false);
      let totalRows = NUM.ZERO;
      let totalBytes = NUM.ZERO;
      let totalDurationMs = NUM.ZERO;
      for (let i = NUM.ZERO; stryMutAct_9fa48("109358") ? i >= batches.length : stryMutAct_9fa48("109357") ? i <= batches.length : stryMutAct_9fa48("109356") ? false : (stryCov_9fa48("109356", "109357", "109358"), i < batches.length); stryMutAct_9fa48("109359") ? i-- : (stryCov_9fa48("109359"), i++)) {
        if (stryMutAct_9fa48("109360")) {
          {}
        } else {
          stryCov_9fa48("109360");
          if (stryMutAct_9fa48("109362") ? false : stryMutAct_9fa48("109361") ? true : (stryCov_9fa48("109361", "109362"), this._isCancelled())) {
            if (stryMutAct_9fa48("109363")) {
              {}
            } else {
              stryCov_9fa48("109363");
              wasCancelled = stryMutAct_9fa48("109364") ? false : (stryCov_9fa48("109364"), true);
              break;
            }
          }
          const result = await this._executeBatch(batches[i], descriptor, options, i);
          if (stryMutAct_9fa48("109367") ? result[SF.STATE] !== STAGE_STATE.CANCELLED : stryMutAct_9fa48("109366") ? false : stryMutAct_9fa48("109365") ? true : (stryCov_9fa48("109365", "109366", "109367"), result[SF.STATE] === STAGE_STATE.CANCELLED)) {
            if (stryMutAct_9fa48("109368")) {
              {}
            } else {
              stryCov_9fa48("109368");
              wasCancelled = stryMutAct_9fa48("109369") ? false : (stryCov_9fa48("109369"), true);
              partitionResults.push(result);
              break;
            }
          }
          stryMutAct_9fa48("109370") ? totalRows -= result[SF.ROW_COUNT] || NUM.ZERO : (stryCov_9fa48("109370"), totalRows += stryMutAct_9fa48("109373") ? result[SF.ROW_COUNT] && NUM.ZERO : stryMutAct_9fa48("109372") ? false : stryMutAct_9fa48("109371") ? true : (stryCov_9fa48("109371", "109372", "109373"), result[SF.ROW_COUNT] || NUM.ZERO));
          stryMutAct_9fa48("109374") ? totalBytes -= result.byteEstimate || NUM.ZERO : (stryCov_9fa48("109374"), totalBytes += stryMutAct_9fa48("109377") ? result.byteEstimate && NUM.ZERO : stryMutAct_9fa48("109376") ? false : stryMutAct_9fa48("109375") ? true : (stryCov_9fa48("109375", "109376", "109377"), result.byteEstimate || NUM.ZERO));
          stryMutAct_9fa48("109378") ? totalDurationMs -= result[SF.DURATION_MS] || NUM.ZERO : (stryCov_9fa48("109378"), totalDurationMs += stryMutAct_9fa48("109381") ? result[SF.DURATION_MS] && NUM.ZERO : stryMutAct_9fa48("109380") ? false : stryMutAct_9fa48("109379") ? true : (stryCov_9fa48("109379", "109380", "109381"), result[SF.DURATION_MS] || NUM.ZERO));
          partitionResults.push(result);
          if (stryMutAct_9fa48("109384") ? result[SF.STATE] !== STAGE_STATE.FAILED : stryMutAct_9fa48("109383") ? false : stryMutAct_9fa48("109382") ? true : (stryCov_9fa48("109382", "109383", "109384"), result[SF.STATE] === STAGE_STATE.FAILED)) {
            if (stryMutAct_9fa48("109385")) {
              {}
            } else {
              stryCov_9fa48("109385");
              hasFailure = stryMutAct_9fa48("109386") ? false : (stryCov_9fa48("109386"), true);
            }
          }
        }
      }

      // 5. Determine aggregate state
      const state = wasCancelled ? STAGE_STATE.CANCELLED : hasFailure ? STAGE_STATE.FAILED : STAGE_STATE.COMPLETED;
      const stageResult = stryMutAct_9fa48("109387") ? {} : (stryCov_9fa48("109387"), {
        partitionResults,
        [SF.STATE]: state,
        totalPartitions: batches.length,
        processedPartitions: partitionResults.length,
        failedPartitions: stryMutAct_9fa48("109388") ? partitionResults.length : (stryCov_9fa48("109388"), partitionResults.filter(stryMutAct_9fa48("109389") ? () => undefined : (stryCov_9fa48("109389"), r => stryMutAct_9fa48("109392") ? r[SF.STATE] !== STAGE_STATE.FAILED : stryMutAct_9fa48("109391") ? false : stryMutAct_9fa48("109390") ? true : (stryCov_9fa48("109390", "109391", "109392"), r[SF.STATE] === STAGE_STATE.FAILED))).length),
        totalRows,
        totalBytes,
        totalDurationMs
      });

      // Emit aggregate throughput metrics
      try {
        if (stryMutAct_9fa48("109393")) {
          {}
        } else {
          stryCov_9fa48("109393");
          this.logger.info(METRICS_LOG_TAG.CALLBACK_THROUGHPUT, stryMutAct_9fa48("109394") ? {} : (stryCov_9fa48("109394"), {
            batchCount: batches.length,
            totalRows,
            totalBytes,
            totalDurationMs,
            rowsPerSecond: (stryMutAct_9fa48("109398") ? totalDurationMs <= 0 : stryMutAct_9fa48("109397") ? totalDurationMs >= 0 : stryMutAct_9fa48("109396") ? false : stryMutAct_9fa48("109395") ? true : (stryCov_9fa48("109395", "109396", "109397", "109398"), totalDurationMs > 0)) ? Math.round(stryMutAct_9fa48("109399") ? totalRows * (totalDurationMs / TIME_MS.SECOND) : (stryCov_9fa48("109399"), totalRows / (stryMutAct_9fa48("109400") ? totalDurationMs * TIME_MS.SECOND : (stryCov_9fa48("109400"), totalDurationMs / TIME_MS.SECOND)))) : 0,
            avgBatchDurationMs: (stryMutAct_9fa48("109404") ? batches.length <= 0 : stryMutAct_9fa48("109403") ? batches.length >= 0 : stryMutAct_9fa48("109402") ? false : stryMutAct_9fa48("109401") ? true : (stryCov_9fa48("109401", "109402", "109403", "109404"), batches.length > 0)) ? Math.round(stryMutAct_9fa48("109405") ? totalDurationMs * batches.length : (stryCov_9fa48("109405"), totalDurationMs / batches.length)) : 0,
            failedPartitions: stageResult.failedPartitions
          }));
        }
      } catch (metricsErr) {
        if (stryMutAct_9fa48("109406")) {
          {}
        } else {
          stryCov_9fa48("109406");
          this.logger.warn(ADAPTER_LOG_MSG.CALLBACK_HOST_METRICS_FAILED, metricsErr);
        }
      }

      // Attach lineage to aggregate result
      if (stryMutAct_9fa48("109408") ? false : stryMutAct_9fa48("109407") ? true : (stryCov_9fa48("109407", "109408"), this.lineageTracker)) {
        if (stryMutAct_9fa48("109409")) {
          {}
        } else {
          stryCov_9fa48("109409");
          this.lineageTracker.attachLineage(stageResult, this.stageIndex, CALLBACK_HOST_ARTIFACT_TYPE, NUM.ZERO);
        }
      }

      // Emit aggregate telemetry
      this._emitTelemetry(stryMutAct_9fa48("109410") ? {} : (stryCov_9fa48("109410"), {
        [CTF.EVENT_TYPE]: wasCancelled ? CTE.CANCELLED : CTE.EXECUTION_COMPLETE,
        [CTF.TOTAL_BATCHES]: partitionResults.length,
        [CTF.TOTAL_ROWS]: totalRows,
        [CTF.TOTAL_BYTES]: totalBytes,
        [CTF.TOTAL_DURATION_MS]: totalDurationMs,
        [CTF.STATE]: state
      }));
      this.logger.debug(ADAPTER_LOG_MSG.CALLBACK_HOST_COMPLETE, stryMutAct_9fa48("109411") ? {} : (stryCov_9fa48("109411"), {
        state,
        totalPartitions: batches.length,
        processedPartitions: partitionResults.length
      }));
      return stageResult;
    }
  }

  /**
   * Execute callback on a single partition batch.
   *
   * Checks dedupe registry before invocation. Attaches
   * lineage IDs and registers results for retry safety.
   *
   * @param {object} batch - {partitionId, rows}.
   * @param {object} descriptor - Callback descriptor.
   * @param {object} options - Execution options.
   * @param {number} batchIndex - Index of this batch.
   * @return {Promise<object>} Per-partition result.
   * @private
   */
  async _executeBatch(batch, descriptor, options, batchIndex) {
    if (stryMutAct_9fa48("109412")) {
      {}
    } else {
      stryCov_9fa48("109412");
      const lineageId = this._batchLineageId(batchIndex);
      const partitionId = batch.partitionId;

      // Dedupe check: skip if already processed on retry
      if (stryMutAct_9fa48("109415") ? lineageId || this.dedupeRegistry : stryMutAct_9fa48("109414") ? false : stryMutAct_9fa48("109413") ? true : (stryCov_9fa48("109413", "109414", "109415"), lineageId && this.dedupeRegistry)) {
        if (stryMutAct_9fa48("109416")) {
          {}
        } else {
          stryCov_9fa48("109416");
          const stageId = String(this.stageIndex);
          if (stryMutAct_9fa48("109418") ? false : stryMutAct_9fa48("109417") ? true : (stryCov_9fa48("109417", "109418"), this.dedupeRegistry.isDuplicate(lineageId, stageId))) {
            if (stryMutAct_9fa48("109419")) {
              {}
            } else {
              stryCov_9fa48("109419");
              this._emitTelemetry(stryMutAct_9fa48("109420") ? {} : (stryCov_9fa48("109420"), {
                [CTF.EVENT_TYPE]: CTE.DEDUPE_SKIP,
                [CTF.PARTITION_ID]: partitionId,
                [CTF.BATCH_INDEX]: batchIndex
              }));
              return this.dedupeRegistry.getResult(lineageId, stageId);
            }
          }
        }
      }

      // Pre-invocation budget check
      this._checkBudget();
      const startTime = Date.now();
      try {
        if (stryMutAct_9fa48("109421")) {
          {}
        } else {
          stryCov_9fa48("109421");
          // Invoke callback through runtime driver interface.
          const rows = await this._invokeCallback(batch, descriptor, options, batchIndex);

          // Post-invocation cancellation check
          if (stryMutAct_9fa48("109423") ? false : stryMutAct_9fa48("109422") ? true : (stryCov_9fa48("109422", "109423"), this._isCancelled())) {
            if (stryMutAct_9fa48("109424")) {
              {}
            } else {
              stryCov_9fa48("109424");
              const duration = stryMutAct_9fa48("109425") ? Date.now() + startTime : (stryCov_9fa48("109425"), Date.now() - startTime);
              return this._cancelledBatchResult(partitionId, duration);
            }
          }

          // Post-invocation budget check
          this._checkBudget();
          const duration = stryMutAct_9fa48("109426") ? Date.now() + startTime : (stryCov_9fa48("109426"), Date.now() - startTime);
          const rowArr = Array.isArray(rows) ? rows : stryMutAct_9fa48("109427") ? ["Stryker was here"] : (stryCov_9fa48("109427"), []);
          const byteEstimate = this._estimateBytes(rowArr);

          // Record output bytes in budget enforcer
          if (stryMutAct_9fa48("109430") ? this.budgetEnforcer || byteEstimate > NUM.ZERO : stryMutAct_9fa48("109429") ? false : stryMutAct_9fa48("109428") ? true : (stryCov_9fa48("109428", "109429", "109430"), this.budgetEnforcer && (stryMutAct_9fa48("109433") ? byteEstimate <= NUM.ZERO : stryMutAct_9fa48("109432") ? byteEstimate >= NUM.ZERO : stryMutAct_9fa48("109431") ? true : (stryCov_9fa48("109431", "109432", "109433"), byteEstimate > NUM.ZERO)))) {
            if (stryMutAct_9fa48("109434")) {
              {}
            } else {
              stryCov_9fa48("109434");
              this.budgetEnforcer.recordOutBytes(byteEstimate);
            }
          }
          const result = stryMutAct_9fa48("109435") ? {} : (stryCov_9fa48("109435"), {
            [SF.PARTITION_ID]: partitionId,
            [SF.ROWS]: rowArr,
            [SF.ROW_COUNT]: rowArr.length,
            [SF.STATE]: STAGE_STATE.COMPLETED,
            [SF.ERROR]: null,
            [SF.DURATION_MS]: duration,
            byteEstimate
          });

          // Attach lineage to batch result
          if (stryMutAct_9fa48("109437") ? false : stryMutAct_9fa48("109436") ? true : (stryCov_9fa48("109436", "109437"), this.lineageTracker)) {
            if (stryMutAct_9fa48("109438")) {
              {}
            } else {
              stryCov_9fa48("109438");
              this.lineageTracker.attachLineage(result, this.stageIndex, CALLBACK_BATCH_ARTIFACT_TYPE, batchIndex);
            }
          }

          // Register in dedupe registry for retry safety
          this._registerDedupe(result, batchIndex);

          // Emit per-batch telemetry
          this._emitTelemetry(stryMutAct_9fa48("109439") ? {} : (stryCov_9fa48("109439"), {
            [CTF.EVENT_TYPE]: CTE.BATCH_COMPLETE,
            [CTF.PARTITION_ID]: partitionId,
            [CTF.BATCH_INDEX]: batchIndex,
            [CTF.ROW_COUNT]: rowArr.length,
            [CTF.BYTE_ESTIMATE]: byteEstimate,
            [CTF.DURATION_MS]: duration
          }));
          this.logger.debug(ADAPTER_LOG_MSG.CALLBACK_HOST_BATCH_COMPLETE, stryMutAct_9fa48("109440") ? {} : (stryCov_9fa48("109440"), {
            partitionId,
            rowCount: result[SF.ROW_COUNT],
            durationMs: duration
          }));
          return result;
        }
      } catch (err) {
        if (stryMutAct_9fa48("109441")) {
          {}
        } else {
          stryCov_9fa48("109441");
          const duration = stryMutAct_9fa48("109442") ? Date.now() + startTime : (stryCov_9fa48("109442"), Date.now() - startTime);
          if (stryMutAct_9fa48("109444") ? false : stryMutAct_9fa48("109443") ? true : (stryCov_9fa48("109443", "109444"), this._isCancelled())) {
            if (stryMutAct_9fa48("109445")) {
              {}
            } else {
              stryCov_9fa48("109445");
              return this._cancelledBatchResult(partitionId, duration);
            }
          }

          // Emit failure telemetry
          this._emitTelemetry(stryMutAct_9fa48("109446") ? {} : (stryCov_9fa48("109446"), {
            [CTF.EVENT_TYPE]: CTE.BATCH_FAILED,
            [CTF.PARTITION_ID]: partitionId,
            [CTF.BATCH_INDEX]: batchIndex,
            [CTF.DURATION_MS]: duration,
            [CTF.ERROR]: err.message
          }));
          this.logger.debug(ADAPTER_LOG_MSG.CALLBACK_HOST_BATCH_FAILED, stryMutAct_9fa48("109447") ? {} : (stryCov_9fa48("109447"), {
            partitionId,
            error: err.message,
            durationMs: duration
          }));
          return stryMutAct_9fa48("109448") ? {} : (stryCov_9fa48("109448"), {
            [SF.PARTITION_ID]: partitionId,
            [SF.ROWS]: stryMutAct_9fa48("109449") ? ["Stryker was here"] : (stryCov_9fa48("109449"), []),
            [SF.ROW_COUNT]: NUM.ZERO,
            [SF.STATE]: STAGE_STATE.FAILED,
            [SF.ERROR]: err.message,
            [SF.DURATION_MS]: duration,
            byteEstimate: NUM.ZERO
          });
        }
      }
    }
  }

  /**
   * Invoke the callback through the runtime driver interface.
   *
   * Uses the runtime driver registry as the single
   * invocation path. No fallback handler path is allowed.
   *
   * @param {object} batch - {partitionId, rows}.
   * @param {object} descriptor - Callback descriptor.
   * @param {object} options - Execution options.
   * @param {number} batchIndex - Batch index.
   * @return {Promise<Array>} Result rows from callback.
   * @private
   */
  async _invokeCallback(batch, descriptor, options, batchIndex) {
    if (stryMutAct_9fa48("109450")) {
      {}
    } else {
      stryCov_9fa48("109450");
      if (stryMutAct_9fa48("109452") ? false : stryMutAct_9fa48("109451") ? true : (stryCov_9fa48("109451", "109452"), this.runtimeDriverRegistry)) {
        if (stryMutAct_9fa48("109453")) {
          {}
        } else {
          stryCov_9fa48("109453");
          const driver = this.runtimeDriverRegistry.getDriver(descriptor.runtimeKind);

          // Build bounded callback context when an execution
          // context is available. This ensures callback handlers
          // receive the same primitive surface (lookup, emit,
          // broadcast, out) and nested-call guardrails as stage
          // runtime handlers (Requirement 14.4).
          let callbackCtx = null;
          const debugScope = stryMutAct_9fa48("109454") ? {} : (stryCov_9fa48("109454"), {
            lineageId: this._batchLineageId(batchIndex),
            stageId: this.stageIndex,
            partitionId: batch.partitionId,
            callbackExport: descriptor.callbackExport,
            serviceDefinitionId: stryMutAct_9fa48("109457") ? (options?.serviceDefinitionId || this.serviceDefinitionId) && null : stryMutAct_9fa48("109456") ? false : stryMutAct_9fa48("109455") ? true : (stryCov_9fa48("109455", "109456", "109457"), (stryMutAct_9fa48("109459") ? options?.serviceDefinitionId && this.serviceDefinitionId : stryMutAct_9fa48("109458") ? false : (stryCov_9fa48("109458", "109459"), (stryMutAct_9fa48("109460") ? options.serviceDefinitionId : (stryCov_9fa48("109460"), options?.serviceDefinitionId)) || this.serviceDefinitionId)) || null),
            nodeId: stryMutAct_9fa48("109463") ? (options?.nodeId || this.nodeId) && null : stryMutAct_9fa48("109462") ? false : stryMutAct_9fa48("109461") ? true : (stryCov_9fa48("109461", "109462", "109463"), (stryMutAct_9fa48("109465") ? options?.nodeId && this.nodeId : stryMutAct_9fa48("109464") ? false : (stryCov_9fa48("109464", "109465"), (stryMutAct_9fa48("109466") ? options.nodeId : (stryCov_9fa48("109466"), options?.nodeId)) || this.nodeId)) || null),
            replicaId: stryMutAct_9fa48("109469") ? (options?.replicaId || this.replicaId) && null : stryMutAct_9fa48("109468") ? false : stryMutAct_9fa48("109467") ? true : (stryCov_9fa48("109467", "109468", "109469"), (stryMutAct_9fa48("109471") ? options?.replicaId && this.replicaId : stryMutAct_9fa48("109470") ? false : (stryCov_9fa48("109470", "109471"), (stryMutAct_9fa48("109472") ? options.replicaId : (stryCov_9fa48("109472"), options?.replicaId)) || this.replicaId)) || null),
            runtimeKind: descriptor.runtimeKind,
            source: DEBUG_TRACE_SOURCE.PARTITION_CALLBACK
          });
          const traceApi = this._buildTraceApi(debugScope, descriptor);
          if (stryMutAct_9fa48("109474") ? false : stryMutAct_9fa48("109473") ? true : (stryCov_9fa48("109473", "109474"), this.executionContext)) {
            if (stryMutAct_9fa48("109475")) {
              {}
            } else {
              stryCov_9fa48("109475");
              callbackCtx = buildCallbackContext(this.executionContext, this.planDiagnostics, traceApi);
            }
          }
          const debugApi = traceApi ? stryMutAct_9fa48("109476") ? {} : (stryCov_9fa48("109476"), {
            trace: traceApi.trace
          }) : null;
          return driver.invokeCallback(batch, descriptor, stryMutAct_9fa48("109477") ? {} : (stryCov_9fa48("109477"), {
            ...options,
            callbackContext: callbackCtx,
            debugScope,
            debug: debugApi
          }));
        }
      }

      // No runtime driver registry — cannot invoke.
      // The registry is the single owner for runtime-kind
      // selection; no fallback handler path exists.
      throw new Error(stryMutAct_9fa48("109478") ? ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME - descriptor.runtimeKind : (stryCov_9fa48("109478"), ADAPTER_ERROR_MSG.CALLBACK_HOST_UNSUPPORTED_RUNTIME + descriptor.runtimeKind));
    }
  }

  /**
   * Build callback trace API when tracing is active.
   * @param {Object} debugScope
   * @param {Object} descriptor
   * @return {Object|null}
   * @private
   */
  _buildTraceApi(debugScope, descriptor) {
    if (stryMutAct_9fa48("109479")) {
      {}
    } else {
      stryCov_9fa48("109479");
      if (stryMutAct_9fa48("109482") ? !this.debugSessionResolver && !this.traceCollector : stryMutAct_9fa48("109481") ? false : stryMutAct_9fa48("109480") ? true : (stryCov_9fa48("109480", "109481", "109482"), (stryMutAct_9fa48("109483") ? this.debugSessionResolver : (stryCov_9fa48("109483"), !this.debugSessionResolver)) || (stryMutAct_9fa48("109484") ? this.traceCollector : (stryCov_9fa48("109484"), !this.traceCollector)))) {
        if (stryMutAct_9fa48("109485")) {
          {}
        } else {
          stryCov_9fa48("109485");
          return null;
        }
      }
      const emitter = new DebugEmitter(stryMutAct_9fa48("109486") ? {} : (stryCov_9fa48("109486"), {
        sessionResolver: this.debugSessionResolver,
        traceCollector: this.traceCollector,
        nodeId: stryMutAct_9fa48("109489") ? debugScope.nodeId && null : stryMutAct_9fa48("109488") ? false : stryMutAct_9fa48("109487") ? true : (stryCov_9fa48("109487", "109488", "109489"), debugScope.nodeId || null),
        serviceDefinitionId: stryMutAct_9fa48("109492") ? debugScope.serviceDefinitionId && null : stryMutAct_9fa48("109491") ? false : stryMutAct_9fa48("109490") ? true : (stryCov_9fa48("109490", "109491", "109492"), debugScope.serviceDefinitionId || null),
        replicaId: stryMutAct_9fa48("109495") ? debugScope.replicaId && null : stryMutAct_9fa48("109494") ? false : stryMutAct_9fa48("109493") ? true : (stryCov_9fa48("109493", "109494", "109495"), debugScope.replicaId || null),
        runtimeKind: descriptor.runtimeKind,
        source: DEBUG_TRACE_SOURCE.PARTITION_CALLBACK
      }));
      if (stryMutAct_9fa48("109498") ? false : stryMutAct_9fa48("109497") ? true : stryMutAct_9fa48("109496") ? emitter.isTraceActive(debugScope) : (stryCov_9fa48("109496", "109497", "109498"), !emitter.isTraceActive(debugScope))) {
        if (stryMutAct_9fa48("109499")) {
          {}
        } else {
          stryCov_9fa48("109499");
          return null;
        }
      }
      return emitter.createTraceApi(debugScope, stryMutAct_9fa48("109500") ? {} : (stryCov_9fa48("109500"), {
        runtimeKind: descriptor.runtimeKind,
        source: DEBUG_TRACE_SOURCE.PARTITION_CALLBACK
      }));
    }
  }

  /**
   * Check if the cancellation token has been triggered.
   *
   * @return {boolean} True if cancelled.
   * @private
   */
  _isCancelled() {
    if (stryMutAct_9fa48("109501")) {
      {}
    } else {
      stryCov_9fa48("109501");
      return stryMutAct_9fa48("109504") ? this.cancellationToken || this.cancellationToken.isCancelled() : stryMutAct_9fa48("109503") ? false : stryMutAct_9fa48("109502") ? true : (stryCov_9fa48("109502", "109503", "109504"), this.cancellationToken && this.cancellationToken.isCancelled());
    }
  }

  /**
   * Run budget enforcement check. Throws BudgetLimitError
   * if any budget is exceeded.
   *
   * @private
   */
  _checkBudget() {
    if (stryMutAct_9fa48("109505")) {
      {}
    } else {
      stryCov_9fa48("109505");
      if (stryMutAct_9fa48("109507") ? false : stryMutAct_9fa48("109506") ? true : (stryCov_9fa48("109506", "109507"), this.budgetEnforcer)) {
        if (stryMutAct_9fa48("109508")) {
          {}
        } else {
          stryCov_9fa48("109508");
          if (stryMutAct_9fa48("109510") ? false : stryMutAct_9fa48("109509") ? true : (stryCov_9fa48("109509", "109510"), this.budgetEnforcer.isTerminated())) {
            if (stryMutAct_9fa48("109511")) {
              {}
            } else {
              stryCov_9fa48("109511");
              throw new Error(ADAPTER_ERROR_MSG.CALLBACK_HOST_BUDGET_TERMINATED);
            }
          }
          this.budgetEnforcer.checkWallTime();
        }
      }
    }
  }

  /**
   * Compute lineage ID for a batch at the given index.
   *
   * @param {number} batchIndex - Batch index.
   * @return {string|null} Lineage ID or null.
   * @private
   */
  _batchLineageId(batchIndex) {
    if (stryMutAct_9fa48("109512")) {
      {}
    } else {
      stryCov_9fa48("109512");
      if (stryMutAct_9fa48("109515") ? false : stryMutAct_9fa48("109514") ? true : stryMutAct_9fa48("109513") ? this.lineageTracker : (stryCov_9fa48("109513", "109514", "109515"), !this.lineageTracker)) {
        if (stryMutAct_9fa48("109516")) {
          {}
        } else {
          stryCov_9fa48("109516");
          return null;
        }
      }
      return this.lineageTracker.generateLineageId(this.stageIndex, CALLBACK_BATCH_ARTIFACT_TYPE, batchIndex);
    }
  }

  /**
   * Register a completed batch result in the dedupe
   * registry for retry safety.
   *
   * @param {object} result - Completed batch result.
   * @param {number} batchIndex - Batch index.
   * @private
   */
  _registerDedupe(result, batchIndex) {
    if (stryMutAct_9fa48("109517")) {
      {}
    } else {
      stryCov_9fa48("109517");
      if (stryMutAct_9fa48("109520") ? !this.dedupeRegistry && !this.lineageTracker : stryMutAct_9fa48("109519") ? false : stryMutAct_9fa48("109518") ? true : (stryCov_9fa48("109518", "109519", "109520"), (stryMutAct_9fa48("109521") ? this.dedupeRegistry : (stryCov_9fa48("109521"), !this.dedupeRegistry)) || (stryMutAct_9fa48("109522") ? this.lineageTracker : (stryCov_9fa48("109522"), !this.lineageTracker)))) {
        if (stryMutAct_9fa48("109523")) {
          {}
        } else {
          stryCov_9fa48("109523");
          return;
        }
      }
      const lineageId = this._batchLineageId(batchIndex);
      const stageId = String(this.stageIndex);
      this.dedupeRegistry.register(lineageId, stageId, result);
    }
  }

  /**
   * Emit a telemetry event through the onTelemetry callback.
   * Follows the same pattern used by lookup, emit, and
   * broadcast primitives.
   *
   * @param {object} data - Telemetry event data.
   * @private
   */
  _emitTelemetry(data) {
    if (stryMutAct_9fa48("109524")) {
      {}
    } else {
      stryCov_9fa48("109524");
      if (stryMutAct_9fa48("109527") ? typeof this.onTelemetry !== TYPEOF.FUNCTION : stryMutAct_9fa48("109526") ? false : stryMutAct_9fa48("109525") ? true : (stryCov_9fa48("109525", "109526", "109527"), typeof this.onTelemetry === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("109528")) {
          {}
        } else {
          stryCov_9fa48("109528");
          this.onTelemetry(data);
        }
      }
    }
  }

  /**
   * Estimate byte size of a rows array using JSON
   * serialization length with a UTF-16 multiplier.
   *
   * Follows the same estimation pattern used by
   * streaming-aggregator.
   *
   * @param {Array} rows - Result rows.
   * @return {number} Estimated byte count.
   * @private
   */
  _estimateBytes(rows) {
    if (stryMutAct_9fa48("109529")) {
      {}
    } else {
      stryCov_9fa48("109529");
      if (stryMutAct_9fa48("109532") ? !rows && rows.length === NUM.ZERO : stryMutAct_9fa48("109531") ? false : stryMutAct_9fa48("109530") ? true : (stryCov_9fa48("109530", "109531", "109532"), (stryMutAct_9fa48("109533") ? rows : (stryCov_9fa48("109533"), !rows)) || (stryMutAct_9fa48("109535") ? rows.length !== NUM.ZERO : stryMutAct_9fa48("109534") ? false : (stryCov_9fa48("109534", "109535"), rows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("109536")) {
          {}
        } else {
          stryCov_9fa48("109536");
          return NUM.ZERO;
        }
      }
      try {
        if (stryMutAct_9fa48("109537")) {
          {}
        } else {
          stryCov_9fa48("109537");
          return stryMutAct_9fa48("109538") ? JSON.stringify(rows).length / BYTE_ESTIMATE_MULTIPLIER : (stryCov_9fa48("109538"), JSON.stringify(rows).length * BYTE_ESTIMATE_MULTIPLIER);
        }
      } catch (_estimateErr) {
        if (stryMutAct_9fa48("109539")) {
          {}
        } else {
          stryCov_9fa48("109539");
          return NUM.ZERO;
        }
      }
    }
  }

  /**
   * Build a cancelled result when cancellation is detected
   * before execution begins.
   *
   * @param {Array<object>} batches - Original batch list.
   * @return {object} Cancelled stage result.
   * @private
   */
  _buildCancelledResult(batches) {
    if (stryMutAct_9fa48("109540")) {
      {}
    } else {
      stryCov_9fa48("109540");
      const reason = this.cancellationToken ? this.cancellationToken.getReason() : STAGE_STATE.CANCELLED;
      this.logger.debug(ADAPTER_LOG_MSG.CALLBACK_HOST_CANCELLED, stryMutAct_9fa48("109541") ? {} : (stryCov_9fa48("109541"), {
        batchCount: batches.length,
        reason
      }));
      return stryMutAct_9fa48("109542") ? {} : (stryCov_9fa48("109542"), {
        partitionResults: stryMutAct_9fa48("109543") ? ["Stryker was here"] : (stryCov_9fa48("109543"), []),
        [SF.STATE]: STAGE_STATE.CANCELLED,
        totalPartitions: batches.length,
        processedPartitions: NUM.ZERO,
        failedPartitions: NUM.ZERO,
        cancelReason: reason
      });
    }
  }

  /**
   * Build a cancelled result for a single partition batch.
   *
   * @param {string} partitionId - Partition identifier.
   * @param {number} duration - Elapsed time in ms.
   * @return {object} Cancelled batch result.
   * @private
   */
  _cancelledBatchResult(partitionId, duration) {
    if (stryMutAct_9fa48("109544")) {
      {}
    } else {
      stryCov_9fa48("109544");
      const reason = this.cancellationToken ? this.cancellationToken.getReason() : STAGE_STATE.CANCELLED;
      return stryMutAct_9fa48("109545") ? {} : (stryCov_9fa48("109545"), {
        [SF.PARTITION_ID]: partitionId,
        [SF.ROWS]: stryMutAct_9fa48("109546") ? ["Stryker was here"] : (stryCov_9fa48("109546"), []),
        [SF.ROW_COUNT]: NUM.ZERO,
        [SF.STATE]: STAGE_STATE.CANCELLED,
        [SF.ERROR]: reason,
        [SF.DURATION_MS]: duration
      });
    }
  }
}
export { CallbackExecutionHost, validateDescriptor };