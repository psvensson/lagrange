import {createMessageGroupForwardingOwnerTargetMethods} from
  './message-group-forwarding-owner-target-methods.js';

function createMessageGroupForwardingOwnerDeliveryMethods(options = {}) {
  const buildForwardTopologyRepairReadOptions =
    options.buildForwardTopologyRepairReadOptions;
  const resolveCDCForwardDeliveryProfile =
    options.resolveCDCForwardDeliveryProfile;
  const getSystemCachePrimaryKeyFieldOrFallback =
    options.getSystemCachePrimaryKeyFieldOrFallback;
  const buildControlPlaneWorkloadProfile =
    options.buildControlPlaneWorkloadProfile;
  const normalizeCauseId = options.normalizeCauseId;
  const column = options.column || {};
  const controlPlaneReadStrategy = options.controlPlaneReadStrategy || {};
  const forwardTopologyRepairOutcome =
    options.forwardTopologyRepairOutcome || {};
  const messageGroupApplicationErrorMsg =
    options.messageGroupApplicationErrorMsg || {};
  const messageGroupApplicationMessageType =
    options.messageGroupApplicationMessageType || {};
  const messageGroupCdcErrorMsg = options.messageGroupCdcErrorMsg || {};
  const messageGroupCdcIngressAction =
    options.messageGroupCdcIngressAction || {};
  const messageGroupCdcLogContextField =
    options.messageGroupCdcLogContextField || {};
  const messageGroupForwardingOwnerLiteral =
    options.messageGroupForwardingOwnerLiteral || {};
  const num = options.num || {};
  const serviceType = options.serviceType || {};
  const tables = options.tables || {};
  const transportErrorMsg = options.transportErrorMsg || {};
  const typeofToken = options.typeofToken || {};
  const forwardTopologyRepairWorkloadClass =
    options.forwardTopologyRepairWorkloadClass;

  return {
    ...createMessageGroupForwardingOwnerTargetMethods(options),

    shouldRepairForwardTopology(errorMessage) {
      return typeof errorMessage === typeofToken.STRING &&
        errorMessage.includes(messageGroupCdcErrorMsg.FORWARD_LEADER_UNKNOWN);
    },

    canRepairAuthoritativeForwardTopology() {
      const service = this.service;
      const gateway = service.getControlPlaneSystemTableGateway();
      return Boolean(
        service.systemTableCache &&
          typeof service.systemTableCache.applySystemTableChange ===
            typeofToken.FUNCTION &&
          gateway &&
          typeof gateway.executeRead === typeofToken.FUNCTION,
      );
    },

    async maybeRepairAuthoritativeForwardTopology(context = {}) {
      const service = this.service;
      if (!service.canRepairAuthoritativeForwardTopology()) {
        return false;
      }

      if (this.forwardTopologyRepairInFlight) {
        return this.forwardTopologyRepairInFlight;
      }

      const nowMs = service.now();
      if (
        (nowMs - this.lastForwardTopologyRepairAtMs) <
        this.lastForwardTopologyRepairCooldownMs
      ) {
        return false;
      }

      this.forwardTopologyRepairInFlight = (async () => {
        try {
          const repairResult =
            await service.repairAuthoritativeForwardTopology(context);
          if (repairResult.repaired === true) {
            this.lastForwardTopologyRepairCooldownMs =
              service.forwardTopologyRepairCooldownMs;
          } else if (
            repairResult.outcome === forwardTopologyRepairOutcome.UNCHANGED
          ) {
            this.lastForwardTopologyRepairCooldownMs =
              service.forwardTopologyRepairNoChangeCooldownMs;
          } else {
            this.lastForwardTopologyRepairCooldownMs =
              service.forwardTopologyRepairFailureCooldownMs;
          }
          return repairResult.repaired === true;
        } catch (error) {
          this.lastForwardTopologyRepairCooldownMs =
            service.forwardTopologyRepairFailureCooldownMs;
          service.logger.warn(
            messageGroupForwardingOwnerLiteral
              .AUTHORITATIVE_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_REPAIR_FAILED,
            {
              groupId: service.groupId,
              replicaId: service.replicaId,
              staleServiceId: context?.serviceId || null,
              staleAddress: context?.address || null,
              error: error?.message || String(error),
            },
          );
          return false;
        } finally {
          this.lastForwardTopologyRepairAtMs = service.now();
          this.forwardTopologyRepairInFlight = null;
        }
      })();

      return this.forwardTopologyRepairInFlight;
    },

    async repairAuthoritativeForwardTopology(context = {}) {
      const service = this.service;
      const gateway = service.getControlPlaneSystemTableGateway();
      if (!gateway || typeof gateway.executeRead !== typeofToken.FUNCTION) {
        return this.buildForwardTopologyRepairOutcome(
          false,
          forwardTopologyRepairOutcome.FAILED,
        );
      }
      const workloadProfile = buildControlPlaneWorkloadProfile(
        forwardTopologyRepairWorkloadClass,
      );
      const readOptions = buildForwardTopologyRepairReadOptions(
        service,
        workloadProfile,
      );
      const [groupResult, serviceResult] = await Promise.all([
        gateway.executeRead(
          {
            tableName: tables.MESSAGE_GROUPS,
            sql:
              `SELECT * FROM ${tables.MESSAGE_GROUPS} ` +
              `WHERE ${column.GROUP_ID} = ?`,
            params: [service.groupId],
            strategy: controlPlaneReadStrategy.AUTHORITATIVE_REQUIRED,
            owner:
              messageGroupForwardingOwnerLiteral
                .MESSAGE_DASH_GROUP_DASH_SERVICE,
          },
          readOptions,
        ),
        gateway.executeRead(
          {
            tableName: tables.SERVICES,
            sql:
              `SELECT * FROM ${tables.SERVICES} ` +
              `WHERE ${column.GROUP_ID} = ? ` +
              `AND ${column.SERVICE_TYPE} = ?`,
            params: [service.groupId, serviceType.MESSAGE_GROUP],
            strategy: controlPlaneReadStrategy.AUTHORITATIVE_REQUIRED,
            owner:
              messageGroupForwardingOwnerLiteral
                .MESSAGE_DASH_GROUP_DASH_SERVICE,
          },
          readOptions,
        ),
      ]);

      const groupRows =
        groupResult?.success === true && Array.isArray(groupResult.rows) ?
          groupResult.rows :
          [];
      const serviceRows =
        serviceResult?.success === true && Array.isArray(serviceResult.rows) ?
          serviceResult.rows :
          [];
      const nodeIds = [...new Set(serviceRows
        .map((row) => row?.[column.NODE_ID] || row?.node_id || null)
        .filter((nodeId) => {
          return typeof nodeId === typeofToken.STRING &&
            nodeId.length > num.ZERO;
        }))];

      let nodeRows = [];
      if (nodeIds.length > num.ZERO) {
        const placeholders = nodeIds.map(() => '?').join(', ');
        const nodeResult = await gateway.executeRead(
          {
            tableName: tables.NODES,
            sql:
              `SELECT * FROM ${tables.NODES} ` +
              `WHERE ${column.NODE_ID} IN (${placeholders})`,
            params: nodeIds,
            strategy: controlPlaneReadStrategy.AUTHORITATIVE_REQUIRED,
            owner:
              messageGroupForwardingOwnerLiteral
                .MESSAGE_DASH_GROUP_DASH_SERVICE,
          },
          readOptions,
        );
        if (nodeResult?.success === true && Array.isArray(nodeResult.rows)) {
          nodeRows = nodeResult.rows;
        }
      }

      let repairedRowCount = num.ZERO;
      repairedRowCount += await service.applyAuthoritativeForwardTopologyRows(
        tables.MESSAGE_GROUPS,
        groupRows,
      );
      repairedRowCount +=
        await service.reconcileAuthoritativeForwardServiceRows(serviceRows);
      repairedRowCount += await service.applyAuthoritativeForwardTopologyRows(
        tables.NODES,
        nodeRows,
      );

      if (repairedRowCount > num.ZERO) {
        service.logger.warn(
          messageGroupForwardingOwnerLiteral
            .REPAIRED_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_FROM_AUTHORITATIVE_ROWS,
          {
            groupId: service.groupId,
            replicaId: service.replicaId,
            staleServiceId: context?.serviceId || null,
            staleAddress: context?.address || null,
            repairedRowCount,
            repairedGroupRowCount: groupRows.length,
            repairedServiceRowCount: serviceRows.length,
            repairedNodeRowCount: nodeRows.length,
          },
        );
        return this.buildForwardTopologyRepairOutcome(
          true,
          forwardTopologyRepairOutcome.REPAIRED,
        );
      }

      return this.buildForwardTopologyRepairOutcome(
        false,
        forwardTopologyRepairOutcome.UNCHANGED,
      );
    },

    async applyAuthoritativeForwardTopologyRows(tableName, rows = []) {
      const service = this.service;
      const gateway = service.getControlPlaneSystemTableGateway();
      const cache = service.systemTableCache;
      if (!cache || !gateway) {
        return num.ZERO;
      }
      const result = await gateway.reconcileAuthoritativeCacheRows(
        tableName,
        rows,
        {
          primaryKeyField: getSystemCachePrimaryKeyFieldOrFallback(tableName),
          deleteMissing: false,
          areRowsEqual: (left, right) =>
            service.areForwardTopologyRowsEqual(left, right),
          systemTableCache: cache,
        },
      );
      return result?.mutationCount || num.ZERO;
    },

    async reconcileAuthoritativeForwardServiceRows(authoritativeRows = []) {
      const service = this.service;
      const gateway = service.getControlPlaneSystemTableGateway();
      const cache = service.systemTableCache;
      if (!cache || !gateway) {
        return num.ZERO;
      }
      const cachedRows = typeof cache.filter === typeofToken.FUNCTION ?
        cache.filter(tables.SERVICES, (row) => {
          return row?.[column.GROUP_ID] === service.groupId &&
            row?.[column.SERVICE_TYPE] === serviceType.MESSAGE_GROUP;
        }) :
        [];
      const result = await gateway.reconcileAuthoritativeCacheRows(
        tables.SERVICES,
        authoritativeRows,
        {
          cachedRows,
          areRowsEqual: (left, right) =>
            service.areForwardTopologyRowsEqual(left, right),
          systemTableCache: cache,
        },
      );
      return result?.mutationCount || num.ZERO;
    },

    areForwardTopologyRowsEqual(left, right) {
      if (
        !left ||
        !right ||
        typeof left !== typeofToken.OBJECT ||
        typeof right !== typeofToken.OBJECT
      ) {
        return false;
      }
      const keys = new Set([
        ...Object.keys(left),
        ...Object.keys(right),
      ]);
      for (const key of keys) {
        if (left[key] !== right[key]) {
          return false;
        }
      }
      return true;
    },

    shouldSuppressForwardTarget(deliveryResult, errorMessage) {
      if (
        typeof errorMessage !== typeofToken.STRING ||
        errorMessage.length === num.ZERO
      ) {
        return false;
      }
      return this.service.shouldRepairForwardTopology(errorMessage) ||
        this.service.isForwardTargetBackpressured(
          deliveryResult,
          errorMessage,
        ) ||
        errorMessage === transportErrorMsg.MESSAGE_TIMEOUT ||
        errorMessage.includes(messageGroupForwardingOwnerLiteral.ENOTFOUND) ||
        errorMessage.includes(messageGroupForwardingOwnerLiteral.EAI_AGAIN) ||
        errorMessage.includes(messageGroupForwardingOwnerLiteral.ECONNREFUSED) ||
        errorMessage.includes(
          messageGroupForwardingOwnerLiteral.NO_CONNECTION_TO_NODE,
        ) ||
        (errorMessage.includes(
          messageGroupForwardingOwnerLiteral.CONNECTION_TO_NODE,
        ) &&
          errorMessage.includes(messageGroupForwardingOwnerLiteral.CLOSED)) ||
        errorMessage.includes(
          messageGroupForwardingOwnerLiteral.NO_HANDLER_REGISTERED_FOR_ADDRESS,
        );
    },

    isForwardTargetBackpressured(deliveryResult, errorMessage) {
      const normalizedErrorMessage =
        typeof errorMessage === typeofToken.STRING ?
          errorMessage :
          '';
      if (
        deliveryResult?.errorCode ===
        messageGroupForwardingOwnerLiteral.OUTBOUND_QUEUE_BACKPRESSURED
      ) {
        return true;
      }
      return normalizedErrorMessage.includes(
        messageGroupForwardingOwnerLiteral.OUTBOUND_QUEUE_FOR_NODE,
      ) &&
        normalizedErrorMessage.includes(
          messageGroupForwardingOwnerLiteral.IS_SATURATED,
        );
    },

    async forwardCDCEventToLeader(tableName, operation, data, options = {}) {
      const service = this.service;
      const eventTimestamp =
        typeof options.timestamp === typeofToken.STRING &&
        options.timestamp.length > num.ZERO ?
          options.timestamp :
          service.hlcClock.now().toString();
      const replayOnly = options.replayOnly === true;
      const relayDepth =
        Number.isInteger(options.relayDepth) &&
        options.relayDepth >= num.ZERO ?
          options.relayDepth :
          num.ZERO;
      const causeId = normalizeCauseId(options.causeId);
      const payload = {
        type: messageGroupApplicationMessageType.LATENCY_CDC_PROPAGATION,
        tableName,
        operation,
        data,
        timestamp: eventTimestamp,
        sourceNodeId: service.nodeId,
        relayDepth,
        causeId,
        replayOnly,
      };
      return service.forwardCDCPayloadToLeader(payload, {
        tableName,
        operation,
        relayDepth,
        causeId,
        replayOnly,
      });
    },

    async forwardCDCBatchToLeader(events, options = {}) {
      const service = this.service;
      const replayOnly = options.replayOnly === true;
      const relayDepth =
        Number.isInteger(options.relayDepth) &&
        options.relayDepth >= num.ZERO ?
          options.relayDepth :
          num.ZERO;
      const normalizedEvents = (Array.isArray(events) ? events : [])
        .filter((event) => event?.tableName && event?.operation && event?.data)
        .map((event) => {
          const timestamp =
            typeof event.timestamp === typeofToken.STRING &&
            event.timestamp.length > num.ZERO ?
              event.timestamp :
              service.hlcClock.now().toString();
          return {
            tableName: event.tableName,
            operation: event.operation,
            data: event.data,
            timestamp,
            causeId: normalizeCauseId(event.causeId),
            replayOnly: event.replayOnly === true || replayOnly,
          };
        });
      if (normalizedEvents.length === num.ZERO) {
        throw new Error(
          messageGroupApplicationErrorMsg.INVALID_LATENCY_CDC_BATCH_PAYLOAD,
        );
      }

      const payload = {
        type: messageGroupApplicationMessageType
          .LATENCY_CDC_PROPAGATION_BATCH,
        events: normalizedEvents,
        sourceNodeId: service.nodeId,
        relayDepth,
        replayOnly:
          replayOnly ||
          normalizedEvents.every((event) => event.replayOnly === true),
      };
      return service.forwardCDCPayloadToLeader(payload, {
        tableName: normalizedEvents[num.ZERO].tableName,
        operation: `batch:${normalizedEvents.length}`,
        relayDepth,
        causeId: normalizeCauseId(normalizedEvents[num.ZERO].causeId),
        replayOnly:
          replayOnly ||
          normalizedEvents.every((event) => event.replayOnly === true),
      });
    },

    async tryApplyAddressedStrictConvergencePayloadLocally(
      payload,
      logContext = {},
    ) {
      const service = this.service;
      const addressedConvergenceContext =
        this.buildAddressedStrictConvergenceContext(logContext);
      const decision = this.resolveCdcIngressDecision(addressedConvergenceContext);
      if (
        decision.action !== messageGroupCdcIngressAction.APPLY_LOCAL ||
        decision.localIngress !== true
      ) {
        return false;
      }

      const relayDepth = Number.isInteger(logContext.relayDepth) &&
        logContext.relayDepth >= num.ZERO ?
        logContext.relayDepth :
        num.ZERO;
      const replayOnly = logContext.replayOnly === true ||
        payload?.replayOnly === true;
      if (
        payload?.type ===
        messageGroupApplicationMessageType.LATENCY_CDC_PROPAGATION
      ) {
        await service.applyCDCEvent(
          payload?.tableName || logContext.tableName || null,
          payload?.operation || logContext.operation || null,
          payload?.data || null,
          {
            timestamp: payload?.timestamp || undefined,
            causeId: normalizeCauseId(logContext.causeId ?? payload?.causeId),
            replayOnly,
            relayDepth,
            skipSubscriptionCheck: true,
            [messageGroupCdcLogContextField.ADDRESSED_STRICT_CONVERGENCE]:
              true,
          },
        );
        return true;
      }

      if (
        payload?.type ===
        messageGroupApplicationMessageType.LATENCY_CDC_PROPAGATION_BATCH
      ) {
        await service.applyCDCBatch(
          Array.isArray(payload?.events) ? payload.events : [],
          {
            replayOnly,
            relayDepth,
            skipSubscriptionCheck: true,
            [messageGroupCdcLogContextField.ADDRESSED_STRICT_CONVERGENCE]:
              true,
          },
        );
        return true;
      }

      return false;
    },

    async forwardCDCPayloadToLeader(payload, logContext = {}) {
      const service = this.service;
      const tableName = logContext.tableName || null;
      const operation = logContext.operation || null;
      const replayOnly =
        logContext.replayOnly === true || payload?.replayOnly === true;
      const deliveryProfile = resolveCDCForwardDeliveryProfile(
        tableName,
        payload,
        replayOnly,
      );
      const deliveryPriority = deliveryProfile.deliveryPriority;
      const deliverySource = deliveryProfile.deliverySource;
      const replacePendingKey = deliveryProfile.replacePendingKey;
      const relayDepth = Number.isInteger(logContext.relayDepth) ?
        logContext.relayDepth :
        num.ZERO;
      const causeId = normalizeCauseId(logContext.causeId);
      let selection = service.resolveCDCForwardSelection(logContext);
      if (
        selection.strictForwarding === true &&
        selection.targets.length === num.ZERO
      ) {
        await service.maybeRepairAuthoritativeForwardTopology({
          errorMessage: messageGroupCdcErrorMsg.FORWARD_LEADER_UNKNOWN,
          tableName,
          operation,
          causeId,
        });
        selection = service.resolveCDCForwardSelection(logContext);
      }
      const {
        strictForwarding,
        strictForwardRetryAfterMs,
        targets: forwardTargets,
        suppressedCount,
      } = selection;
      if (forwardTargets.length === num.ZERO) {
        const locallyApplied =
          strictForwarding === true &&
          await this.tryApplyAddressedStrictConvergencePayloadLocally(
            payload,
            logContext,
          );
        if (locallyApplied) {
          return;
        }
        const error = strictForwarding ?
          this.buildDeferredCdcForwardError(
            messageGroupCdcErrorMsg.FORWARD_LEADER_UNKNOWN,
            strictForwardRetryAfterMs,
          ) :
          new Error(messageGroupCdcErrorMsg.FORWARD_LEADER_UNKNOWN);
        if (suppressedCount > num.ZERO) {
          error.retryable = false;
        }
        throw error;
      }
      let lastAddressError = null;
      let lastDeliveryError = null;
      let attemptedAddressedStrictConvergence = false;

      for (const target of forwardTargets) {
        let leaderAddress = target.address;
        try {
          if (!leaderAddress) {
            leaderAddress = service.buildPeerAddress(target.serviceId);
          }
          if (!leaderAddress) {
            throw new Error(
              messageGroupCdcErrorMsg.FORWARD_LEADER_ADDRESS_UNRESOLVED,
            );
          }
        } catch (error) {
          lastAddressError = error;
          continue;
        }

        const forwardStartMs = service.now();
        try {
          const deliveryOptions = {
            deliveryPriority,
            deliverySource,
          };
          if (replacePendingKey) {
            deliveryOptions.replacePendingKey = replacePendingKey;
          }
          const deliveryResult = await service.transport.deliver(
            leaderAddress,
            payload,
            deliveryOptions,
          );
          const deliveryAcked = deliveryResult?.acknowledged === true;
          const deliverySucceeded = deliveryResult?.success !== false;
          const deliveryErrorMessage =
            typeof deliveryResult?.error === typeofToken.STRING &&
            deliveryResult.error.length > num.ZERO ?
              deliveryResult.error :
              null;
          const deliveryRejectedByHandler =
            deliveryResult?.noHandler === true ||
            deliveryErrorMessage !== null;
          if (
            !deliveryAcked ||
            !deliverySucceeded ||
            deliveryRejectedByHandler
          ) {
            const shouldRepairTopology =
              service.shouldRepairForwardTopology(deliveryErrorMessage);
            if (service.shouldSuppressForwardTarget(
              deliveryResult,
              deliveryErrorMessage,
            )) {
              service.suppressForwardTarget({
                serviceId: target.serviceId,
                address: leaderAddress,
              });
            }
            if (shouldRepairTopology) {
              attemptedAddressedStrictConvergence = true;
              await service.maybeRepairAuthoritativeForwardTopology({
                serviceId: target.serviceId,
                address: leaderAddress,
                errorMessage: deliveryErrorMessage,
              });
            }
            service.logger.warn(
              messageGroupForwardingOwnerLiteral.CDC_FORWARD_TO_LEADER_REJECTED,
              {
                groupId: service.groupId,
                replicaId: service.replicaId,
                leaderId: target.serviceId,
                leaderServiceId: target.serviceId,
                leaderAddress,
                tableName,
                operation,
                relayDepth,
                causeId,
                durationMs: service.now() - forwardStartMs,
                deliveryRejectedByHandler,
                acknowledged: deliveryAcked,
                success: deliverySucceeded,
                noHandler: deliveryResult?.noHandler === true,
                replayIsolationEngaged: replayOnly,
                deliveryPriority,
                deliverySource,
                replacePendingKey,
                strictForwarding,
                strictForwardRetryAfterMs,
                error: deliveryErrorMessage,
              },
            );
            const deliveryError = deliveryErrorMessage !== null ?
              `: ${this.boundCdcForwardErrorDetail(deliveryErrorMessage)}` :
              '';
            const forwardErrorMessage =
              `${messageGroupCdcErrorMsg.FORWARD_DELIVERY_REJECTED}` +
              deliveryError;
            const forwardFailureState = this.resolveForwardFailureState(
              deliveryResult,
              {
                message: deliveryErrorMessage,
                deferRetry: deliveryResult?.deferRetry === true,
              },
            );
            const resolvedRetryAfterMs = this.resolveForwardRetryAfterMs(
              strictForwardRetryAfterMs,
              deliveryResult,
            );
            lastDeliveryError = strictForwarding ?
              this.buildStrictForwardError(
                forwardErrorMessage,
                resolvedRetryAfterMs,
                {
                  failureState: forwardFailureState,
                  code: deliveryResult?.errorCode || null,
                },
              ) :
              new Error(forwardErrorMessage);
            continue;
          }
          service.clearForwardTargetSuppression({
            serviceId: target.serviceId,
            address: leaderAddress,
          });
          return;
        } catch (error) {
          const shouldRepairTopology =
            service.shouldRepairForwardTopology(error?.message || null);
          if (service.shouldSuppressForwardTarget(null, error?.message || null)) {
            service.suppressForwardTarget({
              serviceId: target.serviceId,
              address: leaderAddress,
            });
          }
          if (shouldRepairTopology) {
            attemptedAddressedStrictConvergence = true;
            await service.maybeRepairAuthoritativeForwardTopology({
              serviceId: target.serviceId,
              address: leaderAddress,
              errorMessage: error?.message || null,
            });
          }
          const forwardFailureState = this.resolveForwardFailureState(
            null,
            error,
          );
          const resolvedRetryAfterMs = this.resolveForwardRetryAfterMs(
            strictForwardRetryAfterMs,
            error,
          );
          lastDeliveryError = strictForwarding ?
            this.buildStrictForwardError(
              this.boundCdcForwardErrorDetail(error?.message) ||
                messageGroupCdcErrorMsg.FORWARD_LEADER_UNKNOWN,
              resolvedRetryAfterMs,
              {
                failureState: forwardFailureState,
                code: error?.code || null,
              },
            ) :
            error;
        }
      }

      if (strictForwarding === true && attemptedAddressedStrictConvergence) {
        const locallyApplied =
          await this.tryApplyAddressedStrictConvergencePayloadLocally(
            payload,
            logContext,
          );
        if (locallyApplied) {
          return;
        }
      }
      if (lastDeliveryError) {
        throw lastDeliveryError;
      }
      if (lastAddressError) {
        const message =
          `${messageGroupCdcErrorMsg.FORWARD_LEADER_ADDRESS_UNRESOLVED}: ` +
          `${this.boundCdcForwardErrorDetail(lastAddressError.message)}`;
        throw strictForwarding ?
          this.buildDeferredCdcForwardError(
            message,
            strictForwardRetryAfterMs,
          ) :
          new Error(message);
      }

      throw strictForwarding ?
        this.buildDeferredCdcForwardError(
          messageGroupCdcErrorMsg.FORWARD_LEADER_UNKNOWN,
          strictForwardRetryAfterMs,
        ) :
        new Error(messageGroupCdcErrorMsg.FORWARD_LEADER_UNKNOWN);
    },
  };
}

export {createMessageGroupForwardingOwnerDeliveryMethods};
