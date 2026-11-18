/**
 * CREATE TABLE never reads an unreadable metadata owner as "the table does
 * not exist". Through the durable schema job executor: a lookup the
 * authority cannot answer refuses the step with the typed retryable
 * PROVISIONING_UNAVAILABLE (the code the job keeps PENDING and retries on)
 * and writes no metadata; the same job, once the authority answers, creates
 * the table exactly once. The same holds for the partition lookup of the
 * existing-table reconciliation.
 */
import {test} from '../../src/test-helpers/tap.js';
import {TableCreationService} from '../../src/query/table-creation-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {isTransientProvisioningError} from
  '../../src/query/schema-provisioning-job-owner.js';
import {createTableThroughDurableJob} from './table-creation-durable-job-fixture.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const JOB = Object.freeze({tableId: 'tbl-users', partitionId: 'tbl-users-p1'});
const OWNER_UNAVAILABLE = Object.freeze({success: false, rows: [],
  error: 'authoritative_read_owner_unavailable'});

function usersAst(ifNotExists = false) {
  return {tableName: 'users', primaryKey: ['id'], ifNotExists,
    columns: [{name: 'id', dataType: {name: 'TEXT'}, primaryKey: true}]};
}

// The metadata owner: readRows answers from `answers[tableName]`, mutations
// are recorded (and become readable rows).
function createMetadataOwner(answers) {
  const mutations = [];
  return {
    mutations,
    answers,
    gateway: {
      async readRows(tableName) {
        return answers[tableName];
      },
      async submitMutation(mutation) {
        mutations.push(mutation);
        return {success: true, position: mutations.length};
      },
    },
  };
}

function createService(owner, provisionCalls) {
  return new TableCreationService({
    systemCache: {find: () => null},
    controlPlaneSystemTableGateway: owner.gateway,
    partitionProvisioner: async (context) => {
      provisionCalls.push(context);
    },
  });
}

test('an unreadable table lookup refuses CREATE TABLE typed retryable and ' +
  'writes nothing; the same job then creates the table once', async (t) => {
  const owner = createMetadataOwner({tables: OWNER_UNAVAILABLE});
  const provisionCalls = [];
  const service = createService(owner, provisionCalls);
  t.after(() => service.shutdown());

  const refusal = await createTableThroughDurableJob(service, usersAst(), JOB)
    .then(() => null, (error) => error);
  t.ok(refusal, 'the step refuses');
  t.equal(refusal.code, QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE);
  t.same(refusal.reasons, ['table_metadata_lookup_unavailable']);
  t.equal(isTransientProvisioningError(refusal), true,
    'the durable schema job keeps the job PENDING and retries');
  t.same(owner.mutations, [], 'no metadata is written on an unknown answer');
  t.same(provisionCalls, []);

  owner.answers.tables = {success: true, rows: []};
  const result = await createTableThroughDurableJob(service, usersAst(), JOB);
  t.equal(result.success, true);
  t.equal(result.skipped, undefined, 'the table is created, not skipped');
  t.same(owner.mutations.map((mutation) => mutation.tableName),
    ['tables', 'partitions'], 'the metadata is written once');
  t.equal(provisionCalls.length, 1);
});

test('an unreadable partition lookup refuses the existing-table ' +
  'reconciliation instead of re-inserting partition metadata', async (t) => {
  const service0 = new TableCreationService({});
  const tableRow = {table_id: JOB.tableId, table_name: 'users',
    schema_definition: JSON.stringify(
      service0.buildSchemaDefinition(usersAst().columns, usersAst()))};
  await service0.shutdown();
  const owner = createMetadataOwner({
    tables: {success: true, rows: [tableRow]},
    partitions: OWNER_UNAVAILABLE,
  });
  const provisionCalls = [];
  const service = createService(owner, provisionCalls);
  t.after(() => service.shutdown());

  await t.rejects(createTableThroughDurableJob(service, usersAst(true), JOB),
    {code: QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE});
  t.same(owner.mutations, [], 'no partition row is restored on unknown');
  t.same(provisionCalls, []);

  owner.answers.partitions = {success: true, rows: []};
  const result = await createTableThroughDurableJob(service, usersAst(true), JOB);
  t.equal(result.success, true);
  t.same(owner.mutations.map((mutation) => mutation.tableName), ['partitions'],
    'an explicitly absent partition row is restored once');
  t.equal(provisionCalls.length, 1);
});
