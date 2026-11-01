// D08: the dataset a run measures is the canonical one, loaded by the
// canonical adapters and verified by the workload owner (stream B1) through
// the product's public interface; this layer seeds nothing of its own and
// maps that verification into stream A's dataset shape, claiming key coverage
// only from a checksum equality.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {datasetRecordOf} from '../comparative-benchmark-workload-call-site.js';
import * as deployers from '../real-product-cluster-deployers.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  lagrangeHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arraySome,
} from '../real-product-captured-intrinsics.js';

test('D08: the deployer seeds no hand-written key set of its own', {timeout: 300000},
  async () => {
    const ledger = createContainerLedger();
    const hosts = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
    const {sshRun, calls} = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts}));
    await deployers.deployLagrangeCluster({hosts, clientIp: '10.0.0.9', sshRun,
      opts: {lagrangeImage: LAGRANGE_IMAGE, readiness: {attempts: 2, intervalMs: 0}},
      campaignId: 'camp-dataset', sleep: async () => {}});
    assert.equal(arraySome(calls, (call) => /bench_accounts|acct-0/u.test(call.text)), false);
  });

test('D08: a verified load (product snapshot checksum equals the generator\'s) is full ' +
  'key coverage in stream A\'s dataset shape', () => {
  const dataset = datasetRecordOf({resetMethod: 'fresh-formation', verification: {
    status: 'verified', method: 'logical-checksum', expectedLogicalChecksum: 'sha256:x',
    observedLogicalChecksum: 'sha256:x', expectedTableRows: {item: 20, stock: 20, orders: 0},
    observedTableRows: {item: 20, stock: 20, orders: 0}}});
  assert.deepEqual(dataset.keyCoverage, {expected: 40, present: 40,
    derivation: 'logical-checksum-equality'});
  assert.equal(dataset.logicalChecksum, 'sha256:x');
  assert.equal(dataset.resetMethod, 'fresh-formation');
  assert.deepEqual(dataset.tables[0], {table: 'item', rows: 20, expectedRows: 20});
});

test('D08: a mismatched or unobserved load claims no key coverage', () => {
  for (const status of ['mismatch', 'unobserved']) {
    const dataset = datasetRecordOf({resetMethod: 'fresh-formation', verification: {status,
      expectedTableRows: {item: 20}, observedTableRows: {item: 2}}});
    assert.equal(dataset.keyCoverage.present, null, status);
  }
});
