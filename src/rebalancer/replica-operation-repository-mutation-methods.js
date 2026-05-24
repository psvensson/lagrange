import {
  assignReplicaOperationRepositoryMutationGatewayMethods,
} from './replica-operation-repository-mutation-gateway-methods.js';
import {
  assignReplicaOperationRepositoryMutationPersistenceMethods,
} from './replica-operation-repository-mutation-persistence-methods.js';
import {
  assignReplicaOperationRepositoryMutationRowMethods,
} from './replica-operation-repository-mutation-row-methods.js';
import {
  assignReplicaOperationRepositoryMutationTransitionMethods,
} from './replica-operation-repository-mutation-transition-methods.js';

function assignReplicaOperationRepositoryMutationMethods(
  ReplicaOperationRepository,
  options = {},
) {
  assignReplicaOperationRepositoryMutationPersistenceMethods(
    ReplicaOperationRepository,
    options,
  );
  assignReplicaOperationRepositoryMutationGatewayMethods(
    ReplicaOperationRepository,
    options,
  );
  assignReplicaOperationRepositoryMutationRowMethods(
    ReplicaOperationRepository,
    options,
  );
  assignReplicaOperationRepositoryMutationTransitionMethods(
    ReplicaOperationRepository,
    options,
  );
}

export {assignReplicaOperationRepositoryMutationMethods};
