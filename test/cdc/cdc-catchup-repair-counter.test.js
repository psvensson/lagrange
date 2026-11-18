// The deletion evidence of the timed and one-shot CDC compensations (design
// note S3.5): every catch-up run is counted under the trigger that ran it, and
// a run that changed cache rows is counted and logged as a repair, so a lab
// formation can show zero repairs before those compensations are deleted.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CDC_CATCHUP_REFUSAL, CDC_CATCHUP_TRIGGER, hydrateCdcPropagatedTablesFromAuthority} from
  '../../src/cdc/cdc-integration-service-authoritative-catchup.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_ERROR_CODE} from '../../src/cdc/cdc-constants.js';

function stub(changes) {
  const warnings = [];
  return {warnings, nodeId: 'node-a',
    // The one cache owner of snapshots and observations: the real writable cache.
    cacheMutationTarget: new SystemTableCache(),
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

test('a catch-up without a named trigger is refused typed before any read is issued', async () => {
  for (const options of [undefined, {tables: ['nodes']}, {tables: ['nodes'], trigger: 'unnamed'}]) {
    const service = stub(true);
    let reads = 0;
    service.executeAuthoritativeSystemTableRead = async () => {
      reads += 1;
      return {success: true, rows: []};
    };
    await assert.rejects(hydrateCdcPropagatedTablesFromAuthority(service, options),
      {code: CDC_CATCHUP_REFUSAL.TRIGGER_REQUIRED});
    assert.equal(reads, 0, 'no authoritative read before the refusal');
    assert.equal(service.catchupRepairCounts, undefined, 'no run is counted');
  }
});

test('a catch-up on a service with no writable cache bound is refused typed ' +
  '(CACHE_OWNER_UNBOUND), never answered from a second cache', async () => {
  const service = stub(true);
  service.cacheMutationTarget = null;
  await assert.rejects(hydrateCdcPropagatedTablesFromAuthority(service,
    {tables: ['nodes'], trigger: CDC_CATCHUP_TRIGGER.JOIN_CATCHUP}),
  {code: CDC_ERROR_CODE.CACHE_OWNER_UNBOUND});
});
