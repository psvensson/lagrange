/**
 * The comparative-benchmark deployment layer's one entry point: deploy the
 * real product arm of a campaign target on its hosts and hand back the
 * observed deployment (roles, storage, readiness, identity, endpoint bound to
 * its container), or a typed failure. Per-product owners do the work; this
 * module routes by target id and re-exports the layer's public surface.
 */
import {deployLagrangeCluster} from './real-product-deployer-lagrange.js';
import {
  POSTGRES_TARGET,
  deployPostgresCluster,
} from './real-product-deployer-postgres.js';
import {deployTiDbCluster} from './real-product-deployer-tidb.js';

const COMPARATIVE_TARGET = Object.freeze({
  LAGRANGE: 'lagrange',
  TIDB_TIKV: 'tidb-tikv',
  PG_SINGLE_PRIMARY: POSTGRES_TARGET.SINGLE,
  PG_SYNC_STANDBY_HA: POSTGRES_TARGET.SYNC_HA,
});

// Data hosts each target places replicas on (one failure domain each), apart
// from the load-generator host. Roles are recorded separately per deployment.
const TARGET_DATA_HOSTS = Object.freeze({
  [COMPARATIVE_TARGET.LAGRANGE]: 3,
  [COMPARATIVE_TARGET.TIDB_TIKV]: 3,
  [COMPARATIVE_TARGET.PG_SINGLE_PRIMARY]: 1,
  [COMPARATIVE_TARGET.PG_SYNC_STANDBY_HA]: 3,
});

/**
 * @param {string} targetId one of COMPARATIVE_TARGET
 * @param {Object} input the deployer input (hosts, clientIp, sshRun, opts,
 *   campaignId, sleep)
 * @return {Promise<Object>}
 */
function deployComparativeTarget(targetId, input) {
  const hosts = input.hosts.slice(0, TARGET_DATA_HOSTS[targetId]);
  if (targetId === COMPARATIVE_TARGET.LAGRANGE) return deployLagrangeCluster({...input, hosts});
  if (targetId === COMPARATIVE_TARGET.TIDB_TIKV) return deployTiDbCluster({...input, hosts});
  if (targetId === COMPARATIVE_TARGET.PG_SINGLE_PRIMARY ||
      targetId === COMPARATIVE_TARGET.PG_SYNC_STANDBY_HA) {
    return deployPostgresCluster({...input, targetId, hosts});
  }
  return Promise.reject(new Error(`unknown comparative target ${targetId}`));
}

export {
  LAGRANGE_IMAGE_DEFAULT,
  PD_IMAGE_DEFAULT,
  POSTGRES_IMAGE_DEFAULT,
  TIDB_IMAGE_DEFAULT,
  TIKV_IMAGE_DEFAULT,
} from './real-product-deployment-contract.js';
export {removeCampaignContainers} from './real-product-campaign-cleanup.js';
export {measureComponentRecovery} from './real-product-component-recovery.js';

export {
  applyNetworkImpairment,
} from './real-product-network-impairment.js';
export {
  COMPARATIVE_TARGET,
  TARGET_DATA_HOSTS,
  deployComparativeTarget,
  deployLagrangeCluster,
  deployPostgresCluster,
  deployTiDbCluster,
};
