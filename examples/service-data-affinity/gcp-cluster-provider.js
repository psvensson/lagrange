/**
 * GCP execution mode for the service-data-affinity demo.
 *
 * Provisions Compute Engine Docker hosts through the distributed harness's
 * GCPProvisioner, ships the baked cluster image to them, and starts the
 * five-node cluster through the same createCluster the distributed runner
 * uses (host-network, one node per VM). The demo's workload body is
 * unchanged: it keeps driving the seed admin WebSocket, which in host-network
 * mode is node 0's admin port (8081) on the seed host's external IP.
 *
 * Dedicated, freshly-provisioned VMs are quiet by construction, so the
 * event-loop-gap host-scheduling budget that the local machine keeps tripping
 * is not expected to fire; node logs are still harvested for the report.
 */

import {
  GCPProvisioner,
} from '../../test/distributed/harness/gcp-provisioner.js';
import {
  fullLogDestPath,
} from '../../test/distributed/harness/full-node-log-capture.js';
import {
  installGcpImage,
} from '../../test/distributed/gcp-run-orchestration.js';
import {
  mergeWithDefaults,
} from '../../test/distributed/harness/config-parser.js';
import {
  CLUSTER_FACTORY_LAYER,
} from '../../test/distributed/harness/cluster-factory-layer.js';
import {buildImage} from '../../test/distributed/build-image.js';
import {createReadStream, createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';

const {createCluster} = CLUSTER_FACTORY_LAYER;

// One node per VM. n2-standard-4: the certification bar is a 60-second
// formation window with a 3000ms event-loop gap ceiling, and e2-class
// (burstable, shared-core scheduling) hosts showed 2-4x run-to-run CPU
// variance that swung otherwise-identical code between 2687ms and 9573ms
// max gaps (archived runs 21-34-12/21-42-44/21-50-53); a fixed-performance
// class removes steal-time from the certification variable set.
const GCP_DEMO_CONFIG = Object.freeze({
  project: 'something-2e584',
  zone: 'us-central1-a',
  machineType: 'n2-standard-4',
  vmCount: 5,
  preemptible: false,
});
const DEMO_NODE_COUNT = 5;
const ADMIN_STREAM_PATH = '/api/admin/stream';
const SEED_ADMIN_PORT = 8081;
const GCP_DEMO_SCENARIO_NAME = 'movielens-service-data-affinity-demo';
const TEARDOWN_FAILURE_PREFIX =
  'gcp-cluster-provider: best-effort teardown failed (infra may leak): ';
const LINE_SEPARATOR = '\n';

async function materializeGcpFullNodeLogs(cluster, outputDir) {
  if (!outputDir) {
    return;
  }
  await Promise.all(cluster.getNodes().map(async (node, index) => {
    await pipeline(
      createReadStream(fullLogDestPath(
        outputDir,
        GCP_DEMO_SCENARIO_NAME,
        node.id,
      )),
      createGunzip(),
      createWriteStream(resolve(outputDir, `node-${index}.log`)),
    );
  }));
}

async function stopGcpAffinityCluster({cluster, provisioner, outputDir}) {
  let clusterStopError = null;
  let logMaterializationError = null;
  let provisionerDestroyError = null;
  try {
    await cluster.stop();
  } catch (error) {
    clusterStopError = error;
  }
  try {
    await materializeGcpFullNodeLogs(cluster, outputDir);
  } catch (error) {
    logMaterializationError = error;
  }
  try {
    await provisioner.destroy();
  } catch (error) {
    provisionerDestroyError = error;
  }
  if (clusterStopError) {
    throw clusterStopError;
  }
  if (logMaterializationError) {
    throw logMaterializationError;
  }
  if (provisionerDestroyError) {
    throw provisionerDestroyError;
  }
}

/**
 * Provision GCP hosts and start the demo cluster on them.
 * @param {Object} options
 * @param {boolean} [options.verbose]
 * @param {string} [options.outputDir]
 * @return {Promise<{cluster: Object, provisioner: Object, target: string,
 *   seedExternalIp: string, stop: Function}>}
 */
async function startGcpAffinityCluster({verbose = false, outputDir} = {}) {
  const provisioner = new GCPProvisioner(GCP_DEMO_CONFIG);
  let provisioned = false;
  let cluster = null;
  try {
    const {hosts, hostInfo, tls} = await provisioner.provision();
    provisioned = true;

    // Build (or reuse) the git-labelled image locally, then ship it to every
    // provisioned host so the remote daemons run the exact current bytes.
    const config = mergeWithDefaults({size: DEMO_NODE_COUNT});
    await buildImage(config, false);
    await installGcpImage(provisioner, config.image, verbose);

    cluster = createCluster({
      ...config,
      ...(outputDir ? {outputDir} : {}),
      docker: {...config.docker, hosts, hostInfo, tls},
    });
    if (typeof cluster.setScenarioName === 'function') {
      cluster.setScenarioName(GCP_DEMO_SCENARIO_NAME);
    }
    await cluster.start();

    const seed = cluster.getNodes()[0];
    const seedExternalIp = hostInfo[0]?.externalIp || seed.ip;
    const target = `ws://${seedExternalIp}:${SEED_ADMIN_PORT}${ADMIN_STREAM_PATH}`;
    return {
      cluster,
      provisioner,
      target,
      seedExternalIp,
      stop: () => stopGcpAffinityCluster({cluster, provisioner, outputDir}),
    };
  } catch (error) {
    // Never leak billable VMs on a partial failure.
    if (cluster && provisioned) {
      try {
        await stopGcpAffinityCluster({cluster, provisioner, outputDir});
      } catch (teardownError) {
        // The original provisioning/start error takes precedence; surface the
        // teardown failure rather than swallowing it silently.
        process.stderr.write(
          TEARDOWN_FAILURE_PREFIX +
          String(teardownError?.message || teardownError) + LINE_SEPARATOR,
        );
      }
    } else if (provisioned) {
      try {
        await provisioner.destroy();
      } catch (teardownError) {
        process.stderr.write(
          TEARDOWN_FAILURE_PREFIX +
          String(teardownError?.message || teardownError) + LINE_SEPARATOR,
        );
      }
    }
    throw error;
  }
}

export {
  startGcpAffinityCluster,
  stopGcpAffinityCluster,
  GCP_DEMO_CONFIG,
  GCP_DEMO_SCENARIO_NAME,
};
