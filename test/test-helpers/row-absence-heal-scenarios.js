/**
 * Shared absence-proven services-row heal scenarios.
 *
 * Both the partition owner and the message-group owner hold the same
 * contract: a zero affected-row count on the primary-key-pinned status
 * UPDATE proves durable absence of the services row and re-issues the
 * canonical registration insert; matched or unwitnessed counts keep the
 * update-only contract. The two test files bind this scenario to their
 * respective owner classes and row-shape assertions.
 */
import {test} from '../../src/test-helpers/tap.js';

export function createAuthoritativeCacheRead(cache) {
  return async (tableName, sql, params) => {
    let rows = cache?.filter(tableName, () => true) || [];
    if (/service_id\s*=\s*\?/iu.test(sql)) {
      rows = rows.filter((row) => row.service_id === params[0]);
    } else if (/service_type\s*=\s*\?/iu.test(sql)) {
      rows = rows.filter((row) => row.service_type === params[0] &&
        row.status === params[1] && row.node_id === params[2]);
    }
    return {success: true, rows};
  };
}

function buildOwner({OwnerClass, affectedRows}) {
  const calls = {updates: [], inserts: []};
  const owner = new OwnerClass({
    now: () => 1234,
    systemTableWriter: {
      async updateSystemTableRow(tableName, whereClause, updateData, options) {
        calls.updates.push({tableName, whereClause, updateData, options});
        return {
          success: true,
          partitionResult: affectedRows === undefined ?
            {} :
            {affectedRows},
        };
      },
      async insertSystemTableRow(tableName, row, options) {
        calls.inserts.push({tableName, row, options});
        return {success: true, partitionResult: {affectedRows: 1}};
      },
    },
  });
  return {owner, calls};
}

export function runRowAbsenceHealScenarios({
  OwnerClass,
  replicaOptions,
  ownerLabel,
  assertHealedRow,
}) {
  test(`a zero-row ${ownerLabel} status update proves durable absence and ` +
    're-enters canonical insert-only registration', async (t) => {
    const {owner, calls} = buildOwner({OwnerClass, affectedRows: 0});
    const row = await owner.activateReplica(replicaOptions);
    t.equal(calls.inserts.length, 1,
      'the absent services row is healed with canonical insert admission');
    assertHealedRow(t, calls.inserts[0], row);
    t.end();
  });

  test(`a matched ${ownerLabel} status update never escalates to insert`,
    async (t) => {
      const {owner, calls} = buildOwner({OwnerClass, affectedRows: 1});
      await owner.activateReplica(replicaOptions);
      t.equal(calls.inserts.length, 0,
        'a matched update keeps the update-only contract');
      t.end();
    });

  test(`an unwitnessed ${ownerLabel} affected-row count never escalates ` +
      'to insert', async (t) => {
    const {owner, calls} = buildOwner({OwnerClass, affectedRows: undefined});
    await owner.activateReplica(replicaOptions);
    t.equal(calls.inserts.length, 0,
      'absence must be proven by an explicit zero count, not assumed');
    t.end();
  });
}
