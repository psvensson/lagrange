import {
  applyCDCEvent as runApplyCDCEvent,
  emitCDCAppliedEvents as runEmitCDCAppliedEvents,
  normalizeCDCBatchEvents as runNormalizeCDCBatchEvents,
} from './message-group-service-cdc-propagation-runtime-methods.js';

const MESSAGE_GROUP_SERVICE_CDC_REPLICATION_RUNTIME_LITERAL = {
  CONSTRUCTOR: 'constructor',
};

function createMessageGroupServiceCdcReplicationRuntimeMethods(deps = {}) {
  const {
    CDC_BATCH_COMMAND_TYPE,
    CDC_FORWARD_MAX_RELAY_DEPTH,
    MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    MESSAGE_GROUP_APPLICATION_STATUS,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_INGRESS_ACTION,
    MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
    MESSAGE_GROUP_SERVICE_LITERAL,
    METRICS_LOG_TAG,
    NUM,
    TIME_MS,
    boundCdcForwardErrorDetail,
    buildDeferredCdcForwardError,
    buildLatencyCdcPropagationResult,
    getOrCreateCauseId,
    normalizeCauseId,
    wrapCdcProposeError,
  } = deps;
  const cdcPropagationRuntimeDeps = {
    CDC_FORWARD_MAX_RELAY_DEPTH,
    MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    MESSAGE_GROUP_APPLICATION_STATUS,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_INGRESS_ACTION,
    MESSAGE_GROUP_SERVICE_LITERAL,
    NUM,
    buildLatencyCdcPropagationResult,
    normalizeCauseId,
  };

  class MessageGroupServiceCdcReplicationRuntimeMethods {
    /**
     * Subscribe to CDC events from a system table.
     * @param {string} tableName - System table name.
     * @return {Promise<void>}
     */
    async subscribeToCDC(tableName) {
      this.cdcHandler.subscribe(tableName);
      this.logger.debug(MESSAGE_GROUP_SERVICE_LITERAL.SUBSCRIBED_TO_CDC, {
        tableName,
        groupId: this.groupId,
      });
    }
    /**
     * Apply a CDC event to the system table cache.
     * @param {string} tableName - System table name.
     * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE).
     * @param {Object} data - Record data.
     * @param {Object} [options]
     * @param {boolean} [options.skipReplication]
     * @param {boolean} [options.skipSubscriptionCheck]
     * @return {Promise<void>}
     */
    async applyCDCEvent(tableName, operation, data, options = {}) {
      return runApplyCDCEvent(
        this,
        tableName,
        operation,
        data,
        options,
      );
    }
    /**
     * Normalize CDC batch events into one canonical replicated command payload.
     * @param {Array<Object>} events
     * @param {Object} [options]
     * @return {Array<Object>}
     * @private
     */
    normalizeCDCBatchEvents(events, options = {}) {
      return runNormalizeCDCBatchEvents(
        this,
        cdcPropagationRuntimeDeps,
        events,
        options,
      );
    }
    /**
     * Emit canonical cdcApplied notifications for one or more events.
     * @param {Array<Object>} events
     * @param {?number} logIndex
     * @private
     */
    emitCDCAppliedEvents(events, logIndex = null) {
      return runEmitCDCAppliedEvents(
        this,
        cdcPropagationRuntimeDeps,
        events,
        logIndex,
      );
    }
    /**
     * Record CDC propagation metrics for one or more events.
     * @param {Array<Object>} events
     * @param {number} applyStartMs
     * @private
     */
    recordCDCPropagationMetrics(events, applyStartMs) {
      for (const event of events) {
        try {
          const handlerDurationMs = this.now() - applyStartMs;
          const metricsData = {
            tableName: event.tableName,
            operation: event.operation,
            causeId: normalizeCauseId(event.causeId),
            handlerDurationMs,
          };
          if (event.timestamp != null) {
            metricsData.eventAgeMs = this.now() - event.timestamp;
          }
          this.logger.info(METRICS_LOG_TAG.CDC_PROPAGATION, metricsData);
        } catch (_metricsErr) {
          void _metricsErr;
        }
      }
    }
    /**
     * Apply one or more CDC events through the canonical cache/raft owner.
     * @param {Array<Object>} events
     * @param {Object} [options]
     * @param {boolean} [options.skipReplication]
     * @param {boolean} [options.skipSubscriptionCheck]
     * @return {Promise<void>}
     */
    async applyCDCBatch(events, options = {}) {
      const applyStartMs = this.now();
      const skipSubscriptionCheck = options.skipSubscriptionCheck === true;
      const skipReplication = options.skipReplication === true;
      const relayDepth =
        Number.isInteger(options.relayDepth) && options.relayDepth >= 0 ?
          options.relayDepth :
          0;
      const addressedStrictConvergence =
        options[
          MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD.ADDRESSED_STRICT_CONVERGENCE
        ] === true;
      const normalizedEvents = this.normalizeCDCBatchEvents(
        events,
        options,
      ).map((event) => ({
        ...event,
        causeId: getOrCreateCauseId(event.causeId),
      }));
      if (normalizedEvents.length === 0) {
        return;
      }
      const strictEvent = normalizedEvents.find((event) => {
        return this.shouldUseStrictCDCForwarding({
          tableName: event.tableName,
          operation: event.operation,
        });
      });
      const strictIngressDecision = strictEvent ?
        this.resolveCdcIngressDecision({
          tableName: strictEvent.tableName,
          operation: strictEvent.operation,
          relayDepth,
          [MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD.ADDRESSED_STRICT_CONVERGENCE]:
              addressedStrictConvergence,
        }) :
        null;
      const useCanonicalLocalStrictIngress =
        strictIngressDecision?.localIngress === true;
      const isSingleReplicaGroup =
        Array.isArray(this.replicaIds) && this.replicaIds.length <= 1;
      const requiresRaftReplication =
        !skipReplication &&
        !useCanonicalLocalStrictIngress &&
        !isSingleReplicaGroup;
      const shouldApplyLocally =
        !requiresRaftReplication || this.isCurrentRaftLeader();
      if (requiresRaftReplication && !shouldApplyLocally) {
        if (strictEvent && strictIngressDecision?.ready !== true) {
          throw buildDeferredCdcForwardError(
            strictIngressDecision.reason ||
              MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
            Number.isFinite(strictIngressDecision.strictForwardRetryAfterMs) ?
              strictIngressDecision.strictForwardRetryAfterMs :
              this.resolveStrictCdcForwardRetryAfterMs(),
          );
        }
      }
      const appliedEvents = [];
      if (shouldApplyLocally) {
        for (const event of normalizedEvents) {
          const applied = this.cdcHandler.applyImmediate(
            {
              tableName: event.tableName,
              operation: event.operation,
              data: event.data,
              timestamp: event.timestamp,
              causeId: event.causeId,
            },
            {skipSubscriptionCheck},
          );
          if (applied) {
            appliedEvents.push(event);
          }
        }
      }
      if (requiresRaftReplication) {
        const cdcCommand =
          normalizedEvents.length === 1 ?
            {
              type: 'CDC',
              tableName: normalizedEvents[0].tableName,
              operation: normalizedEvents[0].operation,
              data: normalizedEvents[0].data,
              timestamp: normalizedEvents[0].timestamp,
              causeId: normalizedEvents[0].causeId,
              replayOnly: normalizedEvents[0].replayOnly === true,
            } :
            {
              type: CDC_BATCH_COMMAND_TYPE,
              events: normalizedEvents,
            };
        // Replicate via Raft so all message group replicas (and their
        // co-located system caches) receive this CDC event. Cache updates
        // are applied only from committed CDC entries.
        await this.proposeCDCCommand(cdcCommand);
        // Retain only successfully proposed commands in the bounded local
        // diagnostic ledger so failed relays do not accumulate indefinitely.
        const entry = this.operationLedger.appendEntry({...cdcCommand});
        this.recordCDCPropagationMetrics(normalizedEvents, applyStartMs);
        this.logger.debug(
          MESSAGE_GROUP_SERVICE_LITERAL.CDC_EVENT_PROPOSED_FOR_REPLICATION_AWAITING_COMMIT_APPLY,
          {
            tableName:
              normalizedEvents.length === 1 ?
                normalizedEvents[0].tableName :
                MESSAGE_GROUP_SERVICE_LITERAL.BATCH,
            operation:
              normalizedEvents.length === 1 ?
                normalizedEvents[0].operation :
                `batch:${normalizedEvents.length}`,
            logIndex: entry.index,
            groupId: this.groupId,
            replicaId: this.replicaId,
            causeId: normalizeCauseId(normalizedEvents[0].causeId),
            eventCount: normalizedEvents.length,
          },
        );
        if (!shouldApplyLocally) {
          return;
        }
        if (appliedEvents.length === 0) {
          return;
        }
        this.emitCDCAppliedEvents(appliedEvents, entry.index);
        return;
      }
      if (appliedEvents.length === 0) {
        return;
      }
      if (!skipReplication) {
        const entry = this.operationLedger.appendEntry({
          ...(normalizedEvents.length === 1 ?
            {
              type: 'CDC',
              tableName: normalizedEvents[0].tableName,
              operation: normalizedEvents[0].operation,
              data: normalizedEvents[0].data,
              timestamp: normalizedEvents[0].timestamp,
              causeId: normalizedEvents[0].causeId,
              replayOnly: normalizedEvents[0].replayOnly === true,
            } :
            {
              type: CDC_BATCH_COMMAND_TYPE,
              events: normalizedEvents,
            }),
        });
        this.recordCDCPropagationMetrics(normalizedEvents, applyStartMs);
        this.emitCDCAppliedEvents(appliedEvents, entry.index);
        return;
      }
      this.recordCDCPropagationMetrics(normalizedEvents, applyStartMs);
      this.emitCDCAppliedEvents(appliedEvents, null);
    }
    /**
     * Propose a CDC command through Raft and fail closed on replication errors.
     * @param {Object} cdcCommand
     * @return {Promise<void>}
     * @private
     */
    async proposeCDCCommand(cdcCommand) {
      const configuredRetryBudget =
        Number.isInteger(this.retryMaxAttempts) &&
        this.retryMaxAttempts > 0 ?
          this.retryMaxAttempts :
          1;
      const proposeTimeoutMs = this.computeCdcProposeTimeoutMs(
        configuredRetryBudget,
      );
      const leaderTargetSource =
        typeof this.raftProvider?.proposeWithLeaderRouting === 'function' ?
          'forward_to_leader' :
          'local_raft_propose';
      try {
        if (
          typeof this.raftProvider.proposeWithLeaderRouting === 'function'
        ) {
          await this.raftProvider.proposeWithLeaderRouting(
            this.raft,
            cdcCommand,
            {
              maxAttempts: configuredRetryBudget,
              proposeTimeoutMs,
              shouldProposeLocally: () => this.isCurrentRaftLeader(),
              forwardToLeader: async (command, routeContext = {}) => {
                const relayDepth =
                  Number.isInteger(routeContext?.attempt) &&
                  routeContext.attempt >= 1 ?
                    routeContext.attempt :
                    1;
                if (command?.type === CDC_BATCH_COMMAND_TYPE) {
                  await this.forwardCDCBatchToLeader(
                    Array.isArray(command?.events) ? command.events : [],
                    {
                      relayDepth,
                      replayOnly: command?.replayOnly === true,
                    },
                  );
                  return;
                }
                await this.forwardCDCEventToLeader(
                  command.tableName,
                  command.operation,
                  command.data,
                  {
                    timestamp: command.timestamp,
                    causeId: command.causeId,
                    replayOnly: command.replayOnly === true,
                    relayDepth,
                  },
                );
              },
              computeRetryDelayMs: (attempt) =>
                this.computeCdcForwardRetryDelayMs(attempt),
              onRetry: ({attempt, mode, retryDelayMs, error}) => {
                this.logger.warn(
                  MESSAGE_GROUP_SERVICE_LITERAL.RETRYING_RAFT_CDC_COMMAND,
                  {
                    groupId: this.groupId,
                    replicaId: this.replicaId,
                    tableName: cdcCommand.tableName,
                    causeId: normalizeCauseId(cdcCommand.causeId),
                    attempt,
                    mode,
                    retryDelayMs,
                    error: error?.message || null,
                  },
                );
              },
            },
          );
          return;
        }
        await new Promise((resolve, reject) => {
          this.raftProvider.propose(this.raft, cdcCommand, (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      } catch (error) {
        this.logger.error(
          MESSAGE_GROUP_SERVICE_LITERAL.RAFT_CDC_COMMAND_FAILED,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            tableName: cdcCommand.tableName,
            causeId: normalizeCauseId(cdcCommand.causeId),
            attempts: configuredRetryBudget,
            configuredRetryBudget,
            proposeTimeoutMs,
            isCurrentRaftLeader: this.isCurrentRaftLeader(),
            raftState: this.raft?.state || null,
            leaderTargetSource,
            error: error?.message || null,
          },
        );
        throw wrapCdcProposeError(
          `${MESSAGE_GROUP_CDC_ERROR_MSG.RAFT_PROPOSE_FAILED}: ` +
            `${boundCdcForwardErrorDetail(error?.message) || MESSAGE_GROUP_SERVICE_LITERAL.UNKNOWN_ERROR}`,
          error,
        );
      }
    }
    /**
     * Compute retry delay for CDC forward attempts.
     * @param {number} attempt
     * @return {number}
     * @private
     */
    computeCdcForwardRetryDelayMs(attempt) {
      const retryInitialDelayMs =
        Number.isFinite(this.retryInitialDelayMs) &&
        this.retryInitialDelayMs > 0 ?
          this.retryInitialDelayMs :
          NUM.HUNDRED;
      const retryBackoffMultiplier =
        Number.isFinite(this.retryBackoffMultiplier) &&
        this.retryBackoffMultiplier >= 1 ?
          this.retryBackoffMultiplier :
          2;
      const retryMaxDelayMs =
        Number.isFinite(this.retryMaxDelayMs) && this.retryMaxDelayMs > 0 ?
          this.retryMaxDelayMs :
          TIME_MS.SECOND * NUM.TEN;
      return Math.min(
        retryMaxDelayMs,
        Math.floor(
          retryInitialDelayMs *
            retryBackoffMultiplier ** Math.max(0, attempt - 2),
        ),
      );
    }
    resolveStrictCdcForwardRetryAfterMs() {
      return Math.max(
        1,
        this.computeCdcForwardRetryDelayMs(1),
        Number.isFinite(this.forwardTargetSuppressionMs) ?
          this.forwardTargetSuppressionMs :
          0,
        Number.isFinite(this.forwardTopologyRepairCooldownMs) ?
          this.forwardTopologyRepairCooldownMs :
          0,
      );
    }
    /**
     * Compute bounded timeout for one CDC Raft propose attempt.
     * Keeps end-to-end forwarding attempts below transport message timeout.
     * @param {number} attemptBudget
     * @return {number}
     * @private
     */
    computeCdcProposeTimeoutMs(attemptBudget) {
      const retryBudget =
        Number.isInteger(attemptBudget) && attemptBudget > 0 ?
          attemptBudget :
          1;
      const deliveryTimeoutMs =
        Number.isFinite(this.deliveryTimeoutMs) &&
        this.deliveryTimeoutMs > 0 ?
          Math.floor(this.deliveryTimeoutMs) :
          TIME_MS.SECOND * NUM.FIVE;
      const safetyBufferMs = 2 * NUM.HUNDRED;
      const perAttemptBudgetMs = Math.floor(
        Math.max(NUM.HUNDRED, deliveryTimeoutMs - safetyBufferMs) / retryBudget,
      );
      const cappedBudgetMs = Math.min(
        TIME_MS.SECOND + NUM.FIVE * NUM.HUNDRED,
        perAttemptBudgetMs,
      );
      return Math.max(2 * NUM.HUNDRED, cappedBudgetMs);
    }
  }

  return MessageGroupServiceCdcReplicationRuntimeMethods;
}

function defineMessageGroupServiceCdcReplicationRuntimeMethods(
  prototype,
  deps = {},
) {
  const MessageGroupServiceCdcReplicationRuntimeMethods =
    createMessageGroupServiceCdcReplicationRuntimeMethods(deps);
  const descriptors = Object.getOwnPropertyDescriptors(
    MessageGroupServiceCdcReplicationRuntimeMethods.prototype,
  );
  delete descriptors[
    MESSAGE_GROUP_SERVICE_CDC_REPLICATION_RUNTIME_LITERAL.CONSTRUCTOR
  ];
  Object.defineProperties(prototype, descriptors);
}

export {defineMessageGroupServiceCdcReplicationRuntimeMethods};
