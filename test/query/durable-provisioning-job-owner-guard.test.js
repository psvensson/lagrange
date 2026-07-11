import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';

const SOURCE = Object.freeze({
  ADMIN: 'src/admin/admin-websocket-api-shared.js',
  DURABLE_TABLE_CREATION:
    'src/query/table-creation-service-durable-job.js',
  JOB_OWNER: 'src/query/schema-provisioning-job-owner.js',
  JOB_REPOSITORY: 'src/query/schema-provisioning-job-repository.js',
  LIFECYCLE: 'src/query/sql-query-engine-lifecycle-and-callback-dispatch.js',
  PG_HANDLER: 'src/runtime/pgwire-protocol-handler.js',
  PG_CONSTANTS: 'src/runtime/pgwire-protocol-constants.js',
  PROVISIONING: 'src/query/sql-query-engine-initial-partition-provisioning.js',
  REPLICA_OWNER:
    'src/rebalancer/rebalance-coordinator-operation-creation.js',
});

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('durable provisioning owner trace stays on canonical owners', (t) => {
  const durableTableCreation = read(SOURCE.DURABLE_TABLE_CREATION);
  const jobOwner = read(SOURCE.JOB_OWNER);
  const jobRepository = read(SOURCE.JOB_REPOSITORY);
  const provisioning = read(SOURCE.PROVISIONING);
  const replicaOwner = read(SOURCE.REPLICA_OWNER);
  const lifecycle = read(SOURCE.LIFECYCLE);
  const admin = read(SOURCE.ADMIN);
  const pgHandler = read(SOURCE.PG_HANDLER);
  const pgConstants = read(SOURCE.PG_CONSTANTS);

  t.match(durableTableCreation, /schemaProvisioningJobOwner\.execute/u);
  t.notMatch(durableTableCreation, /executeCreateTableProvisioning\(ast, options\)/u,
    'public CREATE has no legacy owner-unavailable fallback');
  t.notMatch(durableTableCreation, /durableSchemaProvisioningEnabled/u,
    'cutover is unconditional');
  t.match(jobOwner, /new DurableWorkflowCoordinator/u);
  t.match(jobOwner, /persistWorkflowClaim/u);
  t.match(jobOwner, /persistWorkflowTransition/u);
  t.match(jobRepository, /CONTROL_PLANE_MUTATION_OPERATION\.INSERT/u,
    'schema intent is recorded by one INSERT');
  t.notMatch(jobRepository, /CONTROL_PLANE_MUTATION_OPERATION\.DELETE/u,
    'W9 exposes no schema-job cleanup path');
  t.notMatch(durableTableCreation, /idempotentReplay/u,
    'durable replay uses deterministic identity rather than an overwrite mode');
  t.match(lifecycle, /resumeDurableProvisioningWork/u,
    'runtime activation replays nonterminal jobs');

  t.match(provisioning, /operationIntentId/u);
  t.match(provisioning, /replicaIntentId/u);
  t.match(provisioning, /rebalanceCoordinator\.createOperation/u);
  t.notMatch(provisioning, /replica_operations/u,
    'SQL never writes or interprets the replica-operation ledger directly');
  t.match(replicaOwner, /move\.operationIntentId \|\| uuidv4/u);
  t.match(replicaOwner, /move\.replicaIntentId \|\|/u);

  t.match(admin, /message\.jobId = value\.jobId/u);
  t.match(pgConstants, /LOCK_NOT_AVAILABLE: '55P03'/u);
  t.match(pgHandler, /provisioning_job_id/u);
  t.match(pgHandler, /retry_after_ms/u);
  t.end();
});
