/**
 * A held founding operation never outlives its schema job.
 *
 * A founding left partial by an unsettled target keeps the job's own
 * deterministic, dispatch-held, unstamped founders for the job's retry. If
 * the job then ends - failed terminally, or succeeded with a cohort that left
 * a held founder out - nothing completed or failed those founders: they stayed
 * held forever. The job owner now releases them before the job ends, and a
 * release that cannot complete keeps the job non-terminal.
 */
import {test} from '../../src/test-helpers/tap.js';
import {SchemaProvisioningJobOwner} from
  '../../src/query/schema-provisioning-job-owner.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {buildSchemaProvisioningChildIntent} from
  '../../src/query/schema-provisioning-child-intent.js';

const JOB = Object.freeze({
  jobId: 'schema-job-held',
  workflowId: 'schema-job-held',
  ownerKey: 'schema:db.t',
  partitionId: 'tbl-held-p1',
});

function founder(nodeId, {held}) {
  const intent = buildSchemaProvisioningChildIntent(JOB.jobId, nodeId);
  return {
    operationId: intent.operationIntentId,
    replicaId: intent.replicaIntentId,
    type: 'ADD',
    targetNodeId: nodeId,
    status: 'pending',
    workflowStep: 'PENDING',
    stepsHistory: [held ? {bootstrapTopologyDispatchDeferred: true} : {}],
  };
}

function createEngine(operations, failed) {
  const engine = Object.create(SQLQueryEngine.prototype);
  engine.logger = {debug() {}, warn() {}, error() {}};
  engine.rebalanceCoordinator = {
    getOperationsByEntity: async () => operations,
    failOperation: async (operation) => {
      failed.push(operation.operationId);
    },
  };
  return engine;
}

test('the engine releases exactly the job\'s held unstamped founders',
  async (t) => {
    const failed = [];
    const stamped = founder('node-b', {held: false});
    const foreign = {...founder('node-c', {held: true}),
      operationId: 'other-job:operation:node-c'};
    const engine = createEngine([founder('node-a', {held: true}), stamped,
      foreign], failed);
    const released = await engine.releaseSchemaJobHeldFoundingOperations(JOB);
    t.same(released, [founder('node-a', {held: true}).operationId],
      'only the held founder of this job');
    t.same(failed, released, 'is failed');
  });

function createOwner(release) {
  const transitions = [];
  const workflow = {workflowId: JOB.workflowId, status: 'pending',
    fenceToken: 1};
  const owner = new SchemaProvisioningJobOwner({
    repository: {recoverWorkflowRows: () => []},
    workflowCoordinator: {
      recover: () => {},
      requireWorkflow: () => workflow,
      getWorkflowById: () => workflow,
      claimWorkflow: async () => ({accepted: true, workflow}),
      transitionStep: async (workflowId, step, updates) => {
        transitions.push(updates?.status || step.nextStep);
      },
    },
    retrySetTimeoutFn: () => ({unref() {}}),
    retryClearTimeoutFn: () => {},
    releaseHeldFoundingOperations: release,
  });
  return {owner, transitions};
}

test('a job that fails terminally releases its held founders first',
  async (t) => {
    const released = [];
    const {owner, transitions} = createOwner(async (intent) => {
      released.push(intent.jobId);
    });
    await owner.executeJob(JOB, async () => {
      throw new Error('schema exploded');
    });
    t.same(released, [JOB.jobId], 'the release ran for this job');
    t.equal(transitions.at(-1), 'FAILED', 'then the job failed');
  });

test('a job that succeeds releases founders its cohort left held',
  async (t) => {
    const released = [];
    const {owner, transitions} = createOwner(async (intent) => {
      released.push(intent.jobId);
    });
    await owner.executeJob(JOB, async () => ({success: true,
      contractState: 'ready'}));
    t.same(released, [JOB.jobId], 'the release ran before success');
    t.equal(transitions.at(-1), 'SUCCEEDED', 'then the job succeeded');
  });

test('a release that cannot complete keeps the job non-terminal',
  async (t) => {
    const {owner, transitions} = createOwner(async () => {
      throw new Error('replica_operations unavailable');
    });
    await t.rejects(owner.executeJob(JOB, async () => {
      throw new Error('schema exploded');
    }), /replica_operations unavailable/);
    t.notOk(transitions.includes('FAILED'), 'the job is not ended');
  });
