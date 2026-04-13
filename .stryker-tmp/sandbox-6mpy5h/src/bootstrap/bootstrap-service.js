/**
 * Bootstrap Service - System initialization and startup.
 *
 * Seed Node Bootstrap Process:
 * 1. Infrastructure - Create node service and message router
 * 2. Message Groups - Create initial message group replicas
 * 3. Partitions - Create system table partitions
 * 4. Registration - Write system metadata using bootstrap mode
 * 5. Cache Hydration - Populate system cache from partitions
 *
 * Bootstrap Mode Architecture:
 * - During registration phase, uses bootstrap mode for direct writes
 * - Bootstrap mode bypasses SQL routing (which requires cache)
 * - After registration, cache is hydrated from partition data
 * - After hydration, bootstrap mode is disabled
 * - All subsequent writes route through SQL engine and system cache
 *
 * System Cache as Single Source of Truth:
 * - After bootstrap, system cache contains complete cluster state
 * - All queries route through system cache to find partition leaders
 * - CDC events keep cache synchronized across all nodes
 * - No bootstrap directories or fallback mechanisms
 *
 * Requirements: 6.3, 6.4, 6.7, 6.8, 6.9, 6.12, 6.13, 6.14, 6.16, 35.1, 35.5
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
import { v4 as _uuidv4 } from 'uuid';
import { LoggingService } from '../logging/logging-service.js';
import { DataDirectoryManager as _DataDirectoryManager } from '../storage/data-directory-manager.js';
import { NodeService } from '../node/node-service.js';
import { MessageGroupService as _MessageGroupService } from '../message-group/message-group-service.js';
import { PartitionService } from '../partition/partition-service.js';
import { BOOTSTRAP_DEFAULT, BOOTSTRAP_ERROR, BOOTSTRAP_EVENT, BOOTSTRAP_LOG_MSG, BOOTSTRAP_NODE_READY_REBALANCE_TABLES, BOOTSTRAP_PHASE, BOOTSTRAP_READY_MESSAGE, BOOTSTRAP_REBALANCE_DELAY_MS, BOOTSTRAP_REBALANCE_REASON, BOOTSTRAP_REPLICA_REGISTRATION_REASON, BOOTSTRAP_REPLICA_REGISTRATION_TRACE, BOOTSTRAP_SUBSYSTEM, SEED_DELEGATE_BUNDLE } from './bootstrap-constants.js';
import { INITIAL_MESSAGE_GROUP_ID } from './system-table-schemas-constants.js';
import { CacheHydrationService as _CacheHydrationService } from '../cache/cache-hydration-service.js';
import { shouldAttachPartitionCdcPropagation } from './shared/cdc-propagation-filter.js';
import { CDC_LIFECYCLE_LOG_MSG } from '../constants/cdc-lifecycle-constants.js';
import { ReplicaHandlerSetup } from './shared/replica-handler-setup.js';
import { ReplicaState } from '../node/replica-state-machine.js';
import { NodeStorageBudgetSetup } from './shared/node-storage-budget-setup.js';
import { ControlPlaneSetup } from './shared/control-plane-setup.js';
import { StartupRuntimeSurfaceOwner } from './shared/startup-runtime-surface-owner.js';
import { HEARTBEAT_STATE } from '../control-plane/heartbeat-service-constants.js';
import { LEASE_STATE } from '../control-plane/lease-service-constants.js';
import { waitForLocalQueryTransportReadiness } from './shared/local-query-transport-readiness.js';
import { assertCritical } from '../utils/assert.js';
import { STORAGE_DEFAULT } from '../storage/storage-constants.js';
import { createRuntimeStartupWiring } from '../runtime/runtime-startup-wiring.js';
import { WORK_CLASS, WorkClassScheduler } from '../runtime/work-class-scheduler.js';
import { CONTROL_PLANE_ROLLOUT_REQUIRED, assertRequiredControlPlaneRollout } from '../runtime/control-plane-rollout-controls.js';
import { PgWireStartupSafetyGate } from './pgwire-startup-safety-gate.js';
import { RuntimeServiceHandlerSetup } from './shared/runtime-service-handler-setup.js';
import { MessageGroupServiceHandlerSetup } from './shared/message-group-service-handler-setup.js';
import { activateSteadyStateRuntimeHandoff } from './shared/startup-sql-runtime-handoff.js';
import { activateMessageGroupServiceRows } from './shared/message-group-service-activation.js';
import { ReplicaCreationProgressReporter } from '../utils/replica-creation-progress-reporter.js';
import { BootstrapMessageGroupSelectionOwner } from './owners/bootstrap-message-group-selection-owner.js';
import { createSeedPhaseOwners } from './owners/seed-phase-owners.js';
import { BootstrapNodeReadyRebalanceOwner } from './owners/bootstrap-node-ready-rebalance-owner.js';
import { StartupRuntimeHandoffOwner } from './owners/startup-runtime-handoff-owner.js';
import { SeedRuntimeBridgeOwner } from './owners/seed-runtime-bridge-owner.js';
import { SeedRegistrationRuntimeOwner } from './owners/seed-registration-runtime-owner.js';
import { StartupPipelineRunner } from './pipeline/startup-pipeline-runner.js';
import { createSeedStartupPlan } from './pipeline/seed-startup-plan.js';
import { SeedInfrastructurePhase } from './phases/seed-infrastructure-phase.js';
import { SeedMessageGroupsPhase } from './phases/seed-message-groups-phase.js';
import { SeedPartitionsPhase } from './phases/seed-partitions-phase.js';
import { SeedRegistrationPhase } from './phases/seed-registration-phase.js';
import { SeedCacheHydrationPhase } from './phases/seed-cache-hydration-phase.js';
import { SeedCleanupHandler } from './phases/seed-cleanup-handler.js';
import { NodeLifecycleStateMachine, NodeState } from '../node/node-lifecycle-state-machine.js';
import { isNodeHeartbeatWatermarkRegression, isNodeRecordReady } from '../node/node-readiness-policy.js';
import { BOOTSTRAP_SUB_PHASE } from '../node/node-constants.js';
import { ADDRESS, COLUMN, ENTITY_TYPE, NUM, SERVICE_STATUS, STATE, TABLES } from '../constants/index.js';
const BootstrapPhase = BOOTSTRAP_PHASE;
const BootstrapEvent = BOOTSTRAP_EVENT;
const BootstrapLog = BOOTSTRAP_LOG_MSG;
const bootstrapError = BOOTSTRAP_ERROR;
const DEFAULT_BOOTSTRAP_CONFIG = BOOTSTRAP_DEFAULT;
const BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL = NUM.TEN;
const BOOTSTRAP_REPLICA_STATE_TRANSITIONS_PER_REPLICA = NUM.FOUR;
const NODE_READY_REBALANCE_TABLE_SET = new Set(BOOTSTRAP_NODE_READY_REBALANCE_TABLES);

/**
 * Maps BOOTSTRAP_PHASE values to BOOTSTRAP_SUB_PHASE values
 * for NodeLifecycleStateMachine sub-phase transitions.
 */
const PHASE_TO_SUB_PHASE = Object.freeze(stryMutAct_9fa48("12323") ? {} : (stryCov_9fa48("12323"), {
  [BootstrapPhase.INFRASTRUCTURE]: BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
  [BootstrapPhase.MESSAGE_GROUPS]: BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
  [BootstrapPhase.PARTITIONS]: BOOTSTRAP_SUB_PHASE.PARTITIONS,
  [BootstrapPhase.REGISTRATION]: BOOTSTRAP_SUB_PHASE.REGISTRATION,
  [BootstrapPhase.CACHE_HYDRATION]: BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION
}));

/**
 * BootstrapService handles system initialization for seed nodes.
 * Implements four-phase bootstrap: infrastructure, message groups, partitions, registration.
 */
