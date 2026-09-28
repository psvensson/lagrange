/**
 * Shared SERVICES activation-absence scenario.
 *
 * Activation never owns creation. When the authoritative row cannot be
 * observed it must defer without mutating identity; only the owner's explicit
 * registration entry point may contend through canonical INSERT admission.
 */
import {test} from '../../src/test-helpers/tap.js';

function buildOwner(OwnerClass) {
  const calls = {updates: [], inserts: [], upserts: []};
  const owner = new OwnerClass({
    now: () => 1234,
    systemTableWriter: {
      async updateSystemTableRow(tableName, whereClause, updateData, options) {
        calls.updates.push({tableName, whereClause, updateData, options});
        return {success: true, partitionResult: {affectedRows: 0}};
      },
      async insertSystemTableRow(tableName, row, options) {
        calls.inserts.push({tableName, row, options});
        return {success: true, partitionResult: {affectedRows: 1}};
      },
      async upsertSystemTableRow(...args) {
        calls.upserts.push(args);
        throw new Error('SERVICES identity must never be acquired by UPSERT');
      },
      async readAuthoritativeRows() {
        throw new Error('authoritative SERVICES owner unavailable');
      },
    },
  });
  return {owner, calls};
}

export function runRowAbsenceActivationDeferredScenario({
  OwnerClass,
  replicaOptions,
  ownerLabel,
  deferredCode,
  assertRegisteredRow,
}) {
  test(`${ownerLabel} activation defers when canonical identity is ` +
      'unobservable and only registration may create it', async (t) => {
    const {owner, calls} = buildOwner(OwnerClass);
    await t.rejects(
      owner.activateReplica(replicaOptions),
      {code: deferredCode, deferRetry: true},
      'unavailable authority remains typed retry debt',
    );
    t.equal(calls.updates.length, 0,
      'activation does not mutate without an authoritative source row');
    t.equal(calls.inserts.length, 0,
      'activation never converts absence into creation');
    t.equal(calls.upserts.length, 0,
      'activation has no UPSERT compatibility escape hatch');

    const row = await owner.registerReplica(replicaOptions);
    t.equal(calls.inserts.length, 1,
      'canonical registration alone owns INSERT acquisition');
    t.equal(calls.upserts.length, 0,
      'registration still contends through INSERT rather than UPSERT');
    assertRegisteredRow(t, calls.inserts[0], row);
  });
}
