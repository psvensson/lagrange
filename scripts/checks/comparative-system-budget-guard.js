import assert from 'node:assert/strict';
import {
  COMPARISON_VIEW,
  assertMatchedTotalBudget,
  normalizeComparativeSystemBudget,
} from '../../test/distributed/harness/comparative-system-budget.js';

const objectFreeze = Object.freeze;

const TIDB_SYSTEM = 'tidb-tikv';
const LAGRANGE_SYSTEM = 'lagrange';
const VM_ROLE_CONTROL_SQL = 'control-sql';
const VM_ROLE_TIKV_STORAGE = 'tikv-storage';
const VM_ROLE_CLUSTER = 'cluster';
const MACHINE_TYPE_N2_STANDARD_4 = 'n2-standard-4';
const MACHINE_TYPE_C4_STANDARD_4 = 'c4-standard-4';
const DISK_ROLE_DURABLE_DATA = 'durable-data';
const DISK_TYPE_PD_BALANCED = 'pd-balanced';
const DISK_TYPE_PD_SSD = 'pd-ssd';

const EXPECTED_VM_COUNT = 4;
const EXPECTED_VCPU_TOTAL = 16;
const EXPECTED_MEMORY_GB_TOTAL = 64;
const EXPECTED_DISK_CAPACITY_GB_TOTAL = 300;
const EXPECTED_REPLICATION_FACTOR = 3;
const MUTATED_REPLICATION_FACTOR = 2;
const MUTATED_VM_COUNT = 3;
const MUTATED_VCPU_PER_VM = 2;
const MUTATED_MEMORY_GB_PER_VM = 8;
const MUTATED_DISK_SIZE_GB = 90;

const EXPECTED_MACHINE_COUNTS = objectFreeze({
  [MACHINE_TYPE_N2_STANDARD_4]: EXPECTED_VM_COUNT,
});

const GUARD_SUCCESS_MESSAGE = 'comparative system budget guard: ok';

const TIDB_MATCHED = objectFreeze({
  system: TIDB_SYSTEM,
  view: COMPARISON_VIEW.MATCHED_TOTAL_BUDGET,
  replicationFactor: EXPECTED_REPLICATION_FACTOR,
  loadGeneratorExcluded: true,
  vmRoles: objectFreeze([
    objectFreeze({
      role: VM_ROLE_CONTROL_SQL,
      machineType: MACHINE_TYPE_N2_STANDARD_4,
      count: 1,
      vcpuPerVm: 4,
      memoryGbPerVm: 16,
    }),
    objectFreeze({
      role: VM_ROLE_TIKV_STORAGE,
      machineType: MACHINE_TYPE_N2_STANDARD_4,
      count: 3,
      vcpuPerVm: 4,
      memoryGbPerVm: 16,
    }),
  ]),
  diskRoles: objectFreeze([
    objectFreeze({
      role: DISK_ROLE_DURABLE_DATA,
      type: DISK_TYPE_PD_BALANCED,
      count: 3,
      sizeGbPerDisk: 100,
    }),
  ]),
});

const LAGRANGE_MATCHED = objectFreeze({
  system: LAGRANGE_SYSTEM,
  view: COMPARISON_VIEW.MATCHED_TOTAL_BUDGET,
  replicationFactor: EXPECTED_REPLICATION_FACTOR,
  loadGeneratorExcluded: true,
  vmRoles: objectFreeze([
    objectFreeze({
      role: VM_ROLE_CLUSTER,
      machineType: MACHINE_TYPE_N2_STANDARD_4,
      count: 4,
      vcpuPerVm: 4,
      memoryGbPerVm: 16,
    }),
  ]),
  diskRoles: objectFreeze([
    objectFreeze({
      role: DISK_ROLE_DURABLE_DATA,
      type: DISK_TYPE_PD_BALANCED,
      count: 3,
      sizeGbPerDisk: 100,
    }),
  ]),
});

function expectRefusal(fn, pattern) {
  assert.throws(fn, pattern);
}

const tidb = normalizeComparativeSystemBudget(TIDB_MATCHED);
assert.equal(tidb.totals.vm.vmCount, EXPECTED_VM_COUNT);
assert.equal(tidb.totals.vm.vcpu, EXPECTED_VCPU_TOTAL);
assert.equal(tidb.totals.vm.memoryGb, EXPECTED_MEMORY_GB_TOTAL);
assert.equal(tidb.totals.disk.capacityGb, EXPECTED_DISK_CAPACITY_GB_TOTAL);
assert.deepEqual(tidb.totals.vm.machineCounts, EXPECTED_MACHINE_COUNTS);

const matched = assertMatchedTotalBudget(TIDB_MATCHED, LAGRANGE_MATCHED);
assert.equal(matched.left.system, TIDB_SYSTEM);
assert.equal(matched.right.system, LAGRANGE_SYSTEM);

expectRefusal(
  () => normalizeComparativeSystemBudget({
    ...TIDB_MATCHED,
    replicationFactor: MUTATED_REPLICATION_FACTOR,
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
      count: MUTATED_VM_COUNT,
    }],
  }),
  /mismatch for VM count/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    vmRoles: [{
      ...LAGRANGE_MATCHED.vmRoles[0],
      vcpuPerVm: MUTATED_VCPU_PER_VM,
    }],
  }),
  /mismatch for vCPU/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    vmRoles: [{
      ...LAGRANGE_MATCHED.vmRoles[0],
      memoryGbPerVm: MUTATED_MEMORY_GB_PER_VM,
    }],
  }),
  /mismatch for memory GB/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    vmRoles: [{
      ...LAGRANGE_MATCHED.vmRoles[0],
      machineType: MACHINE_TYPE_C4_STANDARD_4,
    }],
  }),
  /mismatch for machine classes/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    diskRoles: [{
      ...LAGRANGE_MATCHED.diskRoles[0],
      sizeGbPerDisk: MUTATED_DISK_SIZE_GB,
    }],
  }),
  /mismatch for disk capacity GB/u,
);

expectRefusal(
  () => assertMatchedTotalBudget(TIDB_MATCHED, {
    ...LAGRANGE_MATCHED,
    diskRoles: [{
      ...LAGRANGE_MATCHED.diskRoles[0],
      type: DISK_TYPE_PD_SSD,
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

console.log(GUARD_SUCCESS_MESSAGE);
