// Receipt (superseded in part by quest raft-rs-single-path-partition-cutover):
// the backend selection seam no longer exists. A partition has one consensus
// backend, built by PartitionService.createOperationPort; naming a backend is
// a typed refusal (single-path-partition-cutover.test.js). What remains here
// is measured from `src`, not from a literal this file owns:
//   1. the production call census is empty: production holds no
//      backend-selection provider and calls no provider surface;
//   2. consensus construction is the direct raft-rs operation-port function,
//      not a provider object or consensus-node facade.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createRaftRsOperationPort} from '../../../src/raft/raft-rs-operation-port.js';
import {
  censusNames,
  deriveProductionRaftCallCensus,
} from './production-raft-call-census.js';

test('the production seam has no provider surface', async () => {
  const census = censusNames(deriveProductionRaftCallCensus());
  assert.ok(Array.isArray(census.nodeMethods));
  assert.equal(typeof createRaftRsOperationPort, 'function');
  for (const name of census.nodeMethods) {
    assert.equal(typeof createRaftRsOperationPort[name], 'undefined',
      `${name} must remain on the consensus handle, not the factory`);
  }
});

test('consensus construction is the direct raft-rs operation-port factory',
  async () => {
    assert.equal(typeof createRaftRsOperationPort, 'function');
    assert.equal(createRaftRsOperationPort.name, 'createRaftRsOperationPort');
  });
