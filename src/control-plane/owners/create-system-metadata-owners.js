import {LogsOwner} from './logs-owner.js';
import {MessageGroupsOwner} from './message-groups-owner.js';
import {NodesOwner} from './nodes-owner.js';
import {PartitionsOwner} from './partitions-owner.js';
import {ReplicaOperationsOwner} from './replica-operations-owner.js';
import {ServiceDefinitionsOwner} from './service-definitions-owner.js';
import {ServiceEndpointsOwner} from './service-endpoints-owner.js';
import {ServicesOwner} from './services-owner.js';

function createOwnerOptions(options = {}) {
  return {
    controlPlaneSystemTableGateway:
      options.controlPlaneSystemTableGateway || null,
    systemTableCache: options.systemTableCache || null,
  };
}

function createSystemMetadataOwners(options = {}) {
  const ownerOptions = createOwnerOptions(options);
  return Object.freeze({
    nodesOwner: new NodesOwner(ownerOptions),
    servicesOwner: new ServicesOwner(ownerOptions),
    partitionsOwner: new PartitionsOwner(ownerOptions),
    messageGroupsOwner: new MessageGroupsOwner(ownerOptions),
    replicaOperationsOwner: new ReplicaOperationsOwner(ownerOptions),
    logsOwner: new LogsOwner(ownerOptions),
    serviceEndpointsOwner: new ServiceEndpointsOwner(ownerOptions),
    serviceDefinitionsOwner: new ServiceDefinitionsOwner(ownerOptions),
  });
}

export {createSystemMetadataOwners};
