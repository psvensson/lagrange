/**
 * CallbackStageExecutor — runs callbacks in batch/stage mode.
 *
 * Instead of invoking the callback per-row (RPC mode), this
 * executor groups rows by partition and invokes the callback
 * once per partition batch. Each invocation receives:
 *   - context: DistributedContext with local SQL + movement
 *   - partitionBatch: {partitionId, rows, rowCount}
 *   - options: optional execution options
 *
 * This prevents N+1 cross-partition chatter and enables the
 * engine to apply batching, backpressure, and budget controls.
 *
 * On retry, the executor consults a DedupeRegistry keyed by
 * lineage ID + stage ID to skip already-committed batches
 * and return cached results instead.
 *
 * Requirements: 4.1, 5.1, 9.3
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
import { NUM, TYPEOF } from '../../constants/index.js';
import { STAGE_STATE, STAGE_RESULT_FIELD as SF, STAGE_ARTIFACT_TYPE, STAGE_BATCH_ARTIFACT_TYPE, PARTITION_BATCH_FIELD as PBF, STAGE_ERROR_MSG } from './callback-stage-constants.js';
import { GUARDRAIL_ERROR_MSG as ERR } from '../guardrail-constants.js';
const LOG_EXECUTE_BATCH_FAILED = stryMutAct_9fa48("109779") ? "" : (stryCov_9fa48("109779"), '_executeBatch failed');

/**
 * Group flat rows into partition batches.
 *
 * @param {Array<Object>} rows - Rows with partitionId field.
 * @param {string} partitionKey - Field name for partition ID.
 * @return {Array<Object>} Array of partition batch objects.
 */
function groupRowsByPartition(rows, partitionKey) {
  if (stryMutAct_9fa48("109780")) {
    {}
  } else {
    stryCov_9fa48("109780");
    const map = new Map();
    for (const row of rows) {
      if (stryMutAct_9fa48("109781")) {
        {}
      } else {
        stryCov_9fa48("109781");
        const pid = row[partitionKey];
        if (stryMutAct_9fa48("109784") ? false : stryMutAct_9fa48("109783") ? true : stryMutAct_9fa48("109782") ? map.has(pid) : (stryCov_9fa48("109782", "109783", "109784"), !map.has(pid))) {
          if (stryMutAct_9fa48("109785")) {
            {}
          } else {
            stryCov_9fa48("109785");
            map.set(pid, stryMutAct_9fa48("109786") ? ["Stryker was here"] : (stryCov_9fa48("109786"), []));
          }
        }
        map.get(pid).push(row);
      }
    }
    const batches = stryMutAct_9fa48("109787") ? ["Stryker was here"] : (stryCov_9fa48("109787"), []);
    for (const [partitionId, partitionRows] of map) {
      if (stryMutAct_9fa48("109788")) {
        {}
      } else {
        stryCov_9fa48("109788");
        batches.push(stryMutAct_9fa48("109789") ? {} : (stryCov_9fa48("109789"), {
          [PBF.PARTITION_ID]: partitionId,
          [PBF.ROWS]: partitionRows,
          [PBF.ROW_COUNT]: partitionRows.length
        }));
      }
    }
    return batches;
  }
}

/**
 * Validate that partition batches have the required shape.
 *
 * @param {Array<Object>} batches - Partition batch objects.
 * @return {{valid: boolean, errors: string[]}} Validation
 *   result.
 */
