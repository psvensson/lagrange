// Receipt (superseded in part by quest raft-rs-single-path-partition-cutover):
// the backend selection seam no longer exists. A partition has one consensus
// backend, built by PartitionService.createOperationPort; naming a backend is
// a typed refusal (single-path-partition-cutover.test.js). What remains here
// is measured from `src`, not from a literal this file owns:
//   1. the seam's interface, derived by parsing `src` - the production call
//      census - and compared against what each backend actually exposes;
//   2. that the rs-raft provider recreates no legacy node facade.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {LiferaftProvider} from '../../../src/raft/liferaft-provider.js';
import {RaftRsWasmProvider} from '../../../src/raft/raft-rs-provider.js';
import {
  censusNames,
  deriveProductionRaftCallCensus,
} from './production-raft-call-census.js';

test('the seam interface is the census of what production calls', async () => {
  const census = censusNames(deriveProductionRaftCallCensus());
  assert.ok(census.providerMethods.length > 0);
  const liferaft = new LiferaftProvider();
  for (const name of census.providerMethods) {
    assert.equal(typeof liferaft[name], 'function',
      `liferaft must serve ${name}, which production calls on the seam`);
  }
  const raftRs = new RaftRsWasmProvider();
  assert.equal(typeof raftRs.createPartitionPort, 'function');
  assert.deepEqual(Reflect.ownKeys(raftRs), [],
    'the experimental provider retains no implementation or group state');
});

test('the experimental partition seam does not recreate the legacy node facade',
  async () => {
    const provider = new RaftRsWasmProvider();
    for (const name of censusNames(deriveProductionRaftCallCensus())
      .providerMethods.filter((method) => method !== 'createPartitionPort')) {
      assert.equal(typeof provider[name], 'undefined',
        `${name} must not recreate a node/control facade on raft-rs`);
    }
    assert.equal(typeof provider.createPartitionPort, 'function');
  });
