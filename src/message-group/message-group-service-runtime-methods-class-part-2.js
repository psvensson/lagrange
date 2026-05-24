import {defineMessageGroupServiceForwardingRuntimeMethods} from './message-group-service-forwarding-runtime-methods.js';
import {defineMessageGroupServiceRebalancerRuntimeMethods} from './message-group-service-rebalancer-runtime-methods.js';
import {createMessageGroupServiceRuntimeMethodsClassPart1} from './message-group-service-runtime-methods-class-part-1.js';

function createMessageGroupServiceRuntimeMethodsClassPart2(deps = {}) {
  const {
    CDC_BATCH_COMMAND_TYPE,
    CONTROL_PLANE_READINESS_DIMENSION,
    INITIAL_MESSAGE_GROUP_ID,
    LifeRaft,
    MESSAGE_GROUP_CDC_ERROR_MSG,
    MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
    MESSAGE_GROUP_SERVICE_LITERAL,
    MESSAGE_GROUP_SERVICE_LOG_MSG,
    METRICS_LOG_TAG,
    NUM,
    SYSTEM_TABLE_NAME,
    TIME_MS,
    TYPEOF,
    boundCdcForwardErrorDetail,
    buildDeferredCdcForwardError,
    getOrCreateCauseId,
    isSystemTableWriteReady,
    normalizeCauseId,
    normalizePublishedRaftRole,
    wrapCdcProposeError,
    RaftRole,
  } = deps;

  const MessageGroupServiceRuntimeMethodsPart1 =
    createMessageGroupServiceRuntimeMethodsClassPart1(deps);
  class MessageGroupServiceRuntimeMethods extends MessageGroupServiceRuntimeMethodsPart1 {
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
        Number.isInteger(options.relayDepth) && options.relayDepth >= NUM.ZERO ?
          options.relayDepth :
          NUM.ZERO;
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
      if (normalizedEvents.length === NUM.ZERO) {
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
        Array.isArray(this.replicaIds) && this.replicaIds.length <= NUM.ONE;
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
          normalizedEvents.length === NUM.ONE ?
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
              normalizedEvents.length === NUM.ONE ?
                normalizedEvents[NUM.ZERO].tableName :
                MESSAGE_GROUP_SERVICE_LITERAL.BATCH,
            operation:
              normalizedEvents.length === NUM.ONE ?
                normalizedEvents[NUM.ZERO].operation :
                `batch:${normalizedEvents.length}`,
            logIndex: entry.index,
            groupId: this.groupId,
            replicaId: this.replicaId,
            causeId: normalizeCauseId(normalizedEvents[NUM.ZERO].causeId),
            eventCount: normalizedEvents.length,
          },
        );
        if (!shouldApplyLocally) {
          return;
        }
        if (appliedEvents.length === NUM.ZERO) {
          return;
        }
        this.emitCDCAppliedEvents(appliedEvents, entry.index);
        return;
      }
      if (appliedEvents.length === NUM.ZERO) {
        return;
      }
      if (!skipReplication) {
        const entry = this.operationLedger.appendEntry({
          ...(normalizedEvents.length === NUM.ONE ?
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
        this.retryMaxAttempts > NUM.ZERO ?
          this.retryMaxAttempts :
          NUM.ONE;
      const proposeTimeoutMs = this.computeCdcProposeTimeoutMs(
        configuredRetryBudget,
      );
      const leaderTargetSource =
        typeof this.raftProvider?.proposeWithLeaderRouting === 'function' ?
          'forward_to_leader' :
          'local_raft_propose';
      try {
        if (
          typeof this.raftProvider.proposeWithLeaderRouting === TYPEOF.FUNCTION
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
                  routeContext.attempt >= NUM.ONE ?
                    routeContext.attempt :
                    NUM.ONE;
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
     * Determine whether this replica is currently the active Raft leader.
     * @return {boolean}
     * @private
     */
    isCurrentRaftLeader() {
      return Boolean(
        this.raft &&
        this.raft.state === LifeRaft.LEADER &&
        this.isLeaderReplica(),
      );
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
        this.retryInitialDelayMs > NUM.ZERO ?
          this.retryInitialDelayMs :
          NUM.HUNDRED;
      const retryBackoffMultiplier =
        Number.isFinite(this.retryBackoffMultiplier) &&
        this.retryBackoffMultiplier >= NUM.ONE ?
          this.retryBackoffMultiplier :
          NUM.TWO;
      const retryMaxDelayMs =
        Number.isFinite(this.retryMaxDelayMs) && this.retryMaxDelayMs > NUM.ZERO ?
          this.retryMaxDelayMs :
          TIME_MS.SECOND * NUM.TEN;
      return Math.min(
        retryMaxDelayMs,
        Math.floor(
          retryInitialDelayMs *
            retryBackoffMultiplier ** Math.max(NUM.ZERO, attempt - NUM.TWO),
        ),
      );
    }
    resolveStrictCdcForwardRetryAfterMs() {
      return Math.max(
        NUM.ONE,
        this.computeCdcForwardRetryDelayMs(NUM.ONE),
        Number.isFinite(this.forwardTargetSuppressionMs) ?
          this.forwardTargetSuppressionMs :
          NUM.ZERO,
        Number.isFinite(this.forwardTopologyRepairCooldownMs) ?
          this.forwardTopologyRepairCooldownMs :
          NUM.ZERO,
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
        Number.isInteger(attemptBudget) && attemptBudget > NUM.ZERO ?
          attemptBudget :
          NUM.ONE;
      const deliveryTimeoutMs =
        Number.isFinite(this.deliveryTimeoutMs) &&
        this.deliveryTimeoutMs > NUM.ZERO ?
          Math.floor(this.deliveryTimeoutMs) :
          TIME_MS.SECOND * NUM.FIVE;
      const safetyBufferMs = NUM.TWO * NUM.HUNDRED;
      const perAttemptBudgetMs = Math.floor(
        Math.max(NUM.HUNDRED, deliveryTimeoutMs - safetyBufferMs) / retryBudget,
      );
      const cappedBudgetMs = Math.min(
        TIME_MS.SECOND + NUM.FIVE * NUM.HUNDRED,
        perAttemptBudgetMs,
      );
      return Math.max(NUM.TWO * NUM.HUNDRED, cappedBudgetMs);
    }
    /**
     * Query the system table cache.
     * Returns a read-only view of the cache.
     * @param {string} tableName - System table name.
     * @param {Object} query - Query parameters.
     * @return {Promise<*>} Query result.
     */
    async querySystemCache(tableName, query = {}) {
      if (!this.initialized) {
        throw new Error(
          MESSAGE_GROUP_SERVICE_LITERAL.MESSAGEGROUPSERVICE_NOT_INITIALIZED,
        );
      }
      // Use read-only cache wrapper
      if (query.key) {
        return this.readOnlyCache.get(tableName, query.key);
      }
      if (query.predicate) {
        if (query.findOne) {
          return this.readOnlyCache.find(tableName, query.predicate);
        }
        return this.readOnlyCache.filter(tableName, query.predicate);
      }
      return this.readOnlyCache.getAll(tableName);
    }
    /**
     * Get the read-only system table cache.
     * @return {ReadOnlySystemTableCache} Read-only cache wrapper.
     */
    getReadOnlyCache() {
      return this.readOnlyCache;
    }
    /**
     * Get the underlying writable cache (for CDC handlers only).
     * @return {SystemTableCache} Writable cache.
     */
    getWritableCache() {
      return this.systemTableCache;
    }
    cancelLeaderOwnedActivation() {
      this.leaderActivationGate.cancel({clearActivatedTerm: true});
    }
    scheduleLeaderOwnedActivation(term) {
      this.leaderActivationGate.schedule(
        term,
        () => {
          if (!this.raft || !this.isLeaderReplica()) {
            return;
          }
          this.updateRebalancerLeadership();
          const existingSubscriptions = this.cdcHandler.getSubscriptions();
          if (
            existingSubscriptions.length > NUM.ZERO &&
            this.lastLeaderCdcResubscribeTerm !== term
          ) {
            this.lastLeaderCdcResubscribeTerm = term;
            this.logger.info(
              MESSAGE_GROUP_SERVICE_LOG_MSG.CDC_RESUBSCRIBE_ON_LEADER,
              {
                term,
                replicaId: this.replicaId,
                groupId: this.groupId,
                tableCount: existingSubscriptions.length,
              },
            );
            for (const tableName of existingSubscriptions) {
              this.subscribeToCDC(tableName);
            }
            this.logger.info(
              MESSAGE_GROUP_SERVICE_LOG_MSG.CDC_RESUBSCRIBE_ON_LEADER_COMPLETE,
              {
                term,
                replicaId: this.replicaId,
                groupId: this.groupId,
                tableCount: existingSubscriptions.length,
              },
            );
          }
          this.logger.info(MESSAGE_GROUP_SERVICE_LITERAL.BECAME_LEADER, {
            term,
            replicaId: this.replicaId,
            groupId: this.groupId,
          });
          this.emit(MESSAGE_GROUP_SERVICE_LITERAL.LEADERELECTED, {
            leaderId: this.replicaId,
            term,
            groupId: this.groupId,
          });
        },
        {
          immediate: this.replicaIds.length === NUM.ONE,
          shouldActivate: () => this.raft !== null && this.isLeaderReplica(),
        },
      );
    }
    /**
     * Queue a raft role update for persistence.
     * @param {string} role - New raft role.
     * @private
     */
    queueRoleUpdate(role) {
      this.roleMutationHelper.queue(
        normalizePublishedRaftRole(role, {collapseLeaderToFollower: true}),
      );
    }
    /**
     * Queue a message group leader update for persistence.
     * @param {string} leaderNodeId - Leader node ID.
     * @private
     */
    queueLeaderNodeUpdate(leaderNodeId) {
      this.leaderNodeMutationHelper.queue(leaderNodeId);
    }
    /**
     * Persist the latest pending raft role update.
     * @return {Promise<void>}
     * @private
     */
    async flushRoleUpdate() {
      return this.roleMutationHelper.flush();
    }
    /**
     * Persist the latest pending message group leader update.
     * @return {Promise<void>}
     * @private
     */
    async flushLeaderNodeUpdate() {
      return this.leaderNodeMutationHelper.flush();
    }
    /**
     * Check if the message_groups partition leader is available for writes.
     * @return {boolean} True if a leader with an address is known.
     * @private
     */
    isMessageGroupsLeaderAvailable() {
      if (
        isSystemTableWriteReady(
          this.systemTableCache,
          SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
        )
      ) {
        return true;
      }
      return (
        this.cdcIntegrationService?.canWriteSystemTableLocally?.(
          SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
        ) === true
      );
    }
    /**
     * Check if the services table is writable through either cache-visible
     * routing metadata or the local services-p1 leader owner.
     * @return {boolean} True if writes can be issued safely.
     * @private
     */
    isServicesLeaderAvailable() {
      if (
        isSystemTableWriteReady(
          this.systemTableCache,
          SYSTEM_TABLE_NAME.SERVICES,
        )
      ) {
        return true;
      }
      return (
        this.cdcIntegrationService?.canWriteSystemTableLocally?.(
          SYSTEM_TABLE_NAME.SERVICES,
        ) === true
      );
    }
    getMetadataPublicationDeliveryPriority() {
      return this.groupId === INITIAL_MESSAGE_GROUP_ID ?
        MESSAGE_GROUP_SERVICE_LITERAL.CRITICAL :
        MESSAGE_GROUP_SERVICE_LITERAL.BACKGROUND;
    }
    getMetadataPublicationReadinessDimension() {
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    /**
     * Check if this replica is the leader.
     * Requirements: 5.5
     * @return {boolean} True if leader.
     */
    isLeaderReplica() {
      return this.role === RaftRole.LEADER;
    }
    /**
     * Get the current leader ID.
     * Requirements: 5.4
     * @return {string|null} Leader replica ID.
     */
    getLeaderId() {
      return this.leaderId;
    }
    /**
     * Get the current Raft role.
     * Requirements: 5.5
     * @return {string} Current role.
     */
    getRole() {
      return this.role;
    }
    /**
     * Get the current term.
     * @return {number} Current term.
     */
    getCurrentTerm() {
      return this.raft ?
        this.raftProvider.getCurrentTerm(this.raft) :
        this.operationLedger.currentTerm;
    }
    /**
     * Get pending message count.
     * @return {number} Number of pending messages.
     */
    getPendingMessageCount() {
      return this.pendingMessages.size;
    }
    /**
     * Get service status.
     * @return {Object} Service status.
     */
    getStatus() {
      return {
        groupId: this.groupId,
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        role: this.role,
        isLeader: this.isLeader,
        leaderId: this.leaderId,
        term: this.raft ?
          this.raftProvider.getCurrentTerm(this.raft) :
          this.operationLedger.currentTerm,
        logLength: this.operationLedger.getLogLength(),
        pendingMessages: this.pendingMessages.size,
        acknowledgedMessages: this.acknowledgedMessages.size,
        cdcSubscriptions: this.cdcHandler.getSubscriptions(),
        initialized: this.initialized,
      };
    }
    /**
     * Sleep for a specified duration.
     * @param {number} ms - Milliseconds to sleep.
     * @return {Promise<void>}
     * @private
     */
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Shutdown the message group service.
     * @return {Promise<void>}
     */
    async shutdown() {
      this.logger.info(
        MESSAGE_GROUP_SERVICE_LITERAL.SHUTTING_DOWN_MESSAGE_GROUP_SERVICE,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
        },
      );
      this.leaderActivationGate.shutdown();
      this.peerReconciliationScheduled = false;
      if (
        this.systemTableCache &&
        typeof this.systemTableCache.offCacheChange === TYPEOF.FUNCTION &&
        this.systemTableCacheChangeListener
      ) {
        this.systemTableCache.offCacheChange(
          this.systemTableCacheChangeListener,
        );
      }
      if (this.raftRuntime) {
        await this.raftRuntime.shutdown();
        this.raftRuntime = null;
      }
      this.raft = null;
      this.joinSuppressedHeartbeat = null;
      if (
        typeof this.releaseMetadataPublicationReadinessListener ===
        TYPEOF.FUNCTION
      ) {
        this.releaseMetadataPublicationReadinessListener();
      }
      this.releaseMetadataPublicationReadinessListener = null;
      this._metadataPublicationReadinessState = null;
      this.roleMutationHelper.shutdown();
      this.leaderNodeMutationHelper.shutdown();
      await this.quiesceRebalancing();
      this.cdcHandler.shutdown();
      this.initialized = false;
      this.pendingMessages.clear();
      this.messageCallbacks.clear();
      this.emit(MESSAGE_GROUP_SERVICE_LITERAL.SHUTDOWN, {
        groupId: this.groupId,
        replicaId: this.replicaId,
      });
    }
  }

  defineMessageGroupServiceForwardingRuntimeMethods(
    MessageGroupServiceRuntimeMethods.prototype,
  );
  defineMessageGroupServiceRebalancerRuntimeMethods(
    MessageGroupServiceRuntimeMethods.prototype,
    deps,
  );

  return MessageGroupServiceRuntimeMethods;
}

export {createMessageGroupServiceRuntimeMethodsClassPart2};