function validateBatches(batches) {
  if (stryMutAct_9fa48("109790")) {
    {}
  } else {
    stryCov_9fa48("109790");
    const errors = stryMutAct_9fa48("109791") ? ["Stryker was here"] : (stryCov_9fa48("109791"), []);
    if (stryMutAct_9fa48("109794") ? false : stryMutAct_9fa48("109793") ? true : stryMutAct_9fa48("109792") ? batches : (stryCov_9fa48("109792", "109793", "109794"), !batches)) {
      if (stryMutAct_9fa48("109795")) {
        {}
      } else {
        stryCov_9fa48("109795");
        errors.push(STAGE_ERROR_MSG.BATCHES_REQUIRED);
        return stryMutAct_9fa48("109796") ? {} : (stryCov_9fa48("109796"), {
          valid: stryMutAct_9fa48("109797") ? true : (stryCov_9fa48("109797"), false),
          errors
        });
      }
    }
    if (stryMutAct_9fa48("109800") ? false : stryMutAct_9fa48("109799") ? true : stryMutAct_9fa48("109798") ? Array.isArray(batches) : (stryCov_9fa48("109798", "109799", "109800"), !Array.isArray(batches))) {
      if (stryMutAct_9fa48("109801")) {
        {}
      } else {
        stryCov_9fa48("109801");
        errors.push(STAGE_ERROR_MSG.BATCHES_MUST_BE_ARRAY);
        return stryMutAct_9fa48("109802") ? {} : (stryCov_9fa48("109802"), {
          valid: stryMutAct_9fa48("109803") ? true : (stryCov_9fa48("109803"), false),
          errors
        });
      }
    }
    for (const batch of batches) {
      if (stryMutAct_9fa48("109804")) {
        {}
      } else {
        stryCov_9fa48("109804");
        if (stryMutAct_9fa48("109807") ? false : stryMutAct_9fa48("109806") ? true : stryMutAct_9fa48("109805") ? batch[PBF.PARTITION_ID] : (stryCov_9fa48("109805", "109806", "109807"), !batch[PBF.PARTITION_ID])) {
          if (stryMutAct_9fa48("109808")) {
            {}
          } else {
            stryCov_9fa48("109808");
            errors.push(STAGE_ERROR_MSG.BATCH_MISSING_PARTITION_ID);
          }
        }
        if (stryMutAct_9fa48("109811") ? false : stryMutAct_9fa48("109810") ? true : stryMutAct_9fa48("109809") ? Array.isArray(batch[PBF.ROWS]) : (stryCov_9fa48("109809", "109810", "109811"), !Array.isArray(batch[PBF.ROWS]))) {
          if (stryMutAct_9fa48("109812")) {
            {}
          } else {
            stryCov_9fa48("109812");
            errors.push(STAGE_ERROR_MSG.BATCH_MISSING_ROWS);
          }
        }
      }
    }
    return stryMutAct_9fa48("109813") ? {} : (stryCov_9fa48("109813"), {
      valid: stryMutAct_9fa48("109816") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("109815") ? false : stryMutAct_9fa48("109814") ? true : (stryCov_9fa48("109814", "109815", "109816"), errors.length === NUM.ZERO),
      errors
    });
  }
}
const nowMs = stryMutAct_9fa48("109817") ? () => undefined : (stryCov_9fa48("109817"), (() => {
  const nowMs = () => Date.now();
  return nowMs;
})());

/**
 * CallbackStageExecutor runs a validated async callback once
 * per partition batch, collecting results per partition.
 *
 * When a dedupeRegistry is provided, the executor checks
 * each batch's lineage ID + stage ID before execution. If
 * the composite key was already committed, the cached result
 * is returned and the callback is not re-invoked.
 */
