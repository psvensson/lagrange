import {captureReplicaRuntimeProducer} from
  '../../src/node/replica-runtime-producer.js';
// Owner-level publication fixture. A declared durable ACTIVE row is read and
// admitted by the real restore/lifecycle owners BEFORE a real PartitionService
// is constructed. The transport is controlled; native opening is not exercised.
import {PartitionService} from '../../src/partition/partition-service.js';
import {assertDurableRejoinStorageAdmission} from
  '../../src/bootstrap/durable-rejoin-storage-admission.js';
import {createReplicaRuntimePublication} from '../../src/node/replica-runtime-publication.js';
import {bindRegisteredReplicaHandler} from './replica-handler-identity-fixture.js';

async function createRestoredPartitionServiceFixture(handler, row, options) {
  const owner = handler.replicaStateMachine;
  const producer = captureReplicaRuntimeProducer(handler, owner, row.replica_id);
  const admission = await assertDurableRejoinStorageAdmission(owner, {
    restoringExistingReplica: true, replicaId: row.replica_id, lifecycleAuthority: row,
  });
  const service = new PartitionService({...options,
    partitionId: row.partition_id, replicaId: row.replica_id, nodeId: row.node_id,
    runtimePublication: createReplicaRuntimePublication(producer, admission.row,
      admission.admission), resolveHandlerRetirementLane: () => owner});
  bindRegisteredReplicaHandler(service, {nodeId: row.node_id,
    resolveHandlerRetirementLane: () => owner});
  return Object.freeze({replicaId: row.replica_id, partitionId: row.partition_id,
    tableName: options.tableName, service, sourceEvidence: admission.row, lifecycleOwner: owner});
}

export {createRestoredPartitionServiceFixture};
