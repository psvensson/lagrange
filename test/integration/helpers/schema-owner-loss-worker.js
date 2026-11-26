// Observers on real runtime instances. Only the named CREATE pauses, after its
// catalog write and before its first attempt can finish provisioning.
import {PartitionService} from '../../../src/partition/partition-service.js';
import {readPartitionReplicaMembership} from '../../../src/partition/partition-service-raft-membership-administration.js';
import {TableCreationService} from '../../../src/query/table-creation-service-class.js';
import {SCHEMA_PROVISIONING_ERROR_CODE} from '../../../src/query/schema-provisioning-job-constants.js';
import {SchemaProvisioningJobOwner} from '../../../src/query/schema-provisioning-job-owner.js';
import {registerEmbeddedWorkerOperations} from './embedded-node-worker.js';

const partitions = new Map();
const grants = [];
const claims = [];
let trackedJobId;
let repository;
let target;
let barrier;
let completed;
const release = Promise.withResolvers();

const initialize = PartitionService.prototype.initialize;
PartitionService.prototype.initialize = async function(...args) {
  const result = await initialize.apply(this, args);
  partitions.set(this.replicaId, this);
  return result;
};

const resume = SchemaProvisioningJobOwner.prototype.resumeNonterminal;
SchemaProvisioningJobOwner.prototype.resumeNonterminal = function(...args) {
  repository = this.repository;
  return resume.apply(this, args);
};

const claim = SchemaProvisioningJobOwner.prototype.claimOwnership;
SchemaProvisioningJobOwner.prototype.claimOwnership = async function(workflow, fence) {
  const answer = await claim.call(this, workflow, fence);
  if (workflow.workflowId === trackedJobId && answer.accepted) {
    claims.push({ownerId: answer.workflow.workflowOwnerId, fence: answer.workflow.fenceToken,
      lease: answer.workflow.leaseExpiresAt, at: Date.now()});
  }
  return answer;
};

const execute = SchemaProvisioningJobOwner.prototype.executeJob;
SchemaProvisioningJobOwner.prototype.executeJob = function(intent, executor, options) {
  if (intent.tableName !== target) return execute.call(this, intent, executor, options);
  repository = this.repository;
  trackedJobId = intent.workflowId;
  return execute.call(this, intent, (job) => {
    grants.push({ownerId: this.ownerId, jobId: job.jobId, tableId: job.tableId,
      key: intent.tableIdentityKey, fence: job.ownerFenceToken, at: Date.now()});
    return executor(job);
  }, options);
};

const provision = TableCreationService.prototype.provisionInitialPartition;
TableCreationService.prototype.provisionInitialPartition = async function(context) {
  if (context.tableName === target) {
    barrier = {jobId: context.schemaJobId, tableId: context.tableId, partitionId: context.partitionId,
      ownerId: this.schemaProvisioningJobOwner.ownerId};
    await release.promise;
  }
  return provision.call(this, context);
};

const terminal = SchemaProvisioningJobOwner.prototype.transitionTerminal;
SchemaProvisioningJobOwner.prototype.transitionTerminal = async function(intent, workflow, options) {
  const result = await terminal.call(this, intent, workflow, options);
  if (intent.tableName === target) {
    completed = {jobId: intent.workflowId, tableId: intent.tableId, ownerId: this.ownerId,
      fence: workflow.fenceToken, status: options.updates.status};
  }
  return result;
};

registerEmbeddedWorkerOperations({
  arm: ({tableName}) => { target = tableName; },
  trace: () => ({grants, claims, barrier, completed}),
  release: () => release.resolve(),
  job: async ({key}) => {
    let row;
    try {
      row = await repository?.findByTableIdentity(key);
    } catch (error) {
      if (error.code === SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE) return null;
      throw error;
    }
    if (!row) return null;
    return {jobId: row.job_id, tableId: row.table_id, status: row.status,
      ownerId: row.workflow_owner_id, fence: row.workflow_fence_token,
      lease: row.workflow_lease_expires_at, version: row.row_version};
  },
  ledPartitions: ({ids}) => [...partitions.values()]
    .filter((service) => ids.includes(service.partitionId) && service.initialized &&
      !service.isShutdown && service.getStatus().isLeader)
    .map((service) => service.partitionId),
  membership: async ({ids}) => {
    const local = [...partitions.values()].filter((service) =>
      ids.includes(service.partitionId) && service.initialized && !service.isShutdown);
    return Promise.all(local.map(async (service) => {
      const membership = await readPartitionReplicaMembership(service, service.replicaId);
      const status = service.getStatus();
      return {...membership, isLeader: status.isLeader && status.term === membership.term};
    }));
  },
});