class CallbackStageExecutor {
  /**
   * @param {Object} options - Executor options.
   * @param {Function} options.callback - Validated async
   *   callback.
   * @param {Object} [options.contextFactory] - Factory that
   *   creates a DistributedContext per partition. Must have a
   *   createContext(partitionId) method.
   * @param {Object} [options.lineageTracker] - LineageTracker
   *   instance for attaching lineage IDs to stage artifacts.
   * @param {number} [options.stageIndex] - Stage index within
   *   the query for lineage ID generation.
   * @param {Object} [options.dedupeRegistry] - DedupeRegistry
   *   instance for retry deduplication by lineage + stage.
   * @param {Object} [options.cancellationToken] - Token for
   *   cooperative cancellation and timeout propagation.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("109818")) {
      {}
    } else {
      stryCov_9fa48("109818");
      if (stryMutAct_9fa48("109821") ? !options.callback && typeof options.callback !== TYPEOF.FUNCTION : stryMutAct_9fa48("109820") ? false : stryMutAct_9fa48("109819") ? true : (stryCov_9fa48("109819", "109820", "109821"), (stryMutAct_9fa48("109822") ? options.callback : (stryCov_9fa48("109822"), !options.callback)) || (stryMutAct_9fa48("109824") ? typeof options.callback === TYPEOF.FUNCTION : stryMutAct_9fa48("109823") ? false : (stryCov_9fa48("109823", "109824"), typeof options.callback !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("109825")) {
          {}
        } else {
          stryCov_9fa48("109825");
          throw new Error(STAGE_ERROR_MSG.CALLBACK_REQUIRED);
        }
      }
      this.callback = options.callback;
      this.contextFactory = stryMutAct_9fa48("109828") ? options.contextFactory && null : stryMutAct_9fa48("109827") ? false : stryMutAct_9fa48("109826") ? true : (stryCov_9fa48("109826", "109827", "109828"), options.contextFactory || null);
      this.lineageTracker = stryMutAct_9fa48("109831") ? options.lineageTracker && null : stryMutAct_9fa48("109830") ? false : stryMutAct_9fa48("109829") ? true : (stryCov_9fa48("109829", "109830", "109831"), options.lineageTracker || null);
      this.stageIndex = stryMutAct_9fa48("109832") ? options.stageIndex && NUM.ZERO : (stryCov_9fa48("109832"), options.stageIndex ?? NUM.ZERO);
      this.dedupeRegistry = stryMutAct_9fa48("109835") ? options.dedupeRegistry && null : stryMutAct_9fa48("109834") ? false : stryMutAct_9fa48("109833") ? true : (stryCov_9fa48("109833", "109834", "109835"), options.dedupeRegistry || null);
      this.cancellationToken = stryMutAct_9fa48("109838") ? options.cancellationToken && null : stryMutAct_9fa48("109837") ? false : stryMutAct_9fa48("109836") ? true : (stryCov_9fa48("109836", "109837", "109838"), options.cancellationToken || null);
      this.state = STAGE_STATE.PENDING;
    }
  }

  /**
   * Execute the callback on each partition batch
   * sequentially.
   *
   * Requirement 4.1: DB.call runs fn on all partitions
   * selected by select — one invocation per partition batch.
   * Requirement 5.1: Cross-partition movement only through
   * explicit primitives on the context object.
   * Requirement 9.3: Deduplicate by lineage ID + stage ID
   * on retry to avoid duplicate side effects.
   * Requirement 9.5: Check cancellation token before each
   * batch and propagate cancellation across active stages.
   *
   * @param {Array<Object>} batches - Partition batch objects,
   *   each with {partitionId, rows, rowCount}.
   * @param {Object} [options] - Options forwarded to
   *   callback.
   * @return {Promise<Object>} Stage result with per-partition
   *   results array and aggregate state.
   */
  async execute(batches, options) {
    if (stryMutAct_9fa48("109839")) {
      {}
    } else {
      stryCov_9fa48("109839");
      if (stryMutAct_9fa48("109842") ? this.state !== STAGE_STATE.RUNNING : stryMutAct_9fa48("109841") ? false : stryMutAct_9fa48("109840") ? true : (stryCov_9fa48("109840", "109841", "109842"), this.state === STAGE_STATE.RUNNING)) {
        if (stryMutAct_9fa48("109843")) {
          {}
        } else {
          stryCov_9fa48("109843");
          throw new Error(STAGE_ERROR_MSG.STAGE_ALREADY_RUNNING);
        }
      }
      const batchValidation = validateBatches(batches);
      if (stryMutAct_9fa48("109846") ? false : stryMutAct_9fa48("109845") ? true : stryMutAct_9fa48("109844") ? batchValidation.valid : (stryCov_9fa48("109844", "109845", "109846"), !batchValidation.valid)) {
        if (stryMutAct_9fa48("109847")) {
          {}
        } else {
          stryCov_9fa48("109847");
          throw new Error(batchValidation.errors[NUM.ZERO]);
        }
      }
      if (stryMutAct_9fa48("109850") ? this.cancellationToken || this.cancellationToken.isCancelled() : stryMutAct_9fa48("109849") ? false : stryMutAct_9fa48("109848") ? true : (stryCov_9fa48("109848", "109849", "109850"), this.cancellationToken && this.cancellationToken.isCancelled())) {
        if (stryMutAct_9fa48("109851")) {
          {}
        } else {
          stryCov_9fa48("109851");
          this.state = STAGE_STATE.CANCELLED;
          return this._buildCancelledResult(batches);
        }
      }
      this.state = STAGE_STATE.RUNNING;
      const partitionResults = stryMutAct_9fa48("109852") ? ["Stryker was here"] : (stryCov_9fa48("109852"), []);
      let hasFailure = stryMutAct_9fa48("109853") ? true : (stryCov_9fa48("109853"), false);
      let wasCancelled = stryMutAct_9fa48("109854") ? true : (stryCov_9fa48("109854"), false);
      for (let i = NUM.ZERO; stryMutAct_9fa48("109857") ? i >= batches.length : stryMutAct_9fa48("109856") ? i <= batches.length : stryMutAct_9fa48("109855") ? false : (stryCov_9fa48("109855", "109856", "109857"), i < batches.length); stryMutAct_9fa48("109858") ? i-- : (stryCov_9fa48("109858"), i++)) {
        if (stryMutAct_9fa48("109859")) {
          {}
        } else {
          stryCov_9fa48("109859");
          if (stryMutAct_9fa48("109862") ? this.cancellationToken || this.cancellationToken.isCancelled() : stryMutAct_9fa48("109861") ? false : stryMutAct_9fa48("109860") ? true : (stryCov_9fa48("109860", "109861", "109862"), this.cancellationToken && this.cancellationToken.isCancelled())) {
            if (stryMutAct_9fa48("109863")) {
              {}
            } else {
              stryCov_9fa48("109863");
              wasCancelled = stryMutAct_9fa48("109864") ? false : (stryCov_9fa48("109864"), true);
              break;
            }
          }
          const partitionResult = await this._executeBatch(batches[i], options, i);
          if (stryMutAct_9fa48("109867") ? partitionResult[SF.STATE] !== STAGE_STATE.CANCELLED : stryMutAct_9fa48("109866") ? false : stryMutAct_9fa48("109865") ? true : (stryCov_9fa48("109865", "109866", "109867"), partitionResult[SF.STATE] === STAGE_STATE.CANCELLED)) {
            if (stryMutAct_9fa48("109868")) {
              {}
            } else {
              stryCov_9fa48("109868");
              wasCancelled = stryMutAct_9fa48("109869") ? false : (stryCov_9fa48("109869"), true);
              partitionResults.push(partitionResult);
              break;
            }
          }
          partitionResults.push(partitionResult);
          if (stryMutAct_9fa48("109872") ? partitionResult[SF.STATE] !== STAGE_STATE.FAILED : stryMutAct_9fa48("109871") ? false : stryMutAct_9fa48("109870") ? true : (stryCov_9fa48("109870", "109871", "109872"), partitionResult[SF.STATE] === STAGE_STATE.FAILED)) {
            if (stryMutAct_9fa48("109873")) {
              {}
            } else {
              stryCov_9fa48("109873");
              hasFailure = stryMutAct_9fa48("109874") ? false : (stryCov_9fa48("109874"), true);
            }
          }
        }
      }
      if (stryMutAct_9fa48("109876") ? false : stryMutAct_9fa48("109875") ? true : (stryCov_9fa48("109875", "109876"), wasCancelled)) {
        if (stryMutAct_9fa48("109877")) {
          {}
        } else {
          stryCov_9fa48("109877");
          this.state = STAGE_STATE.CANCELLED;
        }
      } else {
        if (stryMutAct_9fa48("109878")) {
          {}
        } else {
          stryCov_9fa48("109878");
          this.state = hasFailure ? STAGE_STATE.FAILED : STAGE_STATE.COMPLETED;
        }
      }
      const stageResult = stryMutAct_9fa48("109879") ? {} : (stryCov_9fa48("109879"), {
        partitionResults,
        [SF.STATE]: this.state,
        totalPartitions: batches.length,
        failedPartitions: stryMutAct_9fa48("109880") ? partitionResults.length : (stryCov_9fa48("109880"), partitionResults.filter(stryMutAct_9fa48("109881") ? () => undefined : (stryCov_9fa48("109881"), r => stryMutAct_9fa48("109884") ? r[SF.STATE] !== STAGE_STATE.FAILED : stryMutAct_9fa48("109883") ? false : stryMutAct_9fa48("109882") ? true : (stryCov_9fa48("109882", "109883", "109884"), r[SF.STATE] === STAGE_STATE.FAILED))).length)
      });
      if (stryMutAct_9fa48("109886") ? false : stryMutAct_9fa48("109885") ? true : (stryCov_9fa48("109885", "109886"), this.lineageTracker)) {
        if (stryMutAct_9fa48("109887")) {
          {}
        } else {
          stryCov_9fa48("109887");
          this.lineageTracker.attachLineage(stageResult, this.stageIndex, STAGE_ARTIFACT_TYPE, NUM.ZERO);
        }
      }
      return stageResult;
    }
  }

