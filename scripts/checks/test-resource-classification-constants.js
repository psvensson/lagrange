// Canonical literal owners for the resource classification surface.
// Domain scalars live here per system-guidelines.md §4; consumers import,
// never re-declare.
//
// Resource class is ORTHOGONAL to primary class: a test is independently
// "what kind of test it is" (unit/integration/bootstrap/...) and "what it
// costs to run" (ordinary/cpu-heavy/external-toolchain/exclusive). A wasm
// integration test is primary=integration AND resource=external-toolchain;
// neither dimension implies the other.

export const RESOURCE_CLASS_SCHEMA_VERSION = 1;

export const RESOURCE_CLASS_ORDINARY = 'ordinary';
export const RESOURCE_CLASS_CPU_HEAVY = 'cpu-heavy';
export const RESOURCE_CLASS_EXTERNAL_TOOLCHAIN = 'external-toolchain';
export const RESOURCE_CLASS_EXCLUSIVE = 'exclusive';

export const RESOURCE_CLASSES = Object.freeze([
  RESOURCE_CLASS_ORDINARY,
  RESOURCE_CLASS_CPU_HEAVY,
  RESOURCE_CLASS_EXTERNAL_TOOLCHAIN,
  RESOURCE_CLASS_EXCLUSIVE,
]);

// Concurrency each class may safely run at on the 2-vCPU hosted runner.
// external-toolchain is 1 because a single such test can itself consume
// ~3.7 cores (measured 2026-08-17: service-init-wasm-scaffold real 17.5s vs
// user 64s), so a nominal job count understates true CPU demand.
export const RESOURCE_CLASS_JOBS = Object.freeze({
  [RESOURCE_CLASS_ORDINARY]: 4,
  [RESOURCE_CLASS_CPU_HEAVY]: 2,
  [RESOURCE_CLASS_EXTERNAL_TOOLCHAIN]: 1,
  [RESOURCE_CLASS_EXCLUSIVE]: 1,
});

// A host's own ceiling on any lane's workers, handed to the classified runner
// in this one env: a placed lab run sets it to the remote host's processor
// count less one, discovered there at run time. A lane is lowered to it,
// never raised.
export const LANE_JOBS_CAP_ENV = 'LAGRANGE_LANE_JOBS_CAP';

// The ordinary lane's workers on a placed lab host, handed to the classified
// runner in this one env beside the cap. Only the placement shell sets it,
// computed on the host at run time by the shell placedOrdinaryLaneJobsShell
// generates; a local or unplaced run never has it and keeps the lane's own
// count. The planner prices a host with placedOrdinaryLaneJobs, the same rule.
export const PLACED_ORDINARY_LANE_JOBS_ENV = 'LAGRANGE_PLACED_ORDINARY_LANE_JOBS';
// The most workers a placed host's ordinary lane is ever raised to.
export const PLACED_ORDINARY_LANE_JOBS_MAX = 8;
// Two of every three processors, so the host keeps a third for the thermal
// gate's relief, the ssh relay and the tests' own child processes.
const PLACED_ORDINARY_CORES_NUMERATOR = 2;
const PLACED_ORDINARY_CORES_DENOMINATOR = 3;
// At most one ordinary worker per whole GiB of the host's total memory.
const KIB_PER_GIB = 1024 * 1024;
// What the lab probe calls a host whose thermal gate has a source to read.
export const THERMAL_SOURCE_MEASURED = 'measured';
// Never below the lane's own count: lowering is the cap's work alone.
const PLACED_ORDINARY_BASE_JOBS = RESOURCE_CLASS_JOBS[RESOURCE_CLASS_ORDINARY];

function isWholeNumber(value) {
  return Number.isInteger(value) && value >= 0;
}

/**
 * The ordinary lane's workers on a placed lab host, from what the host says
 * of itself at run time: two thirds of its processors, never fewer than the
 * lane's own count nor more than PLACED_ORDINARY_LANE_JOBS_MAX, at most one
 * per whole GiB of total memory, and always within the host's lane cap (its
 * processors less one). No raise where total memory cannot be read, nor where
 * the thermal gate has nothing to read - a raised lane must be one the gate
 * can hold. Null when the processors are unknown: the shell then sets nothing.
 * @param {{cores: number|null, memKiB: number|null, thermal: string|null}} host
 * @return {number|null}
 */
export function placedOrdinaryLaneJobs({cores, memKiB, thermal}) {
  if (!isWholeNumber(cores) || cores === 0) return null;
  const cap = cores > 1 ? cores - 1 : 1;
  let jobs = PLACED_ORDINARY_BASE_JOBS;
  if (isWholeNumber(memKiB) && thermal === THERMAL_SOURCE_MEASURED) {
    const byCores = Math.min(PLACED_ORDINARY_LANE_JOBS_MAX, Math.floor(
      (cores * PLACED_ORDINARY_CORES_NUMERATOR) / PLACED_ORDINARY_CORES_DENOMINATOR));
    jobs = Math.max(PLACED_ORDINARY_BASE_JOBS,
      Math.min(byCores, Math.floor(memKiB / KIB_PER_GIB)));
  }
  return Math.min(jobs, cap);
}

