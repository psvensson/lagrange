/**
 * Daemon-only process adapter. Reusable startup lives in
 * `lagrange-runtime-startup.js` and owns no process lifecycle policy.
 */
import './boot/load-env.js';
import {EventLoopGapWatchdog} from './diagnostics/event-loop-gap-watchdog.js';
import {
  checkVersionFlag,
  createShutdownSignalHandler,
  parseCommandLineArgs,
  registerProcessLifecycleDiagnostics,
  registerShutdownSignalHandlers,
  scheduleStartupLivenessPulse,
} from './entrypoint-runtime-helpers.js';
import {ENTRYPOINT_TEXT} from './constants/entrypoint.js';
import {VERSION} from './public-api.js';
import {startLagrangeRuntime} from './lagrange-runtime-startup.js';

export * from './public-api.js';

function snapshotProcessEnvironment() {
  const snapshot = Object.create(null);
  for (const [key, value] of Object.entries(process.env)) {
    snapshot[key] = value;
  }
  return Object.freeze(snapshot);
}

async function main() {
  if (checkVersionFlag(VERSION)) return;

  const cliArgs = parseCommandLineArgs();
  const environment = snapshotProcessEnvironment();
  const eventLoopGapWatchdog = new EventLoopGapWatchdog();
  eventLoopGapWatchdog.start();

  const runtime = await startLagrangeRuntime({
    cliArgs,
    configuration: Object.freeze(Object.create(null)),
    environment,
  });
  if (runtime.dryRun === true) return;

  registerProcessLifecycleDiagnostics(runtime.logger, () => ({
    nodeId: runtime.nodeId,
    pid: process.pid,
  }));
  scheduleStartupLivenessPulse(runtime);
  const handleShutdownSignal = createShutdownSignalHandler({
    failureMessage: 'Failed to shutdown Lagrange runtime cleanly',
    logger: runtime.logger,
    shutdownRuntime: runtime.shutdownRuntime,
  });
  registerShutdownSignalHandlers(handleShutdownSignal);
}

main().catch((error) => {
  console.error(`${ENTRYPOINT_TEXT.FATAL_ERROR_PREFIX}`, error);
  process.exit(1);
});
