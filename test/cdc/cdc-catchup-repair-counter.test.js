// The deletion evidence of the timed and one-shot CDC compensations (design
// note S3.5): every catch-up run is counted under the trigger that ran it, and
// a run that changed cache rows is counted and logged as a repair, so a lab
// formation can show zero repairs before those compensations are deleted.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CDC_CATCHUP_TRIGGER, hydrateCdcPropagatedTablesFromAuthority} from
  '../../src/cdc/cdc-integration-service-authoritative-catchup.js';

function stub(changes) {
  const warnings = [];
  return {warnings, nodeId: 'node-a',
    delayUntilShutdown: async () => {},
    logger: {info() {}, debug() {}, error() {},
      warn: (message, fields) => warnings.push({message, fields})},
    getPrimaryKeyField: () => 'id',
    executeAuthoritativeSystemTableRead: async () => ({success: true, rows: [{id: 'row-1'}]}),
    // The canonical repair answers whether it changed the cache.
    applyAuthoritativeCacheRepair: () => changes,
  };
}

test('a catch-up that changes nothing counts a run and no repair; one that changes rows ' +
  'counts and logs a repair under its trigger', async () => {
  const quiet = stub(false);
  await hydrateCdcPropagatedTablesFromAuthority(quiet,
    {tables: ['nodes'], trigger: CDC_CATCHUP_TRIGGER.PROPAGATED_SWEEP});
  assert.deepEqual(quiet.catchupRepairCounts.get(CDC_CATCHUP_TRIGGER.PROPAGATED_SWEEP),
    {runs: 1, repairingRuns: 0, rowsApplied: 0, rowsSwept: 0});
  assert.equal(quiet.warnings.length, 0, 'a run that repaired nothing is not reported');

  const repairing = stub(true);
  await hydrateCdcPropagatedTablesFromAuthority(repairing,
    {tables: ['nodes'], trigger: CDC_CATCHUP_TRIGGER.JOIN_CATCHUP});
  assert.deepEqual(repairing.catchupRepairCounts.get(CDC_CATCHUP_TRIGGER.JOIN_CATCHUP),
    {runs: 1, repairingRuns: 1, rowsApplied: 1, rowsSwept: 0});
  assert.equal(repairing.warnings.length, 1);
  assert.equal(repairing.warnings[0].fields.trigger, CDC_CATCHUP_TRIGGER.JOIN_CATCHUP);
});
