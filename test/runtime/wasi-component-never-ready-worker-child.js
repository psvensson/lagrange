/**
 * Fixture Cell worker for the startup liveness witness
 * (quest wasi-component-startup-budget). It reports that it reached the
 * instantiate phase, then holds its thread open without ever posting
 * `ready`. Only the runtime's terminate ends it, so a process that still
 * exits on its own proves the runtime terminated the worker at the bound.
 */
import {parentPort} from 'node:worker_threads';

const HOLD_OPEN_INTERVAL_MS = 1000;

parentPort.postMessage({phase: 'instantiate', type: 'phase'});
setInterval(() => {}, HOLD_OPEN_INTERVAL_MS);