  /**
   * Execute the callback on a single partition batch.
   * If a dedupeRegistry is present and the lineage + stage
   * composite key was already committed, returns the cached
   * result without re-invoking the callback.
   * If the cancellation token fires during execution, the
   * batch result is marked CANCELLED.
   *
   * @param {Object} batch - Partition batch object.
   * @param {Object} [options] - Options forwarded to
   *   callback.
   * @param {number} batchIndex - Index of this batch.
   * @return {Promise<Object>} Per-partition result.
   * @private
   */
  async _executeBatch(batch, options, batchIndex) {
    if (stryMutAct_9fa48("109888")) {
      {}
    } else {
      stryCov_9fa48("109888");
      const lineageId = this._batchLineageId(batchIndex);
      if (stryMutAct_9fa48("109891") ? lineageId || this.dedupeRegistry : stryMutAct_9fa48("109890") ? false : stryMutAct_9fa48("109889") ? true : (stryCov_9fa48("109889", "109890", "109891"), lineageId && this.dedupeRegistry)) {
        if (stryMutAct_9fa48("109892")) {
          {}
        } else {
          stryCov_9fa48("109892");
          const stageId = String(this.stageIndex);
          if (stryMutAct_9fa48("109894") ? false : stryMutAct_9fa48("109893") ? true : (stryCov_9fa48("109893", "109894"), this.dedupeRegistry.isDuplicate(lineageId, stageId))) {
            if (stryMutAct_9fa48("109895")) {
              {}
            } else {
              stryCov_9fa48("109895");
              return this.dedupeRegistry.getResult(lineageId, stageId);
            }
          }
        }
      }
      const startTime = nowMs();
      const partitionId = batch[PBF.PARTITION_ID];
      const context = this.contextFactory ? this.contextFactory.createContext(partitionId) : createDefaultContext(partitionId);
      try {
        if (stryMutAct_9fa48("109896")) {
          {}
        } else {
          stryCov_9fa48("109896");
          const rows = await this.callback(context, batch, options);
          if (stryMutAct_9fa48("109899") ? this.cancellationToken || this.cancellationToken.isCancelled() : stryMutAct_9fa48("109898") ? false : stryMutAct_9fa48("109897") ? true : (stryCov_9fa48("109897", "109898", "109899"), this.cancellationToken && this.cancellationToken.isCancelled())) {
            if (stryMutAct_9fa48("109900")) {
              {}
            } else {
              stryCov_9fa48("109900");
              const duration = stryMutAct_9fa48("109901") ? nowMs() + startTime : (stryCov_9fa48("109901"), nowMs() - startTime);
              return this._cancelledBatchResult(partitionId, duration);
            }
          }
          const duration = stryMutAct_9fa48("109902") ? nowMs() + startTime : (stryCov_9fa48("109902"), nowMs() - startTime);
          const result = stryMutAct_9fa48("109903") ? {} : (stryCov_9fa48("109903"), {
            [SF.PARTITION_ID]: partitionId,
            [SF.ROWS]: Array.isArray(rows) ? rows : stryMutAct_9fa48("109904") ? ["Stryker was here"] : (stryCov_9fa48("109904"), []),
            [SF.ROW_COUNT]: Array.isArray(rows) ? rows.length : NUM.ZERO,
            [SF.STATE]: STAGE_STATE.COMPLETED,
            [SF.ERROR]: null,
            [SF.DURATION_MS]: duration
          });
          if (stryMutAct_9fa48("109906") ? false : stryMutAct_9fa48("109905") ? true : (stryCov_9fa48("109905", "109906"), this.lineageTracker)) {
            if (stryMutAct_9fa48("109907")) {
              {}
            } else {
              stryCov_9fa48("109907");
              this.lineageTracker.attachLineage(result, this.stageIndex, STAGE_BATCH_ARTIFACT_TYPE, batchIndex);
            }
          }
          this._registerDedupe(result, batchIndex);
          return result;
        }
      } catch (err) {
        if (stryMutAct_9fa48("109908")) {
          {}
        } else {
          stryCov_9fa48("109908");
          console.warn(LOG_EXECUTE_BATCH_FAILED, err.message);
          const duration = stryMutAct_9fa48("109909") ? nowMs() + startTime : (stryCov_9fa48("109909"), nowMs() - startTime);
          if (stryMutAct_9fa48("109912") ? this.cancellationToken || this.cancellationToken.isCancelled() : stryMutAct_9fa48("109911") ? false : stryMutAct_9fa48("109910") ? true : (stryCov_9fa48("109910", "109911", "109912"), this.cancellationToken && this.cancellationToken.isCancelled())) {
            if (stryMutAct_9fa48("109913")) {
              {}
            } else {
              stryCov_9fa48("109913");
              return this._cancelledBatchResult(partitionId, duration);
            }
          }
          const result = stryMutAct_9fa48("109914") ? {} : (stryCov_9fa48("109914"), {
            [SF.PARTITION_ID]: partitionId,
            [SF.ROWS]: stryMutAct_9fa48("109915") ? ["Stryker was here"] : (stryCov_9fa48("109915"), []),
            [SF.ROW_COUNT]: NUM.ZERO,
            [SF.STATE]: STAGE_STATE.FAILED,
            [SF.ERROR]: err.message,
            [SF.DURATION_MS]: duration
          });
          if (stryMutAct_9fa48("109917") ? false : stryMutAct_9fa48("109916") ? true : (stryCov_9fa48("109916", "109917"), this.lineageTracker)) {
            if (stryMutAct_9fa48("109918")) {
              {}
            } else {
              stryCov_9fa48("109918");
              this.lineageTracker.attachLineage(result, this.stageIndex, STAGE_BATCH_ARTIFACT_TYPE, batchIndex);
            }
          }
          return result;
        }
      }
    }
  }

