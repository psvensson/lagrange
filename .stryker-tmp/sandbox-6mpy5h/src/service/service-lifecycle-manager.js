/**
 * Unified lifecycle owner for all service types.
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
import { LoggingService } from '../logging/logging-service.js';
import { NUM, SERVICE_DESCRIPTOR_FIELD, SERVICE_LIFECYCLE_OPERATION, SERVICE_LIFECYCLE_STATE, SERVICE_LIFECYCLE_TRANSITIONS, SERVICE_OPERATION_STATE, SUBSYSTEM, TYPEOF } from '../constants/index.js';
import { buildIdempotencyCheckSQL, buildListOperationsSQL, createOperation, transitionOperation } from '../wasm-service/operation-lifecycle.js';
import { ServiceTypeAdapter } from './service-type-adapter.js';
import { ServiceIdempotencyCheckError, ServiceDescriptorValidationError, ServicePolicyViolationError, ServiceLifecycleTransitionError, ServiceOperationJournalError, UnknownServiceTypeError } from './service-lifecycle-errors.js';
import { assertServiceDescriptor } from './service-descriptor.js';
const SERVICE_LIFECYCLE_MANAGER_LITERAL = Object.freeze(stryMutAct_9fa48("150348") ? {} : (stryCov_9fa48("150348"), {
  UNKNOWNADAPTER: stryMutAct_9fa48("150349") ? "" : (stryCov_9fa48("150349"), 'UnknownAdapter'),
  VALUE: stryMutAct_9fa48("150350") ? "" : (stryCov_9fa48("150350"), '; '),
  ADAPTER_REJECTED_SERVICE_DEFINITION: stryMutAct_9fa48("150351") ? "" : (stryCov_9fa48("150351"), 'adapter rejected service definition')
}));
const LIFECYCLE_MGR_MSG = Object.freeze(stryMutAct_9fa48("150352") ? {} : (stryCov_9fa48("150352"), {
  ADAPTER_INSTANCE_REQUIRED: stryMutAct_9fa48("150353") ? "" : (stryCov_9fa48("150353"), 'adapter must be an instance of ServiceTypeAdapter'),
  ADAPTER_ALREADY_REGISTERED: stryMutAct_9fa48("150354") ? "" : (stryCov_9fa48("150354"), 'adapter already registered for service type'),
  OPERATION_WRITER_REQUIRED: stryMutAct_9fa48("150355") ? "" : (stryCov_9fa48("150355"), 'operation writer must be a function'),
  IDEMPOTENCY_READER_REQUIRED: stryMutAct_9fa48("150356") ? "" : (stryCov_9fa48("150356"), 'idempotency reader must be a function'),
  RECOVERY_READER_REQUIRED: stryMutAct_9fa48("150357") ? "" : (stryCov_9fa48("150357"), 'recovery reader must be a function'),
  RECOVERY_RESOLVER_REQUIRED: stryMutAct_9fa48("150358") ? "" : (stryCov_9fa48("150358"), 'recoverPendingOperations requires resolveServiceContext function'),
  RUNTIME_POLICY_CHECK_REQUIRED: stryMutAct_9fa48("150359") ? "" : (stryCov_9fa48("150359"), 'runtime policy check must be a function'),
  OPERATION_COMMAND_INVALID: stryMutAct_9fa48("150360") ? "" : (stryCov_9fa48("150360"), 'operation command must be "<operation>:<serviceId>"'),
  OPERATION_ID_REQUIRED: stryMutAct_9fa48("150361") ? "" : (stryCov_9fa48("150361"), 'operation row is missing operation_id'),
  SERVICE_ID_REQUIRED: stryMutAct_9fa48("150362") ? "" : (stryCov_9fa48("150362"), 'service context is missing serviceId'),
  SERVICE_TYPE_REQUIRED: stryMutAct_9fa48("150363") ? "" : (stryCov_9fa48("150363"), 'service context is missing serviceType')
}));
const OPERATION_COMMAND_SEPARATOR = stryMutAct_9fa48("150364") ? "" : (stryCov_9fa48("150364"), ':');
const RECOVERY_RESULT_STATUS = Object.freeze(stryMutAct_9fa48("150365") ? {} : (stryCov_9fa48("150365"), {
  RECOVERED: stryMutAct_9fa48("150366") ? "" : (stryCov_9fa48("150366"), 'recovered'),
  SKIPPED: stryMutAct_9fa48("150367") ? "" : (stryCov_9fa48("150367"), 'skipped'),
  FAILED: stryMutAct_9fa48("150368") ? "" : (stryCov_9fa48("150368"), 'failed')
}));
const RECOVERY_SKIP_REASON = Object.freeze(stryMutAct_9fa48("150369") ? {} : (stryCov_9fa48("150369"), {
  INVALID_COMMAND: stryMutAct_9fa48("150370") ? "" : (stryCov_9fa48("150370"), 'invalid_operation_command'),
  UNKNOWN_OPERATION: stryMutAct_9fa48("150371") ? "" : (stryCov_9fa48("150371"), 'unknown_lifecycle_operation'),
  UNRESOLVED_SERVICE: stryMutAct_9fa48("150372") ? "" : (stryCov_9fa48("150372"), 'unresolved_service_context')
}));
const SERVICE_POLICY_TYPE = Object.freeze(stryMutAct_9fa48("150373") ? {} : (stryCov_9fa48("150373"), {
  RUNTIME: stryMutAct_9fa48("150374") ? "" : (stryCov_9fa48("150374"), 'runtime')
}));
const SERVICE_LIFECYCLE_LOG = Object.freeze(stryMutAct_9fa48("150375") ? {} : (stryCov_9fa48("150375"), {
  OPERATION_START: stryMutAct_9fa48("150376") ? "" : (stryCov_9fa48("150376"), 'Service lifecycle operation started'),
  OPERATION_SUCCESS: stryMutAct_9fa48("150377") ? "" : (stryCov_9fa48("150377"), 'Service lifecycle operation completed'),
  OPERATION_FAILURE: stryMutAct_9fa48("150378") ? "" : (stryCov_9fa48("150378"), 'Service lifecycle operation failed'),
  RECOVERY_START: stryMutAct_9fa48("150379") ? "" : (stryCov_9fa48("150379"), 'Service lifecycle recovery operation started'),
  RECOVERY_SUCCESS: stryMutAct_9fa48("150380") ? "" : (stryCov_9fa48("150380"), 'Service lifecycle recovery operation completed'),
  RECOVERY_FAILURE: stryMutAct_9fa48("150381") ? "" : (stryCov_9fa48("150381"), 'Service lifecycle recovery operation failed')
}));
const SERVICE_LIFECYCLE_METRIC_STATUS = Object.freeze(stryMutAct_9fa48("150382") ? {} : (stryCov_9fa48("150382"), {
  SUCCESS: stryMutAct_9fa48("150383") ? "" : (stryCov_9fa48("150383"), 'success'),
  FAILURE: stryMutAct_9fa48("150384") ? "" : (stryCov_9fa48("150384"), 'failure')
}));
const DEFAULT_DIAGNOSTICS_LIMIT = 100;
const MAX_DIAGNOSTICS_LIMIT = 500;
const RECOVERABLE_OPERATION_STATES = Object.freeze(stryMutAct_9fa48("150385") ? [] : (stryCov_9fa48("150385"), [SERVICE_OPERATION_STATE.PENDING, SERVICE_OPERATION_STATE.IN_PROGRESS]));
async function allowRuntimeLifecyclePolicy(_policyContext) {
  if (stryMutAct_9fa48("150386")) {
    {}
  } else {
    stryCov_9fa48("150386");
    return undefined;
  }
} /**
  * Resolve normalized service descriptor fields from input context.
  *
  * @param {Object} serviceContext
  * @return {{
  *   serviceId: string,
  *   serviceType: string,
  *   tenantId: string,
  *   replicaId: string,
  * }}
  * @private
  */
function resolveServiceFields(serviceContext) {
  if (stryMutAct_9fa48("150387")) {
    {}
  } else {
    stryCov_9fa48("150387");
    const descriptor = stryMutAct_9fa48("150388") ? serviceContext?.definition && serviceContext : (stryCov_9fa48("150388"), (stryMutAct_9fa48("150389") ? serviceContext.definition : (stryCov_9fa48("150389"), serviceContext?.definition)) ?? serviceContext);
    const serviceId = stryMutAct_9fa48("150390") ? descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : (stryCov_9fa48("150390"), descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]);
    const serviceType = stryMutAct_9fa48("150391") ? descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] : (stryCov_9fa48("150391"), descriptor?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]);
    const tenantId = stryMutAct_9fa48("150394") ? descriptor?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] && serviceId : stryMutAct_9fa48("150393") ? false : stryMutAct_9fa48("150392") ? true : (stryCov_9fa48("150392", "150393", "150394"), (stryMutAct_9fa48("150395") ? descriptor[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] : (stryCov_9fa48("150395"), descriptor?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID])) || serviceId);
    const replicaId = stryMutAct_9fa48("150398") ? (serviceContext?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] || descriptor?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]) && serviceId : stryMutAct_9fa48("150397") ? false : stryMutAct_9fa48("150396") ? true : (stryCov_9fa48("150396", "150397", "150398"), (stryMutAct_9fa48("150400") ? serviceContext?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] && descriptor?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : stryMutAct_9fa48("150399") ? false : (stryCov_9fa48("150399", "150400"), (stryMutAct_9fa48("150401") ? serviceContext[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : (stryCov_9fa48("150401"), serviceContext?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID])) || (stryMutAct_9fa48("150402") ? descriptor[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : (stryCov_9fa48("150402"), descriptor?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID])))) || serviceId);
    if (stryMutAct_9fa48("150405") ? false : stryMutAct_9fa48("150404") ? true : stryMutAct_9fa48("150403") ? serviceId : (stryCov_9fa48("150403", "150404", "150405"), !serviceId)) {
      if (stryMutAct_9fa48("150406")) {
        {}
      } else {
        stryCov_9fa48("150406");
        throw new TypeError(LIFECYCLE_MGR_MSG.SERVICE_ID_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("150409") ? false : stryMutAct_9fa48("150408") ? true : stryMutAct_9fa48("150407") ? serviceType : (stryCov_9fa48("150407", "150408", "150409"), !serviceType)) {
      if (stryMutAct_9fa48("150410")) {
        {}
      } else {
        stryCov_9fa48("150410");
        throw new TypeError(LIFECYCLE_MGR_MSG.SERVICE_TYPE_REQUIRED);
      }
    }
    return stryMutAct_9fa48("150411") ? {} : (stryCov_9fa48("150411"), {
      serviceId,
      serviceType,
      tenantId,
      replicaId
    });
  }
} /**
  * Parse lifecycle operation command `<operation>:<serviceId>`.
  *
  * @param {string} command
  * @return {{lifecycleOperation: string, serviceId: string}|null}
  */
function parseOperationCommand(command) {
  if (stryMutAct_9fa48("150412")) {
    {}
  } else {
    stryCov_9fa48("150412");
    if (stryMutAct_9fa48("150415") ? typeof command === TYPEOF.STRING : stryMutAct_9fa48("150414") ? false : stryMutAct_9fa48("150413") ? true : (stryCov_9fa48("150413", "150414", "150415"), typeof command !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("150416")) {
        {}
      } else {
        stryCov_9fa48("150416");
        return null;
      }
    }
    const separatorIndex = command.indexOf(OPERATION_COMMAND_SEPARATOR);
    if (stryMutAct_9fa48("150420") ? separatorIndex > NUM.ZERO : stryMutAct_9fa48("150419") ? separatorIndex < NUM.ZERO : stryMutAct_9fa48("150418") ? false : stryMutAct_9fa48("150417") ? true : (stryCov_9fa48("150417", "150418", "150419", "150420"), separatorIndex <= NUM.ZERO)) {
      if (stryMutAct_9fa48("150421")) {
        {}
      } else {
        stryCov_9fa48("150421");
        return null;
      }
    }
    const lifecycleOperation = stryMutAct_9fa48("150422") ? command : (stryCov_9fa48("150422"), command.slice(0, separatorIndex));
    const serviceId = stryMutAct_9fa48("150423") ? command : (stryCov_9fa48("150423"), command.slice(stryMutAct_9fa48("150424") ? separatorIndex - OPERATION_COMMAND_SEPARATOR.length : (stryCov_9fa48("150424"), separatorIndex + OPERATION_COMMAND_SEPARATOR.length)));
    if (stryMutAct_9fa48("150427") ? false : stryMutAct_9fa48("150426") ? true : stryMutAct_9fa48("150425") ? serviceId : (stryCov_9fa48("150425", "150426", "150427"), !serviceId)) {
      if (stryMutAct_9fa48("150428")) {
        {}
      } else {
        stryCov_9fa48("150428");
        return null;
      }
    }
    return stryMutAct_9fa48("150429") ? {} : (stryCov_9fa48("150429"), {
      lifecycleOperation,
      serviceId
    });
  }
} /**
  * ServiceLifecycleManager is the single lifecycle owner for all service types.
  */
