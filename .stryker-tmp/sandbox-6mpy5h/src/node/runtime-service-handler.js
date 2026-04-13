/**
 * RuntimeServiceHandler - Handles CREATE_REPLICA and REMOVE_REPLICA
 * operations for runtime-service entities.
 *
 * Delegates to ServiceLifecycleManager for replica materialization
 * and uses the existing operation step persistence path via
 * cdcIntegrationService.
 *
 * Requirements: 2.1, 3.2, 4.4, 11.2
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
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { TYPEOF, UNIFIED_SERVICE_TYPE, WORKFLOW_STEP } from '../constants/index.js';
import { ReplicaOperationMessageType, ReplicaOperationField, ReplicaOperationResponseStatus } from '../rebalancer/replica-operation-constants.js';
import { ReplicaStatus } from '../rebalancer/replica-status.js';
import { EXECUTOR_OUTCOME_TYPE } from '../rebalancer/executor-outcome-constants.js';
import { RUNTIME_SERVICE_HANDLER_ADDRESS, RUNTIME_SERVICE_HANDLER_ERROR_MSG, RUNTIME_SERVICE_HANDLER_LOG_MSG, RUNTIME_SERVICE_HANDLER_SUBSYSTEM } from './runtime-service-handler-constants.js';
function buildReplicaOperationResponse(status, fields = {}) {
  if (stryMutAct_9fa48("96965")) {
    {}
  } else {
    stryCov_9fa48("96965");
    return stryMutAct_9fa48("96966") ? {} : (stryCov_9fa48("96966"), {
      status,
      ...fields
    });
  }
}
class RuntimeServiceHandler extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration.
   * @param {Object} options.serviceLifecycleManager - Lifecycle manager.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("96967")) {
      {}
    } else {
      stryCov_9fa48("96967");
      super();
      this.nodeId = stryMutAct_9fa48("96970") ? options.nodeId && null : stryMutAct_9fa48("96969") ? false : stryMutAct_9fa48("96968") ? true : (stryCov_9fa48("96968", "96969", "96970"), options.nodeId || null);
      this.systemTableCache = stryMutAct_9fa48("96973") ? options.systemTableCache && null : stryMutAct_9fa48("96972") ? false : stryMutAct_9fa48("96971") ? true : (stryCov_9fa48("96971", "96972", "96973"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("96976") ? options.cdcIntegrationService && null : stryMutAct_9fa48("96975") ? false : stryMutAct_9fa48("96974") ? true : (stryCov_9fa48("96974", "96975", "96976"), options.cdcIntegrationService || null);
      this.serviceLifecycleManager = stryMutAct_9fa48("96979") ? options.serviceLifecycleManager && null : stryMutAct_9fa48("96978") ? false : stryMutAct_9fa48("96977") ? true : (stryCov_9fa48("96977", "96978", "96979"), options.serviceLifecycleManager || null);
      this.rpcClient = null;

      // Executor outcome emitter — replaces direct replica_operations writes.
      this.executorOutcomeEmitter = stryMutAct_9fa48("96982") ? options.executorOutcomeEmitter && null : stryMutAct_9fa48("96981") ? false : stryMutAct_9fa48("96980") ? true : (stryCov_9fa48("96980", "96981", "96982"), options.executorOutcomeEmitter || null);

      /** @type {Map<string, Object>} In-progress operations by ID */
      this.inProgressOperations = new Map();
      /** @type {Map<string, Object>} Local replica state by ID */
      this.localReplicas = new Map();
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(RUNTIME_SERVICE_HANDLER_SUBSYSTEM) : console;
    }
  }

  /**
   * Validate required dependencies.
   */
  initialize() {
    if (stryMutAct_9fa48("96983")) {
      {}
    } else {
      stryCov_9fa48("96983");
      this.logger.debug(RUNTIME_SERVICE_HANDLER_LOG_MSG.INITIALIZING, stryMutAct_9fa48("96984") ? {} : (stryCov_9fa48("96984"), {
        nodeId: this.nodeId
      }));
      if (stryMutAct_9fa48("96987") ? false : stryMutAct_9fa48("96986") ? true : stryMutAct_9fa48("96985") ? this.serviceLifecycleManager : (stryCov_9fa48("96985", "96986", "96987"), !this.serviceLifecycleManager)) {
        if (stryMutAct_9fa48("96988")) {
          {}
        } else {
          stryCov_9fa48("96988");
          throw new Error(RUNTIME_SERVICE_HANDLER_ERROR_MSG.LIFECYCLE_MANAGER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("96991") ? false : stryMutAct_9fa48("96990") ? true : stryMutAct_9fa48("96989") ? this.cdcIntegrationService : (stryCov_9fa48("96989", "96990", "96991"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("96992")) {
          {}
        } else {
          stryCov_9fa48("96992");
          throw new Error(RUNTIME_SERVICE_HANDLER_ERROR_MSG.CDC_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("96995") ? false : stryMutAct_9fa48("96994") ? true : stryMutAct_9fa48("96993") ? this.systemTableCache : (stryCov_9fa48("96993", "96994", "96995"), !this.systemTableCache)) {
        if (stryMutAct_9fa48("96996")) {
          {}
        } else {
          stryCov_9fa48("96996");
          throw new Error(RUNTIME_SERVICE_HANDLER_ERROR_MSG.CACHE_REQUIRED);
        }
      }
    }
  }

  /**
   * Handle incoming message envelope.
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Response.
   */
  async handleMessage(envelope) {
    if (stryMutAct_9fa48("96997")) {
      {}
    } else {
      stryCov_9fa48("96997");
      const {
        payload,
        correlationId
      } = envelope;
      const type = stryMutAct_9fa48("96998") ? payload[ReplicaOperationField.TYPE] : (stryCov_9fa48("96998"), payload?.[ReplicaOperationField.TYPE]);
      this.logger.debug(RUNTIME_SERVICE_HANDLER_LOG_MSG.MESSAGE_RECEIVED, stryMutAct_9fa48("96999") ? {} : (stryCov_9fa48("96999"), {
        type,
        correlationId,
        operationId: stryMutAct_9fa48("97000") ? payload.operationId : (stryCov_9fa48("97000"), payload?.operationId)
      }));
      let response;
      if (stryMutAct_9fa48("97003") ? type !== ReplicaOperationMessageType.CREATE_REPLICA : stryMutAct_9fa48("97002") ? false : stryMutAct_9fa48("97001") ? true : (stryCov_9fa48("97001", "97002", "97003"), type === ReplicaOperationMessageType.CREATE_REPLICA)) {
        if (stryMutAct_9fa48("97004")) {
          {}
        } else {
          stryCov_9fa48("97004");
          response = await this.handleCreateReplica(payload);
        }
      } else if (stryMutAct_9fa48("97007") ? type !== ReplicaOperationMessageType.REMOVE_REPLICA : stryMutAct_9fa48("97006") ? false : stryMutAct_9fa48("97005") ? true : (stryCov_9fa48("97005", "97006", "97007"), type === ReplicaOperationMessageType.REMOVE_REPLICA)) {
        if (stryMutAct_9fa48("97008")) {
          {}
        } else {
          stryCov_9fa48("97008");
          response = await this.handleRemoveReplica(payload);
        }
      } else {
        if (stryMutAct_9fa48("97009")) {
          {}
        } else {
          stryCov_9fa48("97009");
          const unknownType = RUNTIME_SERVICE_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE;
          response = buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, stryMutAct_9fa48("97010") ? {} : (stryCov_9fa48("97010"), {
            error: unknownType(type)
          }));
        }
      }
      return stryMutAct_9fa48("97011") ? {} : (stryCov_9fa48("97011"), {
        ...response,
        correlationId
      });
    }
  }

  /**
   * Handle CREATE_REPLICA for a runtime service.
   * @param {Object} request - Operation request payload.
   * @return {Promise<Object>} Response.
   */
  async handleCreateReplica(request) {
    if (stryMutAct_9fa48("97012")) {
      {}
    } else {
      stryCov_9fa48("97012");
      const operationId = stryMutAct_9fa48("97013") ? request[ReplicaOperationField.OPERATION_ID] : (stryCov_9fa48("97013"), request?.[ReplicaOperationField.OPERATION_ID]);
      const entityId = stryMutAct_9fa48("97014") ? request[ReplicaOperationField.ENTITY_ID] : (stryCov_9fa48("97014"), request?.[ReplicaOperationField.ENTITY_ID]);
      const replicaId = stryMutAct_9fa48("97015") ? request[ReplicaOperationField.REPLICA_ID] : (stryCov_9fa48("97015"), request?.[ReplicaOperationField.REPLICA_ID]);
      this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_REQUEST, stryMutAct_9fa48("97016") ? {} : (stryCov_9fa48("97016"), {
        operationId,
        entityId,
        replicaId,
        nodeId: this.nodeId
      }));
      if (stryMutAct_9fa48("97019") ? (!operationId || !entityId) && !replicaId : stryMutAct_9fa48("97018") ? false : stryMutAct_9fa48("97017") ? true : (stryCov_9fa48("97017", "97018", "97019"), (stryMutAct_9fa48("97021") ? !operationId && !entityId : stryMutAct_9fa48("97020") ? false : (stryCov_9fa48("97020", "97021"), (stryMutAct_9fa48("97022") ? operationId : (stryCov_9fa48("97022"), !operationId)) || (stryMutAct_9fa48("97023") ? entityId : (stryCov_9fa48("97023"), !entityId)))) || (stryMutAct_9fa48("97024") ? replicaId : (stryCov_9fa48("97024"), !replicaId)))) {
        if (stryMutAct_9fa48("97025")) {
          {}
        } else {
          stryCov_9fa48("97025");
          this.logger.warn(RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_MISSING_FIELDS, stryMutAct_9fa48("97026") ? {} : (stryCov_9fa48("97026"), {
            operationId,
            entityId,
            replicaId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, stryMutAct_9fa48("97027") ? {} : (stryCov_9fa48("97027"), {
            error: RUNTIME_SERVICE_HANDLER_ERROR_MSG.CREATE_REQUIRED_FIELDS,
            nodeId: this.nodeId
          }));
        }
      }

      // Idempotency: existing active replica
      const existing = this.localReplicas.get(replicaId);
      if (stryMutAct_9fa48("97029") ? false : stryMutAct_9fa48("97028") ? true : (stryCov_9fa48("97028", "97029"), existing)) {
        if (stryMutAct_9fa48("97030")) {
          {}
        } else {
          stryCov_9fa48("97030");
          if (stryMutAct_9fa48("97033") ? existing.status !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("97032") ? false : stryMutAct_9fa48("97031") ? true : (stryCov_9fa48("97031", "97032", "97033"), existing.status === ReplicaStatus.ACTIVE)) {
            if (stryMutAct_9fa48("97034")) {
              {}
            } else {
              stryCov_9fa48("97034");
              this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_ALREADY_ACTIVE, stryMutAct_9fa48("97035") ? {} : (stryCov_9fa48("97035"), {
                replicaId,
                nodeId: this.nodeId
              }));
              return buildReplicaOperationResponse(ReplicaOperationResponseStatus.ALREADY_EXISTS, stryMutAct_9fa48("97036") ? {} : (stryCov_9fa48("97036"), {
                replicaId,
                nodeId: this.nodeId
              }));
            }
          }
          if (stryMutAct_9fa48("97039") ? existing.status !== ReplicaStatus.CREATING : stryMutAct_9fa48("97038") ? false : stryMutAct_9fa48("97037") ? true : (stryCov_9fa48("97037", "97038", "97039"), existing.status === ReplicaStatus.CREATING)) {
            if (stryMutAct_9fa48("97040")) {
              {}
            } else {
              stryCov_9fa48("97040");
              this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_IN_PROGRESS, stryMutAct_9fa48("97041") ? {} : (stryCov_9fa48("97041"), {
                replicaId,
                nodeId: this.nodeId
              }));
              return buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("97042") ? {} : (stryCov_9fa48("97042"), {
                replicaId,
                nodeId: this.nodeId
              }));
            }
          }
        }
      }

      // Idempotency: in-progress operation
      if (stryMutAct_9fa48("97044") ? false : stryMutAct_9fa48("97043") ? true : (stryCov_9fa48("97043", "97044"), this.inProgressOperations.has(operationId))) {
        if (stryMutAct_9fa48("97045")) {
          {}
        } else {
          stryCov_9fa48("97045");
          this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, stryMutAct_9fa48("97046") ? {} : (stryCov_9fa48("97046"), {
            operationId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("97047") ? {} : (stryCov_9fa48("97047"), {
            operationId,
            nodeId: this.nodeId
          }));
        }
      }

      // Track in-progress
      this.localReplicas.set(replicaId, stryMutAct_9fa48("97048") ? {} : (stryCov_9fa48("97048"), {
        replicaId,
        entityId,
        status: ReplicaStatus.CREATING
      }));
      this.inProgressOperations.set(operationId, stryMutAct_9fa48("97049") ? {} : (stryCov_9fa48("97049"), {
        type: ReplicaOperationMessageType.CREATE_REPLICA,
        replicaId,
        entityId,
        startedAt: Date.now()
      }));

      // Async creation after ACK
      setImmediate(() => {
        if (stryMutAct_9fa48("97050")) {
          {}
        } else {
          stryCov_9fa48("97050");
          this.createReplicaAsync(stryMutAct_9fa48("97051") ? {} : (stryCov_9fa48("97051"), {
            operationId,
            entityId,
            replicaId
          })).catch(error => {
            if (stryMutAct_9fa48("97052")) {
              {}
            } else {
              stryCov_9fa48("97052");
              this.logger.error(RUNTIME_SERVICE_HANDLER_LOG_MSG.ASYNC_CREATE_FAILED, stryMutAct_9fa48("97053") ? {} : (stryCov_9fa48("97053"), {
                operationId,
                replicaId,
                error: error.message,
                stack: error.stack
              }));
            }
          });
        }
      });
      return buildReplicaOperationResponse(ReplicaOperationResponseStatus.INITIATED, stryMutAct_9fa48("97054") ? {} : (stryCov_9fa48("97054"), {
        operationId,
        replicaId,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Async create: resolve definition, create + start replica,
   * persist operation transitions.
   * @param {Object} params
   * @param {string} params.operationId
   * @param {string} params.entityId
   * @param {string} params.replicaId
   * @return {Promise<void>}
   */
  async createReplicaAsync({
    operationId,
    entityId,
    replicaId
  }) {
    if (stryMutAct_9fa48("97055")) {
      {}
    } else {
      stryCov_9fa48("97055");
      try {
        if (stryMutAct_9fa48("97056")) {
          {}
        } else {
          stryCov_9fa48("97056");
          const definition = this.resolveServiceDefinition(entityId);
          if (stryMutAct_9fa48("97059") ? false : stryMutAct_9fa48("97058") ? true : stryMutAct_9fa48("97057") ? definition : (stryCov_9fa48("97057", "97058", "97059"), !definition)) {
            if (stryMutAct_9fa48("97060")) {
              {}
            } else {
              stryCov_9fa48("97060");
              const definitionNotFound = RUNTIME_SERVICE_HANDLER_ERROR_MSG.DEFINITION_NOT_FOUND;
              throw new Error(definitionNotFound(entityId));
            }
          }
          const replicaHandle = stryMutAct_9fa48("97061") ? {} : (stryCov_9fa48("97061"), {
            serviceId: replicaId,
            serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
            replicaId,
            ...definition
          });
          await this.serviceLifecycleManager.createReplica(replicaHandle, stryMutAct_9fa48("97062") ? {} : (stryCov_9fa48("97062"), {
            nodeId: this.nodeId
          }));
          await this.serviceLifecycleManager.startReplica(replicaHandle, stryMutAct_9fa48("97063") ? {} : (stryCov_9fa48("97063"), {
            nodeId: this.nodeId
          }));
          this.localReplicas.set(replicaId, stryMutAct_9fa48("97064") ? {} : (stryCov_9fa48("97064"), {
            replicaId,
            entityId,
            status: ReplicaStatus.ACTIVE
          }));

          // Emit active outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE, operationId, WORKFLOW_STEP.ACTIVE, stryMutAct_9fa48("97065") ? {} : (stryCov_9fa48("97065"), {
            replicaId
          }));
          this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_COMPLETED, stryMutAct_9fa48("97066") ? {} : (stryCov_9fa48("97066"), {
            operationId,
            replicaId,
            entityId,
            nodeId: this.nodeId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("97067")) {
          {}
        } else {
          stryCov_9fa48("97067");
          this.localReplicas.set(replicaId, stryMutAct_9fa48("97068") ? {} : (stryCov_9fa48("97068"), {
            replicaId,
            entityId,
            status: ReplicaStatus.FAILED
          }));

          // Emit failed outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED, operationId, WORKFLOW_STEP.FAILED, stryMutAct_9fa48("97069") ? {} : (stryCov_9fa48("97069"), {
            replicaId,
            errorMessage: error.message
          }));
          this.logger.error(RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_FAILED, stryMutAct_9fa48("97070") ? {} : (stryCov_9fa48("97070"), {
            operationId,
            replicaId,
            entityId,
            error: error.message,
            nodeId: this.nodeId
          }));
        }
      } finally {
        if (stryMutAct_9fa48("97071")) {
          {}
        } else {
          stryCov_9fa48("97071");
          this.inProgressOperations.delete(operationId);
        }
      }
    }
  }

  /**
   * Handle REMOVE_REPLICA for a runtime service.
   * @param {Object} request - Operation request payload.
   * @return {Promise<Object>} Response.
   */
  async handleRemoveReplica(request) {
    if (stryMutAct_9fa48("97072")) {
      {}
    } else {
      stryCov_9fa48("97072");
      const operationId = stryMutAct_9fa48("97073") ? request[ReplicaOperationField.OPERATION_ID] : (stryCov_9fa48("97073"), request?.[ReplicaOperationField.OPERATION_ID]);
      const entityId = stryMutAct_9fa48("97074") ? request[ReplicaOperationField.ENTITY_ID] : (stryCov_9fa48("97074"), request?.[ReplicaOperationField.ENTITY_ID]);
      const replicaId = stryMutAct_9fa48("97075") ? request[ReplicaOperationField.REPLICA_ID] : (stryCov_9fa48("97075"), request?.[ReplicaOperationField.REPLICA_ID]);
      const reason = stryMutAct_9fa48("97076") ? request[ReplicaOperationField.REASON] : (stryCov_9fa48("97076"), request?.[ReplicaOperationField.REASON]);
      this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_REQUEST, stryMutAct_9fa48("97077") ? {} : (stryCov_9fa48("97077"), {
        operationId,
        entityId,
        replicaId,
        reason,
        nodeId: this.nodeId
      }));
      if (stryMutAct_9fa48("97080") ? (!operationId || !entityId) && !replicaId : stryMutAct_9fa48("97079") ? false : stryMutAct_9fa48("97078") ? true : (stryCov_9fa48("97078", "97079", "97080"), (stryMutAct_9fa48("97082") ? !operationId && !entityId : stryMutAct_9fa48("97081") ? false : (stryCov_9fa48("97081", "97082"), (stryMutAct_9fa48("97083") ? operationId : (stryCov_9fa48("97083"), !operationId)) || (stryMutAct_9fa48("97084") ? entityId : (stryCov_9fa48("97084"), !entityId)))) || (stryMutAct_9fa48("97085") ? replicaId : (stryCov_9fa48("97085"), !replicaId)))) {
        if (stryMutAct_9fa48("97086")) {
          {}
        } else {
          stryCov_9fa48("97086");
          this.logger.warn(RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_MISSING_FIELDS, stryMutAct_9fa48("97087") ? {} : (stryCov_9fa48("97087"), {
            operationId,
            entityId,
            replicaId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, stryMutAct_9fa48("97088") ? {} : (stryCov_9fa48("97088"), {
            error: RUNTIME_SERVICE_HANDLER_ERROR_MSG.REMOVE_REQUIRED_FIELDS,
            nodeId: this.nodeId
          }));
        }
      }
      const replica = this.localReplicas.get(replicaId);
      if (stryMutAct_9fa48("97091") ? false : stryMutAct_9fa48("97090") ? true : stryMutAct_9fa48("97089") ? replica : (stryCov_9fa48("97089", "97090", "97091"), !replica)) {
        if (stryMutAct_9fa48("97092")) {
          {}
        } else {
          stryCov_9fa48("97092");
          this.logger.warn(RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_NOT_FOUND, stryMutAct_9fa48("97093") ? {} : (stryCov_9fa48("97093"), {
            replicaId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.NOT_FOUND, stryMutAct_9fa48("97094") ? {} : (stryCov_9fa48("97094"), {
            replicaId,
            nodeId: this.nodeId
          }));
        }
      }
      if (stryMutAct_9fa48("97097") ? replica.status !== ReplicaStatus.REMOVING : stryMutAct_9fa48("97096") ? false : stryMutAct_9fa48("97095") ? true : (stryCov_9fa48("97095", "97096", "97097"), replica.status === ReplicaStatus.REMOVING)) {
        if (stryMutAct_9fa48("97098")) {
          {}
        } else {
          stryCov_9fa48("97098");
          this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_IN_PROGRESS, stryMutAct_9fa48("97099") ? {} : (stryCov_9fa48("97099"), {
            replicaId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("97100") ? {} : (stryCov_9fa48("97100"), {
            replicaId,
            nodeId: this.nodeId
          }));
        }
      }
      if (stryMutAct_9fa48("97103") ? replica.status !== ReplicaStatus.REMOVED : stryMutAct_9fa48("97102") ? false : stryMutAct_9fa48("97101") ? true : (stryCov_9fa48("97101", "97102", "97103"), replica.status === ReplicaStatus.REMOVED)) {
        if (stryMutAct_9fa48("97104")) {
          {}
        } else {
          stryCov_9fa48("97104");
          this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED, stryMutAct_9fa48("97105") ? {} : (stryCov_9fa48("97105"), {
            replicaId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.COMPLETED, stryMutAct_9fa48("97106") ? {} : (stryCov_9fa48("97106"), {
            replicaId,
            nodeId: this.nodeId
          }));
        }
      }
      if (stryMutAct_9fa48("97108") ? false : stryMutAct_9fa48("97107") ? true : (stryCov_9fa48("97107", "97108"), this.inProgressOperations.has(operationId))) {
        if (stryMutAct_9fa48("97109")) {
          {}
        } else {
          stryCov_9fa48("97109");
          this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, stryMutAct_9fa48("97110") ? {} : (stryCov_9fa48("97110"), {
            operationId,
            nodeId: this.nodeId
          }));
          return buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("97111") ? {} : (stryCov_9fa48("97111"), {
            operationId,
            nodeId: this.nodeId
          }));
        }
      }
      this.inProgressOperations.set(operationId, stryMutAct_9fa48("97112") ? {} : (stryCov_9fa48("97112"), {
        type: ReplicaOperationMessageType.REMOVE_REPLICA,
        replicaId,
        entityId,
        startedAt: Date.now()
      }));
      this.localReplicas.set(replicaId, stryMutAct_9fa48("97113") ? {} : (stryCov_9fa48("97113"), {
        ...replica,
        status: ReplicaStatus.REMOVING
      }));

      // Async removal after ACK
      setImmediate(() => {
        if (stryMutAct_9fa48("97114")) {
          {}
        } else {
          stryCov_9fa48("97114");
          this.removeReplicaAsync(stryMutAct_9fa48("97115") ? {} : (stryCov_9fa48("97115"), {
            operationId,
            entityId,
            replicaId,
            reason
          })).catch(error => {
            if (stryMutAct_9fa48("97116")) {
              {}
            } else {
              stryCov_9fa48("97116");
              this.logger.error(RUNTIME_SERVICE_HANDLER_LOG_MSG.ASYNC_REMOVE_FAILED, stryMutAct_9fa48("97117") ? {} : (stryCov_9fa48("97117"), {
                operationId,
                replicaId,
                error: error.message,
                stack: error.stack
              }));
            }
          });
        }
      });
      return buildReplicaOperationResponse(ReplicaOperationResponseStatus.INITIATED, stryMutAct_9fa48("97118") ? {} : (stryCov_9fa48("97118"), {
        operationId,
        replicaId,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Async remove: stop replica via lifecycle manager,
   * persist operation transitions.
   * @param {Object} params
   * @param {string} params.operationId
   * @param {string} params.entityId
   * @param {string} params.replicaId
   * @param {string} [params.reason]
   * @return {Promise<void>}
   */
  async removeReplicaAsync({
    operationId,
    entityId,
    replicaId,
    reason
  }) {
    if (stryMutAct_9fa48("97119")) {
      {}
    } else {
      stryCov_9fa48("97119");
      try {
        if (stryMutAct_9fa48("97120")) {
          {}
        } else {
          stryCov_9fa48("97120");
          const definition = this.resolveServiceDefinition(entityId);
          const replicaHandle = stryMutAct_9fa48("97121") ? {} : (stryCov_9fa48("97121"), {
            serviceId: replicaId,
            serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
            replicaId,
            ...(stryMutAct_9fa48("97124") ? definition && {} : stryMutAct_9fa48("97123") ? false : stryMutAct_9fa48("97122") ? true : (stryCov_9fa48("97122", "97123", "97124"), definition || {}))
          });
          await this.serviceLifecycleManager.stopReplica(replicaHandle, stryMutAct_9fa48("97125") ? {} : (stryCov_9fa48("97125"), {
            nodeId: this.nodeId,
            reason
          }));
          this.localReplicas.set(replicaId, stryMutAct_9fa48("97126") ? {} : (stryCov_9fa48("97126"), {
            replicaId,
            entityId,
            status: ReplicaStatus.REMOVED
          }));

          // Emit removed outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_COMPLETED, operationId, WORKFLOW_STEP.REMOVED, stryMutAct_9fa48("97127") ? {} : (stryCov_9fa48("97127"), {
            replicaId
          }));
          this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_COMPLETED, stryMutAct_9fa48("97128") ? {} : (stryCov_9fa48("97128"), {
            operationId,
            replicaId,
            entityId,
            nodeId: this.nodeId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("97129")) {
          {}
        } else {
          stryCov_9fa48("97129");
          this.localReplicas.set(replicaId, stryMutAct_9fa48("97130") ? {} : (stryCov_9fa48("97130"), {
            replicaId,
            entityId,
            status: ReplicaStatus.FAILED
          }));

          // Emit failed outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_FAILED, operationId, WORKFLOW_STEP.FAILED, stryMutAct_9fa48("97131") ? {} : (stryCov_9fa48("97131"), {
            replicaId,
            errorMessage: error.message
          }));
          this.logger.error(RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_FAILED, stryMutAct_9fa48("97132") ? {} : (stryCov_9fa48("97132"), {
            operationId,
            replicaId,
            entityId,
            error: error.message,
            nodeId: this.nodeId
          }));
        }
      } finally {
        if (stryMutAct_9fa48("97133")) {
          {}
        } else {
          stryCov_9fa48("97133");
          this.inProgressOperations.delete(operationId);
        }
      }
    }
  }

  /**
   * Resolve service definition from system table cache.
   * @param {string} entityId - Service definition ID.
   * @return {Object|null} Definition row or null.
   */
  resolveServiceDefinition(entityId) {
    if (stryMutAct_9fa48("97134")) {
      {}
    } else {
      stryCov_9fa48("97134");
      if (stryMutAct_9fa48("97137") ? !this.systemTableCache && typeof this.systemTableCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("97136") ? false : stryMutAct_9fa48("97135") ? true : (stryCov_9fa48("97135", "97136", "97137"), (stryMutAct_9fa48("97138") ? this.systemTableCache : (stryCov_9fa48("97138"), !this.systemTableCache)) || (stryMutAct_9fa48("97140") ? typeof this.systemTableCache.get === TYPEOF.FUNCTION : stryMutAct_9fa48("97139") ? false : (stryCov_9fa48("97139", "97140"), typeof this.systemTableCache.get !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("97141")) {
          {}
        } else {
          stryCov_9fa48("97141");
          return null;
        }
      }
      const row = this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS, entityId);
      if (stryMutAct_9fa48("97144") ? false : stryMutAct_9fa48("97143") ? true : stryMutAct_9fa48("97142") ? row : (stryCov_9fa48("97142", "97143", "97144"), !row)) {
        if (stryMutAct_9fa48("97145")) {
          {}
        } else {
          stryCov_9fa48("97145");
          this.logger.warn(RUNTIME_SERVICE_HANDLER_LOG_MSG.DEFINITION_NOT_FOUND, stryMutAct_9fa48("97146") ? {} : (stryCov_9fa48("97146"), {
            entityId,
            nodeId: this.nodeId
          }));
          return null;
        }
      }
      return row;
    }
  }

  /**
   * Persist operation step transition via CDC.
   * @param {string} operationId
   * @param {string} workflowStep
   * @param {Object} [options]
   * @return {Promise<void>}
   */
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
    if (stryMutAct_9fa48("97147")) {
      {}
    } else {
      stryCov_9fa48("97147");
      if (stryMutAct_9fa48("97149") ? false : stryMutAct_9fa48("97148") ? true : (stryCov_9fa48("97148", "97149"), this.executorOutcomeEmitter)) {
        if (stryMutAct_9fa48("97150")) {
          {}
        } else {
          stryCov_9fa48("97150");
          this.executorOutcomeEmitter.emitOutcome(outcomeType, operationId, workflowStep, options);
        }
      }
    }
  }

  /**
   * Register this handler with a message router.
   * @param {Object} messageRouter - Message router instance.
   * @param {Object} [options] - Registration options.
   */
  registerWithRouter(messageRouter, options = {}) {
    if (stryMutAct_9fa48("97151")) {
      {}
    } else {
      stryCov_9fa48("97151");
      if (stryMutAct_9fa48("97154") ? false : stryMutAct_9fa48("97153") ? true : stryMutAct_9fa48("97152") ? messageRouter : (stryCov_9fa48("97152", "97153", "97154"), !messageRouter)) {
        if (stryMutAct_9fa48("97155")) {
          {}
        } else {
          stryCov_9fa48("97155");
          this.logger.warn(RUNTIME_SERVICE_HANDLER_LOG_MSG.NO_MESSAGE_ROUTER);
          return;
        }
      }
      const handlerAddress = (stryMutAct_9fa48("97156") ? `` : (stryCov_9fa48("97156"), `${this.nodeId}/`)) + (stryMutAct_9fa48("97157") ? `` : (stryCov_9fa48("97157"), `${RUNTIME_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT}/`)) + (stryMutAct_9fa48("97158") ? `` : (stryCov_9fa48("97158"), `${RUNTIME_SERVICE_HANDLER_ADDRESS.HANDLER_ID}`));
      if (stryMutAct_9fa48("97160") ? false : stryMutAct_9fa48("97159") ? true : (stryCov_9fa48("97159", "97160"), options.rpcClient)) {
        if (stryMutAct_9fa48("97161")) {
          {}
        } else {
          stryCov_9fa48("97161");
          this.rpcClient = options.rpcClient;
        }
      }
      const routerHandler = async envelope => {
        if (stryMutAct_9fa48("97162")) {
          {}
        } else {
          stryCov_9fa48("97162");
          const response = await this.handleMessage(envelope);
          if (stryMutAct_9fa48("97165") ? this.rpcClient || response.correlationId : stryMutAct_9fa48("97164") ? false : stryMutAct_9fa48("97163") ? true : (stryCov_9fa48("97163", "97164", "97165"), this.rpcClient && response.correlationId)) {
            if (stryMutAct_9fa48("97166")) {
              {}
            } else {
              stryCov_9fa48("97166");
              this.rpcClient.handleResponse(response.correlationId, response);
            }
          }
          return stryMutAct_9fa48("97167") ? {} : (stryCov_9fa48("97167"), {
            acknowledged: stryMutAct_9fa48("97168") ? false : (stryCov_9fa48("97168"), true),
            ...response
          });
        }
      };
      messageRouter.register(handlerAddress, routerHandler);
      this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.REGISTERED_ROUTER, stryMutAct_9fa48("97169") ? {} : (stryCov_9fa48("97169"), {
        address: handlerAddress,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Unregister this handler from a message router.
   * @param {Object} messageRouter - Message router instance.
   */
  unregisterFromRouter(messageRouter) {
    if (stryMutAct_9fa48("97170")) {
      {}
    } else {
      stryCov_9fa48("97170");
      if (stryMutAct_9fa48("97173") ? false : stryMutAct_9fa48("97172") ? true : stryMutAct_9fa48("97171") ? messageRouter : (stryCov_9fa48("97171", "97172", "97173"), !messageRouter)) {
        if (stryMutAct_9fa48("97174")) {
          {}
        } else {
          stryCov_9fa48("97174");
          return;
        }
      }
      const handlerAddress = (stryMutAct_9fa48("97175") ? `` : (stryCov_9fa48("97175"), `${this.nodeId}/`)) + (stryMutAct_9fa48("97176") ? `` : (stryCov_9fa48("97176"), `${RUNTIME_SERVICE_HANDLER_ADDRESS.SERVICE_SEGMENT}/`)) + (stryMutAct_9fa48("97177") ? `` : (stryCov_9fa48("97177"), `${RUNTIME_SERVICE_HANDLER_ADDRESS.HANDLER_ID}`));
      if (stryMutAct_9fa48("97180") ? typeof messageRouter.unregister !== TYPEOF.FUNCTION : stryMutAct_9fa48("97179") ? false : stryMutAct_9fa48("97178") ? true : (stryCov_9fa48("97178", "97179", "97180"), typeof messageRouter.unregister === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("97181")) {
          {}
        } else {
          stryCov_9fa48("97181");
          messageRouter.unregister(handlerAddress);
        }
      }
      this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.UNREGISTERED_ROUTER, stryMutAct_9fa48("97182") ? {} : (stryCov_9fa48("97182"), {
        address: handlerAddress,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Get local replica info.
   * @param {string} replicaId
   * @return {Object|undefined}
   */
  getLocalReplica(replicaId) {
    if (stryMutAct_9fa48("97183")) {
      {}
    } else {
      stryCov_9fa48("97183");
      return this.localReplicas.get(replicaId);
    }
  }

  /**
   * Register an existing replica (e.g. from recovery).
   * @param {Object} replicaInfo
   */
  registerExistingReplica(replicaInfo) {
    if (stryMutAct_9fa48("97184")) {
      {}
    } else {
      stryCov_9fa48("97184");
      if (stryMutAct_9fa48("97187") ? replicaInfo.replicaId : stryMutAct_9fa48("97186") ? false : stryMutAct_9fa48("97185") ? true : (stryCov_9fa48("97185", "97186", "97187"), replicaInfo?.replicaId)) {
        if (stryMutAct_9fa48("97188")) {
          {}
        } else {
          stryCov_9fa48("97188");
          this.localReplicas.set(replicaInfo.replicaId, replicaInfo);
        }
      }
    }
  }

  /**
   * Shutdown handler.
   */
  shutdown() {
    if (stryMutAct_9fa48("97189")) {
      {}
    } else {
      stryCov_9fa48("97189");
      this.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.SHUTTING_DOWN, stryMutAct_9fa48("97190") ? {} : (stryCov_9fa48("97190"), {
        nodeId: this.nodeId
      }));
      this.inProgressOperations.clear();
      this.localReplicas.clear();
      this.removeAllListeners();
    }
  }
}
export { RuntimeServiceHandler };