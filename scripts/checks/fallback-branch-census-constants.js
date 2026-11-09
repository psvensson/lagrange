/**
 * The vocabulary of the fallback-branch coverage census
 * (scripts/checks/fallback-branch-census.js): its schemas, the detector rows
 * it censuses, its classes, its lanes and the files a run directory holds.
 */

export const CENSUS_SCHEMA = 'fallback-census/1';
export const MERGED_SCHEMA = 'fallback-census-merged/1';
export const DEFAULT_CENSUS_PATH = 'data/fallback-census/census.json';
export const RUN_RECORD_FILE = 'run.json';
export const V8_DIRECTORY = 'v8';
export const SOURCE_PREFIX = 'src/';
// How often every thread under the census preload flushes its coverage.
export const FLUSH_INTERVAL_MS = 10_000;

// The pre-kill flush (fallback-branch-census-preload.js serves it,
// test/test-helpers/census-pre-kill-flush.js requests it). collect sets
// CENSUS_COVERAGE_DIR_ENV to the lane's coverage directory: a harness flushes
// a child before killing it only when it is set, never on NODE_V8_COVERAGE
// alone. The request travels as FLUSH_SIGNAL, whose default action is to be
// ignored (a child without the preload is untouched) and which no repository
// code, Node or libuv listens for; a process asking for its own flush emits
// FLUSH_PROCESS_EVENT instead.
export const CENSUS_COVERAGE_DIR_ENV = 'LAGRANGE_CENSUS_COVERAGE_DIR';
export const FLUSH_SIGNAL = 'SIGURG';
export const FLUSH_PROCESS_EVENT = 'lagrange:census-flush-before-kill';
export const FLUSH_CHANNEL = 'lagrange-census-flush';
// Marker files of one thread: `witness-<pid>-<threadId><suffix>`.
export const WITNESS_MARKER = Object.freeze({
  PREFIX: 'witness-', SEPARATOR: '-', START: '.json', END: '-exit.json',
  FLUSH_REQUEST: '-flush-request.json', FLUSHED: '-flushed.json',
});
// The main thread waits this long for its workers' flush acknowledgements.
export const WORKER_ACK_BOUND_MS = 1500;
// The harness waits this long for the main thread's acknowledgement.
export const PRE_KILL_ACK_BOUND_MS = 5000;
// A thread that acknowledged a final flush stays frozen this long for the
// kill; past it, it withdraws its acknowledgement and runs on.
export const FREEZE_BOUND_MS = 30_000;

// What collect gives a lane beyond coverage. The affinity demo's node stop
// deadline (examples/service-data-affinity/run-affinity-demo.js) is long
// enough for the formation seed's shutdown drain, so it exits and writes its
// coverage instead of being SIGKILLed; the test runner's heap limit
// (scripts/run-test-files.js) leaves room for coverage writes.
export const DEMO_STOP_DEADLINE_ENV = 'LAGRANGE_AFFINITY_DEMO_STOP_DEADLINE_MS';
export const CENSUS_DEMO_STOP_DEADLINE_MS = 300_000;
export const TEST_HEAP_ENV = 'LAGRANGE_TEST_MAX_OLD_SPACE_MB';
export const CENSUS_TEST_HEAP_MB = 2048;
// Piscina's idle workers block in Atomics.wait between tasks (its default
// `useAtomics`), so no timer, flush interval or flush request reaches them;
// piscina's own switch makes them wait on their event loop instead.
export const PISCINA_ATOMICS_ENV = 'PISCINA_DISABLE_ATOMICS';
export const PISCINA_ATOMICS_DISABLED = '1';

// The detector rows (scripts/checks/code-navigability-detectors.js) whose
// sites the census classifies.
export const CENSUS_ROWS = Object.freeze([
  'two_source_fallback_reads', 'typeof_dual_paths', 'catch_returns_default',
]);

export const CENSUS_CLASS = Object.freeze({
  UNLOADED: 'unloaded',
  // Loaded, with one side never seen, while a lost witness (a thread that
  // left no complete coverage) had the file in its import closure: the
  // missing side may have run there. Uncensused, like unloaded.
  UNOBSERVED: 'unobserved',
  NEVER: 'never',
  PRIMARY_ONLY: 'primary-only',
  FALLBACK_ONLY: 'fallback-only',
  BOTH: 'both',
});

export const CENSUS_LANE = Object.freeze({
  UNIT: 'unit', PACKAGING: 'packaging', INTEGRATION: 'integration',
  BOOTSTRAP: 'bootstrap', FORMATION: 'formation',
});
