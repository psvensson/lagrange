export {
  checkVersionFlag,
  parseCommandLineArgs,
  parsePositiveTimeoutMs,
  resolveRuntimeAddresses,
  resolveRolloutControlsFromEnvironment,
} from './entrypoint-runtime-options.js';

export {
  resolveStartupJoinDecision,
  startRejoinHintsPersistence,
} from './entrypoint-runtime-join-decision.js';

export {
  attachSqlEngineToAdminRuntime,
  createAdminAPIWithLiveQuery,
  createReadinessStateWithDiagnostics,
  createServiceDiagnosticsProvider,
  createSqlCallbackWasmExecutor,
  createSqlRuntimeComposition,
  hydrateBootstrapApiRuntime,
  resolvePartitionServiceByPartitionId,
  resolveSystemCacheHandles,
  reportStartupRuntimeHandoff,
  shutdownAdminRuntimeComposition,
  startAdminRuntimeComposition,
} from './entrypoint-runtime-admin-composition.js';

export {
  createShutdownSignalHandler,
  registerProcessLifecycleDiagnostics,
  registerShutdownSignalHandlers,
  scheduleStartupLivenessPulse,
  shutdownDynamicConfigWiring,
  startDynamicConfigWiring,
  startLogsTablePersistence,
} from './entrypoint-runtime-shutdown-lifecycle.js';