class BootstrapService extends EventEmitter {
  /**
   * Create a new BootstrapService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.dataDirectoryManager - DataDirectoryManager instance.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("12324")) {
      {}
    } else {
      stryCov_9fa48("12324");
      super();
      this.rolloutControls = assertRequiredControlPlaneRollout(stryMutAct_9fa48("12325") ? {} : (stryCov_9fa48("12325"), {
        owner: stryMutAct_9fa48("12326") ? "" : (stryCov_9fa48("12326"), 'BootstrapService'),
        controls: options.rolloutControls,
        required: CONTROL_PLANE_ROLLOUT_REQUIRED.BOOTSTRAP_SERVICE
      }));
      this.nodeId = stryMutAct_9fa48("12329") ? options.nodeId && null : stryMutAct_9fa48("12328") ? false : stryMutAct_9fa48("12327") ? true : (stryCov_9fa48("12327", "12328", "12329"), options.nodeId || null);
      this.nodeAddress = stryMutAct_9fa48("12332") ? options.nodeAddress && null : stryMutAct_9fa48("12331") ? false : stryMutAct_9fa48("12330") ? true : (stryCov_9fa48("12330", "12331", "12332"), options.nodeAddress || null);
      this.advertisedNodeWsAddress = stryMutAct_9fa48("12335") ? options.advertisedNodeWsAddress && null : stryMutAct_9fa48("12334") ? false : stryMutAct_9fa48("12333") ? true : (stryCov_9fa48("12333", "12334", "12335"), options.advertisedNodeWsAddress || null);
      this.wsPort = stryMutAct_9fa48("12338") ? options.wsPort && null : stryMutAct_9fa48("12337") ? false : stryMutAct_9fa48("12336") ? true : (stryCov_9fa48("12336", "12337", "12338"), options.wsPort || null);
      this.config = stryMutAct_9fa48("12339") ? {} : (stryCov_9fa48("12339"), {
        ...BOOTSTRAP_DEFAULT,
        ...options.config
      });
      this.config.replicaStaggerDelayMs = Number.isFinite(this.config.replicaStaggerDelayMs) ? stryMutAct_9fa48("12340") ? Math.min(NUM.ZERO, this.config.replicaStaggerDelayMs) : (stryCov_9fa48("12340"), Math.max(NUM.ZERO, this.config.replicaStaggerDelayMs)) : BOOTSTRAP_DEFAULT.replicaStaggerDelayMs;
      this.config.maxConcurrentServiceActions = Number.isFinite(this.config.maxConcurrentServiceActions) ? stryMutAct_9fa48("12341") ? Math.min(NUM.ONE, Math.floor(this.config.maxConcurrentServiceActions)) : (stryCov_9fa48("12341"), Math.max(NUM.ONE, Math.floor(this.config.maxConcurrentServiceActions))) : BOOTSTRAP_DEFAULT.maxConcurrentServiceActions;
      this.config.replicaRegistrationTraceEnabled = Boolean(this.config.replicaRegistrationTraceEnabled);
      this.bootstrapReadinessState = stryMutAct_9fa48("12344") ? options.readinessState && null : stryMutAct_9fa48("12343") ? false : stryMutAct_9fa48("12342") ? true : (stryCov_9fa48("12342", "12343", "12344"), options.readinessState || null);
      this.sqlQueryEngine = stryMutAct_9fa48("12347") ? options.sqlQueryEngine && null : stryMutAct_9fa48("12346") ? false : stryMutAct_9fa48("12345") ? true : (stryCov_9fa48("12345", "12346", "12347"), options.sqlQueryEngine || null);
      this.onLocalAdminRuntimeReady = (stryMutAct_9fa48("12350") ? typeof options.onLocalAdminRuntimeReady !== 'function' : stryMutAct_9fa48("12349") ? false : stryMutAct_9fa48("12348") ? true : (stryCov_9fa48("12348", "12349", "12350"), typeof options.onLocalAdminRuntimeReady === (stryMutAct_9fa48("12351") ? "" : (stryCov_9fa48("12351"), 'function')))) ? options.onLocalAdminRuntimeReady : null;
      this.localAdminRuntimeReadyNotified = stryMutAct_9fa48("12352") ? true : (stryCov_9fa48("12352"), false);
      this.nodeReadyRebalanceDelayMs = Number.isFinite(this.config.nodeReadyRebalanceDelayMs) ? stryMutAct_9fa48("12353") ? Math.min(NUM.ZERO, this.config.nodeReadyRebalanceDelayMs) : (stryCov_9fa48("12353"), Math.max(NUM.ZERO, this.config.nodeReadyRebalanceDelayMs)) : BOOTSTRAP_REBALANCE_DELAY_MS;
      this.dataDirectoryManager = stryMutAct_9fa48("12356") ? options.dataDirectoryManager && null : stryMutAct_9fa48("12355") ? false : stryMutAct_9fa48("12354") ? true : (stryCov_9fa48("12354", "12355", "12356"), options.dataDirectoryManager || null);
      this.workClassScheduler = stryMutAct_9fa48("12359") ? options.workClassScheduler && new WorkClassScheduler({
        maxConcurrent: this.config.maxConcurrentServiceActions,
        reservedClassASlots: NUM.ONE
      }) : stryMutAct_9fa48("12358") ? false : stryMutAct_9fa48("12357") ? true : (stryCov_9fa48("12357", "12358", "12359"), options.workClassScheduler || new WorkClassScheduler(stryMutAct_9fa48("12360") ? {} : (stryCov_9fa48("12360"), {
        maxConcurrent: this.config.maxConcurrentServiceActions,
        reservedClassASlots: NUM.ONE
      })));

      // Services created during bootstrap
      this.messageGroupServices = new Map();
      this.messageGroupSelectionOwner = new BootstrapMessageGroupSelectionOwner(stryMutAct_9fa48("12361") ? {} : (stryCov_9fa48("12361"), {
        delegates: stryMutAct_9fa48("12362") ? {} : (stryCov_9fa48("12362"), {
          getMessageGroupServices: stryMutAct_9fa48("12363") ? () => undefined : (stryCov_9fa48("12363"), () => this.messageGroupServices)
        })
      }));
      this.partitionServices = new Map();
      this.transport = null;
      // MessageRouter for unified local/remote message routing
      this.messageRouter = null;
      // Track message group replicas for deferred election start
      this.messageGroupReplicas = stryMutAct_9fa48("12364") ? ["Stryker was here"] : (stryCov_9fa48("12364"), []);
      // Track partition replicas for deferred election start
      this.partitionReplicas = stryMutAct_9fa48("12365") ? ["Stryker was here"] : (stryCov_9fa48("12365"), []);
      // Unified lifecycle desired-state descriptors for bootstrap-created services.
      this.bootstrapDesiredServiceDefinitions = new Map();
      // Replica creation options keyed by canonical serviceId.
      this.bootstrapReplicaOptionsByServiceId = new Map();
      // Unified lifecycle owners for hard-cutover startup orchestration.
      this.serviceLifecycleManager = null;
      this.serviceReconciler = null;
      // Replica handler for CREATE_REPLICA/REMOVE_REPLICA execution
      this.replicaHandler = null;

      // Replica state machine for tracking replica lifecycle states
      this.replicaStateMachine = null;

      // Decomposed control plane services
      this.heartbeatService = null;
      this.leaseService = null;
      this.endpointService = null;
      this.dispatchService = null;
      this.rebalanceCoordinator = null;
      this.controlPlaneBackgroundWriterActivationPromise = null;
      this.messageGroupServiceHandler = null;

      // Unified runtime ownership wiring.
      const runtimeWiring = createRuntimeStartupWiring(stryMutAct_9fa48("12366") ? {} : (stryCov_9fa48("12366"), {
        ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled)
      }));
      const self = this;
      this.runtimeDependencyOwner = stryMutAct_9fa48("12367") ? {} : (stryCov_9fa48("12367"), {
        runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
        serviceRuntimeLifecycle: runtimeWiring.serviceRuntimeLifecycle,
        get logger() {
          if (stryMutAct_9fa48("12368")) {
            {}
          } else {
            stryCov_9fa48("12368");
            return self.logger;
          }
        },
        get transport() {
          if (stryMutAct_9fa48("12369")) {
            {}
          } else {
            stryCov_9fa48("12369");
            return self.transport;
          }
        },
        get messageRouter() {
          if (stryMutAct_9fa48("12370")) {
            {}
          } else {
            stryCov_9fa48("12370");
            return self.messageRouter;
          }
        },
        get cdcIntegrationService() {
          if (stryMutAct_9fa48("12371")) {
            {}
          } else {
            stryCov_9fa48("12371");
            return self.cdcIntegrationService;
          }
        },
        get systemTableCache() {
          if (stryMutAct_9fa48("12372")) {
            {}
          } else {
            stryCov_9fa48("12372");
            return self.peekSystemTableCache();
          }
        },
        get replicaHandler() {
          if (stryMutAct_9fa48("12373")) {
            {}
          } else {
            stryCov_9fa48("12373");
            return self.replicaHandler;
          }
        },
        get replicaStateMachine() {
          if (stryMutAct_9fa48("12374")) {
            {}
          } else {
            stryCov_9fa48("12374");
            return self.replicaStateMachine;
          }
        },
        get heartbeatService() {
          if (stryMutAct_9fa48("12375")) {
            {}
          } else {
            stryCov_9fa48("12375");
            return self.heartbeatService;
          }
        },
        get leaseService() {
          if (stryMutAct_9fa48("12376")) {
            {}
          } else {
            stryCov_9fa48("12376");
            return self.leaseService;
          }
        },
        get endpointService() {
          if (stryMutAct_9fa48("12377")) {
            {}
          } else {
            stryCov_9fa48("12377");
            return self.endpointService;
          }
        },
        get dispatchService() {
          if (stryMutAct_9fa48("12378")) {
            {}
          } else {
            stryCov_9fa48("12378");
            return self.dispatchService;
          }
        },
        get tablePolicyService() {
          if (stryMutAct_9fa48("12379")) {
            {}
          } else {
            stryCov_9fa48("12379");
            return self.tablePolicyService;
          }
        },
        get latencyTopology() {
          if (stryMutAct_9fa48("12380")) {
            {}
          } else {
            stryCov_9fa48("12380");
            return self.latencyTopology;
          }
        },
        get runtimeServiceHandler() {
          if (stryMutAct_9fa48("12381")) {
            {}
          } else {
            stryCov_9fa48("12381");
            return self.runtimeServiceHandler;
          }
        },
        get rebalanceCoordinator() {
          if (stryMutAct_9fa48("12382")) {
            {}
          } else {
            stryCov_9fa48("12382");
            return self.rebalanceCoordinator;
          }
        },
        get controlPlaneReadinessService() {
          if (stryMutAct_9fa48("12383")) {
            {}
          } else {
            stryCov_9fa48("12383");
            return self.controlPlaneReadinessService;
          }
        },
        get bootstrapReadinessState() {
          if (stryMutAct_9fa48("12384")) {
            {}
          } else {
            stryCov_9fa48("12384");
            return self.bootstrapReadinessState;
          }
        },
        get serviceLifecycleManager() {
          if (stryMutAct_9fa48("12385")) {
            {}
          } else {
            stryCov_9fa48("12385");
            return self.serviceLifecycleManager;
          }
        },
        get serviceReconciler() {
          if (stryMutAct_9fa48("12386")) {
            {}
          } else {
            stryCov_9fa48("12386");
            return self.serviceReconciler;
          }
        }
      });
      Object.defineProperties(this, stryMutAct_9fa48("12387") ? {} : (stryCov_9fa48("12387"), {
        runtimeDriverRegistry: stryMutAct_9fa48("12388") ? {} : (stryCov_9fa48("12388"), {
          configurable: stryMutAct_9fa48("12389") ? false : (stryCov_9fa48("12389"), true),
          enumerable: stryMutAct_9fa48("12390") ? false : (stryCov_9fa48("12390"), true),
          get: stryMutAct_9fa48("12391") ? () => undefined : (stryCov_9fa48("12391"), () => this.runtimeDependencyOwner.runtimeDriverRegistry)
        }),
        serviceRuntimeLifecycle: stryMutAct_9fa48("12392") ? {} : (stryCov_9fa48("12392"), {
          configurable: stryMutAct_9fa48("12393") ? false : (stryCov_9fa48("12393"), true),
          enumerable: stryMutAct_9fa48("12394") ? false : (stryCov_9fa48("12394"), true),
          get: stryMutAct_9fa48("12395") ? () => undefined : (stryCov_9fa48("12395"), () => this.runtimeDependencyOwner.serviceRuntimeLifecycle)
        })
      }));
      this.bootstrapApiOwner = stryMutAct_9fa48("12396") ? {} : (stryCov_9fa48("12396"), {
        get phase() {
          if (stryMutAct_9fa48("12397")) {
            {}
          } else {
            stryCov_9fa48("12397");
            return self.phase;
          }
        },
        get config() {
          if (stryMutAct_9fa48("12398")) {
            {}
          } else {
            stryCov_9fa48("12398");
            return self.config;
          }
        },
        get messageRouter() {
          if (stryMutAct_9fa48("12399")) {
            {}
          } else {
            stryCov_9fa48("12399");
            return self.messageRouter;
          }
        },
        waitForPartitionLeadership: stryMutAct_9fa48("12400") ? () => undefined : (stryCov_9fa48("12400"), () => self.waitForPartitionLeadership()),
        getEpochManager: stryMutAct_9fa48("12401") ? () => undefined : (stryCov_9fa48("12401"), () => self.getEpochManager())
      });
      this.runtimeDrivers = runtimeWiring.drivers;

      // CDC integration service for system table writes
      this.cdcIntegrationService = null;
      this.systemTableWriter = null;

      // RPC client for control plane dispatch
      this.rpcClient = null;

      // System table cache reference
      this.systemTableCache = null;
      // Table policy service for partition placement decisions
      this.tablePolicyService = null;
      // Latency topology owner bundle
      this.latencyTopology = null;

      // Assignment epoch manager for epoch-based partition assignments
      // Requirements: 3.4, 4.1 - Epoch-based initialization
      this.epochManager = null;

      // Bootstrap state
      this.phase = BootstrapPhase.NOT_STARTED;
      this.lifecycleStateMachine = new NodeLifecycleStateMachine(stryMutAct_9fa48("12402") ? {} : (stryCov_9fa48("12402"), {
        nodeId: this.nodeId,
        initialState: NodeState.STARTING
      }));
      this.startTime = null;
      this.phaseStartTime = null;
      this.servicesCreated = NUM.ZERO;
      this.partitionsCreated = NUM.ZERO;
      this.messageGroupsCreated = NUM.ZERO;

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE);
      this.logger.debug(BootstrapLog.RUNTIME_WIRING_READY, stryMutAct_9fa48("12403") ? {} : (stryCov_9fa48("12403"), {
        nodeId: this.nodeId,
        owner: stryMutAct_9fa48("12404") ? "" : (stryCov_9fa48("12404"), 'createRuntimeStartupWiring'),
        runtimeDriverCount: Object.keys(this.runtimeDrivers).length,
        ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled)
      }));
      this.nodeReadyRebalanceOwner = new BootstrapNodeReadyRebalanceOwner(stryMutAct_9fa48("12405") ? {} : (stryCov_9fa48("12405"), {
        delegates: stryMutAct_9fa48("12406") ? {} : (stryCov_9fa48("12406"), {
          getLogger: stryMutAct_9fa48("12407") ? () => undefined : (stryCov_9fa48("12407"), () => this.logger),
          getLocalNodeId: stryMutAct_9fa48("12408") ? () => undefined : (stryCov_9fa48("12408"), () => this.nodeId),
          isBootstrapNodeReadyRebalanceActive: stryMutAct_9fa48("12409") ? () => undefined : (stryCov_9fa48("12409"), () => stryMutAct_9fa48("12412") ? this.isShuttingDown !== true && this.phase !== BootstrapPhase.COMPLETE || this.phase !== BootstrapPhase.FAILED : stryMutAct_9fa48("12411") ? false : stryMutAct_9fa48("12410") ? true : (stryCov_9fa48("12410", "12411", "12412"), (stryMutAct_9fa48("12414") ? this.isShuttingDown !== true || this.phase !== BootstrapPhase.COMPLETE : stryMutAct_9fa48("12413") ? true : (stryCov_9fa48("12413", "12414"), (stryMutAct_9fa48("12416") ? this.isShuttingDown === true : stryMutAct_9fa48("12415") ? true : (stryCov_9fa48("12415", "12416"), this.isShuttingDown !== (stryMutAct_9fa48("12417") ? false : (stryCov_9fa48("12417"), true)))) && (stryMutAct_9fa48("12419") ? this.phase === BootstrapPhase.COMPLETE : stryMutAct_9fa48("12418") ? true : (stryCov_9fa48("12418", "12419"), this.phase !== BootstrapPhase.COMPLETE)))) && (stryMutAct_9fa48("12421") ? this.phase === BootstrapPhase.FAILED : stryMutAct_9fa48("12420") ? true : (stryCov_9fa48("12420", "12421"), this.phase !== BootstrapPhase.FAILED)))),
          getNodeReadyRebalanceDelayMs: stryMutAct_9fa48("12422") ? () => undefined : (stryCov_9fa48("12422"), () => this.nodeReadyRebalanceDelayMs),
          getPartitionServices: stryMutAct_9fa48("12423") ? () => undefined : (stryCov_9fa48("12423"), () => this.partitionServices),
          executeNodeReadyRebalance: reason => {
            if (stryMutAct_9fa48("12424")) {
              {}
            } else {
              stryCov_9fa48("12424");
              if (stryMutAct_9fa48("12426") ? false : stryMutAct_9fa48("12425") ? true : (stryCov_9fa48("12425", "12426"), Object.prototype.hasOwnProperty.call(this, stryMutAct_9fa48("12427") ? "" : (stryCov_9fa48("12427"), 'triggerRebalancingOnAllPartitions')))) {
                if (stryMutAct_9fa48("12428")) {
                  {}
                } else {
                  stryCov_9fa48("12428");
                  this.triggerRebalancingOnAllPartitions(reason);
                  return;
                }
              }
              this.nodeReadyRebalanceOwner.triggerRebalancingOnAllPartitions(reason);
            }
          }
        })
      }));
      this.runtimeHandoffOwner = new StartupRuntimeHandoffOwner(stryMutAct_9fa48("12429") ? {} : (stryCov_9fa48("12429"), {
        delegates: stryMutAct_9fa48("12430") ? {} : (stryCov_9fa48("12430"), {
          getCompatibilityService: stryMutAct_9fa48("12431") ? () => undefined : (stryCov_9fa48("12431"), () => this),
          isShuttingDown: stryMutAct_9fa48("12432") ? () => undefined : (stryCov_9fa48("12432"), () => stryMutAct_9fa48("12435") ? this.isShuttingDown !== true : stryMutAct_9fa48("12434") ? false : stryMutAct_9fa48("12433") ? true : (stryCov_9fa48("12433", "12434", "12435"), this.isShuttingDown === (stryMutAct_9fa48("12436") ? false : (stryCov_9fa48("12436"), true)))),
          getMetadataPublicationReadinessOptions: stryMutAct_9fa48("12437") ? () => undefined : (stryCov_9fa48("12437"), () => stryMutAct_9fa48("12438") ? {} : (stryCov_9fa48("12438"), {
            readinessState: this.bootstrapReadinessState,
            sleep: stryMutAct_9fa48("12439") ? () => undefined : (stryCov_9fa48("12439"), delayMs => this.sleep(delayMs)),
            onRetry: ({
              attempt,
              maxAttempts,
              delayMs,
              snapshot
            }) => {
              if (stryMutAct_9fa48("12440")) {
                {}
              } else {
                stryCov_9fa48("12440");
                this.logger.warn(stryMutAct_9fa48("12441") ? "" : (stryCov_9fa48("12441"), 'Retrying seed steady-state control-plane writers until lifecycle metadata publication readiness is satisfied'), stryMutAct_9fa48("12442") ? {} : (stryCov_9fa48("12442"), {
                  nodeId: this.nodeId,
                  attempt,
                  maxAttempts,
                  nextDelayMs: delayMs,
                  lifecycleReadiness: stryMutAct_9fa48("12445") ? snapshot && null : stryMutAct_9fa48("12444") ? false : stryMutAct_9fa48("12443") ? true : (stryCov_9fa48("12443", "12444", "12445"), snapshot || null)
                }));
              }
            }
          })),
          onMetadataPublicationReadinessDeferred: error => {
            if (stryMutAct_9fa48("12446")) {
              {}
            } else {
              stryCov_9fa48("12446");
              this.logger.warn(stryMutAct_9fa48("12447") ? "" : (stryCov_9fa48("12447"), 'Deferring seed steady-state control-plane writers until lifecycle metadata publication readiness is satisfied'), stryMutAct_9fa48("12448") ? {} : (stryCov_9fa48("12448"), {
                nodeId: this.nodeId,
                error: stryMutAct_9fa48("12451") ? error?.message && String(error) : stryMutAct_9fa48("12450") ? false : stryMutAct_9fa48("12449") ? true : (stryCov_9fa48("12449", "12450", "12451"), (stryMutAct_9fa48("12452") ? error.message : (stryCov_9fa48("12452"), error?.message)) || String(error)),
                lifecycleReadiness: stryMutAct_9fa48("12455") ? error?.lifecycleReadiness && null : stryMutAct_9fa48("12454") ? false : stryMutAct_9fa48("12453") ? true : (stryCov_9fa48("12453", "12454", "12455"), (stryMutAct_9fa48("12456") ? error.lifecycleReadiness : (stryCov_9fa48("12456"), error?.lifecycleReadiness)) || null)
              }));
            }
          },
          getLeaseService: stryMutAct_9fa48("12457") ? () => undefined : (stryCov_9fa48("12457"), () => this.leaseService),
          getLeaseRunningState: stryMutAct_9fa48("12458") ? () => undefined : (stryCov_9fa48("12458"), () => LEASE_STATE.RUNNING),
          getHeartbeatService: stryMutAct_9fa48("12459") ? () => undefined : (stryCov_9fa48("12459"), () => this.heartbeatService),
          buildHeartbeatStartOptions: stryMutAct_9fa48("12460") ? () => undefined : (stryCov_9fa48("12460"), () => stryMutAct_9fa48("12461") ? {} : (stryCov_9fa48("12461"), {
            nodeAddress: this.nodeAddress,
            getStats: stryMutAct_9fa48("12462") ? () => undefined : (stryCov_9fa48("12462"), () => NodeService.getInstance().getNodeStats())
          })),
          getHeartbeatRunningState: stryMutAct_9fa48("12463") ? () => undefined : (stryCov_9fa48("12463"), () => HEARTBEAT_STATE.RUNNING),
          activateDistributedTransactionRecovery: () => {
            if (stryMutAct_9fa48("12464")) {
              {}
            } else {
              stryCov_9fa48("12464");
              const sqlQueryEngine = this.sqlQueryEngine;
              if (stryMutAct_9fa48("12467") ? typeof sqlQueryEngine?.activateDistributedTransactionRecovery === 'function' : stryMutAct_9fa48("12466") ? false : stryMutAct_9fa48("12465") ? true : (stryCov_9fa48("12465", "12466", "12467"), typeof (stryMutAct_9fa48("12468") ? sqlQueryEngine.activateDistributedTransactionRecovery : (stryCov_9fa48("12468"), sqlQueryEngine?.activateDistributedTransactionRecovery)) !== (stryMutAct_9fa48("12469") ? "" : (stryCov_9fa48("12469"), 'function')))) {
                if (stryMutAct_9fa48("12470")) {
                  {}
                } else {
                  stryCov_9fa48("12470");
                  return;
                }
              }
              void sqlQueryEngine.activateDistributedTransactionRecovery();
            }
          },
          onControlPlaneBackgroundWritersActivated: () => {
            if (stryMutAct_9fa48("12471")) {
              {}
            } else {
              stryCov_9fa48("12471");
              this.logger.info(BootstrapLog.CONTROL_PLANE_BACKGROUND_WRITERS_ACTIVE, stryMutAct_9fa48("12472") ? {} : (stryCov_9fa48("12472"), {
                nodeId: this.nodeId
              }));
            }
          }
        })
      }));
      this.runtimeSurfaceOwner = new StartupRuntimeSurfaceOwner(stryMutAct_9fa48("12473") ? {} : (stryCov_9fa48("12473"), {
        delegates: stryMutAct_9fa48("12474") ? {} : (stryCov_9fa48("12474"), {
          getNodeId: stryMutAct_9fa48("12475") ? () => undefined : (stryCov_9fa48("12475"), () => this.nodeId),
          getOwner: stryMutAct_9fa48("12476") ? () => undefined : (stryCov_9fa48("12476"), () => this),
          getOnLocalAdminRuntimeReady: stryMutAct_9fa48("12477") ? () => undefined : (stryCov_9fa48("12477"), () => this.onLocalAdminRuntimeReady),
          getLocalAdminRuntimeReadyNotified: stryMutAct_9fa48("12478") ? () => undefined : (stryCov_9fa48("12478"), () => this.localAdminRuntimeReadyNotified),
          setLocalAdminRuntimeReadyNotified: value => {
            if (stryMutAct_9fa48("12479")) {
              {}
            } else {
              stryCov_9fa48("12479");
              this.localAdminRuntimeReadyNotified = stryMutAct_9fa48("12482") ? value !== true : stryMutAct_9fa48("12481") ? false : stryMutAct_9fa48("12480") ? true : (stryCov_9fa48("12480", "12481", "12482"), value === (stryMutAct_9fa48("12483") ? false : (stryCov_9fa48("12483"), true)));
            }
          },
          getSystemTableCache: stryMutAct_9fa48("12484") ? () => undefined : (stryCov_9fa48("12484"), () => this.getSystemTableCache()),
          getCacheMutationTarget: stryMutAct_9fa48("12485") ? () => undefined : (stryCov_9fa48("12485"), () => this.getSystemTableCache()),
          getMessageRouter: stryMutAct_9fa48("12486") ? () => undefined : (stryCov_9fa48("12486"), () => this.messageRouter),
          getPartitionServices: stryMutAct_9fa48("12487") ? () => undefined : (stryCov_9fa48("12487"), () => this.partitionServices),
          getMessageGroupServices: stryMutAct_9fa48("12488") ? () => undefined : (stryCov_9fa48("12488"), () => this.messageGroupServices),
          getTablePolicyService: stryMutAct_9fa48("12489") ? () => undefined : (stryCov_9fa48("12489"), () => this.tablePolicyService),
          getRebalanceCoordinator: stryMutAct_9fa48("12490") ? () => undefined : (stryCov_9fa48("12490"), () => this.rebalanceCoordinator)
        })
      }));
      this.seedPhaseOwners = createSeedPhaseOwners(this);
      this.partitionReplicaProgressReporter = new ReplicaCreationProgressReporter(stryMutAct_9fa48("12491") ? {} : (stryCov_9fa48("12491"), {
        logger: this.logger,
        formatLine: stryMutAct_9fa48("12492") ? () => undefined : (stryCov_9fa48("12492"), (progress, status, error) => this.seedPartitionsPhase.formatPartitionReplicaProgressLine(progress, status, error)),
        buildContext: stryMutAct_9fa48("12493") ? () => undefined : (stryCov_9fa48("12493"), (progress, status, error) => this.seedPartitionsPhase.buildPartitionReplicaProgressContext(progress, status, error))
      }));

      // Error tracking
      this.lastError = null;
      this.cleanupRequired = stryMutAct_9fa48("12494") ? true : (stryCov_9fa48("12494"), false);
      this.isShuttingDown = stryMutAct_9fa48("12495") ? true : (stryCov_9fa48("12495"), false);
      this.shutdownPromise = null;
      this.deferredLatencyTopologyStartHandle = null;
      this.deferredLatencyTopologyStartKind = null;

      // Build concern-scoped delegate bundles for extracted phase modules.
      // Each bundle groups delegates by concern (D2.2) so owners receive
      // only the dependencies they need.
      const delegateBundles = this._buildSeedDelegateBundles();
      const seedDelegates = this._composeSeedDelegates(delegateBundles);
      this.seedInfrastructurePhase = new SeedInfrastructurePhase(stryMutAct_9fa48("12496") ? {} : (stryCov_9fa48("12496"), {
        delegates: seedDelegates
      }));
      this.seedMessageGroupsPhase = new SeedMessageGroupsPhase(stryMutAct_9fa48("12497") ? {} : (stryCov_9fa48("12497"), {
        delegates: seedDelegates
      }));
      this.seedPartitionsPhase = new SeedPartitionsPhase(stryMutAct_9fa48("12498") ? {} : (stryCov_9fa48("12498"), {
        delegates: seedDelegates
      }));
      this.seedRegistrationPhase = new SeedRegistrationPhase(stryMutAct_9fa48("12499") ? {} : (stryCov_9fa48("12499"), {
        delegates: seedDelegates
      }));
      this.seedRegistrationRuntimeOwner = new SeedRegistrationRuntimeOwner(stryMutAct_9fa48("12500") ? {} : (stryCov_9fa48("12500"), {
        delegates: seedDelegates
      }));
      this.seedRuntimeBridgeOwner = new SeedRuntimeBridgeOwner(stryMutAct_9fa48("12501") ? {} : (stryCov_9fa48("12501"), {
        delegates: seedDelegates
      }));
      this.seedCacheHydrationPhase = new SeedCacheHydrationPhase(stryMutAct_9fa48("12502") ? {} : (stryCov_9fa48("12502"), {
        delegates: seedDelegates,
        runtimeBridgeOwner: this.seedRuntimeBridgeOwner
      }));
      this.seedRuntimeBridgeOwner.compatibilityPhase = this.seedCacheHydrationPhase;
      this.seedCleanupHandler = new SeedCleanupHandler(stryMutAct_9fa48("12503") ? {} : (stryCov_9fa48("12503"), {
        delegates: this._composeSeedDelegates(delegateBundles, stryMutAct_9fa48("12504") ? {} : (stryCov_9fa48("12504"), {
          cleanupOnly: stryMutAct_9fa48("12505") ? false : (stryCov_9fa48("12505"), true)
        }))
      }));
    }
  }

  /**
   * Build concern-scoped delegate bundles for extracted seed phase
   * modules (D2.2). Each bundle groups delegates by concern so
   * phase/readiness/cleanup owners receive only the dependencies
   * they need.
   * @return {Object} Keyed by SEED_DELEGATE_BUNDLE values.
   * @private
   */
  _buildSeedDelegateBundles() {
    if (stryMutAct_9fa48("12506")) {
      {}
    } else {
      stryCov_9fa48("12506");
      return stryMutAct_9fa48("12507") ? {} : (stryCov_9fa48("12507"), {
        [SEED_DELEGATE_BUNDLE.PHASE_EXECUTION]: this._buildPhaseExecutionDelegates(),
        [SEED_DELEGATE_BUNDLE.READINESS]: this._buildReadinessDelegates(),
        [SEED_DELEGATE_BUNDLE.CLEANUP]: this._buildCleanupDelegates(),
        [SEED_DELEGATE_BUNDLE.RUNTIME_WIRING]: this._buildRuntimeWiringDelegates()
      });
    }
  }

  /**
   * Compose a flat delegates object from concern-scoped bundles.
   * Phase owners consume the flat shape; the bundles provide
   * structural visibility into which concern owns each delegate.
   * @param {Object} bundles - Keyed by SEED_DELEGATE_BUNDLE.
   * @param {Object} [options] - Composition options.
   * @param {boolean} [options.cleanupOnly] - When true, compose
   *   only cleanup + readiness bundles (for SeedCleanupHandler).
   * @return {Object} Flat delegates object.
   * @private
   */
  _composeSeedDelegates(bundles, options = {}) {
    if (stryMutAct_9fa48("12508")) {
      {}
    } else {
      stryCov_9fa48("12508");
      if (stryMutAct_9fa48("12510") ? false : stryMutAct_9fa48("12509") ? true : (stryCov_9fa48("12509", "12510"), options.cleanupOnly)) {
        if (stryMutAct_9fa48("12511")) {
          {}
        } else {
          stryCov_9fa48("12511");
          return stryMutAct_9fa48("12512") ? {} : (stryCov_9fa48("12512"), {
            ...bundles[SEED_DELEGATE_BUNDLE.CLEANUP],
            ...bundles[SEED_DELEGATE_BUNDLE.READINESS]
          });
        }
      }
      return stryMutAct_9fa48("12513") ? {} : (stryCov_9fa48("12513"), {
        ...bundles[SEED_DELEGATE_BUNDLE.PHASE_EXECUTION],
        ...bundles[SEED_DELEGATE_BUNDLE.READINESS],
        ...bundles[SEED_DELEGATE_BUNDLE.CLEANUP],
        ...bundles[SEED_DELEGATE_BUNDLE.RUNTIME_WIRING]
      });
    }
  }

