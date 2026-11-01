// D08: the dataset a run measures is the canonical one, loaded through the
// canonical adapters and VERIFIED through the product's public interface:
// the product-content snapshot of all nine canonical tables (stream B1's
// collectOltpStateSnapshot) against the generator's expected digest, plus rows
// per table and key coverage against the plan's key space. The product reader
// is the substitute here: it answers with the generator's rows (or a mutation).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  lagrangeHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arrayMap,
  arraySome,
} from '../real-product-captured-intrinsics.js';

const WORKLOAD = Object.freeze({warehouseCount: 1, districtsPerWarehouse: 2,
  customersPerDistrict: 3, itemCount: 5});

function exactReader() {
  const expected = deployers.expectedCanonicalTableRows(WORKLOAD);
  return async (table) => arrayMap(expected[table.name], (row) => ({...row}));
}

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

test('D08: an exactly loaded canonical dataset verifies with full key coverage', async () => {
  const verified = await deployers.verifyCanonicalDataset({workload: WORKLOAD,
    readTableRows: exactReader()});
  assert.equal(verified.keyCoverage.present, verified.keyCoverage.expected);
  assert.ok(verified.keyCoverage.expected > 0);
  assert.equal(verified.logicalChecksum, verified.expectedChecksum);
  assert.equal(verified.method, 'collectOltpStateSnapshot');
  assert.equal(verified.resetMethod, 'fresh-formation');
  assert.deepEqual(arrayMap(verified.tables, (one) => one.table), ['warehouse', 'district',
    'customer', 'item', 'stock', 'orders', 'new_order', 'order_line', 'history']);
});

test('D08: keys missing from the plan key space are a typed dataset failure', async () => {
  const read = exactReader();
  await assert.rejects(deployers.verifyCanonicalDataset({workload: WORKLOAD,
    readTableRows: async (table) => {
      const rows = await read(table);
      return table.name === 'customer' ? rows.slice(0, 2) : rows;
    }}), (error) => {
    assert.equal(error.code, 'dataset_unverified');
    assert.ok(error.diagnostic.keyCoverage.present < error.diagnostic.keyCoverage.expected);
    return true;
  });
});

test('D08: a wrong value with full key coverage fails the logical checksum', async () => {
  const read = exactReader();
  await assert.rejects(deployers.verifyCanonicalDataset({workload: WORKLOAD,
    readTableRows: async (table) => {
      const rows = await read(table);
      return table.name === 'item' ? [{...rows[0], price_cents: 1}, ...rows.slice(1)] : rows;
    }}), (error) => {
    assert.equal(error.code, 'dataset_unverified');
    assert.notEqual(error.diagnostic.logicalChecksum, error.diagnostic.expectedChecksum);
    return true;
  });
});

test('D08: an unreadable projection is a typed dataset failure, never a pass', async () => {
  await assert.rejects(deployers.verifyCanonicalDataset({workload: WORKLOAD,
    readTableRows: async () => {
      throw new Error('relation "stock" does not exist');
    }}), (error) => error.code === 'dataset_unverified');
});
