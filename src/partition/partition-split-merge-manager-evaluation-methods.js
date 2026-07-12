import {
  PRESSURE_GOVERNOR_ACTION,
} from '../control-plane/pressure-governor.js';
import {
  SPLIT_MERGE_EVENT,
  SPLIT_MERGE_LOG_MSG,
  SPLIT_MERGE_REASON,
} from './partition-constants.js';

const LOCAL_STR_WORKFLOW_EXECUTION = 'workflow_execution';
const LOCAL_STR_OBJECT = 'object';

/**
 * Resolve one results-list length for evaluation summary diagnostics.
 * @param {*} value
 * @return {number}
 */
function countResultList(value) {
  return Array.isArray(value) ? value.length : 0;
}

function createPartitionSplitMergeManagerEvaluationMethods(options = {}) {
  const cloneStringArray = options.cloneStringArray;
  const operationState = options.operationState;
  const defaultEvaluationTrigger = options.defaultEvaluationTrigger;
  const periodicEvaluationTrigger = options.periodicEvaluationTrigger;
  const reactiveEvaluationTrigger = options.reactiveEvaluationTrigger;

  return {
    /**
     * Start periodic evaluation of split and merge criteria.
     */
    startPeriodicEvaluation() {
      if (this.evaluationTimer) {
        return;
      }

      this.logger.info(SPLIT_MERGE_LOG_MSG.STARTING_PERIODIC_EVAL, {
        intervalMs: this.evaluationIntervalMs,
      });

      this.evaluationTimer = setInterval(() => {
        this.evaluateAllPartitions({
          triggerReason: periodicEvaluationTrigger,
        }).catch((error) => {
          this.logger.error(SPLIT_MERGE_LOG_MSG.PERIODIC_EVAL_FAILED, {
            error: error.message,
          });
        });
      }, this.evaluationIntervalMs);
      this.evaluationTimer.unref();
    },

    /**
     * Stop periodic evaluation.
     */
    stopPeriodicEvaluation() {
      if (this.evaluationTimer) {
        clearInterval(this.evaluationTimer);
        this.evaluationTimer = null;
        this.logger.info(SPLIT_MERGE_LOG_MSG.STOPPED_PERIODIC_EVAL);
      }
    },

    /**
     * Request one coalesced split and merge evaluation.
     * @param {Object} [context]
     * @return {void}
     */
    requestEvaluation(context = {}) {
      if (this.isShutdown) {
        return;
      }

      this.requestedEvaluation = this.mergeRequestedEvaluationContext(
        this.requestedEvaluation,
        context,
      );
      this.setRequestedEvaluationDiagnostics(this.requestedEvaluation);
      const pressureDecision = this.evaluateSplitPressure();
      const pressureDeferred =
        pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER;
      const delayMs = Math.max(
        this.reactiveEvaluationDebounceMs,
        pressureDeferred ? pressureDecision.retryAfterMs : 0,
      );
      const dueAtMs = Date.now() + delayMs;
      if (
        this.requestedEvaluationTimer &&
        Number.isFinite(this.requestedEvaluationDueAtMs)
      ) {
        if (this.requestedEvaluationDueAtMs <= dueAtMs) {
          return;
        }
        clearTimeout(this.requestedEvaluationTimer);
        this.requestedEvaluationTimer = null;
      } else if (this.requestedEvaluationTimer) {
        clearTimeout(this.requestedEvaluationTimer);
        this.requestedEvaluationTimer = null;
      }

      this.requestedEvaluationDueAtMs = dueAtMs;
      this.requestedEvaluationTimer = setTimeout(() => {
        this.requestedEvaluationTimer = null;
        this.requestedEvaluationDueAtMs = null;
        void this.flushRequestedEvaluation();
      }, delayMs);
      this.requestedEvaluationTimer.unref?.();
    },

    /**
     * Merge multiple evaluation requests into one stable context object.
     * @param {Object|null} existing
     * @param {Object|null} next
     * @return {Object}
     */
    mergeRequestedEvaluationContext(existing, next) {
      const merged = {
        reasonCodes: [],
        partitionIds: [],
      };
      const appendValues = (target, values) => {
        if (!Array.isArray(values)) {
          return;
        }
        for (const value of values) {
          const normalizedValue = String(value || '');
          if (!normalizedValue || target.includes(normalizedValue)) {
            continue;
          }
          target.push(normalizedValue);
        }
      };
      const appendContext = (context) => {
        if (!context || typeof context !== 'object') {
          return;
        }
        appendValues(
          merged.reasonCodes,
          Array.isArray(context.reasonCodes) ?
            context.reasonCodes :
            [context.reasonCode, context.reason],
        );
        appendValues(
          merged.partitionIds,
          Array.isArray(context.partitionIds) ?
            context.partitionIds :
            [context.partitionId],
        );
      };

      appendContext(existing);
      appendContext(next);
      return merged;
    },

    /**
     * Resolve one stable trigger label for evaluation diagnostics.
     * @param {Object} preflightOptions
     * @return {string}
     */
    resolveEvaluationTrigger(preflightOptions = {}) {
      const trigger = String(
        preflightOptions?.triggerReason ||
        preflightOptions?.reasonCode ||
        preflightOptions?.reason ||
        defaultEvaluationTrigger,
      );
      return trigger.length > 0 ? trigger : defaultEvaluationTrigger;
    },

    /**
     * Capture pending reactive-request diagnostics.
     * @param {Object|null} request
     * @return {void}
     */
    setRequestedEvaluationDiagnostics(request) {
      const normalizedRequest = request &&
        typeof request === 'object' ?
        request :
        null;
      this.lastEvaluationRequestedAtMs = Date.now();
      this.lastEvaluationReasonCodes = cloneStringArray(
        normalizedRequest?.reasonCodes,
      );
      this.lastEvaluationPartitionIds = cloneStringArray(
        normalizedRequest?.partitionIds,
      );
    },

    /**
     * Clear pending reactive-request diagnostics after dispatch.
     * @return {void}
     */
    clearRequestedEvaluationDiagnostics() {
      this.lastEvaluationRequestedAtMs = null;
      this.lastEvaluationReasonCodes = [];
      this.lastEvaluationPartitionIds = [];
    },

    /**
     * Record evaluation-start diagnostics.
     * @param {Object} preflightOptions
     * @return {number}
     */
    recordEvaluationStart(preflightOptions = {}) {
      const startedAtMs = Date.now();
      this.lastEvaluationTrigger =
        this.resolveEvaluationTrigger(preflightOptions);
      this.lastEvaluationStartedAtMs = startedAtMs;
      this.lastEvaluationError = null;
      return startedAtMs;
    },

    /**
     * Record evaluation success diagnostics.
     * @param {Object} results
     * @param {number} startedAtMs
     * @return {void}
     */
    recordEvaluationSuccess(results, startedAtMs) {
      const completedAtMs = Date.now();
      this.lastEvaluationCompletedAtMs = completedAtMs;
      this.lastEvaluationDurationMs = Number.isFinite(startedAtMs) ?
        Math.max(0, completedAtMs - startedAtMs) :
        null;
      const normalized = results && typeof results === 'object' ? results : {};
      this.lastEvaluationSummary = {
        evaluated: normalized.evaluated === true,
        partitionsEvaluated: Number(normalized.partitionsEvaluated || 0),
        splitCandidateCount: countResultList(normalized.splitCandidates),
        executedSplitCount: countResultList(normalized.executedSplits),
        splitDeferredCount: countResultList(normalized.splitDeferred),
        splitErrorCount: countResultList(normalized.splitErrors),
        mergeCandidateCount: countResultList(normalized.mergeCandidates),
        executedMergeCount: countResultList(normalized.executedMerges),
        mergeDeferredCount: countResultList(normalized.mergeDeferred),
        mergeErrorCount: countResultList(normalized.mergeErrors),
      };
      this.lastEvaluationError = null;
    },

    /**
     * Record evaluation failure diagnostics.
     * @param {Error|*} error
     * @param {number} startedAtMs
     * @return {void}
     */
    recordEvaluationFailure(error, startedAtMs) {
      const completedAtMs = Date.now();
      this.lastEvaluationCompletedAtMs = completedAtMs;
      this.lastEvaluationDurationMs = Number.isFinite(startedAtMs) ?
        Math.max(0, completedAtMs - startedAtMs) :
        null;
      this.lastEvaluationError = String(error?.message || error || '');
    },

    /**
     * Drain one pending evaluation request once the manager is idle.
     * @return {Promise<void>}
     */
    async flushRequestedEvaluation() {
      const request = this.requestedEvaluation;
      this.requestedEvaluation = null;
      this.clearRequestedEvaluationDiagnostics();
      if (!request) {
        return;
      }

      if (this.state !== operationState.IDLE) {
        this.requestEvaluation(request);
        return;
      }

      try {
        await this.evaluateAllPartitions({
          ...request,
          triggerReason: reactiveEvaluationTrigger,
        });
      } catch (error) {
        this.logger.error(SPLIT_MERGE_LOG_MSG.REQUESTED_EVAL_FAILED, {
          error: error.message,
          reasonCodes: request.reasonCodes,
          partitionIds: request.partitionIds,
        });
      }
    },

    /**
     * Evaluate all partitions for split and merge operations.
     * @param {Object} [preflightOptions={}]
     * @return {Promise<Object>}
     */
    async evaluateAllPartitions(preflightOptions = {}) {
      if (this.state !== operationState.IDLE) {
        this.logger.debug(SPLIT_MERGE_LOG_MSG.SKIPPING_EVAL_BUSY, {
          state: this.state,
        });
        return {evaluated: false, reason: SPLIT_MERGE_REASON.BUSY};
      }

      const evaluationStartedAtMs =
        this.recordEvaluationStart(preflightOptions);
      const bypassSplitPressure =
        this.shouldBypassSplitPressure(preflightOptions);
      const pressureDecision = this.evaluateSplitPressure();
      if (
        !bypassSplitPressure &&
        pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER
      ) {
        this.requestEvaluation({
          reasonCode: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
          partitionIds: preflightOptions.partitionIds,
        });
        const results = {
          evaluated: false,
          reason: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
          retryAfterMs: pressureDecision.retryAfterMs,
          pressureSummary: pressureDecision.summary || null,
          partitionsEvaluated: 0,
          splitCandidates: [],
          executedSplits: [],
          splitErrors: [],
          splitDeferred: [],
          mergeCandidates: [],
          executedMerges: [],
          mergeErrors: [],
          mergeDeferred: [],
        };
        this.recordEvaluationSuccess(
          results,
          evaluationStartedAtMs,
        );
        return results;
      }

      this.state = operationState.EVALUATING;

      try {
        const results = {
          evaluated: true,
          partitionsEvaluated: 0,
          splitCandidates: [],
          executedSplits: [],
          splitErrors: [],
          splitDeferred: [],
          mergeCandidates: [],
          executedMerges: [],
          mergeErrors: [],
          mergeDeferred: [],
        };

        const partitions = await this.loadEvaluationPartitions();
        if (partitions.length === 0) {
          this.recordEvaluationSuccess(
            results,
            evaluationStartedAtMs,
          );
          return results;
        }
        results.partitionsEvaluated = partitions.length;
        const targetNodeId = preflightOptions.targetNodeId || null;

        for (const partition of partitions) {
          const partitionId = this.getPartitionId(partition);
          if (!partitionId) {
            continue;
          }
          const metrics = await this.resolvePartitionMetrics(partition);
          const policy = await this.getTablePolicy(partitionId);

          if (!this.evaluateSplitCriteria(
            partitionId, metrics, policy,
          )) {
            continue;
          }

          if (targetNodeId) {
            const preflight =
              await this.checkSplitCapacityPreflight(
                partitionId, metrics, targetNodeId,
              );
            if (preflight.feasible) {
              this.logger.debug(
                SPLIT_MERGE_LOG_MSG.SPLIT_CAPACITY_ALLOWED, {
                  partitionId,
                  targetNodeId,
                });
              results.splitCandidates.push(partitionId);
            } else {
              this.logger.warn(
                SPLIT_MERGE_LOG_MSG.SPLIT_DEFERRED_CAPACITY, {
                  partitionId,
                  targetNodeId,
                  reason: preflight.reason,
                });
              results.splitDeferred.push({
                partitionId,
                reason: preflight.reason,
                admissionResult: preflight.admissionResult,
              });
              this.emit(SPLIT_MERGE_EVENT.SPLIT_DEFERRED, {
                partitionId,
                reason: preflight.reason,
              });
            }
          } else {
            results.splitCandidates.push(partitionId);
          }
        }

        let splitExecutionAttempts = 0;
        for (const partitionId of results.splitCandidates) {
          if (
            splitExecutionAttempts >=
              this.maxAutoExecuteSplitsPerEvaluation
          ) {
            this.logger.warn(
              SPLIT_MERGE_LOG_MSG.SPLIT_DEFERRED_BACKPRESSURE,
              {
                partitionId,
                reason: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
                maxAutoExecuteSplitsPerEvaluation:
                  this.maxAutoExecuteSplitsPerEvaluation,
              },
            );
            results.splitDeferred.push({
              partitionId,
              reason: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
            });
            this.emit(SPLIT_MERGE_EVENT.SPLIT_DEFERRED, {
              partitionId,
              reason: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
            });
            continue;
          }
          splitExecutionAttempts += 1;
          try {
            const execution = await this.executeManagedSplitCandidate(
              partitionId,
              {
                bypassPressure: bypassSplitPressure,
              },
            );
            this.recordManagedSplitExecutionOutcome(
              results,
              partitionId,
              execution,
            );
          } catch (error) {
            this.logger.error(SPLIT_MERGE_LOG_MSG.SPLIT_EXECUTION_FAILED, {
              partitionId,
              error: error.message,
              phase: LOCAL_STR_WORKFLOW_EXECUTION,
            });
            results.splitErrors.push({
              partitionId,
              error: error.message,
            });
          }
        }

        const sortedPartitions = this.keyRangeManager ?
          this.keyRangeManager.getSortedPartitions() :
          this.sortEvaluationPartitions(partitions);
        for (
          let i = 0;
          i < sortedPartitions.length - 1;
          i++
        ) {
          const leftPartition = sortedPartitions[i];
          const rightPartition = sortedPartitions[i + 1];
          const leftId = this.keyRangeManager ?
            leftPartition.partitionId :
            this.getPartitionId(leftPartition);
          const rightId = this.keyRangeManager ?
            rightPartition.partitionId :
            this.getPartitionId(rightPartition);
          if (!leftId || !rightId) {
            continue;
          }
          if (
            !this.keyRangeManager &&
            this.getPartitionTableId(leftPartition) !==
              this.getPartitionTableId(rightPartition)
          ) {
            continue;
          }
          if (
            !this.keyRangeManager &&
            this.comparePartitionKeys(
              this.getPartitionEndKey(leftPartition),
              this.getPartitionStartKey(rightPartition),
            ) !== 0
          ) {
            continue;
          }

          const leftMetrics = await this.resolvePartitionMetrics(leftPartition);
          const rightMetrics = await this.resolvePartitionMetrics(rightPartition);
          const policy = await this.getTablePolicy(leftId);

          if (this.evaluateMergeCriteria(
            leftId, rightId, leftMetrics, rightMetrics, policy,
          )) {
            results.mergeCandidates.push({leftId, rightId});
            this.logger.debug(
              SPLIT_MERGE_LOG_MSG.MERGE_ELIGIBLE_UNDER_PRESSURE, {
                leftId,
                rightId,
              });
          }
        }

        await this.executeMergeCandidatesWithinBudget(
          results,
          bypassSplitPressure,
        );

        this.logger.debug(SPLIT_MERGE_LOG_MSG.PARTITION_EVAL_COMPLETED, {
          partitionsEvaluated: results.partitionsEvaluated,
          splitCandidates: results.splitCandidates.length,
          splitDeferred: results.splitDeferred.length,
          mergeCandidates: results.mergeCandidates.length,
          executedMerges: results.executedMerges.length,
          mergeDeferred: results.mergeDeferred.length,
        });

        this.emit(
          SPLIT_MERGE_EVENT.EVALUATION_COMPLETED, results);
        this.recordEvaluationSuccess(
          results,
          evaluationStartedAtMs,
        );
        return results;
      } catch (error) {
        this.recordEvaluationFailure(
          error,
          evaluationStartedAtMs,
        );
        throw error;
      } finally {
        this.state = operationState.IDLE;
      }
    },

    /**
     * Auto-execute merge candidates through the wired runtime owner,
     * bounded per evaluation exactly like the split auto-execute loop.
     * Candidates already covered by a split executed this round, or beyond
     * the per-evaluation budget, are deferred with a backpressure reason.
     * @param {Object} results - Evaluation results accumulator.
     * @param {boolean} bypassPressure - Reactive pressure bypass flag.
     * @return {Promise<void>}
     * @private
     */
    async executeMergeCandidatesWithinBudget(results, bypassPressure) {
      let mergeExecutionAttempts = 0;
      for (const candidate of results.mergeCandidates) {
        if (
          mergeExecutionAttempts >=
            this.maxAutoExecuteMergesPerEvaluation
        ) {
          this.logger.warn(
            SPLIT_MERGE_LOG_MSG.MERGE_EXECUTION_DEFERRED,
            {
              leftId: candidate.leftId,
              rightId: candidate.rightId,
              reason: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
              maxAutoExecuteMergesPerEvaluation:
                this.maxAutoExecuteMergesPerEvaluation,
            },
          );
          results.mergeDeferred.push({
            leftId: candidate.leftId,
            rightId: candidate.rightId,
            reason: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
          });
          continue;
        }
        mergeExecutionAttempts += 1;
        try {
          const execution = await this.executeManagedMergeCandidate(
            candidate,
            {
              bypassPressure,
            },
          );
          this.recordManagedMergeExecutionOutcome(
            results,
            candidate,
            execution,
          );
        } catch (error) {
          this.logger.error(SPLIT_MERGE_LOG_MSG.MERGE_EXECUTION_FAILED, {
            leftId: candidate.leftId,
            rightId: candidate.rightId,
            error: error.message,
            phase: LOCAL_STR_WORKFLOW_EXECUTION,
          });
          results.mergeErrors.push({
            leftId: candidate.leftId,
            rightId: candidate.rightId,
            error: error.message,
          });
        }
      }
    },

    /**
     * Get the current operation state.
     * @return {string}
     */
    getState() {
      return this.state;
    },

    /**
     * Get the configured thresholds.
     * @return {Object}
     */
    getThresholds() {
      return {
        splitStorageThreshold: this.splitStorageThreshold,
        splitTrafficThreshold: this.splitTrafficThreshold,
        mergeStorageThreshold: this.mergeStorageThreshold,
        mergeTrafficThreshold: this.mergeTrafficThreshold,
        evaluationIntervalMs: this.evaluationIntervalMs,
        maxAutoExecuteSplitsPerEvaluation:
          this.maxAutoExecuteSplitsPerEvaluation,
        maxAutoExecuteMergesPerEvaluation:
          this.maxAutoExecuteMergesPerEvaluation,
      };
    },

    /**
     * Get split and merge evaluation diagnostics for control-plane snapshots.
     * @return {Object}
     */
    getEvaluationDiagnostics() {
      return {
        state: this.state,
        evaluationIntervalMs: this.evaluationIntervalMs,
        reactiveEvaluationDebounceMs: this.reactiveEvaluationDebounceMs,
        inFlight: this.state === operationState.EVALUATING,
        deferredRetryEvaluationPending: this.deferredRetryEvaluation !== null,
        deferredRetryEvaluationDueAtMs: this.deferredRetryEvaluationDueAtMs,
        requestedEvaluationPending: this.requestedEvaluation !== null,
        requestedAtMs: this.lastEvaluationRequestedAtMs,
        requestedReasonCodes: [...this.lastEvaluationReasonCodes],
        requestedPartitionIds: [...this.lastEvaluationPartitionIds],
        lastTrigger: this.lastEvaluationTrigger,
        lastStartedAtMs: this.lastEvaluationStartedAtMs,
        lastCompletedAtMs: this.lastEvaluationCompletedAtMs,
        lastDurationMs: this.lastEvaluationDurationMs,
        lastError: this.lastEvaluationError,
        lastSummary: this.lastEvaluationSummary &&
          typeof this.lastEvaluationSummary === LOCAL_STR_OBJECT ?
          {...this.lastEvaluationSummary} :
          null,
      };
    },

    /**
     * Update thresholds dynamically.
     * @param {Object} thresholds
     */
    setThresholds(thresholds) {
      if (thresholds.splitStorageThreshold !== undefined) {
        this.splitStorageThreshold = thresholds.splitStorageThreshold;
      }
      if (thresholds.splitTrafficThreshold !== undefined) {
        this.splitTrafficThreshold = thresholds.splitTrafficThreshold;
      }
      if (thresholds.mergeStorageThreshold !== undefined) {
        this.mergeStorageThreshold = thresholds.mergeStorageThreshold;
      }
      if (thresholds.mergeTrafficThreshold !== undefined) {
        this.mergeTrafficThreshold = thresholds.mergeTrafficThreshold;
      }
      if (thresholds.evaluationIntervalMs !== undefined) {
        this.evaluationIntervalMs = thresholds.evaluationIntervalMs;
      }
      if (thresholds.maxAutoExecuteSplitsPerEvaluation !== undefined) {
        this.maxAutoExecuteSplitsPerEvaluation =
          thresholds.maxAutoExecuteSplitsPerEvaluation;
      }
      if (thresholds.maxAutoExecuteMergesPerEvaluation !== undefined) {
        this.maxAutoExecuteMergesPerEvaluation =
          thresholds.maxAutoExecuteMergesPerEvaluation;
      }

      this.logger.info(
        SPLIT_MERGE_LOG_MSG.THRESHOLDS_UPDATED,
        this.getThresholds(),
      );
    },

    /**
     * Shutdown the manager.
     */
    shutdown() {
      this.isShutdown = true;
      this.stopPeriodicEvaluation();
      if (this.requestedEvaluationTimer) {
        clearTimeout(this.requestedEvaluationTimer);
        this.requestedEvaluationTimer = null;
      }
      this.requestedEvaluationDueAtMs = null;
      if (this.deferredRetryEvaluationTimer) {
        clearTimeout(this.deferredRetryEvaluationTimer);
        this.deferredRetryEvaluationTimer = null;
      }
      this.deferredRetryEvaluation = null;
      this.deferredRetryEvaluationDueAtMs = null;
      this.requestedEvaluation = null;
      this.clearRequestedEvaluationDiagnostics();
      this.removeAllListeners();
      this.logger.info(SPLIT_MERGE_LOG_MSG.MANAGER_SHUTDOWN);
    },
  };
}

export {createPartitionSplitMergeManagerEvaluationMethods};