  /**
   * Phase execution delegates — accessors, mutators, collection
   * helpers, and phase-helper callbacks consumed by seed phase
   * owner modules (infrastructure, message groups, partitions,
   * registration, cache hydration).
   * @return {Object}
   * @private
   */
  _buildPhaseExecutionDelegates() {
    if (stryMutAct_9fa48("12514")) {
      {}
    } else {
      stryCov_9fa48("12514");
      const self = this;
      return stryMutAct_9fa48("12515") ? {} : (stryCov_9fa48("12515"), {
        // -- Core accessors --
        getNodeId: stryMutAct_9fa48("12516") ? () => undefined : (stryCov_9fa48("12516"), () => self.nodeId),
        getNodeAddress: stryMutAct_9fa48("12517") ? () => undefined : (stryCov_9fa48("12517"), () => self.nodeAddress),
        getAdvertisedNodeWsAddress: stryMutAct_9fa48("12518") ? () => undefined : (stryCov_9fa48("12518"), () => self.advertisedNodeWsAddress),
        getWsPort: stryMutAct_9fa48("12519") ? () => undefined : (stryCov_9fa48("12519"), () => self.wsPort),
        getConfig: stryMutAct_9fa48("12520") ? () => undefined : (stryCov_9fa48("12520"), () => self.config),
        getLogger: stryMutAct_9fa48("12521") ? () => undefined : (stryCov_9fa48("12521"), () => self.logger),
        getPhase: stryMutAct_9fa48("12522") ? () => undefined : (stryCov_9fa48("12522"), () => self.phase),
        getStartTime: stryMutAct_9fa48("12523") ? () => undefined : (stryCov_9fa48("12523"), () => self.startTime),
        getServicesCreated: stryMutAct_9fa48("12524") ? () => undefined : (stryCov_9fa48("12524"), () => self.servicesCreated),
        getPartitionsCreated: stryMutAct_9fa48("12525") ? () => undefined : (stryCov_9fa48("12525"), () => self.partitionsCreated),
        getMessageGroupsCreated: stryMutAct_9fa48("12526") ? () => undefined : (stryCov_9fa48("12526"), () => self.messageGroupsCreated),
        // -- Service collections --
        getMessageRouter: stryMutAct_9fa48("12527") ? () => undefined : (stryCov_9fa48("12527"), () => self.messageRouter),
        getTransport: stryMutAct_9fa48("12528") ? () => undefined : (stryCov_9fa48("12528"), () => self.transport),
        getMessageGroupServices: stryMutAct_9fa48("12529") ? () => undefined : (stryCov_9fa48("12529"), () => self.messageGroupServices),
        getPartitionServices: stryMutAct_9fa48("12530") ? () => undefined : (stryCov_9fa48("12530"), () => self.partitionServices),
        getMessageGroupReplicas: stryMutAct_9fa48("12531") ? () => undefined : (stryCov_9fa48("12531"), () => self.messageGroupReplicas),
        getPartitionReplicas: stryMutAct_9fa48("12532") ? () => undefined : (stryCov_9fa48("12532"), () => self.partitionReplicas),
        // -- Lifecycle owners --
        getServiceLifecycleManager: stryMutAct_9fa48("12533") ? () => undefined : (stryCov_9fa48("12533"), () => self.serviceLifecycleManager),
        getServiceReconciler: stryMutAct_9fa48("12534") ? () => undefined : (stryCov_9fa48("12534"), () => self.serviceReconciler),
        getServiceRuntimeLifecycle: stryMutAct_9fa48("12535") ? () => undefined : (stryCov_9fa48("12535"), () => self.serviceRuntimeLifecycle),
        getBootstrapDesiredServiceDefinitions: stryMutAct_9fa48("12536") ? () => undefined : (stryCov_9fa48("12536"), () => self.bootstrapDesiredServiceDefinitions),
        getBootstrapReplicaOptionsByServiceId: stryMutAct_9fa48("12537") ? () => undefined : (stryCov_9fa48("12537"), () => self.bootstrapReplicaOptionsByServiceId),
        // -- Service resolution --
        getLeaderMessageGroupService: stryMutAct_9fa48("12538") ? () => undefined : (stryCov_9fa48("12538"), options => self.getLeaderMessageGroupService(options)),
        getBootstrapMessageGroupService: stryMutAct_9fa48("12539") ? () => undefined : (stryCov_9fa48("12539"), () => self.getBootstrapMessageGroupService()),
        resolveOperationalMessageGroupSelection: stryMutAct_9fa48("12540") ? () => undefined : (stryCov_9fa48("12540"), options => self.resolveOperationalMessageGroupSelection(options)),
        resolveOperationalMessageGroupSelectionAsync: stryMutAct_9fa48("12541") ? () => undefined : (stryCov_9fa48("12541"), options => self.resolveOperationalMessageGroupSelectionAsync(options)),
        buildMessageGroupOwnerNotReadyError: stryMutAct_9fa48("12542") ? () => undefined : (stryCov_9fa48("12542"), (selection, options) => self.buildMessageGroupOwnerNotReadyError(selection, options)),
        // -- Runtime references --
        getSystemTableCache: stryMutAct_9fa48("12543") ? () => undefined : (stryCov_9fa48("12543"), () => self.getSystemTableCache()),
        getSystemTableCacheRef: stryMutAct_9fa48("12544") ? () => undefined : (stryCov_9fa48("12544"), () => self.systemTableCache),
        getCdcIntegrationService: stryMutAct_9fa48("12545") ? () => undefined : (stryCov_9fa48("12545"), () => self.cdcIntegrationService),
        getEpochManager: stryMutAct_9fa48("12546") ? () => undefined : (stryCov_9fa48("12546"), () => self.epochManager),
        getRebalanceCoordinator: stryMutAct_9fa48("12547") ? () => undefined : (stryCov_9fa48("12547"), () => self.rebalanceCoordinator),
        getLatencyTopology: stryMutAct_9fa48("12548") ? () => undefined : (stryCov_9fa48("12548"), () => self.latencyTopology),
        getSystemTableWriter: stryMutAct_9fa48("12549") ? () => undefined : (stryCov_9fa48("12549"), () => self.systemTableWriter),
        getTablePolicyService: stryMutAct_9fa48("12550") ? () => undefined : (stryCov_9fa48("12550"), () => self.tablePolicyService),
        getBootstrapReadinessState: stryMutAct_9fa48("12551") ? () => undefined : (stryCov_9fa48("12551"), () => self.bootstrapReadinessState),
        getPartitionReplicaProgressReporter: stryMutAct_9fa48("12552") ? () => undefined : (stryCov_9fa48("12552"), () => self.partitionReplicaProgressReporter),
        getInitialMessageGroupId: stryMutAct_9fa48("12553") ? () => undefined : (stryCov_9fa48("12553"), () => INITIAL_MESSAGE_GROUP_ID),
        // -- Mutators --
        setNodeId: v => {
          if (stryMutAct_9fa48("12554")) {
            {}
          } else {
            stryCov_9fa48("12554");
            self.nodeId = v;
          }
        },
        setNodeAddress: v => {
          if (stryMutAct_9fa48("12555")) {
            {}
          } else {
            stryCov_9fa48("12555");
            self.nodeAddress = v;
          }
        },
        setAdvertisedNodeWsAddress: v => {
          if (stryMutAct_9fa48("12556")) {
            {}
          } else {
            stryCov_9fa48("12556");
            self.advertisedNodeWsAddress = v;
          }
        },
        setMessageRouter: v => {
          if (stryMutAct_9fa48("12557")) {
            {}
          } else {
            stryCov_9fa48("12557");
            self.messageRouter = v;
          }
        },
        setTransport: v => {
          if (stryMutAct_9fa48("12558")) {
            {}
          } else {
            stryCov_9fa48("12558");
            self.transport = v;
          }
        },
        setServiceLifecycleManager: v => {
          if (stryMutAct_9fa48("12559")) {
            {}
          } else {
            stryCov_9fa48("12559");
            self.serviceLifecycleManager = v;
          }
        },
        setServiceReconciler: v => {
          if (stryMutAct_9fa48("12560")) {
            {}
          } else {
            stryCov_9fa48("12560");
            self.serviceReconciler = v;
          }
        },
        setPhase: v => {
          if (stryMutAct_9fa48("12561")) {
            {}
          } else {
            stryCov_9fa48("12561");
            self.phase = v;
          }
        },
        setPartitionsCreated: v => {
          if (stryMutAct_9fa48("12562")) {
            {}
          } else {
            stryCov_9fa48("12562");
            self.partitionsCreated = v;
          }
        },
        setEpochManager: v => {
          if (stryMutAct_9fa48("12563")) {
            {}
          } else {
            stryCov_9fa48("12563");
            self.epochManager = v;
          }
        },
        setSystemTableCacheRef: v => {
          if (stryMutAct_9fa48("12564")) {
            {}
          } else {
            stryCov_9fa48("12564");
            self.systemTableCache = v;
          }
        },
        setSystemTableWriter: v => {
          if (stryMutAct_9fa48("12565")) {
            {}
          } else {
            stryCov_9fa48("12565");
            self.systemTableWriter = v;
          }
        },
        setCdcIntegrationService: v => {
          if (stryMutAct_9fa48("12566")) {
            {}
          } else {
            stryCov_9fa48("12566");
            self.cdcIntegrationService = v;
          }
        },
        setRpcClient: v => {
          if (stryMutAct_9fa48("12567")) {
            {}
          } else {
            stryCov_9fa48("12567");
            self.rpcClient = v;
          }
        },
        setTablePolicyService: v => {
          if (stryMutAct_9fa48("12568")) {
            {}
          } else {
            stryCov_9fa48("12568");
            self.tablePolicyService = v;
          }
        },
        setLatencyTopology: v => {
          if (stryMutAct_9fa48("12569")) {
            {}
          } else {
            stryCov_9fa48("12569");
            self.latencyTopology = v;
          }
        },
        incrementServicesCreated: () => {
          if (stryMutAct_9fa48("12570")) {
            {}
          } else {
            stryCov_9fa48("12570");
            stryMutAct_9fa48("12571") ? self.servicesCreated-- : (stryCov_9fa48("12571"), self.servicesCreated++);
          }
        },
        incrementMessageGroupsCreated: () => {
          if (stryMutAct_9fa48("12572")) {
            {}
          } else {
            stryCov_9fa48("12572");
            stryMutAct_9fa48("12573") ? self.messageGroupsCreated-- : (stryCov_9fa48("12573"), self.messageGroupsCreated++);
          }
        },
        // -- Collection mutators --
        resetMessageGroupReplicas: () => {
          if (stryMutAct_9fa48("12574")) {
            {}
          } else {
            stryCov_9fa48("12574");
            self.messageGroupReplicas = stryMutAct_9fa48("12575") ? ["Stryker was here"] : (stryCov_9fa48("12575"), []);
          }
        },
        pushMessageGroupReplica: v => {
          if (stryMutAct_9fa48("12576")) {
            {}
          } else {
            stryCov_9fa48("12576");
            self.messageGroupReplicas.push(v);
          }
        },
        filterMessageGroupReplicas: exclude => {
          if (stryMutAct_9fa48("12577")) {
            {}
          } else {
            stryCov_9fa48("12577");
            self.messageGroupReplicas = stryMutAct_9fa48("12578") ? self.messageGroupReplicas : (stryCov_9fa48("12578"), self.messageGroupReplicas.filter(stryMutAct_9fa48("12579") ? () => undefined : (stryCov_9fa48("12579"), s => stryMutAct_9fa48("12582") ? s === exclude : stryMutAct_9fa48("12581") ? false : stryMutAct_9fa48("12580") ? true : (stryCov_9fa48("12580", "12581", "12582"), s !== exclude))));
          }
        },
        resetPartitionReplicas: () => {
          if (stryMutAct_9fa48("12583")) {
            {}
          } else {
            stryCov_9fa48("12583");
            self.partitionReplicas = stryMutAct_9fa48("12584") ? ["Stryker was here"] : (stryCov_9fa48("12584"), []);
          }
        },
        pushPartitionReplica: v => {
          if (stryMutAct_9fa48("12585")) {
            {}
          } else {
            stryCov_9fa48("12585");
            self.partitionReplicas.push(v);
          }
        },
        filterPartitionReplicas: exclude => {
          if (stryMutAct_9fa48("12586")) {
            {}
          } else {
            stryCov_9fa48("12586");
            self.partitionReplicas = stryMutAct_9fa48("12587") ? self.partitionReplicas : (stryCov_9fa48("12587"), self.partitionReplicas.filter(stryMutAct_9fa48("12588") ? () => undefined : (stryCov_9fa48("12588"), s => stryMutAct_9fa48("12591") ? s === exclude : stryMutAct_9fa48("12590") ? false : stryMutAct_9fa48("12589") ? true : (stryCov_9fa48("12589", "12590", "12591"), s !== exclude))));
          }
        },
        // -- Phase helper callbacks (D2.3: direct owner invocation) --
        createBootstrapServiceDescriptor: stryMutAct_9fa48("12592") ? () => undefined : (stryCov_9fa48("12592"), (serviceType, serviceId) => self.seedInfrastructurePhase.createBootstrapServiceDescriptor(serviceType, serviceId)),
        queueBootstrapServiceReplica: stryMutAct_9fa48("12593") ? () => undefined : (stryCov_9fa48("12593"), (descriptor, options) => self.seedInfrastructurePhase.queueBootstrapServiceReplica(descriptor, options)),
        resolveBootstrapReplicaOptions: stryMutAct_9fa48("12594") ? () => undefined : (stryCov_9fa48("12594"), (serviceId, serviceType) => self.seedInfrastructurePhase.resolveBootstrapReplicaOptions(serviceId, serviceType)),
        triggerBootstrapReconciler: stryMutAct_9fa48("12595") ? () => undefined : (stryCov_9fa48("12595"), reason => self.seedInfrastructurePhase.triggerBootstrapReconciler(reason)),
        createBootstrapMessageGroupReplica: stryMutAct_9fa48("12596") ? () => undefined : (stryCov_9fa48("12596"), context => self.seedMessageGroupsPhase.createBootstrapMessageGroupReplica(context)),
        startBootstrapMessageGroupReplica: stryMutAct_9fa48("12597") ? () => undefined : (stryCov_9fa48("12597"), (handle, context) => self.seedMessageGroupsPhase.startBootstrapMessageGroupReplica(handle, context)),
        stopBootstrapMessageGroupReplica: stryMutAct_9fa48("12598") ? () => undefined : (stryCov_9fa48("12598"), (handle, context) => self.seedMessageGroupsPhase.stopBootstrapMessageGroupReplica(handle, context)),
        createBootstrapPartitionReplica: stryMutAct_9fa48("12599") ? () => undefined : (stryCov_9fa48("12599"), context => self.seedPartitionsPhase.createBootstrapPartitionReplica(context)),
        startBootstrapPartitionReplica: stryMutAct_9fa48("12600") ? () => undefined : (stryCov_9fa48("12600"), (handle, context) => self.seedPartitionsPhase.startBootstrapPartitionReplica(handle, context)),
        stopBootstrapPartitionReplica: stryMutAct_9fa48("12601") ? () => undefined : (stryCov_9fa48("12601"), (handle, context) => self.seedPartitionsPhase.stopBootstrapPartitionReplica(handle, context)),
        waitForMessageGroupLeadership: stryMutAct_9fa48("12602") ? () => undefined : (stryCov_9fa48("12602"), (groupId, replicaIds) => self.seedMessageGroupsPhase.waitForMessageGroupLeadership(groupId, replicaIds)),
        waitForPartitionLeadership: stryMutAct_9fa48("12603") ? () => undefined : (stryCov_9fa48("12603"), options => self.seedPartitionsPhase.waitForPartitionLeadership(options)),
        stopUnifiedLifecycleOwners: stryMutAct_9fa48("12604") ? () => undefined : (stryCov_9fa48("12604"), () => self.seedInfrastructurePhase.stopUnifiedLifecycleOwners()),
        swapSystemTableWriter: stryMutAct_9fa48("12605") ? () => undefined : (stryCov_9fa48("12605"), () => self.seedRegistrationPhase.swapSystemTableWriter()),
        ensureBootstrapCdcIntegrationService: stryMutAct_9fa48("12606") ? () => undefined : (stryCov_9fa48("12606"), () => self.seedRuntimeBridgeOwner.ensureBootstrapCdcIntegrationService()),
        handleNodeReadyRebalanceTrigger: stryMutAct_9fa48("12607") ? () => undefined : (stryCov_9fa48("12607"), (cdcEvent, prevRow) => self.nodeReadyRebalanceOwner.handleNodeReadyRebalanceTrigger(cdcEvent, prevRow)),
        propagatePartitionCDCEvent: stryMutAct_9fa48("12608") ? () => undefined : (stryCov_9fa48("12608"), (mgs, cdcEvent) => self.seedRuntimeBridgeOwner.propagatePartitionCDCEvent(mgs, cdcEvent)),
        resolveCdcPropagationMessageGroup: stryMutAct_9fa48("12609") ? () => undefined : (stryCov_9fa48("12609"), preferred => self.seedCacheHydrationPhase.resolveCdcPropagationMessageGroup(preferred)),
        applyCurrentEpochFromCache: stryMutAct_9fa48("12610") ? () => undefined : (stryCov_9fa48("12610"), () => self.seedRuntimeBridgeOwner.applyCurrentEpochFromCache()),
        hydrateFromLocalPartitions: stryMutAct_9fa48("12611") ? () => undefined : (stryCov_9fa48("12611"), (stc, mg) => self.seedCacheHydrationPhase.hydrateFromLocalPartitions(stc, mg)),
        createCdcPipelineReadinessGate: stryMutAct_9fa48("12612") ? () => undefined : (stryCov_9fa48("12612"), stc => self.seedRuntimeBridgeOwner.createCdcPipelineReadinessGate(stc)),
        emit: stryMutAct_9fa48("12613") ? () => undefined : (stryCov_9fa48("12613"), (event, data) => self.emit(event, data)),
        sleep: stryMutAct_9fa48("12614") ? () => undefined : (stryCov_9fa48("12614"), ms => self.sleep(ms)),
        // -- Partition DB path resolution --
        resolvePartitionDbPath: (partitionId, replicaId) => {
          if (stryMutAct_9fa48("12615")) {
            {}
          } else {
            stryCov_9fa48("12615");
            if (stryMutAct_9fa48("12618") ? self.dataDirectoryManager || self.dataDirectoryManager.isInitialized() : stryMutAct_9fa48("12617") ? false : stryMutAct_9fa48("12616") ? true : (stryCov_9fa48("12616", "12617", "12618"), self.dataDirectoryManager && self.dataDirectoryManager.isInitialized())) {
              if (stryMutAct_9fa48("12619")) {
                {}
              } else {
                stryCov_9fa48("12619");
                return self.dataDirectoryManager.getPartitionDbPath(partitionId, replicaId);
              }
            } else if (stryMutAct_9fa48("12621") ? false : stryMutAct_9fa48("12620") ? true : (stryCov_9fa48("12620", "12621"), self.config.partitionDbPath)) {
              if (stryMutAct_9fa48("12622")) {
                {}
              } else {
                stryCov_9fa48("12622");
                return self.config.partitionDbPath;
              }
            }
            return BOOTSTRAP_DEFAULT.partitionDbPath;
          }
        }
      });
    }
  }

  /**
   * Readiness delegates — lifecycle and readiness state accessors
   * consumed by readiness evaluation and cleanup owners.
   * @return {Object}
   * @private
   */
  _buildReadinessDelegates() {
    if (stryMutAct_9fa48("12623")) {
      {}
    } else {
      stryCov_9fa48("12623");
      const self = this;
      return stryMutAct_9fa48("12624") ? {} : (stryCov_9fa48("12624"), {
        getLifecycleStateMachine: stryMutAct_9fa48("12625") ? () => undefined : (stryCov_9fa48("12625"), () => self.lifecycleStateMachine),
        getBootstrapReadinessState: stryMutAct_9fa48("12626") ? () => undefined : (stryCov_9fa48("12626"), () => self.bootstrapReadinessState)
      });
    }
  }

  /**
   * Cleanup delegates — teardown helpers, state clearers, and
   * diagnostic accessors consumed by SeedCleanupHandler.
   * @return {Object}
   * @private
   */
  _buildCleanupDelegates() {
    if (stryMutAct_9fa48("12627")) {
      {}
    } else {
      stryCov_9fa48("12627");
      const self = this;
      return stryMutAct_9fa48("12628") ? {} : (stryCov_9fa48("12628"), {
        // -- Core accessors needed for cleanup diagnostics --
        getNodeId: stryMutAct_9fa48("12629") ? () => undefined : (stryCov_9fa48("12629"), () => self.nodeId),
        getLogger: stryMutAct_9fa48("12630") ? () => undefined : (stryCov_9fa48("12630"), () => self.logger),
        getPhase: stryMutAct_9fa48("12631") ? () => undefined : (stryCov_9fa48("12631"), () => self.phase),
        getStartTime: stryMutAct_9fa48("12632") ? () => undefined : (stryCov_9fa48("12632"), () => self.startTime),
        getServicesCreated: stryMutAct_9fa48("12633") ? () => undefined : (stryCov_9fa48("12633"), () => self.servicesCreated),
        getMessageGroupsCreated: stryMutAct_9fa48("12634") ? () => undefined : (stryCov_9fa48("12634"), () => self.messageGroupsCreated),
        getInitialMessageGroupId: stryMutAct_9fa48("12635") ? () => undefined : (stryCov_9fa48("12635"), () => INITIAL_MESSAGE_GROUP_ID),
        // -- Service collections --
        getMessageGroupServices: stryMutAct_9fa48("12636") ? () => undefined : (stryCov_9fa48("12636"), () => self.messageGroupServices),
        getPartitionServices: stryMutAct_9fa48("12637") ? () => undefined : (stryCov_9fa48("12637"), () => self.partitionServices),
        getMessageRouter: stryMutAct_9fa48("12638") ? () => undefined : (stryCov_9fa48("12638"), () => self.messageRouter),
        getTransport: stryMutAct_9fa48("12639") ? () => undefined : (stryCov_9fa48("12639"), () => self.transport),
        // -- Runtime references --
        getSystemTableCacheRef: stryMutAct_9fa48("12640") ? () => undefined : (stryCov_9fa48("12640"), () => self.systemTableCache),
        getSystemTableCacheSafe: stryMutAct_9fa48("12641") ? () => undefined : (stryCov_9fa48("12641"), () => self._getSystemTableCacheSafe()),
        getSystemTableWriter: stryMutAct_9fa48("12642") ? () => undefined : (stryCov_9fa48("12642"), () => self.systemTableWriter),
        getRebalanceCoordinator: stryMutAct_9fa48("12643") ? () => undefined : (stryCov_9fa48("12643"), () => self.rebalanceCoordinator),
        getLatencyTopology: stryMutAct_9fa48("12644") ? () => undefined : (stryCov_9fa48("12644"), () => self.latencyTopology),
        // -- State mutators --
        setPhase: v => {
          if (stryMutAct_9fa48("12645")) {
            {}
          } else {
            stryCov_9fa48("12645");
            self.phase = v;
          }
        },
        setLastError: v => {
          if (stryMutAct_9fa48("12646")) {
            {}
          } else {
            stryCov_9fa48("12646");
            self.lastError = v;
          }
        },
        setIsShuttingDown: v => {
          if (stryMutAct_9fa48("12647")) {
            {}
          } else {
            stryCov_9fa48("12647");
            self.isShuttingDown = v;
          }
        },
        setMessageRouter: v => {
          if (stryMutAct_9fa48("12648")) {
            {}
          } else {
            stryCov_9fa48("12648");
            self.messageRouter = v;
          }
        },
        setTransport: v => {
          if (stryMutAct_9fa48("12649")) {
            {}
          } else {
            stryCov_9fa48("12649");
            self.transport = v;
          }
        },
        setSystemTableCacheRef: v => {
          if (stryMutAct_9fa48("12650")) {
            {}
          } else {
            stryCov_9fa48("12650");
            self.systemTableCache = v;
          }
        },
        setSystemTableWriter: v => {
          if (stryMutAct_9fa48("12651")) {
            {}
          } else {
            stryCov_9fa48("12651");
            self.systemTableWriter = v;
          }
        },
        setLatencyTopology: v => {
          if (stryMutAct_9fa48("12652")) {
            {}
          } else {
            stryCov_9fa48("12652");
            self.latencyTopology = v;
          }
        },
        // -- Collection mutators --
        resetMessageGroupReplicas: () => {
          if (stryMutAct_9fa48("12653")) {
            {}
          } else {
            stryCov_9fa48("12653");
            self.messageGroupReplicas = stryMutAct_9fa48("12654") ? ["Stryker was here"] : (stryCov_9fa48("12654"), []);
          }
        },
        resetPartitionReplicas: () => {
          if (stryMutAct_9fa48("12655")) {
            {}
          } else {
            stryCov_9fa48("12655");
            self.partitionReplicas = stryMutAct_9fa48("12656") ? ["Stryker was here"] : (stryCov_9fa48("12656"), []);
          }
        },
        // -- Phase helper callbacks (D2.3: direct owner invocation) --
        stopUnifiedLifecycleOwners: stryMutAct_9fa48("12657") ? () => undefined : (stryCov_9fa48("12657"), () => self.seedInfrastructurePhase.stopUnifiedLifecycleOwners()),
        emit: stryMutAct_9fa48("12658") ? () => undefined : (stryCov_9fa48("12658"), (event, data) => self.emit(event, data)),
        // -- Resource teardown helpers --
        clearCdcIntegrationService: () => {
          if (stryMutAct_9fa48("12659")) {
            {}
          } else {
            stryCov_9fa48("12659");
            self.cdcIntegrationService = null;
          }
        },
        stopAndClearControlPlaneServices: () => {
          if (stryMutAct_9fa48("12660")) {
            {}
          } else {
            stryCov_9fa48("12660");
            if (stryMutAct_9fa48("12662") ? false : stryMutAct_9fa48("12661") ? true : (stryCov_9fa48("12661", "12662"), self.heartbeatService)) {
              if (stryMutAct_9fa48("12663")) {
                {}
              } else {
                stryCov_9fa48("12663");
                self.heartbeatService.stop();
                self.heartbeatService = null;
              }
            }
            if (stryMutAct_9fa48("12665") ? false : stryMutAct_9fa48("12664") ? true : (stryCov_9fa48("12664", "12665"), self.leaseService)) {
              if (stryMutAct_9fa48("12666")) {
                {}
              } else {
                stryCov_9fa48("12666");
                self.leaseService.stop();
                self.leaseService = null;
              }
            }
            if (stryMutAct_9fa48("12668") ? false : stryMutAct_9fa48("12667") ? true : (stryCov_9fa48("12667", "12668"), self.endpointService)) {
              if (stryMutAct_9fa48("12669")) {
                {}
              } else {
                stryCov_9fa48("12669");
                self.endpointService.stop();
                self.endpointService = null;
              }
            }
            if (stryMutAct_9fa48("12671") ? false : stryMutAct_9fa48("12670") ? true : (stryCov_9fa48("12670", "12671"), self.dispatchService)) {
              if (stryMutAct_9fa48("12672")) {
                {}
              } else {
                stryCov_9fa48("12672");
                self.dispatchService.stop();
                self.dispatchService = null;
              }
            }
          }
        },
        clearRpcClient: async () => {
          if (stryMutAct_9fa48("12673")) {
            {}
          } else {
            stryCov_9fa48("12673");
            if (stryMutAct_9fa48("12675") ? false : stryMutAct_9fa48("12674") ? true : (stryCov_9fa48("12674", "12675"), self.rpcClient)) {
              if (stryMutAct_9fa48("12676")) {
                {}
              } else {
                stryCov_9fa48("12676");
                await self.rpcClient.shutdown();
                self.rpcClient = null;
              }
            }
          }
        },
        clearRuntimeServiceHandler: async () => {
          if (stryMutAct_9fa48("12677")) {
            {}
          } else {
            stryCov_9fa48("12677");
            if (stryMutAct_9fa48("12679") ? false : stryMutAct_9fa48("12678") ? true : (stryCov_9fa48("12678", "12679"), self.runtimeServiceHandler)) {
              if (stryMutAct_9fa48("12680")) {
                {}
              } else {
                stryCov_9fa48("12680");
                self.runtimeServiceHandler.unregisterFromRouter(self.messageRouter);
                await self.runtimeServiceHandler.shutdown();
                self.runtimeServiceHandler = null;
              }
            }
          }
        },
        clearReplicaStateMachine: () => {
          if (stryMutAct_9fa48("12681")) {
            {}
          } else {
            stryCov_9fa48("12681");
            if (stryMutAct_9fa48("12683") ? false : stryMutAct_9fa48("12682") ? true : (stryCov_9fa48("12682", "12683"), self.replicaStateMachine)) {
              if (stryMutAct_9fa48("12684")) {
                {}
              } else {
                stryCov_9fa48("12684");
                self.replicaStateMachine.stopTimeoutChecker();
                self.replicaStateMachine.clear();
                self.replicaStateMachine = null;
              }
            }
          }
        },
        clearEpochManager: () => {
          if (stryMutAct_9fa48("12685")) {
            {}
          } else {
            stryCov_9fa48("12685");
            self.epochManager = null;
          }
        },
        clearReplicaHandler: async () => {
          if (stryMutAct_9fa48("12686")) {
            {}
          } else {
            stryCov_9fa48("12686");
            if (stryMutAct_9fa48("12688") ? false : stryMutAct_9fa48("12687") ? true : (stryCov_9fa48("12687", "12688"), self.replicaHandler)) {
              if (stryMutAct_9fa48("12689")) {
                {}
              } else {
                stryCov_9fa48("12689");
                self.replicaHandler.unregisterFromRouter(self.messageRouter);
                await self.replicaHandler.shutdown();
                self.replicaHandler = null;
              }
            }
          }
        },
        clearTablePolicyService: () => {
          if (stryMutAct_9fa48("12690")) {
            {}
          } else {
            stryCov_9fa48("12690");
            self.tablePolicyService = null;
          }
        },
        clearRebalanceCoordinator: () => {
          if (stryMutAct_9fa48("12691")) {
            {}
          } else {
            stryCov_9fa48("12691");
            self.rebalanceCoordinator = null;
          }
        },
        clearNodeReadyRebalanceState: () => {
          if (stryMutAct_9fa48("12692")) {
            {}
          } else {
            stryCov_9fa48("12692");
            self.nodeReadyRebalanceOwner.clearNodeReadyRebalanceState();
          }
        }
      });
    }
  }

