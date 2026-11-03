/**
 * Child process for the startup liveness witness: starts one Cell whose
 * worker never posts `ready`, prints the typed outcome as one JSON line,
 * and does NOT call shutdown. The parent asserts that this process exits
 * by itself, so no Cell worker can have outlived the startup bound.
 */
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {
  STARTUP_WITNESS_COMPONENT_BYTES,
  STARTUP_WITNESS_CELL_BUDGETS,
} from './wasi-component-startup-witness-fixture.js';

const NEVER_READY_WORKER_PATH = new URL(
  './wasi-component-never-ready-worker-child.js',
  import.meta.url,
).pathname;
const SERVICE_ID = 'startup-liveness-witness';

const runtime = new WasiComponentCellRuntime({
  workerPath: NEVER_READY_WORKER_PATH,
});
const startedAtMs = Date.now();
try {
  await runtime.start({
    budgets: STARTUP_WITNESS_CELL_BUDGETS,
    bytes: STARTUP_WITNESS_COMPONENT_BYTES,
    capabilities: [],
    exportName: 'run',
    serviceId: SERVICE_ID,
    world: 'request-cell',
  });
  process.stdout.write(`${JSON.stringify({outcome: 'started'})}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    budgetMs: error.budgetMs,
    code: error.code,
    elapsedMs: error.elapsedMs,
    instanceCount: runtime.instanceCount,
    message: error.message,
    name: error.name,
    observedMs: Date.now() - startedAtMs,
    outcome: 'rejected',
    phase: error.phase,
  })}\n`);
}
