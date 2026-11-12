import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {
  captureReplicaRuntimeProducer,
  createReplicaRuntimeFactory,
} from '../../src/node/replica-runtime-producer.js';
import {runtimePublicationRefused} from
  '../../src/partition/partition-runtime-publication.js';

// Unit callers declare their existing construction callback explicitly. This
// seam supplies only the real handler's construction pair; lifecycle rows,
// admission evidence and runtime publication still come from their own owners.
function createReplicaHandlerFixture(Handler, {createPartitionService, ...options}) {
  if (Handler !== ReplicaHandler && !(Handler?.prototype instanceof ReplicaHandler)) {
    throw new TypeError('Replica handler fixture requires the real handler class');
  }
  let handler;
  let originalOwner;
  const partitionServiceFactory = createReplicaRuntimeFactory({
    captureProducer(requestingHandler, replicaId) {
      if (requestingHandler !== handler) throw runtimePublicationRefused(replicaId);
      return captureReplicaRuntimeProducer(handler, originalOwner, replicaId);
    },
    create: createPartitionService,
  });
  handler = new Handler({...options, partitionServiceFactory});
  originalOwner = handler.replicaStateMachine;
  return handler;
}

export {createReplicaHandlerFixture};