  /**
   * Build a cancelled stage result when the token is already
   * cancelled before execution begins.
   *
   * @param {Array<Object>} batches - Original batch list.
   * @return {Object} Stage result with CANCELLED state.
   * @private
   */
  _buildCancelledResult(batches) {
    if (stryMutAct_9fa48("109919")) {
      {}
    } else {
      stryCov_9fa48("109919");
      const reason = this.cancellationToken ? this.cancellationToken.getReason() : ERR.CANCELLED;
      return stryMutAct_9fa48("109920") ? {} : (stryCov_9fa48("109920"), {
        partitionResults: stryMutAct_9fa48("109921") ? ["Stryker was here"] : (stryCov_9fa48("109921"), []),
        [SF.STATE]: STAGE_STATE.CANCELLED,
        totalPartitions: batches.length,
        failedPartitions: NUM.ZERO,
        cancelReason: reason
      });
    }
  }

  /**
   * Build a cancelled batch result for a single partition.
   *
   * @param {string} partitionId - Partition identifier.
   * @param {number} duration - Elapsed time in ms.
   * @return {Object} Per-partition result with CANCELLED state.
   * @private
   */
  _cancelledBatchResult(partitionId, duration) {
    if (stryMutAct_9fa48("109922")) {
      {}
    } else {
      stryCov_9fa48("109922");
      const reason = this.cancellationToken ? this.cancellationToken.getReason() : ERR.CANCELLED;
      return stryMutAct_9fa48("109923") ? {} : (stryCov_9fa48("109923"), {
        [SF.PARTITION_ID]: partitionId,
        [SF.ROWS]: stryMutAct_9fa48("109924") ? ["Stryker was here"] : (stryCov_9fa48("109924"), []),
        [SF.ROW_COUNT]: NUM.ZERO,
        [SF.STATE]: STAGE_STATE.CANCELLED,
        [SF.ERROR]: reason,
        [SF.DURATION_MS]: duration
      });
    }
  }

