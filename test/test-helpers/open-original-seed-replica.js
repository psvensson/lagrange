import {originalSeedPeerAddresses} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {SERVICE_TYPE} from '../../src/constants/index.js';

// Caller supplies the shared fixture's already prepared, owned BootstrapService.
// This helper only drives its real catalog -> phase -> native opening path;
// it issues no allocation and substitutes no admission or opening authority.
async function openOriginalSeedReplica(service, declaration, replicaId) {
  const member = declaration.members.find((entry) => entry.replicaId === replicaId);
  const partition = member.serviceType === SERVICE_TYPE.PARTITION;
  const options = {serviceType: member.serviceType, replicaId: member.replicaId,
    ...(partition ? {partitionId: member.groupId, tableName: member.tableName} :
      {groupId: member.groupId}),
    dbPath: member.dbPath, replicaIds: member.replicaIds,
    peerAddresses: originalSeedPeerAddresses(
      declaration.nodeId, member.serviceType, member.replicaIds),
    deferElection: true, createDelayMs: 0};
  const infrastructure = service.seedInfrastructurePhase;
  const definition = infrastructure.createBootstrapServiceDescriptor(member.serviceType,
    member.replicaId);
  infrastructure.queueBootstrapServiceReplica(definition, options);
  if (partition) {
    await service.seedPartitionsPhase.createBootstrapPartitionReplica({definition});
  } else {
    await service.seedMessageGroupsPhase.createBootstrapMessageGroupReplica({definition});
  }
  return {member, replica: (partition ? service.partitionServices :
    service.messageGroupServices).get(member.replicaId)};
}

export {openOriginalSeedReplica};