class ServiceLifecycleManager {
  constructor(options = {}) {
    if (stryMutAct_9fa48("150430")) {
      {}
    } else {
      stryCov_9fa48("150430");
      /** @type {Map<string, ServiceTypeAdapter>} */this._adapters = new Map(); /** @type {Function|null} */
      this._operationWriter = null; /** @type {Function|null} */
      this._idempotencyReader = null; /** @type {Function|null} */
      this._recoveryReader = null; /** @type {Function} */
      this._runtimePolicyCheck = allowRuntimeLifecyclePolicy; /** @type {Map<string, string>} */
      this._replicaStateById = new Map(); /** @type {Map<string, number>} */
      this._adapterSelectionCountByType = new Map(); /** @type {Object[]} */
      this._recentOperations = stryMutAct_9fa48("150431") ? ["Stryker was here"] : (stryCov_9fa48("150431"), []); /** @type {Object} */
      this._metrics = stryMutAct_9fa48("150432") ? {} : (stryCov_9fa48("150432"), {
        operationTotal: NUM.ZERO,
        operationSuccess: NUM.ZERO,
        operationFailure: NUM.ZERO,
        operationLatencyMsTotal: NUM.ZERO,
        operationLatencyMsMax: NUM.ZERO,
        lastOperationDurationMs: NUM.ZERO,
        lastError: null,
        byOperation: {}
      }); /** @type {Object} */
      this._logger = stryMutAct_9fa48("150435") ? options.logger && this._initLogger() : stryMutAct_9fa48("150434") ? false : stryMutAct_9fa48("150433") ? true : (stryCov_9fa48("150433", "150434", "150435"), options.logger || this._initLogger());
      if (stryMutAct_9fa48("150438") ? options.runtimePolicyCheck === undefined : stryMutAct_9fa48("150437") ? false : stryMutAct_9fa48("150436") ? true : (stryCov_9fa48("150436", "150437", "150438"), options.runtimePolicyCheck !== undefined)) {
        if (stryMutAct_9fa48("150439")) {
          {}
        } else {
          stryCov_9fa48("150439");
          this.setRuntimePolicyCheck(options.runtimePolicyCheck);
        }
      }
    }
  } /**
    * @return {Object}
    * @private
    */
  _initLogger() {
    if (stryMutAct_9fa48("150440")) {
      {}
    } else {
      stryCov_9fa48("150440");
      try {
        if (stryMutAct_9fa48("150441")) {
          {}
        } else {
          stryCov_9fa48("150441");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("150443") ? false : stryMutAct_9fa48("150442") ? true : (stryCov_9fa48("150442", "150443"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("150444")) {
              {}
            } else {
              stryCov_9fa48("150444");
              return loggingService.forSubsystem(SUBSYSTEM.SERVICE_LIFECYCLE);
            }
          }
        }
      } catch {// Logging service may not be initialized in unit tests.
      }
      return console;
    }
  } /**
    * Register a lifecycle adapter for one service type.
    *
    * @param {ServiceTypeAdapter} adapter
    * @return {void}
    */
  registerAdapter(adapter) {
    if (stryMutAct_9fa48("150445")) {
      {}
    } else {
      stryCov_9fa48("150445");
      if (stryMutAct_9fa48("150448") ? false : stryMutAct_9fa48("150447") ? true : stryMutAct_9fa48("150446") ? adapter instanceof ServiceTypeAdapter : (stryCov_9fa48("150446", "150447", "150448"), !(adapter instanceof ServiceTypeAdapter))) {
        if (stryMutAct_9fa48("150449")) {
          {}
        } else {
          stryCov_9fa48("150449");
          throw new TypeError(LIFECYCLE_MGR_MSG.ADAPTER_INSTANCE_REQUIRED);
        }
      }
      const serviceType = adapter.serviceType;
      if (stryMutAct_9fa48("150451") ? false : stryMutAct_9fa48("150450") ? true : (stryCov_9fa48("150450", "150451"), this._adapters.has(serviceType))) {
        if (stryMutAct_9fa48("150452")) {
          {}
        } else {
          stryCov_9fa48("150452");
          throw new Error(stryMutAct_9fa48("150453") ? `` : (stryCov_9fa48("150453"), `${LIFECYCLE_MGR_MSG.ADAPTER_ALREADY_REGISTERED}: ${serviceType}`));
        }
      }
      this._adapters.set(serviceType, adapter);
    }
  } /**
    * Set SQL/CDC writer used to persist operation-journal SQL.
    *
    * @param {Function} writer
    * @return {void}
    */
  setOperationWriter(writer) {
    if (stryMutAct_9fa48("150454")) {
      {}
    } else {
      stryCov_9fa48("150454");
      if (stryMutAct_9fa48("150457") ? typeof writer === TYPEOF.FUNCTION : stryMutAct_9fa48("150456") ? false : stryMutAct_9fa48("150455") ? true : (stryCov_9fa48("150455", "150456", "150457"), typeof writer !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("150458")) {
          {}
        } else {
          stryCov_9fa48("150458");
          throw new TypeError(LIFECYCLE_MGR_MSG.OPERATION_WRITER_REQUIRED);
        }
      }
      this._operationWriter = writer;
    }
  } /**
    * Set SQL/CDC reader used for idempotency lookups.
    *
    * @param {Function} reader
    * @return {void}
    */
  setIdempotencyReader(reader) {
    if (stryMutAct_9fa48("150459")) {
      {}
    } else {
      stryCov_9fa48("150459");
      if (stryMutAct_9fa48("150462") ? typeof reader === TYPEOF.FUNCTION : stryMutAct_9fa48("150461") ? false : stryMutAct_9fa48("150460") ? true : (stryCov_9fa48("150460", "150461", "150462"), typeof reader !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("150463")) {
          {}
        } else {
          stryCov_9fa48("150463");
          throw new TypeError(LIFECYCLE_MGR_MSG.IDEMPOTENCY_READER_REQUIRED);
        }
      }
      this._idempotencyReader = reader;
    }
  } /**
    * Set SQL/CDC reader used to recover pending/in-progress operations.
    *
    * @param {Function} reader
    * @return {void}
    */
  setRecoveryReader(reader) {
    if (stryMutAct_9fa48("150464")) {
      {}
    } else {
      stryCov_9fa48("150464");
      if (stryMutAct_9fa48("150467") ? typeof reader === TYPEOF.FUNCTION : stryMutAct_9fa48("150466") ? false : stryMutAct_9fa48("150465") ? true : (stryCov_9fa48("150465", "150466", "150467"), typeof reader !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("150468")) {
          {}
        } else {
          stryCov_9fa48("150468");
          throw new TypeError(LIFECYCLE_MGR_MSG.RECOVERY_READER_REQUIRED);
        }
      }
      this._recoveryReader = reader;
    }
  } /**
    * Set runtime policy check used by mutating lifecycle operations.
    *
    * @param {Function} check
    * @return {void}
    */
  setRuntimePolicyCheck(check) {
    if (stryMutAct_9fa48("150469")) {
      {}
    } else {
      stryCov_9fa48("150469");
      if (stryMutAct_9fa48("150472") ? typeof check === TYPEOF.FUNCTION : stryMutAct_9fa48("150471") ? false : stryMutAct_9fa48("150470") ? true : (stryCov_9fa48("150470", "150471", "150472"), typeof check !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("150473")) {
          {}
        } else {
          stryCov_9fa48("150473");
          throw new TypeError(LIFECYCLE_MGR_MSG.RUNTIME_POLICY_CHECK_REQUIRED);
        }
      }
      this._runtimePolicyCheck = check;
    }
  } /**
    * Resolve lifecycle adapter for a service type.
    *
    * @param {string} serviceType
    * @return {ServiceTypeAdapter}
    * @private
    */
  _resolveAdapter(serviceType) {
    if (stryMutAct_9fa48("150474")) {
      {}
    } else {
      stryCov_9fa48("150474");
      const adapter = this._adapters.get(serviceType);
      if (stryMutAct_9fa48("150477") ? false : stryMutAct_9fa48("150476") ? true : stryMutAct_9fa48("150475") ? adapter : (stryCov_9fa48("150475", "150476", "150477"), !adapter)) {
        if (stryMutAct_9fa48("150478")) {
          {}
        } else {
          stryCov_9fa48("150478");
          throw new UnknownServiceTypeError(serviceType, this.registeredServiceTypes);
        }
      }
      this._adapterSelectionCountByType.set(serviceType, stryMutAct_9fa48("150479") ? (this._adapterSelectionCountByType.get(serviceType) || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("150479"), (stryMutAct_9fa48("150482") ? this._adapterSelectionCountByType.get(serviceType) && NUM.ZERO : stryMutAct_9fa48("150481") ? false : stryMutAct_9fa48("150480") ? true : (stryCov_9fa48("150480", "150481", "150482"), this._adapterSelectionCountByType.get(serviceType) || NUM.ZERO)) + NUM.ONE));
      return adapter;
    }
  } /**
    * Get the tracked lifecycle state for a replica.
    *
    * @param {Object} serviceContext
    * @return {string}
    */
  getReplicaState(serviceContext) {
    if (stryMutAct_9fa48("150483")) {
      {}
    } else {
      stryCov_9fa48("150483");
      const {
        replicaId
      } = resolveServiceFields(serviceContext);
      return stryMutAct_9fa48("150486") ? this._replicaStateById.get(replicaId) && SERVICE_LIFECYCLE_STATE.CREATED : stryMutAct_9fa48("150485") ? false : stryMutAct_9fa48("150484") ? true : (stryCov_9fa48("150484", "150485", "150486"), this._replicaStateById.get(replicaId) || SERVICE_LIFECYCLE_STATE.CREATED);
    }
  } /**
    * List registered service types.
    *
    * @return {string[]}
    */
  get registeredServiceTypes() {
    if (stryMutAct_9fa48("150487")) {
      {}
    } else {
      stryCov_9fa48("150487");
      return stryMutAct_9fa48("150488") ? [] : (stryCov_9fa48("150488"), [...this._adapters.keys()]);
    }
  } /**
    * @return {Object}
    */
  getMetrics() {
    if (stryMutAct_9fa48("150489")) {
      {}
    } else {
      stryCov_9fa48("150489");
      return stryMutAct_9fa48("150490") ? {} : (stryCov_9fa48("150490"), {
        ...this._metrics,
        byOperation: stryMutAct_9fa48("150491") ? {} : (stryCov_9fa48("150491"), {
          ...this._metrics.byOperation
        })
      });
    }
  } /**
    * @param {number} [limit]
    * @return {Object[]}
    */
  getRecentOperations(limit = DEFAULT_DIAGNOSTICS_LIMIT) {
    if (stryMutAct_9fa48("150492")) {
      {}
    } else {
      stryCov_9fa48("150492");
      const boundedLimit = Number.isFinite(limit) ? stryMutAct_9fa48("150493") ? Math.min(1, Math.min(MAX_DIAGNOSTICS_LIMIT, Math.floor(limit))) : (stryCov_9fa48("150493"), Math.max(1, stryMutAct_9fa48("150494") ? Math.max(MAX_DIAGNOSTICS_LIMIT, Math.floor(limit)) : (stryCov_9fa48("150494"), Math.min(MAX_DIAGNOSTICS_LIMIT, Math.floor(limit))))) : DEFAULT_DIAGNOSTICS_LIMIT;
      return stryMutAct_9fa48("150495") ? this._recentOperations.map(entry => ({
        ...entry
      })) : (stryCov_9fa48("150495"), this._recentOperations.slice(stryMutAct_9fa48("150496") ? +boundedLimit : (stryCov_9fa48("150496"), -boundedLimit)).map(stryMutAct_9fa48("150497") ? () => undefined : (stryCov_9fa48("150497"), entry => stryMutAct_9fa48("150498") ? {} : (stryCov_9fa48("150498"), {
        ...entry
      }))));
    }
  } /**
    * @return {Object}
    */
  getAdapterSelectionReport() {
    if (stryMutAct_9fa48("150499")) {
      {}
    } else {
      stryCov_9fa48("150499");
      const adapters = stryMutAct_9fa48("150500") ? ["Stryker was here"] : (stryCov_9fa48("150500"), []);
      for (const [serviceType, adapter] of this._adapters.entries()) {
        if (stryMutAct_9fa48("150501")) {
          {}
        } else {
          stryCov_9fa48("150501");
          adapters.push(stryMutAct_9fa48("150502") ? {} : (stryCov_9fa48("150502"), {
            serviceType,
            adapterClass: stryMutAct_9fa48("150505") ? adapter.constructor?.name && SERVICE_LIFECYCLE_MANAGER_LITERAL.UNKNOWNADAPTER : stryMutAct_9fa48("150504") ? false : stryMutAct_9fa48("150503") ? true : (stryCov_9fa48("150503", "150504", "150505"), (stryMutAct_9fa48("150506") ? adapter.constructor.name : (stryCov_9fa48("150506"), adapter.constructor?.name)) || SERVICE_LIFECYCLE_MANAGER_LITERAL.UNKNOWNADAPTER),
            selectionCount: stryMutAct_9fa48("150509") ? this._adapterSelectionCountByType.get(serviceType) && NUM.ZERO : stryMutAct_9fa48("150508") ? false : stryMutAct_9fa48("150507") ? true : (stryCov_9fa48("150507", "150508", "150509"), this._adapterSelectionCountByType.get(serviceType) || NUM.ZERO)
          }));
        }
      }
      return stryMutAct_9fa48("150510") ? {} : (stryCov_9fa48("150510"), {
        adapters
      });
    }
  } /**
    * @param {Object} [options]
    * @param {number} [options.limit]
    * @return {Object}
    */
  getDiagnosticsReport(options = {}) {
    if (stryMutAct_9fa48("150511")) {
      {}
    } else {
      stryCov_9fa48("150511");
      return stryMutAct_9fa48("150512") ? {} : (stryCov_9fa48("150512"), {
        metrics: this.getMetrics(),
        adapterSelections: this.getAdapterSelectionReport(),
        recentOperations: this.getRecentOperations(options.limit)
      });
    }
  } /**
    * @param {string} lifecycleOperation
    * @param {Object} serviceContext
    * @param {Object} [context]
    * @param {Object} [extras]
    * @return {Object}
    * @private
    */
  _buildLifecycleLogContext(lifecycleOperation, serviceContext, context = {}, extras = {}) {
    if (stryMutAct_9fa48("150513")) {
      {}
    } else {
      stryCov_9fa48("150513");
      const descriptor = stryMutAct_9fa48("150516") ? (serviceContext?.definition || serviceContext) && {} : stryMutAct_9fa48("150515") ? false : stryMutAct_9fa48("150514") ? true : (stryCov_9fa48("150514", "150515", "150516"), (stryMutAct_9fa48("150518") ? serviceContext?.definition && serviceContext : stryMutAct_9fa48("150517") ? false : (stryCov_9fa48("150517", "150518"), (stryMutAct_9fa48("150519") ? serviceContext.definition : (stryCov_9fa48("150519"), serviceContext?.definition)) || serviceContext)) || {});
      const serviceId = stryMutAct_9fa48("150522") ? descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] && null : stryMutAct_9fa48("150521") ? false : stryMutAct_9fa48("150520") ? true : (stryCov_9fa48("150520", "150521", "150522"), descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] || null);
      const serviceType = stryMutAct_9fa48("150525") ? descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] && null : stryMutAct_9fa48("150524") ? false : stryMutAct_9fa48("150523") ? true : (stryCov_9fa48("150523", "150524", "150525"), descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] || null);
      const runtimeKind = stryMutAct_9fa48("150528") ? (descriptor[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] || descriptor.runtime_kind) && null : stryMutAct_9fa48("150527") ? false : stryMutAct_9fa48("150526") ? true : (stryCov_9fa48("150526", "150527", "150528"), (stryMutAct_9fa48("150530") ? descriptor[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] && descriptor.runtime_kind : stryMutAct_9fa48("150529") ? false : (stryCov_9fa48("150529", "150530"), descriptor[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] || descriptor.runtime_kind)) || null);
      const replicaId = stryMutAct_9fa48("150533") ? descriptor[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] && null : stryMutAct_9fa48("150532") ? false : stryMutAct_9fa48("150531") ? true : (stryCov_9fa48("150531", "150532", "150533"), descriptor[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] || null);
      return stryMutAct_9fa48("150534") ? {} : (stryCov_9fa48("150534"), {
        lifecycleOperation,
        serviceId,
        serviceType,
        runtimeKind,
        replicaId,
        operationId: stryMutAct_9fa48("150537") ? extras.operationId && null : stryMutAct_9fa48("150536") ? false : stryMutAct_9fa48("150535") ? true : (stryCov_9fa48("150535", "150536", "150537"), extras.operationId || null),
        traceId: stryMutAct_9fa48("150540") ? context?.traceId && null : stryMutAct_9fa48("150539") ? false : stryMutAct_9fa48("150538") ? true : (stryCov_9fa48("150538", "150539", "150540"), (stryMutAct_9fa48("150541") ? context.traceId : (stryCov_9fa48("150541"), context?.traceId)) || null),
        nodeId: stryMutAct_9fa48("150544") ? context?.nodeId && null : stryMutAct_9fa48("150543") ? false : stryMutAct_9fa48("150542") ? true : (stryCov_9fa48("150542", "150543", "150544"), (stryMutAct_9fa48("150545") ? context.nodeId : (stryCov_9fa48("150545"), context?.nodeId)) || null)
      });
    }
  } /**
    * @param {string} lifecycleOperation
    * @param {Object} serviceContext
    * @param {Object} context
    * @param {Object} options
    * @param {string|null} [options.operationId]
    * @param {string} options.status
    * @param {number} options.durationMs
    * @param {Error|null} [options.error]
    * @param {boolean} [options.recovery]
    * @return {void}
    * @private
    */
  _recordLifecycleOutcome(lifecycleOperation, serviceContext, context, options) {
    if (stryMutAct_9fa48("150546")) {
      {}
    } else {
      stryCov_9fa48("150546");
      const operationId = stryMutAct_9fa48("150549") ? options.operationId && null : stryMutAct_9fa48("150548") ? false : stryMutAct_9fa48("150547") ? true : (stryCov_9fa48("150547", "150548", "150549"), options.operationId || null);
      const status = options.status;
      const durationMs = options.durationMs;
      const error = stryMutAct_9fa48("150552") ? options.error && null : stryMutAct_9fa48("150551") ? false : stryMutAct_9fa48("150550") ? true : (stryCov_9fa48("150550", "150551", "150552"), options.error || null);
      const recovery = stryMutAct_9fa48("150555") ? options.recovery !== true : stryMutAct_9fa48("150554") ? false : stryMutAct_9fa48("150553") ? true : (stryCov_9fa48("150553", "150554", "150555"), options.recovery === (stryMutAct_9fa48("150556") ? false : (stryCov_9fa48("150556"), true)));
      const logContext = this._buildLifecycleLogContext(lifecycleOperation, serviceContext, context, stryMutAct_9fa48("150557") ? {} : (stryCov_9fa48("150557"), {
        operationId
      }));
      stryMutAct_9fa48("150558") ? this._metrics.operationTotal -= NUM.ONE : (stryCov_9fa48("150558"), this._metrics.operationTotal += NUM.ONE);
      this._metrics.lastOperationDurationMs = durationMs;
      stryMutAct_9fa48("150559") ? this._metrics.operationLatencyMsTotal -= durationMs : (stryCov_9fa48("150559"), this._metrics.operationLatencyMsTotal += durationMs);
      this._metrics.operationLatencyMsMax = stryMutAct_9fa48("150560") ? Math.min(this._metrics.operationLatencyMsMax, durationMs) : (stryCov_9fa48("150560"), Math.max(this._metrics.operationLatencyMsMax, durationMs));
      const opMetrics = stryMutAct_9fa48("150563") ? this._metrics.byOperation[lifecycleOperation] && {
        total: 0,
        success: 0,
        failure: 0,
        latencyMsTotal: 0,
        latencyMsMax: 0,
        lastDurationMs: 0
      } : stryMutAct_9fa48("150562") ? false : stryMutAct_9fa48("150561") ? true : (stryCov_9fa48("150561", "150562", "150563"), this._metrics.byOperation[lifecycleOperation] || (stryMutAct_9fa48("150564") ? {} : (stryCov_9fa48("150564"), {
        total: 0,
        success: 0,
        failure: 0,
        latencyMsTotal: 0,
        latencyMsMax: 0,
        lastDurationMs: 0
      })));
      stryMutAct_9fa48("150565") ? opMetrics.total -= NUM.ONE : (stryCov_9fa48("150565"), opMetrics.total += NUM.ONE);
      opMetrics.lastDurationMs = durationMs;
      stryMutAct_9fa48("150566") ? opMetrics.latencyMsTotal -= durationMs : (stryCov_9fa48("150566"), opMetrics.latencyMsTotal += durationMs);
      opMetrics.latencyMsMax = stryMutAct_9fa48("150567") ? Math.min(opMetrics.latencyMsMax, durationMs) : (stryCov_9fa48("150567"), Math.max(opMetrics.latencyMsMax, durationMs));
      if (stryMutAct_9fa48("150570") ? status !== SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS : stryMutAct_9fa48("150569") ? false : stryMutAct_9fa48("150568") ? true : (stryCov_9fa48("150568", "150569", "150570"), status === SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS)) {
        if (stryMutAct_9fa48("150571")) {
          {}
        } else {
          stryCov_9fa48("150571");
          stryMutAct_9fa48("150572") ? this._metrics.operationSuccess -= NUM.ONE : (stryCov_9fa48("150572"), this._metrics.operationSuccess += NUM.ONE);
          stryMutAct_9fa48("150573") ? opMetrics.success -= NUM.ONE : (stryCov_9fa48("150573"), opMetrics.success += NUM.ONE);
          this._metrics.lastError = null;
          this._logger.info(recovery ? SERVICE_LIFECYCLE_LOG.RECOVERY_SUCCESS : SERVICE_LIFECYCLE_LOG.OPERATION_SUCCESS, stryMutAct_9fa48("150574") ? {} : (stryCov_9fa48("150574"), {
            ...logContext,
            durationMs
          }));
        }
      } else {
        if (stryMutAct_9fa48("150575")) {
          {}
        } else {
          stryCov_9fa48("150575");
          stryMutAct_9fa48("150576") ? this._metrics.operationFailure -= NUM.ONE : (stryCov_9fa48("150576"), this._metrics.operationFailure += NUM.ONE);
          stryMutAct_9fa48("150577") ? opMetrics.failure -= NUM.ONE : (stryCov_9fa48("150577"), opMetrics.failure += NUM.ONE);
          this._metrics.lastError = error ? error.message : null;
          this._logger.error(recovery ? SERVICE_LIFECYCLE_LOG.RECOVERY_FAILURE : SERVICE_LIFECYCLE_LOG.OPERATION_FAILURE, stryMutAct_9fa48("150578") ? {} : (stryCov_9fa48("150578"), {
            ...logContext,
            durationMs,
            error: error ? error.message : null
          }));
        }
      }
      this._metrics.byOperation[lifecycleOperation] = opMetrics;
      this._recentOperations.push(stryMutAct_9fa48("150579") ? {} : (stryCov_9fa48("150579"), {
        timestamp: Date.now(),
        lifecycleOperation,
        serviceId: logContext.serviceId,
        serviceType: logContext.serviceType,
        runtimeKind: logContext.runtimeKind,
        replicaId: logContext.replicaId,
        operationId,
        durationMs,
        status,
        recovery,
        error: error ? error.message : null
      }));
      if (stryMutAct_9fa48("150583") ? this._recentOperations.length <= MAX_DIAGNOSTICS_LIMIT : stryMutAct_9fa48("150582") ? this._recentOperations.length >= MAX_DIAGNOSTICS_LIMIT : stryMutAct_9fa48("150581") ? false : stryMutAct_9fa48("150580") ? true : (stryCov_9fa48("150580", "150581", "150582", "150583"), this._recentOperations.length > MAX_DIAGNOSTICS_LIMIT)) {
        if (stryMutAct_9fa48("150584")) {
          {}
        } else {
          stryCov_9fa48("150584");
          this._recentOperations.shift();
        }
      }
    }
  } /**
    * Enforce a configured lifecycle transition.
    *
    * @param {string} serviceId
    * @param {string} lifecycleOperation
    * @param {string} fromState
    * @param {string} toState
    * @return {void}
    * @private
    */
  _assertTransition(serviceId, lifecycleOperation, fromState, toState) {
    if (stryMutAct_9fa48("150585")) {
      {}
    } else {
      stryCov_9fa48("150585");
      const allowed = stryMutAct_9fa48("150588") ? SERVICE_LIFECYCLE_TRANSITIONS[fromState] && [] : stryMutAct_9fa48("150587") ? false : stryMutAct_9fa48("150586") ? true : (stryCov_9fa48("150586", "150587", "150588"), SERVICE_LIFECYCLE_TRANSITIONS[fromState] || (stryMutAct_9fa48("150589") ? ["Stryker was here"] : (stryCov_9fa48("150589"), [])));
      if (stryMutAct_9fa48("150592") ? false : stryMutAct_9fa48("150591") ? true : stryMutAct_9fa48("150590") ? allowed.includes(toState) : (stryCov_9fa48("150590", "150591", "150592"), !allowed.includes(toState))) {
        if (stryMutAct_9fa48("150593")) {
          {}
        } else {
          stryCov_9fa48("150593");
          throw new ServiceLifecycleTransitionError(serviceId, lifecycleOperation, fromState, toState);
        }
      }
    }
  } /**
    * Enforce runtime policy checks (fail-closed).
    *
    * @param {string} lifecycleOperation
    * @param {Object} serviceContext
    * @param {Object} context
    * @return {Promise<void>}
    * @private
    */
  async _enforceRuntimePolicy(lifecycleOperation, serviceContext, context) {
    if (stryMutAct_9fa48("150594")) {
      {}
    } else {
      stryCov_9fa48("150594");
      if (stryMutAct_9fa48("150597") ? typeof this._runtimePolicyCheck === TYPEOF.FUNCTION : stryMutAct_9fa48("150596") ? false : stryMutAct_9fa48("150595") ? true : (stryCov_9fa48("150595", "150596", "150597"), typeof this._runtimePolicyCheck !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("150598")) {
          {}
        } else {
          stryCov_9fa48("150598");
          throw new TypeError(LIFECYCLE_MGR_MSG.RUNTIME_POLICY_CHECK_REQUIRED);
        }
      }
      const {
        serviceId,
        serviceType,
        tenantId,
        replicaId
      } = resolveServiceFields(serviceContext);
      try {
        if (stryMutAct_9fa48("150599")) {
          {}
        } else {
          stryCov_9fa48("150599");
          await this._runtimePolicyCheck(stryMutAct_9fa48("150600") ? {} : (stryCov_9fa48("150600"), {
            lifecycleOperation,
            serviceId,
            serviceType,
            tenantId,
            replicaId,
            definition: stryMutAct_9fa48("150603") ? serviceContext?.definition && serviceContext : stryMutAct_9fa48("150602") ? false : stryMutAct_9fa48("150601") ? true : (stryCov_9fa48("150601", "150602", "150603"), (stryMutAct_9fa48("150604") ? serviceContext.definition : (stryCov_9fa48("150604"), serviceContext?.definition)) || serviceContext),
            context
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("150605")) {
          {}
        } else {
          stryCov_9fa48("150605");
          throw new ServicePolicyViolationError(SERVICE_POLICY_TYPE.RUNTIME, lifecycleOperation, serviceId, error.message, stryMutAct_9fa48("150606") ? {} : (stryCov_9fa48("150606"), {
            cause: error
          }));
        }
      }
    }
  } /**
    * Check whether an idempotency key already has an operation.
    *
    * @param {string} tenantId
    * @param {string} serviceId
    * @param {string} lifecycleOperation
    * @param {string|null} idempotencyKey
    * @return {Promise<Object|null>}
    * @private
    */
  async _checkIdempotency(tenantId, serviceId, lifecycleOperation, idempotencyKey) {
    if (stryMutAct_9fa48("150607")) {
      {}
    } else {
      stryCov_9fa48("150607");
      if (stryMutAct_9fa48("150610") ? !idempotencyKey && !this._idempotencyReader : stryMutAct_9fa48("150609") ? false : stryMutAct_9fa48("150608") ? true : (stryCov_9fa48("150608", "150609", "150610"), (stryMutAct_9fa48("150611") ? idempotencyKey : (stryCov_9fa48("150611"), !idempotencyKey)) || (stryMutAct_9fa48("150612") ? this._idempotencyReader : (stryCov_9fa48("150612"), !this._idempotencyReader)))) {
        if (stryMutAct_9fa48("150613")) {
          {}
        } else {
          stryCov_9fa48("150613");
          return null;
        }
      }
      const check = buildIdempotencyCheckSQL(tenantId, idempotencyKey);
      if (stryMutAct_9fa48("150616") ? false : stryMutAct_9fa48("150615") ? true : stryMutAct_9fa48("150614") ? check.success : (stryCov_9fa48("150614", "150615", "150616"), !check.success)) {
        if (stryMutAct_9fa48("150617")) {
          {}
        } else {
          stryCov_9fa48("150617");
          throw new ServiceIdempotencyCheckError(serviceId, lifecycleOperation, check.errors.join(SERVICE_LIFECYCLE_MANAGER_LITERAL.VALUE));
        }
      }
      try {
        if (stryMutAct_9fa48("150618")) {
          {}
        } else {
          stryCov_9fa48("150618");
          const rows = await this._idempotencyReader(check.sql, check.params);
          if (stryMutAct_9fa48("150621") ? !rows && rows.length === NUM.ZERO : stryMutAct_9fa48("150620") ? false : stryMutAct_9fa48("150619") ? true : (stryCov_9fa48("150619", "150620", "150621"), (stryMutAct_9fa48("150622") ? rows : (stryCov_9fa48("150622"), !rows)) || (stryMutAct_9fa48("150624") ? rows.length !== NUM.ZERO : stryMutAct_9fa48("150623") ? false : (stryCov_9fa48("150623", "150624"), rows.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("150625")) {
              {}
            } else {
              stryCov_9fa48("150625");
              return null;
            }
          }
          return rows[NUM.ZERO];
        }
      } catch (error) {
        if (stryMutAct_9fa48("150626")) {
          {}
        } else {
          stryCov_9fa48("150626");
          throw new ServiceIdempotencyCheckError(serviceId, lifecycleOperation, stryMutAct_9fa48("150627") ? `` : (stryCov_9fa48("150627"), `query failed: ${error.message}`), stryMutAct_9fa48("150628") ? {} : (stryCov_9fa48("150628"), {
            cause: error
          }));
        }
      }
    }
  } /**
    * Create a PENDING operation record.
    *
    * @param {string} tenantId
    * @param {string} serviceId
    * @param {string} lifecycleOperation
    * @param {string|null} idempotencyKey
    * @return {Promise<Object|null>}
    * @private
    */
  async _journalCreate(tenantId, serviceId, lifecycleOperation, idempotencyKey) {
    if (stryMutAct_9fa48("150629")) {
      {}
    } else {
      stryCov_9fa48("150629");
      if (stryMutAct_9fa48("150632") ? false : stryMutAct_9fa48("150631") ? true : stryMutAct_9fa48("150630") ? this._operationWriter : (stryCov_9fa48("150630", "150631", "150632"), !this._operationWriter)) {
        if (stryMutAct_9fa48("150633")) {
          {}
        } else {
          stryCov_9fa48("150633");
          return null;
        }
      }
      const existing = await this._checkIdempotency(tenantId, serviceId, lifecycleOperation, idempotencyKey);
      if (stryMutAct_9fa48("150635") ? false : stryMutAct_9fa48("150634") ? true : (stryCov_9fa48("150634", "150635"), existing)) {
        if (stryMutAct_9fa48("150636")) {
          {}
        } else {
          stryCov_9fa48("150636");
          return stryMutAct_9fa48("150637") ? {} : (stryCov_9fa48("150637"), {
            operationId: stryMutAct_9fa48("150640") ? existing.operation_id && existing.operationId : stryMutAct_9fa48("150639") ? false : stryMutAct_9fa48("150638") ? true : (stryCov_9fa48("150638", "150639", "150640"), existing.operation_id || existing.operationId),
            idempotent: stryMutAct_9fa48("150641") ? false : (stryCov_9fa48("150641"), true),
            existing
          });
        }
      }
      const createResult = createOperation(tenantId, stryMutAct_9fa48("150642") ? `` : (stryCov_9fa48("150642"), `${lifecycleOperation}:${serviceId}`), idempotencyKey);
      if (stryMutAct_9fa48("150645") ? false : stryMutAct_9fa48("150644") ? true : stryMutAct_9fa48("150643") ? createResult.success : (stryCov_9fa48("150643", "150644", "150645"), !createResult.success)) {
        if (stryMutAct_9fa48("150646")) {
          {}
        } else {
          stryCov_9fa48("150646");
          throw new ServiceOperationJournalError(serviceId, lifecycleOperation, createResult.errors.join(SERVICE_LIFECYCLE_MANAGER_LITERAL.VALUE));
        }
      }
      try {
        if (stryMutAct_9fa48("150647")) {
          {}
        } else {
          stryCov_9fa48("150647");
          await this._operationWriter(createResult.sql, createResult.params);
        }
      } catch (error) {
        if (stryMutAct_9fa48("150648")) {
          {}
        } else {
          stryCov_9fa48("150648");
          throw new ServiceOperationJournalError(serviceId, lifecycleOperation, stryMutAct_9fa48("150649") ? `` : (stryCov_9fa48("150649"), `create failed: ${error.message}`), stryMutAct_9fa48("150650") ? {} : (stryCov_9fa48("150650"), {
            cause: error
          }));
        }
      }
      return createResult.operation;
    }
  } /**
    * Persist an operation transition.
    *
    * @param {Object|null} operation
    * @param {string} serviceId
    * @param {string} lifecycleOperation
    * @param {string} fromState
    * @param {string} toState
    * @param {*} [resultOrError]
    * @return {Promise<void>}
    * @private
    */
  async _journalTransition(operation, serviceId, lifecycleOperation, fromState, toState, resultOrError) {
    if (stryMutAct_9fa48("150651")) {
      {}
    } else {
      stryCov_9fa48("150651");
      if (stryMutAct_9fa48("150654") ? (!operation || !this._operationWriter) && operation.idempotent : stryMutAct_9fa48("150653") ? false : stryMutAct_9fa48("150652") ? true : (stryCov_9fa48("150652", "150653", "150654"), (stryMutAct_9fa48("150656") ? !operation && !this._operationWriter : stryMutAct_9fa48("150655") ? false : (stryCov_9fa48("150655", "150656"), (stryMutAct_9fa48("150657") ? operation : (stryCov_9fa48("150657"), !operation)) || (stryMutAct_9fa48("150658") ? this._operationWriter : (stryCov_9fa48("150658"), !this._operationWriter)))) || operation.idempotent)) {
        if (stryMutAct_9fa48("150659")) {
          {}
        } else {
          stryCov_9fa48("150659");
          return;
        }
      }
      const transitionResult = transitionOperation(operation.operationId, fromState, toState, resultOrError);
      if (stryMutAct_9fa48("150662") ? false : stryMutAct_9fa48("150661") ? true : stryMutAct_9fa48("150660") ? transitionResult.success : (stryCov_9fa48("150660", "150661", "150662"), !transitionResult.success)) {
        if (stryMutAct_9fa48("150663")) {
          {}
        } else {
          stryCov_9fa48("150663");
          throw new ServiceOperationJournalError(serviceId, lifecycleOperation, transitionResult.errors.join(SERVICE_LIFECYCLE_MANAGER_LITERAL.VALUE));
        }
      }
      try {
        if (stryMutAct_9fa48("150664")) {
          {}
        } else {
          stryCov_9fa48("150664");
          await this._operationWriter(transitionResult.sql, transitionResult.params);
        }
      } catch (error) {
        if (stryMutAct_9fa48("150665")) {
          {}
        } else {
          stryCov_9fa48("150665");
          throw new ServiceOperationJournalError(serviceId, lifecycleOperation, stryMutAct_9fa48("150666") ? `` : (stryCov_9fa48("150666"), `transition ${fromState}->${toState} failed: ${error.message}`), stryMutAct_9fa48("150667") ? {} : (stryCov_9fa48("150667"), {
            cause: error
          }));
        }
      }
    }
  } /**
    * Read recoverable operation rows from journal storage.
    *
    * @return {Promise<Object[]>}
    * @private
    */
  async _readRecoverableOperations() {
    if (stryMutAct_9fa48("150668")) {
      {}
    } else {
      stryCov_9fa48("150668");
      if (stryMutAct_9fa48("150671") ? false : stryMutAct_9fa48("150670") ? true : stryMutAct_9fa48("150669") ? this._recoveryReader : (stryCov_9fa48("150669", "150670", "150671"), !this._recoveryReader)) {
        if (stryMutAct_9fa48("150672")) {
          {}
        } else {
          stryCov_9fa48("150672");
          throw new TypeError(LIFECYCLE_MGR_MSG.RECOVERY_READER_REQUIRED);
        }
      }
      const pendingQuery = buildListOperationsSQL(undefined, SERVICE_OPERATION_STATE.PENDING);
      const inProgressQuery = buildListOperationsSQL(undefined, SERVICE_OPERATION_STATE.IN_PROGRESS);
      const [pendingRows, inProgressRows] = await Promise.all(stryMutAct_9fa48("150673") ? [] : (stryCov_9fa48("150673"), [this._recoveryReader(pendingQuery.sql, pendingQuery.params), this._recoveryReader(inProgressQuery.sql, inProgressQuery.params)]));
      const rows = stryMutAct_9fa48("150674") ? [] : (stryCov_9fa48("150674"), [...(stryMutAct_9fa48("150677") ? pendingRows && [] : stryMutAct_9fa48("150676") ? false : stryMutAct_9fa48("150675") ? true : (stryCov_9fa48("150675", "150676", "150677"), pendingRows || (stryMutAct_9fa48("150678") ? ["Stryker was here"] : (stryCov_9fa48("150678"), [])))), ...(stryMutAct_9fa48("150681") ? inProgressRows && [] : stryMutAct_9fa48("150680") ? false : stryMutAct_9fa48("150679") ? true : (stryCov_9fa48("150679", "150680", "150681"), inProgressRows || (stryMutAct_9fa48("150682") ? ["Stryker was here"] : (stryCov_9fa48("150682"), []))))]);
      stryMutAct_9fa48("150683") ? rows : (stryCov_9fa48("150683"), rows.sort((left, right) => {
        if (stryMutAct_9fa48("150684")) {
          {}
        } else {
          stryCov_9fa48("150684");
          const leftCreatedAt = Number(stryMutAct_9fa48("150685") ? (left.created_at ?? left.createdAt) && 0 : (stryCov_9fa48("150685"), (stryMutAct_9fa48("150686") ? left.created_at && left.createdAt : (stryCov_9fa48("150686"), left.created_at ?? left.createdAt)) ?? 0));
          const rightCreatedAt = Number(stryMutAct_9fa48("150687") ? (right.created_at ?? right.createdAt) && 0 : (stryCov_9fa48("150687"), (stryMutAct_9fa48("150688") ? right.created_at && right.createdAt : (stryCov_9fa48("150688"), right.created_at ?? right.createdAt)) ?? 0));
          if (stryMutAct_9fa48("150691") ? leftCreatedAt === rightCreatedAt : stryMutAct_9fa48("150690") ? false : stryMutAct_9fa48("150689") ? true : (stryCov_9fa48("150689", "150690", "150691"), leftCreatedAt !== rightCreatedAt)) {
            if (stryMutAct_9fa48("150692")) {
              {}
            } else {
              stryCov_9fa48("150692");
              return stryMutAct_9fa48("150693") ? leftCreatedAt + rightCreatedAt : (stryCov_9fa48("150693"), leftCreatedAt - rightCreatedAt);
            }
          }
          const leftOperationId = stryMutAct_9fa48("150696") ? (left.operation_id || left.operationId) && '' : stryMutAct_9fa48("150695") ? false : stryMutAct_9fa48("150694") ? true : (stryCov_9fa48("150694", "150695", "150696"), (stryMutAct_9fa48("150698") ? left.operation_id && left.operationId : stryMutAct_9fa48("150697") ? false : (stryCov_9fa48("150697", "150698"), left.operation_id || left.operationId)) || (stryMutAct_9fa48("150699") ? "Stryker was here!" : (stryCov_9fa48("150699"), '')));
          const rightOperationId = stryMutAct_9fa48("150702") ? (right.operation_id || right.operationId) && '' : stryMutAct_9fa48("150701") ? false : stryMutAct_9fa48("150700") ? true : (stryCov_9fa48("150700", "150701", "150702"), (stryMutAct_9fa48("150704") ? right.operation_id && right.operationId : stryMutAct_9fa48("150703") ? false : (stryCov_9fa48("150703", "150704"), right.operation_id || right.operationId)) || (stryMutAct_9fa48("150705") ? "Stryker was here!" : (stryCov_9fa48("150705"), '')));
          return leftOperationId.localeCompare(rightOperationId);
        }
      }));
      return rows;
    }
  }
  _buildRecoveryResult(status, fields = {}) {
    if (stryMutAct_9fa48("150706")) {
      {}
    } else {
      stryCov_9fa48("150706");
      return stryMutAct_9fa48("150707") ? {} : (stryCov_9fa48("150707"), {
        status,
        ...fields
      });
    }
  }
  async _promoteRecoveryJournalState({
    operation,
    serviceId,
    lifecycleOperation,
    journalState
  }) {
    if (stryMutAct_9fa48("150708")) {
      {}
    } else {
      stryCov_9fa48("150708");
      if (stryMutAct_9fa48("150711") ? journalState === SERVICE_OPERATION_STATE.PENDING : stryMutAct_9fa48("150710") ? false : stryMutAct_9fa48("150709") ? true : (stryCov_9fa48("150709", "150710", "150711"), journalState !== SERVICE_OPERATION_STATE.PENDING)) {
        if (stryMutAct_9fa48("150712")) {
          {}
        } else {
          stryCov_9fa48("150712");
          return journalState;
        }
      }
      await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.PENDING, SERVICE_OPERATION_STATE.IN_PROGRESS);
      return SERVICE_OPERATION_STATE.IN_PROGRESS;
    }
  }
  async _failRecoveryJournalState({
    operation,
    serviceId,
    lifecycleOperation,
    journalState,
    errorMessage
  }) {
    if (stryMutAct_9fa48("150713")) {
      {}
    } else {
      stryCov_9fa48("150713");
      const promotedState = await this._promoteRecoveryJournalState(stryMutAct_9fa48("150714") ? {} : (stryCov_9fa48("150714"), {
        operation,
        serviceId,
        lifecycleOperation,
        journalState
      })).catch(stryMutAct_9fa48("150715") ? () => undefined : (stryCov_9fa48("150715"), () => journalState));
      if (stryMutAct_9fa48("150718") ? promotedState !== SERVICE_OPERATION_STATE.IN_PROGRESS : stryMutAct_9fa48("150717") ? false : stryMutAct_9fa48("150716") ? true : (stryCov_9fa48("150716", "150717", "150718"), promotedState === SERVICE_OPERATION_STATE.IN_PROGRESS)) {
        if (stryMutAct_9fa48("150719")) {
          {}
        } else {
          stryCov_9fa48("150719");
          await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.IN_PROGRESS, SERVICE_OPERATION_STATE.FAILED, stryMutAct_9fa48("150720") ? {} : (stryCov_9fa48("150720"), {
            message: errorMessage
          })).catch(() => {});
        }
      }
      return promotedState;
    }
  } /**
    * Recover one pending or in-progress operation row.
    *
    * @param {Object} operationRow
    * @param {Function} resolveServiceContext
    * @param {Object} defaultContext
    * @return {Promise<Object>}
    * @private
    */
  async _recoverOperationRow(operationRow, resolveServiceContext, defaultContext) {
    if (stryMutAct_9fa48("150721")) {
      {}
    } else {
      stryCov_9fa48("150721");
      const operationId = stryMutAct_9fa48("150724") ? operationRow.operation_id && operationRow.operationId : stryMutAct_9fa48("150723") ? false : stryMutAct_9fa48("150722") ? true : (stryCov_9fa48("150722", "150723", "150724"), operationRow.operation_id || operationRow.operationId);
      const operationState = operationRow.state;
      const operation = stryMutAct_9fa48("150725") ? {} : (stryCov_9fa48("150725"), {
        operationId
      });
      const parsed = parseOperationCommand(operationRow.command);
      const recoveryStartedAt = Date.now();
      if (stryMutAct_9fa48("150728") ? false : stryMutAct_9fa48("150727") ? true : stryMutAct_9fa48("150726") ? operationId : (stryCov_9fa48("150726", "150727", "150728"), !operationId)) {
        if (stryMutAct_9fa48("150729")) {
          {}
        } else {
          stryCov_9fa48("150729");
          throw new TypeError(LIFECYCLE_MGR_MSG.OPERATION_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("150732") ? false : stryMutAct_9fa48("150731") ? true : stryMutAct_9fa48("150730") ? RECOVERABLE_OPERATION_STATES.includes(operationState) : (stryCov_9fa48("150730", "150731", "150732"), !RECOVERABLE_OPERATION_STATES.includes(operationState))) {
        if (stryMutAct_9fa48("150733")) {
          {}
        } else {
          stryCov_9fa48("150733");
          return this._buildRecoveryResult(RECOVERY_RESULT_STATUS.SKIPPED, stryMutAct_9fa48("150734") ? {} : (stryCov_9fa48("150734"), {
            operationId,
            reason: RECOVERY_SKIP_REASON.UNKNOWN_OPERATION
          }));
        }
      }
      if (stryMutAct_9fa48("150737") ? false : stryMutAct_9fa48("150736") ? true : stryMutAct_9fa48("150735") ? parsed : (stryCov_9fa48("150735", "150736", "150737"), !parsed)) {
        if (stryMutAct_9fa48("150738")) {
          {}
        } else {
          stryCov_9fa48("150738");
          return this._buildRecoveryResult(RECOVERY_RESULT_STATUS.SKIPPED, stryMutAct_9fa48("150739") ? {} : (stryCov_9fa48("150739"), {
            operationId,
            reason: RECOVERY_SKIP_REASON.INVALID_COMMAND,
            error: LIFECYCLE_MGR_MSG.OPERATION_COMMAND_INVALID
          }));
        }
      }
      const lifecycleOperation = parsed.lifecycleOperation;
      const serviceId = parsed.serviceId;
      let journalState = operationState;
      let resolvedServiceContext = null;
      let replicaId = null;
      try {
        if (stryMutAct_9fa48("150740")) {
          {}
        } else {
          stryCov_9fa48("150740");
          resolvedServiceContext = await resolveServiceContext(stryMutAct_9fa48("150741") ? {} : (stryCov_9fa48("150741"), {
            operationId,
            operationState,
            lifecycleOperation,
            serviceId,
            operationRow
          }));
          if (stryMutAct_9fa48("150744") ? false : stryMutAct_9fa48("150743") ? true : stryMutAct_9fa48("150742") ? resolvedServiceContext : (stryCov_9fa48("150742", "150743", "150744"), !resolvedServiceContext)) {
            if (stryMutAct_9fa48("150745")) {
              {}
            } else {
              stryCov_9fa48("150745");
              return this._buildRecoveryResult(RECOVERY_RESULT_STATUS.SKIPPED, stryMutAct_9fa48("150746") ? {} : (stryCov_9fa48("150746"), {
                operationId,
                serviceId,
                lifecycleOperation,
                reason: RECOVERY_SKIP_REASON.UNRESOLVED_SERVICE
              }));
            }
          }
          const serviceContext = stryMutAct_9fa48("150749") ? (resolvedServiceContext.definition || resolvedServiceContext.replicaHandle) && resolvedServiceContext : stryMutAct_9fa48("150748") ? false : stryMutAct_9fa48("150747") ? true : (stryCov_9fa48("150747", "150748", "150749"), (stryMutAct_9fa48("150751") ? resolvedServiceContext.definition && resolvedServiceContext.replicaHandle : stryMutAct_9fa48("150750") ? false : (stryCov_9fa48("150750", "150751"), resolvedServiceContext.definition || resolvedServiceContext.replicaHandle)) || resolvedServiceContext);
          const {
            serviceType,
            replicaId: resolvedReplicaId
          } = resolveServiceFields(serviceContext);
          replicaId = resolvedReplicaId;
          const adapter = this._resolveAdapter(serviceType);
          const runtimeContext = stryMutAct_9fa48("150754") ? resolvedServiceContext.context && defaultContext : stryMutAct_9fa48("150753") ? false : stryMutAct_9fa48("150752") ? true : (stryCov_9fa48("150752", "150753", "150754"), resolvedServiceContext.context || defaultContext);
          let result = null;
          this._logger.debug(SERVICE_LIFECYCLE_LOG.RECOVERY_START, stryMutAct_9fa48("150755") ? {} : (stryCov_9fa48("150755"), {
            ...this._buildLifecycleLogContext(lifecycleOperation, stryMutAct_9fa48("150758") ? (resolvedServiceContext.definition || resolvedServiceContext.replicaHandle) && serviceContext : stryMutAct_9fa48("150757") ? false : stryMutAct_9fa48("150756") ? true : (stryCov_9fa48("150756", "150757", "150758"), (stryMutAct_9fa48("150760") ? resolvedServiceContext.definition && resolvedServiceContext.replicaHandle : stryMutAct_9fa48("150759") ? false : (stryCov_9fa48("150759", "150760"), resolvedServiceContext.definition || resolvedServiceContext.replicaHandle)) || serviceContext), runtimeContext, stryMutAct_9fa48("150761") ? {} : (stryCov_9fa48("150761"), {
              operationId
            })),
            operationState
          }));
          journalState = await this._promoteRecoveryJournalState(stryMutAct_9fa48("150762") ? {} : (stryCov_9fa48("150762"), {
            operation,
            serviceId,
            lifecycleOperation,
            journalState
          }));
          if (stryMutAct_9fa48("150765") ? lifecycleOperation !== SERVICE_LIFECYCLE_OPERATION.CREATE : stryMutAct_9fa48("150764") ? false : stryMutAct_9fa48("150763") ? true : (stryCov_9fa48("150763", "150764", "150765"), lifecycleOperation === SERVICE_LIFECYCLE_OPERATION.CREATE)) {
            if (stryMutAct_9fa48("150766")) {
              {}
            } else {
              stryCov_9fa48("150766");
              await this._enforceRuntimePolicy(lifecycleOperation, stryMutAct_9fa48("150769") ? resolvedServiceContext.definition && serviceContext : stryMutAct_9fa48("150768") ? false : stryMutAct_9fa48("150767") ? true : (stryCov_9fa48("150767", "150768", "150769"), resolvedServiceContext.definition || serviceContext), runtimeContext);
              result = await adapter.createReplica(stryMutAct_9fa48("150770") ? {} : (stryCov_9fa48("150770"), {
                definition: stryMutAct_9fa48("150773") ? resolvedServiceContext.definition && serviceContext : stryMutAct_9fa48("150772") ? false : stryMutAct_9fa48("150771") ? true : (stryCov_9fa48("150771", "150772", "150773"), resolvedServiceContext.definition || serviceContext),
                context: runtimeContext
              }));
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.CREATED);
            }
          } else if (stryMutAct_9fa48("150776") ? lifecycleOperation !== SERVICE_LIFECYCLE_OPERATION.START : stryMutAct_9fa48("150775") ? false : stryMutAct_9fa48("150774") ? true : (stryCov_9fa48("150774", "150775", "150776"), lifecycleOperation === SERVICE_LIFECYCLE_OPERATION.START)) {
            if (stryMutAct_9fa48("150777")) {
              {}
            } else {
              stryCov_9fa48("150777");
              const replicaHandle = stryMutAct_9fa48("150780") ? resolvedServiceContext.replicaHandle && serviceContext : stryMutAct_9fa48("150779") ? false : stryMutAct_9fa48("150778") ? true : (stryCov_9fa48("150778", "150779", "150780"), resolvedServiceContext.replicaHandle || serviceContext);
              await this._enforceRuntimePolicy(lifecycleOperation, replicaHandle, runtimeContext);
              const currentState = this.getReplicaState(replicaHandle);
              this._assertTransition(serviceId, lifecycleOperation, currentState, SERVICE_LIFECYCLE_STATE.STARTING);
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STARTING);
              result = await adapter.startReplica(replicaHandle, runtimeContext);
              this._assertTransition(serviceId, lifecycleOperation, SERVICE_LIFECYCLE_STATE.STARTING, SERVICE_LIFECYCLE_STATE.RUNNING);
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.RUNNING);
            }
          } else if (stryMutAct_9fa48("150783") ? lifecycleOperation !== SERVICE_LIFECYCLE_OPERATION.STOP : stryMutAct_9fa48("150782") ? false : stryMutAct_9fa48("150781") ? true : (stryCov_9fa48("150781", "150782", "150783"), lifecycleOperation === SERVICE_LIFECYCLE_OPERATION.STOP)) {
            if (stryMutAct_9fa48("150784")) {
              {}
            } else {
              stryCov_9fa48("150784");
              const replicaHandle = stryMutAct_9fa48("150787") ? resolvedServiceContext.replicaHandle && serviceContext : stryMutAct_9fa48("150786") ? false : stryMutAct_9fa48("150785") ? true : (stryCov_9fa48("150785", "150786", "150787"), resolvedServiceContext.replicaHandle || serviceContext);
              const currentState = this.getReplicaState(replicaHandle);
              this._assertTransition(serviceId, lifecycleOperation, currentState, SERVICE_LIFECYCLE_STATE.STOPPING);
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPING);
              result = await adapter.stopReplica(replicaHandle, runtimeContext);
              this._assertTransition(serviceId, lifecycleOperation, SERVICE_LIFECYCLE_STATE.STOPPING, SERVICE_LIFECYCLE_STATE.STOPPED);
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPED);
            }
          } else if (stryMutAct_9fa48("150790") ? lifecycleOperation !== SERVICE_LIFECYCLE_OPERATION.RESTART : stryMutAct_9fa48("150789") ? false : stryMutAct_9fa48("150788") ? true : (stryCov_9fa48("150788", "150789", "150790"), lifecycleOperation === SERVICE_LIFECYCLE_OPERATION.RESTART)) {
            if (stryMutAct_9fa48("150791")) {
              {}
            } else {
              stryCov_9fa48("150791");
              const replicaHandle = stryMutAct_9fa48("150794") ? resolvedServiceContext.replicaHandle && serviceContext : stryMutAct_9fa48("150793") ? false : stryMutAct_9fa48("150792") ? true : (stryCov_9fa48("150792", "150793", "150794"), resolvedServiceContext.replicaHandle || serviceContext);
              await this._enforceRuntimePolicy(lifecycleOperation, replicaHandle, runtimeContext);
              const currentState = this.getReplicaState(replicaHandle);
              this._assertTransition(serviceId, lifecycleOperation, currentState, SERVICE_LIFECYCLE_STATE.STOPPING);
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPING);
              await adapter.stopReplica(replicaHandle, runtimeContext);
              this._assertTransition(serviceId, lifecycleOperation, SERVICE_LIFECYCLE_STATE.STOPPING, SERVICE_LIFECYCLE_STATE.STOPPED);
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPED);
              this._assertTransition(serviceId, lifecycleOperation, SERVICE_LIFECYCLE_STATE.STOPPED, SERVICE_LIFECYCLE_STATE.STARTING);
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STARTING);
              result = await adapter.startReplica(replicaHandle, runtimeContext);
              this._assertTransition(serviceId, lifecycleOperation, SERVICE_LIFECYCLE_STATE.STARTING, SERVICE_LIFECYCLE_STATE.RUNNING);
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.RUNNING);
            }
          } else {
            if (stryMutAct_9fa48("150795")) {
              {}
            } else {
              stryCov_9fa48("150795");
              return this._buildRecoveryResult(RECOVERY_RESULT_STATUS.SKIPPED, stryMutAct_9fa48("150796") ? {} : (stryCov_9fa48("150796"), {
                operationId,
                serviceId,
                lifecycleOperation,
                reason: RECOVERY_SKIP_REASON.UNKNOWN_OPERATION
              }));
            }
          }
          await this._journalTransition(operation, serviceId, lifecycleOperation, journalState, SERVICE_OPERATION_STATE.COMPLETED, result);
          this._recordLifecycleOutcome(lifecycleOperation, stryMutAct_9fa48("150799") ? (resolvedServiceContext.definition || resolvedServiceContext.replicaHandle) && serviceContext : stryMutAct_9fa48("150798") ? false : stryMutAct_9fa48("150797") ? true : (stryCov_9fa48("150797", "150798", "150799"), (stryMutAct_9fa48("150801") ? resolvedServiceContext.definition && resolvedServiceContext.replicaHandle : stryMutAct_9fa48("150800") ? false : (stryCov_9fa48("150800", "150801"), resolvedServiceContext.definition || resolvedServiceContext.replicaHandle)) || serviceContext), runtimeContext, stryMutAct_9fa48("150802") ? {} : (stryCov_9fa48("150802"), {
            operationId,
            status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
            durationMs: stryMutAct_9fa48("150803") ? Date.now() + recoveryStartedAt : (stryCov_9fa48("150803"), Date.now() - recoveryStartedAt),
            recovery: stryMutAct_9fa48("150804") ? false : (stryCov_9fa48("150804"), true)
          }));
          return this._buildRecoveryResult(RECOVERY_RESULT_STATUS.RECOVERED, stryMutAct_9fa48("150805") ? {} : (stryCov_9fa48("150805"), {
            operationId,
            serviceId,
            lifecycleOperation
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("150806")) {
          {}
        } else {
          stryCov_9fa48("150806");
          if (stryMutAct_9fa48("150808") ? false : stryMutAct_9fa48("150807") ? true : (stryCov_9fa48("150807", "150808"), replicaId)) {
            if (stryMutAct_9fa48("150809")) {
              {}
            } else {
              stryCov_9fa48("150809");
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.FAILED);
            }
          }
          await this._failRecoveryJournalState(stryMutAct_9fa48("150810") ? {} : (stryCov_9fa48("150810"), {
            operation,
            serviceId,
            lifecycleOperation,
            journalState,
            errorMessage: error.message
          }));
          const failureContext = stryMutAct_9fa48("150813") ? (resolvedServiceContext?.definition || resolvedServiceContext?.replicaHandle) && {
            serviceId
          } : stryMutAct_9fa48("150812") ? false : stryMutAct_9fa48("150811") ? true : (stryCov_9fa48("150811", "150812", "150813"), (stryMutAct_9fa48("150815") ? resolvedServiceContext?.definition && resolvedServiceContext?.replicaHandle : stryMutAct_9fa48("150814") ? false : (stryCov_9fa48("150814", "150815"), (stryMutAct_9fa48("150816") ? resolvedServiceContext.definition : (stryCov_9fa48("150816"), resolvedServiceContext?.definition)) || (stryMutAct_9fa48("150817") ? resolvedServiceContext.replicaHandle : (stryCov_9fa48("150817"), resolvedServiceContext?.replicaHandle)))) || (stryMutAct_9fa48("150818") ? {} : (stryCov_9fa48("150818"), {
            serviceId
          })));
          const failureRuntimeContext = stryMutAct_9fa48("150821") ? resolvedServiceContext?.context && defaultContext : stryMutAct_9fa48("150820") ? false : stryMutAct_9fa48("150819") ? true : (stryCov_9fa48("150819", "150820", "150821"), (stryMutAct_9fa48("150822") ? resolvedServiceContext.context : (stryCov_9fa48("150822"), resolvedServiceContext?.context)) || defaultContext);
          this._recordLifecycleOutcome(lifecycleOperation, failureContext, failureRuntimeContext, stryMutAct_9fa48("150823") ? {} : (stryCov_9fa48("150823"), {
            operationId,
            status: SERVICE_LIFECYCLE_METRIC_STATUS.FAILURE,
            durationMs: stryMutAct_9fa48("150824") ? Date.now() + recoveryStartedAt : (stryCov_9fa48("150824"), Date.now() - recoveryStartedAt),
            recovery: stryMutAct_9fa48("150825") ? false : (stryCov_9fa48("150825"), true),
            error
          }));
          return this._buildRecoveryResult(RECOVERY_RESULT_STATUS.FAILED, stryMutAct_9fa48("150826") ? {} : (stryCov_9fa48("150826"), {
            operationId,
            serviceId,
            lifecycleOperation,
            error: error.message
          }));
        }
      }
    }
  } /**
    * Resume pending and in-progress lifecycle operations from journal state.
    *
    * @param {Object} options
    * @param {Function} options.resolveServiceContext
    * @param {Object} [options.context]
    * @return {Promise<Object[]>}
    */
  async recoverPendingOperations(options = {}) {
    if (stryMutAct_9fa48("150827")) {
      {}
    } else {
      stryCov_9fa48("150827");
      const resolveServiceContext = options.resolveServiceContext;
      if (stryMutAct_9fa48("150830") ? typeof resolveServiceContext === TYPEOF.FUNCTION : stryMutAct_9fa48("150829") ? false : stryMutAct_9fa48("150828") ? true : (stryCov_9fa48("150828", "150829", "150830"), typeof resolveServiceContext !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("150831")) {
          {}
        } else {
          stryCov_9fa48("150831");
          throw new TypeError(LIFECYCLE_MGR_MSG.RECOVERY_RESOLVER_REQUIRED);
        }
      }
      const defaultContext = stryMutAct_9fa48("150834") ? options.context && {} : stryMutAct_9fa48("150833") ? false : stryMutAct_9fa48("150832") ? true : (stryCov_9fa48("150832", "150833", "150834"), options.context || {});
      const operationRows = await this._readRecoverableOperations();
      const recoveryResults = stryMutAct_9fa48("150835") ? ["Stryker was here"] : (stryCov_9fa48("150835"), []);
      for (const operationRow of operationRows) {
        if (stryMutAct_9fa48("150836")) {
          {}
        } else {
          stryCov_9fa48("150836");
          const result = await this._recoverOperationRow(operationRow, resolveServiceContext, defaultContext);
          recoveryResults.push(result);
        }
      }
      return recoveryResults;
    }
  } /**
    * Create a service replica via the matching adapter.
    *
    * @param {Object} definition
    * @param {Object} [context]
    * @param {Object} [options]
    * @param {string} [options.idempotencyKey]
    * @return {Promise<Object>}
    */
  async createReplica(definition, context = {}, options = {}) {
    if (stryMutAct_9fa48("150837")) {
      {}
    } else {
      stryCov_9fa48("150837");
      const startedAt = Date.now();
      let canonicalDefinition = null;
      const lifecycleOperation = SERVICE_LIFECYCLE_OPERATION.CREATE;
      let operation = null;
      let serviceId = null;
      let serviceType = null;
      let tenantId = null;
      let replicaId = null;
      try {
        if (stryMutAct_9fa48("150838")) {
          {}
        } else {
          stryCov_9fa48("150838");
          canonicalDefinition = assertServiceDescriptor(definition, stryMutAct_9fa48("150839") ? {} : (stryCov_9fa48("150839"), {
            adapterResolver: stryMutAct_9fa48("150840") ? () => undefined : (stryCov_9fa48("150840"), serviceType => this._adapters.get(serviceType))
          }));
          ({
            serviceId,
            serviceType,
            tenantId,
            replicaId
          } = resolveServiceFields(canonicalDefinition));
          const adapter = this._resolveAdapter(serviceType);
          this._logger.debug(SERVICE_LIFECYCLE_LOG.OPERATION_START, stryMutAct_9fa48("150841") ? {} : (stryCov_9fa48("150841"), {
            ...this._buildLifecycleLogContext(lifecycleOperation, canonicalDefinition, context, stryMutAct_9fa48("150842") ? {} : (stryCov_9fa48("150842"), {
              operationId: null
            }))
          }));
          await this._enforceRuntimePolicy(lifecycleOperation, canonicalDefinition, context);
          const definitionValidation = adapter.validateDefinition(canonicalDefinition);
          if (stryMutAct_9fa48("150845") ? false : stryMutAct_9fa48("150844") ? true : stryMutAct_9fa48("150843") ? definitionValidation.valid : (stryCov_9fa48("150843", "150844", "150845"), !definitionValidation.valid)) {
            if (stryMutAct_9fa48("150846")) {
              {}
            } else {
              stryCov_9fa48("150846");
              throw new ServiceDescriptorValidationError(stryMutAct_9fa48("150849") ? definitionValidation.errors && [SERVICE_LIFECYCLE_MANAGER_LITERAL.ADAPTER_REJECTED_SERVICE_DEFINITION] : stryMutAct_9fa48("150848") ? false : stryMutAct_9fa48("150847") ? true : (stryCov_9fa48("150847", "150848", "150849"), definitionValidation.errors || (stryMutAct_9fa48("150850") ? [] : (stryCov_9fa48("150850"), [SERVICE_LIFECYCLE_MANAGER_LITERAL.ADAPTER_REJECTED_SERVICE_DEFINITION]))), stryMutAct_9fa48("150851") ? {} : (stryCov_9fa48("150851"), {
                serviceId,
                serviceType
              }));
            }
          }
          const idempotencyKey = stryMutAct_9fa48("150854") ? options.idempotencyKey && null : stryMutAct_9fa48("150853") ? false : stryMutAct_9fa48("150852") ? true : (stryCov_9fa48("150852", "150853", "150854"), options.idempotencyKey || null);
          operation = await this._journalCreate(tenantId, serviceId, lifecycleOperation, idempotencyKey);
          if (stryMutAct_9fa48("150857") ? operation.idempotent : stryMutAct_9fa48("150856") ? false : stryMutAct_9fa48("150855") ? true : (stryCov_9fa48("150855", "150856", "150857"), operation?.idempotent)) {
            if (stryMutAct_9fa48("150858")) {
              {}
            } else {
              stryCov_9fa48("150858");
              const idempotentResult = stryMutAct_9fa48("150859") ? {} : (stryCov_9fa48("150859"), {
                operationId: operation.operationId,
                idempotent: stryMutAct_9fa48("150860") ? false : (stryCov_9fa48("150860"), true),
                status: stryMutAct_9fa48("150863") ? operation.existing.state && SERVICE_OPERATION_STATE.PENDING : stryMutAct_9fa48("150862") ? false : stryMutAct_9fa48("150861") ? true : (stryCov_9fa48("150861", "150862", "150863"), operation.existing.state || SERVICE_OPERATION_STATE.PENDING)
              });
              this._recordLifecycleOutcome(lifecycleOperation, canonicalDefinition, context, stryMutAct_9fa48("150864") ? {} : (stryCov_9fa48("150864"), {
                operationId: operation.operationId,
                status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
                durationMs: stryMutAct_9fa48("150865") ? Date.now() + startedAt : (stryCov_9fa48("150865"), Date.now() - startedAt)
              }));
              return idempotentResult;
            }
          }
          await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.PENDING, SERVICE_OPERATION_STATE.IN_PROGRESS);
          const result = await adapter.createReplica(stryMutAct_9fa48("150866") ? {} : (stryCov_9fa48("150866"), {
            definition: canonicalDefinition,
            context
          }));
          this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.CREATED);
          await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.IN_PROGRESS, SERVICE_OPERATION_STATE.COMPLETED, result);
          this._recordLifecycleOutcome(lifecycleOperation, canonicalDefinition, context, stryMutAct_9fa48("150867") ? {} : (stryCov_9fa48("150867"), {
            operationId: stryMutAct_9fa48("150870") ? operation?.operationId && null : stryMutAct_9fa48("150869") ? false : stryMutAct_9fa48("150868") ? true : (stryCov_9fa48("150868", "150869", "150870"), (stryMutAct_9fa48("150871") ? operation.operationId : (stryCov_9fa48("150871"), operation?.operationId)) || null),
            status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
            durationMs: stryMutAct_9fa48("150872") ? Date.now() + startedAt : (stryCov_9fa48("150872"), Date.now() - startedAt)
          }));
          return stryMutAct_9fa48("150873") ? {} : (stryCov_9fa48("150873"), {
            ...result,
            operationId: stryMutAct_9fa48("150874") ? operation.operationId : (stryCov_9fa48("150874"), operation?.operationId)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("150875")) {
          {}
        } else {
          stryCov_9fa48("150875");
          if (stryMutAct_9fa48("150877") ? false : stryMutAct_9fa48("150876") ? true : (stryCov_9fa48("150876", "150877"), replicaId)) {
            if (stryMutAct_9fa48("150878")) {
              {}
            } else {
              stryCov_9fa48("150878");
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.FAILED);
            }
          }
          if (stryMutAct_9fa48("150880") ? false : stryMutAct_9fa48("150879") ? true : (stryCov_9fa48("150879", "150880"), operation)) {
            if (stryMutAct_9fa48("150881")) {
              {}
            } else {
              stryCov_9fa48("150881");
              await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.IN_PROGRESS, SERVICE_OPERATION_STATE.FAILED, stryMutAct_9fa48("150882") ? {} : (stryCov_9fa48("150882"), {
                message: error.message
              })).catch(() => {});
            }
          }
          this._recordLifecycleOutcome(lifecycleOperation, stryMutAct_9fa48("150885") ? (canonicalDefinition || definition) && {} : stryMutAct_9fa48("150884") ? false : stryMutAct_9fa48("150883") ? true : (stryCov_9fa48("150883", "150884", "150885"), (stryMutAct_9fa48("150887") ? canonicalDefinition && definition : stryMutAct_9fa48("150886") ? false : (stryCov_9fa48("150886", "150887"), canonicalDefinition || definition)) || {}), context, stryMutAct_9fa48("150888") ? {} : (stryCov_9fa48("150888"), {
            operationId: stryMutAct_9fa48("150891") ? operation?.operationId && null : stryMutAct_9fa48("150890") ? false : stryMutAct_9fa48("150889") ? true : (stryCov_9fa48("150889", "150890", "150891"), (stryMutAct_9fa48("150892") ? operation.operationId : (stryCov_9fa48("150892"), operation?.operationId)) || null),
            status: SERVICE_LIFECYCLE_METRIC_STATUS.FAILURE,
            durationMs: stryMutAct_9fa48("150893") ? Date.now() + startedAt : (stryCov_9fa48("150893"), Date.now() - startedAt),
            error
          }));
          throw error;
        }
      }
    }
  } /**
    * Start a service replica via the matching adapter.
    *
    * @param {Object} replicaHandle
    * @param {Object} [context]
    * @param {Object} [options]
    * @param {string} [options.idempotencyKey]
    * @return {Promise<Object>}
    */
  async startReplica(replicaHandle, context = {}, options = {}) {
    if (stryMutAct_9fa48("150894")) {
      {}
    } else {
      stryCov_9fa48("150894");
      const startedAt = Date.now();
      const lifecycleOperation = SERVICE_LIFECYCLE_OPERATION.START;
      let operation = null;
      let serviceId = null;
      let tenantId = null;
      let replicaId = null;
      try {
        if (stryMutAct_9fa48("150895")) {
          {}
        } else {
          stryCov_9fa48("150895");
          const {
            serviceType
          } = resolveServiceFields(replicaHandle);
          ({
            serviceId,
            tenantId,
            replicaId
          } = resolveServiceFields(replicaHandle));
          const adapter = this._resolveAdapter(serviceType);
          const idempotencyKey = stryMutAct_9fa48("150898") ? options.idempotencyKey && null : stryMutAct_9fa48("150897") ? false : stryMutAct_9fa48("150896") ? true : (stryCov_9fa48("150896", "150897", "150898"), options.idempotencyKey || null);
          this._logger.debug(SERVICE_LIFECYCLE_LOG.OPERATION_START, stryMutAct_9fa48("150899") ? {} : (stryCov_9fa48("150899"), {
            ...this._buildLifecycleLogContext(lifecycleOperation, replicaHandle, context, stryMutAct_9fa48("150900") ? {} : (stryCov_9fa48("150900"), {
              operationId: null
            }))
          }));
          await this._enforceRuntimePolicy(lifecycleOperation, replicaHandle, context);
          const currentState = this.getReplicaState(replicaHandle);
          this._assertTransition(serviceId, lifecycleOperation, currentState, SERVICE_LIFECYCLE_STATE.STARTING);
          operation = await this._journalCreate(tenantId, serviceId, lifecycleOperation, idempotencyKey);
          if (stryMutAct_9fa48("150903") ? operation.idempotent : stryMutAct_9fa48("150902") ? false : stryMutAct_9fa48("150901") ? true : (stryCov_9fa48("150901", "150902", "150903"), operation?.idempotent)) {
            if (stryMutAct_9fa48("150904")) {
              {}
            } else {
              stryCov_9fa48("150904");
              const idempotentResult = stryMutAct_9fa48("150905") ? {} : (stryCov_9fa48("150905"), {
                operationId: operation.operationId,
                idempotent: stryMutAct_9fa48("150906") ? false : (stryCov_9fa48("150906"), true),
                status: stryMutAct_9fa48("150909") ? operation.existing.state && SERVICE_OPERATION_STATE.PENDING : stryMutAct_9fa48("150908") ? false : stryMutAct_9fa48("150907") ? true : (stryCov_9fa48("150907", "150908", "150909"), operation.existing.state || SERVICE_OPERATION_STATE.PENDING)
              });
              this._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, stryMutAct_9fa48("150910") ? {} : (stryCov_9fa48("150910"), {
                operationId: operation.operationId,
                status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
                durationMs: stryMutAct_9fa48("150911") ? Date.now() + startedAt : (stryCov_9fa48("150911"), Date.now() - startedAt)
              }));
              return idempotentResult;
            }
          }
          this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STARTING);
          await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.PENDING, SERVICE_OPERATION_STATE.IN_PROGRESS);
          const result = await adapter.startReplica(replicaHandle, context);
          this._assertTransition(serviceId, lifecycleOperation, SERVICE_LIFECYCLE_STATE.STARTING, SERVICE_LIFECYCLE_STATE.RUNNING);
          this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.RUNNING);
          await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.IN_PROGRESS, SERVICE_OPERATION_STATE.COMPLETED, result);
          this._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, stryMutAct_9fa48("150912") ? {} : (stryCov_9fa48("150912"), {
            operationId: stryMutAct_9fa48("150915") ? operation?.operationId && null : stryMutAct_9fa48("150914") ? false : stryMutAct_9fa48("150913") ? true : (stryCov_9fa48("150913", "150914", "150915"), (stryMutAct_9fa48("150916") ? operation.operationId : (stryCov_9fa48("150916"), operation?.operationId)) || null),
            status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
            durationMs: stryMutAct_9fa48("150917") ? Date.now() + startedAt : (stryCov_9fa48("150917"), Date.now() - startedAt)
          }));
          return stryMutAct_9fa48("150918") ? {} : (stryCov_9fa48("150918"), {
            ...result,
            operationId: stryMutAct_9fa48("150919") ? operation.operationId : (stryCov_9fa48("150919"), operation?.operationId)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("150920")) {
          {}
        } else {
          stryCov_9fa48("150920");
          if (stryMutAct_9fa48("150922") ? false : stryMutAct_9fa48("150921") ? true : (stryCov_9fa48("150921", "150922"), replicaId)) {
            if (stryMutAct_9fa48("150923")) {
              {}
            } else {
              stryCov_9fa48("150923");
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.FAILED);
            }
          }
          if (stryMutAct_9fa48("150925") ? false : stryMutAct_9fa48("150924") ? true : (stryCov_9fa48("150924", "150925"), operation)) {
            if (stryMutAct_9fa48("150926")) {
              {}
            } else {
              stryCov_9fa48("150926");
              await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.IN_PROGRESS, SERVICE_OPERATION_STATE.FAILED, stryMutAct_9fa48("150927") ? {} : (stryCov_9fa48("150927"), {
                message: error.message
              })).catch(() => {});
            }
          }
          this._recordLifecycleOutcome(lifecycleOperation, stryMutAct_9fa48("150930") ? replicaHandle && {} : stryMutAct_9fa48("150929") ? false : stryMutAct_9fa48("150928") ? true : (stryCov_9fa48("150928", "150929", "150930"), replicaHandle || {}), context, stryMutAct_9fa48("150931") ? {} : (stryCov_9fa48("150931"), {
            operationId: stryMutAct_9fa48("150934") ? operation?.operationId && null : stryMutAct_9fa48("150933") ? false : stryMutAct_9fa48("150932") ? true : (stryCov_9fa48("150932", "150933", "150934"), (stryMutAct_9fa48("150935") ? operation.operationId : (stryCov_9fa48("150935"), operation?.operationId)) || null),
            status: SERVICE_LIFECYCLE_METRIC_STATUS.FAILURE,
            durationMs: stryMutAct_9fa48("150936") ? Date.now() + startedAt : (stryCov_9fa48("150936"), Date.now() - startedAt),
            error
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Stop a service replica via the matching adapter.
   *
   * @param {Object} replicaHandle
   * @param {Object} [context]
   * @param {Object} [options]
   * @param {string} [options.idempotencyKey]
   * @return {Promise<Object>}
   */
  async stopReplica(replicaHandle, context = {}, options = {}) {
    if (stryMutAct_9fa48("150937")) {
      {}
    } else {
      stryCov_9fa48("150937");
      const startedAt = Date.now();
      const lifecycleOperation = SERVICE_LIFECYCLE_OPERATION.STOP;
      let operation = null;
      let serviceId = null;
      let tenantId = null;
      let replicaId = null;
      try {
        if (stryMutAct_9fa48("150938")) {
          {}
        } else {
          stryCov_9fa48("150938");
          const {
            serviceType
          } = resolveServiceFields(replicaHandle);
          ({
            serviceId,
            tenantId,
            replicaId
          } = resolveServiceFields(replicaHandle));
          const adapter = this._resolveAdapter(serviceType);
          const idempotencyKey = stryMutAct_9fa48("150941") ? options.idempotencyKey && null : stryMutAct_9fa48("150940") ? false : stryMutAct_9fa48("150939") ? true : (stryCov_9fa48("150939", "150940", "150941"), options.idempotencyKey || null);
          this._logger.debug(SERVICE_LIFECYCLE_LOG.OPERATION_START, stryMutAct_9fa48("150942") ? {} : (stryCov_9fa48("150942"), {
            ...this._buildLifecycleLogContext(lifecycleOperation, replicaHandle, context, stryMutAct_9fa48("150943") ? {} : (stryCov_9fa48("150943"), {
              operationId: null
            }))
          }));
          const currentState = this.getReplicaState(replicaHandle);
          this._assertTransition(serviceId, lifecycleOperation, currentState, SERVICE_LIFECYCLE_STATE.STOPPING);
          operation = await this._journalCreate(tenantId, serviceId, lifecycleOperation, idempotencyKey);
          if (stryMutAct_9fa48("150946") ? operation.idempotent : stryMutAct_9fa48("150945") ? false : stryMutAct_9fa48("150944") ? true : (stryCov_9fa48("150944", "150945", "150946"), operation?.idempotent)) {
            if (stryMutAct_9fa48("150947")) {
              {}
            } else {
              stryCov_9fa48("150947");
              const idempotentResult = stryMutAct_9fa48("150948") ? {} : (stryCov_9fa48("150948"), {
                operationId: operation.operationId,
                idempotent: stryMutAct_9fa48("150949") ? false : (stryCov_9fa48("150949"), true),
                status: stryMutAct_9fa48("150952") ? operation.existing.state && SERVICE_OPERATION_STATE.PENDING : stryMutAct_9fa48("150951") ? false : stryMutAct_9fa48("150950") ? true : (stryCov_9fa48("150950", "150951", "150952"), operation.existing.state || SERVICE_OPERATION_STATE.PENDING)
              });
              this._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, stryMutAct_9fa48("150953") ? {} : (stryCov_9fa48("150953"), {
                operationId: operation.operationId,
                status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
                durationMs: stryMutAct_9fa48("150954") ? Date.now() + startedAt : (stryCov_9fa48("150954"), Date.now() - startedAt)
              }));
              return idempotentResult;
            }
          }
          this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPING);
          await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.PENDING, SERVICE_OPERATION_STATE.IN_PROGRESS);
          const result = await adapter.stopReplica(replicaHandle, context);
          this._assertTransition(serviceId, lifecycleOperation, SERVICE_LIFECYCLE_STATE.STOPPING, SERVICE_LIFECYCLE_STATE.STOPPED);
          this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPED);
          await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.IN_PROGRESS, SERVICE_OPERATION_STATE.COMPLETED, result);
          this._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, stryMutAct_9fa48("150955") ? {} : (stryCov_9fa48("150955"), {
            operationId: stryMutAct_9fa48("150958") ? operation?.operationId && null : stryMutAct_9fa48("150957") ? false : stryMutAct_9fa48("150956") ? true : (stryCov_9fa48("150956", "150957", "150958"), (stryMutAct_9fa48("150959") ? operation.operationId : (stryCov_9fa48("150959"), operation?.operationId)) || null),
            status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
            durationMs: stryMutAct_9fa48("150960") ? Date.now() + startedAt : (stryCov_9fa48("150960"), Date.now() - startedAt)
          }));
          return stryMutAct_9fa48("150961") ? {} : (stryCov_9fa48("150961"), {
            ...result,
            operationId: stryMutAct_9fa48("150962") ? operation.operationId : (stryCov_9fa48("150962"), operation?.operationId)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("150963")) {
          {}
        } else {
          stryCov_9fa48("150963");
          if (stryMutAct_9fa48("150965") ? false : stryMutAct_9fa48("150964") ? true : (stryCov_9fa48("150964", "150965"), replicaId)) {
            if (stryMutAct_9fa48("150966")) {
              {}
            } else {
              stryCov_9fa48("150966");
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.FAILED);
            }
          }
          if (stryMutAct_9fa48("150968") ? false : stryMutAct_9fa48("150967") ? true : (stryCov_9fa48("150967", "150968"), operation)) {
            if (stryMutAct_9fa48("150969")) {
              {}
            } else {
              stryCov_9fa48("150969");
              await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.IN_PROGRESS, SERVICE_OPERATION_STATE.FAILED, stryMutAct_9fa48("150970") ? {} : (stryCov_9fa48("150970"), {
                message: error.message
              })).catch(() => {});
            }
          }
          this._recordLifecycleOutcome(lifecycleOperation, stryMutAct_9fa48("150973") ? replicaHandle && {} : stryMutAct_9fa48("150972") ? false : stryMutAct_9fa48("150971") ? true : (stryCov_9fa48("150971", "150972", "150973"), replicaHandle || {}), context, stryMutAct_9fa48("150974") ? {} : (stryCov_9fa48("150974"), {
            operationId: stryMutAct_9fa48("150977") ? operation?.operationId && null : stryMutAct_9fa48("150976") ? false : stryMutAct_9fa48("150975") ? true : (stryCov_9fa48("150975", "150976", "150977"), (stryMutAct_9fa48("150978") ? operation.operationId : (stryCov_9fa48("150978"), operation?.operationId)) || null),
            status: SERVICE_LIFECYCLE_METRIC_STATUS.FAILURE,
            durationMs: stryMutAct_9fa48("150979") ? Date.now() + startedAt : (stryCov_9fa48("150979"), Date.now() - startedAt),
            error
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Restart a replica by delegating stop/start to the same adapter.
   *
   * @param {Object} replicaHandle
   * @param {Object} [context]
   * @param {Object} [options]
   * @param {string} [options.idempotencyKey]
   * @return {Promise<Object>}
   */
  async restartReplica(replicaHandle, context = {}, options = {}) {
    if (stryMutAct_9fa48("150980")) {
      {}
    } else {
      stryCov_9fa48("150980");
      const startedAt = Date.now();
      const lifecycleOperation = SERVICE_LIFECYCLE_OPERATION.RESTART;
      let operation = null;
      let serviceId = null;
      let tenantId = null;
      let replicaId = null;
      try {
        if (stryMutAct_9fa48("150981")) {
          {}
        } else {
          stryCov_9fa48("150981");
          const {
            serviceType
          } = resolveServiceFields(replicaHandle);
          ({
            serviceId,
            tenantId,
            replicaId
          } = resolveServiceFields(replicaHandle));
          const adapter = this._resolveAdapter(serviceType);
          const idempotencyKey = stryMutAct_9fa48("150984") ? options.idempotencyKey && null : stryMutAct_9fa48("150983") ? false : stryMutAct_9fa48("150982") ? true : (stryCov_9fa48("150982", "150983", "150984"), options.idempotencyKey || null);
          this._logger.debug(SERVICE_LIFECYCLE_LOG.OPERATION_START, stryMutAct_9fa48("150985") ? {} : (stryCov_9fa48("150985"), {
            ...this._buildLifecycleLogContext(lifecycleOperation, replicaHandle, context, stryMutAct_9fa48("150986") ? {} : (stryCov_9fa48("150986"), {
              operationId: null
            }))
          }));
          await this._enforceRuntimePolicy(lifecycleOperation, replicaHandle, context);
          const currentState = this.getReplicaState(replicaHandle);
          this._assertTransition(serviceId, lifecycleOperation, currentState, SERVICE_LIFECYCLE_STATE.STOPPING);
          operation = await this._journalCreate(tenantId, serviceId, lifecycleOperation, idempotencyKey);
          if (stryMutAct_9fa48("150989") ? operation.idempotent : stryMutAct_9fa48("150988") ? false : stryMutAct_9fa48("150987") ? true : (stryCov_9fa48("150987", "150988", "150989"), operation?.idempotent)) {
            if (stryMutAct_9fa48("150990")) {
              {}
            } else {
              stryCov_9fa48("150990");
              const idempotentResult = stryMutAct_9fa48("150991") ? {} : (stryCov_9fa48("150991"), {
                operationId: operation.operationId,
                idempotent: stryMutAct_9fa48("150992") ? false : (stryCov_9fa48("150992"), true),
                status: stryMutAct_9fa48("150995") ? operation.existing.state && SERVICE_OPERATION_STATE.PENDING : stryMutAct_9fa48("150994") ? false : stryMutAct_9fa48("150993") ? true : (stryCov_9fa48("150993", "150994", "150995"), operation.existing.state || SERVICE_OPERATION_STATE.PENDING)
              });
              this._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, stryMutAct_9fa48("150996") ? {} : (stryCov_9fa48("150996"), {
                operationId: operation.operationId,
                status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
                durationMs: stryMutAct_9fa48("150997") ? Date.now() + startedAt : (stryCov_9fa48("150997"), Date.now() - startedAt)
              }));
              return idempotentResult;
            }
          }
          await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.PENDING, SERVICE_OPERATION_STATE.IN_PROGRESS);
          this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPING);
          await adapter.stopReplica(replicaHandle, context);
          this._assertTransition(serviceId, lifecycleOperation, SERVICE_LIFECYCLE_STATE.STOPPING, SERVICE_LIFECYCLE_STATE.STOPPED);
          this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPED);
          this._assertTransition(serviceId, lifecycleOperation, SERVICE_LIFECYCLE_STATE.STOPPED, SERVICE_LIFECYCLE_STATE.STARTING);
          this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STARTING);
          const startResult = await adapter.startReplica(replicaHandle, context);
          this._assertTransition(serviceId, lifecycleOperation, SERVICE_LIFECYCLE_STATE.STARTING, SERVICE_LIFECYCLE_STATE.RUNNING);
          this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.RUNNING);
          await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.IN_PROGRESS, SERVICE_OPERATION_STATE.COMPLETED, startResult);
          this._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, stryMutAct_9fa48("150998") ? {} : (stryCov_9fa48("150998"), {
            operationId: stryMutAct_9fa48("151001") ? operation?.operationId && null : stryMutAct_9fa48("151000") ? false : stryMutAct_9fa48("150999") ? true : (stryCov_9fa48("150999", "151000", "151001"), (stryMutAct_9fa48("151002") ? operation.operationId : (stryCov_9fa48("151002"), operation?.operationId)) || null),
            status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
            durationMs: stryMutAct_9fa48("151003") ? Date.now() + startedAt : (stryCov_9fa48("151003"), Date.now() - startedAt)
          }));
          return stryMutAct_9fa48("151004") ? {} : (stryCov_9fa48("151004"), {
            ...startResult,
            operationId: stryMutAct_9fa48("151005") ? operation.operationId : (stryCov_9fa48("151005"), operation?.operationId)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("151006")) {
          {}
        } else {
          stryCov_9fa48("151006");
          if (stryMutAct_9fa48("151008") ? false : stryMutAct_9fa48("151007") ? true : (stryCov_9fa48("151007", "151008"), replicaId)) {
            if (stryMutAct_9fa48("151009")) {
              {}
            } else {
              stryCov_9fa48("151009");
              this._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.FAILED);
            }
          }
          if (stryMutAct_9fa48("151011") ? false : stryMutAct_9fa48("151010") ? true : (stryCov_9fa48("151010", "151011"), operation)) {
            if (stryMutAct_9fa48("151012")) {
              {}
            } else {
              stryCov_9fa48("151012");
              await this._journalTransition(operation, serviceId, lifecycleOperation, SERVICE_OPERATION_STATE.IN_PROGRESS, SERVICE_OPERATION_STATE.FAILED, stryMutAct_9fa48("151013") ? {} : (stryCov_9fa48("151013"), {
                message: error.message
              })).catch(() => {});
            }
          }
          this._recordLifecycleOutcome(lifecycleOperation, stryMutAct_9fa48("151016") ? replicaHandle && {} : stryMutAct_9fa48("151015") ? false : stryMutAct_9fa48("151014") ? true : (stryCov_9fa48("151014", "151015", "151016"), replicaHandle || {}), context, stryMutAct_9fa48("151017") ? {} : (stryCov_9fa48("151017"), {
            operationId: stryMutAct_9fa48("151020") ? operation?.operationId && null : stryMutAct_9fa48("151019") ? false : stryMutAct_9fa48("151018") ? true : (stryCov_9fa48("151018", "151019", "151020"), (stryMutAct_9fa48("151021") ? operation.operationId : (stryCov_9fa48("151021"), operation?.operationId)) || null),
            status: SERVICE_LIFECYCLE_METRIC_STATUS.FAILURE,
            durationMs: stryMutAct_9fa48("151022") ? Date.now() + startedAt : (stryCov_9fa48("151022"), Date.now() - startedAt),
            error
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Query adapter health without mutating lifecycle state.
   *
   * @param {Object} replicaHandle
   * @param {Object} [context]
   * @return {Promise<Object>}
   */
  async health(replicaHandle, context = {}) {
    if (stryMutAct_9fa48("151023")) {
      {}
    } else {
      stryCov_9fa48("151023");
      const {
        serviceType
      } = resolveServiceFields(replicaHandle);
      const adapter = this._resolveAdapter(serviceType);
      return adapter.health(replicaHandle, context);
    }
  }
}
export { ServiceLifecycleManager };