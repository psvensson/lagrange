// Receipt (superseded in part by quest raft-rs-single-path-partition-cutover):
// the backend selection seam no longer exists. A partition has one consensus
// backend, built by PartitionService.createOperationPort; naming a backend is
// a typed refusal (single-path-partition-cutover.test.js). What remains here
// is measured from `src`, not from a literal this file owns:
//   1. the seam's interface, derived by parsing `src` - the production call
//      census - is empty: production holds no backend-selection provider and
//      calls none, while the rs-raft partition factory keeps no state;
//   2. that the rs-raft provider recreates no legacy node facade.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RaftRsWasmProvider} from '../../../src/raft/raft-rs-provider.js';
import {
  censusNames,
  deriveProductionRaftCallCensus,
} from './production-raft-call-census.js';

test('the seam interface is the census of what production calls', async () => {
  const census = censusNames(deriveProductionRaftCallCensus());
  assert.ok(Array.isArray(census.nodeMethods));
  const raftRs = new RaftRsWasmProvider();
  assert.equal(typeof raftRs.createPartitionPort, 'function');
  assert.deepEqual(Reflect.ownKeys(raftRs), [],
    'the experimental provider retains no implementation or group state');
});

test('the partition factory does not recreate the consensus-node facade',
  async () => {
    const factory = new RaftRsWasmProvider();
    for (const name of censusNames(deriveProductionRaftCallCensus())
      .nodeMethods) {
      assert.equal(typeof factory[name], 'undefined',
        `${name} must remain on the consensus handle, not the factory`);
    }
    assert.equal(typeof factory.createPartitionPort, 'function');
  });
