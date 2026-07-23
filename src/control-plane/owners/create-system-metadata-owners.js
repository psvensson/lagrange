import {ControlPlanePublicationsOwner} from './control-plane-publications-owner.js';
import {DeploymentBindingOwner} from './deployment-binding-owner.js';
import {LogsOwner} from './logs-owner.js';
import {MessageGroupsOwner} from './message-groups-owner.js';
import {NodeEndpointsOwner} from './node-endpoints-owner.js';
import {NodesOwner} from './nodes-owner.js';
import {PartitionsOwner} from './partitions-owner.js';
import {ReplicaOperationsOwner} from './replica-operations-owner.js';
import {RuntimeAccessPolicyOwner} from './runtime-access-policy-owner.js';
import {ServiceDefinitionsOwner} from './service-definitions-owner.js';
import {ServiceEndpointsOwner} from './service-endpoints-owner.js';
import {ServiceInstallCatalogOwner} from './service-install-catalog-owner.js';
import {ServicesOwner} from './services-owner.js';

function createOwnerOptions(options = {}) {
  return {
    controlPlaneSystemTableGateway:
      options.controlPlaneSystemTableGateway || null,
    systemTableCache: options.systemTableCache || null,
    now: options.now,
  };
}

function createSystemMetadataOwners(options = {}) {
  const ownerOptions = createOwnerOptions(options);
  const serviceInstallCatalogOwner = new ServiceInstallCatalogOwner(ownerOptions);
  const serviceDefinitionsOwner = new ServiceDefinitionsOwner({
    ...ownerOptions,
    catalogOwner: serviceInstallCatalogOwner,
  });
  const deploymentBindingOwner = new DeploymentBindingOwner({
    ...ownerOptions,
    catalogOwner: serviceInstallCatalogOwner,
  });
  return Object.freeze({
    controlPlanePublicationsOwner: new ControlPlanePublicationsOwner(ownerOptions),
    nodesOwner: new NodesOwner(ownerOptions),
    nodeEndpointsOwner: new NodeEndpointsOwner(ownerOptions),
    servicesOwner: new ServicesOwner(ownerOptions),
    partitionsOwner: new PartitionsOwner(ownerOptions),
    messageGroupsOwner: new MessageGroupsOwner(ownerOptions),
    replicaOperationsOwner: new ReplicaOperationsOwner(ownerOptions),
    logsOwner: new LogsOwner(ownerOptions),
    serviceEndpointsOwner: new ServiceEndpointsOwner(ownerOptions),
    serviceDefinitionsOwner,
    serviceInstallCatalogOwner,
    deploymentBindingOwner,
    runtimeAccessPolicyOwner: new RuntimeAccessPolicyOwner({
      ...ownerOptions,
      bindingOwner: deploymentBindingOwner,
    }),
  });
}

export {createSystemMetadataOwners};
