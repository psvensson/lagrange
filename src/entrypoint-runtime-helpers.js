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
  createReadinessStateWithDiagnostics,
  createSqlRuntimeComposition,
  hydrateBootstrapApiRuntime,
  isEarlyAdminSqlEngineEnabled,
  resolveSystemCacheHandles,
  reportStartupRuntimeHandoff,
  startAdminRuntimeComposition,
} from './entrypoint-runtime-admin-composition.js';

export {
  createRuntimeShutdown,
  createShutdownSignalHandler,
  registerProcessLifecycleDiagnostics,
  registerShutdownSignalHandlers,
  scheduleStartupLivenessPulse,
  shutdownDynamicConfigWiring,
  startDynamicConfigWiring,
  startLogsTablePersistence,
} from './entrypoint-runtime-shutdown-lifecycle.js';
