/**
 * MessageGroupServiceHandler - Handles CREATE_REPLICA and REMOVE_REPLICA
 * operations for message-group entities.
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
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { AddressManager } from '../address/address-manager.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { MessageGroupServiceRowOwner } from '../message-group/message-group-service-row-owner.js';
import { ENTITY_TYPE, NUM, SERVICE_STATUS, SERVICE_TYPE, TYPEOF, WORKFLOW_STEP } from '../constants/index.js';
import { ReplicaOperationMessageType, ReplicaOperationField, ReplicaOperationResponseStatus } from '../rebalancer/replica-operation-constants.js';
import { ReplicaStatus } from '../rebalancer/replica-status.js';
import { EXECUTOR_OUTCOME_TYPE } from '../rebalancer/executor-outcome-constants.js';
import { MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS, MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG, MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG, MESSAGE_GROUP_SERVICE_HANDLER_SUBSYSTEM } from './message-group-service-handler-constants.js';
function isFunction(value) {
  if (stryMutAct_9fa48("92100")) {
    {}
  } else {
    stryCov_9fa48("92100");
    return stryMutAct_9fa48("92103") ? typeof value !== TYPEOF.FUNCTION : stryMutAct_9fa48("92102") ? false : stryMutAct_9fa48("92101") ? true : (stryCov_9fa48("92101", "92102", "92103"), typeof value === TYPEOF.FUNCTION);
  }
}
function buildReplicaOperationResponse(status, fields = {}) {
  if (stryMutAct_9fa48("92104")) {
    {}
  } else {
    stryCov_9fa48("92104");
    return stryMutAct_9fa48("92105") ? {} : (stryCov_9fa48("92105"), {
      status,
      ...fields
    });
  }
}
class MessageGroupServiceHandler extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.systemTableCache
   * @param {Object} options.cdcIntegrationService
   * @param {Function} options.createMessageGroupReplica
   * @param {Function} options.startMessageGroupReplica
   * @param {Function} options.stopMessageGroupReplica
   * @param {Function} [options.resolveLocalMessageGroupReplica]
   * @param {MessageGroupServiceRowOwner}
   *   [options.messageGroupServiceRowOwner]
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("92106")) {
      {}
    } else {
      stryCov_9fa48("92106");
      super();
      this.nodeId = stryMutAct_9fa48("92109") ? options.nodeId && null : stryMutAct_9fa48("92108") ? false : stryMutAct_9fa48("92107") ? true : (stryCov_9fa48("92107", "92108", "92109"), options.nodeId || null);
      this.systemTableCache = stryMutAct_9fa48("92112") ? options.systemTableCache && null : stryMutAct_9fa48("92111") ? false : stryMutAct_9fa48("92110") ? true : (stryCov_9fa48("92110", "92111", "92112"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("92115") ? options.cdcIntegrationService && null : stryMutAct_9fa48("92114") ? false : stryMutAct_9fa48("92113") ? true : (stryCov_9fa48("92113", "92114", "92115"), options.cdcIntegrationService || null);
      this.createMessageGroupReplica = stryMutAct_9fa48("92118") ? options.createMessageGroupReplica && null : stryMutAct_9fa48("92117") ? false : stryMutAct_9fa48("92116") ? true : (stryCov_9fa48("92116", "92117", "92118"), options.createMessageGroupReplica || null);
      this.startMessageGroupReplica = stryMutAct_9fa48("92121") ? options.startMessageGroupReplica && null : stryMutAct_9fa48("92120") ? false : stryMutAct_9fa48("92119") ? true : (stryCov_9fa48("92119", "92120", "92121"), options.startMessageGroupReplica || null);
      this.stopMessageGroupReplica = stryMutAct_9fa48("92124") ? options.stopMessageGroupReplica && null : stryMutAct_9fa48("92123") ? false : stryMutAct_9fa48("92122") ? true : (stryCov_9fa48("92122", "92123", "92124"), options.stopMessageGroupReplica || null);
      this.resolveLocalMessageGroupReplica = stryMutAct_9fa48("92127") ? options.resolveLocalMessageGroupReplica && null : stryMutAct_9fa48("92126") ? false : stryMutAct_9fa48("92125") ? true : (stryCov_9fa48("92125", "92126", "92127"), options.resolveLocalMessageGroupReplica || null);
      this.messageGroupServiceRowOwner = stryMutAct_9fa48("92130") ? options.messageGroupServiceRowOwner && new MessageGroupServiceRowOwner({
        systemTableWriter: this.cdcIntegrationService
      }) : stryMutAct_9fa48("92129") ? false : stryMutAct_9fa48("92128") ? true : (stryCov_9fa48("92128", "92129", "92130"), options.messageGroupServiceRowOwner || new MessageGroupServiceRowOwner(stryMutAct_9fa48("92131") ? {} : (stryCov_9fa48("92131"), {
        systemTableWriter: this.cdcIntegrationService
      })));
      this.messageRouter = stryMutAct_9fa48("92134") ? options.messageRouter && null : stryMutAct_9fa48("92133") ? false : stryMutAct_9fa48("92132") ? true : (stryCov_9fa48("92132", "92133", "92134"), options.messageRouter || null);
      this.rpcClient = null;

      // Executor outcome emitter — replaces direct replica_operations writes.
      this.executorOutcomeEmitter = stryMutAct_9fa48("92137") ? options.executorOutcomeEmitter && null : stryMutAct_9fa48("92136") ? false : stryMutAct_9fa48("92135") ? true : (stryCov_9fa48("92135", "92136", "92137"), options.executorOutcomeEmitter || null);
      this.inProgressOperations = new Map();
      this.localReplicas = new Map();
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(MESSAGE_GROUP_SERVICE_HANDLER_SUBSYSTEM) : console;
    }
  }
  initialize() {
    if (stryMutAct_9fa48("92138")) {
      {}
    } else {
      stryCov_9fa48("92138");
      this.logger.debug(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.INITIALIZING, stryMutAct_9fa48("92139") ? {} : (stryCov_9fa48("92139"), {
        nodeId: this.nodeId
      }));
      if (stryMutAct_9fa48("92142") ? false : stryMutAct_9fa48("92141") ? true : stryMutAct_9fa48("92140") ? isFunction(this.createMessageGroupReplica) : (stryCov_9fa48("92140", "92141", "92142"), !isFunction(this.createMessageGroupReplica))) {
        if (stryMutAct_9fa48("92143")) {
          {}
        } else {
          stryCov_9fa48("92143");
          throw new Error(MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.CREATE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("92146") ? false : stryMutAct_9fa48("92145") ? true : stryMutAct_9fa48("92144") ? isFunction(this.startMessageGroupReplica) : (stryCov_9fa48("92144", "92145", "92146"), !isFunction(this.startMessageGroupReplica))) {
        if (stryMutAct_9fa48("92147")) {
          {}
        } else {
          stryCov_9fa48("92147");
          throw new Error(MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.START_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("92150") ? false : stryMutAct_9fa48("92149") ? true : stryMutAct_9fa48("92148") ? isFunction(this.stopMessageGroupReplica) : (stryCov_9fa48("92148", "92149", "92150"), !isFunction(this.stopMessageGroupReplica))) {
        if (stryMutAct_9fa48("92151")) {
          {}
        } else {
          stryCov_9fa48("92151");
          throw new Error(MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.STOP_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("92154") ? false : stryMutAct_9fa48("92153") ? true : stryMutAct_9fa48("92152") ? this.cdcIntegrationService : (stryCov_9fa48("92152", "92153", "92154"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("92155")) {
          {}
        } else {
          stryCov_9fa48("92155");
          throw new Error(MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.CDC_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("92158") ? false : stryMutAct_9fa48("92157") ? true : stryMutAct_9fa48("92156") ? this.systemTableCache : (stryCov_9fa48("92156", "92157", "92158"), !this.systemTableCache)) {
        if (stryMutAct_9fa48("92159")) {
          {}
        } else {
          stryCov_9fa48("92159");
          throw new Error(MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.CACHE_REQUIRED);
        }
      }
    }
  }
  async handleMessage(envelope) {
    if (stryMutAct_9fa48("92160")) {
      {}
    } else {
      stryCov_9fa48("92160");
      const {
        payload,
        correlationId
      } = envelope;
      const type = stryMutAct_9fa48("92161") ? payload[ReplicaOperationField.TYPE] : (stryCov_9fa48("92161"), payload?.[ReplicaOperationField.TYPE]);
      this.logger.debug(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.MESSAGE_RECEIVED, stryMutAct_9fa48("92162") ? {} : (stryCov_9fa48("92162"), {
        type,
        correlationId,
        operationId: stryMutAct_9fa48("92163") ? payload.operationId : (stryCov_9fa48("92163"), payload?.operationId)
      }));
      let response;
      if (stryMutAct_9fa48("92166") ? type !== ReplicaOperationMessageType.CREATE_REPLICA : stryMutAct_9fa48("92165") ? false : stryMutAct_9fa48("92164") ? true : (stryCov_9fa48("92164", "92165", "92166"), type === ReplicaOperationMessageType.CREATE_REPLICA)) {
        if (stryMutAct_9fa48("92167")) {
          {}
        } else {
          stryCov_9fa48("92167");
          response = await this.handleCreateReplica(payload);
        }
      } else if (stryMutAct_9fa48("92170") ? type !== ReplicaOperationMessageType.REMOVE_REPLICA : stryMutAct_9fa48("92169") ? false : stryMutAct_9fa48("92168") ? true : (stryCov_9fa48("92168", "92169", "92170"), type === ReplicaOperationMessageType.REMOVE_REPLICA)) {
        if (stryMutAct_9fa48("92171")) {
          {}
        } else {
          stryCov_9fa48("92171");
          response = await this.handleRemoveReplica(payload);
        }
      } else {
        if (stryMutAct_9fa48("92172")) {
          {}
        } else {
          stryCov_9fa48("92172");
          response = buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, stryMutAct_9fa48("92173") ? {} : (stryCov_9fa48("92173"), {
            error: MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE(type)
          }));
        }
      }
      return stryMutAct_9fa48("92174") ? {} : (stryCov_9fa48("92174"), {
        ...response,
        correlationId
      });
    }
  }
  async handleCreateReplica(request) {
    if (stryMutAct_9fa48("92175")) {
      {}
    } else {
      stryCov_9fa48("92175");
      const operationId = stryMutAct_9fa48("92176") ? request[ReplicaOperationField.OPERATION_ID] : (stryCov_9fa48("92176"), request?.[ReplicaOperationField.OPERATION_ID]);
      const groupId = this.resolveGroupId(request);
      const replicaId = stryMutAct_9fa48("92177") ? request[ReplicaOperationField.REPLICA_ID] : (stryCov_9fa48("92177"), request?.[ReplicaOperationField.REPLICA_ID]);
      this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_REQUEST, stryMutAct_9fa48("92178") ? {} : (stryCov_9fa48("92178"), {
        operationId,
        groupId,
        replicaId,
        nodeId: this.nodeId
      }));
      if (stryMutAct_9fa48("92181") ? (!operationId || !groupId) && !replicaId : stryMutAct_9fa48("92180") ? false : stryMutAct_9fa48("92179") ? true : (stryCov_9fa48("92179", "92180", "92181"), (stryMutAct_9fa48("92183") ? !operationId && !groupId : stryMutAct_9fa48("92182") ? false : (stryCov_9fa48("92182", "92183"), (stryMutAct_9fa48("92184") ? operationId : (stryCov_9fa48("92184"), !operationId)) || (stryMutAct_9fa48("92185") ? groupId : (stryCov_9fa48("92185"), !groupId)))) || (stryMutAct_9fa48("92186") ? replicaId : (stryCov_9fa48("92186"), !replicaId)))) {
        if (stryMutAct_9fa48("92187")) {
          {}
        } else {
          stryCov_9fa48("92187");
          this.logger.warn(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_MISSING_FIELDS, stryMutAct_9fa48("92188") ? {} : (stryCov_9fa48("92188"), {
            operationId,
            groupId,
            replicaId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, stryMutAct_9fa48("92189") ? {} : (stryCov_9fa48("92189"), {
            error: MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.CREATE_REQUIRED_FIELDS,
            nodeId: this.nodeId
          }));
        }
      }
      const existingReplica = this.getKnownLocalReplica(replicaId, groupId);
      if (stryMutAct_9fa48("92192") ? existingReplica || existingReplica.status === ReplicaStatus.ACTIVE : stryMutAct_9fa48("92191") ? false : stryMutAct_9fa48("92190") ? true : (stryCov_9fa48("92190", "92191", "92192"), existingReplica && (stryMutAct_9fa48("92194") ? existingReplica.status !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("92193") ? true : (stryCov_9fa48("92193", "92194"), existingReplica.status === ReplicaStatus.ACTIVE)))) {
        if (stryMutAct_9fa48("92195")) {
          {}
        } else {
          stryCov_9fa48("92195");
          this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_ALREADY_ACTIVE, stryMutAct_9fa48("92196") ? {} : (stryCov_9fa48("92196"), {
            groupId,
            replicaId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.ALREADY_EXISTS, stryMutAct_9fa48("92197") ? {} : (stryCov_9fa48("92197"), {
            replicaId,
            nodeId: this.nodeId
          }));
        }
      }
      if (stryMutAct_9fa48("92200") ? existingReplica || existingReplica.status === ReplicaStatus.CREATING : stryMutAct_9fa48("92199") ? false : stryMutAct_9fa48("92198") ? true : (stryCov_9fa48("92198", "92199", "92200"), existingReplica && (stryMutAct_9fa48("92202") ? existingReplica.status !== ReplicaStatus.CREATING : stryMutAct_9fa48("92201") ? true : (stryCov_9fa48("92201", "92202"), existingReplica.status === ReplicaStatus.CREATING)))) {
        if (stryMutAct_9fa48("92203")) {
          {}
        } else {
          stryCov_9fa48("92203");
          this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_IN_PROGRESS, stryMutAct_9fa48("92204") ? {} : (stryCov_9fa48("92204"), {
            groupId,
            replicaId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("92205") ? {} : (stryCov_9fa48("92205"), {
            replicaId,
            nodeId: this.nodeId
          }));
        }
      }
      if (stryMutAct_9fa48("92207") ? false : stryMutAct_9fa48("92206") ? true : (stryCov_9fa48("92206", "92207"), this.inProgressOperations.has(operationId))) {
        if (stryMutAct_9fa48("92208")) {
          {}
        } else {
          stryCov_9fa48("92208");
          this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, stryMutAct_9fa48("92209") ? {} : (stryCov_9fa48("92209"), {
            operationId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("92210") ? {} : (stryCov_9fa48("92210"), {
            operationId,
            nodeId: this.nodeId
          }));
        }
      }
      let replicaOptions;
      try {
        if (stryMutAct_9fa48("92211")) {
          {}
        } else {
          stryCov_9fa48("92211");
          replicaOptions = this.buildReplicaOptions(groupId, replicaId, request);
        }
      } catch (error) {
        if (stryMutAct_9fa48("92212")) {
          {}
        } else {
          stryCov_9fa48("92212");
          this.logger.warn(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_TOPOLOGY_INVALID, stryMutAct_9fa48("92213") ? {} : (stryCov_9fa48("92213"), {
            operationId,
            groupId,
            replicaId,
            error: error.message,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, stryMutAct_9fa48("92214") ? {} : (stryCov_9fa48("92214"), {
            error: error.message,
            nodeId: this.nodeId
          }));
        }
      }
      this.localReplicas.set(replicaId, stryMutAct_9fa48("92215") ? {} : (stryCov_9fa48("92215"), {
        replicaId,
        entityId: groupId,
        status: ReplicaStatus.CREATING
      }));
      this.inProgressOperations.set(operationId, stryMutAct_9fa48("92216") ? {} : (stryCov_9fa48("92216"), {
        type: ReplicaOperationMessageType.CREATE_REPLICA,
        replicaId,
        entityId: groupId,
        startedAt: Date.now(),
        replicaOptions
      }));
      setImmediate(() => {
        if (stryMutAct_9fa48("92217")) {
          {}
        } else {
          stryCov_9fa48("92217");
          this.createReplicaAsync(stryMutAct_9fa48("92218") ? {} : (stryCov_9fa48("92218"), {
            operationId,
            groupId,
            replicaId,
            replicaOptions
          })).catch(error => {
            if (stryMutAct_9fa48("92219")) {
              {}
            } else {
              stryCov_9fa48("92219");
              this.logger.error(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.ASYNC_CREATE_FAILED, stryMutAct_9fa48("92220") ? {} : (stryCov_9fa48("92220"), {
                operationId,
                replicaId,
                error: error.message,
                stack: error.stack
              }));
            }
          });
        }
      });
      return buildReplicaOperationResponse(ReplicaOperationResponseStatus.INITIATED, stryMutAct_9fa48("92221") ? {} : (stryCov_9fa48("92221"), {
        operationId,
        replicaId,
        nodeId: this.nodeId
      }));
    }
  }
  async createReplicaAsync({
    operationId,
    groupId,
    replicaId,
    replicaOptions
  }) {
    if (stryMutAct_9fa48("92222")) {
      {}
    } else {
      stryCov_9fa48("92222");
      try {
        if (stryMutAct_9fa48("92223")) {
          {}
        } else {
          stryCov_9fa48("92223");
          await this.createMessageGroupReplica(replicaOptions);
          await this.startMessageGroupReplica(replicaOptions);
          const service = this.resolveActiveReplicaService(replicaId);
          if (stryMutAct_9fa48("92226") ? false : stryMutAct_9fa48("92225") ? true : stryMutAct_9fa48("92224") ? this.isReplicaHandlerRegistered(replicaId, service) : (stryCov_9fa48("92224", "92225", "92226"), !this.isReplicaHandlerRegistered(replicaId, service))) {
            if (stryMutAct_9fa48("92227")) {
              {}
            } else {
              stryCov_9fa48("92227");
              throw new Error(MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.REPLICA_HANDLER_NOT_REGISTERED(replicaId));
            }
          }
          await this.messageGroupServiceRowOwner.registerReplica(stryMutAct_9fa48("92228") ? {} : (stryCov_9fa48("92228"), {
            groupId,
            replicaId,
            nodeId: this.nodeId,
            service
          }));
          this.localReplicas.set(replicaId, stryMutAct_9fa48("92229") ? {} : (stryCov_9fa48("92229"), {
            replicaId,
            entityId: groupId,
            status: ReplicaStatus.ACTIVE
          }));

          // Emit active outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_ACTIVE, operationId, WORKFLOW_STEP.ACTIVE, stryMutAct_9fa48("92230") ? {} : (stryCov_9fa48("92230"), {
            replicaId
          }));
          this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_COMPLETED, stryMutAct_9fa48("92231") ? {} : (stryCov_9fa48("92231"), {
            operationId,
            groupId,
            replicaId,
            nodeId: this.nodeId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("92232")) {
          {}
        } else {
          stryCov_9fa48("92232");
          this.localReplicas.set(replicaId, stryMutAct_9fa48("92233") ? {} : (stryCov_9fa48("92233"), {
            replicaId,
            entityId: groupId,
            status: ReplicaStatus.FAILED
          }));

          // Emit failed outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_FAILED, operationId, WORKFLOW_STEP.FAILED, stryMutAct_9fa48("92234") ? {} : (stryCov_9fa48("92234"), {
            replicaId,
            errorMessage: error.message
          }));
          this.logger.error(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.CREATE_FAILED, stryMutAct_9fa48("92235") ? {} : (stryCov_9fa48("92235"), {
            operationId,
            groupId,
            replicaId,
            error: error.message,
            nodeId: this.nodeId
          }));
        }
      } finally {
        if (stryMutAct_9fa48("92236")) {
          {}
        } else {
          stryCov_9fa48("92236");
          this.inProgressOperations.delete(operationId);
        }
      }
    }
  }
  async handleRemoveReplica(request) {
    if (stryMutAct_9fa48("92237")) {
      {}
    } else {
      stryCov_9fa48("92237");
      const operationId = stryMutAct_9fa48("92238") ? request[ReplicaOperationField.OPERATION_ID] : (stryCov_9fa48("92238"), request?.[ReplicaOperationField.OPERATION_ID]);
      const groupId = this.resolveGroupId(request);
      const replicaId = stryMutAct_9fa48("92239") ? request[ReplicaOperationField.REPLICA_ID] : (stryCov_9fa48("92239"), request?.[ReplicaOperationField.REPLICA_ID]);
      const reason = stryMutAct_9fa48("92240") ? request[ReplicaOperationField.REASON] : (stryCov_9fa48("92240"), request?.[ReplicaOperationField.REASON]);
      this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_REQUEST, stryMutAct_9fa48("92241") ? {} : (stryCov_9fa48("92241"), {
        operationId,
        groupId,
        replicaId,
        reason,
        nodeId: this.nodeId
      }));
      if (stryMutAct_9fa48("92244") ? (!operationId || !groupId) && !replicaId : stryMutAct_9fa48("92243") ? false : stryMutAct_9fa48("92242") ? true : (stryCov_9fa48("92242", "92243", "92244"), (stryMutAct_9fa48("92246") ? !operationId && !groupId : stryMutAct_9fa48("92245") ? false : (stryCov_9fa48("92245", "92246"), (stryMutAct_9fa48("92247") ? operationId : (stryCov_9fa48("92247"), !operationId)) || (stryMutAct_9fa48("92248") ? groupId : (stryCov_9fa48("92248"), !groupId)))) || (stryMutAct_9fa48("92249") ? replicaId : (stryCov_9fa48("92249"), !replicaId)))) {
        if (stryMutAct_9fa48("92250")) {
          {}
        } else {
          stryCov_9fa48("92250");
          this.logger.warn(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_MISSING_FIELDS, stryMutAct_9fa48("92251") ? {} : (stryCov_9fa48("92251"), {
            operationId,
            groupId,
            replicaId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, stryMutAct_9fa48("92252") ? {} : (stryCov_9fa48("92252"), {
            error: MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.REMOVE_REQUIRED_FIELDS,
            nodeId: this.nodeId
          }));
        }
      }
      const replica = this.getKnownLocalReplica(replicaId, groupId);
      if (stryMutAct_9fa48("92255") ? false : stryMutAct_9fa48("92254") ? true : stryMutAct_9fa48("92253") ? replica : (stryCov_9fa48("92253", "92254", "92255"), !replica)) {
        if (stryMutAct_9fa48("92256")) {
          {}
        } else {
          stryCov_9fa48("92256");
          this.logger.warn(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_NOT_FOUND, stryMutAct_9fa48("92257") ? {} : (stryCov_9fa48("92257"), {
            replicaId,
            groupId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.NOT_FOUND, stryMutAct_9fa48("92258") ? {} : (stryCov_9fa48("92258"), {
            replicaId,
            nodeId: this.nodeId
          }));
        }
      }
      if (stryMutAct_9fa48("92261") ? replica.status !== ReplicaStatus.REMOVING : stryMutAct_9fa48("92260") ? false : stryMutAct_9fa48("92259") ? true : (stryCov_9fa48("92259", "92260", "92261"), replica.status === ReplicaStatus.REMOVING)) {
        if (stryMutAct_9fa48("92262")) {
          {}
        } else {
          stryCov_9fa48("92262");
          this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_IN_PROGRESS, stryMutAct_9fa48("92263") ? {} : (stryCov_9fa48("92263"), {
            replicaId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("92264") ? {} : (stryCov_9fa48("92264"), {
            replicaId,
            nodeId: this.nodeId
          }));
        }
      }
      if (stryMutAct_9fa48("92267") ? replica.status !== ReplicaStatus.REMOVED : stryMutAct_9fa48("92266") ? false : stryMutAct_9fa48("92265") ? true : (stryCov_9fa48("92265", "92266", "92267"), replica.status === ReplicaStatus.REMOVED)) {
        if (stryMutAct_9fa48("92268")) {
          {}
        } else {
          stryCov_9fa48("92268");
          this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED, stryMutAct_9fa48("92269") ? {} : (stryCov_9fa48("92269"), {
            replicaId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.COMPLETED, stryMutAct_9fa48("92270") ? {} : (stryCov_9fa48("92270"), {
            replicaId,
            nodeId: this.nodeId
          }));
        }
      }
      if (stryMutAct_9fa48("92272") ? false : stryMutAct_9fa48("92271") ? true : (stryCov_9fa48("92271", "92272"), this.inProgressOperations.has(operationId))) {
        if (stryMutAct_9fa48("92273")) {
          {}
        } else {
          stryCov_9fa48("92273");
          this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, stryMutAct_9fa48("92274") ? {} : (stryCov_9fa48("92274"), {
            operationId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("92275") ? {} : (stryCov_9fa48("92275"), {
            operationId,
            nodeId: this.nodeId
          }));
        }
      }
      this.inProgressOperations.set(operationId, stryMutAct_9fa48("92276") ? {} : (stryCov_9fa48("92276"), {
        type: ReplicaOperationMessageType.REMOVE_REPLICA,
        replicaId,
        entityId: groupId,
        startedAt: Date.now()
      }));
      this.localReplicas.set(replicaId, stryMutAct_9fa48("92277") ? {} : (stryCov_9fa48("92277"), {
        ...replica,
        status: ReplicaStatus.REMOVING
      }));
      setImmediate(() => {
        if (stryMutAct_9fa48("92278")) {
          {}
        } else {
          stryCov_9fa48("92278");
          this.removeReplicaAsync(stryMutAct_9fa48("92279") ? {} : (stryCov_9fa48("92279"), {
            operationId,
            groupId,
            replicaId,
            reason
          })).catch(error => {
            if (stryMutAct_9fa48("92280")) {
              {}
            } else {
              stryCov_9fa48("92280");
              this.logger.error(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.ASYNC_REMOVE_FAILED, stryMutAct_9fa48("92281") ? {} : (stryCov_9fa48("92281"), {
                operationId,
                replicaId,
                error: error.message,
                stack: error.stack
              }));
            }
          });
        }
      });
      return buildReplicaOperationResponse(ReplicaOperationResponseStatus.INITIATED, stryMutAct_9fa48("92282") ? {} : (stryCov_9fa48("92282"), {
        operationId,
        replicaId,
        nodeId: this.nodeId
      }));
    }
  }
  async removeReplicaAsync({
    operationId,
    groupId,
    replicaId,
    reason
  }) {
    if (stryMutAct_9fa48("92283")) {
      {}
    } else {
      stryCov_9fa48("92283");
      try {
        if (stryMutAct_9fa48("92284")) {
          {}
        } else {
          stryCov_9fa48("92284");
          await this.messageGroupServiceRowOwner.updateReplicaStatus(stryMutAct_9fa48("92285") ? {} : (stryCov_9fa48("92285"), {
            groupId,
            replicaId,
            nodeId: this.nodeId,
            service: this.resolveActiveReplicaService(replicaId),
            status: SERVICE_STATUS.STOPPED
          }));
          await this.stopMessageGroupReplica(stryMutAct_9fa48("92286") ? {} : (stryCov_9fa48("92286"), {
            groupId,
            replicaId,
            reason
          }));
          await this.messageGroupServiceRowOwner.removeReplica(stryMutAct_9fa48("92287") ? {} : (stryCov_9fa48("92287"), {
            replicaId,
            nodeId: this.nodeId
          }));
          this.localReplicas.set(replicaId, stryMutAct_9fa48("92288") ? {} : (stryCov_9fa48("92288"), {
            replicaId,
            entityId: groupId,
            status: ReplicaStatus.REMOVED
          }));

          // Emit removed outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_REMOVE_COMPLETED, operationId, WORKFLOW_STEP.REMOVED, stryMutAct_9fa48("92289") ? {} : (stryCov_9fa48("92289"), {
            replicaId
          }));
          this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_COMPLETED, stryMutAct_9fa48("92290") ? {} : (stryCov_9fa48("92290"), {
            operationId,
            groupId,
            replicaId,
            nodeId: this.nodeId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("92291")) {
          {}
        } else {
          stryCov_9fa48("92291");
          this.localReplicas.set(replicaId, stryMutAct_9fa48("92292") ? {} : (stryCov_9fa48("92292"), {
            replicaId,
            entityId: groupId,
            status: ReplicaStatus.FAILED
          }));

          // Emit failed outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_REMOVE_FAILED, operationId, WORKFLOW_STEP.FAILED, stryMutAct_9fa48("92293") ? {} : (stryCov_9fa48("92293"), {
            replicaId,
            errorMessage: error.message
          }));
          this.logger.error(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REMOVE_FAILED, stryMutAct_9fa48("92294") ? {} : (stryCov_9fa48("92294"), {
            operationId,
            groupId,
            replicaId,
            error: error.message,
            nodeId: this.nodeId
          }));
        }
      } finally {
        if (stryMutAct_9fa48("92295")) {
          {}
        } else {
          stryCov_9fa48("92295");
          this.inProgressOperations.delete(operationId);
        }
      }
    }
  }
  resolveGroupId(request) {
    if (stryMutAct_9fa48("92296")) {
      {}
    } else {
      stryCov_9fa48("92296");
      return stryMutAct_9fa48("92299") ? (request?.[ReplicaOperationField.ENTITY_ID] || request?.[ReplicaOperationField.PARTITION_ID]) && null : stryMutAct_9fa48("92298") ? false : stryMutAct_9fa48("92297") ? true : (stryCov_9fa48("92297", "92298", "92299"), (stryMutAct_9fa48("92301") ? request?.[ReplicaOperationField.ENTITY_ID] && request?.[ReplicaOperationField.PARTITION_ID] : stryMutAct_9fa48("92300") ? false : (stryCov_9fa48("92300", "92301"), (stryMutAct_9fa48("92302") ? request[ReplicaOperationField.ENTITY_ID] : (stryCov_9fa48("92302"), request?.[ReplicaOperationField.ENTITY_ID])) || (stryMutAct_9fa48("92303") ? request[ReplicaOperationField.PARTITION_ID] : (stryCov_9fa48("92303"), request?.[ReplicaOperationField.PARTITION_ID])))) || null);
    }
  }
  buildReplicaOptions(groupId, replicaId, request = {}) {
    if (stryMutAct_9fa48("92304")) {
      {}
    } else {
      stryCov_9fa48("92304");
      const requestedReplicaIds = Array.isArray(stryMutAct_9fa48("92305") ? request[ReplicaOperationField.REPLICA_IDS] : (stryCov_9fa48("92305"), request?.[ReplicaOperationField.REPLICA_IDS])) ? stryMutAct_9fa48("92306") ? request[ReplicaOperationField.REPLICA_IDS] : (stryCov_9fa48("92306"), request[ReplicaOperationField.REPLICA_IDS].filter(stryMutAct_9fa48("92307") ? () => undefined : (stryCov_9fa48("92307"), value => stryMutAct_9fa48("92310") ? typeof value === 'string' || value.length > 0 : stryMutAct_9fa48("92309") ? false : stryMutAct_9fa48("92308") ? true : (stryCov_9fa48("92308", "92309", "92310"), (stryMutAct_9fa48("92312") ? typeof value !== 'string' : stryMutAct_9fa48("92311") ? true : (stryCov_9fa48("92311", "92312"), typeof value === (stryMutAct_9fa48("92313") ? "" : (stryCov_9fa48("92313"), 'string')))) && (stryMutAct_9fa48("92316") ? value.length <= 0 : stryMutAct_9fa48("92315") ? value.length >= 0 : stryMutAct_9fa48("92314") ? true : (stryCov_9fa48("92314", "92315", "92316"), value.length > 0)))))) : stryMutAct_9fa48("92317") ? ["Stryker was here"] : (stryCov_9fa48("92317"), []);
      const requestedPeerAddresses = Array.isArray(stryMutAct_9fa48("92318") ? request[ReplicaOperationField.PEER_ADDRESSES] : (stryCov_9fa48("92318"), request?.[ReplicaOperationField.PEER_ADDRESSES])) ? stryMutAct_9fa48("92319") ? request[ReplicaOperationField.PEER_ADDRESSES] : (stryCov_9fa48("92319"), request[ReplicaOperationField.PEER_ADDRESSES].filter(stryMutAct_9fa48("92320") ? () => undefined : (stryCov_9fa48("92320"), value => stryMutAct_9fa48("92323") ? typeof value === 'string' || value.length > 0 : stryMutAct_9fa48("92322") ? false : stryMutAct_9fa48("92321") ? true : (stryCov_9fa48("92321", "92322", "92323"), (stryMutAct_9fa48("92325") ? typeof value !== 'string' : stryMutAct_9fa48("92324") ? true : (stryCov_9fa48("92324", "92325"), typeof value === (stryMutAct_9fa48("92326") ? "" : (stryCov_9fa48("92326"), 'string')))) && (stryMutAct_9fa48("92329") ? value.length <= 0 : stryMutAct_9fa48("92328") ? value.length >= 0 : stryMutAct_9fa48("92327") ? true : (stryCov_9fa48("92327", "92328", "92329"), value.length > 0)))))) : stryMutAct_9fa48("92330") ? ["Stryker was here"] : (stryCov_9fa48("92330"), []);
      const addressManager = AddressManager.getInstance();
      const services = stryMutAct_9fa48("92333") ? this.systemTableCache?.filter?.(SYSTEM_TABLE_NAME.SERVICES, row => row?.service_type === SERVICE_TYPE.MESSAGE_GROUP && row?.group_id === groupId) && [] : stryMutAct_9fa48("92332") ? false : stryMutAct_9fa48("92331") ? true : (stryCov_9fa48("92331", "92332", "92333"), (stryMutAct_9fa48("92336") ? this.systemTableCache.filter?.(SYSTEM_TABLE_NAME.SERVICES, row => row?.service_type === SERVICE_TYPE.MESSAGE_GROUP && row?.group_id === groupId) : stryMutAct_9fa48("92335") ? this.systemTableCache?.filter(SYSTEM_TABLE_NAME.SERVICES, row => row?.service_type === SERVICE_TYPE.MESSAGE_GROUP && row?.group_id === groupId) : stryMutAct_9fa48("92334") ? this.systemTableCache : (stryCov_9fa48("92334", "92335", "92336"), this.systemTableCache?.filter?.(SYSTEM_TABLE_NAME.SERVICES, stryMutAct_9fa48("92337") ? () => undefined : (stryCov_9fa48("92337"), row => stryMutAct_9fa48("92340") ? row?.service_type === SERVICE_TYPE.MESSAGE_GROUP || row?.group_id === groupId : stryMutAct_9fa48("92339") ? false : stryMutAct_9fa48("92338") ? true : (stryCov_9fa48("92338", "92339", "92340"), (stryMutAct_9fa48("92342") ? row?.service_type !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("92341") ? true : (stryCov_9fa48("92341", "92342"), (stryMutAct_9fa48("92343") ? row.service_type : (stryCov_9fa48("92343"), row?.service_type)) === SERVICE_TYPE.MESSAGE_GROUP)) && (stryMutAct_9fa48("92345") ? row?.group_id !== groupId : stryMutAct_9fa48("92344") ? true : (stryCov_9fa48("92344", "92345"), (stryMutAct_9fa48("92346") ? row.group_id : (stryCov_9fa48("92346"), row?.group_id)) === groupId))))))) || (stryMutAct_9fa48("92347") ? ["Stryker was here"] : (stryCov_9fa48("92347"), [])));
      const topologyMustBeComplete = stryMutAct_9fa48("92350") ? (requestedReplicaIds.length > 0 || requestedPeerAddresses.length > 0) && services.length > 0 : stryMutAct_9fa48("92349") ? false : stryMutAct_9fa48("92348") ? true : (stryCov_9fa48("92348", "92349", "92350"), (stryMutAct_9fa48("92352") ? requestedReplicaIds.length > 0 && requestedPeerAddresses.length > 0 : stryMutAct_9fa48("92351") ? false : (stryCov_9fa48("92351", "92352"), (stryMutAct_9fa48("92355") ? requestedReplicaIds.length <= 0 : stryMutAct_9fa48("92354") ? requestedReplicaIds.length >= 0 : stryMutAct_9fa48("92353") ? false : (stryCov_9fa48("92353", "92354", "92355"), requestedReplicaIds.length > 0)) || (stryMutAct_9fa48("92358") ? requestedPeerAddresses.length <= 0 : stryMutAct_9fa48("92357") ? requestedPeerAddresses.length >= 0 : stryMutAct_9fa48("92356") ? false : (stryCov_9fa48("92356", "92357", "92358"), requestedPeerAddresses.length > 0)))) || (stryMutAct_9fa48("92361") ? services.length <= 0 : stryMutAct_9fa48("92360") ? services.length >= 0 : stryMutAct_9fa48("92359") ? false : (stryCov_9fa48("92359", "92360", "92361"), services.length > 0)));
      const replicaIds = stryMutAct_9fa48("92362") ? ["Stryker was here"] : (stryCov_9fa48("92362"), []);
      const peerAddresses = stryMutAct_9fa48("92363") ? ["Stryker was here"] : (stryCov_9fa48("92363"), []);
      const seenReplicaIds = new Set();
      for (const service of services) {
        if (stryMutAct_9fa48("92364")) {
          {}
        } else {
          stryCov_9fa48("92364");
          const serviceReplicaId = stryMutAct_9fa48("92367") ? service.service_id && service.replica_id : stryMutAct_9fa48("92366") ? false : stryMutAct_9fa48("92365") ? true : (stryCov_9fa48("92365", "92366", "92367"), service.service_id || service.replica_id);
          if (stryMutAct_9fa48("92370") ? false : stryMutAct_9fa48("92369") ? true : stryMutAct_9fa48("92368") ? serviceReplicaId : (stryCov_9fa48("92368", "92369", "92370"), !serviceReplicaId)) {
            if (stryMutAct_9fa48("92371")) {
              {}
            } else {
              stryCov_9fa48("92371");
              continue;
            }
          }
          if (stryMutAct_9fa48("92374") ? false : stryMutAct_9fa48("92373") ? true : stryMutAct_9fa48("92372") ? seenReplicaIds.has(serviceReplicaId) : (stryCov_9fa48("92372", "92373", "92374"), !seenReplicaIds.has(serviceReplicaId))) {
            if (stryMutAct_9fa48("92375")) {
              {}
            } else {
              stryCov_9fa48("92375");
              seenReplicaIds.add(serviceReplicaId);
              replicaIds.push(serviceReplicaId);
            }
          }
          const peerAddress = stryMutAct_9fa48("92378") ? service.address && (service.node_id ? addressManager.format(service.node_id, ENTITY_TYPE.MESSAGE_GROUP, serviceReplicaId) : null) : stryMutAct_9fa48("92377") ? false : stryMutAct_9fa48("92376") ? true : (stryCov_9fa48("92376", "92377", "92378"), service.address || (service.node_id ? addressManager.format(service.node_id, ENTITY_TYPE.MESSAGE_GROUP, serviceReplicaId) : null));
          if (stryMutAct_9fa48("92381") ? peerAddress || !peerAddresses.includes(peerAddress) : stryMutAct_9fa48("92380") ? false : stryMutAct_9fa48("92379") ? true : (stryCov_9fa48("92379", "92380", "92381"), peerAddress && (stryMutAct_9fa48("92382") ? peerAddresses.includes(peerAddress) : (stryCov_9fa48("92382"), !peerAddresses.includes(peerAddress))))) {
            if (stryMutAct_9fa48("92383")) {
              {}
            } else {
              stryCov_9fa48("92383");
              peerAddresses.push(peerAddress);
            }
          }
        }
      }
      for (const requestedReplicaId of requestedReplicaIds) {
        if (stryMutAct_9fa48("92384")) {
          {}
        } else {
          stryCov_9fa48("92384");
          if (stryMutAct_9fa48("92387") ? false : stryMutAct_9fa48("92386") ? true : stryMutAct_9fa48("92385") ? seenReplicaIds.has(requestedReplicaId) : (stryCov_9fa48("92385", "92386", "92387"), !seenReplicaIds.has(requestedReplicaId))) {
            if (stryMutAct_9fa48("92388")) {
              {}
            } else {
              stryCov_9fa48("92388");
              seenReplicaIds.add(requestedReplicaId);
              replicaIds.push(requestedReplicaId);
            }
          }
        }
      }
      if (stryMutAct_9fa48("92391") ? false : stryMutAct_9fa48("92390") ? true : stryMutAct_9fa48("92389") ? seenReplicaIds.has(replicaId) : (stryCov_9fa48("92389", "92390", "92391"), !seenReplicaIds.has(replicaId))) {
        if (stryMutAct_9fa48("92392")) {
          {}
        } else {
          stryCov_9fa48("92392");
          seenReplicaIds.add(replicaId);
          replicaIds.push(replicaId);
        }
      }
      const selfAddress = addressManager.format(this.nodeId, ENTITY_TYPE.MESSAGE_GROUP, replicaId);
      if (stryMutAct_9fa48("92395") ? false : stryMutAct_9fa48("92394") ? true : stryMutAct_9fa48("92393") ? peerAddresses.includes(selfAddress) : (stryCov_9fa48("92393", "92394", "92395"), !peerAddresses.includes(selfAddress))) {
        if (stryMutAct_9fa48("92396")) {
          {}
        } else {
          stryCov_9fa48("92396");
          peerAddresses.push(selfAddress);
        }
      }
      for (const requestedPeerAddress of requestedPeerAddresses) {
        if (stryMutAct_9fa48("92397")) {
          {}
        } else {
          stryCov_9fa48("92397");
          if (stryMutAct_9fa48("92400") ? false : stryMutAct_9fa48("92399") ? true : stryMutAct_9fa48("92398") ? peerAddresses.includes(requestedPeerAddress) : (stryCov_9fa48("92398", "92399", "92400"), !peerAddresses.includes(requestedPeerAddress))) {
            if (stryMutAct_9fa48("92401")) {
              {}
            } else {
              stryCov_9fa48("92401");
              peerAddresses.push(requestedPeerAddress);
            }
          }
        }
      }
      const hasPeerReplica = stryMutAct_9fa48("92402") ? replicaIds.every(value => value !== replicaId) : (stryCov_9fa48("92402"), replicaIds.some(stryMutAct_9fa48("92403") ? () => undefined : (stryCov_9fa48("92403"), value => stryMutAct_9fa48("92406") ? value === replicaId : stryMutAct_9fa48("92405") ? false : stryMutAct_9fa48("92404") ? true : (stryCov_9fa48("92404", "92405", "92406"), value !== replicaId))));
      const hasPeerAddress = stryMutAct_9fa48("92407") ? peerAddresses.every(value => value !== selfAddress) : (stryCov_9fa48("92407"), peerAddresses.some(stryMutAct_9fa48("92408") ? () => undefined : (stryCov_9fa48("92408"), value => stryMutAct_9fa48("92411") ? value === selfAddress : stryMutAct_9fa48("92410") ? false : stryMutAct_9fa48("92409") ? true : (stryCov_9fa48("92409", "92410", "92411"), value !== selfAddress))));
      if (stryMutAct_9fa48("92414") ? topologyMustBeComplete || !hasPeerReplica || !hasPeerAddress || peerAddresses.length < replicaIds.length : stryMutAct_9fa48("92413") ? false : stryMutAct_9fa48("92412") ? true : (stryCov_9fa48("92412", "92413", "92414"), topologyMustBeComplete && (stryMutAct_9fa48("92416") ? (!hasPeerReplica || !hasPeerAddress) && peerAddresses.length < replicaIds.length : stryMutAct_9fa48("92415") ? true : (stryCov_9fa48("92415", "92416"), (stryMutAct_9fa48("92418") ? !hasPeerReplica && !hasPeerAddress : stryMutAct_9fa48("92417") ? false : (stryCov_9fa48("92417", "92418"), (stryMutAct_9fa48("92419") ? hasPeerReplica : (stryCov_9fa48("92419"), !hasPeerReplica)) || (stryMutAct_9fa48("92420") ? hasPeerAddress : (stryCov_9fa48("92420"), !hasPeerAddress)))) || (stryMutAct_9fa48("92423") ? peerAddresses.length >= replicaIds.length : stryMutAct_9fa48("92422") ? peerAddresses.length <= replicaIds.length : stryMutAct_9fa48("92421") ? false : (stryCov_9fa48("92421", "92422", "92423"), peerAddresses.length < replicaIds.length)))))) {
        if (stryMutAct_9fa48("92424")) {
          {}
        } else {
          stryCov_9fa48("92424");
          throw new Error(MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.CREATE_TOPOLOGY_REQUIRED(groupId, replicaId));
        }
      }
      return stryMutAct_9fa48("92425") ? {} : (stryCov_9fa48("92425"), {
        groupId,
        replicaId,
        replicaIds,
        peerAddresses,
        deferElection: stryMutAct_9fa48("92426") ? true : (stryCov_9fa48("92426"), false),
        createDelayMs: NUM.ZERO
      });
    }
  }
  resolveActiveReplicaService(replicaId) {
    if (stryMutAct_9fa48("92427")) {
      {}
    } else {
      stryCov_9fa48("92427");
      if (stryMutAct_9fa48("92430") ? false : stryMutAct_9fa48("92429") ? true : stryMutAct_9fa48("92428") ? isFunction(this.resolveLocalMessageGroupReplica) : (stryCov_9fa48("92428", "92429", "92430"), !isFunction(this.resolveLocalMessageGroupReplica))) {
        if (stryMutAct_9fa48("92431")) {
          {}
        } else {
          stryCov_9fa48("92431");
          return null;
        }
      }
      return stryMutAct_9fa48("92434") ? this.resolveLocalMessageGroupReplica(replicaId) && null : stryMutAct_9fa48("92433") ? false : stryMutAct_9fa48("92432") ? true : (stryCov_9fa48("92432", "92433", "92434"), this.resolveLocalMessageGroupReplica(replicaId) || null);
    }
  }
  isReplicaHandlerRegistered(replicaId, service = null) {
    if (stryMutAct_9fa48("92435")) {
      {}
    } else {
      stryCov_9fa48("92435");
      if (stryMutAct_9fa48("92438") ? !this.messageRouter && !isFunction(this.messageRouter.isRegistered) : stryMutAct_9fa48("92437") ? false : stryMutAct_9fa48("92436") ? true : (stryCov_9fa48("92436", "92437", "92438"), (stryMutAct_9fa48("92439") ? this.messageRouter : (stryCov_9fa48("92439"), !this.messageRouter)) || (stryMutAct_9fa48("92440") ? isFunction(this.messageRouter.isRegistered) : (stryCov_9fa48("92440"), !isFunction(this.messageRouter.isRegistered))))) {
        if (stryMutAct_9fa48("92441")) {
          {}
        } else {
          stryCov_9fa48("92441");
          return stryMutAct_9fa48("92442") ? true : (stryCov_9fa48("92442"), false);
        }
      }
      const unifiedAddress = stryMutAct_9fa48("92445") ? service?.unifiedAddress && (isFunction(service?.getUnifiedAddress) ? service.getUnifiedAddress() : AddressManager.getInstance().format(this.nodeId, ENTITY_TYPE.MESSAGE_GROUP, replicaId)) : stryMutAct_9fa48("92444") ? false : stryMutAct_9fa48("92443") ? true : (stryCov_9fa48("92443", "92444", "92445"), (stryMutAct_9fa48("92446") ? service.unifiedAddress : (stryCov_9fa48("92446"), service?.unifiedAddress)) || (isFunction(stryMutAct_9fa48("92447") ? service.getUnifiedAddress : (stryCov_9fa48("92447"), service?.getUnifiedAddress)) ? service.getUnifiedAddress() : AddressManager.getInstance().format(this.nodeId, ENTITY_TYPE.MESSAGE_GROUP, replicaId)));
      return this.messageRouter.isRegistered(unifiedAddress);
    }
  }
  getKnownLocalReplica(replicaId, groupId) {
    if (stryMutAct_9fa48("92448")) {
      {}
    } else {
      stryCov_9fa48("92448");
      const existing = this.localReplicas.get(replicaId);
      if (stryMutAct_9fa48("92450") ? false : stryMutAct_9fa48("92449") ? true : (stryCov_9fa48("92449", "92450"), existing)) {
        if (stryMutAct_9fa48("92451")) {
          {}
        } else {
          stryCov_9fa48("92451");
          return existing;
        }
      }
      if (stryMutAct_9fa48("92454") ? isFunction(this.resolveLocalMessageGroupReplica) || this.resolveLocalMessageGroupReplica(replicaId) : stryMutAct_9fa48("92453") ? false : stryMutAct_9fa48("92452") ? true : (stryCov_9fa48("92452", "92453", "92454"), isFunction(this.resolveLocalMessageGroupReplica) && this.resolveLocalMessageGroupReplica(replicaId))) {
        if (stryMutAct_9fa48("92455")) {
          {}
        } else {
          stryCov_9fa48("92455");
          const replica = stryMutAct_9fa48("92456") ? {} : (stryCov_9fa48("92456"), {
            replicaId,
            entityId: groupId,
            status: ReplicaStatus.ACTIVE
          });
          this.localReplicas.set(replicaId, replica);
          return replica;
        }
      }
      const service = stryMutAct_9fa48("92458") ? this.systemTableCache.get?.(SYSTEM_TABLE_NAME.SERVICES, replicaId) : stryMutAct_9fa48("92457") ? this.systemTableCache?.get(SYSTEM_TABLE_NAME.SERVICES, replicaId) : (stryCov_9fa48("92457", "92458"), this.systemTableCache?.get?.(SYSTEM_TABLE_NAME.SERVICES, replicaId));
      if (stryMutAct_9fa48("92461") ? service && service.service_type === SERVICE_TYPE.MESSAGE_GROUP && service.node_id === this.nodeId || !groupId || service.group_id === groupId : stryMutAct_9fa48("92460") ? false : stryMutAct_9fa48("92459") ? true : (stryCov_9fa48("92459", "92460", "92461"), (stryMutAct_9fa48("92463") ? service && service.service_type === SERVICE_TYPE.MESSAGE_GROUP || service.node_id === this.nodeId : stryMutAct_9fa48("92462") ? true : (stryCov_9fa48("92462", "92463"), (stryMutAct_9fa48("92465") ? service || service.service_type === SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("92464") ? true : (stryCov_9fa48("92464", "92465"), service && (stryMutAct_9fa48("92467") ? service.service_type !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("92466") ? true : (stryCov_9fa48("92466", "92467"), service.service_type === SERVICE_TYPE.MESSAGE_GROUP)))) && (stryMutAct_9fa48("92469") ? service.node_id !== this.nodeId : stryMutAct_9fa48("92468") ? true : (stryCov_9fa48("92468", "92469"), service.node_id === this.nodeId)))) && (stryMutAct_9fa48("92471") ? !groupId && service.group_id === groupId : stryMutAct_9fa48("92470") ? true : (stryCov_9fa48("92470", "92471"), (stryMutAct_9fa48("92472") ? groupId : (stryCov_9fa48("92472"), !groupId)) || (stryMutAct_9fa48("92474") ? service.group_id !== groupId : stryMutAct_9fa48("92473") ? false : (stryCov_9fa48("92473", "92474"), service.group_id === groupId)))))) {
        if (stryMutAct_9fa48("92475")) {
          {}
        } else {
          stryCov_9fa48("92475");
          const replica = stryMutAct_9fa48("92476") ? {} : (stryCov_9fa48("92476"), {
            replicaId,
            entityId: stryMutAct_9fa48("92479") ? groupId && service.group_id : stryMutAct_9fa48("92478") ? false : stryMutAct_9fa48("92477") ? true : (stryCov_9fa48("92477", "92478", "92479"), groupId || service.group_id),
            status: ReplicaStatus.ACTIVE
          });
          this.localReplicas.set(replicaId, replica);
          return replica;
        }
      }
      return null;
    }
  }

  /**
     * Emit a typed executor outcome instead of writing to
     * replica_operations directly. The coordinator consumes these
     * outcomes through the owner-key reconcile queue.
     *
     * @param {string} outcomeType - EXECUTOR_OUTCOME_TYPE value.
     * @param {string} operationId - Replica operation ID.
     * @param {string} workflowStep - WORKFLOW_STEP the executor reached.
     * @param {Object} [options] - Optional replicaId, errorMessage.
     */
  emitExecutorOutcome(outcomeType, operationId, workflowStep, options = {}) {
    if (stryMutAct_9fa48("92480")) {
      {}
    } else {
      stryCov_9fa48("92480");
      if (stryMutAct_9fa48("92482") ? false : stryMutAct_9fa48("92481") ? true : (stryCov_9fa48("92481", "92482"), this.executorOutcomeEmitter)) {
        if (stryMutAct_9fa48("92483")) {
          {}
        } else {
          stryCov_9fa48("92483");
          this.executorOutcomeEmitter.emitOutcome(outcomeType, operationId, workflowStep, options);
        }
      }
    }
  }
  registerWithRouter(messageRouter, options = {}) {
    if (stryMutAct_9fa48("92484")) {
      {}
    } else {
      stryCov_9fa48("92484");
      if (stryMutAct_9fa48("92487") ? false : stryMutAct_9fa48("92486") ? true : stryMutAct_9fa48("92485") ? messageRouter : (stryCov_9fa48("92485", "92486", "92487"), !messageRouter)) {
        if (stryMutAct_9fa48("92488")) {
          {}
        } else {
          stryCov_9fa48("92488");
          this.logger.warn(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.NO_MESSAGE_ROUTER);
          return;
        }
      }
      this.messageRouter = messageRouter;
      const handlerAddress = (stryMutAct_9fa48("92489") ? `` : (stryCov_9fa48("92489"), `${this.nodeId}/`)) + (stryMutAct_9fa48("92490") ? `` : (stryCov_9fa48("92490"), `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT}/`)) + (stryMutAct_9fa48("92491") ? `` : (stryCov_9fa48("92491"), `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.HANDLER_ID}`));
      if (stryMutAct_9fa48("92493") ? false : stryMutAct_9fa48("92492") ? true : (stryCov_9fa48("92492", "92493"), options.rpcClient)) {
        if (stryMutAct_9fa48("92494")) {
          {}
        } else {
          stryCov_9fa48("92494");
          this.rpcClient = options.rpcClient;
        }
      }
      const routerHandler = async envelope => {
        if (stryMutAct_9fa48("92495")) {
          {}
        } else {
          stryCov_9fa48("92495");
          const response = await this.handleMessage(envelope);
          if (stryMutAct_9fa48("92498") ? this.rpcClient || response.correlationId : stryMutAct_9fa48("92497") ? false : stryMutAct_9fa48("92496") ? true : (stryCov_9fa48("92496", "92497", "92498"), this.rpcClient && response.correlationId)) {
            if (stryMutAct_9fa48("92499")) {
              {}
            } else {
              stryCov_9fa48("92499");
              this.rpcClient.handleResponse(response.correlationId, response);
            }
          }
          return stryMutAct_9fa48("92500") ? {} : (stryCov_9fa48("92500"), {
            acknowledged: stryMutAct_9fa48("92501") ? false : (stryCov_9fa48("92501"), true),
            ...response
          });
        }
      };
      messageRouter.register(handlerAddress, routerHandler);
      this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.REGISTERED_ROUTER, stryMutAct_9fa48("92502") ? {} : (stryCov_9fa48("92502"), {
        address: handlerAddress,
        nodeId: this.nodeId
      }));
    }
  }
  unregisterFromRouter(messageRouter) {
    if (stryMutAct_9fa48("92503")) {
      {}
    } else {
      stryCov_9fa48("92503");
      if (stryMutAct_9fa48("92506") ? false : stryMutAct_9fa48("92505") ? true : stryMutAct_9fa48("92504") ? messageRouter : (stryCov_9fa48("92504", "92505", "92506"), !messageRouter)) {
        if (stryMutAct_9fa48("92507")) {
          {}
        } else {
          stryCov_9fa48("92507");
          return;
        }
      }
      const handlerAddress = (stryMutAct_9fa48("92508") ? `` : (stryCov_9fa48("92508"), `${this.nodeId}/`)) + (stryMutAct_9fa48("92509") ? `` : (stryCov_9fa48("92509"), `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT}/`)) + (stryMutAct_9fa48("92510") ? `` : (stryCov_9fa48("92510"), `${MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS.HANDLER_ID}`));
      if (stryMutAct_9fa48("92512") ? false : stryMutAct_9fa48("92511") ? true : (stryCov_9fa48("92511", "92512"), isFunction(messageRouter.unregister))) {
        if (stryMutAct_9fa48("92513")) {
          {}
        } else {
          stryCov_9fa48("92513");
          messageRouter.unregister(handlerAddress);
        }
      }
      this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.UNREGISTERED_ROUTER, stryMutAct_9fa48("92514") ? {} : (stryCov_9fa48("92514"), {
        address: handlerAddress,
        nodeId: this.nodeId
      }));
    }
  }
  shutdown() {
    if (stryMutAct_9fa48("92515")) {
      {}
    } else {
      stryCov_9fa48("92515");
      this.logger.info(MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG.SHUTTING_DOWN, stryMutAct_9fa48("92516") ? {} : (stryCov_9fa48("92516"), {
        nodeId: this.nodeId
      }));
      this.inProgressOperations.clear();
      this.localReplicas.clear();
      this.removeAllListeners();
    }
  }
}
export { MessageGroupServiceHandler };