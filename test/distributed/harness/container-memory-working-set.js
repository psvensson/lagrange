/**
 * Canonical container-memory accounting for harness capacity observations.
 *
 * Docker and direct cgroup readers expose total cgroup usage, including
 * reclaimable inactive file pages. Capacity decisions use the same working-set
 * definition as Docker's Linux CLI: total usage minus reclaimable inactive
 * file memory, clamped at zero.
 */

const ZERO = 0;
const numberConstructor = Number;
const numberIsFinite = Number.isFinite;
const mathMax = Math.max;
const objectHasOwn = Object.hasOwn;

const DOCKER_RECLAIMABLE_MEMORY_FIELDS = Object.freeze([
  'total_inactive_file',
  'inactive_file',
  'cache',
]);

function nonNegativeMemoryCounter(value) {
  const numeric = numberConstructor(value);
  return numberIsFinite(numeric) && numeric > ZERO ? numeric : ZERO;
}

function calculateContainerMemoryWorkingSetBytes(
  usageBytes,
  reclaimableBytes,
) {
  return mathMax(
    ZERO,
    nonNegativeMemoryCounter(usageBytes) -
      nonNegativeMemoryCounter(reclaimableBytes),
  );
}

function resolveDockerReclaimableMemoryBytes(memoryStats = {}) {
  const counters = memoryStats?.stats;
  if (!counters || typeof counters !== 'object') {
    return ZERO;
  }
  for (const field of DOCKER_RECLAIMABLE_MEMORY_FIELDS) {
    if (objectHasOwn(counters, field)) {
      return nonNegativeMemoryCounter(counters[field]);
    }
  }
  return ZERO;
}

function resolveDockerMemoryWorkingSetBytes(memoryStats = {}) {
  return calculateContainerMemoryWorkingSetBytes(
    memoryStats?.usage,
    resolveDockerReclaimableMemoryBytes(memoryStats),
  );
}

export {
  calculateContainerMemoryWorkingSetBytes,
  resolveDockerMemoryWorkingSetBytes,
};
