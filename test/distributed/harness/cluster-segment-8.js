import { DockerProvider } from './docker-provider.js';
import { CLUSTER_SEGMENT_7 } from './cluster-segment-7.js';
import {
  acquireReusableClusterLease,
  bestEffortCleanup,
  cleanupEntries,
  drainCleanupRegistry,
  handleExceptionCleanup,
  handleExitCleanup,
  handleSignalCleanup,
  isProcessAlive,
  isReusableClusterLeaseTimeoutError,
  readReusableClusterLease,
  registerClusterCleanup,
  registerProcessCleanupHandlers,
  tryRemoveReusableClusterLease,
} from './cluster-runtime-helpers.js';

const {
  CLUSTER_CONFIG_DOCKER_OPERATION_SINK,
  Cluster,
  distributeNodes,
} = CLUSTER_SEGMENT_7;

function createCluster(config) {
  let providers;
  let hostAssignment;
  const dockerOperationSink =
    typeof config?.[CLUSTER_CONFIG_DOCKER_OPERATION_SINK] === 'function'
      ? config[CLUSTER_CONFIG_DOCKER_OPERATION_SINK]
      : null;

  if (config.docker.hosts && config.docker.hosts.length > 0) {
    providers = config.docker.hosts.map(
      (host) =>
        new DockerProvider({
          host,
          operationSink: dockerOperationSink,
        }),
    );
    const nodesPerHost = config.nodesPerHost || config.size;
    hostAssignment = distributeNodes(config.size, providers, nodesPerHost);
  } else {
    providers = [
      new DockerProvider({
        socketPath: config.docker.socketPath,
        operationSink: dockerOperationSink,
      }),
    ];
    hostAssignment = new Array(config.size).fill(0);
  }

  const cluster = new Cluster(config, providers, hostAssignment);
  registerProcessCleanupHandlers();
  return cluster;
}

export const CLUSTER_SEGMENT_8 = {
  ...CLUSTER_SEGMENT_7,
  acquireReusableClusterLease,
  bestEffortCleanup,
  cleanupEntries,
  createCluster,
  drainCleanupRegistry,
  handleExceptionCleanup,
  handleExitCleanup,
  handleSignalCleanup,
  isProcessAlive,
  isReusableClusterLeaseTimeoutError,
  readReusableClusterLease,
  registerClusterCleanup,
  registerProcessCleanupHandlers,
  tryRemoveReusableClusterLease,
};
