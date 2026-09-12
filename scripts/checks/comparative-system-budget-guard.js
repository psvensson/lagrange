import assert from 'node:assert/strict';
import {
  COMPARISON_VIEW,
  assertMatchedTotalBudget,
  normalizeComparativeSystemBudget,
} from '../../test/distributed/harness/comparative-system-budget.js';

const TIDB_MATCHED = Object.freeze({
  system: 'tidb-tikv',
  view: COMPARISON_VIEW.MATCHED_TOTAL_BUDGET,
  replicationFactor: 3,
  loadGeneratorExcluded: true,
  vmRoles: Object.freeze([
    Object.freeze({
      role: 'control-sql',
      machineType: 'n2-standard-4',
      count: 1,
      vcpuPerVm: 4,
      memoryGbPerVm: 16,
    }),
    Object.freeze({
      role: 'tikv-storage',
      machineType: 'n2-standard-4',
      count: 3,
      vcpuPerVm: 4,
      memoryGbPerVm: 16,
    }),
  ]),
  diskRoles: Object.freeze([
    Object.freeze({
      role: 'durable-data',
      type: 'pd-balanced',
      count: 3,
      sizeGbPerDisk: 100,
    }),
  ]),
});

const LAGRANGE_MATCHED = Object.freeze({
  system: 'lagrange',
  view: COMPARISON_VIEW.MATCHED_TOTAL_BUDGET,
  replicationFactor: 3,
  loadGeneratorExcluded: true,
  vmRoles: Object.freeze([
    Object.freeze({
      role: 'cluster',
      machineType: 'n2-standard-4',
      count: 4,
      vcpuPerVm: 4,
      memoryGbPerVm: 16,
    }),
  ]),
  diskRoles: Object.freeze([
    Object.freeze({
      role: 'durable-data',
      type: 'pd-balanced',
      count: 3,
      sizeGbPerDisk: 100,
    }),
  ]),
});

function expectRefusal(fn, pattern) {
  assert.throws(fn, pattern);
}

const tidb = normalizeComparativeSystemBudget(TIDB_MATCHED);
assert.equal(tidb.totals.vm.vmCount, 4);
assert.equal(tidb.totals.vm.vcpu, 16);
assert.equal(tidb.totals.vm.memoryGb, 64);
assert.equal(tidb.totals.disk.capacityGb, 300);
assert.deepEqual(tidb.totals.vm.machineCounts, {'n2-standard-4': 4});

const matched = assertMatchedTotalBudget(TIDB_MATCHED, LAGRANGE_MATCHED);
assert.equal(matched.left.system, 'tidb-tikv');
assert.equal(matched.right.system, 'lagrange');

expectRefusal(
  () => normalizeComparativeSystemBudget({
    ...TIDB_MATCHED,
    replicationFactor: 2,
  }),
  /requires RF=3/u,
);

expectRefusal(
  () => normalizeComparativeSystemBudget({
    ...TIDB_MATCHED,
    loadGeneratorExcluded: false,
  }),
  /must exclude the load generator/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    vmRoles: [{
      ...LAGRANGE_MATCHED.vmRoles[0],
      count: 3,
    }],
  }),
  /mismatch for VM count/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    vmRoles: [{
      ...LAGRANGE_MATCHED.vmRoles[0],
      vcpuPerVm: 2,
    }],
  }),
  /mismatch for vCPU/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    vmRoles: [{
      ...LAGRANGE_MATCHED.vmRoles[0],
      memoryGbPerVm: 8,
    }],
  }),
  /mismatch for memory GB/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    vmRoles: [{
      ...LAGRANGE_MATCHED.vmRoles[0],
      machineType: 'c4-standard-4',
    }],
  }),
  /mismatch for machine classes/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    diskRoles: [{
      ...LAGRANGE_MATCHED.diskRoles[0],
      sizeGbPerDisk: 90,
    }],
  }),
  /mismatch for disk capacity GB/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    diskRoles: [{
      ...LAGRANGE_MATCHED.diskRoles[0],
      type: 'pd-ssd',
    }],
  }),
  /mismatch for disk classes/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    view: COMPARISON_VIEW.ARCHITECTURE_NATIVE,
  }),
  /requires matched-total-budget views/u,
);

console.log('comparative system budget guard: ok');
