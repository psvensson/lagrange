// AUDIT-WITNESS-KIND: guard-grid
// This file drives owners over constructed states. It proves GUARD
// behaviour, never that a production producer can reach that state.
// The two partition sets the overflow-budget audit rests on, measured from
// the real owners and pinned (quest critical-spread-overflow-budget-audit,
// receipt critical-and-mintable-partition-sets-measured).
//
//   - the guard's bootstrap-critical set (isBootstrapCriticalSystemPartitionId),
//     which is what turns the count check's critical branch on;
//   - the subset the cure policy can mint a spread-cure transition
//     authorization for (isNonLedgerPriorityPlacementCurePartition, asked
//     through the real authorizeSpreadCureTransition);
//   - and, measured beside them because the guard's budget owner is not
//     consulted outside it, the priority-control-plane set.
//
// A partition added to, or removed from, any of the three turns this red.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MATRIX_JSON,
  measurePartitionSets,
  readJsonArtifact,
} from './overflow-budget-audit-support.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

// The seven the owner named as bootstrap-critical and unmintable. They are
// listed here, not derived, because the audit must show they are all really
// in the measured remainder rather than assume it.
const OWNER_NAMED_SEVEN = Object.freeze([
  'replica_operations-p1',
  'services-p1',
  'nodes-p1',
  'partitions-p1',
  'message_groups-p1',
  'tables-p1',
  'config-p1',
]);

function sorted(values) {
  return [...values].sort();
}

test('the guard\'s bootstrap-critical set and the mintable subset are measured',
  () => {
    const measured = measurePartitionSets();
    const matrix = readJsonArtifact(MATRIX_JSON);
    const recorded = matrix.partitionSets;
    assert.deepEqual(sorted(measured.bootstrapCritical),
      sorted(recorded.bootstrapCritical),
      'the matrix records the measured bootstrap-critical set');
    assert.deepEqual(sorted(measured.mintable), sorted(recorded.mintable),
      'the matrix records the measured mintable set');
    assert.deepEqual(sorted(measured.budgetEvaluated),
      sorted(recorded.budgetEvaluated),
      'the matrix records the measured budget-evaluated set');
    assert.deepEqual(sorted(measured.criticalWithoutMint),
      sorted(recorded.criticalWithoutMint),
      'the matrix records the measured unmintable remainder');
    // Every declared system-table partition is bootstrap-critical: the
    // guard's critical branch is on for the whole system-table first-partition
    // set, not for twelve partitions.
    assert.deepEqual(sorted(measured.bootstrapCritical), sorted(measured.all),
      'every declared system-table partition is bootstrap-critical');
    assert.equal(measured.bootstrapCritical.length, recorded.counts.critical);
    assert.equal(measured.mintable.length, recorded.counts.mintable);
    assert.equal(measured.criticalWithoutMint.length,
      recorded.counts.criticalWithoutMint);
    assert.equal(measured.budgetEvaluated.length,
      recorded.counts.budgetEvaluated);
    // No partition can carry an authorization without being in the set the
    // guard treats as critical.
    for (const partitionId of measured.mintable) {
      assert.ok(measured.bootstrapCritical.includes(partitionId),
        `mintable partition is bootstrap-critical: ${partitionId}`);
      assert.ok(measured.budgetEvaluated.includes(partitionId),
        `mintable partition is budget-evaluated: ${partitionId}`);
    }
    // The owner's seven are each in the measured remainder, and each has a
    // row of its own in the matrix.
    for (const partitionId of OWNER_NAMED_SEVEN) {
      assert.ok(measured.criticalWithoutMint.includes(partitionId),
        `owner-named partition is critical and unmintable: ${partitionId}`);
      // The owner asked for a row each. The operation ledger is the one the
      // budget reaches, so it is split by PRODUCER and has several; the
      // other six have one apiece.
      const ownRows = matrix.rows.filter((row) =>
        row.ownerNamedPartition === partitionId);
      assert.ok(ownRows.length >= 1,
        `the owner's named partition has a row: ${partitionId}`);
      if (measured.budgetEvaluated.includes(partitionId)) {
        assert.ok(ownRows.length > 1,
          'the one owner-named partition the budget reaches is split by ' +
            `producer: ${partitionId}`);
        continue;
      }
      assert.equal(ownRows.length, 1,
        `an unreachable owner-named partition has exactly one row: ${
          partitionId}`);
    }
    // The remainder the lead's note names: every unmintable partition that
    // is not one of the owner's seven is audited too, in a row that lists
    // every id it covers.
    const remainder = measured.criticalWithoutMint.filter((partitionId) =>
      !OWNER_NAMED_SEVEN.includes(partitionId));
    assert.equal(remainder.length, recorded.counts.remainder,
      'the matrix records the measured remainder size');
    const coveredRemainder = matrix.rows
      .filter((row) => row.remainderGroup === true)
      .flatMap((row) => row.partitionClass);
    assert.deepEqual(sorted(coveredRemainder), sorted(remainder),
      'the grouped remainder row lists every remaining partition id');
  });