  /**
   * Compute the lineage ID for a batch at the given index.
   *
   * @param {number} batchIndex - Batch index.
   * @return {string|null} Lineage ID or null if no tracker.
   * @private
   */
  _batchLineageId(batchIndex) {
    if (stryMutAct_9fa48("109925")) {
      {}
    } else {
      stryCov_9fa48("109925");
      if (stryMutAct_9fa48("109928") ? false : stryMutAct_9fa48("109927") ? true : stryMutAct_9fa48("109926") ? this.lineageTracker : (stryCov_9fa48("109926", "109927", "109928"), !this.lineageTracker)) {
        if (stryMutAct_9fa48("109929")) {
          {}
        } else {
          stryCov_9fa48("109929");
          return null;
        }
      }
      return this.lineageTracker.generateLineageId(this.stageIndex, STAGE_BATCH_ARTIFACT_TYPE, batchIndex);
    }
  }

  /**
   * Register a successful batch result in the dedupe
   * registry keyed by lineage ID + stage ID.
   *
   * @param {Object} result - Completed batch result.
   * @param {number} batchIndex - Batch index.
   * @private
   */
  _registerDedupe(result, batchIndex) {
    if (stryMutAct_9fa48("109930")) {
      {}
    } else {
      stryCov_9fa48("109930");
      if (stryMutAct_9fa48("109933") ? !this.dedupeRegistry && !this.lineageTracker : stryMutAct_9fa48("109932") ? false : stryMutAct_9fa48("109931") ? true : (stryCov_9fa48("109931", "109932", "109933"), (stryMutAct_9fa48("109934") ? this.dedupeRegistry : (stryCov_9fa48("109934"), !this.dedupeRegistry)) || (stryMutAct_9fa48("109935") ? this.lineageTracker : (stryCov_9fa48("109935"), !this.lineageTracker)))) {
        if (stryMutAct_9fa48("109936")) {
          {}
        } else {
          stryCov_9fa48("109936");
          return;
        }
      }
      const lineageId = this._batchLineageId(batchIndex);
      const stageId = String(this.stageIndex);
      this.dedupeRegistry.register(lineageId, stageId, result);
    }
  }
}