/**
 * The same rule as POSIX shell arithmetic, for the placement shell to run on
 * the host. It reads the shell variables `cores`, `mem_kib` and `thermal`
 * (the lab probe's own facts, computed there) and exports
 * PLACED_ORDINARY_LANE_JOBS_ENV, or leaves it unset when `cores` is unknown.
 * @return {string[]} the lines, in order
 */
export function placedOrdinaryLaneJobsShell() {
  const env = PLACED_ORDINARY_LANE_JOBS_ENV;
  const base = PLACED_ORDINARY_BASE_JOBS;
  return [
    `unset ${env}`,
    'case "$cores" in ""|*[!0-9]*|0) ;; *)',
    `  ordinary=${base}`,
    `  case "$mem_kib" in ""|*[!0-9]*) ;; *) if [ "$thermal" = ${THERMAL_SOURCE_MEASURED} ]; then`,
    `    ordinary=$((cores * ${PLACED_ORDINARY_CORES_NUMERATOR} / ` +
      `${PLACED_ORDINARY_CORES_DENOMINATOR}))`,
    `    [ "$ordinary" -le ${PLACED_ORDINARY_LANE_JOBS_MAX} ] || ` +
      `ordinary=${PLACED_ORDINARY_LANE_JOBS_MAX}`,
    `    [ "$ordinary" -le $((mem_kib / ${KIB_PER_GIB})) ] || ` +
      `ordinary=$((mem_kib / ${KIB_PER_GIB}))`,
    `    [ "$ordinary" -ge ${base} ] || ordinary=${base}`,
    '  fi;; esac',
    '  [ "$ordinary" -le $((cores - 1)) ] || ordinary=$((cores - 1))',
    '  [ "$ordinary" -ge 1 ] || ordinary=1',
    `  export ${env}="$ordinary";;`,
    'esac',
  ];
}

export const RESOURCE_CLASS_MANIFEST_ID = 'test-resource-classification';
export const RESOURCE_CLASS_MANIFEST_PATH = 'test/shards/resource-classes.json';

// One curated shard per non-default class; everything absent is ordinary.
export const RESOURCE_CLASS_SHARD_PATHS = Object.freeze({
  [RESOURCE_CLASS_CPU_HEAVY]: 'test/shards/resource-cpu-heavy.txt',
  [RESOURCE_CLASS_EXTERNAL_TOOLCHAIN]:
    'test/shards/resource-external-toolchain.txt',
  [RESOURCE_CLASS_EXCLUSIVE]: 'test/shards/resource-exclusive.txt',
});

// Host requirement: a THIRD dimension, orthogonal to both. Primary says what
// a test is, resource what it costs; a host requirement is a property of the
// machine the test's assertions are only true on, which the lab probe
// measures per host (scripts/lab/probe.js) and placement honours: a file is
// never given to a host that does not provide what it requires, and a file
// no host of the run provides for is reported unplaceable, never skipped.
// One curated list per requirement; a file on none requires nothing.
//
// loopback-refusal: a TCP connect to a loopback port nobody listens on is
// refused at once. A WSL2 host with mirrored networking answers nothing for
// a port that was never bound there, and the connect ends ETIMEDOUT after
// about 130 s (measured 2026-11-11), so a test asserting ECONNREFUSED, or
// probing a not-yet-open listener in a tight loop, means something else there.
export const HOST_REQUIREMENT_LOOPBACK_REFUSAL = 'loopback-refusal';
export const HOST_REQUIREMENTS = Object.freeze([HOST_REQUIREMENT_LOOPBACK_REFUSAL]);
export const HOST_REQUIREMENT_SHARD_PATHS = Object.freeze({
  [HOST_REQUIREMENT_LOOPBACK_REFUSAL]: 'test/shards/host-loopback-refusal.txt',
});
export const HOST_REQUIREMENT_UNKNOWN_PATH_PROBLEM =
  'host requirement list names a path that is not in the live test census';

export const RESOURCE_CLASS_SEPARATOR = ':';
export const RESOURCE_DIGEST_ALGORITHM_LABEL = 'fnv1a32';
export const RESOURCE_DIGEST_HEX_WIDTH = 8;
export const RESOURCE_FNV1A32_OFFSET_BASIS = 0x811c9dc5;
export const RESOURCE_FNV1A32_PRIME = 0x01000193;

export const RESOURCE_MANIFEST_NOT_OBJECT_PROBLEM =
  'resource manifest is not an object';
export const RESOURCE_CLASSES_NOT_OBJECT_PROBLEM =
  'resource manifest.classes is not an object';
export const RESOURCE_UNKNOWN_CLASS_PROBLEM = 'unknown resource class';
export const RESOURCE_UNKNOWN_PATH_PROBLEM =
  'curated shard names a path that is not in the live test census';
export const RESOURCE_DUPLICATE_PATH_PROBLEM =
  'path claimed by more than one curated resource shard';
export const RESOURCE_MISSING_PATH_PROBLEM =
  'live test census file missing from the resource manifest';
export const RESOURCE_EXTRA_PATH_PROBLEM =
  'resource manifest names a file absent from the live test census';
