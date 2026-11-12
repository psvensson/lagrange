// Direct SQL/port tests declare an immutable fixture birth and use the real
// PartitionService constructor. This controlled construction authority does
// not prove CREATE, seed, restore or snapshot admission; those suites use
// their production producer. The production publication contract still binds
// exactly one service, and cleanup permanently revokes this fixture authority.
import {PartitionService} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_DEFAULT} from
  '../../src/partition/partition-service-constants.js';
import {createPartitionRuntimePublication, runtimePublicationRefused} from
  '../../src/partition/partition-runtime-publication.js';

const FIXTURE_BIRTH = Object.freeze({created_at: 1, create_attempt_token: null});
const FIXTURE_ADMISSION = Object.freeze({ADMITTED: 'admitted', REVOKED: 'revoked'});

function createPartitionServiceFixture(options, {
  construct = (owned) => new PartitionService(owned), birth = FIXTURE_BIRTH,
  lifecycleOwner = null, publicationHandler = null,
} = {}) {
  if (options.runtimePublication !== undefined) {
    throw new TypeError('Production admission must use the real constructor directly');
  }
  const declared = {nodeId: PARTITION_SERVICE_DEFAULT.NODE_ID, ...options};
  const incarnation = Object.freeze({service_id: declared.replicaId,
    replica_id: declared.replicaId, partition_id: declared.partitionId,
    node_id: declared.nodeId, group_id: null,
    created_at: birth.created_at, create_attempt_token: birth.create_attempt_token});
  let admission = FIXTURE_ADMISSION.ADMITTED;
  const ownerIncarnation = lifecycleOwner?.ownerIncarnation;
  const handlerIncarnation = publicationHandler?.ownerIncarnation;
  const localServices = publicationHandler?.localServices;
  const localReplicas = publicationHandler?.localReplicas;
  const revoke = () => { admission = FIXTURE_ADMISSION.REVOKED; };
  const runtimePublication = createPartitionRuntimePublication({incarnation,
    assertSourceCurrent() {
      if (admission !== FIXTURE_ADMISSION.ADMITTED) {
        throw runtimePublicationRefused(incarnation.service_id);
      }
    },
    assertLifecycleOwner(_service, suppliedOwner) {
      if (lifecycleOwner === null || suppliedOwner !== lifecycleOwner ||
          lifecycleOwner.ownerIncarnation !== ownerIncarnation) {
        throw runtimePublicationRefused(incarnation.service_id);
      }
    },
    assertDestination(_service, destination) {
      if (publicationHandler === null || destination.handler !== publicationHandler ||
          publicationHandler.ownerIncarnation !== handlerIncarnation ||
          publicationHandler.replicaStateMachine !== lifecycleOwner ||
          publicationHandler.localServices !== localServices ||
          publicationHandler.localReplicas !== localReplicas ||
          destination.localServices !== localServices || destination.localReplicas !== localReplicas) {
        throw runtimePublicationRefused(incarnation.service_id);
      }
    },
  });
  const service = construct({...declared, runtimePublication});
  Object.defineProperty(service, 'fixtureRuntimeAdmission', {value: Object.freeze({revoke})});
  const shutdown = service.shutdown.bind(service);
  service.shutdown = async (...args) => {
    revoke();
    return shutdown(...args);
  };
  return service;
}

export {createPartitionServiceFixture};
