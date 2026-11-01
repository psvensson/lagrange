// The single B1 call site: an absent entry is typed unavailability; a B1 run
// that never handed the loaded dataset over is refused; a dataset that fails
// verification stops the run before measurement; the load generator is never
// a product host of the arm.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createWorkloadRunExecutor,
  loadCanonicalWorkloadEntry,
} from '../comparative-benchmark-workload-call-site.js';
import {expectedCanonicalTableRows} from '../real-product-dataset-verification.js';
import {arrayMap} from '../real-product-captured-intrinsics.js';

const WORKLOAD = Object.freeze({warehouseCount: 1, districtsPerWarehouse: 1,
  customersPerDistrict: 2, itemCount: 15});
const MANIFEST = {plan: {workload: WORKLOAD, warmup: {}, slo: {}, semanticProfileId: 'p'}};
const RUN = {runId: 'r1', targetId: 'lagrange', offeredRatePerSec: 5};

function deployment(readTableRows) {
  const expected = expectedCanonicalTableRows(WORKLOAD);
  return {roles: [{role: 'n', host: '10.0.0.1', containerId: 'c1'}],
    endpoint: {protocol: 'postgresql', host: '10.0.0.1', port: 5433, containerId: 'c1'},
    access: {connection: {user: 'u'}},
    operations: {
      readTableRows: readTableRows ||
        (async (table) => arrayMap(expected[table.name], (row) => ({...row}))),
      observePlacement: async () => ({replicasByPartition: []}),
    }};
}

function executor(runCanonicalWorkload, clientHost = '10.0.0.9') {
  return createWorkloadRunExecutor({runCanonicalWorkload, sshRun: async () => '', opts: {},
    clientHost, describeLoadGenerator: async () => ({node: 'v22'})});
}

test('an absent canonical workload entry is workload_entry_unavailable', async () => {
  await assert.rejects(loadCanonicalWorkloadEntry(async () => {
    throw new Error('Cannot find module');
  }), (error) => error.code === 'workload_entry_unavailable');
  await assert.rejects(loadCanonicalWorkloadEntry(async () => ({})),
    (error) => error.code === 'workload_entry_unavailable');
});

test('a workload that measured without the dataset hand-over is refused', async () => {
  const run = executor(async () => ({observations: {accounting: {}}}));
  await assert.rejects(run({run: RUN, manifest: MANIFEST, deployment: deployment()}),
    (error) => error.code === 'dataset_unverified');
});

test('a failed dataset verification stops the run before measurement', async () => {
  let measured = false;
  const run = executor(async ({beforeMeasurement}) => {
    await beforeMeasurement();
    measured = true;
    return {observations: {}};
  });
  await assert.rejects(run({run: RUN, manifest: MANIFEST,
    deployment: deployment(async () => [])}), (error) => error.code === 'dataset_unverified');
  assert.equal(measured, false);
});

test('a verified hand-over returns observations, dataset, placement and the load ' +
  'generator identity', async () => {
  let seen = null;
  const run = executor(async (input) => {
    seen = input;
    await input.beforeMeasurement();
    return {observations: {accounting: {offered: 1}}, correctness: {semanticGate: null}};
  });
  const result = await run({run: RUN, manifest: MANIFEST, deployment: deployment()});
  assert.deepEqual(seen.endpoint, {host: '10.0.0.1', port: 5433});
  assert.equal(seen.offeredRatePerSec, 5);
  assert.equal(result.dataset.keyCoverage.present, result.dataset.keyCoverage.expected);
  assert.deepEqual(result.placement, {replicasByPartition: []});
  assert.equal(result.loadGenerator.notProductHost, true);
  assert.equal(result.loadGenerator.host, '10.0.0.9');
});

test('a load generator on a product host is refused before the workload runs', async () => {
  let called = false;
  const run = executor(async () => {
    called = true;
  }, '10.0.0.1');
  await assert.rejects(run({run: RUN, manifest: MANIFEST, deployment: deployment()}),
    (error) => error.code === 'load_generator_colocated');
  assert.equal(called, false);
});