  /**
   * Runtime wiring delegates — post-phase wiring accessors
   * consumed by runtime hydration and control-plane setup.
   * @return {Object}
   * @private
   */
  _buildRuntimeWiringDelegates() {
    if (stryMutAct_9fa48("12693")) {
      {}
    } else {
      stryCov_9fa48("12693");
      const self = this;
      return stryMutAct_9fa48("12694") ? {} : (stryCov_9fa48("12694"), {
        getSystemTableCache: stryMutAct_9fa48("12695") ? () => undefined : (stryCov_9fa48("12695"), () => self.getSystemTableCache()),
        getMessageRouter: stryMutAct_9fa48("12696") ? () => undefined : (stryCov_9fa48("12696"), () => self.messageRouter),
        getRebalanceCoordinator: stryMutAct_9fa48("12697") ? () => undefined : (stryCov_9fa48("12697"), () => self.rebalanceCoordinator),
        getCdcIntegrationService: stryMutAct_9fa48("12698") ? () => undefined : (stryCov_9fa48("12698"), () => self.cdcIntegrationService),
        getEpochManager: stryMutAct_9fa48("12699") ? () => undefined : (stryCov_9fa48("12699"), () => self.epochManager)
      });
    }
  }

  /**
   * Execute the full bootstrap process.
   * @return {Promise<Object>} Bootstrap result.
   */
  async bootstrap() {
    if (stryMutAct_9fa48("12700")) {
      {}
    } else {
      stryCov_9fa48("12700");
      this.startTime = Date.now();
      this.logger.info(BootstrapLog.STARTING, stryMutAct_9fa48("12701") ? {} : (stryCov_9fa48("12701"), {
        nodeId: this.nodeId,
        phase: BootstrapPhase.NOT_STARTED
      }));
      try {
        if (stryMutAct_9fa48("12702")) {
          {}
        } else {
          stryCov_9fa48("12702");
          const startupPipelineRunner = new StartupPipelineRunner(stryMutAct_9fa48("12703") ? {} : (stryCov_9fa48("12703"), {
            logger: this.logger,
            eventSink: this
          }));
          const seedPlan = createSeedStartupPlan(this);
          await startupPipelineRunner.run(stryMutAct_9fa48("12704") ? {} : (stryCov_9fa48("12704"), {
            phases: seedPlan.phases
          }));
          this.logger.info(stryMutAct_9fa48("12705") ? "" : (stryCov_9fa48("12705"), 'metrics.bootstrap.post_pipeline.start'), stryMutAct_9fa48("12706") ? {} : (stryCov_9fa48("12706"), {
            nodeId: this.nodeId
          }));

          // Initialize replica handler after all services are ready
          const replicaHandlerStartMs = Date.now();
          this.initializeReplicaHandler();
          this.logger.info(stryMutAct_9fa48("12707") ? "" : (stryCov_9fa48("12707"), 'metrics.bootstrap.post_pipeline.replica_handler'), stryMutAct_9fa48("12708") ? {} : (stryCov_9fa48("12708"), {
            nodeId: this.nodeId,
            durationMs: stryMutAct_9fa48("12709") ? Date.now() + replicaHandlerStartMs : (stryCov_9fa48("12709"), Date.now() - replicaHandlerStartMs)
          }));
          const messageGroupHandlerStartMs = Date.now();
          this.initializeMessageGroupServiceHandler();
          this.logger.info(stryMutAct_9fa48("12710") ? "" : (stryCov_9fa48("12710"), 'metrics.bootstrap.post_pipeline.message_group_handler'), stryMutAct_9fa48("12711") ? {} : (stryCov_9fa48("12711"), {
            nodeId: this.nodeId,
            durationMs: stryMutAct_9fa48("12712") ? Date.now() + messageGroupHandlerStartMs : (stryCov_9fa48("12712"), Date.now() - messageGroupHandlerStartMs)
          }));

          // Initialize control plane service after cache and handlers are ready
          const controlPlaneStartMs = Date.now();
          await this.initializeControlPlaneService();
          this.logger.info(stryMutAct_9fa48("12713") ? "" : (stryCov_9fa48("12713"), 'metrics.bootstrap.post_pipeline.control_plane'), stryMutAct_9fa48("12714") ? {} : (stryCov_9fa48("12714"), {
            nodeId: this.nodeId,
            durationMs: stryMutAct_9fa48("12715") ? Date.now() + controlPlaneStartMs : (stryCov_9fa48("12715"), Date.now() - controlPlaneStartMs)
          }));
          await this.notifyLocalAdminRuntimeReady();
          const registerSeedStartMs = Date.now();
          await this.registerSeedNodeWithControlPlane();
          this.logger.info(stryMutAct_9fa48("12716") ? "" : (stryCov_9fa48("12716"), 'metrics.bootstrap.post_pipeline.seed_registration'), stryMutAct_9fa48("12717") ? {} : (stryCov_9fa48("12717"), {
            nodeId: this.nodeId,
            durationMs: stryMutAct_9fa48("12718") ? Date.now() + registerSeedStartMs : (stryCov_9fa48("12718"), Date.now() - registerSeedStartMs)
          }));
          await this.activateMessageGroupServiceRows();

          // Start latency topology lifecycle asynchronously so REST bootstrap API
          // can come up without being blocked by topology/rebalancer warm-up.
          const topologyStartMs = Date.now();
          const startTopologyAsync = () => {
            if (stryMutAct_9fa48("12719")) {
              {}
            } else {
              stryCov_9fa48("12719");
              this.deferredLatencyTopologyStartHandle = null;
              this.deferredLatencyTopologyStartKind = null;
              if (stryMutAct_9fa48("12722") ? this.isShuttingDown !== true : stryMutAct_9fa48("12721") ? false : stryMutAct_9fa48("12720") ? true : (stryCov_9fa48("12720", "12721", "12722"), this.isShuttingDown === (stryMutAct_9fa48("12723") ? false : (stryCov_9fa48("12723"), true)))) {
                if (stryMutAct_9fa48("12724")) {
                  {}
                } else {
                  stryCov_9fa48("12724");
                  return;
                }
              }
              try {
                if (stryMutAct_9fa48("12725")) {
                  {}
                } else {
                  stryCov_9fa48("12725");
                  this.seedRuntimeBridgeOwner.startLatencyTopologyLifecycle();
                  this.logger.info(stryMutAct_9fa48("12726") ? "" : (stryCov_9fa48("12726"), 'metrics.bootstrap.post_pipeline.latency_topology'), stryMutAct_9fa48("12727") ? {} : (stryCov_9fa48("12727"), {
                    nodeId: this.nodeId,
                    durationMs: stryMutAct_9fa48("12728") ? Date.now() + topologyStartMs : (stryCov_9fa48("12728"), Date.now() - topologyStartMs),
                    deferred: stryMutAct_9fa48("12729") ? false : (stryCov_9fa48("12729"), true)
                  }));
                }
              } catch (error) {
                if (stryMutAct_9fa48("12730")) {
                  {}
                } else {
                  stryCov_9fa48("12730");
                  this.logger.warn(stryMutAct_9fa48("12731") ? "" : (stryCov_9fa48("12731"), 'Deferred latency topology lifecycle start failed'), stryMutAct_9fa48("12732") ? {} : (stryCov_9fa48("12732"), {
                    nodeId: this.nodeId,
                    error: error.message
                  }));
                }
              }
            }
          };
          if (stryMutAct_9fa48("12735") ? typeof setImmediate !== 'function' : stryMutAct_9fa48("12734") ? false : stryMutAct_9fa48("12733") ? true : (stryCov_9fa48("12733", "12734", "12735"), typeof setImmediate === (stryMutAct_9fa48("12736") ? "" : (stryCov_9fa48("12736"), 'function')))) {
            if (stryMutAct_9fa48("12737")) {
              {}
            } else {
              stryCov_9fa48("12737");
              this.deferredLatencyTopologyStartKind = stryMutAct_9fa48("12738") ? "" : (stryCov_9fa48("12738"), 'immediate');
              this.deferredLatencyTopologyStartHandle = setImmediate(startTopologyAsync);
            }
          } else {
            if (stryMutAct_9fa48("12739")) {
              {}
            } else {
              stryCov_9fa48("12739");
              this.deferredLatencyTopologyStartKind = stryMutAct_9fa48("12740") ? "" : (stryCov_9fa48("12740"), 'timeout');
              this.deferredLatencyTopologyStartHandle = setTimeout(startTopologyAsync, 0);
            }
          }

          // Initialize runtime service handler AFTER control-plane readiness.
          // PG wire startup failure is isolated and does not abort bootstrap.
          const runtimeHandlerStartMs = Date.now();
          this.initializeRuntimeServiceHandler();
          this.logger.info(stryMutAct_9fa48("12741") ? "" : (stryCov_9fa48("12741"), 'metrics.bootstrap.post_pipeline.runtime_handler'), stryMutAct_9fa48("12742") ? {} : (stryCov_9fa48("12742"), {
            nodeId: this.nodeId,
            durationMs: stryMutAct_9fa48("12743") ? Date.now() + runtimeHandlerStartMs : (stryCov_9fa48("12743"), Date.now() - runtimeHandlerStartMs)
          }));

          // Bootstrap complete
          const currentState = this.lifecycleStateMachine.getState();
          if (stryMutAct_9fa48("12746") ? currentState === NodeState.CONNECTING : stryMutAct_9fa48("12745") ? false : stryMutAct_9fa48("12744") ? true : (stryCov_9fa48("12744", "12745", "12746"), currentState !== NodeState.CONNECTING)) {
            if (stryMutAct_9fa48("12747")) {
              {}
            } else {
              stryCov_9fa48("12747");
              // Terminal sub-phase auto-advances to CONNECTING,
              // but if it hasn't happened yet, force it
              this.lifecycleStateMachine.transition(NodeState.CONNECTING);
            }
          }
          this.phase = BootstrapPhase.COMPLETE;
          this.clearNodeReadyRebalanceState();
          activateSteadyStateRuntimeHandoff(stryMutAct_9fa48("12748") ? {} : (stryCov_9fa48("12748"), {
            owner: this.runtimeHandoffOwner,
            activateControlPlaneBackgroundWriters: stryMutAct_9fa48("12749") ? false : (stryCov_9fa48("12749"), true)
          }));
          const duration = stryMutAct_9fa48("12750") ? Date.now() + this.startTime : (stryCov_9fa48("12750"), Date.now() - this.startTime);
          this.logger.info(BootstrapLog.COMPLETED, stryMutAct_9fa48("12751") ? {} : (stryCov_9fa48("12751"), {
            nodeId: this.nodeId,
            duration,
            servicesCreated: this.servicesCreated,
            partitionsCreated: this.partitionsCreated,
            messageGroupsCreated: this.messageGroupsCreated
          }));
          this.emit(BootstrapEvent.COMPLETE, stryMutAct_9fa48("12752") ? {} : (stryCov_9fa48("12752"), {
            nodeId: this.nodeId,
            duration,
            servicesCreated: this.servicesCreated,
            partitionsCreated: this.partitionsCreated,
            messageGroupsCreated: this.messageGroupsCreated
          }));
          return stryMutAct_9fa48("12753") ? {} : (stryCov_9fa48("12753"), {
            success: stryMutAct_9fa48("12754") ? false : (stryCov_9fa48("12754"), true),
            nodeId: this.nodeId,
            duration,
            servicesCreated: this.servicesCreated,
            partitionsCreated: this.partitionsCreated,
            messageGroupsCreated: this.messageGroupsCreated,
            messageGroupServices: this.messageGroupServices,
            partitionServices: this.partitionServices,
            replicaHandler: this.replicaHandler,
            replicaStateMachine: this.replicaStateMachine,
            epochManager: this.epochManager,
            transport: this.transport,
            messageRouter: this.messageRouter
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("12755")) {
          {}
        } else {
          stryCov_9fa48("12755");
          return this.handleBootstrapFailure(error);
        }
      }
    }
  }

  /**
   * Execute a bootstrap phase with logging and timing.
   * @param {string} phaseName - Phase name.
   * @param {Function} phaseFunction - Phase implementation function.
   * @return {Promise<void>}
   * @private
   */
  async executePhase(phaseName, phaseFunction) {
    if (stryMutAct_9fa48("12756")) {
      {}
    } else {
      stryCov_9fa48("12756");
      const subPhase = PHASE_TO_SUB_PHASE[phaseName];
      if (stryMutAct_9fa48("12758") ? false : stryMutAct_9fa48("12757") ? true : (stryCov_9fa48("12757", "12758"), subPhase)) {
        if (stryMutAct_9fa48("12759")) {
          {}
        } else {
          stryCov_9fa48("12759");
          const currentSubPhase = this.lifecycleStateMachine.getSubPhase();
          if (stryMutAct_9fa48("12762") ? currentSubPhase === subPhase : stryMutAct_9fa48("12761") ? false : stryMutAct_9fa48("12760") ? true : (stryCov_9fa48("12760", "12761", "12762"), currentSubPhase !== subPhase)) {
            if (stryMutAct_9fa48("12763")) {
              {}
            } else {
              stryCov_9fa48("12763");
              this.lifecycleStateMachine.transitionSubPhase(subPhase);
            }
          }
        }
      }
      this.phase = phaseName;
      this.phaseStartTime = Date.now();
      const state = this.lifecycleStateMachine.getState();
      const activeSubPhase = stryMutAct_9fa48("12766") ? this.lifecycleStateMachine.getSubPhase() && null : stryMutAct_9fa48("12765") ? false : stryMutAct_9fa48("12764") ? true : (stryCov_9fa48("12764", "12765", "12766"), this.lifecycleStateMachine.getSubPhase() || null);
      this.logger.info(BootstrapLog.PHASE_STARTING, stryMutAct_9fa48("12767") ? {} : (stryCov_9fa48("12767"), {
        nodeId: this.nodeId,
        state,
        phase: phaseName,
        subPhase: activeSubPhase,
        servicesCreated: this.servicesCreated
      }));
      this.emit(BootstrapEvent.PHASE_START, stryMutAct_9fa48("12768") ? {} : (stryCov_9fa48("12768"), {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase
      }));
      this.emit(stryMutAct_9fa48("12769") ? "" : (stryCov_9fa48("12769"), 'phase:start'), stryMutAct_9fa48("12770") ? {} : (stryCov_9fa48("12770"), {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase
      }));
      try {
        if (stryMutAct_9fa48("12771")) {
          {}
        } else {
          stryCov_9fa48("12771");
          await this.workClassScheduler.enqueue(WORK_CLASS.A, async () => {
            if (stryMutAct_9fa48("12772")) {
              {}
            } else {
              stryCov_9fa48("12772");
              await phaseFunction();
            }
          });
          const phaseDuration = stryMutAct_9fa48("12773") ? Date.now() + this.phaseStartTime : (stryCov_9fa48("12773"), Date.now() - this.phaseStartTime);
          this.logger.info(BootstrapLog.PHASE_COMPLETED, stryMutAct_9fa48("12774") ? {} : (stryCov_9fa48("12774"), {
            nodeId: this.nodeId,
            state,
            phase: phaseName,
            subPhase: activeSubPhase,
            duration: phaseDuration,
            servicesCreated: this.servicesCreated
          }));
          this.emit(BootstrapEvent.PHASE_COMPLETE, stryMutAct_9fa48("12775") ? {} : (stryCov_9fa48("12775"), {
            phase: phaseName,
            nodeId: this.nodeId,
            state,
            subPhase: activeSubPhase,
            duration: phaseDuration
          }));
          this.emit(stryMutAct_9fa48("12776") ? "" : (stryCov_9fa48("12776"), 'phase:complete'), stryMutAct_9fa48("12777") ? {} : (stryCov_9fa48("12777"), {
            phase: phaseName,
            nodeId: this.nodeId,
            state,
            subPhase: activeSubPhase,
            duration: phaseDuration
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("12778")) {
          {}
        } else {
          stryCov_9fa48("12778");
          const phaseDuration = stryMutAct_9fa48("12779") ? Date.now() + this.phaseStartTime : (stryCov_9fa48("12779"), Date.now() - this.phaseStartTime);
          this.logger.error(BootstrapLog.PHASE_FAILED, stryMutAct_9fa48("12780") ? {} : (stryCov_9fa48("12780"), {
            nodeId: this.nodeId,
            state,
            phase: phaseName,
            subPhase: activeSubPhase,
            duration: phaseDuration,
            error: error.message,
            stack: error.stack
          }));
          this.emit(BootstrapEvent.PHASE_FAILED, stryMutAct_9fa48("12781") ? {} : (stryCov_9fa48("12781"), {
            phase: phaseName,
            nodeId: this.nodeId,
            state,
            subPhase: activeSubPhase,
            duration: phaseDuration,
            error: error.message
          }));
          this.emit(stryMutAct_9fa48("12782") ? "" : (stryCov_9fa48("12782"), 'phase:failed'), stryMutAct_9fa48("12783") ? {} : (stryCov_9fa48("12783"), {
            phase: phaseName,
            nodeId: this.nodeId,
            state,
            subPhase: activeSubPhase,
            duration: phaseDuration,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // Phase-owner forwarding surface removed (D2.3 wrapper collapse).
  // Callers now invoke phase owners directly:
  //   seedInfrastructurePhase, seedMessageGroupsPhase,
  //   seedPartitionsPhase, seedRegistrationPhase,
  //   seedCacheHydrationPhase, seedCleanupHandler.
  // ---------------------------------------------------------------

  /**
   * Handle node state CDC and schedule one rebalance trigger per node-ready join.
   * @param {Object} cdcEvent - CDC event from nodes table.
   * @param {Object|null} previousNodeRow - Previous nodes table row from cache.
   * @return {boolean} True when a new rebalance trigger was scheduled.
   */
  handleNodeReadyRebalanceTrigger(cdcEvent, previousNodeRow) {
    if (stryMutAct_9fa48("12784")) {
      {}
    } else {
      stryCov_9fa48("12784");
      return this.nodeReadyRebalanceOwner.handleNodeReadyRebalanceTrigger(cdcEvent, previousNodeRow);
    }
  }

  /**
  * Execute one node-ready rebalance trigger.
   * @param {string} nodeId - Node that transitioned to ready.
   * @return {Promise<void>}
   * @private
   */
  async executeNodeReadyRebalanceTrigger(nodeId) {
    if (stryMutAct_9fa48("12785")) {
      {}
    } else {
      stryCov_9fa48("12785");
      return this.nodeReadyRebalanceOwner.executeNodeReadyRebalanceTrigger(nodeId);
    }
  }

  /**
   * Clear all pending node-ready rebalance timers and dedupe state.
   */
  clearNodeReadyRebalanceState() {
    if (stryMutAct_9fa48("12786")) {
      {}
    } else {
      stryCov_9fa48("12786");
      this.nodeReadyRebalanceOwner.clearNodeReadyRebalanceState();
    }
  }

  /**
   * Trigger rebalancing check on all partition leaders.
   * Called when a significant cluster event occurs.
   * @param {string} reason - Reason for triggering rebalancing.
   * @private
   */
  triggerRebalancingOnAllPartitions(reason) {
    if (stryMutAct_9fa48("12787")) {
      {}
    } else {
      stryCov_9fa48("12787");
      this.nodeReadyRebalanceOwner.triggerRebalancingOnAllPartitions(reason);
    }
  }

  /**
   * Limit node-ready fanout to the control-plane partitions that gate
   * convergence. Periodic rebalancing covers the broader data plane.
   * @param {Object} partition
   * @return {boolean}
   * @private
   */
  shouldTriggerNodeReadyRebalanceForPartition(partition) {
    if (stryMutAct_9fa48("12788")) {
      {}
    } else {
      stryCov_9fa48("12788");
      return this.nodeReadyRebalanceOwner.shouldTriggerNodeReadyRebalanceForPartition(partition);
    }
  }
  get pendingNodeReadyRebalanceTimers() {
    if (stryMutAct_9fa48("12789")) {
      {}
    } else {
      stryCov_9fa48("12789");
      return this.nodeReadyRebalanceOwner.pendingNodeReadyRebalanceTimers;
    }
  }
  get rebalanceTriggeredNodeIds() {
    if (stryMutAct_9fa48("12790")) {
      {}
    } else {
      stryCov_9fa48("12790");
      return this.nodeReadyRebalanceOwner.rebalanceTriggeredNodeIds;
    }
  }

  /**
   * Get the AssignmentEpochManager instance.
   * @return {AssignmentEpochManager|null}
   */
  getEpochManager() {
    if (stryMutAct_9fa48("12791")) {
      {}
    } else {
      stryCov_9fa48("12791");
      return this.epochManager;
    }
  }
  hasPublishedLocalServiceEndpoints() {
    if (stryMutAct_9fa48("12792")) {
      {}
    } else {
      stryCov_9fa48("12792");
      const systemTableCache = this.getSystemTableCache();
      const localEndpointRows = stryMutAct_9fa48("12795") ? systemTableCache?.filter?.(TABLES.SERVICE_ENDPOINTS, row => row?.[COLUMN.NODE_ID] === this.nodeId) && (systemTableCache?.getAll?.(TABLES.SERVICE_ENDPOINTS) || []).filter(row => row?.[COLUMN.NODE_ID] === this.nodeId) : stryMutAct_9fa48("12794") ? false : stryMutAct_9fa48("12793") ? true : (stryCov_9fa48("12793", "12794", "12795"), (stryMutAct_9fa48("12798") ? systemTableCache.filter?.(TABLES.SERVICE_ENDPOINTS, row => row?.[COLUMN.NODE_ID] === this.nodeId) : stryMutAct_9fa48("12797") ? systemTableCache?.filter(TABLES.SERVICE_ENDPOINTS, row => row?.[COLUMN.NODE_ID] === this.nodeId) : stryMutAct_9fa48("12796") ? systemTableCache : (stryCov_9fa48("12796", "12797", "12798"), systemTableCache?.filter?.(TABLES.SERVICE_ENDPOINTS, stryMutAct_9fa48("12799") ? () => undefined : (stryCov_9fa48("12799"), row => stryMutAct_9fa48("12802") ? row?.[COLUMN.NODE_ID] !== this.nodeId : stryMutAct_9fa48("12801") ? false : stryMutAct_9fa48("12800") ? true : (stryCov_9fa48("12800", "12801", "12802"), (stryMutAct_9fa48("12803") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("12803"), row?.[COLUMN.NODE_ID])) === this.nodeId))))) || (stryMutAct_9fa48("12804") ? systemTableCache?.getAll?.(TABLES.SERVICE_ENDPOINTS) || [] : (stryCov_9fa48("12804"), (stryMutAct_9fa48("12807") ? systemTableCache?.getAll?.(TABLES.SERVICE_ENDPOINTS) && [] : stryMutAct_9fa48("12806") ? false : stryMutAct_9fa48("12805") ? true : (stryCov_9fa48("12805", "12806", "12807"), (stryMutAct_9fa48("12809") ? systemTableCache.getAll?.(TABLES.SERVICE_ENDPOINTS) : stryMutAct_9fa48("12808") ? systemTableCache?.getAll(TABLES.SERVICE_ENDPOINTS) : (stryCov_9fa48("12808", "12809"), systemTableCache?.getAll?.(TABLES.SERVICE_ENDPOINTS))) || (stryMutAct_9fa48("12810") ? ["Stryker was here"] : (stryCov_9fa48("12810"), [])))).filter(stryMutAct_9fa48("12811") ? () => undefined : (stryCov_9fa48("12811"), row => stryMutAct_9fa48("12814") ? row?.[COLUMN.NODE_ID] !== this.nodeId : stryMutAct_9fa48("12813") ? false : stryMutAct_9fa48("12812") ? true : (stryCov_9fa48("12812", "12813", "12814"), (stryMutAct_9fa48("12815") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("12815"), row?.[COLUMN.NODE_ID])) === this.nodeId))))));
      return stryMutAct_9fa48("12819") ? localEndpointRows.length <= 0 : stryMutAct_9fa48("12818") ? localEndpointRows.length >= 0 : stryMutAct_9fa48("12817") ? false : stryMutAct_9fa48("12816") ? true : (stryCov_9fa48("12816", "12817", "12818", "12819"), localEndpointRows.length > 0);
    }
  }
  async activateMessageGroupServiceRows() {
    if (stryMutAct_9fa48("12820")) {
      {}
    } else {
      stryCov_9fa48("12820");
      return activateMessageGroupServiceRows(stryMutAct_9fa48("12821") ? {} : (stryCov_9fa48("12821"), {
        nodeId: this.nodeId,
        systemTableWriter: this.cdcIntegrationService,
        messageRouter: this.messageRouter,
        deferTransientFailures: stryMutAct_9fa48("12822") ? false : (stryCov_9fa48("12822"), true),
        messageGroupServiceHandler: this.messageGroupServiceHandler,
        endpointsPublished: this.hasPublishedLocalServiceEndpoints(),
        messageGroupServices: this.messageGroupServices,
        onDeferredActivation: ({
          groupId,
          replicaId,
          error
        }) => {
          if (stryMutAct_9fa48("12823")) {
            {}
          } else {
            stryCov_9fa48("12823");
            this.logger.warn(stryMutAct_9fa48("12824") ? "" : (stryCov_9fa48("12824"), 'Deferring seed message-group service row activation during startup'), stryMutAct_9fa48("12825") ? {} : (stryCov_9fa48("12825"), {
              nodeId: this.nodeId,
              groupId,
              replicaId,
              error: stryMutAct_9fa48("12828") ? error?.message && String(error) : stryMutAct_9fa48("12827") ? false : stryMutAct_9fa48("12826") ? true : (stryCov_9fa48("12826", "12827", "12828"), (stryMutAct_9fa48("12829") ? error.message : (stryCov_9fa48("12829"), error?.message)) || String(error))
            }));
          }
        }
      }));
    }
  }

  /**
   * Emit best-effort bootstrap replica registration diagnostics.
   * @param {string} scope - Partition or state registration scope.
   * @param {string} event - Trace event name.
   * @param {Object} details - Structured trace details.
   * @private
   */
  writeBootstrapReplicaRegistrationTrace(scope, event, details = {}) {
    if (stryMutAct_9fa48("12830")) {
      {}
    } else {
      stryCov_9fa48("12830");
      if (stryMutAct_9fa48("12833") ? false : stryMutAct_9fa48("12832") ? true : stryMutAct_9fa48("12831") ? this.config.replicaRegistrationTraceEnabled : (stryCov_9fa48("12831", "12832", "12833"), !this.config.replicaRegistrationTraceEnabled)) {
        if (stryMutAct_9fa48("12834")) {
          {}
        } else {
          stryCov_9fa48("12834");
          return;
        }
      }
      this.logger.debug((stryMutAct_9fa48("12835") ? `` : (stryCov_9fa48("12835"), `${BOOTSTRAP_REPLICA_REGISTRATION_TRACE.PREFIX} `)) + (stryMutAct_9fa48("12836") ? `` : (stryCov_9fa48("12836"), `scope=${scope} event=${event}`)), stryMutAct_9fa48("12837") ? {} : (stryCov_9fa48("12837"), {
        nodeId: this.nodeId,
        ...details
      }));
    }
  }

  /**
   * Initialize the ReplicaHandler to handle CREATE_REPLICA/REMOVE_REPLICA.
   * @private
   */
  initializeReplicaHandler() {
    if (stryMutAct_9fa48("12838")) {
      {}
    } else {
      stryCov_9fa48("12838");
      const messageGroupService = this.getLeaderMessageGroupService();
      let dataDir = STORAGE_DEFAULT.DATA_DIR;
      if (stryMutAct_9fa48("12841") ? this.dataDirectoryManager || this.dataDirectoryManager.isInitialized() : stryMutAct_9fa48("12840") ? false : stryMutAct_9fa48("12839") ? true : (stryCov_9fa48("12839", "12840", "12841"), this.dataDirectoryManager && this.dataDirectoryManager.isInitialized())) {
        if (stryMutAct_9fa48("12842")) {
          {}
        } else {
          stryCov_9fa48("12842");
          dataDir = this.dataDirectoryManager.getDataDir();
        }
      }
      const systemTableCache = this.getSystemTableCache();
      const cdcIntegrationService = this.cdcIntegrationService;
      if (stryMutAct_9fa48("12845") ? false : stryMutAct_9fa48("12844") ? true : stryMutAct_9fa48("12843") ? cdcIntegrationService : (stryCov_9fa48("12843", "12844", "12845"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("12846")) {
          {}
        } else {
          stryCov_9fa48("12846");
          throw new Error(bootstrapError.CDC_REPLICA_HANDLER_MISSING);
        }
      }

      // Caller-specific partition creation factory
      const createPartitionService = async options => {
        if (stryMutAct_9fa48("12847")) {
          {}
        } else {
          stryCov_9fa48("12847");
          let dbPath = DEFAULT_BOOTSTRAP_CONFIG.partitionDbPath;
          if (stryMutAct_9fa48("12850") ? this.dataDirectoryManager || this.dataDirectoryManager.isInitialized() : stryMutAct_9fa48("12849") ? false : stryMutAct_9fa48("12848") ? true : (stryCov_9fa48("12848", "12849", "12850"), this.dataDirectoryManager && this.dataDirectoryManager.isInitialized())) {
            if (stryMutAct_9fa48("12851")) {
              {}
            } else {
              stryCov_9fa48("12851");
              dbPath = this.dataDirectoryManager.getPartitionDbPath(options.partitionId, options.replicaId);
            }
          }
          const partition = new PartitionService(stryMutAct_9fa48("12852") ? {} : (stryCov_9fa48("12852"), {
            ...options,
            dbPath,
            transport: this.transport,
            messageGroupService: messageGroupService,
            messageRouter: this.messageRouter,
            rebalanceCoordinator: this.rebalanceCoordinator,
            replicaStateMachine: this.replicaStateMachine,
            systemTableCache: systemTableCache,
            cdcIntegrationService: cdcIntegrationService,
            sqlQueryEngine: stryMutAct_9fa48("12855") ? cdcIntegrationService?.sqlQueryEngine && null : stryMutAct_9fa48("12854") ? false : stryMutAct_9fa48("12853") ? true : (stryCov_9fa48("12853", "12854", "12855"), (stryMutAct_9fa48("12856") ? cdcIntegrationService.sqlQueryEngine : (stryCov_9fa48("12856"), cdcIntegrationService?.sqlQueryEngine)) || null),
            tablePolicyService: this.tablePolicyService,
            bootstrapReadinessState: this.bootstrapReadinessState
          }));
          await partition.initialize();
          this.partitionServices.set(options.replicaId, partition);
          stryMutAct_9fa48("12857") ? this.servicesCreated-- : (stryCov_9fa48("12857"), this.servicesCreated++);
          const tableName = options.tableName;
          if (stryMutAct_9fa48("12860") ? tableName || shouldAttachPartitionCdcPropagation(tableName) : stryMutAct_9fa48("12859") ? false : stryMutAct_9fa48("12858") ? true : (stryCov_9fa48("12858", "12859", "12860"), tableName && shouldAttachPartitionCdcPropagation(tableName))) {
            if (stryMutAct_9fa48("12861")) {
              {}
            } else {
              stryCov_9fa48("12861");
              const subscriptionSelection = await this.resolveOperationalMessageGroupSelectionAsync(stryMutAct_9fa48("12862") ? {} : (stryCov_9fa48("12862"), {
                requiredTables: stryMutAct_9fa48("12863") ? [] : (stryCov_9fa48("12863"), [tableName])
              }));
              const subscriptionMessageGroupService = subscriptionSelection.service;
              if (stryMutAct_9fa48("12866") ? false : stryMutAct_9fa48("12865") ? true : stryMutAct_9fa48("12864") ? subscriptionMessageGroupService : (stryCov_9fa48("12864", "12865", "12866"), !subscriptionMessageGroupService)) {
                if (stryMutAct_9fa48("12867")) {
                  {}
                } else {
                  stryCov_9fa48("12867");
                  throw this.buildMessageGroupOwnerNotReadyError(subscriptionSelection, stryMutAct_9fa48("12868") ? {} : (stryCov_9fa48("12868"), {
                    message: (stryMutAct_9fa48("12869") ? `` : (stryCov_9fa48("12869"), `Operational message-group ingress not ready `)) + (stryMutAct_9fa48("12870") ? `` : (stryCov_9fa48("12870"), `for ${tableName} CDC subscription`))
                  }));
                }
              }
              await subscriptionMessageGroupService.subscribeToCDC(tableName);
              const subscriberId = (stryMutAct_9fa48("12871") ? [] : (stryCov_9fa48("12871"), [stryMutAct_9fa48("12872") ? "" : (stryCov_9fa48("12872"), 'bootstrap'), this.nodeId, tableName, options.replicaId, stryMutAct_9fa48("12875") ? subscriptionMessageGroupService?.groupId && 'message-group' : stryMutAct_9fa48("12874") ? false : stryMutAct_9fa48("12873") ? true : (stryCov_9fa48("12873", "12874", "12875"), (stryMutAct_9fa48("12876") ? subscriptionMessageGroupService.groupId : (stryCov_9fa48("12876"), subscriptionMessageGroupService?.groupId)) || (stryMutAct_9fa48("12877") ? "" : (stryCov_9fa48("12877"), 'message-group')))])).join(stryMutAct_9fa48("12878") ? "" : (stryCov_9fa48("12878"), ':'));
              const cdcSubscriber = async cdcEvent => {
                if (stryMutAct_9fa48("12879")) {
                  {}
                } else {
                  stryCov_9fa48("12879");
                  if (stryMutAct_9fa48("12882") ? cdcEvent.tableName !== tableName : stryMutAct_9fa48("12881") ? false : stryMutAct_9fa48("12880") ? true : (stryCov_9fa48("12880", "12881", "12882"), cdcEvent.tableName === tableName)) {
                    if (stryMutAct_9fa48("12883")) {
                      {}
                    } else {
                      stryCov_9fa48("12883");
                      this.logger.debug(BootstrapLog.CDC_DYNAMIC_PARTITION_EVENT, stryMutAct_9fa48("12884") ? {} : (stryCov_9fa48("12884"), {
                        tableName: cdcEvent.tableName,
                        operation: cdcEvent.operation,
                        partitionId: options.partitionId,
                        replicaId: options.replicaId
                      }));
                      const propagationSelection = await this.resolveOperationalMessageGroupSelectionAsync(stryMutAct_9fa48("12885") ? {} : (stryCov_9fa48("12885"), {
                        requiredTables: stryMutAct_9fa48("12886") ? [] : (stryCov_9fa48("12886"), [tableName])
                      }));
                      const propagationMessageGroupService = propagationSelection.service;
                      if (stryMutAct_9fa48("12889") ? false : stryMutAct_9fa48("12888") ? true : stryMutAct_9fa48("12887") ? propagationMessageGroupService : (stryCov_9fa48("12887", "12888", "12889"), !propagationMessageGroupService)) {
                        if (stryMutAct_9fa48("12890")) {
                          {}
                        } else {
                          stryCov_9fa48("12890");
                          throw this.buildMessageGroupOwnerNotReadyError(propagationSelection, stryMutAct_9fa48("12891") ? {} : (stryCov_9fa48("12891"), {
                            message: (stryMutAct_9fa48("12892") ? `` : (stryCov_9fa48("12892"), `Operational message-group ingress not ready `)) + (stryMutAct_9fa48("12893") ? `` : (stryCov_9fa48("12893"), `for ${tableName} CDC propagation`))
                          }));
                        }
                      }
                      await this.seedRuntimeBridgeOwner.propagatePartitionCDCEvent(propagationMessageGroupService, cdcEvent);
                      if (stryMutAct_9fa48("12896") ? tableName !== TABLES.CONFIG : stryMutAct_9fa48("12895") ? false : stryMutAct_9fa48("12894") ? true : (stryCov_9fa48("12894", "12895", "12896"), tableName === TABLES.CONFIG)) {
                        if (stryMutAct_9fa48("12897")) {
                          {}
                        } else {
                          stryCov_9fa48("12897");
                          this.seedRuntimeBridgeOwner.applyCurrentEpochFromCache();
                        }
                      }
                    }
                  }
                }
              };
              const handshake = await partition.subscribeToCDCWithHandshake(cdcSubscriber, stryMutAct_9fa48("12898") ? {} : (stryCov_9fa48("12898"), {
                subscriberId
              }));
              this.logger.debug(BootstrapLog.CDC_DYNAMIC_SUBSCRIPTION, stryMutAct_9fa48("12899") ? {} : (stryCov_9fa48("12899"), {
                tableName,
                partitionId: options.partitionId,
                replicaId: options.replicaId,
                subscriberId: handshake.subscriberId,
                subscriptionEpoch: handshake.subscriptionEpoch,
                catchupMode: handshake.catchup.mode,
                bufferedEventsReplayed: handshake.catchup.bufferedEventsReplayed
              }));
            }
          }
          return partition;
        }
      };

      // Use shared ReplicaHandlerSetup component
      const {
        replicaHandler,
        replicaStateMachine
      } = ReplicaHandlerSetup.create(stryMutAct_9fa48("12900") ? {} : (stryCov_9fa48("12900"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        cdcIntegrationService: cdcIntegrationService,
        systemTableCache: systemTableCache,
        createPartitionService: createPartitionService,
        dataDir: dataDir,
        rpcClient: this.rpcClient
      }));
      this.replicaHandler = replicaHandler;
      this.replicaStateMachine = replicaStateMachine;
      const partitionRegistrationStartedAt = Date.now();
      this.writeBootstrapReplicaRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_PARTITION, BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_CALL_BEGIN, stryMutAct_9fa48("12901") ? {} : (stryCov_9fa48("12901"), {
        nodeId: this.nodeId,
        totalPartitions: this.partitionServices.size
      }));
      const partitionRegistrationSummary = this.registerPartitionsWithReplicaHandler(this.replicaHandler, this.partitionServices);
      this.writeBootstrapReplicaRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_PARTITION, BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_CALL_END, stryMutAct_9fa48("12902") ? {} : (stryCov_9fa48("12902"), {
        nodeId: this.nodeId,
        durationMs: stryMutAct_9fa48("12903") ? Date.now() + partitionRegistrationStartedAt : (stryCov_9fa48("12903"), Date.now() - partitionRegistrationStartedAt),
        attemptedCount: partitionRegistrationSummary.attemptedCount,
        registeredCount: partitionRegistrationSummary.registeredCount,
        skippedCount: partitionRegistrationSummary.skippedCount,
        totalPartitions: partitionRegistrationSummary.totalPartitions
      }));
      this.logger.info(stryMutAct_9fa48("12904") ? "" : (stryCov_9fa48("12904"), 'Bootstrap replica-handler partition registration summary'), stryMutAct_9fa48("12905") ? {} : (stryCov_9fa48("12905"), {
        nodeId: this.nodeId,
        durationMs: stryMutAct_9fa48("12906") ? Date.now() + partitionRegistrationStartedAt : (stryCov_9fa48("12906"), Date.now() - partitionRegistrationStartedAt),
        attemptedCount: partitionRegistrationSummary.attemptedCount,
        registeredCount: partitionRegistrationSummary.registeredCount,
        skippedCount: partitionRegistrationSummary.skippedCount,
        totalPartitions: partitionRegistrationSummary.totalPartitions
      }));
      const stateRegistrationStartedAt = Date.now();
      this.writeBootstrapReplicaRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_STATE, BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_CALL_BEGIN, stryMutAct_9fa48("12907") ? {} : (stryCov_9fa48("12907"), {
        nodeId: this.nodeId,
        totalPartitions: this.partitionServices.size
      }));
      const stateRegistrationSummary = this.registerReplicasWithStateMachine(this.replicaStateMachine, this.partitionServices);
      this.writeBootstrapReplicaRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_STATE, BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_CALL_END, stryMutAct_9fa48("12908") ? {} : (stryCov_9fa48("12908"), {
        nodeId: this.nodeId,
        durationMs: stryMutAct_9fa48("12909") ? Date.now() + stateRegistrationStartedAt : (stryCov_9fa48("12909"), Date.now() - stateRegistrationStartedAt),
        attemptedCount: stateRegistrationSummary.attemptedCount,
        registeredCount: stateRegistrationSummary.registeredCount,
        skippedCount: stateRegistrationSummary.skippedCount,
        pendingPersistCount: stateRegistrationSummary.pendingPersistCount,
        expectedPersistCount: stateRegistrationSummary.expectedPersistCount,
        persistErrorCount: stateRegistrationSummary.persistErrorCount
      }));
      this.logger.info(stryMutAct_9fa48("12910") ? "" : (stryCov_9fa48("12910"), 'Bootstrap replica-handler state registration summary'), stryMutAct_9fa48("12911") ? {} : (stryCov_9fa48("12911"), {
        nodeId: this.nodeId,
        durationMs: stryMutAct_9fa48("12912") ? Date.now() + stateRegistrationStartedAt : (stryCov_9fa48("12912"), Date.now() - stateRegistrationStartedAt),
        attemptedCount: stateRegistrationSummary.attemptedCount,
        registeredCount: stateRegistrationSummary.registeredCount,
        skippedCount: stateRegistrationSummary.skippedCount,
        pendingPersistCount: stateRegistrationSummary.pendingPersistCount,
        expectedPersistCount: stateRegistrationSummary.expectedPersistCount,
        persistErrorCount: stateRegistrationSummary.persistErrorCount
      }));
      this.logger.info(BootstrapLog.REPLICA_HANDLER_READY, stryMutAct_9fa48("12913") ? {} : (stryCov_9fa48("12913"), {
        nodeId: this.nodeId,
        hasMessageGroupService: stryMutAct_9fa48("12914") ? !messageGroupService : (stryCov_9fa48("12914"), !(stryMutAct_9fa48("12915") ? messageGroupService : (stryCov_9fa48("12915"), !messageGroupService))),
        registeredPartitions: this.partitionServices.size
      }));
    }
  }

  /**
   * Register bootstrap-created partitions with ReplicaHandler.
   * @param {ReplicaHandler} replicaHandler - Handler instance.
   * @param {Map<string, PartitionService>} partitions - Created partitions.
   * @return {Object} Registration summary.
   */
  registerPartitionsWithReplicaHandler(replicaHandler, partitions) {
    if (stryMutAct_9fa48("12916")) {
      {}
    } else {
      stryCov_9fa48("12916");
      if (stryMutAct_9fa48("12919") ? false : stryMutAct_9fa48("12918") ? true : stryMutAct_9fa48("12917") ? replicaHandler : (stryCov_9fa48("12917", "12918", "12919"), !replicaHandler)) {
        if (stryMutAct_9fa48("12920")) {
          {}
        } else {
          stryCov_9fa48("12920");
          this.logger.warn(BootstrapLog.REPLICA_HANDLER_MISSING);
          return stryMutAct_9fa48("12921") ? {} : (stryCov_9fa48("12921"), {
            attemptedCount: NUM.ZERO,
            registeredCount: NUM.ZERO,
            skippedCount: stryMutAct_9fa48("12924") ? partitions?.size && NUM.ZERO : stryMutAct_9fa48("12923") ? false : stryMutAct_9fa48("12922") ? true : (stryCov_9fa48("12922", "12923", "12924"), (stryMutAct_9fa48("12925") ? partitions.size : (stryCov_9fa48("12925"), partitions?.size)) || NUM.ZERO),
            totalPartitions: stryMutAct_9fa48("12928") ? partitions?.size && NUM.ZERO : stryMutAct_9fa48("12927") ? false : stryMutAct_9fa48("12926") ? true : (stryCov_9fa48("12926", "12927", "12928"), (stryMutAct_9fa48("12929") ? partitions.size : (stryCov_9fa48("12929"), partitions?.size)) || NUM.ZERO)
          });
        }
      }
      const startedAt = Date.now();
      const totalPartitions = partitions.size;
      let registeredCount = NUM.ZERO;
      let attemptedCount = NUM.ZERO;
      let skippedCount = NUM.ZERO;
      const writeRegistrationTrace = (event, details = {}) => {
        if (stryMutAct_9fa48("12930")) {
          {}
        } else {
          stryCov_9fa48("12930");
          this.writeBootstrapReplicaRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_PARTITION, event, details);
        }
      };
      this.logger.info(stryMutAct_9fa48("12931") ? "" : (stryCov_9fa48("12931"), 'Starting bootstrap partition registration with replica handler'), stryMutAct_9fa48("12932") ? {} : (stryCov_9fa48("12932"), {
        nodeId: this.nodeId,
        totalPartitions
      }));
      writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_START, stryMutAct_9fa48("12933") ? {} : (stryCov_9fa48("12933"), {
        nodeId: this.nodeId,
        totalPartitions
      }));
      for (const [replicaId, partition] of partitions) {
        if (stryMutAct_9fa48("12934")) {
          {}
        } else {
          stryCov_9fa48("12934");
          stryMutAct_9fa48("12935") ? attemptedCount-- : (stryCov_9fa48("12935"), attemptedCount++);
          if (stryMutAct_9fa48("12938") ? !partition && typeof partition !== 'object' : stryMutAct_9fa48("12937") ? false : stryMutAct_9fa48("12936") ? true : (stryCov_9fa48("12936", "12937", "12938"), (stryMutAct_9fa48("12939") ? partition : (stryCov_9fa48("12939"), !partition)) || (stryMutAct_9fa48("12941") ? typeof partition === 'object' : stryMutAct_9fa48("12940") ? false : (stryCov_9fa48("12940", "12941"), typeof partition !== (stryMutAct_9fa48("12942") ? "" : (stryCov_9fa48("12942"), 'object')))))) {
            if (stryMutAct_9fa48("12943")) {
              {}
            } else {
              stryCov_9fa48("12943");
              stryMutAct_9fa48("12944") ? skippedCount-- : (stryCov_9fa48("12944"), skippedCount++);
              writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_SKIP_MISSING_PARTITION, stryMutAct_9fa48("12945") ? {} : (stryCov_9fa48("12945"), {
                nodeId: this.nodeId,
                attemptedCount,
                replicaId
              }));
              this.logger.error(BootstrapLog.REPLICA_HANDLER_REGISTER_FAILED, stryMutAct_9fa48("12946") ? {} : (stryCov_9fa48("12946"), {
                replicaId,
                partitionId: null,
                error: stryMutAct_9fa48("12947") ? "" : (stryCov_9fa48("12947"), 'Partition service missing during replica-handler registration')
              }));
              continue;
            }
          }
          try {
            if (stryMutAct_9fa48("12948")) {
              {}
            } else {
              stryCov_9fa48("12948");
              writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_ATTEMPT, stryMutAct_9fa48("12949") ? {} : (stryCov_9fa48("12949"), {
                nodeId: this.nodeId,
                attemptedCount,
                replicaId,
                partitionId: stryMutAct_9fa48("12952") ? partition.partitionId && null : stryMutAct_9fa48("12951") ? false : stryMutAct_9fa48("12950") ? true : (stryCov_9fa48("12950", "12951", "12952"), partition.partitionId || null)
              }));
              replicaHandler.registerExistingReplica(stryMutAct_9fa48("12953") ? {} : (stryCov_9fa48("12953"), {
                replicaId: replicaId,
                partitionId: partition.partitionId,
                tableName: partition.tableName,
                status: SERVICE_STATUS.ACTIVE,
                service: partition
              }));
              stryMutAct_9fa48("12954") ? registeredCount-- : (stryCov_9fa48("12954"), registeredCount++);
              writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_SUCCESS, stryMutAct_9fa48("12955") ? {} : (stryCov_9fa48("12955"), {
                nodeId: this.nodeId,
                attemptedCount,
                replicaId
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("12956")) {
              {}
            } else {
              stryCov_9fa48("12956");
              writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_ERROR, stryMutAct_9fa48("12957") ? {} : (stryCov_9fa48("12957"), {
                nodeId: this.nodeId,
                attemptedCount,
                replicaId,
                error: error.message
              }));
              this.logger.error(BootstrapLog.REPLICA_HANDLER_REGISTER_FAILED, stryMutAct_9fa48("12958") ? {} : (stryCov_9fa48("12958"), {
                replicaId,
                partitionId: stryMutAct_9fa48("12961") ? partition?.partitionId && null : stryMutAct_9fa48("12960") ? false : stryMutAct_9fa48("12959") ? true : (stryCov_9fa48("12959", "12960", "12961"), (stryMutAct_9fa48("12962") ? partition.partitionId : (stryCov_9fa48("12962"), partition?.partitionId)) || null),
                error: error.message
              }));
            }
          }
          if (stryMutAct_9fa48("12965") ? attemptedCount % BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL !== NUM.ZERO : stryMutAct_9fa48("12964") ? false : stryMutAct_9fa48("12963") ? true : (stryCov_9fa48("12963", "12964", "12965"), (stryMutAct_9fa48("12966") ? attemptedCount * BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL : (stryCov_9fa48("12966"), attemptedCount % BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL)) === NUM.ZERO)) {
            if (stryMutAct_9fa48("12967")) {
              {}
            } else {
              stryCov_9fa48("12967");
              this.logger.info(stryMutAct_9fa48("12968") ? "" : (stryCov_9fa48("12968"), 'Bootstrap partition registration progress'), stryMutAct_9fa48("12969") ? {} : (stryCov_9fa48("12969"), {
                nodeId: this.nodeId,
                attemptedCount,
                registeredCount,
                skippedCount,
                totalPartitions,
                latestReplicaId: replicaId,
                elapsedMs: stryMutAct_9fa48("12970") ? Date.now() + startedAt : (stryCov_9fa48("12970"), Date.now() - startedAt)
              }));
            }
          }
        }
      }
      this.logger.debug(BootstrapLog.REPLICA_HANDLER_REGISTERED, stryMutAct_9fa48("12971") ? {} : (stryCov_9fa48("12971"), {
        registeredCount,
        totalPartitions: partitions.size,
        nodeId: this.nodeId
      }));
      this.logger.info(stryMutAct_9fa48("12972") ? "" : (stryCov_9fa48("12972"), 'Completed bootstrap partition registration with replica handler'), stryMutAct_9fa48("12973") ? {} : (stryCov_9fa48("12973"), {
        nodeId: this.nodeId,
        attemptedCount,
        registeredCount,
        skippedCount,
        totalPartitions,
        durationMs: stryMutAct_9fa48("12974") ? Date.now() + startedAt : (stryCov_9fa48("12974"), Date.now() - startedAt)
      }));
      writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_COMPLETE, stryMutAct_9fa48("12975") ? {} : (stryCov_9fa48("12975"), {
        nodeId: this.nodeId,
        attemptedCount,
        registeredCount,
        skippedCount,
        totalPartitions,
        durationMs: stryMutAct_9fa48("12976") ? Date.now() + startedAt : (stryCov_9fa48("12976"), Date.now() - startedAt)
      }));
      return stryMutAct_9fa48("12977") ? {} : (stryCov_9fa48("12977"), {
        attemptedCount,
        registeredCount,
        skippedCount,
        totalPartitions
      });
    }
  }

  /**
   * Initialize the control plane service for ordered registration and dispatch.
   * @private
   */
  async initializeControlPlaneService() {
    if (stryMutAct_9fa48("12978")) {
      {}
    } else {
      stryCov_9fa48("12978");
      if (stryMutAct_9fa48("12981") ? false : stryMutAct_9fa48("12980") ? true : stryMutAct_9fa48("12979") ? this.cdcIntegrationService : (stryCov_9fa48("12979", "12980", "12981"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("12982")) {
          {}
        } else {
          stryCov_9fa48("12982");
          throw new Error(bootstrapError.CDC_CONTROL_PLANE_MISSING);
        }
      }
      const controlPlane = await ControlPlaneSetup.create(stryMutAct_9fa48("12983") ? {} : (stryCov_9fa48("12983"), {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        advertisedNodeWsAddress: this.advertisedNodeWsAddress,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
        cdcGroupPropagationService: stryMutAct_9fa48("12986") ? this.latencyTopology?.cdcGroupPropagationService && null : stryMutAct_9fa48("12985") ? false : stryMutAct_9fa48("12984") ? true : (stryCov_9fa48("12984", "12985", "12986"), (stryMutAct_9fa48("12987") ? this.latencyTopology.cdcGroupPropagationService : (stryCov_9fa48("12987"), this.latencyTopology?.cdcGroupPropagationService)) || null),
        systemTableCache: this.systemTableCache,
        tablePolicyService: this.tablePolicyService,
        messageGroupServices: this.messageGroupServices,
        rebalanceCoordinator: this.rebalanceCoordinator,
        bootstrapReadinessState: this.bootstrapReadinessState
      }));
      this.heartbeatService = controlPlane.heartbeatService;
      this.leaseService = controlPlane.leaseService;
      this.endpointService = controlPlane.endpointService;
      this.dispatchService = controlPlane.dispatchService;
      this.rebalanceCoordinator = controlPlane.rebalanceCoordinator;
      this.runtimeSurfaceOwner.bindControlPlaneServices();
      this.logger.info(BootstrapLog.CONTROL_PLANE_READY, stryMutAct_9fa48("12988") ? {} : (stryCov_9fa48("12988"), {
        nodeId: this.nodeId,
        messageGroupCount: this.messageGroupServices.size,
        owner: stryMutAct_9fa48("12989") ? "" : (stryCov_9fa48("12989"), 'ControlPlaneSetup')
      }));
    }
  }

  /**
   * Notify one startup-owned hook that cache-backed local admin surfaces can
   * come online before full cluster self-publication completes.
   * @return {Promise<void>}
   * @private
   */
  async notifyLocalAdminRuntimeReady() {
    if (stryMutAct_9fa48("12990")) {
      {}
    } else {
      stryCov_9fa48("12990");
      await this.runtimeSurfaceOwner.notifyLocalAdminRuntimeReady();
    }
  }

  /**
   * Initialize the RuntimeServiceHandler behind the PG wire safety
   * gate. The gate ensures control-plane readiness before allowing
   * runtime-service replica operations. Startup failure is isolated
   * so bootstrap completes even if PG wire fails.
   *
   * Requirements: 11.1, 11.2, 11.4
   * @private
   */
  initializeRuntimeServiceHandler() {
    if (stryMutAct_9fa48("12991")) {
      {}
    } else {
      stryCov_9fa48("12991");
      const systemTableCache = this.getSystemTableCache();
      const gate = new PgWireStartupSafetyGate(stryMutAct_9fa48("12992") ? {} : (stryCov_9fa48("12992"), {
        nodeId: this.nodeId,
        serviceLifecycleManager: this.serviceLifecycleManager,
        systemTableCache,
        heartbeatService: this.heartbeatService
      }));
      const result = gate.guardedSetup(() => {
        if (stryMutAct_9fa48("12993")) {
          {}
        } else {
          stryCov_9fa48("12993");
          return RuntimeServiceHandlerSetup.create(stryMutAct_9fa48("12994") ? {} : (stryCov_9fa48("12994"), {
            nodeId: this.nodeId,
            messageRouter: this.messageRouter,
            cdcIntegrationService: this.cdcIntegrationService,
            systemTableCache,
            serviceLifecycleManager: this.serviceLifecycleManager,
            rpcClient: this.rpcClient
          }));
        }
      });
      if (stryMutAct_9fa48("12996") ? false : stryMutAct_9fa48("12995") ? true : (stryCov_9fa48("12995", "12996"), result)) {
        if (stryMutAct_9fa48("12997")) {
          {}
        } else {
          stryCov_9fa48("12997");
          this.runtimeServiceHandler = result.runtimeServiceHandler;
        }
      }
    }
  }

  /**
   * Initialize the MessageGroupServiceHandler for control-plane
   * message-group replica operations.
   * @private
   */
  initializeMessageGroupServiceHandler() {
    if (stryMutAct_9fa48("12998")) {
      {}
    } else {
      stryCov_9fa48("12998");
      const systemTableCache = this.getSystemTableCache();
      const descriptorForReplica = stryMutAct_9fa48("12999") ? () => undefined : (stryCov_9fa48("12999"), (() => {
        const descriptorForReplica = replicaId => stryMutAct_9fa48("13000") ? {} : (stryCov_9fa48("13000"), {
          serviceId: replicaId,
          serviceType: stryMutAct_9fa48("13001") ? "" : (stryCov_9fa48("13001"), 'message_group'),
          replicaId
        });
        return descriptorForReplica;
      })());
      const result = MessageGroupServiceHandlerSetup.create(stryMutAct_9fa48("13002") ? {} : (stryCov_9fa48("13002"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
        systemTableCache,
        createMessageGroupReplica: async options => {
          if (stryMutAct_9fa48("13003")) {
            {}
          } else {
            stryCov_9fa48("13003");
            return this.seedMessageGroupsPhase.createBootstrapMessageGroupReplica(stryMutAct_9fa48("13004") ? {} : (stryCov_9fa48("13004"), {
              definition: descriptorForReplica(options.replicaId),
              replicaOptions: options
            }));
          }
        },
        startMessageGroupReplica: async options => {
          if (stryMutAct_9fa48("13005")) {
            {}
          } else {
            stryCov_9fa48("13005");
            return this.seedMessageGroupsPhase.startBootstrapMessageGroupReplica(descriptorForReplica(options.replicaId), stryMutAct_9fa48("13006") ? {} : (stryCov_9fa48("13006"), {
              replicaOptions: options
            }));
          }
        },
        stopMessageGroupReplica: async options => {
          if (stryMutAct_9fa48("13007")) {
            {}
          } else {
            stryCov_9fa48("13007");
            return this.seedMessageGroupsPhase.stopBootstrapMessageGroupReplica(descriptorForReplica(options.replicaId), stryMutAct_9fa48("13008") ? {} : (stryCov_9fa48("13008"), {
              replicaOptions: options
            }));
          }
        },
        resolveLocalMessageGroupReplica: stryMutAct_9fa48("13009") ? () => undefined : (stryCov_9fa48("13009"), replicaId => stryMutAct_9fa48("13012") ? this.messageGroupServices.get(replicaId) && null : stryMutAct_9fa48("13011") ? false : stryMutAct_9fa48("13010") ? true : (stryCov_9fa48("13010", "13011", "13012"), this.messageGroupServices.get(replicaId) || null)),
        rpcClient: this.rpcClient
      }));
      if (stryMutAct_9fa48("13014") ? false : stryMutAct_9fa48("13013") ? true : (stryCov_9fa48("13013", "13014"), result)) {
        if (stryMutAct_9fa48("13015")) {
          {}
        } else {
          stryCov_9fa48("13015");
          this.messageGroupServiceHandler = result.messageGroupServiceHandler;
        }
      }
    }
  }

  /**
   * Wait for local query/data-plane transport readiness before the
   * seed advertises READY through the control plane.
   * @return {Promise<void>}
   * @private
   */
  async awaitLocalQueryTransportReadinessForReadySignal() {
    if (stryMutAct_9fa48("13016")) {
      {}
    } else {
      stryCov_9fa48("13016");
      await waitForLocalQueryTransportReadiness(stryMutAct_9fa48("13017") ? {} : (stryCov_9fa48("13017"), {
        messageRouter: this.messageRouter,
        sleep: stryMutAct_9fa48("13018") ? () => undefined : (stryCov_9fa48("13018"), delayMs => this.sleep(delayMs)),
        onRetry: ({
          attempt,
          maxAttempts,
          delayMs,
          readiness
        }) => {
          if (stryMutAct_9fa48("13019")) {
            {}
          } else {
            stryCov_9fa48("13019");
            this.logger.warn(stryMutAct_9fa48("13020") ? "" : (stryCov_9fa48("13020"), 'Retrying seed control-plane registration until local query transport is ready'), stryMutAct_9fa48("13021") ? {} : (stryCov_9fa48("13021"), {
              nodeId: this.nodeId,
              attempt,
              maxAttempts,
              nextDelayMs: delayMs,
              error: stryMutAct_9fa48("13024") ? readiness?.reason && 'Local query/data-plane transport is not ready' : stryMutAct_9fa48("13023") ? false : stryMutAct_9fa48("13022") ? true : (stryCov_9fa48("13022", "13023", "13024"), (stryMutAct_9fa48("13025") ? readiness.reason : (stryCov_9fa48("13025"), readiness?.reason)) || (stryMutAct_9fa48("13026") ? "" : (stryCov_9fa48("13026"), 'Local query/data-plane transport is not ready'))),
              gate: stryMutAct_9fa48("13027") ? "" : (stryCov_9fa48("13027"), 'local_query_transport'),
              localQueryTransport: readiness
            }));
          }
        }
      }));
    }
  }

  /**
   * Register the seed node using the control plane path.
   * @return {Promise<void>}
   * @private
   */
  async registerSeedNodeWithControlPlane() {
    if (stryMutAct_9fa48("13028")) {
      {}
    } else {
      stryCov_9fa48("13028");
      if (stryMutAct_9fa48("13031") ? false : stryMutAct_9fa48("13030") ? true : stryMutAct_9fa48("13029") ? this.heartbeatService : (stryCov_9fa48("13029", "13030", "13031"), !this.heartbeatService)) {
        if (stryMutAct_9fa48("13032")) {
          {}
        } else {
          stryCov_9fa48("13032");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("13033")) {
          {}
        } else {
          stryCov_9fa48("13033");
          await this.seedCacheHydrationPhase.waitForSystemServiceLeadersInCache();
          await this.awaitLocalQueryTransportReadinessForReadySignal();
          const stats = await NodeService.getInstance().getNodeStats();
          const cpuCores = Number.isFinite(stryMutAct_9fa48("13035") ? stats.cpu?.count : stryMutAct_9fa48("13034") ? stats?.cpu.count : (stryCov_9fa48("13034", "13035"), stats?.cpu?.count)) ? stats.cpu.count : NUM.ZERO;
          const totalMemoryMb = Number.isFinite(stryMutAct_9fa48("13037") ? stats.memory?.totalBytes : stryMutAct_9fa48("13036") ? stats?.memory.totalBytes : (stryCov_9fa48("13036", "13037"), stats?.memory?.totalBytes)) ? Math.round(stryMutAct_9fa48("13038") ? stats.memory.totalBytes * NUM.BYTES_PER_MIB : (stryCov_9fa48("13038"), stats.memory.totalBytes / NUM.BYTES_PER_MIB)) : NUM.ZERO;
          const diskGb = Number.isFinite(stryMutAct_9fa48("13039") ? stats.diskGb : (stryCov_9fa48("13039"), stats?.diskGb)) ? stats.diskGb : NUM.HUNDRED;
          const now = Date.now();
          const nodeRow = stryMutAct_9fa48("13040") ? {} : (stryCov_9fa48("13040"), {
            [COLUMN.NODE_ID]: this.nodeId,
            [COLUMN.NODE_ADDRESS]: this.nodeAddress,
            [COLUMN.CPU_CORES]: cpuCores,
            [COLUMN.MEMORY_MB]: totalMemoryMb,
            [COLUMN.DISK_GB]: diskGb,
            [COLUMN.CPU_USAGE_PERCENT]: Number.isFinite(stryMutAct_9fa48("13042") ? stats.cpu?.usagePercent : stryMutAct_9fa48("13041") ? stats?.cpu.usagePercent : (stryCov_9fa48("13041", "13042"), stats?.cpu?.usagePercent)) ? stats.cpu.usagePercent : NUM.ZERO,
            [COLUMN.MEMORY_USAGE_PERCENT]: Number.isFinite(stryMutAct_9fa48("13044") ? stats.memory?.usagePercent : stryMutAct_9fa48("13043") ? stats?.memory.usagePercent : (stryCov_9fa48("13043", "13044"), stats?.memory?.usagePercent)) ? stats.memory.usagePercent : NUM.ZERO,
            [COLUMN.DISK_USAGE_PERCENT]: Number.isFinite(stryMutAct_9fa48("13045") ? stats.diskUsagePercent : (stryCov_9fa48("13045"), stats?.diskUsagePercent)) ? stats.diskUsagePercent : NUM.ZERO,
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
            [COLUMN.CAPABILITIES]: JSON.stringify(stryMutAct_9fa48("13046") ? ["Stryker was here"] : (stryCov_9fa48("13046"), [])),
            [COLUMN.LAST_HEARTBEAT]: now,
            [COLUMN.CREATED_AT]: now
          });
          const budgetService = NodeStorageBudgetSetup.create(stryMutAct_9fa48("13047") ? {} : (stryCov_9fa48("13047"), {
            nodeId: this.nodeId,
            cdcIntegrationService: this.cdcIntegrationService
          }));
          await NodeStorageBudgetSetup.resolveAndPersist(stryMutAct_9fa48("13048") ? {} : (stryCov_9fa48("13048"), {
            budgetService,
            nodeRow,
            nodeId: this.nodeId
          }));
          await this.heartbeatService.sendHeartbeat(stryMutAct_9fa48("13049") ? {} : (stryCov_9fa48("13049"), {
            cpu: stryMutAct_9fa48("13050") ? {} : (stryCov_9fa48("13050"), {
              count: stryMutAct_9fa48("13051") ? stats.cpu.count : (stryCov_9fa48("13051"), stats.cpu?.count),
              usagePercent: stryMutAct_9fa48("13052") ? stats.cpu.usagePercent : (stryCov_9fa48("13052"), stats.cpu?.usagePercent)
            }),
            memory: stryMutAct_9fa48("13053") ? {} : (stryCov_9fa48("13053"), {
              totalBytes: stryMutAct_9fa48("13054") ? stats.memory.totalBytes : (stryCov_9fa48("13054"), stats.memory?.totalBytes),
              usagePercent: stryMutAct_9fa48("13055") ? stats.memory.usagePercent : (stryCov_9fa48("13055"), stats.memory?.usagePercent)
            }),
            diskGb: stats.diskGb,
            diskUsagePercent: stats.diskUsagePercent
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("13056")) {
          {}
        } else {
          stryCov_9fa48("13056");
          this.logger.error(BootstrapLog.CONTROL_PLANE_REGISTER_FAILED, stryMutAct_9fa48("13057") ? {} : (stryCov_9fa48("13057"), {
            nodeId: this.nodeId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Activate non-critical periodic control-plane writers after bootstrap
   * reaches the active startup barrier.
   * @return {Promise<void>}
   * @private
   */
  async activateControlPlaneBackgroundWriters() {
    if (stryMutAct_9fa48("13058")) {
      {}
    } else {
      stryCov_9fa48("13058");
      return this.runtimeHandoffOwner.activateControlPlaneBackgroundWriters();
    }
  }

  /**
   * Activate steady-state distributed transaction recovery once the
   * runtime-owned SQL engine has been attached and lifecycle publication
   * is ready. Seed restarts must defer replay until after cache hydration.
   * @return {void}
   * @private
   */
  activateDistributedTransactionRecovery() {
    if (stryMutAct_9fa48("13059")) {
      {}
    } else {
      stryCov_9fa48("13059");
      return this.runtimeHandoffOwner.activateDistributedTransactionRecovery();
    }
  }
  hasActiveControlPlaneBackgroundWriters() {
    if (stryMutAct_9fa48("13060")) {
      {}
    } else {
      stryCov_9fa48("13060");
      return this.runtimeHandoffOwner.hasActiveControlPlaneBackgroundWriters();
    }
  }

  /**
   * Register bootstrap-created replicas with the ReplicaStateMachine.
   * This ensures the state machine tracks all existing replicas as 'active'.
   * Requirements: 1.4 - State machine is single source of truth
   *
   * @param {ReplicaStateMachine} stateMachine - State machine instance.
   * @param {Map<string, PartitionService>} partitions - Created partitions.
   * @return {Object} Registration summary.
   */
  registerReplicasWithStateMachine(stateMachine, partitions) {
    if (stryMutAct_9fa48("13061")) {
      {}
    } else {
      stryCov_9fa48("13061");
      assertCritical(stateMachine, bootstrapError.STATE_MACHINE_MISSING);
      const startedAt = Date.now();
      const totalPartitions = partitions.size;
      const supportsSnapshotRegistration = stryMutAct_9fa48("13064") ? typeof stateMachine.registerReplicaSnapshot !== 'function' : stryMutAct_9fa48("13063") ? false : stryMutAct_9fa48("13062") ? true : (stryCov_9fa48("13062", "13063", "13064"), typeof stateMachine.registerReplicaSnapshot === (stryMutAct_9fa48("13065") ? "" : (stryCov_9fa48("13065"), 'function')));
      let registeredCount = NUM.ZERO;
      let attemptedCount = NUM.ZERO;
      let skippedCount = NUM.ZERO;
      let persistErrorCount = NUM.ZERO;
      const persistSettles = stryMutAct_9fa48("13066") ? ["Stryker was here"] : (stryCov_9fa48("13066"), []);
      const writeStateTrace = (event, details = {}) => {
        if (stryMutAct_9fa48("13067")) {
          {}
        } else {
          stryCov_9fa48("13067");
          this.writeBootstrapReplicaRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_STATE, event, details);
        }
      };
      const trackTransitionPersistence = (result, replicaId, targetState) => {
        if (stryMutAct_9fa48("13068")) {
          {}
        } else {
          stryCov_9fa48("13068");
          if (stryMutAct_9fa48("13071") ? !result && typeof result.then !== 'function' : stryMutAct_9fa48("13070") ? false : stryMutAct_9fa48("13069") ? true : (stryCov_9fa48("13069", "13070", "13071"), (stryMutAct_9fa48("13072") ? result : (stryCov_9fa48("13072"), !result)) || (stryMutAct_9fa48("13074") ? typeof result.then === 'function' : stryMutAct_9fa48("13073") ? false : (stryCov_9fa48("13073", "13074"), typeof result.then !== (stryMutAct_9fa48("13075") ? "" : (stryCov_9fa48("13075"), 'function')))))) {
            if (stryMutAct_9fa48("13076")) {
              {}
            } else {
              stryCov_9fa48("13076");
              return;
            }
          }
          const tracked = result.catch(error => {
            if (stryMutAct_9fa48("13077")) {
              {}
            } else {
              stryCov_9fa48("13077");
              stryMutAct_9fa48("13078") ? persistErrorCount-- : (stryCov_9fa48("13078"), persistErrorCount++);
              this.logger.error(stryMutAct_9fa48("13079") ? "" : (stryCov_9fa48("13079"), 'Replica state persistence rejected during bootstrap registration'), stryMutAct_9fa48("13080") ? {} : (stryCov_9fa48("13080"), {
                nodeId: this.nodeId,
                replicaId,
                targetState,
                error: error.message
              }));
              return stryMutAct_9fa48("13081") ? true : (stryCov_9fa48("13081"), false);
            }
          });
          persistSettles.push(tracked);
        }
      };
      const registerReplicaSnapshot = (replicaId, partitionId, currentAttempt) => {
        if (stryMutAct_9fa48("13082")) {
          {}
        } else {
          stryCov_9fa48("13082");
          writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_TRANSITION_BEGIN, stryMutAct_9fa48("13083") ? {} : (stryCov_9fa48("13083"), {
            nodeId: this.nodeId,
            attemptedCount: currentAttempt,
            replicaId,
            partitionId,
            targetState: ReplicaState.ACTIVE
          }));
          const registrationResult = stateMachine.registerReplicaSnapshot(replicaId, stryMutAct_9fa48("13084") ? {} : (stryCov_9fa48("13084"), {
            partitionId,
            nodeId: this.nodeId,
            state: ReplicaState.ACTIVE,
            reason: BOOTSTRAP_REPLICA_REGISTRATION_REASON.BOOTSTRAP_REGISTRATION,
            serviceId: replicaId
          }));
          writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_TRANSITION_END, stryMutAct_9fa48("13085") ? {} : (stryCov_9fa48("13085"), {
            nodeId: this.nodeId,
            attemptedCount: currentAttempt,
            replicaId,
            partitionId,
            targetState: ReplicaState.ACTIVE
          }));
          if (stryMutAct_9fa48("13088") ? registrationResult === true : stryMutAct_9fa48("13087") ? false : stryMutAct_9fa48("13086") ? true : (stryCov_9fa48("13086", "13087", "13088"), registrationResult !== (stryMutAct_9fa48("13089") ? false : (stryCov_9fa48("13089"), true)))) {
            if (stryMutAct_9fa48("13090")) {
              {}
            } else {
              stryCov_9fa48("13090");
              throw new Error(stryMutAct_9fa48("13091") ? "" : (stryCov_9fa48("13091"), 'Replica snapshot registration rejected'));
            }
          }
        }
      };
      const transitionReplicaState = (replicaId, partitionId, targetState, currentAttempt) => {
        if (stryMutAct_9fa48("13092")) {
          {}
        } else {
          stryCov_9fa48("13092");
          writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_TRANSITION_BEGIN, stryMutAct_9fa48("13093") ? {} : (stryCov_9fa48("13093"), {
            nodeId: this.nodeId,
            attemptedCount: currentAttempt,
            replicaId,
            partitionId,
            targetState
          }));
          const transitionResult = stateMachine.transition(replicaId, targetState, stryMutAct_9fa48("13094") ? {} : (stryCov_9fa48("13094"), {
            partitionId,
            nodeId: this.nodeId,
            reason: BOOTSTRAP_REPLICA_REGISTRATION_REASON.BOOTSTRAP_REGISTRATION,
            serviceId: replicaId
          }));
          writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_TRANSITION_END, stryMutAct_9fa48("13095") ? {} : (stryCov_9fa48("13095"), {
            nodeId: this.nodeId,
            attemptedCount: currentAttempt,
            replicaId,
            partitionId,
            targetState
          }));
          trackTransitionPersistence(transitionResult, replicaId, targetState);
        }
      };
      this.logger.info(stryMutAct_9fa48("13096") ? "" : (stryCov_9fa48("13096"), 'Starting bootstrap replica registration with state machine'), stryMutAct_9fa48("13097") ? {} : (stryCov_9fa48("13097"), {
        nodeId: this.nodeId,
        totalPartitions
      }));
      writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_START, stryMutAct_9fa48("13098") ? {} : (stryCov_9fa48("13098"), {
        nodeId: this.nodeId,
        totalPartitions
      }));
      for (const [replicaId, partition] of partitions) {
        if (stryMutAct_9fa48("13099")) {
          {}
        } else {
          stryCov_9fa48("13099");
          stryMutAct_9fa48("13100") ? attemptedCount-- : (stryCov_9fa48("13100"), attemptedCount++);
          writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_ATTEMPT, stryMutAct_9fa48("13101") ? {} : (stryCov_9fa48("13101"), {
            nodeId: this.nodeId,
            attemptedCount,
            replicaId,
            partitionId: stryMutAct_9fa48("13104") ? partition?.partitionId && null : stryMutAct_9fa48("13103") ? false : stryMutAct_9fa48("13102") ? true : (stryCov_9fa48("13102", "13103", "13104"), (stryMutAct_9fa48("13105") ? partition.partitionId : (stryCov_9fa48("13105"), partition?.partitionId)) || null)
          }));
          if (stryMutAct_9fa48("13108") ? !partition && typeof partition !== 'object' : stryMutAct_9fa48("13107") ? false : stryMutAct_9fa48("13106") ? true : (stryCov_9fa48("13106", "13107", "13108"), (stryMutAct_9fa48("13109") ? partition : (stryCov_9fa48("13109"), !partition)) || (stryMutAct_9fa48("13111") ? typeof partition === 'object' : stryMutAct_9fa48("13110") ? false : (stryCov_9fa48("13110", "13111"), typeof partition !== (stryMutAct_9fa48("13112") ? "" : (stryCov_9fa48("13112"), 'object')))))) {
            if (stryMutAct_9fa48("13113")) {
              {}
            } else {
              stryCov_9fa48("13113");
              stryMutAct_9fa48("13114") ? skippedCount-- : (stryCov_9fa48("13114"), skippedCount++);
              writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_SKIP_MISSING_PARTITION, stryMutAct_9fa48("13115") ? {} : (stryCov_9fa48("13115"), {
                nodeId: this.nodeId,
                attemptedCount,
                replicaId
              }));
              this.logger.error(BootstrapLog.STATE_MACHINE_REGISTER_FAILED, stryMutAct_9fa48("13116") ? {} : (stryCov_9fa48("13116"), {
                replicaId,
                partitionId: null,
                error: stryMutAct_9fa48("13117") ? "" : (stryCov_9fa48("13117"), 'Partition service missing during state-machine registration')
              }));
              continue;
            }
          }
          try {
            if (stryMutAct_9fa48("13118")) {
              {}
            } else {
              stryCov_9fa48("13118");
              if (stryMutAct_9fa48("13120") ? false : stryMutAct_9fa48("13119") ? true : (stryCov_9fa48("13119", "13120"), supportsSnapshotRegistration)) {
                if (stryMutAct_9fa48("13121")) {
                  {}
                } else {
                  stryCov_9fa48("13121");
                  registerReplicaSnapshot(replicaId, partition.partitionId, attemptedCount);
                }
              } else {
                if (stryMutAct_9fa48("13122")) {
                  {}
                } else {
                  stryCov_9fa48("13122");
                  transitionReplicaState(replicaId, partition.partitionId, ReplicaState.PENDING, attemptedCount);
                  transitionReplicaState(replicaId, partition.partitionId, ReplicaState.CREATING, attemptedCount);
                  transitionReplicaState(replicaId, partition.partitionId, ReplicaState.SYNCING, attemptedCount);
                  transitionReplicaState(replicaId, partition.partitionId, ReplicaState.ACTIVE, attemptedCount);
                }
              }
              stryMutAct_9fa48("13123") ? registeredCount-- : (stryCov_9fa48("13123"), registeredCount++);
              writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_SUCCESS, stryMutAct_9fa48("13124") ? {} : (stryCov_9fa48("13124"), {
                nodeId: this.nodeId,
                attemptedCount,
                replicaId,
                partitionId: partition.partitionId
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("13125")) {
              {}
            } else {
              stryCov_9fa48("13125");
              writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_ERROR, stryMutAct_9fa48("13126") ? {} : (stryCov_9fa48("13126"), {
                nodeId: this.nodeId,
                attemptedCount,
                replicaId,
                partitionId: stryMutAct_9fa48("13129") ? partition?.partitionId && null : stryMutAct_9fa48("13128") ? false : stryMutAct_9fa48("13127") ? true : (stryCov_9fa48("13127", "13128", "13129"), (stryMutAct_9fa48("13130") ? partition.partitionId : (stryCov_9fa48("13130"), partition?.partitionId)) || null),
                error: error.message
              }));
              this.logger.error(BootstrapLog.STATE_MACHINE_REGISTER_FAILED, stryMutAct_9fa48("13131") ? {} : (stryCov_9fa48("13131"), {
                replicaId,
                partitionId: stryMutAct_9fa48("13134") ? partition?.partitionId && null : stryMutAct_9fa48("13133") ? false : stryMutAct_9fa48("13132") ? true : (stryCov_9fa48("13132", "13133", "13134"), (stryMutAct_9fa48("13135") ? partition.partitionId : (stryCov_9fa48("13135"), partition?.partitionId)) || null),
                error: error.message
              }));
            }
          }
          if (stryMutAct_9fa48("13138") ? attemptedCount % BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL !== NUM.ZERO : stryMutAct_9fa48("13137") ? false : stryMutAct_9fa48("13136") ? true : (stryCov_9fa48("13136", "13137", "13138"), (stryMutAct_9fa48("13139") ? attemptedCount * BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL : (stryCov_9fa48("13139"), attemptedCount % BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL)) === NUM.ZERO)) {
            if (stryMutAct_9fa48("13140")) {
              {}
            } else {
              stryCov_9fa48("13140");
              this.logger.info(stryMutAct_9fa48("13141") ? "" : (stryCov_9fa48("13141"), 'Bootstrap state-machine registration progress'), stryMutAct_9fa48("13142") ? {} : (stryCov_9fa48("13142"), {
                nodeId: this.nodeId,
                attemptedCount,
                registeredCount,
                skippedCount,
                persistErrorCount,
                pendingPersistCount: persistSettles.length,
                totalPartitions,
                latestReplicaId: replicaId,
                elapsedMs: stryMutAct_9fa48("13143") ? Date.now() + startedAt : (stryCov_9fa48("13143"), Date.now() - startedAt)
              }));
            }
          }
        }
      }
      const expectedPersistCount = supportsSnapshotRegistration ? NUM.ZERO : stryMutAct_9fa48("13144") ? registeredCount / BOOTSTRAP_REPLICA_STATE_TRANSITIONS_PER_REPLICA : (stryCov_9fa48("13144"), registeredCount * BOOTSTRAP_REPLICA_STATE_TRANSITIONS_PER_REPLICA);
      this.logger.debug(BootstrapLog.STATE_MACHINE_REGISTERED, stryMutAct_9fa48("13145") ? {} : (stryCov_9fa48("13145"), {
        registeredCount,
        totalPartitions: partitions.size,
        nodeId: this.nodeId,
        stateCounts: stateMachine.getStateCounts()
      }));
      this.logger.info(stryMutAct_9fa48("13146") ? "" : (stryCov_9fa48("13146"), 'Completed bootstrap replica registration with state machine'), stryMutAct_9fa48("13147") ? {} : (stryCov_9fa48("13147"), {
        nodeId: this.nodeId,
        attemptedCount,
        registeredCount,
        skippedCount,
        persistErrorCount,
        pendingPersistCount: persistSettles.length,
        expectedPersistCount,
        totalPartitions,
        durationMs: stryMutAct_9fa48("13148") ? Date.now() + startedAt : (stryCov_9fa48("13148"), Date.now() - startedAt)
      }));
      writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_COMPLETE, stryMutAct_9fa48("13149") ? {} : (stryCov_9fa48("13149"), {
        nodeId: this.nodeId,
        attemptedCount,
        registeredCount,
        skippedCount,
        persistErrorCount,
        pendingPersistCount: persistSettles.length,
        expectedPersistCount,
        totalPartitions,
        durationMs: stryMutAct_9fa48("13150") ? Date.now() + startedAt : (stryCov_9fa48("13150"), Date.now() - startedAt)
      }));
      if (stryMutAct_9fa48("13154") ? persistSettles.length <= NUM.ZERO : stryMutAct_9fa48("13153") ? persistSettles.length >= NUM.ZERO : stryMutAct_9fa48("13152") ? false : stryMutAct_9fa48("13151") ? true : (stryCov_9fa48("13151", "13152", "13153", "13154"), persistSettles.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("13155")) {
          {}
        } else {
          stryCov_9fa48("13155");
          void Promise.all(persistSettles).then(() => {
            if (stryMutAct_9fa48("13156")) {
              {}
            } else {
              stryCov_9fa48("13156");
              this.logger.info(stryMutAct_9fa48("13157") ? "" : (stryCov_9fa48("13157"), 'Bootstrap state-machine registration persistence settled'), stryMutAct_9fa48("13158") ? {} : (stryCov_9fa48("13158"), {
                nodeId: this.nodeId,
                attemptedCount,
                registeredCount,
                skippedCount,
                persistErrorCount,
                expectedPersistCount,
                settledPersistCount: persistSettles.length,
                elapsedMs: stryMutAct_9fa48("13159") ? Date.now() + startedAt : (stryCov_9fa48("13159"), Date.now() - startedAt)
              }));
            }
          });
        }
      }
      return stryMutAct_9fa48("13160") ? {} : (stryCov_9fa48("13160"), {
        attemptedCount,
        registeredCount,
        skippedCount,
        pendingPersistCount: persistSettles.length,
        expectedPersistCount,
        persistErrorCount,
        totalPartitions
      });
    }
  }

  /**
   * Get the system table cache (source of truth for cluster metadata).
   * Some unit tests inject it via a message group service stub.
   * @return {Object|null}
   * @private
   */
  getSystemTableCache() {
    if (stryMutAct_9fa48("13161")) {
      {}
    } else {
      stryCov_9fa48("13161");
      return assertCritical(this.peekSystemTableCache(), bootstrapError.SYSTEM_CACHE_MISSING);
    }
  }

  /**
   * Read the current runtime cache reference without forcing a hard failure.
   * @return {Object|null}
   * @private
   */
  peekSystemTableCache() {
    if (stryMutAct_9fa48("13162")) {
      {}
    } else {
      stryCov_9fa48("13162");
      if (stryMutAct_9fa48("13164") ? false : stryMutAct_9fa48("13163") ? true : (stryCov_9fa48("13163", "13164"), this.systemTableCache)) {
        if (stryMutAct_9fa48("13165")) {
          {}
        } else {
          stryCov_9fa48("13165");
          return this.systemTableCache;
        }
      }
      // Pick the first message group service that exposes a cache.
      for (const svc of this.messageGroupServices.values()) {
        if (stryMutAct_9fa48("13166")) {
          {}
        } else {
          stryCov_9fa48("13166");
          if (stryMutAct_9fa48("13169") ? svc.systemTableCache : stryMutAct_9fa48("13168") ? false : stryMutAct_9fa48("13167") ? true : (stryCov_9fa48("13167", "13168", "13169"), svc?.systemTableCache)) {
            if (stryMutAct_9fa48("13170")) {
              {}
            } else {
              stryCov_9fa48("13170");
              return svc.systemTableCache;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Delegate leader-partition resolution to the canonical seed registration
   * owner while preserving the BootstrapService seam used by tests.
   * @param {string} tableName
   * @return {Object|null}
   */
  getLeaderPartition(tableName) {
    if (stryMutAct_9fa48("13171")) {
      {}
    } else {
      stryCov_9fa48("13171");
      return this.seedRegistrationRuntimeOwner.getLeaderPartition(tableName);
    }
  }
  resolveOperationalMessageGroupSelection(options = {}) {
    if (stryMutAct_9fa48("13172")) {
      {}
    } else {
      stryCov_9fa48("13172");
      return this.messageGroupSelectionOwner.resolveOperationalMessageGroupSelection(options);
    }
  }
  async resolveOperationalMessageGroupSelectionAsync(options = {}) {
    if (stryMutAct_9fa48("13173")) {
      {}
    } else {
      stryCov_9fa48("13173");
      return this.messageGroupSelectionOwner.resolveOperationalMessageGroupSelectionAsync(options);
    }
  }
  getLeaderMessageGroupService(options = {}) {
    if (stryMutAct_9fa48("13174")) {
      {}
    } else {
      stryCov_9fa48("13174");
      return this.resolveOperationalMessageGroupSelection(options).service;
    }
  }
  getBootstrapMessageGroupService() {
    if (stryMutAct_9fa48("13175")) {
      {}
    } else {
      stryCov_9fa48("13175");
      return this.messageGroupSelectionOwner.getBootstrapMessageGroupService();
    }
  }
  buildMessageGroupOwnerNotReadyError(selection = {}, options = {}) {
    if (stryMutAct_9fa48("13176")) {
      {}
    } else {
      stryCov_9fa48("13176");
      return this.messageGroupSelectionOwner.buildMessageGroupOwnerNotReadyError(selection, options);
    }
  }

  /**
   * Upsert/update a node's connection state into the nodes system table.
   * Used by bootstrap-ready handlers and some tests.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.nodeAddress
   * @param {string} options.connectionState
   * @param {Array<string>} [options.capabilities]
   * @return {Promise<void>}
   */
  async upsertNodeConnectionState(options) {
    if (stryMutAct_9fa48("13177")) {
      {}
    } else {
      stryCov_9fa48("13177");
      const nodesPartition = this.getLeaderPartition(TABLES.NODES);
      if (stryMutAct_9fa48("13180") ? false : stryMutAct_9fa48("13179") ? true : stryMutAct_9fa48("13178") ? nodesPartition : (stryCov_9fa48("13178", "13179", "13180"), !nodesPartition)) {
        if (stryMutAct_9fa48("13181")) {
          {}
        } else {
          stryCov_9fa48("13181");
          throw new Error(bootstrapError.NODES_LEADER_MISSING);
        }
      }
      const cache = this.getSystemTableCache();
      const existing = stryMutAct_9fa48("13184") ? cache.get(TABLES.NODES, options.nodeId) && null : stryMutAct_9fa48("13183") ? false : stryMutAct_9fa48("13182") ? true : (stryCov_9fa48("13182", "13183", "13184"), cache.get(TABLES.NODES, options.nodeId) || null);
      const capabilities = Array.isArray(options.capabilities) ? options.capabilities : stryMutAct_9fa48("13185") ? ["Stryker was here"] : (stryCov_9fa48("13185"), []);
      if (stryMutAct_9fa48("13187") ? false : stryMutAct_9fa48("13186") ? true : (stryCov_9fa48("13186", "13187"), existing)) {
        if (stryMutAct_9fa48("13188")) {
          {}
        } else {
          stryCov_9fa48("13188");
          await nodesPartition.updateData(TABLES.NODES, stryMutAct_9fa48("13189") ? {} : (stryCov_9fa48("13189"), {
            node_id: options.nodeId
          }), stryMutAct_9fa48("13190") ? {} : (stryCov_9fa48("13190"), {
            node_address: options.nodeAddress,
            connection_state: options.connectionState,
            capabilities: JSON.stringify(capabilities),
            // Preserve last heartbeat if present to avoid clobbering liveness tracking.
            last_heartbeat: existing.last_heartbeat
          }));
        }
      } else {
        if (stryMutAct_9fa48("13191")) {
          {}
        } else {
          stryCov_9fa48("13191");
          await nodesPartition.upsertData(TABLES.NODES, stryMutAct_9fa48("13192") ? {} : (stryCov_9fa48("13192"), {
            node_id: options.nodeId,
            node_address: options.nodeAddress,
            connection_state: options.connectionState,
            capabilities: JSON.stringify(capabilities)
          }));
        }
      }
    }
  }

  /**
   * Register the bootstrap \"ready\" handler on the message router.
   * This is a compatibility hook for older joining flows.
   */
  registerBootstrapReadyHandler() {
    if (stryMutAct_9fa48("13193")) {
      {}
    } else {
      stryCov_9fa48("13193");
      if (stryMutAct_9fa48("13196") ? false : stryMutAct_9fa48("13195") ? true : stryMutAct_9fa48("13194") ? this.messageRouter?.register : (stryCov_9fa48("13194", "13195", "13196"), !(stryMutAct_9fa48("13197") ? this.messageRouter.register : (stryCov_9fa48("13197"), this.messageRouter?.register)))) {
        if (stryMutAct_9fa48("13198")) {
          {}
        } else {
          stryCov_9fa48("13198");
          return;
        }
      }
      const address = (stryMutAct_9fa48("13199") ? `` : (stryCov_9fa48("13199"), `${this.nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.BOOTSTRAP}`)) + (stryMutAct_9fa48("13200") ? `` : (stryCov_9fa48("13200"), `${ADDRESS.SEPARATOR}${BOOTSTRAP_READY_MESSAGE.PATH}`));
      this.messageRouter.register(address, async msg => {
        if (stryMutAct_9fa48("13201")) {
          {}
        } else {
          stryCov_9fa48("13201");
          const payload = stryMutAct_9fa48("13204") ? msg?.payload && {} : stryMutAct_9fa48("13203") ? false : stryMutAct_9fa48("13202") ? true : (stryCov_9fa48("13202", "13203", "13204"), (stryMutAct_9fa48("13205") ? msg.payload : (stryCov_9fa48("13205"), msg?.payload)) || {});
          if (stryMutAct_9fa48("13208") ? payload.type !== BOOTSTRAP_READY_MESSAGE.TYPE : stryMutAct_9fa48("13207") ? false : stryMutAct_9fa48("13206") ? true : (stryCov_9fa48("13206", "13207", "13208"), payload.type === BOOTSTRAP_READY_MESSAGE.TYPE)) {
            if (stryMutAct_9fa48("13209")) {
              {}
            } else {
              stryCov_9fa48("13209");
              await this.upsertNodeConnectionState(stryMutAct_9fa48("13210") ? {} : (stryCov_9fa48("13210"), {
                nodeId: payload.nodeId,
                nodeAddress: payload.nodeAddress,
                connectionState: STATE.READY,
                capabilities: payload.capabilities
              }));
            }
          }
          return stryMutAct_9fa48("13211") ? {} : (stryCov_9fa48("13211"), {
            acknowledged: stryMutAct_9fa48("13212") ? false : (stryCov_9fa48("13212"), true)
          });
        }
      });
    }
  }

  /**
   * Handle bootstrap failure.
   * Clean up partially initialized services and exit.
   * @param {Error} error - The error that caused failure.
   * @return {Object} Failure result.
   * @private
   */
  async handleBootstrapFailure(error) {
    if (stryMutAct_9fa48("13213")) {
      {}
    } else {
      stryCov_9fa48("13213");
      const failedPhase = this.phase;
      this.phase = BootstrapPhase.FAILED;
      this.lastError = error;
      const duration = stryMutAct_9fa48("13214") ? Date.now() + this.startTime : (stryCov_9fa48("13214"), Date.now() - this.startTime);
      this.logger.error(BootstrapLog.BOOTSTRAP_FAILED, stryMutAct_9fa48("13215") ? {} : (stryCov_9fa48("13215"), {
        nodeId: this.nodeId,
        phase: failedPhase,
        duration,
        error: error.message,
        stack: error.stack,
        servicesCreated: this.servicesCreated
      }));
      const cleanupContext = stryMutAct_9fa48("13216") ? {} : (stryCov_9fa48("13216"), {
        failedPhase,
        createdPartitions: stryMutAct_9fa48("13217") ? [] : (stryCov_9fa48("13217"), [...this.partitionServices.keys()]),
        createdServices: stryMutAct_9fa48("13218") ? [] : (stryCov_9fa48("13218"), [...this.messageGroupServices.keys(), ...this.partitionServices.keys()]),
        createdMessageGroups: (stryMutAct_9fa48("13222") ? this.messageGroupsCreated <= NUM.ZERO : stryMutAct_9fa48("13221") ? this.messageGroupsCreated >= NUM.ZERO : stryMutAct_9fa48("13220") ? false : stryMutAct_9fa48("13219") ? true : (stryCov_9fa48("13219", "13220", "13221", "13222"), this.messageGroupsCreated > NUM.ZERO)) ? stryMutAct_9fa48("13223") ? [] : (stryCov_9fa48("13223"), [INITIAL_MESSAGE_GROUP_ID]) : stryMutAct_9fa48("13224") ? ["Stryker was here"] : (stryCov_9fa48("13224"), []),
        registeredNodeId: this.nodeId
      });
      await this.cleanupFailedBootstrap(failedPhase, cleanupContext);
      this.emit(BootstrapEvent.FAILED, stryMutAct_9fa48("13225") ? {} : (stryCov_9fa48("13225"), {
        nodeId: this.nodeId,
        phase: failedPhase,
        duration,
        error: error.message,
        servicesCreated: this.servicesCreated
      }));
      return stryMutAct_9fa48("13226") ? {} : (stryCov_9fa48("13226"), {
        success: stryMutAct_9fa48("13227") ? true : (stryCov_9fa48("13227"), false),
        nodeId: this.nodeId,
        duration,
        error: error.message,
        phase: failedPhase,
        servicesCreated: this.servicesCreated
      });
    }
  }

  /**
   * Clean up a failed bootstrap by delegating to the canonical
   * cleanup owner (SeedCleanupHandler — D3.1).
   * @param {string} failedPhase - The phase that failed.
   * @param {Object} cleanupContext - Context about what was created.
   * @return {Promise<void>}
   */
  async cleanupFailedBootstrap(failedPhase, cleanupContext) {
    if (stryMutAct_9fa48("13228")) {
      {}
    } else {
      stryCov_9fa48("13228");
      await this.seedCleanupHandler.cleanupFailedBootstrap(failedPhase, cleanupContext);
    }
  }

  /**
   * Execute a single cleanup step via the canonical cleanup
   * owner (SeedCleanupHandler — D3.1).
   * @param {string} step - The cleanup step to execute.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} 'success', 'error', or 'skipped'.
   * @private
   */
  async _executeCleanupStep(step, cleanupContext) {
    if (stryMutAct_9fa48("13229")) {
      {}
    } else {
      stryCov_9fa48("13229");
      return this.seedCleanupHandler._executeCleanupStep(step, cleanupContext);
    }
  }

  /**
   * Safely get the system table cache without throwing.
   * Used during cleanup when the cache may not be available.
   * @return {Object|null} System table cache or null.
   * @private
   */
  _getSystemTableCacheSafe() {
    if (stryMutAct_9fa48("13230")) {
      {}
    } else {
      stryCov_9fa48("13230");
      try {
        if (stryMutAct_9fa48("13231")) {
          {}
        } else {
          stryCov_9fa48("13231");
          for (const svc of this.messageGroupServices.values()) {
            if (stryMutAct_9fa48("13232")) {
              {}
            } else {
              stryCov_9fa48("13232");
              if (stryMutAct_9fa48("13235") ? svc.systemTableCache : stryMutAct_9fa48("13234") ? false : stryMutAct_9fa48("13233") ? true : (stryCov_9fa48("13233", "13234", "13235"), svc?.systemTableCache)) {
                if (stryMutAct_9fa48("13236")) {
                  {}
                } else {
                  stryCov_9fa48("13236");
                  return svc.systemTableCache;
                }
              }
            }
          }
        }
      } catch (_err) {
        // Ignore — cache may not be available during cleanup
      }
      return null;
    }
  }

  /**
   * Start WebSocket server for cross-node communication.
   * Call this after bootstrap is complete to enable remote node connections.
   * Note: If wsPort was provided during bootstrap, the server is already started.
   * @return {Promise<void>}
   */
  async startWebSocketServer() {
    if (stryMutAct_9fa48("13237")) {
      {}
    } else {
      stryCov_9fa48("13237");
      if (stryMutAct_9fa48("13240") ? false : stryMutAct_9fa48("13239") ? true : stryMutAct_9fa48("13238") ? this.messageRouter : (stryCov_9fa48("13238", "13239", "13240"), !this.messageRouter)) {
        if (stryMutAct_9fa48("13241")) {
          {}
        } else {
          stryCov_9fa48("13241");
          throw new Error(bootstrapError.ROUTER_NOT_READY);
        }
      }
      const wsPort = stryMutAct_9fa48("13244") ? this.wsPort && this.config.wsPort : stryMutAct_9fa48("13243") ? false : stryMutAct_9fa48("13242") ? true : (stryCov_9fa48("13242", "13243", "13244"), this.wsPort || this.config.wsPort);
      if (stryMutAct_9fa48("13247") ? false : stryMutAct_9fa48("13246") ? true : stryMutAct_9fa48("13245") ? wsPort : (stryCov_9fa48("13245", "13246", "13247"), !wsPort)) {
        if (stryMutAct_9fa48("13248")) {
          {}
        } else {
          stryCov_9fa48("13248");
          this.logger.warn(BootstrapLog.WS_PORT_MISSING);
          return;
        }
      }

      // Update the port if not already set
      if (stryMutAct_9fa48("13251") ? false : stryMutAct_9fa48("13250") ? true : stryMutAct_9fa48("13249") ? this.messageRouter.wsPort : (stryCov_9fa48("13249", "13250", "13251"), !this.messageRouter.wsPort)) {
        if (stryMutAct_9fa48("13252")) {
          {}
        } else {
          stryCov_9fa48("13252");
          this.messageRouter.wsPort = wsPort;
        }
      }
      const serverAlreadyRunning = Boolean(this.messageRouter.server);
      await this.messageRouter.initialize(stryMutAct_9fa48("13253") ? {} : (stryCov_9fa48("13253"), {
        startServer: stryMutAct_9fa48("13254") ? false : (stryCov_9fa48("13254"), true)
      }));
      if (stryMutAct_9fa48("13257") ? typeof this.messageRouter.setExternalAdmissionEnabled !== 'function' : stryMutAct_9fa48("13256") ? false : stryMutAct_9fa48("13255") ? true : (stryCov_9fa48("13255", "13256", "13257"), typeof this.messageRouter.setExternalAdmissionEnabled === (stryMutAct_9fa48("13258") ? "" : (stryCov_9fa48("13258"), 'function')))) {
        if (stryMutAct_9fa48("13259")) {
          {}
        } else {
          stryCov_9fa48("13259");
          this.messageRouter.setExternalAdmissionEnabled(stryMutAct_9fa48("13260") ? false : (stryCov_9fa48("13260"), true));
        }
      }
      if (stryMutAct_9fa48("13262") ? false : stryMutAct_9fa48("13261") ? true : (stryCov_9fa48("13261", "13262"), serverAlreadyRunning)) {
        if (stryMutAct_9fa48("13263")) {
          {}
        } else {
          stryCov_9fa48("13263");
          this.logger.debug(BootstrapLog.WS_ALREADY_RUNNING, stryMutAct_9fa48("13264") ? {} : (stryCov_9fa48("13264"), {
            nodeId: this.nodeId,
            wsPort: wsPort
          }));
          return;
        }
      }
      this.logger.info(BootstrapLog.WS_SERVER_STARTED, stryMutAct_9fa48("13265") ? {} : (stryCov_9fa48("13265"), {
        nodeId: this.nodeId,
        wsPort: wsPort
      }));
    }
  }

  /**
   * Get the MessageRouter for cross-node communication.
   * @return {MessageRouter|null} The message router or null if not initialized.
   */
  getMessageRouter() {
    if (stryMutAct_9fa48("13266")) {
      {}
    } else {
      stryCov_9fa48("13266");
      return this.messageRouter;
    }
  }

  /**
   * Get the current bootstrap phase.
   * @return {string} Current phase.
   */
  getPhase() {
    if (stryMutAct_9fa48("13267")) {
      {}
    } else {
      stryCov_9fa48("13267");
      return this.phase;
    }
  }

  /**
   * Get the node lifecycle state machine.
   * @return {NodeLifecycleStateMachine} The lifecycle state machine.
   */
  getLifecycleStateMachine() {
    if (stryMutAct_9fa48("13268")) {
      {}
    } else {
      stryCov_9fa48("13268");
      return this.lifecycleStateMachine;
    }
  }

  /**
   * Get bootstrap status.
   * @return {Object} Bootstrap status.
   */
  getStatus() {
    if (stryMutAct_9fa48("13269")) {
      {}
    } else {
      stryCov_9fa48("13269");
      return stryMutAct_9fa48("13270") ? {} : (stryCov_9fa48("13270"), {
        nodeId: this.nodeId,
        phase: this.phase,
        startTime: this.startTime,
        duration: this.startTime ? stryMutAct_9fa48("13271") ? Date.now() + this.startTime : (stryCov_9fa48("13271"), Date.now() - this.startTime) : NUM.ZERO,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
        lastError: stryMutAct_9fa48("13274") ? this.lastError?.message && null : stryMutAct_9fa48("13273") ? false : stryMutAct_9fa48("13272") ? true : (stryCov_9fa48("13272", "13273", "13274"), (stryMutAct_9fa48("13275") ? this.lastError.message : (stryCov_9fa48("13275"), this.lastError?.message)) || null)
      });
    }
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    if (stryMutAct_9fa48("13276")) {
      {}
    } else {
      stryCov_9fa48("13276");
      return new Promise(stryMutAct_9fa48("13277") ? () => undefined : (stryCov_9fa48("13277"), resolve => setTimeout(resolve, ms)));
    }
  }

  /**
   * Shutdown the bootstrap service and all managed services.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("13278")) {
      {}
    } else {
      stryCov_9fa48("13278");
      if (stryMutAct_9fa48("13280") ? false : stryMutAct_9fa48("13279") ? true : (stryCov_9fa48("13279", "13280"), this.shutdownPromise)) {
        if (stryMutAct_9fa48("13281")) {
          {}
        } else {
          stryCov_9fa48("13281");
          return this.shutdownPromise;
        }
      }
      this.shutdownPromise = (async () => {
        if (stryMutAct_9fa48("13282")) {
          {}
        } else {
          stryCov_9fa48("13282");
          this.isShuttingDown = stryMutAct_9fa48("13283") ? false : (stryCov_9fa48("13283"), true);
          if (stryMutAct_9fa48("13285") ? false : stryMutAct_9fa48("13284") ? true : (stryCov_9fa48("13284", "13285"), this.deferredLatencyTopologyStartHandle)) {
            if (stryMutAct_9fa48("13286")) {
              {}
            } else {
              stryCov_9fa48("13286");
              if (stryMutAct_9fa48("13289") ? this.deferredLatencyTopologyStartKind === 'immediate' || typeof clearImmediate === 'function' : stryMutAct_9fa48("13288") ? false : stryMutAct_9fa48("13287") ? true : (stryCov_9fa48("13287", "13288", "13289"), (stryMutAct_9fa48("13291") ? this.deferredLatencyTopologyStartKind !== 'immediate' : stryMutAct_9fa48("13290") ? true : (stryCov_9fa48("13290", "13291"), this.deferredLatencyTopologyStartKind === (stryMutAct_9fa48("13292") ? "" : (stryCov_9fa48("13292"), 'immediate')))) && (stryMutAct_9fa48("13294") ? typeof clearImmediate !== 'function' : stryMutAct_9fa48("13293") ? true : (stryCov_9fa48("13293", "13294"), typeof clearImmediate === (stryMutAct_9fa48("13295") ? "" : (stryCov_9fa48("13295"), 'function')))))) {
                if (stryMutAct_9fa48("13296")) {
                  {}
                } else {
                  stryCov_9fa48("13296");
                  clearImmediate(this.deferredLatencyTopologyStartHandle);
                }
              } else {
                if (stryMutAct_9fa48("13297")) {
                  {}
                } else {
                  stryCov_9fa48("13297");
                  clearTimeout(this.deferredLatencyTopologyStartHandle);
                }
              }
              this.deferredLatencyTopologyStartHandle = null;
              this.deferredLatencyTopologyStartKind = null;
            }
          }
          if (stryMutAct_9fa48("13300") ? typeof setImmediate !== 'function' : stryMutAct_9fa48("13299") ? false : stryMutAct_9fa48("13298") ? true : (stryCov_9fa48("13298", "13299", "13300"), typeof setImmediate === (stryMutAct_9fa48("13301") ? "" : (stryCov_9fa48("13301"), 'function')))) {
            if (stryMutAct_9fa48("13302")) {
              {}
            } else {
              stryCov_9fa48("13302");
              await new Promise(stryMutAct_9fa48("13303") ? () => undefined : (stryCov_9fa48("13303"), resolve => setImmediate(resolve)));
            }
          }
          this.logger.info(BootstrapLog.SHUTDOWN, stryMutAct_9fa48("13304") ? {} : (stryCov_9fa48("13304"), {
            nodeId: this.nodeId,
            messageGroupServices: this.messageGroupServices.size,
            partitionServices: this.partitionServices.size
          }));
          await this.seedCleanupHandler.cleanup();
          this.emit(BootstrapEvent.SHUTDOWN, stryMutAct_9fa48("13305") ? {} : (stryCov_9fa48("13305"), {
            nodeId: this.nodeId
          }));
        }
      })();
      return this.shutdownPromise;
    }
  }

  /**
   * Bootstrap and exit on failure.
   * This is the main entry point for seed node startup.
   * @param {Object} options - Bootstrap options.
   * @return {Promise<Object>} Bootstrap result.
   */
  static async bootstrapOrExit(options = {}) {
    if (stryMutAct_9fa48("13306")) {
      {}
    } else {
      stryCov_9fa48("13306");
      const bootstrap = new BootstrapService(options);
      const result = await bootstrap.bootstrap();
      if (stryMutAct_9fa48("13309") ? false : stryMutAct_9fa48("13308") ? true : stryMutAct_9fa48("13307") ? result.success : (stryCov_9fa48("13307", "13308", "13309"), !result.success)) {
        if (stryMutAct_9fa48("13310")) {
          {}
        } else {
          stryCov_9fa48("13310");
          const loggingService = LoggingService.getInstance();
          const logger = loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE);
          logger.error(BootstrapLog.BOOTSTRAP_EXIT_FAILED, stryMutAct_9fa48("13311") ? {} : (stryCov_9fa48("13311"), {
            nodeId: result.nodeId,
            error: result.error,
            phase: result.phase
          }));

          // Exit with non-zero code (Requirement 6.16)
          process.exit(NUM.ONE);
        }
      }
      return result;
    }
  }
}
export { BootstrapService, BootstrapPhase, DEFAULT_BOOTSTRAP_CONFIG };