/**
 * Create a minimal default context when no factory is
 * provided. Provides stub distributed movement primitives.
 *
 * @param {string} partitionId - Partition identifier.
 * @return {Object} Default DistributedContext stub.
 */
function createDefaultContext(partitionId) {
  if (stryMutAct_9fa48("109937")) {
    {}
  } else {
    stryCov_9fa48("109937");
    return Object.freeze(stryMutAct_9fa48("109938") ? {} : (stryCov_9fa48("109938"), {
      partitionId,
      async emit(_key, _value) {},
      async lookup(_table, _keys) {
        if (stryMutAct_9fa48("109939")) {
          {}
        } else {
          stryCov_9fa48("109939");
          return stryMutAct_9fa48("109940") ? {} : (stryCov_9fa48("109940"), {
            rows: stryMutAct_9fa48("109941") ? ["Stryker was here"] : (stryCov_9fa48("109941"), [])
          });
        }
      },
      async broadcast(_ref, _dataset) {},
      async useBroadcast(_ref) {
        if (stryMutAct_9fa48("109942")) {
          {}
        } else {
          stryCov_9fa48("109942");
          return stryMutAct_9fa48("109943") ? {} : (stryCov_9fa48("109943"), {
            rows: stryMutAct_9fa48("109944") ? ["Stryker was here"] : (stryCov_9fa48("109944"), [])
          });
        }
      }
    }));
  }
}
export { CallbackStageExecutor, groupRowsByPartition, validateBatches, createDefaultContext };