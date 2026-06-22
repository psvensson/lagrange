import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {applyCDCIntegrationServiceLifecycleMethods} from
  './cdc-integration-service-lifecycle.js';
import {applyCDCIntegrationServiceAuthoritativeReadDelegates} from
  './cdc-integration-service-authoritative-read-delegates.js';
import {applyCDCRoutedMutationReadiness} from
  './cdc-routed-mutation-readiness.js';
import {applyCDCIntegrationServiceCacheVisibilityWait} from
  './cdc-integration-service-cache-visibility-wait.js';
import {applyCDCIntegrationServiceMutationOperations} from
  './cdc-integration-service-mutation-operations.js';
import {applyCDCIntegrationServiceCdcEventDelegates} from
  './cdc-integration-service-cdc-event-delegates.js';

const {
  AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS,
  AUTHORITATIVE_FALLBACK_RETRY_DELAY_MS,
  AUTHORITATIVE_FALLBACK_WINDOW_MS,
  CDCOperationType,
  CDC_CONFIG_KEY,
  CDC_DEFAULTS,
  CDC_STATS_DEFAULT,
  CDC_SUBSYSTEM,
  ConfigurationManager,
  EPOCH_CONFIG_KEY,
  EventEmitter,
  HLCClockService,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  NUM,
  STRING,
  TYPEOF,
  VALID_SYSTEM_TABLES,
} = CDC_INTEGRATION_SERVICE_SHARED;

/**
 * CDC integration service: the single public owner of system-table writes,
 * authoritative reads, post-write cache visibility, and CDC event dispatch.
 *
 * The implementation is composed from semantic method-group modules attached to
 * this prototype via the project's `applyX(targetClass)` mixin idiom. The
 * construction-time state lives here; behavior lives in the mixed-in modules.
 */
class CDCIntegrationService extends EventEmitter {
  constructor(options = {}) {
    super();

    // Primary: SQL query engine for transparent routing
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.nodeId = options.nodeId || STRING.UNKNOWN;
    this.systemTableCache = options.systemTableCache || null;
    this.cacheMutationTarget =
      options.cacheMutationTarget ||
      (typeof options.systemTableCache?.applySystemTableChange ===
      TYPEOF.FUNCTION ?
        options.systemTableCache :
        null);

    // Bootstrap mode for seed node direct writes
    this.bootstrapMode = false;
    this.bootstrapCompleted = false;
    this.localPartitionServices = null;
    this.partitionServicesProvider =
      options.partitionServicesProvider instanceof Map ?
        () => options.partitionServicesProvider :
        typeof options.partitionServicesProvider === TYPEOF.FUNCTION ?
          options.partitionServicesProvider :
          null;
    this.writeRouter = this.createSqlWriteRouter();

    // HLC clock for timestamps
    this.hlcClock = new HLCClockService(this.nodeId);

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CDC_SUBSYSTEM.INTEGRATION) :
      console;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.retryMaxAttempts =
      config.get(CDC_CONFIG_KEY.RETRY_MAX_ATTEMPTS) ||
      CDC_DEFAULTS.RETRY_MAX_ATTEMPTS;
    this.retryDelayMs =
      config.get(CDC_CONFIG_KEY.RETRY_DELAY_MS) || CDC_DEFAULTS.RETRY_DELAY_MS;
    this.cacheWaitTimeoutMs =
      config.get(CDC_CONFIG_KEY.CACHE_WAIT_TIMEOUT_MS) ||
      CDC_DEFAULTS.CACHE_WAIT_TIMEOUT_MS;

    // Epoch manager reference for CDC epoch change handling
    this.epochManager = null;

    // Rebalancer reference for node state change handling
    this.rebalancer = null;

    // Message router reference for mesh connectivity on node join
    this.messageRouter = options.messageRouter || null;
    this.cdcEventHandler = null;

    // Statistics
    this.stats = {
      ...CDC_STATS_DEFAULT,
    };
    this.authoritativeFallbackHistory = [];
    this.authoritativeFallbackTotals = new Map();
    this.authoritativeFallbackWindowMs = AUTHORITATIVE_FALLBACK_WINDOW_MS;
    this.authoritativeFallbackRepairBudgetMs =
      Number.isFinite(options.authoritativeFallbackRepairBudgetMs) &&
      options.authoritativeFallbackRepairBudgetMs > NUM.ZERO ?
        Math.floor(options.authoritativeFallbackRepairBudgetMs) :
        AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS;
    this.authoritativeFallbackRetryDelayMs =
      Number.isFinite(options.authoritativeFallbackRetryDelayMs) &&
      options.authoritativeFallbackRetryDelayMs >= NUM.ZERO ?
        Math.floor(options.authoritativeFallbackRetryDelayMs) :
        AUTHORITATIVE_FALLBACK_RETRY_DELAY_MS;
    this.inFlightMutationsByKey = new Map();
    this.initialized = false;
    // Set on teardown so the routed-mutation retry-budget loop stops re-arming
    // instead of retrying writes forever once sqlQueryEngine is being nulled.
    this.isShuttingDown = false;
  }
}

// Compose the public service from its semantic method-group modules. Order is
// not significant (every module attaches to the same prototype); it follows the
// runtime flow: lifecycle/wiring -> authoritative reads -> routed mutation
// readiness -> cache visibility -> mutation operations -> CDC event dispatch.
applyCDCIntegrationServiceLifecycleMethods(CDCIntegrationService);
applyCDCIntegrationServiceAuthoritativeReadDelegates(CDCIntegrationService);
applyCDCRoutedMutationReadiness(CDCIntegrationService);
applyCDCIntegrationServiceCacheVisibilityWait(CDCIntegrationService);
applyCDCIntegrationServiceMutationOperations(CDCIntegrationService);
applyCDCIntegrationServiceCdcEventDelegates(CDCIntegrationService);

export {
  CDCIntegrationService,
  CDCOperationType,
  EPOCH_CONFIG_KEY,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  VALID_SYSTEM_TABLES,
};
