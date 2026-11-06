import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {POLICY_ERROR_CODE, POLICY_EVENT} from '../../src/policy/policy-constants.js';
import {AdminOwnerOperations, ADMIN_OWNER_OPERATION_OUTCOME} from '../../src/admin/admin-owner-operations.js';
import {TableCreationService} from '../../src/query/table-creation-service.js';

const TABLE_ID = 'policy-target-test';
const UNSUPPORTED = POLICY_ERROR_CODE.TARGET_UPDATE_UNSUPPORTED;
const TARGET_REQUESTS = Object.freeze([{replicaCount: 3}, {targetReplicaCount: 3}]);

function recordingPolicyOwner() {
  const row = {table_id: TABLE_ID, table_policies: '{}', updated_at: 1};
  const mutations = [];
  const events = [];
  const gateway = {
    executeRead: async ({readFromCache}) => ({rows: readFromCache()}),
    readAuthoritativeRows: async () => ({success: true, rows: [{...row}]}),
    submitMutation: async (mutation) => {
      mutations.push(mutation);
      assert.deepEqual(mutation.whereClause, {table_id: TABLE_ID,
        table_policies: row.table_policies, updated_at: row.updated_at});
      Object.assign(row, mutation.data);
      return {success: true, outcome: 'applied', partitionResult: {affectedRows: 1}};
    },
  };
  const owner = new TablePolicyService({systemTableCache: {
    filter: (_name, predicate) => [row].filter(predicate),
  }, cdcIntegrationService: {}, controlPlaneSystemTableGateway: gateway});
  owner.on(POLICY_EVENT.POLICY_UPDATED, (event) => events.push(event));
  return {owner, row, mutations, events};
}

test('admin target requests refuse before writes, cache invalidation or success events; valid limits retain CAS', async () => {
  const {owner, row, mutations, events} = recordingPolicyOwner();
  try {
    const primed = await owner.getTablePolicy(TABLE_ID);
    const cached = owner.policyCache.get(TABLE_ID);
    const original = {...row};
    const admin = new AdminOwnerOperations({getTablePolicyService: () => owner}, 'node-1');
    for (const policy of TARGET_REQUESTS) {
      await assert.rejects(owner.updateTablePolicy(TABLE_ID, policy),
        (error) => error.code === UNSUPPORTED && error.deferRetry !== true);
      const answer = await admin.updateTablePolicy(TABLE_ID, {policy});
      assert.equal(answer.statusCode, 400);
      assert.equal(answer.body.outcome, ADMIN_OWNER_OPERATION_OUTCOME.REFUSED);
      assert.equal(answer.body.errorCode, UNSUPPORTED);
      assert.equal(owner.policyCache.get(TABLE_ID), cached);
      assert.equal(await owner.getTablePolicy(TABLE_ID), primed);
      assert.deepEqual(row, original);
    }
    assert.deepEqual(mutations, []);
    assert.deepEqual(events, []);
    const update = await owner.updateTablePolicy(TABLE_ID, {
      minReplicaCount: 5, splitTrafficThreshold: 123,
    });
    assert.equal(update.policy.minReplicaCount, 5);
    assert.equal(update.policy.splitTrafficThreshold, 123);
    assert.equal(mutations.length, 1);
    assert.equal(events.length, 1);
  } finally {
    owner.shutdown();
  }
});

test('CREATE target requests refuse before schema intent, metadata or existing-table reconciliation', async () => {
  const writes = [];
  const schemaOwner = {execute: async () => {
    writes.push('schema intent');
  }, shutdown: async () => {}};
  const service = new TableCreationService({schemaProvisioningJobOwner: schemaOwner,
    controlPlaneSystemTableGateway: {submitMutation: async () => {
      writes.push('metadata');
    }}});
  service.findExistingTableRecord = async () => {
    writes.push('existing table lookup');
    return {table_id: TABLE_ID};
  };
  try {
    for (const policy of TARGET_REQUESTS) {
      for (const ifNotExists of [false, true]) {
        const ast = {tableName: 'target_test', primaryKey: ['id'],
          columns: [{name: 'id', dataType: {name: 'TEXT'}, primaryKey: true}],
          ifNotExists, options: {tablePolicy: policy}};
        await assert.rejects(service.createTable(ast), {code: UNSUPPORTED});
        await assert.rejects(service.executeCreateTableProvisioning(ast), {code: UNSUPPORTED});
      }
    }
    assert.deepEqual(writes, []);
  } finally {
    await service.shutdown();
  }
});
