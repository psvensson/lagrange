const REQUIRED_REPLICATION_FACTOR = 3;

const COMPARISON_VIEW = Object.freeze({
  ARCHITECTURE_NATIVE: 'architecture-native',
  MATCHED_TOTAL_BUDGET: 'matched-total-budget',
});

function normalizePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${label} requires a positive integer`);
  }
  return number;
}

function normalizePositiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} requires a positive number`);
  }
  return number;
}

function normalizeNonNegativeNumber(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} requires a non-negative number`);
  }
  return number;
}

function normalizeText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function normalizeView(value) {
  const view = normalizeText(value, 'comparison view');
  if (!Object.values(COMPARISON_VIEW).includes(view)) {
    throw new Error(`unsupported comparison view ${view}`);
  }
  return view;
}

function normalizeVmRole(value, index) {
  const label = `VM role ${index + 1}`;
  return Object.freeze({
    role: normalizeText(value?.role, `${label} role`),
    machineType: normalizeText(value?.machineType, `${label} machineType`),
    count: normalizePositiveInteger(value?.count, `${label} count`),
    vcpuPerVm: normalizePositiveNumber(value?.vcpuPerVm, `${label} vcpuPerVm`),
    memoryGbPerVm: normalizePositiveNumber(
      value?.memoryGbPerVm,
      `${label} memoryGbPerVm`,
    ),
  });
}

function normalizeDiskRole(value, index) {
  const label = `disk role ${index + 1}`;
  return Object.freeze({
    role: normalizeText(value?.role, `${label} role`),
    type: normalizeText(value?.type, `${label} type`),
    count: normalizePositiveInteger(value?.count, `${label} count`),
    sizeGbPerDisk: normalizePositiveNumber(
      value?.sizeGbPerDisk,
      `${label} sizeGbPerDisk`,
    ),
    provisionedIopsPerDisk: normalizeNonNegativeNumber(
      value?.provisionedIopsPerDisk,
      `${label} provisionedIopsPerDisk`,
    ),
    provisionedThroughputMbPerSecPerDisk: normalizeNonNegativeNumber(
      value?.provisionedThroughputMbPerSecPerDisk,
      `${label} provisionedThroughputMbPerSecPerDisk`,
    ),
  });
}

function addToMap(map, key, value) {
  map.set(key, (map.get(key) || 0) + value);
}

function sortedObject(map) {
  return Object.freeze(Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  ));
}

function summarizeVmRoles(vmRoles) {
  const machineCounts = new Map();
  let vmCount = 0;
  let vcpu = 0;
  let memoryGb = 0;
  for (const role of vmRoles) {
    vmCount += role.count;
    vcpu += role.count * role.vcpuPerVm;
    memoryGb += role.count * role.memoryGbPerVm;
    addToMap(machineCounts, role.machineType, role.count);
  }
  return Object.freeze({
    vmCount,
    vcpu,
    memoryGb,
    machineCounts: sortedObject(machineCounts),
  });
}

function summarizeDiskRoles(diskRoles) {
  const byType = new Map();
  let capacityGb = 0;
  let provisionedIops = 0;
  let provisionedThroughputMbPerSec = 0;
  for (const role of diskRoles) {
    capacityGb += role.count * role.sizeGbPerDisk;
    provisionedIops += role.count * role.provisionedIopsPerDisk;
    provisionedThroughputMbPerSec +=
      role.count * role.provisionedThroughputMbPerSecPerDisk;
    const current = byType.get(role.type) || {
      capacityGb: 0,
      provisionedIops: 0,
      provisionedThroughputMbPerSec: 0,
    };
    current.capacityGb += role.count * role.sizeGbPerDisk;
    current.provisionedIops += role.count * role.provisionedIopsPerDisk;
    current.provisionedThroughputMbPerSec +=
      role.count * role.provisionedThroughputMbPerSecPerDisk;
    byType.set(role.type, current);
  }
  return Object.freeze({
    capacityGb,
    provisionedIops,
    provisionedThroughputMbPerSec,
    byType: sortedObject(byType),
  });
}

function normalizeComparativeSystemBudget(value = {}) {
  const system = normalizeText(value.system, 'system');
  const view = normalizeView(value.view);
  const replicationFactor = normalizePositiveInteger(
    value.replicationFactor,
    `${system} replicationFactor`,
  );
  if (replicationFactor !== REQUIRED_REPLICATION_FACTOR) {
    throw new Error(
      `${system} comparison requires RF=${REQUIRED_REPLICATION_FACTOR}`,
    );
  }
  if (value.loadGeneratorExcluded !== true) {
    throw new Error(`${system} comparison must exclude the load generator`);
  }

  const vmRoles = Array.isArray(value.vmRoles) ?
    value.vmRoles.map(normalizeVmRole) : [];
  if (vmRoles.length < 1) throw new Error(`${system} requires VM roles`);
  const diskRoles = Array.isArray(value.diskRoles) ?
    value.diskRoles.map(normalizeDiskRole) : [];

  return Object.freeze({
    system,
    view,
    replicationFactor,
    loadGeneratorExcluded: true,
    vmRoles: Object.freeze(vmRoles),
    diskRoles: Object.freeze(diskRoles),
    totals: Object.freeze({
      vm: summarizeVmRoles(vmRoles),
      disk: summarizeDiskRoles(diskRoles),
    }),
  });
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]),
  );
}

function assertSame(label, left, right) {
  const leftValue = JSON.stringify(canonical(left));
  const rightValue = JSON.stringify(canonical(right));
  if (leftValue !== rightValue) {
    throw new Error(
      `matched-total-budget mismatch for ${label}: ${leftValue} != ${rightValue}`,
    );
  }
}

function assertMatchedTotalBudget(leftValue, rightValue) {
  const left = normalizeComparativeSystemBudget(leftValue);
  const right = normalizeComparativeSystemBudget(rightValue);
  if (left.view !== COMPARISON_VIEW.MATCHED_TOTAL_BUDGET ||
      right.view !== COMPARISON_VIEW.MATCHED_TOTAL_BUDGET) {
    throw new Error('matched budget assertion requires matched-total-budget views');
  }
  assertSame('replication factor', left.replicationFactor, right.replicationFactor);
  assertSame('VM count', left.totals.vm.vmCount, right.totals.vm.vmCount);
  assertSame('vCPU', left.totals.vm.vcpu, right.totals.vm.vcpu);
  assertSame('memory GB', left.totals.vm.memoryGb, right.totals.vm.memoryGb);
  assertSame('machine classes', left.totals.vm.machineCounts, right.totals.vm.machineCounts);
  assertSame('disk capacity GB', left.totals.disk.capacityGb, right.totals.disk.capacityGb);
  assertSame('disk classes', left.totals.disk.byType, right.totals.disk.byType);
  return Object.freeze({left, right});
}

export {
  COMPARISON_VIEW,
  REQUIRED_REPLICATION_FACTOR,
  assertMatchedTotalBudget,
  normalizeComparativeSystemBudget,
};
